// The school ledger itself (PRD E23): accounts, months that lock, journals that balance and cannot be changed once posted.
const mongoose = require('../../lib/pgdoc');
const db = require('../../lib/pgdoc/db');
const W = require('../../lib/pgdoc/where');
const { q } = require('../../lib/pgdoc/model');
const S = require('./service');
const E = require('./engine');
const AcAccount = require('../../models/AcAccount'); const AcPeriod = require('../../models/AcPeriod'); const AcJournal = require('../../models/AcJournal'); const AcLine = require('../../models/AcLine');
const AcFund = require('../../models/AcFund'); const AcBudget = require('../../models/AcBudget');

const { Fail } = S;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymName = (ym) => `${MONTH_NAMES[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
const plain = (d) => (d && d.toObject ? d.toObject() : d);

/* ───────── accounts and months ───────── */
async function accountsOf(schoolId) {
  const list = await AcAccount.find({ schoolId: S.oid(schoolId) }).sort({ code: 1 }).lean();
  return new Map(list.map((a) => [a.code, a]));
}
async function ensurePeriod(schoolId, ym) {
  const sid = S.oid(schoolId); const found = await AcPeriod.findOne({ schoolId: sid, ym });
  if (found) return found;
  try { return await AcPeriod.create({ schoolId: sid, ym }); } catch (e) { if (S.isDup(e)) return AcPeriod.findOne({ schoolId: sid, ym }); throw e; }
}
// A date that can be posted to: the date itself when its month is open, otherwise the first day of the next open month.
async function openDateFrom(schoolId, date) {
  let ym = E.ymOf(date);
  for (let i = 0; i < 60; i += 1) {
    const p = await AcPeriod.findOne({ schoolId: S.oid(schoolId), ym });
    if (!p || p.status === 'open') return { date: ym === E.ymOf(date) ? date : `${ym}-01`, ym, shifted: ym !== E.ymOf(date) };
    ym = E.addMonths(ym, 1);
  }
  throw new Fail(423, 'There is no open month to post into.');
}

/* ───────── sums over posted lines (one SQL pass) ───────── */
// opts: { from, to (dates), fromYm, toYm, codes, kind, fundId, group: ['code','fundId','ym','kind','campusId'] }
async function sums(schoolId, opts = {}) {
  const t = q(AcLine.table); const p = [String(schoolId)]; const where = [`${W.E('schoolId')} = to_jsonb($1::text)`];
  const add = (expr, op, v) => { p.push(v); where.push(`${expr} ${op} to_jsonb($${p.length}::text)`); };
  if (opts.from) add(W.E('date'), '>=', opts.from); if (opts.to) add(W.E('date'), '<=', opts.to);
  if (opts.fromYm) add(W.E('ym'), '>=', opts.fromYm); if (opts.toYm) add(W.E('ym'), '<=', opts.toYm);
  if (opts.kind) add(W.E('kind'), '=', opts.kind);
  if (opts.fundId === '') where.push(`(${W.T('fundId')} IS NULL OR ${W.T('fundId')} = '')`);
  else if (opts.fundId) add(W.E('fundId'), '=', opts.fundId);
  if (opts.codes && opts.codes.length) { p.push(opts.codes.map(String)); where.push(`${W.T('code')} = ANY($${p.length}::text[])`); }
  if (opts.campusId) add(W.E('campusId'), '=', opts.campusId);
  const group = (opts.group || []).filter((g) => ['code', 'fundId', 'ym', 'kind', 'campusId'].includes(g));
  const cols = group.map((g) => `COALESCE(${W.T(g)}, '') AS "${g}"`);
  const sql = `SELECT ${cols.concat([`COALESCE(SUM((${W.T('debit')})::bigint), 0)::float8 AS debit`, `COALESCE(SUM((${W.T('credit')})::bigint), 0)::float8 AS credit`, 'COUNT(*)::int AS n']).join(', ')} FROM ${t} WHERE ${where.join(' AND ')}${group.length ? ` GROUP BY ${group.map((_, i) => i + 1).join(', ')}` : ''}`;
  const { rows } = await db.get().query(sql, p);
  return rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit) }));
}
// What a fund has paid for so far (expense and fixed-asset lines named with it).
async function fundSpent(schoolId, fundId, cfg, upTo = '') {
  const rows = await sums(schoolId, { fundId: String(fundId), to: upTo || undefined, group: ['code', 'kind'] });
  return rows.filter((r) => r.kind === 'expense' || r.code === cfg.map.fixedAssets).reduce((s, r) => s + r.debit - r.credit, 0);
}
async function fundReceived(schoolId, fundId) {
  const rows = await sums(schoolId, { fundId: String(fundId), kind: 'income' });
  return rows.reduce((s, r) => s + r.credit - r.debit, 0);
}

/* ───────── checks before a journal posts ───────── */
// Grant rules and the approved budget, worked out for a set of lines. Nothing is written.
async function reviewLines(schoolId, cfg, accounts, lines, date) {
  const funds = new Map(); const problems = []; const warnings = []; const blocks = [];
  const need = [...new Set(lines.filter((l) => l.fundId).map((l) => l.fundId))];
  for (const id of need) { let f = null; try { f = await AcFund.findOne({ _id: id, schoolId: S.oid(schoolId) }); } catch (e) { f = null; } funds.set(id, f); }
  const running = {};
  for (const l of lines) {
    if (!l.fundId) continue; const f = funds.get(l.fundId); const a = accounts.get(l.code);
    if (running[l.fundId] === undefined) running[l.fundId] = f ? await fundSpent(schoolId, l.fundId, cfg) : 0;
    const why = E.fundReasons(f && plain(f), a, l, date, running[l.fundId], cfg);
    if (why.length) problems.push(...why.map((w) => ({ code: l.code, fundId: l.fundId, text: w })));
    else if (a.kind === 'expense' || E.isCapex(a, cfg)) running[l.fundId] += l.debit - l.credit;
  }
  if (cfg.budgetControl !== 'off') {
    const fy = E.fyOf(E.ymOf(date), cfg.fiscalStartMonth); const bud = await AcBudget.findOne({ schoolId: S.oid(schoolId), fy, status: 'approved' });
    if (bud) {
      const net = {}; lines.forEach((l) => { const a = accounts.get(l.code); if (a && a.kind === 'expense') net[l.code] = (net[l.code] || 0) + l.debit - l.credit; });
      const range = E.fyRange(fy, cfg.fiscalStartMonth);
      for (const [code, add] of Object.entries(net)) {
        if (add <= 0) continue; const bl = (bud.lines || []).find((x) => x.code === code); if (!bl) continue;
        const rows = await sums(schoolId, { fromYm: range.from, toYm: E.ymOf(date), codes: [code] }); const used = rows.reduce((s, r) => s + r.debit - r.credit, 0);
        if (used + add > bl.total) { const msg = `${code} ${accounts.get(code).name}: ${(used + add).toLocaleString('en-US')} would be spent against a budget of ${bl.total.toLocaleString('en-US')} for ${fy}.`; (cfg.budgetControl === 'block' ? blocks : warnings).push(msg); }
      }
    }
  }
  return { problems, warnings, blocks };
}

/* ───────── drafting, submitting, deciding ───────── */
function buildLines(raw, accounts, cfg) {
  const r = E.checkLines(raw, accounts, cfg);
  if (r.error) throw new Fail(422, r.error, { at: r.at || null, difference: r.difference });
  return r;
}
async function createDraft(ctx, b, type = 'manual') {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const accounts = await accountsOf(ctx.schoolId);
  const date = S.day(b.date, 'the journal date'); const r = buildLines(b.lines, accounts, cfg);
  if (cfg.startDate && date < cfg.startDate && type !== 'opening') throw new Fail(422, `The ledger starts on ${cfg.startDate}. Earlier figures go in as an opening balance journal.`);
  const j = await S.numbered(AcJournal, ctx.schoolId, 'number', 'JE', {
    date, ym: E.ymOf(date), type, status: 'draft', memo: S.text(b.memo, 'The description', { min: 3, max: 300 }), reference: S.text(b.reference, 'The reference', { max: 80 }),
    lines: r.lines, totalDebit: r.totalDebit, totalCredit: r.totalCredit, preparedById: ctx.actor.id, preparedByName: ctx.actor.name || '', trail: [S.trail(ctx.actor, 'drafted')],
  });
  return j;
}
async function mustJournal(ctx, id) {
  let j = null; try { j = await AcJournal.findOne({ _id: id, schoolId: S.oid(ctx.schoolId) }); } catch (e) { j = null; }
  if (!j) throw new Fail(404, 'That journal was not found.'); return j;
}
async function updateDraft(ctx, id, b) {
  const j = await mustJournal(ctx, id);
  if (!['draft', 'rejected'].includes(j.status)) throw new Fail(409, 'Only a draft or a returned journal can be changed.');
  if (String(j.preparedById) !== String(ctx.actor.id)) throw new Fail(403, 'Only the person who drafted a journal can change it.');
  if (j.type === 'reversal') throw new Fail(409, 'A reversal copies the original and cannot be edited. Reject it and start again.');
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const accounts = await accountsOf(ctx.schoolId);
  const date = b.date ? S.day(b.date, 'the journal date') : j.date; const r = buildLines(b.lines || j.lines, accounts, cfg);
  if (cfg.startDate && date < cfg.startDate && j.type !== 'opening') throw new Fail(422, `The ledger starts on ${cfg.startDate}.`);
  const upd = await AcJournal.updateOne({ _id: j._id, status: { $in: ['draft', 'rejected'] } }, {
    $set: { date, ym: E.ymOf(date), memo: b.memo !== undefined ? S.text(b.memo, 'The description', { min: 3, max: 300 }) : j.memo, reference: b.reference !== undefined ? S.text(b.reference, 'The reference', { max: 80 }) : j.reference, lines: r.lines, totalDebit: r.totalDebit, totalCredit: r.totalCredit, status: 'draft' },
    $push: { trail: S.trail(ctx.actor, 'edited') },
  });
  if (!upd.matchedCount) throw new Fail(409, 'That journal has just changed.');
  return AcJournal.findOne({ _id: j._id });
}
async function deleteDraft(ctx, id) {
  const j = await mustJournal(ctx, id);
  if (j.status !== 'draft' && j.status !== 'rejected') throw new Fail(409, 'Only a draft can be deleted. A posted journal is reversed, never deleted.');
  if (String(j.preparedById) !== String(ctx.actor.id) && ctx.role !== 'admin') throw new Fail(403, 'Only the person who drafted a journal can delete it.');
  await AcJournal.deleteOne({ _id: j._id, status: { $in: ['draft', 'rejected'] } }); return { ok: true };
}
async function submit(ctx, id) {
  const j = await mustJournal(ctx, id);
  if (!['draft', 'rejected'].includes(j.status)) throw new Fail(409, 'That journal has already been sent.');
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const accounts = await accountsOf(ctx.schoolId);
  const r = buildLines(j.lines, accounts, cfg); const per = await ensurePeriod(ctx.schoolId, j.ym);
  if (per.status !== 'open') throw new Fail(423, `${ymName(j.ym)} is ${per.status === 'closed' ? 'closed' : 'being closed'}. Date the journal in an open month.`, { reason: 'period_locked' });
  const rev = await reviewLines(ctx.schoolId, cfg, accounts, r.lines, j.date);
  if (rev.problems.length) throw new Fail(422, `This journal breaks a fund rule: ${rev.problems[0].text}`, { reason: 'fund_rule', problems: rev.problems });
  if (rev.blocks.length) throw new Fail(422, `This journal is over budget: ${rev.blocks[0]}`, { reason: 'over_budget', blocks: rev.blocks });
  const upd = await AcJournal.updateOne({ _id: j._id, status: { $in: ['draft', 'rejected'] } }, { $set: { status: 'submitted', submittedAt: new Date(), warnings: rev.warnings, decisionNote: '' }, $push: { trail: S.trail(ctx.actor, 'submitted') } });
  if (!upd.matchedCount) throw new Fail(409, 'That journal has just changed.');
  await S.tellAdmins(ctx.schoolId, 'Journal waiting for approval', `${j.number}: ${j.memo} (${S.money(j.totalDebit)})`, '/admin#/accounts', ctx.actor.id);
  return AcJournal.findOne({ _id: j._id });
}

// Write the lines of a journal and mark it posted. Safe to run again after an interruption: lines already written are kept.
async function writeLines(j) {
  const accounts = new Map(); (await AcAccount.find({ schoolId: j.schoolId }).lean()).forEach((a) => accounts.set(a.code, a));
  const rows = j.lines.map((l, i) => ({
    schoolId: j.schoolId, journalId: j._id, journalNo: j.number, seq: i + 1, date: j.date, ym: j.ym, code: l.code, kind: accounts.get(l.code).kind, debit: l.debit, credit: l.credit,
    memo: l.memo || '', ...(l.fundId ? { fundId: l.fundId } : {}), ...(l.campusId ? { campusId: l.campusId } : {}), ...(l.costCentre ? { costCentre: l.costCentre } : {}), sourceType: j.sourceType || '',
  }));
  try { await AcLine.insertMany(rows, { ordered: false }); } catch (e) { if (!(S.isDup(e) || (e.writeErrors && e.writeErrors.every((w) => w.code === 11000)) || /duplicate|unique/i.test(e.message || ''))) throw e; }
  const have = await AcLine.countDocuments({ schoolId: j.schoolId, journalId: j._id });
  if (have !== rows.length) throw new Error(`Journal ${j.number}: ${have} of ${rows.length} lines written`);
  const upd = await AcJournal.updateOne({ _id: j._id, status: 'posting' }, { $set: { status: 'posted', postedAt: new Date(), hash: E.journalHash(j.number, j.date, j.lines) } });
  if (j.reversalOf) await AcJournal.updateOne({ _id: j.reversalOf, reversedBy: null }, { $set: { reversedBy: j._id } });
  return upd.matchedCount > 0;
}

// Post a journal. system = made by a feed from a source record: no approver, rule breaks are flagged and not refused.
async function post(ctx, j, { system = false, sole = false } = {}) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const accounts = await accountsOf(ctx.schoolId);
  const r = buildLines(j.lines, accounts, cfg); const per = await ensurePeriod(ctx.schoolId, j.ym);
  if (per.status !== 'open') throw new Fail(423, `${ymName(j.ym)} is ${per.status === 'closed' ? 'closed' : 'being closed'}: nothing more can be posted to it.`, { reason: 'period_locked' });
  const rev = await reviewLines(ctx.schoolId, cfg, accounts, r.lines, j.date); const flags = [];
  if (!system) {
    if (rev.problems.length) throw new Fail(422, `This journal breaks a fund rule: ${rev.problems[0].text}`, { reason: 'fund_rule', problems: rev.problems });
    if (rev.blocks.length) throw new Fail(422, `This journal is over budget: ${rev.blocks[0]}`, { reason: 'over_budget', blocks: rev.blocks });
  } else { rev.problems.forEach((p) => flags.push({ kind: 'fund', text: p.text })); rev.blocks.concat(rev.warnings).forEach((w) => flags.push({ kind: 'budget', text: w })); }
  const from = system ? ['draft'] : ['submitted'];
  const claim = await AcJournal.updateOne({ _id: j._id, schoolId: j.schoolId, status: { $in: from } }, {
    $set: { status: 'posting', decidedById: ctx.actor.id || null, decidedByName: ctx.actor.name || (system ? 'Automatic posting' : ''), decidedAt: new Date(), sole, warnings: rev.warnings, flags },
    $push: { trail: S.trail(ctx.actor, system ? 'posted (automatic)' : 'approved and posted', sole ? 'sole administrator' : '') },
  });
  if (!claim.matchedCount) throw new Fail(409, 'That journal has just been posted or changed.');
  const fresh = await AcJournal.findOne({ _id: j._id }); await writeLines(fresh); return AcJournal.findOne({ _id: j._id });
}
async function decide(ctx, id, b) {
  const j = await mustJournal(ctx, id);
  if (j.status !== 'submitted') throw new Fail(409, 'That journal is not waiting for a decision.');
  const sole = await S.separate(ctx, j.preparedById, 'A journal');
  if (!b.approve) {
    const note = S.text(b.note, 'The reason', { min: 5 });
    const upd = await AcJournal.updateOne({ _id: j._id, status: 'submitted' }, { $set: { status: 'rejected', decidedById: ctx.actor.id, decidedByName: ctx.actor.name || '', decidedAt: new Date(), decisionNote: note, sole }, ...(j.reversalOf ? { $unset: { reversalOf: 1 } } : {}), $push: { trail: S.trail(ctx.actor, 'returned', note) } });
    if (!upd.matchedCount) throw new Fail(409, 'That journal has just changed.');
    return AcJournal.findOne({ _id: j._id });
  }
  return post(ctx, j, { sole });
}

/* ───────── reversal ───────── */
async function reverse(ctx, id, b) {
  const j = await mustJournal(ctx, id);
  if (j.status !== 'posted') throw new Fail(409, 'Only a posted journal can be reversed.');
  if (j.type === 'system') throw new Fail(409, 'This entry was made automatically from a record in another part of the school. Correct it at the source (the invoice, payment, pay run or bill) and the ledger follows.');
  if (j.type === 'reversal') throw new Fail(409, 'A reversal cannot be reversed. Enter a new journal instead.');
  if (j.reversedBy) throw new Fail(409, 'That journal has already been reversed.');
  const date = S.day(b.date || await S.today(ctx.schoolId), 'the reversal date'); const reason = S.text(b.reason, 'The reason', { min: 5 });
  if (date < j.date) throw new Fail(422, 'A reversal cannot be dated before the journal it reverses.');
  const per = await ensurePeriod(ctx.schoolId, E.ymOf(date));
  if (per.status !== 'open') throw new Fail(423, `${ymName(per.ym)} is closed. Date the reversal in an open month.`, { reason: 'period_locked' });
  try {
    return await S.numbered(AcJournal, ctx.schoolId, 'number', 'JE', {
      date, ym: E.ymOf(date), type: 'reversal', status: 'submitted', memo: `Reverses ${j.number}: ${reason}`.slice(0, 300), reference: j.number, reversalOf: j._id, reversalReason: reason,
      lines: j.lines.map((l) => ({ code: l.code, debit: l.credit, credit: l.debit, memo: l.memo || '', fundId: l.fundId || '', campusId: l.campusId || '', costCentre: l.costCentre || '' })),
      totalDebit: j.totalCredit, totalCredit: j.totalDebit, submittedAt: new Date(), preparedById: ctx.actor.id, preparedByName: ctx.actor.name || '', trail: [S.trail(ctx.actor, 'reversal requested', reason)],
    });
  } catch (e) { if (S.isDup(e)) throw new Fail(409, 'A reversal of that journal is already waiting for a decision.'); throw e; }
}

/* ───────── interrupted postings, and the books checking themselves ───────── */
async function finishStuck(schoolId) {
  const old = new Date(Date.now() - 2 * 60 * 1000); let fixed = 0;
  const stuck = await AcJournal.find({ schoolId: S.oid(schoolId), status: 'posting', updatedAt: { $lt: old } }).limit(50);
  for (const j of stuck) { try { if (await writeLines(j)) fixed += 1; } catch (e) { console.error('accounts finishStuck:', e.message); } }
  return fixed;
}
// Debits equal credits overall and per journal; every posted journal has all its lines; each line still matches its journal's fingerprint.
async function check(schoolId) {
  const sid = String(schoolId); const t = sums; const total = (await t(sid, {})).reduce((a, r) => ({ debit: a.debit + r.debit, credit: a.credit + r.credit, n: a.n + r.n }), { debit: 0, credit: 0, n: 0 });
  const problems = [];
  const { rows: bad } = await db.get().query(
    `SELECT ${W.T('journalNo')} AS no, SUM((${W.T('debit')})::bigint)::float8 AS d, SUM((${W.T('credit')})::bigint)::float8 AS c FROM ${q(AcLine.table)} WHERE ${W.E('schoolId')} = to_jsonb($1::text) GROUP BY ${W.T('journalId')}, ${W.T('journalNo')} HAVING SUM((${W.T('debit')})::bigint) <> SUM((${W.T('credit')})::bigint) LIMIT 20`, [sid]);
  bad.forEach((r) => problems.push({ kind: 'unbalanced', text: `${r.no} has debits ${r.d} and credits ${r.c}.` }));
  const posted = await AcJournal.find({ schoolId: S.oid(schoolId), status: 'posted' }).select('number date lines hash').lean();
  const lines = await AcLine.find({ schoolId: S.oid(schoolId) }).select('journalId seq code debit credit fundId campusId').lean(); const by = new Map();
  lines.forEach((l) => { const k = String(l.journalId); if (!by.has(k)) by.set(k, []); by.get(k).push(l); });
  for (const j of posted) {
    const ls = (by.get(String(j._id)) || []).sort((a, b) => a.seq - b.seq);
    if (ls.length !== j.lines.length) { problems.push({ kind: 'missing_lines', text: `${j.number} has ${ls.length} of ${j.lines.length} lines.` }); continue; }
    const h = E.journalHash(j.number, j.date, ls.map((l) => ({ code: l.code, debit: l.debit, credit: l.credit, fundId: l.fundId || '', campusId: l.campusId || '' })));
    if (h !== j.hash) problems.push({ kind: 'changed', text: `${j.number} no longer matches the fingerprint taken when it was posted.` });
  }
  return { balanced: total.debit === total.credit && !problems.some((p) => p.kind === 'unbalanced'), debit: total.debit, credit: total.credit, lines: total.n, journals: posted.length, problems, ok: total.debit === total.credit && !problems.length };
}

module.exports = { MONTH_NAMES, ymName, plain, accountsOf, ensurePeriod, openDateFrom, sums, fundSpent, fundReceived, reviewLines, createDraft, updateDraft, deleteDraft, submit, decide, post, reverse, finishStuck, check, mustJournal, buildLines };
