// Chart of accounts, funds, budgets, bank reconciliations, month close and setup (PRD E23).
const S = require('./service');
const E = require('./engine');
const L = require('./ledger');
const ST = require('./statements');
const AcAccount = require('../../models/AcAccount'); const AcFund = require('../../models/AcFund'); const AcBudget = require('../../models/AcBudget'); const AcRecon = require('../../models/AcRecon');
const AcPeriod = require('../../models/AcPeriod'); const AcJournal = require('../../models/AcJournal'); const AcLine = require('../../models/AcLine');

const { Fail } = S;
const CODE = /^[0-9A-Za-z][0-9A-Za-z.-]{1,11}$/;
const hist = (actor, action, note = '') => ({ at: new Date(), byId: actor?.id || null, byName: actor?.name || '', action, note: String(note || '').slice(0, 300) });

/* ───────── setup and settings ───────── */
async function setup(ctx, b) {
  const cur = await S.getCfg(ctx.schoolId); if (cur.ready) throw new Fail(409, 'The ledger is already set up.');
  const startDate = S.day(b.startDate, 'the day the ledger starts'); const m = b.fiscalStartMonth === undefined ? 7 : Number(b.fiscalStartMonth);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Fail(422, 'The fiscal year must start in a month from 1 to 12.');
  const sid = S.oid(ctx.schoolId);
  const rows = E.CHART.map(([code, name, kind, group, flags]) => ({ schoolId: sid, code, name, kind, group, active: true, bank: !!flags.bank, cash: !!flags.cash, system: true, createdByName: ctx.actor.name || '' }));
  const have = await AcAccount.countDocuments({ schoolId: sid });
  if (!have) { try { await AcAccount.insertMany(rows, { ordered: false }); } catch (e) { if (!S.isDup(e) && !/duplicate|unique/i.test(e.message || '')) throw e; } }
  const settings = E.merge({ startDate, fiscalStartMonth: m });
  await S.putCfg(ctx.schoolId, { history: [{ version: 1, reason: 'Ledger set up', at: new Date(), byName: ctx.actor.name || '', byId: ctx.actor.id || null, settings }] });
  await L.ensurePeriod(ctx.schoolId, E.ymOf(startDate));
  return { ok: true, startDate, fiscalStartMonth: m };
}
async function saveSettings(ctx, b) {
  const cur = await S.getCfg(ctx.schoolId); if (!cur.ready) throw new Fail(409, 'Set up the ledger first.');
  const reason = S.text(b.reason, 'The reason for the change', { min: 5 }); const accounts = await L.accountsOf(ctx.schoolId);
  const r = E.checkSettings(b.settings || {}, accounts); if (r.error) throw new Fail(422, r.error);
  if (r.value.startDate !== undefined && r.value.startDate !== cur.settings.startDate && (await AcLine.countDocuments({ schoolId: S.oid(ctx.schoolId) }))) throw new Fail(409, 'The start date cannot change once anything has been posted.');
  if (r.value.fiscalStartMonth !== undefined && r.value.fiscalStartMonth !== cur.settings.fiscalStartMonth && (await AcBudget.countDocuments({ schoolId: S.oid(ctx.schoolId) }))) throw new Fail(409, 'The fiscal year cannot move once a budget exists.');
  const next = E.merge({ ...cur.settings, ...r.value, map: { ...cur.settings.map, ...(r.value.map || {}) }, categoryMap: r.value.categoryMap || cur.settings.categoryMap });
  const history = [...cur.history, { version: cur.version + 1, reason, at: new Date(), byName: ctx.actor.name || '', byId: ctx.actor.id || null, settings: next }];
  await S.putCfg(ctx.schoolId, { history }); return { ok: true, version: cur.version + 1 };
}

/* ───────── chart of accounts ───────── */
async function listAccounts(schoolId) {
  const accounts = await L.accountsOf(schoolId); const today = await S.today(schoolId); const rows = await L.sums(schoolId, { to: today, group: ['code'] }); const by = new Map(rows.map((r) => [r.code, r]));
  const cfg = (await S.getCfg(schoolId)).settings; const mapped = new Set([...Object.values(cfg.map), ...Object.values(cfg.categoryMap)]);
  return [...accounts.values()].map((a) => { const r = by.get(a.code); return { id: String(a._id), code: a.code, name: a.name, kind: a.kind, group: a.group, active: a.active, bank: !!a.bank, cash: !!a.cash, system: !!a.system, note: a.note || '', debit: r ? r.debit : 0, credit: r ? r.credit : 0, balance: r ? E.signed(a.kind, r.debit, r.credit) : 0, used: !!r, mapped: mapped.has(a.code) }; });
}
async function createAccount(ctx, b) {
  const code = String(b.code || '').trim(); if (!CODE.test(code)) throw new Fail(422, 'Give the code as 2 to 12 letters, numbers, dots or dashes.');
  if (!E.KINDS.includes(b.kind)) throw new Fail(422, 'Choose assets, liabilities, net assets, income or expenses.');
  const name = S.text(b.name, 'The account name', { min: 2, max: 100 });
  try { return await AcAccount.create({ schoolId: S.oid(ctx.schoolId), code, name, kind: b.kind, group: S.text(b.group, 'The group', { max: 60 }), bank: b.kind === 'asset' && !!b.bank, cash: b.kind === 'asset' && (!!b.cash || !!b.bank), note: S.text(b.note, 'The note', { max: 200 }), createdByName: ctx.actor.name || '' }); }
  catch (e) { if (S.isDup(e)) throw new Fail(409, `Account ${code} already exists.`); throw e; }
}
async function updateAccount(ctx, id, b) {
  let a = null; try { a = await AcAccount.findOne({ _id: id, schoolId: S.oid(ctx.schoolId) }); } catch (e) { a = null; }
  if (!a) throw new Fail(404, 'That account was not found.');
  const set = {};
  if (b.name !== undefined) set.name = S.text(b.name, 'The account name', { min: 2, max: 100 });
  if (b.group !== undefined) set.group = S.text(b.group, 'The group', { max: 60 });
  if (b.note !== undefined) set.note = S.text(b.note, 'The note', { max: 200 });
  if (a.kind === 'asset') { if (b.bank !== undefined) { set.bank = !!b.bank; if (b.bank) set.cash = true; } if (b.cash !== undefined && !(set.bank)) set.cash = !!b.cash || !!a.bank; }
  if (b.active !== undefined && !!b.active !== a.active) {
    if (!b.active) {
      const cfg = (await S.getCfg(ctx.schoolId)).settings; if ([...Object.values(cfg.map), ...Object.values(cfg.categoryMap)].includes(a.code)) throw new Fail(409, 'An automatic posting uses this account. Choose another one under Settings first.');
      const rows = await L.sums(ctx.schoolId, { codes: [a.code], group: ['code'] }); const bal = rows.reduce((s, r) => s + r.debit - r.credit, 0);
      if (bal !== 0) throw new Fail(409, 'This account still has a balance. Move it with a journal first.');
    }
    set.active = !!b.active;
  }
  if (!Object.keys(set).length) return a;
  await AcAccount.updateOne({ _id: a._id }, { $set: set }); return AcAccount.findOne({ _id: a._id });
}

/* ───────── funds and grants ───────── */
const fundShape = async (ctx, b, cur = null) => {
  const accounts = await L.accountsOf(ctx.schoolId); const cfg = (await S.getCfg(ctx.schoolId)).settings; const out = {};
  if (b.name !== undefined || !cur) out.name = S.text(b.name, 'The fund name', { min: 2, max: 120 });
  if (!cur || b.kind !== undefined) { if (!['unrestricted', 'restricted', 'grant'].includes(b.kind || (cur && cur.kind))) throw new Fail(422, 'A fund is unrestricted, restricted or a grant.'); out.kind = b.kind || cur.kind; }
  for (const k of ['donor', 'reference', 'purpose']) if (b[k] !== undefined) out[k] = S.text(b[k], k, { max: 300 });
  if (b.allowedCodes !== undefined) {
    const list = [...new Set((b.allowedCodes || []).map(String))];
    for (const c of list) { const a = accounts.get(c); if (!a || !(a.kind === 'expense' || E.isCapex(a, cfg))) throw new Fail(422, `${c} is not an expense or fixed-asset account.`); }
    out.allowedCodes = list;
  }
  if (b.validFrom !== undefined) out.validFrom = b.validFrom ? S.day(b.validFrom, 'the start date') : '';
  if (b.validTo !== undefined) out.validTo = b.validTo ? S.day(b.validTo, 'the end date') : '';
  const from = out.validFrom !== undefined ? out.validFrom : cur?.validFrom; const to = out.validTo !== undefined ? out.validTo : cur?.validTo;
  if (from && to && to < from) throw new Fail(422, 'A fund cannot end before it starts.');
  if (b.ceiling !== undefined) out.ceiling = S.num(b.ceiling, 'The award amount', { min: 0 });
  const kind = out.kind || cur?.kind;
  if (kind !== 'unrestricted' && !(b.allowedCodes !== undefined ? out.allowedCodes : cur?.allowedCodes || []).length && kind === 'restricted') throw new Fail(422, 'A restricted fund must name the accounts it may be spent on.');
  return out;
};
async function createFund(ctx, b) {
  const v = await fundShape(ctx, b);
  try { return await AcFund.create({ schoolId: S.oid(ctx.schoolId), ...v, createdByName: ctx.actor.name || '', history: [hist(ctx.actor, 'created')] }); }
  catch (e) { if (S.isDup(e)) throw new Fail(409, 'A fund with that name already exists.'); throw e; }
}
async function mustFund(ctx, id) { let f = null; try { f = await AcFund.findOne({ _id: id, schoolId: S.oid(ctx.schoolId) }); } catch (e) { f = null; } if (!f) throw new Fail(404, 'That fund was not found.'); return f; }
async function updateFund(ctx, id, b) {
  const f = await mustFund(ctx, id); const reason = S.text(b.reason, 'The reason for the change', { min: 5 }); const v = await fundShape(ctx, b, f);
  if (v.name && v.name !== f.name) { /* renaming is fine: lines carry the fund id */ }
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const accounts = await L.accountsOf(ctx.schoolId);
  // A new rule may not make money already spent ineligible: the grant's own history must stay clean.
  if (v.allowedCodes && v.allowedCodes.length) {
    const spent = await L.sums(ctx.schoolId, { fundId: String(f._id), group: ['code', 'kind'] }); const bad = spent.filter((r) => (r.kind === 'expense' || r.code === cfg.map.fixedAssets) && r.debit - r.credit !== 0 && !v.allowedCodes.includes(r.code));
    if (bad.length) throw new Fail(409, `${bad[0].code} ${accounts.get(bad[0].code)?.name || ''} has already been charged to this fund, so it must stay on the list.`);
  }
  if (v.ceiling !== undefined && v.ceiling > 0) { const spent = await L.fundSpent(ctx.schoolId, f._id, cfg); if (spent > v.ceiling) throw new Fail(409, `${spent.toLocaleString('en-US')} has already been spent, which is more than ${v.ceiling.toLocaleString('en-US')}.`); }
  await AcFund.updateOne({ _id: f._id }, { $set: v, $push: { history: hist(ctx.actor, 'changed', `${reason}: ${Object.keys(v).join(', ')}`) } }); return AcFund.findOne({ _id: f._id });
}
async function setFundStatus(ctx, id, status, reason) {
  const f = await mustFund(ctx, id); const why = S.text(reason, 'The reason', { min: 5 });
  if (f.status === status) throw new Fail(409, `That fund is already ${status}.`);
  const upd = await AcFund.updateOne({ _id: f._id, status: f.status }, { $set: { status, closeReason: status === 'closed' ? why : '' }, $push: { history: hist(ctx.actor, status === 'closed' ? 'closed' : 'reopened', why) } });
  if (!upd.matchedCount) throw new Fail(409, 'That fund has just changed.'); return AcFund.findOne({ _id: f._id });
}

/* ───────── budgets ───────── */
async function budgetLines(ctx, raw, cfg) {
  const accounts = await L.accountsOf(ctx.schoolId); const seen = new Set(); const out = [];
  for (const l of Array.isArray(raw) ? raw : []) {
    const code = String(l.code || '').trim(); const a = accounts.get(code);
    if (!a || !a.active || !(a.kind === 'income' || a.kind === 'expense')) throw new Fail(422, `${code || '(none)'} is not an active income or expense account.`);
    if (seen.has(code)) throw new Fail(422, `${code} appears twice.`); seen.add(code);
    let months;
    if (Array.isArray(l.months)) { if (l.months.length !== 12) throw new Fail(422, `${code}: give 12 monthly amounts.`); months = l.months.map((m) => S.num(m, `${code} monthly amount`, { min: 0 })); }
    else { const t = S.num(l.annual, `${code} yearly amount`, { min: 0 }); const each = Math.floor(t / 12); months = new Array(12).fill(each); months[11] += t - each * 12; }
    out.push({ code, months, total: months.reduce((s, v) => s + v, 0) });
  }
  if (!out.length) throw new Fail(422, 'A budget needs at least one line.');
  return { lines: out.sort((x, y) => x.code.localeCompare(y.code)), accounts };
}
const budgetTotals = (lines, accounts) => ({ totalIncome: lines.filter((l) => accounts.get(l.code).kind === 'income').reduce((s, l) => s + l.total, 0), totalExpense: lines.filter((l) => accounts.get(l.code).kind === 'expense').reduce((s, l) => s + l.total, 0) });
async function createBudget(ctx, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const fy = String(b.fy || '').trim(); if (!E.validFy(fy, cfg.fiscalStartMonth)) throw new Fail(422, `Give the fiscal year like ${cfg.fiscalStartMonth === 1 ? '2026' : '2026-27'}.`);
  let lines = b.lines;
  if (b.copyFrom) { const src = await AcBudget.findOne({ _id: b.copyFrom, schoolId: S.oid(ctx.schoolId) }); if (!src) throw new Fail(404, 'The budget to copy was not found.'); lines = src.lines.map((l) => ({ code: l.code, months: l.months })); }
  const r = await budgetLines(ctx, lines, cfg); const last = await AcBudget.find({ schoolId: S.oid(ctx.schoolId), fy }).sort({ version: -1 }).limit(1);
  const open = await AcBudget.countDocuments({ schoolId: S.oid(ctx.schoolId), fy, status: 'draft' }); if (open) throw new Fail(409, 'There is already a draft for that year. Change it or delete it first.');
  try { return await AcBudget.create({ schoolId: S.oid(ctx.schoolId), fy, version: (last[0]?.version || 0) + 1, note: S.text(b.note, 'The note', { max: 300 }), lines: r.lines, ...budgetTotals(r.lines, r.accounts), createdById: ctx.actor.id, createdByName: ctx.actor.name || '' }); }
  catch (e) { if (S.isDup(e)) throw new Fail(409, 'That budget version already exists. Please try again.'); throw e; }
}
async function mustBudget(ctx, id) { let x = null; try { x = await AcBudget.findOne({ _id: id, schoolId: S.oid(ctx.schoolId) }); } catch (e) { x = null; } if (!x) throw new Fail(404, 'That budget was not found.'); return x; }
async function updateBudget(ctx, id, b) {
  const x = await mustBudget(ctx, id); if (x.status !== 'draft') throw new Fail(409, 'An approved budget cannot be changed. Start a new version.');
  if (String(x.createdById) !== String(ctx.actor.id) && ctx.role !== 'admin') throw new Fail(403, 'Only the person who made a draft can change it.');
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const r = await budgetLines(ctx, b.lines, cfg);
  const upd = await AcBudget.updateOne({ _id: x._id, status: 'draft' }, { $set: { lines: r.lines, ...budgetTotals(r.lines, r.accounts), note: b.note !== undefined ? S.text(b.note, 'The note', { max: 300 }) : x.note } });
  if (!upd.matchedCount) throw new Fail(409, 'That budget has just changed.'); return AcBudget.findOne({ _id: x._id });
}
async function deleteBudget(ctx, id) { const x = await mustBudget(ctx, id); if (x.status !== 'draft') throw new Fail(409, 'Only a draft can be deleted.'); await AcBudget.deleteOne({ _id: x._id, status: 'draft' }); return { ok: true }; }
async function approveBudget(ctx, id, b) {
  const x = await mustBudget(ctx, id); if (x.status !== 'draft') throw new Fail(409, 'That budget is not waiting for approval.');
  const sole = await S.separate(ctx, x.createdById, 'A budget');
  const upd = await AcBudget.updateOne({ _id: x._id, status: 'draft' }, { $set: { status: 'approved', approvedById: ctx.actor.id, approvedByName: ctx.actor.name || '', approvedAt: new Date(), sole, approveNote: S.text(b.note, 'The note', { max: 300 }) } });
  if (!upd.matchedCount) throw new Fail(409, 'That budget has just been decided.');
  await AcBudget.updateMany({ schoolId: S.oid(ctx.schoolId), fy: x.fy, status: 'approved', _id: { $ne: x._id } }, { $set: { status: 'superseded' } });
  return AcBudget.findOne({ _id: x._id });
}

/* ───────── bank reconciliation ───────── */
async function saveRecon(ctx, b) {
  const accounts = await L.accountsOf(ctx.schoolId); const code = String(b.code || ''); const a = accounts.get(code); if (!a || !a.bank) throw new Fail(422, 'Choose one of the school\'s bank accounts.');
  const ym = String(b.ym || ''); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) throw new Fail(422, 'Give the month like 2026-07.');
  const cfg = (await S.getCfg(ctx.schoolId)).settings; if (ym < E.ymOf(cfg.startDate)) throw new Fail(422, 'That month is before the ledger starts.');
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60).map((i) => ({ kind: ['deposit_in_transit', 'outstanding_payment', 'bank_error', 'not_in_books', 'other'].includes(i.kind) ? i.kind : 'other', text: S.text(i.text, 'Each item\'s description', { min: 2, max: 160 }), amount: S.num(i.amount, 'Each item\'s amount', { min: -1e12, max: 1e12 }) }));
  const statementBalance = S.num(b.statementBalance, 'The statement balance', { min: -1e12, max: 1e12 });
  const rows = await L.sums(ctx.schoolId, { to: E.lastDay(ym), codes: [code] }); const ledgerBalance = rows.reduce((s, r) => s + r.debit - r.credit, 0);
  const explained = items.reduce((s, i) => s + i.amount, 0); const difference = ledgerBalance - (statementBalance + explained);
  const cur = await AcRecon.findOne({ schoolId: S.oid(ctx.schoolId), code, ym });
  if (cur && cur.status === 'signed') throw new Fail(409, 'That reconciliation has been signed. An administrator can reopen it.');
  const doc = { asOf: E.lastDay(ym), statementBalance, ledgerBalance, items, explained, difference, note: S.text(b.note, 'The note', { max: 300 }) };
  if (cur) { await AcRecon.updateOne({ _id: cur._id, status: 'draft' }, { $set: { ...doc, preparedById: ctx.actor.id, preparedByName: ctx.actor.name || '' } }); return AcRecon.findOne({ _id: cur._id }); }
  try { return await AcRecon.create({ schoolId: S.oid(ctx.schoolId), code, ym, ...doc, preparedById: ctx.actor.id, preparedByName: ctx.actor.name || '' }); } catch (e) { if (S.isDup(e)) throw new Fail(409, 'Someone just started that reconciliation. Open it instead.'); throw e; }
}
async function signRecon(ctx, id) {
  let r = null; try { r = await AcRecon.findOne({ _id: id, schoolId: S.oid(ctx.schoolId) }); } catch (e) { r = null; } if (!r) throw new Fail(404, 'That reconciliation was not found.');
  if (r.status !== 'draft') throw new Fail(409, 'That reconciliation is already signed.');
  const rows = await L.sums(ctx.schoolId, { to: E.lastDay(r.ym), codes: [r.code] }); const ledger = rows.reduce((s, x) => s + x.debit - x.credit, 0);
  if (ledger !== r.ledgerBalance) throw new Fail(409, 'The ledger has moved since this was prepared. Save it again to refresh the balance.');
  if (r.difference !== 0) throw new Fail(422, `There is still an unexplained difference of ${Math.abs(r.difference).toLocaleString('en-US')}.`);
  const sole = await S.separate(ctx, r.preparedById, 'A reconciliation');
  const upd = await AcRecon.updateOne({ _id: r._id, status: 'draft' }, { $set: { status: 'signed', signedById: ctx.actor.id, signedByName: ctx.actor.name || '', signedAt: new Date(), sole } });
  if (!upd.matchedCount) throw new Fail(409, 'That reconciliation has just changed.'); return AcRecon.findOne({ _id: r._id });
}
async function reopenRecon(ctx, id, reason) {
  let r = null; try { r = await AcRecon.findOne({ _id: id, schoolId: S.oid(ctx.schoolId) }); } catch (e) { r = null; } if (!r) throw new Fail(404, 'That reconciliation was not found.');
  if (r.status !== 'signed') throw new Fail(409, 'That reconciliation is not signed.');
  const per = await AcPeriod.findOne({ schoolId: S.oid(ctx.schoolId), ym: r.ym }); if (per && per.status === 'closed') throw new Fail(409, 'That month is closed. Reopen the month first.');
  await AcRecon.updateOne({ _id: r._id, status: 'signed' }, { $set: { status: 'draft', signedById: null, signedByName: '', signedAt: null, note: `${r.note ? `${r.note} · ` : ''}Reopened by ${ctx.actor.name || 'an administrator'}: ${S.text(reason, 'The reason', { min: 5 })}`.slice(0, 300) } }); return AcRecon.findOne({ _id: r._id });
}

/* ───────── months ───────── */
async function periods(schoolId) {
  const { settings: cfg, ready } = await S.getCfg(schoolId); if (!ready) return [];
  const today = await S.today(schoolId); const to = E.addMonths(E.ymOf(today), 1); const docs = await AcPeriod.find({ schoolId: S.oid(schoolId) }).lean(); const by = new Map(docs.map((p) => [p.ym, p]));
  const posted = await L.sums(schoolId, { group: ['ym'] }); const n = new Map(posted.map((r) => [r.ym, r]));
  return E.monthsBetween(E.ymOf(cfg.startDate), to).map((ym) => { const p = by.get(ym) || {}; const r = n.get(ym); return { ym, name: L.ymName(ym), fy: E.fyOf(ym, cfg.fiscalStartMonth), status: p.status || 'open', lines: r ? r.n : 0, debit: r ? r.debit : 0, requestedByName: p.requestedByName || '', closedByName: p.closedByName || '', closedAt: p.closedAt || null, sole: !!p.sole, snapshot: p.snapshot || null, checklist: p.checklist || null, history: (p.history || []).slice(-6) }; });
}
async function closeChecklist(schoolId, ym) {
  const { settings: cfg } = await S.getCfg(schoolId); const sid = S.oid(schoolId); const blockers = []; const warnings = [];
  const first = E.ymOf(cfg.startDate); const earlier = [];
  for (const m of E.monthsBetween(first, E.addMonths(ym, -1))) { const p = await AcPeriod.findOne({ schoolId: sid, ym: m }); if (!p || p.status !== 'closed') earlier.push(m); }
  if (earlier.length) blockers.push(`Close ${L.ymName(earlier[0])} first. Months close in order.`);
  const unposted = await AcJournal.countDocuments({ schoolId: sid, ym, status: { $in: ['draft', 'submitted', 'posting'] } });
  if (unposted) blockers.push(`${unposted} journal${unposted === 1 ? ' is' : 's are'} dated in this month and not posted yet. Post, return or delete ${unposted === 1 ? 'it' : 'them'}.`);
  const tb = await ST.trialBalance(schoolId, { asOf: E.lastDay(ym) }); if (!tb.balanced) blockers.push('The trial balance does not balance.');
  const state = await S.getState(schoolId); if ((state.held || []).length) warnings.push(`${state.held.length} automatic posting${state.held.length === 1 ? ' is' : 's are'} on hold, so figures from other parts of the school may be missing.`);
  const banks = [...(await L.accountsOf(schoolId)).values()].filter((a) => a.bank && a.active); const signed = await AcRecon.find({ schoolId: sid, ym, status: 'signed' }).select('code').lean(); const done = new Set(signed.map((r) => r.code));
  const missing = banks.filter((a) => !done.has(a.code));
  if (missing.length) (cfg.requireReconciliation ? blockers : warnings).push(`No signed bank reconciliation for ${missing.map((a) => `${a.code} ${a.name}`).join(', ')}.`);
  return { blockers, warnings, trialBalanced: tb.balanced };
}
async function requestClose(ctx, ym) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym))) throw new Fail(422, 'Give the month like 2026-07.');
  const cfg = (await S.getCfg(ctx.schoolId)).settings; if (ym < E.ymOf(cfg.startDate)) throw new Fail(422, 'That month is before the ledger starts.');
  const today = await S.today(ctx.schoolId); if (E.lastDay(ym) >= today) throw new Fail(422, 'A month can be closed only after it has ended.');
  const per = await L.ensurePeriod(ctx.schoolId, ym); if (per.status !== 'open') throw new Fail(409, `${L.ymName(ym)} is already ${per.status}.`);
  const list = await closeChecklist(ctx.schoolId, ym); if (list.blockers.length) throw new Fail(422, list.blockers[0], { reason: 'close_blocked', checklist: list });
  const upd = await AcPeriod.updateOne({ _id: per._id, status: 'open' }, { $set: { status: 'closing', requestedById: ctx.actor.id, requestedByName: ctx.actor.name || '', requestedAt: new Date(), checklist: list }, $push: { history: hist(ctx.actor, 'close requested') } });
  if (!upd.matchedCount) throw new Fail(409, 'That month has just changed.');
  await S.tellAdmins(ctx.schoolId, 'Month waiting to be closed', `${L.ymName(ym)} is ready for sign-off.`, '/admin#/accounts', ctx.actor.id); return AcPeriod.findOne({ _id: per._id });
}
async function approveClose(ctx, ym) {
  const per = await AcPeriod.findOne({ schoolId: S.oid(ctx.schoolId), ym }); if (!per || per.status !== 'closing') throw new Fail(409, 'That month is not waiting to be closed.');
  const sole = await S.separate(ctx, per.requestedById, 'Closing a month');
  const list = await closeChecklist(ctx.schoolId, ym); if (list.blockers.length) throw new Fail(422, list.blockers[0], { reason: 'close_blocked', checklist: list });
  const snapshot = await ST.snapshotFor(ctx.schoolId, ym);
  const upd = await AcPeriod.updateOne({ _id: per._id, status: 'closing' }, { $set: { status: 'closed', closedById: ctx.actor.id, closedByName: ctx.actor.name || '', closedAt: new Date(), sole, snapshot, checklist: list }, $push: { history: hist(ctx.actor, 'closed', sole ? 'sole administrator' : '') } });
  if (!upd.matchedCount) throw new Fail(409, 'That month has just changed.'); return AcPeriod.findOne({ _id: per._id });
}
async function cancelClose(ctx, ym) {
  const per = await AcPeriod.findOne({ schoolId: S.oid(ctx.schoolId), ym }); if (!per || per.status !== 'closing') throw new Fail(409, 'That month is not waiting to be closed.');
  await AcPeriod.updateOne({ _id: per._id, status: 'closing' }, { $set: { status: 'open', checklist: null }, $push: { history: hist(ctx.actor, 'close cancelled') } }); return AcPeriod.findOne({ _id: per._id });
}
// Only the latest closed month can be opened again, so each month's closing fingerprint stays true.
async function reopen(ctx, ym, reason) {
  const why = S.text(reason, 'The reason', { min: 10 }); const per = await AcPeriod.findOne({ schoolId: S.oid(ctx.schoolId), ym }); if (!per || per.status !== 'closed') throw new Fail(409, 'That month is not closed.');
  const later = await AcPeriod.countDocuments({ schoolId: S.oid(ctx.schoolId), status: 'closed', ym: { $gt: ym } }); if (later) throw new Fail(409, 'A later month is closed. Reopen the latest closed month first.');
  await AcPeriod.updateOne({ _id: per._id, status: 'closed' }, { $set: { status: 'open', snapshot: null }, $push: { history: hist(ctx.actor, 'reopened', why) } });
  await S.tellAdmins(ctx.schoolId, 'A closed month was reopened', `${L.ymName(ym)}: ${why}`, '/admin#/accounts', ctx.actor.id); return AcPeriod.findOne({ _id: per._id });
}

module.exports = { setup, saveSettings, listAccounts, createAccount, updateAccount, createFund, updateFund, setFundStatus, mustFund, createBudget, updateBudget, deleteBudget, approveBudget, mustBudget, saveRecon, signRecon, reopenRecon, periods, closeChecklist, requestClose, approveClose, cancelClose, reopen };
