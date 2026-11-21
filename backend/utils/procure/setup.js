// Suppliers, funds, budgets and facility projects (PRD E19).
const S = require('./service');
const F = require('./funding');
const PcVendor = require('../../models/PcVendor'); const PcFund = require('../../models/PcFund'); const PcFundEntry = require('../../models/PcFundEntry');
const PcBudget = require('../../models/PcBudget'); const PcBudgetLine = require('../../models/PcBudgetLine'); const PcVariation = require('../../models/PcVariation');
const PcProject = require('../../models/PcProject'); const PcChange = require('../../models/PcChange');
const PcRequisition = require('../../models/PcRequisition'); const PcOrder = require('../../models/PcOrder'); const PcInvoice = require('../../models/PcInvoice');
const { Fail, E, oid, clean, num, day, optDay, key } = S;
const plain = (d) => (d && d.toObject ? d.toObject() : d);
const mask = (n) => (n ? `…${String(n).replace(/\s/g, '').slice(-4)}` : '');
const vendorView = (v, full = false) => { const o = plain(v); const b = o.bank || {}; return { ...o, bank: full ? b : { bankName: b.bankName || '', accountTitle: b.accountTitle || '', accountNo: mask(b.accountNo), branch: b.branch || '' }, pendingBank: o.pendingBank?.requestedAt ? { ...o.pendingBank, accountNo: full ? o.pendingBank.accountNo : mask(o.pendingBank.accountNo) } : null, bankKey: undefined, nameKey: undefined, taxKey: undefined }; };

/* ───────── suppliers ───────── */
async function repeats(schoolId, { nameKey, taxKey, bankKey }, exceptId = null) {
  const ne = exceptId ? { _id: { $ne: exceptId } } : {};
  if (nameKey) { const v = await PcVendor.findOne({ schoolId, nameKey, ...ne }); if (v) return `A supplier called “${v.name}” already exists.`; }
  if (taxKey) { const v = await PcVendor.findOne({ schoolId, taxKey, ...ne }); if (v) return `“${v.name}” already has that tax number.`; }
  if (bankKey) { const v = await PcVendor.findOne({ schoolId, $or: [{ bankKey }, { 'pendingBank.bankKey': bankKey }], ...ne }); if (v) return `“${v.name}” already has that bank account.`; }
  return '';
}
const cleanBank = (b = {}) => {
  const accountNo = clean(b.accountNo, 40).replace(/\s/g, ''); if (!accountNo) return null;
  if (!/^[A-Za-z0-9-]{6,34}$/.test(accountNo)) throw new Fail(422, 'The account number looks wrong. Use letters and numbers only, 6 to 34 characters.');
  return { bankName: clean(b.bankName, 80), accountTitle: clean(b.accountTitle, 120), accountNo, branch: clean(b.branch, 80), bankKey: S.sha(key(accountNo)) };
};
async function createVendor(ctx, b) {
  const name = clean(b.name, 160); if (!name) throw new Fail(422, 'Give the supplier a name.');
  const taxNo = clean(b.taxNo, 40); const bank = cleanBank(b.bank); const nameKey = key(name); const taxKey = taxNo ? key(taxNo) : undefined;
  const dup = await repeats(ctx.schoolId, { nameKey, taxKey, bankKey: bank?.bankKey }); if (dup) throw new Fail(409, dup, { reason: 'duplicate' });
  const doc = { schoolId: ctx.schoolId, name, nameKey, taxNo, phone: clean(b.phone, 40), email: clean(b.email, 120).toLowerCase(), address: clean(b.address, 240), contact: clean(b.contact, 120), categories: Array.isArray(b.categories) ? b.categories.map((x) => clean(x, 60)).filter(Boolean).slice(0, 20) : [], notes: clean(b.notes, 500), createdByName: ctx.actor.name || '' };
  if (taxKey) doc.taxKey = taxKey;
  if (bank) doc.pendingBank = { ...bank, reason: 'Given when the supplier was added', requestedById: ctx.actor.id, requestedByName: ctx.actor.name || '', requestedAt: new Date() };
  try { const v = await PcVendor.create(doc); if (bank) await S.tellAdmins(ctx.schoolId, 'Supplier bank details to approve', `${name}: bank details were added by ${ctx.actor.name || 'a colleague'}.`, '/admin#/purchasing', ctx.actor.id); return v; }
  catch (e) { if (S.isDup(e)) throw new Fail(409, 'A supplier with those details already exists.', { reason: 'duplicate' }); throw e; }
}
async function updateVendor(ctx, id, b) {
  const v = oid(id) ? await PcVendor.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!v) throw new Fail(404, 'That supplier is not in your school.');
  const $set = {}; const $unset = {};
  if (b.name !== undefined) { const name = clean(b.name, 160); if (!name) throw new Fail(422, 'Give the supplier a name.'); const dup = await repeats(ctx.schoolId, { nameKey: key(name) }, v._id); if (dup) throw new Fail(409, dup, { reason: 'duplicate' }); $set.name = name; $set.nameKey = key(name); }
  if (b.taxNo !== undefined) { const t = clean(b.taxNo, 40); if (t) { const dup = await repeats(ctx.schoolId, { taxKey: key(t) }, v._id); if (dup) throw new Fail(409, dup, { reason: 'duplicate' }); $set.taxNo = t; $set.taxKey = key(t); } else { $set.taxNo = ''; $unset.taxKey = ''; } }
  for (const [k, len] of [['phone', 40], ['address', 240], ['contact', 120], ['notes', 500]]) if (b[k] !== undefined) $set[k] = clean(b[k], len);
  if (b.email !== undefined) $set.email = clean(b.email, 120).toLowerCase();
  if (Array.isArray(b.categories)) $set.categories = b.categories.map((x) => clean(x, 60)).filter(Boolean).slice(0, 20);
  if (b.status !== undefined) {
    if (!['active', 'blocked'].includes(b.status)) throw new Fail(422, 'A supplier is active or blocked.');
    if (b.status === 'blocked') { const r = clean(b.blockReason, 300); if (r.length < 5) throw new Fail(422, 'Write why the supplier is being blocked.'); $set.blockReason = r; } else $set.blockReason = '';
    $set.status = b.status;
  }
  const u = {}; if (Object.keys($set).length) u.$set = $set; if (Object.keys($unset).length) u.$unset = $unset; if (!Object.keys(u).length) throw new Fail(422, 'Nothing to change.');
  try { await PcVendor.updateOne({ _id: v._id, schoolId: ctx.schoolId }, u); } catch (e) { if (S.isDup(e)) throw new Fail(409, 'A supplier with those details already exists.', { reason: 'duplicate' }); throw e; }
  return { ok: true };
}
async function requestBank(ctx, id, b) {
  const v = oid(id) ? await PcVendor.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!v) throw new Fail(404, 'That supplier is not in your school.');
  const bank = cleanBank(b.bank); if (!bank) throw new Fail(422, 'Give the account number.'); const reason = clean(b.reason, 300); if (reason.length < 5) throw new Fail(422, 'Write why the bank details are changing.');
  if (v.bank?.accountNo && key(v.bank.accountNo) === key(bank.accountNo)) throw new Fail(422, 'Those are the bank details already on file.');
  const dup = await repeats(ctx.schoolId, { bankKey: bank.bankKey }, v._id); if (dup) throw new Fail(409, dup, { reason: 'duplicate' });
  await PcVendor.updateOne({ _id: v._id, schoolId: ctx.schoolId }, { $set: { pendingBank: { ...bank, reason, requestedById: ctx.actor.id, requestedByName: ctx.actor.name || '', requestedAt: new Date() } } });
  await S.tellAdmins(ctx.schoolId, 'Supplier bank details to approve', `${v.name}: ${ctx.actor.name || 'a colleague'} asked to change the bank account. Payments to this supplier are held until it is decided.`, '/admin#/purchasing', ctx.actor.id);
  return { ok: true };
}
async function decideBank(ctx, id, { approve, note = '' }) {
  const v = oid(id) ? await PcVendor.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!v || !v.pendingBank?.requestedAt) throw new Fail(404, 'There is no bank change waiting for that supplier.');
  await S.separate(ctx, v.pendingBank.requestedById, 'A bank change');
  const p = v.pendingBank;
  if (!approve) { await PcVendor.updateOne({ _id: v._id, pendingBank: { $ne: null } }, { $unset: { pendingBank: '' } }); return { ok: true, status: 'rejected' }; }
  const dup = await repeats(ctx.schoolId, { bankKey: p.bankKey }, v._id); if (dup) throw new Fail(409, dup, { reason: 'duplicate' });
  await PcVendor.updateOne({ _id: v._id, schoolId: ctx.schoolId }, { $set: { bank: { bankName: p.bankName, accountTitle: p.accountTitle, accountNo: p.accountNo, branch: p.branch }, bankKey: p.bankKey }, $unset: { pendingBank: '' } });
  return { ok: true, status: 'approved' };
}
async function listVendors(schoolId, q) {
  const { limit, skip, page } = S.pg(q); const f = { schoolId }; if (q.status) f.status = q.status;
  if (q.q) { const re = new RegExp(String(q.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60), 'i'); f.$or = [{ name: re }, { taxNo: re }, { contact: re }]; }
  const [rows, total] = await Promise.all([PcVendor.find(f).sort({ name: 1 }).skip(skip).limit(limit), PcVendor.countDocuments(f)]);
  return { rows: rows.map((v) => vendorView(v)), total, page, limit };
}
async function vendorDetail(schoolId, id) {
  const v = oid(id) ? await PcVendor.findOne({ _id: id, schoolId }) : null; if (!v) throw new Fail(404, 'That supplier is not in your school.');
  const [orders, bills] = await Promise.all([PcOrder.find({ schoolId, vendorId: v._id }).sort({ createdAt: -1 }).limit(20), PcInvoice.find({ schoolId, vendorId: v._id }).sort({ createdAt: -1 }).limit(20)]);
  return { vendor: vendorView(v), orders: orders.map(plain), bills: bills.map(plain), orderedTotal: orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0), paidTotal: orders.reduce((s, o) => s + o.paidTotal, 0) };
}

/* ───────── funds ───────── */
async function createFund(ctx, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const name = clean(b.name, 120); if (!name) throw new Fail(422, 'Give the fund a name.');
  const kind = b.kind || 'general'; if (!['general', 'restricted', 'grant', 'donor'].includes(kind)) throw new Fail(422, 'Choose the kind of fund.');
  const allowed = Array.isArray(b.allowed) ? [...new Set(b.allowed.map((x) => clean(x, 60)).filter(Boolean))] : [];
  const unknown = allowed.filter((x) => !cfg.categories.includes(x)); if (unknown.length) throw new Fail(422, `Not a spending category: ${unknown.join(', ')}.`);
  if (kind !== 'general' && !allowed.length) throw new Fail(422, 'A restricted, grant or donor fund must name what it may be spent on.');
  const validFrom = optDay(b.validFrom, 'the start date'); const validTo = optDay(b.validTo, 'the end date'); if (validFrom && validTo && validTo < validFrom) throw new Fail(422, 'The fund cannot end before it starts.');
  const opening = b.amount === undefined || b.amount === '' ? 0 : num(b.amount, 'The opening amount', { min: 0 });
  let f; try { f = await PcFund.create({ schoolId: ctx.schoolId, name, kind, donor: clean(b.donor, 120), reference: clean(b.reference, 80), purpose: clean(b.purpose, 300), allowed, validFrom: validFrom ? new Date(validFrom) : null, validTo: validTo ? new Date(validTo) : null, createdByName: ctx.actor.name || '' }); }
  catch (e) { if (S.isDup(e)) throw new Fail(409, 'A fund with that name already exists.'); throw e; }
  if (opening > 0) await F.receive(ctx, f._id, opening, { note: 'Opening amount', refNo: clean(b.reference, 80) });
  return PcFund.findOne({ _id: f._id, schoolId: ctx.schoolId });
}
async function fundMoney(ctx, id, b) {
  const f = oid(id) ? await PcFund.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!f) throw new Fail(404, 'That fund is not in your school.'); if (f.status !== 'active') throw new Fail(409, 'That fund is closed.');
  const amount = num(b.amount, 'The amount', { min: 1 }); const note = clean(b.note, 300); const kind = b.kind === 'adjust' ? 'adjust' : 'receipt';
  if (kind === 'adjust' && note.length < 5) throw new Fail(422, 'Write why the fund is being corrected.');
  const signed = kind === 'adjust' && b.direction === 'down' ? -amount : amount; return F.receive(ctx, f._id, signed, { kind, note, refNo: clean(b.reference, 80) });
}
async function closeFund(ctx, id, { reason }) {
  const f = oid(id) ? await PcFund.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!f) throw new Fail(404, 'That fund is not in your school.');
  if (f.committed > 0) throw new Fail(409, `${S.money(f.committed)} is still set aside on open orders. Settle or cancel them first.`); if (String(reason || '').trim().length < 5) throw new Fail(422, 'Write why the fund is being closed.');
  await PcFund.updateOne({ _id: f._id, schoolId: ctx.schoolId, committed: 0 }, { $set: { status: 'closed' } }); return { ok: true };
}
async function fundDetail(schoolId, id, q) {
  const f = oid(id) ? await PcFund.findOne({ _id: id, schoolId }) : null; if (!f) throw new Fail(404, 'That fund is not in your school.'); const { limit, skip, page } = S.pg(q);
  const [rows, total] = await Promise.all([PcFundEntry.find({ schoolId, fundId: f._id }).sort({ createdAt: -1 }).skip(skip).limit(limit), PcFundEntry.countDocuments({ schoolId, fundId: f._id })]);
  return { fund: plain(f), entries: rows.map(plain), total, page, limit };
}

/* ───────── budgets ───────── */
const cleanLines = (cfg, lines) => {
  if (!Array.isArray(lines) || !lines.length) throw new Fail(422, 'Add at least one line to the budget.'); const seen = new Set(); const out = [];
  for (const l of lines) { const category = clean(l.category, 60); if (!cfg.categories.includes(category)) throw new Fail(422, `“${category}” is not a spending category.`); if (seen.has(category)) throw new Fail(422, `${category} is on the budget twice.`); seen.add(category); out.push({ category, amount: num(l.amount, `The ${category} amount`, { min: 0 }) }); }
  return out;
};
async function createBudget(ctx, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const year = clean(b.year, 12); if (!/^\d{4}(-\d{2})?$/.test(year)) throw new Fail(422, 'Give the year like 2026-27.');
  const costCentre = clean(b.costCentre, 60); if (!cfg.costCentres.includes(costCentre)) throw new Fail(422, 'Choose a cost centre from the list.'); const lines = cleanLines(cfg, b.lines);
  let bu; try { bu = await PcBudget.create({ schoolId: ctx.schoolId, year, costCentre, note: clean(b.note, 300), total: lines.reduce((s, l) => s + l.amount, 0), createdById: ctx.actor.id, createdByName: ctx.actor.name || '' }); }
  catch (e) { if (S.isDup(e)) throw new Fail(409, `There is already a ${costCentre} budget for ${year}.`); throw e; }
  for (const l of lines) await PcBudgetLine.create({ schoolId: ctx.schoolId, budgetId: bu._id, year, costCentre, category: l.category, amount: l.amount, available: l.amount });
  return bu;
}
async function updateBudget(ctx, id, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const bu = oid(id) ? await PcBudget.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!bu) throw new Fail(404, 'That budget is not in your school.');
  if (bu.status !== 'draft') throw new Fail(409, 'An approved budget changes only through a variation request.', { reason: 'approved' });
  const lines = cleanLines(cfg, b.lines); const have = await PcBudgetLine.find({ schoolId: ctx.schoolId, budgetId: bu._id });
  for (const l of lines) { const e = have.find((h) => h.category === l.category); if (e) await PcBudgetLine.updateOne({ _id: e._id, schoolId: ctx.schoolId }, { $set: { amount: l.amount, available: l.amount } }); else await PcBudgetLine.create({ schoolId: ctx.schoolId, budgetId: bu._id, year: bu.year, costCentre: bu.costCentre, category: l.category, amount: l.amount, available: l.amount }); }
  for (const h of have) if (!lines.some((l) => l.category === h.category)) await PcBudgetLine.deleteOne({ _id: h._id, schoolId: ctx.schoolId });
  await PcBudget.updateOne({ _id: bu._id, schoolId: ctx.schoolId, status: 'draft' }, { $set: { total: lines.reduce((s, l) => s + l.amount, 0), ...(b.note !== undefined ? { note: clean(b.note, 300) } : {}) } }); return { ok: true };
}
async function approveBudget(ctx, id) {
  const bu = oid(id) ? await PcBudget.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!bu) throw new Fail(404, 'That budget is not in your school.'); if (bu.status !== 'draft') throw new Fail(409, `That budget is already ${bu.status}.`);
  if (!(bu.total > 0)) throw new Fail(422, 'A budget with no money in it cannot be approved.'); const alone = await S.separate(ctx, bu.createdById, 'A budget');
  const done = await PcBudget.updateOne({ _id: bu._id, schoolId: ctx.schoolId, status: 'draft' }, { $set: { status: 'approved', approvedById: ctx.actor.id, approvedByName: ctx.actor.name || '', approvedAt: new Date(), sole: !!alone } });
  if (!done.matchedCount) throw new Fail(409, 'That budget has just changed. Open it again.'); return { ok: true, sole: !!alone };
}
async function closeBudget(ctx, id) {
  const bu = oid(id) ? await PcBudget.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!bu) throw new Fail(404, 'That budget is not in your school.');
  const open = (await PcBudgetLine.find({ schoolId: ctx.schoolId, budgetId: bu._id })).reduce((s, l) => s + l.committed, 0); if (open > 0) throw new Fail(409, `${S.money(open)} is still set aside on open orders from this budget.`);
  await PcBudget.updateOne({ _id: bu._id, schoolId: ctx.schoolId }, { $set: { status: 'closed' } }); return { ok: true };
}
async function listBudgets(schoolId, q) {
  const f = { schoolId }; if (q.year) f.year = q.year; if (q.status) f.status = q.status; const rows = await PcBudget.find(f).sort({ year: -1, costCentre: 1 }).limit(200);
  const lines = rows.length ? await PcBudgetLine.find({ schoolId, budgetId: { $in: rows.map((r) => r._id) } }) : [];
  return { rows: rows.map((b) => { const ls = lines.filter((l) => String(l.budgetId) === String(b._id)); return { ...plain(b), committed: ls.reduce((s, l) => s + l.committed, 0), spent: ls.reduce((s, l) => s + l.spent, 0), available: ls.reduce((s, l) => s + l.available, 0), lines: ls.map(plain) }; }) };
}
async function requestVariation(ctx, b) {
  const kind = b.kind === 'increase' ? 'increase' : 'move'; const amount = num(b.amount, 'The amount', { min: 1 }); const reason = clean(b.reason, 300); if (reason.length < 5) throw new Fail(422, 'Write why the budget needs to change.');
  const to = oid(b.toLineId) ? await PcBudgetLine.findOne({ _id: b.toLineId, schoolId: ctx.schoolId }) : null; if (!to) throw new Fail(422, 'Choose the budget line that needs more.');
  const fromLine = kind === 'move' ? (oid(b.fromLineId) ? await PcBudgetLine.findOne({ _id: b.fromLineId, schoolId: ctx.schoolId }) : null) : null;
  if (kind === 'move') { if (!fromLine) throw new Fail(422, 'Choose the budget line the money comes from.'); if (String(fromLine._id) === String(to._id)) throw new Fail(422, 'Choose two different lines.'); if (fromLine.available < amount) throw new Fail(409, `The ${fromLine.category} line has only ${S.money(fromLine.available)} left.`); }
  for (const l of [to, fromLine].filter(Boolean)) { const bu = await PcBudget.findOne({ _id: l.budgetId, schoolId: ctx.schoolId }); if (!bu || bu.status !== 'approved') throw new Fail(422, 'Variations apply to approved budgets. Edit a draft budget directly.'); }
  return S.numbered(PcVariation, ctx.schoolId, 'varNo', 'BV', { kind, fromLineId: fromLine?._id || null, toLineId: to._id, amount, reason, requestedById: ctx.actor.id, requestedByName: ctx.actor.name || '' });
}
async function decideVariation(ctx, id, { approve, note = '' }) {
  const v = oid(id) ? await PcVariation.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!v) throw new Fail(404, 'That variation is not in your school.'); if (v.status !== 'requested') throw new Fail(409, `That variation is already ${v.status}.`);
  const alone = await S.separate(ctx, v.requestedById, 'A budget variation'); const dec = { decidedById: ctx.actor.id, decidedByName: ctx.actor.name || '', decidedAt: new Date(), decisionNote: clean(note, 300), sole: !!alone };
  if (!approve) { await PcVariation.updateOne({ _id: v._id, status: 'requested' }, { $set: { status: 'rejected', ...dec } }); return { ok: true, status: 'rejected' }; }
  const claimed = await PcVariation.updateOne({ _id: v._id, status: 'requested' }, { $set: { status: 'approved', ...dec } }); if (!claimed.matchedCount) throw new Fail(409, 'That variation has just been decided.');
  const undo = async () => PcVariation.updateOne({ _id: v._id }, { $set: { status: 'requested' } });
  if (v.fromLineId) { const took = await PcBudgetLine.updateOne({ _id: v.fromLineId, schoolId: ctx.schoolId, available: { $gte: v.amount } }, { $inc: { amount: -v.amount, available: -v.amount } }); if (!took.matchedCount) { await undo(); throw new Fail(409, 'The line the money comes from no longer has that much available.'); } }
  await PcBudgetLine.updateOne({ _id: v.toLineId, schoolId: ctx.schoolId }, { $inc: { amount: v.amount, available: v.amount } });
  const to = await PcBudgetLine.findOne({ _id: v.toLineId, schoolId: ctx.schoolId }); const from = v.fromLineId ? await PcBudgetLine.findOne({ _id: v.fromLineId, schoolId: ctx.schoolId }) : null;
  if (!from) await PcBudget.updateOne({ _id: to.budgetId, schoolId: ctx.schoolId }, { $inc: { total: v.amount } });
  else if (String(from.budgetId) !== String(to.budgetId)) { await PcBudget.updateOne({ _id: from.budgetId, schoolId: ctx.schoolId }, { $inc: { total: -v.amount } }); await PcBudget.updateOne({ _id: to.budgetId, schoolId: ctx.schoolId }, { $inc: { total: v.amount } }); }
  return { ok: true, status: 'approved' };
}
const listVariations = async (schoolId, q) => { const f = { schoolId }; if (q.status) f.status = q.status; const rows = await PcVariation.find(f).sort({ createdAt: -1 }).limit(100); const ids = [...new Set(rows.flatMap((r) => [r.fromLineId, r.toLineId].filter(Boolean).map(String)))]; const ls = ids.length ? await PcBudgetLine.find({ schoolId, _id: { $in: ids } }) : []; const nm = (id) => { const l = ls.find((x) => String(x._id) === String(id)); return l ? `${l.costCentre} · ${l.category} (${l.year})` : ''; }; return { rows: rows.map((r) => ({ ...plain(r), fromName: r.fromLineId ? nm(r.fromLineId) : '', toName: nm(r.toLineId) })) }; };

/* ───────── facility projects ───────── */
async function createProject(ctx, b) {
  const title = clean(b.title, 160); if (!title) throw new Fail(422, 'Give the project a title.'); const proposed = num(b.proposed, 'The estimated cost', { min: 1 });
  const ms = (Array.isArray(b.milestones) ? b.milestones : []).slice(0, 30).map((m, i) => ({ key: `m${i + 1}`, title: clean(m.title, 120), dueOn: optDay(m.dueOn, 'the milestone date'), amount: m.amount === undefined || m.amount === '' ? 0 : num(m.amount, 'The milestone amount', { min: 0 }), done: false, note: '' }));
  if (ms.some((m) => !m.title)) throw new Fail(422, 'Every milestone needs a title.');
  return S.numbered(PcProject, ctx.schoolId, 'code', 'PRJ', { title, description: clean(b.description, 1000), location: clean(b.location, 120), ownerName: clean(b.ownerName, 120) || ctx.actor.name || '', proposed, startOn: optDay(b.startOn, 'the start date'), endOn: optDay(b.endOn, 'the end date'), milestones: ms, createdById: ctx.actor.id, createdByName: ctx.actor.name || '' });
}
async function approveProject(ctx, id, b) {
  const p = oid(id) ? await PcProject.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!p) throw new Fail(404, 'That project is not in your school.'); if (p.phase !== 'proposed') throw new Fail(409, `That project is already ${p.phase}.`);
  const authorized = b.authorized === undefined ? p.proposed : num(b.authorized, 'The authorised amount', { min: 1 }); const alone = await S.separate(ctx, p.createdById, 'A project');
  const { line, fund } = await F.check(ctx, { lineId: b.budgetLineId, fundId: b.fundId || null, at: await S.today(ctx.schoolId), amount: 0 });
  const warnings = []; if (line.available < authorized) warnings.push(`The ${line.category} budget has only ${S.money(line.available)} left. Spending will stop there.`); if (fund && fund.available < authorized) warnings.push(`The fund “${fund.name}” has only ${S.money(fund.available)}.`);
  const done = await PcProject.updateOne({ _id: p._id, schoolId: ctx.schoolId, phase: 'proposed' }, { $set: { phase: 'approved', authorized, available: authorized, budgetLineId: line._id, fundId: fund?._id || null, approvedById: ctx.actor.id, approvedByName: ctx.actor.name || '', approvedAt: new Date(), sole: !!alone } });
  if (!done.matchedCount) throw new Fail(409, 'That project has just changed. Open it again.'); return { ok: true, warnings };
}
const PHASES = { approved: ['building'], building: ['handover'], handover: ['completed'] };
async function setPhase(ctx, id, { phase, note = '' }) {
  const p = oid(id) ? await PcProject.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!p) throw new Fail(404, 'That project is not in your school.');
  if (phase === 'cancelled') { if (['completed', 'cancelled'].includes(p.phase)) throw new Fail(409, `That project is already ${p.phase}.`); if (p.committed > 0) throw new Fail(409, `${S.money(p.committed)} is still set aside on open orders. Cancel or settle them first.`); if (clean(note, 300).length < 5) throw new Fail(422, 'Write why the project is being cancelled.'); }
  else if (!(PHASES[p.phase] || []).includes(phase)) throw new Fail(409, `A ${p.phase} project cannot move to ${phase}.`);
  if (phase === 'completed') { if (p.committed > 0) throw new Fail(409, `${S.money(p.committed)} is still set aside on open orders.`); const open = p.milestones.filter((m) => !m.done); if (open.length && clean(note, 300).length < 5) throw new Fail(422, `${open.length} milestone(s) are not done. Write why the project is complete anyway.`); }
  const done = await PcProject.updateOne({ _id: p._id, schoolId: ctx.schoolId, phase: p.phase }, { $set: { phase, closedNote: clean(note, 300) } }); if (!done.matchedCount) throw new Fail(409, 'That project has just changed.'); return { ok: true };
}
async function milestone(ctx, id, k, { done, note = '' }) {
  const p = oid(id) ? await PcProject.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!p) throw new Fail(404, 'That project is not in your school.'); if (!['approved', 'building', 'handover'].includes(p.phase)) throw new Fail(409, 'Milestones are ticked off while the project is under way.');
  const m = p.milestones.find((x) => x.key === k); if (!m) throw new Fail(404, 'That milestone is not on the project.');
  const ms = p.milestones.map((x) => (x.key === k ? { ...plain(x), done: !!done, doneAt: done ? new Date() : null, note: clean(note, 300) } : plain(x)));
  await PcProject.updateOne({ _id: p._id, schoolId: ctx.schoolId }, { $set: { milestones: ms } }); return { ok: true };
}
async function requestChange(ctx, id, b) {
  const p = oid(id) ? await PcProject.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!p) throw new Fail(404, 'That project is not in your school.'); if (['completed', 'cancelled', 'proposed'].includes(p.phase)) throw new Fail(409, 'Change orders are for approved projects that are not finished.');
  const kind = ['increase', 'scope', 'schedule'].includes(b.kind) ? b.kind : null; if (!kind) throw new Fail(422, 'Choose the kind of change.'); const reason = clean(b.reason, 400); if (reason.length < 5) throw new Fail(422, 'Write why the change is needed.');
  const doc = { projectId: p._id, kind, reason, requestedById: ctx.actor.id, requestedByName: ctx.actor.name || '' };
  if (kind === 'increase') doc.amount = num(b.amount, 'The extra amount', { min: 1 }); if (kind === 'schedule') doc.endOn = day(b.endOn, 'the new end date');
  return S.numbered(PcChange, ctx.schoolId, 'chgNo', 'CHG', doc);
}
async function decideChange(ctx, id, { approve, note = '' }) {
  const c = oid(id) ? await PcChange.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!c) throw new Fail(404, 'That change order is not in your school.'); if (c.status !== 'requested') throw new Fail(409, `That change order is already ${c.status}.`);
  const alone = await S.separate(ctx, c.requestedById, 'A change order'); const dec = { decidedById: ctx.actor.id, decidedByName: ctx.actor.name || '', decidedAt: new Date(), decisionNote: clean(note, 300), sole: !!alone };
  if (!approve) { await PcChange.updateOne({ _id: c._id, status: 'requested' }, { $set: { status: 'rejected', ...dec } }); return { ok: true, status: 'rejected' }; }
  const claimed = await PcChange.updateOne({ _id: c._id, status: 'requested' }, { $set: { status: 'approved', ...dec } }); if (!claimed.matchedCount) throw new Fail(409, 'That change order has just been decided.');
  if (c.kind === 'increase') await PcProject.updateOne({ _id: c.projectId, schoolId: ctx.schoolId }, { $inc: { authorized: c.amount, available: c.amount } });
  if (c.kind === 'schedule') await PcProject.updateOne({ _id: c.projectId, schoolId: ctx.schoolId }, { $set: { endOn: c.endOn } });
  return { ok: true, status: 'approved' };
}
async function listProjects(schoolId, q) { const f = { schoolId }; if (q.phase) f.phase = q.phase; const rows = await PcProject.find(f).sort({ createdAt: -1 }).limit(200); return { rows: rows.map((p) => ({ ...plain(p), milestonesDone: p.milestones.filter((m) => m.done).length })) }; }
async function projectDetail(schoolId, id) {
  const p = oid(id) ? await PcProject.findOne({ _id: id, schoolId }) : null; if (!p) throw new Fail(404, 'That project is not in your school.');
  const [changes, reqs, orders] = await Promise.all([PcChange.find({ schoolId, projectId: p._id }).sort({ createdAt: -1 }), PcRequisition.find({ schoolId, projectId: p._id }).sort({ createdAt: -1 }).limit(50), PcOrder.find({ schoolId, projectId: p._id }).sort({ createdAt: -1 }).limit(50)]);
  const planned = p.milestones.reduce((s, m) => s + (m.amount || 0), 0); const t = await S.today(schoolId);
  return { project: plain(p), changes: changes.map(plain), requisitions: reqs.map(plain), orders: orders.map(plain), variance: { authorized: p.authorized, proposed: p.proposed, committed: p.committed, spent: p.spent, available: p.available, overProposed: Math.max(0, p.authorized - p.proposed), milestonePlan: planned, overdue: p.milestones.filter((m) => !m.done && m.dueOn && m.dueOn < t).length } };
}

module.exports = { vendorView, createVendor, updateVendor, requestBank, decideBank, listVendors, vendorDetail, createFund, fundMoney, closeFund, fundDetail, createBudget, updateBudget, approveBudget, closeBudget, listBudgets, requestVariation, decideVariation, listVariations, createProject, approveProject, setPhase, milestone, requestChange, decideChange, listProjects, projectDetail };
