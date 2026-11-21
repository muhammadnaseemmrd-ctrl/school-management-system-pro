// Assets, maintenance, running contracts, reports and the daily sweep (PRD E19).
const S = require('./service');
const F = require('./funding');
const Catalog = require('../library/catalog');
const PcAsset = require('../../models/PcAsset'); const PcAssetEvent = require('../../models/PcAssetEvent'); const PcTicket = require('../../models/PcTicket'); const PcPlan = require('../../models/PcPlan'); const PcContract = require('../../models/PcContract');
const PcOrder = require('../../models/PcOrder'); const PcOrderLine = require('../../models/PcOrderLine'); const PcInvoice = require('../../models/PcInvoice'); const PcVendor = require('../../models/PcVendor');
const PcRequisition = require('../../models/PcRequisition'); const PcFund = require('../../models/PcFund'); const PcBudget = require('../../models/PcBudget'); const PcBudgetLine = require('../../models/PcBudgetLine');
const PcProject = require('../../models/PcProject'); const PcVariation = require('../../models/PcVariation'); const PcChange = require('../../models/PcChange');
const AppSetting = require('../../models/AppSetting'); const Teacher = require('../../models/Teacher');
const { Fail, E, oid, clean, num, day, optDay, trail, money } = S;
const plain = (d) => (d && d.toObject ? d.toObject() : d);
const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60);

/* ───────── assets ───────── */
async function event(ctx, assetId, kind, from, to, note) { await PcAssetEvent.create({ schoolId: ctx.schoolId, assetId, kind, from: from || '', to: to || '', note: clean(note, 300), byId: ctx.actor.id, byName: ctx.actor.name || '' }); }
async function takeTag(ctx, build) { let n = (await PcAsset.countDocuments({ schoolId: ctx.schoolId })) + 1; for (let i = 0; i < 12; i += 1) { try { return await build(E.makeTag(n + i)); } catch (e) { if (!S.isDup(e)) throw e; } } throw new Error('could not make an asset tag'); }
async function custodian(ctx, b) {
  if (b.custodianId) { const t = oid(b.custodianId) ? await Teacher.findOne({ _id: b.custodianId, schoolId: ctx.schoolId }).select('name') : null; if (!t) throw new Fail(422, 'That person is not a teacher in your school.'); return { custodianId: t._id, custodianName: t.name || '' }; }
  return { custodianId: null, custodianName: clean(b.custodianName, 120) };
}
function assetFields(cfg, b, t) {
  const category = (b.category || 'other').toLowerCase(); if (!(category in cfg.assetCategories)) throw new Fail(422, `Choose the kind of asset: ${Object.keys(cfg.assetCategories).join(', ')}.`);
  const cost = num(b.cost ?? 0, 'The cost', { min: 0 }); const salvage = b.salvage === undefined || b.salvage === '' ? 0 : num(b.salvage, 'The scrap value', { min: 0 }); if (salvage > cost) throw new Fail(422, 'The scrap value cannot be more than the cost.');
  const life = b.usefulLifeYears === undefined || b.usefulLifeYears === '' ? cfg.assetCategories[category] : num(b.usefulLifeYears, 'The useful life', { min: 0, max: 100, int: false });
  return { category, cost, salvage, usefulLifeYears: life, capitalizedOn: optDay(b.capitalizedOn, 'the date it was put into use') || t };
}
async function createAsset(ctx, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const name = clean(b.name, 160); if (!name) throw new Fail(422, 'Give the asset a name.'); const t = await S.today(ctx.schoolId); const f = assetFields(cfg, b, t); const c = await custodian(ctx, b);
  const a = await takeTag(ctx, (tag) => PcAsset.create({ schoolId: ctx.schoolId, tag, name, serial: clean(b.serial, 80), notes: clean(b.notes, 300), location: clean(b.location, 120), ...c, ...f, createdByName: ctx.actor.name || '' }));
  await event(ctx, a._id, 'created', '', a.location, 'Added to the register'); return { ...plain(a), belowThreshold: a.cost < cfg.capitalizationThreshold };
}
// Tag what has arrived on an order. Only as many as were received and not tagged yet, so one delivery is never counted twice.
async function tagFromOrder(ctx, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; const n = num(b.count, 'How many', { min: 1, max: 200 });
  const o = oid(b.orderId) ? await PcOrder.findOne({ _id: b.orderId, schoolId: ctx.schoolId }) : null; if (!o) throw new Fail(404, 'That order is not in your school.');
  const l = oid(b.lineId) ? await PcOrderLine.findOne({ _id: b.lineId, orderId: o._id, schoolId: ctx.schoolId }) : null; if (!l) throw new Fail(404, 'That line is not on the order.');
  if (l.receivedQty - l.tagged < n) throw new Fail(409, `Only ${Math.max(0, l.receivedQty - l.tagged)} of “${l.description}” have arrived and are not tagged yet.`, { reason: 'untagged' });
  const cas = await PcOrderLine.updateOne({ _id: l._id, schoolId: ctx.schoolId, tagged: l.tagged, receivedQty: { $gte: l.tagged + n } }, { $inc: { tagged: n } }); if (!cas.matchedCount) throw new Fail(409, 'Someone else tagged this delivery a moment ago. Try again.');
  const t = await S.today(ctx.schoolId); const unit = o.subtotal > 0 ? Math.round(l.unitPrice * o.total / o.subtotal) : l.unitPrice; const f = assetFields(cfg, { ...b, cost: unit }, t); const c = await custodian(ctx, b); const made = [];
  try { for (let i = 0; i < n; i += 1) { const a = await takeTag(ctx, (tag) => PcAsset.create({ schoolId: ctx.schoolId, tag, name: clean(b.name, 160) || l.description, location: clean(b.location, 120), ...c, ...f, orderId: o._id, orderLineId: l._id, projectId: o.projectId || null, fundId: o.fundId || null, poNo: o.poNo, createdByName: ctx.actor.name || '' })); made.push(a); await event(ctx, a._id, 'created', '', a.location, `From ${o.poNo}`); } }
  catch (e) { await PcOrderLine.updateOne({ _id: l._id, schoolId: ctx.schoolId }, { $inc: { tagged: -(n - made.length) } }); throw e; }
  return { added: made.length, assets: made.map(plain) };
}
async function mustAsset(ctx, id) { const a = oid(id) ? await PcAsset.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!a) throw new Fail(404, 'That asset is not in your school.'); return a; }
async function updateAsset(ctx, id, b) {
  const a = await mustAsset(ctx, id); if (['disposed', 'lost'].includes(a.status)) throw new Fail(409, 'A disposed asset cannot be changed.'); const $set = {};
  if (b.name !== undefined) { $set.name = clean(b.name, 160); if (!$set.name) throw new Fail(422, 'Give the asset a name.'); } if (b.serial !== undefined) $set.serial = clean(b.serial, 80); if (b.notes !== undefined) $set.notes = clean(b.notes, 300);
  if (b.status !== undefined) { if (!['in_service', 'in_repair', 'stored'].includes(b.status)) throw new Fail(422, 'The status is in service, in repair or stored.'); if (a.status === 'disposal_requested') throw new Fail(409, 'A disposal is waiting for a decision.'); $set.status = b.status; }
  if (b.usefulLifeYears !== undefined) { $set.usefulLifeYears = num(b.usefulLifeYears, 'The useful life', { min: 0, max: 100, int: false }); }
  if (!Object.keys($set).length) throw new Fail(422, 'Nothing to change.'); await PcAsset.updateOne({ _id: a._id, schoolId: ctx.schoolId }, { $set }); if ($set.status && $set.status !== a.status) await event(ctx, a._id, 'status', a.status, $set.status, clean(b.note, 300)); return { ok: true };
}
async function transfer(ctx, id, b) {
  const a = await mustAsset(ctx, id); if (['disposed', 'lost', 'disposal_requested'].includes(a.status)) throw new Fail(409, 'That asset cannot be moved.'); const $set = {}; const to = [];
  if (b.location !== undefined) { $set.location = clean(b.location, 120); to.push($set.location); } if (b.custodianId !== undefined || b.custodianName !== undefined) { const c = await custodian(ctx, b); Object.assign($set, c); to.push(c.custodianName); }
  if (!Object.keys($set).length) throw new Fail(422, 'Say where it is going or who has it.'); await PcAsset.updateOne({ _id: a._id, schoolId: ctx.schoolId }, { $set });
  await event(ctx, a._id, 'transfer', [a.location, a.custodianName].filter(Boolean).join(' · '), to.filter(Boolean).join(' · '), b.note); return { ok: true };
}
async function requestDisposal(ctx, id, b) {
  const a = await mustAsset(ctx, id); if (!['in_service', 'in_repair', 'stored'].includes(a.status)) throw new Fail(409, a.status === 'disposal_requested' ? 'A disposal is already waiting.' : 'That asset is already gone.');
  const how = ['sale', 'scrap', 'donate', 'write_off', 'lost'].includes(b.how) ? b.how : null; if (!how) throw new Fail(422, 'Choose sale, scrap, donation, write-off or lost.'); const reason = clean(b.reason, 400); if (reason.length < 5) throw new Fail(422, 'Write why the asset is going.');
  const proceeds = b.proceeds === undefined || b.proceeds === '' ? 0 : num(b.proceeds, 'The proceeds', { min: 0 });
  const done = await PcAsset.updateOne({ _id: a._id, schoolId: ctx.schoolId, status: a.status }, { $set: { status: 'disposal_requested', disposal: { prev: a.status, how, reason, proceeds, on: optDay(b.on, 'the date') || await S.today(ctx.schoolId), requestedById: ctx.actor.id, requestedByName: ctx.actor.name || '' } } }); if (!done.matchedCount) throw new Fail(409, 'That asset has just changed.');
  await event(ctx, a._id, 'disposal requested', a.status, how, reason); await S.tellAdmins(ctx.schoolId, 'Asset disposal to approve', `${a.tag} ${a.name}: ${how.replace('_', ' ')} asked for by ${ctx.actor.name || 'a colleague'}.`, '/admin#/purchasing', ctx.actor.id); return { ok: true };
}
async function decideDisposal(ctx, id, { approve, note = '' }) {
  const a = await mustAsset(ctx, id); if (a.status !== 'disposal_requested') throw new Fail(409, 'No disposal is waiting on that asset.'); const alone = await S.separate(ctx, a.disposal.requestedById, 'An asset disposal');
  const dec = { decidedById: ctx.actor.id, decidedByName: ctx.actor.name || '', decidedAt: new Date(), sole: !!alone };
  if (!approve) { if (clean(note, 300).length < 5) throw new Fail(422, 'Write why the disposal is turned down.'); const r = await PcAsset.updateOne({ _id: a._id, schoolId: ctx.schoolId, status: 'disposal_requested' }, { $set: { status: ['in_repair', 'stored'].includes(a.disposal.prev) ? a.disposal.prev : 'in_service', disposal: { ...plain(a.disposal), ...dec } } }); if (!r.matchedCount) throw new Fail(409, 'That has just been decided.'); await event(ctx, a._id, 'disposal turned down', '', '', note); return { ok: true, status: 'rejected' }; }
  const r = await PcAsset.updateOne({ _id: a._id, schoolId: ctx.schoolId, status: 'disposal_requested' }, { $set: { status: a.disposal.how === 'lost' ? 'lost' : 'disposed', disposal: { ...plain(a.disposal), ...dec } } }); if (!r.matchedCount) throw new Fail(409, 'That has just been decided.');
  await event(ctx, a._id, a.disposal.how === 'lost' ? 'lost' : 'disposed', '', a.disposal.how, a.disposal.reason); return { ok: true, status: 'disposed' };
}
const withDep = (a, asOf) => { const o = plain(a); const d = E.depreciation(o, asOf); return { ...o, accumulated: d.accumulated, book: d.book, monthly: d.monthly, monthsHeld: d.months }; };
async function listAssets(schoolId, q) {
  const { limit, skip, page } = S.pg(q); const f = { schoolId }; if (q.status) f.status = q.status; else if (q.active !== '0') f.status = { $nin: ['disposed', 'lost'] }; if (q.category) f.category = q.category; if (q.custodianId && oid(q.custodianId)) f.custodianId = q.custodianId; if (q.location) f.location = new RegExp(esc(q.location), 'i');
  if (q.q) { const re = new RegExp(esc(q.q), 'i'); f.$or = [{ name: re }, { tag: re }, { serial: re }, { location: re }, { custodianName: re }]; }
  const asOf = await S.today(schoolId); const [rows, total] = await Promise.all([PcAsset.find(f).sort({ tag: 1 }).skip(skip).limit(limit), PcAsset.countDocuments(f)]); return { rows: rows.map((a) => withDep(a, asOf)), total, page, limit };
}
async function assetDetail(schoolId, id) {
  const a = oid(id) ? await PcAsset.findOne({ _id: id, schoolId }) : null; if (!a) throw new Fail(404, 'That asset is not in your school.'); const asOf = await S.today(schoolId);
  const [events, tickets] = await Promise.all([PcAssetEvent.find({ schoolId, assetId: a._id }).sort({ createdAt: -1 }).limit(100), PcTicket.find({ schoolId, assetId: a._id }).sort({ createdAt: -1 }).limit(20)]);
  const sched = []; if (a.capitalizedOn && a.usefulLifeYears > 0) for (let y = 0; y <= Math.ceil(a.usefulLifeYears); y += 1) { const on = E.monthAdd(a.capitalizedOn, y * 12); const d = E.depreciation({ ...plain(a), status: 'in_service' }, on); sched.push({ on, accumulated: d.accumulated, book: d.book }); }
  return { asset: withDep(a, asOf), events: events.map(plain), tickets: tickets.map(plain), schedule: sched };
}
async function byTag(schoolId, raw) { const r = E.readTag(raw); if (!r.ok) throw new Fail(422, r.reason === 'check' ? 'The tag was not read correctly. Scan it again.' : 'That is not an asset tag.', { reason: 'scan' }); const a = await PcAsset.findOne({ schoolId, tag: r.code }); if (!a) throw new Fail(404, 'No asset has that tag.'); return assetDetail(schoolId, a._id); }
async function assetLabels(schoolId, { ids, category }) {
  const f = { schoolId, status: { $nin: ['disposed', 'lost'] } }; if (Array.isArray(ids) && ids.length) f._id = { $in: ids.filter(oid).slice(0, 600) }; else if (category) f.category = category; else throw new Fail(422, 'Choose the assets to print labels for.');
  const rows = await PcAsset.find(f).sort({ tag: 1 }).limit(600); return Catalog.labelsPdf(rows.map((a) => ({ top: a.name, sub: [a.location, a.custodianName].filter(Boolean).join(' · '), code: a.tag })), { title: 'Asset tags' });
}

/* ───────── maintenance ───────── */
async function reportTicket(ctx, b) {
  const title = clean(b.title, 160); if (!title) throw new Fail(422, 'Say what is wrong.'); const priority = ['low', 'normal', 'high', 'urgent'].includes(b.priority) ? b.priority : 'normal'; let asset = null;
  if (b.assetTag) { const r = E.readTag(b.assetTag); if (!r.ok) throw new Fail(422, 'That asset tag was not read correctly.'); asset = await PcAsset.findOne({ schoolId: ctx.schoolId, tag: r.code }); if (!asset) throw new Fail(404, 'No asset has that tag.'); }
  const t = await S.numbered(PcTicket, ctx.schoolId, 'ticketNo', 'MT', { title, description: clean(b.description, 800), location: clean(b.location, 120) || asset?.location || '', assetId: asset?._id || null, assetTag: asset?.tag || '', priority, reportedById: ctx.actor.id, reportedByName: ctx.actor.name || '', reportedByRole: ctx.role, trail: [trail(ctx.actor, 'reported')] });
  await S.tellAdmins(ctx.schoolId, priority === 'urgent' || priority === 'high' ? `Maintenance: ${priority} job` : 'Maintenance job reported', `${t.ticketNo}: ${title}${t.location ? ` (${t.location})` : ''}.`, '/admin#/purchasing', ctx.actor.id); return t;
}
async function listTickets(ctx, q, officer) {
  const { limit, skip, page } = S.pg(q); const f = { schoolId: ctx.schoolId }; if (!officer || q.mine === '1') f.reportedById = ctx.actor.id; if (q.status === 'open_all') f.status = { $in: ['open', 'assigned', 'in_progress'] }; else if (q.status) f.status = q.status; if (q.priority) f.priority = q.priority; if (q.assetId && oid(q.assetId)) f.assetId = q.assetId;
  if (q.q) { const re = new RegExp(esc(q.q), 'i'); f.$or = [{ title: re }, { ticketNo: re }, { location: re }]; }
  const [rows, total] = await Promise.all([PcTicket.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), PcTicket.countDocuments(f)]); const t = await S.today(ctx.schoolId);
  return { rows: rows.map((x) => ({ ...plain(x), overdue: !!x.dueOn && x.dueOn < t && ['open', 'assigned', 'in_progress'].includes(x.status) })), total, page, limit };
}
const NEXT = { open: ['assigned', 'in_progress', 'done', 'cancelled'], assigned: ['in_progress', 'done', 'cancelled', 'open'], in_progress: ['done', 'cancelled', 'assigned'], done: ['closed', 'in_progress'], closed: [], cancelled: [] };
async function updateTicket(ctx, id, b) {
  const t = oid(id) ? await PcTicket.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!t) throw new Fail(404, 'That job is not in your school.'); const $set = {};
  if (b.assignedName !== undefined) $set.assignedName = clean(b.assignedName, 120); if (b.priority !== undefined) { if (!['low', 'normal', 'high', 'urgent'].includes(b.priority)) throw new Fail(422, 'Choose a priority.'); $set.priority = b.priority; } if (b.dueOn !== undefined) $set.dueOn = optDay(b.dueOn, 'the due date');
  if (b.cost !== undefined) $set.cost = num(b.cost, 'The cost', { min: 0 }); if (b.vendorId !== undefined && b.vendorId) { const v = oid(b.vendorId) ? await PcVendor.findOne({ _id: b.vendorId, schoolId: ctx.schoolId }) : null; if (!v) throw new Fail(422, 'That supplier is not in your school.'); $set.vendorId = v._id; }
  let note = ''; if (b.status !== undefined && b.status !== t.status) {
    if (!(NEXT[t.status] || []).includes(b.status)) throw new Fail(409, `A job that is ${t.status.replace('_', ' ')} cannot become ${b.status.replace('_', ' ')}.`);
    if (b.status === 'done') { note = clean(b.doneNote, 300); if (note.length < 3) throw new Fail(422, 'Say what was done.'); $set.doneNote = note; $set.doneAt = new Date(); }
    if (b.status === 'cancelled') { note = clean(b.doneNote, 300); if (note.length < 5) throw new Fail(422, 'Write why the job is cancelled.'); $set.doneNote = note; }
    $set.status = b.status;
  } else if ($set.assignedName && t.status === 'open') $set.status = 'assigned';
  if (!Object.keys($set).length) throw new Fail(422, 'Nothing to change.');
  const done = await PcTicket.updateOne({ _id: t._id, schoolId: ctx.schoolId, status: t.status }, { $set, $push: { trail: trail(ctx.actor, $set.status ? `now ${$set.status.replace('_', ' ')}` : 'updated', note) } }); if (!done.matchedCount) throw new Fail(409, 'That job has just changed.');
  if ($set.status === 'done' && t.planKey) { const plan = await PcPlan.findOne({ _id: String(t.planKey).split(':')[0], schoolId: ctx.schoolId }); if (plan) { const tod = await S.today(ctx.schoolId); await PcPlan.updateOne({ _id: plan._id, schoolId: ctx.schoolId, nextDueOn: String(t.planKey).split(':')[1] }, { $set: { lastDoneOn: tod, nextDueOn: E.addDays(tod, plan.everyDays) } }); } }
  if ($set.status === 'done' && t.reportedById && t.reportedByRole !== 'system') await S.tellPerson(ctx.schoolId, t.reportedById, t.reportedByRole === 'admin' ? 'admin' : t.reportedByRole, 'Your maintenance job is done', `${t.ticketNo}: ${t.title}.`, t.reportedByRole === 'admin' ? '/admin#/purchasing' : '/teacher#/purchasing');
  return { ok: true };
}
async function createPlan(ctx, b) {
  const task = clean(b.task, 160); if (!task) throw new Fail(422, 'Say what is to be done.'); const everyDays = num(b.everyDays, 'How often (days)', { min: 1, max: 730 }); let asset = null;
  if (b.assetTag) { const r = E.readTag(b.assetTag); asset = r.ok ? await PcAsset.findOne({ schoolId: ctx.schoolId, tag: r.code }) : null; if (!asset) throw new Fail(422, 'That asset tag is not in your register.'); }
  const nextDueOn = day(b.firstDueOn, 'the first date'); return PcPlan.create({ schoolId: ctx.schoolId, task, assetId: asset?._id || null, assetTag: asset?.tag || '', location: clean(b.location, 120) || asset?.location || '', everyDays, nextDueOn, leadDays: b.leadDays === undefined ? 3 : num(b.leadDays, 'The lead time', { min: 0, max: 60 }), assignedName: clean(b.assignedName, 120), createdByName: ctx.actor.name || '' });
}
async function updatePlan(ctx, id, b) {
  const p = oid(id) ? await PcPlan.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!p) throw new Fail(404, 'That routine is not in your school.'); const $set = {};
  if (b.task !== undefined) { $set.task = clean(b.task, 160); if (!$set.task) throw new Fail(422, 'Say what is to be done.'); } if (b.everyDays !== undefined) $set.everyDays = num(b.everyDays, 'How often (days)', { min: 1, max: 730 }); if (b.active !== undefined) $set.active = !!b.active; if (b.assignedName !== undefined) $set.assignedName = clean(b.assignedName, 120);
  if (b.nextDueOn !== undefined) $set.nextDueOn = day(b.nextDueOn, 'the next date'); if (!Object.keys($set).length) throw new Fail(422, 'Nothing to change.'); await PcPlan.updateOne({ _id: p._id, schoolId: ctx.schoolId }, { $set }); return { ok: true };
}
const listPlans = async (schoolId) => { const t = await S.today(schoolId); const rows = await PcPlan.find({ schoolId }).sort({ nextDueOn: 1 }).limit(300); return { rows: rows.map((p) => ({ ...plain(p), due: p.active && E.addDays(p.nextDueOn, -p.leadDays) <= t, overdue: p.active && p.nextDueOn < t })) }; };

/* ───────── running contracts ───────── */
async function saveContract(ctx, id, b) {
  const cfg = (await S.getCfg(ctx.schoolId)).settings; let c = null; if (id) { c = oid(id) ? await PcContract.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!c) throw new Fail(404, 'That contract is not in your school.'); }
  const doc = {}; const put = (k, v) => { doc[k] = v; };
  if (!c || b.title !== undefined) { const t = clean(b.title, 160); if (!t) throw new Fail(422, 'Give the contract a title.'); put('title', t); }
  if (!c || b.amount !== undefined) put('amount', num(b.amount, 'The amount', { min: 1 })); if (!c || b.frequency !== undefined) { if (!['monthly', 'quarterly', 'yearly'].includes(b.frequency || 'monthly')) throw new Fail(422, 'Choose monthly, quarterly or yearly.'); put('frequency', b.frequency || 'monthly'); }
  if (!c || b.startOn !== undefined) put('startOn', day(b.startOn, 'the start date')); if (b.endOn !== undefined) put('endOn', optDay(b.endOn, 'the end date')); if (doc.endOn && (doc.startOn || c?.startOn) > doc.endOn) throw new Fail(422, 'The contract cannot end before it starts.');
  if (b.kind !== undefined) put('kind', clean(b.kind, 30) || 'other'); if (b.category !== undefined) { if (b.category && !cfg.categories.includes(b.category)) throw new Fail(422, 'Choose a spending category.'); put('category', b.category || 'Utilities'); } if (b.costCentre !== undefined) put('costCentre', clean(b.costCentre, 60));
  if (b.noticeDays !== undefined) put('noticeDays', num(b.noticeDays, 'The notice days', { min: 0, max: 365 })); if (b.reference !== undefined) put('reference', clean(b.reference, 80));
  if (b.vendorId) { const v = oid(b.vendorId) ? await PcVendor.findOne({ _id: b.vendorId, schoolId: ctx.schoolId }) : null; if (!v) throw new Fail(422, 'That supplier is not in your school.'); put('vendorId', v._id); put('vendorName', v.name); }
  if (b.status !== undefined) { if (!['active', 'ended'].includes(b.status)) throw new Fail(422, 'A contract is active or ended.'); put('status', b.status); }
  if (c) { if (!Object.keys(doc).length) throw new Fail(422, 'Nothing to change.'); if (doc.endOn !== undefined) doc.noticedAt = null; await PcContract.updateOne({ _id: c._id, schoolId: ctx.schoolId }, { $set: doc }); return { ok: true }; }
  return PcContract.create({ schoolId: ctx.schoolId, ...doc, createdByName: ctx.actor.name || '' });
}
async function listContracts(schoolId) { const t = await S.today(schoolId); const rows = await PcContract.find({ schoolId }).sort({ status: 1, endOn: 1 }).limit(300); return { rows: rows.map((c) => ({ ...plain(c), endingSoon: c.status === 'active' && !!c.endOn && E.addDays(c.endOn, -c.noticeDays) <= t && c.endOn >= t })) }; }
async function forecast(schoolId, q) {
  const from = q.from || await S.today(schoolId); const to = q.to || E.monthAdd(from, 12); const cs = await PcContract.find({ schoolId, status: 'active' }); const months = {}; let total = 0; const byKind = {};
  for (const c of cs) for (const o of E.occurrences(c, from, to)) { const m = o.on.slice(0, 7); months[m] = (months[m] || 0) + o.amount; total += o.amount; byKind[c.kind] = (byKind[c.kind] || 0) + o.amount; }
  return { from, to, total, months: Object.keys(months).sort().map((m) => ({ month: m, amount: months[m] })), byKind: Object.keys(byKind).map((k) => ({ kind: k, amount: byKind[k] })), contracts: cs.length };
}

/* ───────── reports ───────── */
async function budgetActual(schoolId, q) {
  const cfg = (await S.getCfg(schoolId)).settings; const year = q.year || E.fiscalYear(await S.today(schoolId), cfg.fiscalYearStartMonth); const f = { schoolId, year }; if (q.costCentre) f.costCentre = q.costCentre;
  const lines = await PcBudgetLine.find(f).sort({ costCentre: 1, category: 1 }); const bs = lines.length ? await PcBudget.find({ schoolId, _id: { $in: [...new Set(lines.map((l) => String(l.budgetId)))] } }) : [];
  const rows = lines.map((l) => { const b = bs.find((x) => String(x._id) === String(l.budgetId)); return { costCentre: l.costCentre, category: l.category, status: b?.status || '', amount: l.amount, committed: l.committed, spent: l.spent, available: l.available, usedPercent: l.amount ? Math.round((l.committed + l.spent) * 1000 / l.amount) / 10 : 0 }; });
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0); return { year, rows, totals: { amount: sum('amount'), committed: sum('committed'), spent: sum('spent'), available: sum('available') } };
}
async function fundsReport(schoolId) { const rows = await PcFund.find({ schoolId }).sort({ kind: 1, name: 1 }); return { rows: rows.map(plain), totals: { received: rows.reduce((s, f) => s + f.received, 0), committed: rows.reduce((s, f) => s + f.committed, 0), spent: rows.reduce((s, f) => s + f.spent, 0), available: rows.reduce((s, f) => s + f.available, 0) }, restricted: rows.filter((f) => f.kind !== 'general').reduce((s, f) => s + f.available, 0) }; }
async function pipeline(schoolId) {
  const reqs = await PcRequisition.find({ schoolId }).select('status total'); const orders = await PcOrder.find({ schoolId }).select('status total paidTotal'); const by = (rows, st) => ({ count: rows.filter((r) => r.status === st).length, value: rows.filter((r) => r.status === st).reduce((s, r) => s + r.total, 0) });
  return { requisitions: ['draft', 'submitted', 'approved', 'ordered', 'closed', 'rejected', 'cancelled'].map((s) => ({ status: s, ...by(reqs, s) })), orders: ['issued', 'part_received', 'received', 'closed', 'cancelled'].map((s) => ({ status: s, ...by(orders, s), paid: orders.filter((o) => o.status === s).reduce((a, o) => a + o.paidTotal, 0) })) };
}
async function payables(schoolId) {
  const t = await S.today(schoolId); const rows = await PcInvoice.find({ schoolId, status: { $in: ['entered', 'approved'] } }); const b = { current: 0, d1_30: 0, d31_60: 0, d61_plus: 0, nodue: 0 }; const items = [];
  for (const i of rows) { const late = i.dueOn ? E.daysBetween(i.dueOn, t) : null; const k = late === null ? 'nodue' : late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : 'd61_plus'; b[k] += i.amount; items.push({ ...plain(i), daysLate: late === null ? 0 : Math.max(0, late) }); }
  return { buckets: b, total: rows.reduce((s, i) => s + i.amount, 0), rows: items.sort((x, y) => y.daysLate - x.daysLate) };
}
async function projectsReport(schoolId) { const rows = await PcProject.find({ schoolId }).sort({ createdAt: -1 }); const t = await S.today(schoolId); return { rows: rows.map((p) => ({ _id: p._id, code: p.code, title: p.title, phase: p.phase, proposed: p.proposed, authorized: p.authorized, committed: p.committed, spent: p.spent, available: p.available, overProposed: Math.max(0, p.authorized - p.proposed), milestones: p.milestones.length, milestonesDone: p.milestones.filter((m) => m.done).length, overdue: p.milestones.filter((m) => !m.done && m.dueOn && m.dueOn < t).length })) }; }
async function assetRegister(schoolId, q) {
  const asOf = q.asOf || await S.today(schoolId); const rows = (await PcAsset.find({ schoolId, ...(q.includeGone === '1' ? {} : { status: { $nin: ['disposed', 'lost'] } }) }).sort({ category: 1, tag: 1 }).limit(5000)).map((a) => withDep(a, asOf)); const cats = {};
  for (const a of rows) { const c = cats[a.category] || (cats[a.category] = { category: a.category, count: 0, cost: 0, accumulated: 0, book: 0 }); c.count += 1; c.cost += a.cost; c.accumulated += a.accumulated; c.book += a.book; }
  const totals = Object.values(cats).reduce((s, c) => ({ count: s.count + c.count, cost: s.cost + c.cost, accumulated: s.accumulated + c.accumulated, book: s.book + c.book }), { count: 0, cost: 0, accumulated: 0, book: 0 }); return { asOf, rows, categories: Object.values(cats), totals };
}
async function spendByVendor(schoolId, q) {
  const f = { schoolId, status: 'paid' }; const rows = await PcInvoice.find(f); const m = new Map();
  for (const i of rows) { if (q.from && i.pay?.paidOn < q.from) continue; if (q.to && i.pay?.paidOn > q.to) continue; const v = m.get(String(i.vendorId)) || { vendorId: String(i.vendorId), vendor: i.vendorName, bills: 0, paid: 0 }; v.bills += 1; v.paid += i.amount - i.creditTotal; m.set(String(i.vendorId), v); }
  return { rows: [...m.values()].sort((a, b) => b.paid - a.paid) };
}

/* ───────── what is waiting ───────── */
async function overview(schoolId) {
  const t = await S.today(schoolId); const cfg = (await S.getCfg(schoolId)).settings; const year = E.fiscalYear(t, cfg.fiscalYearStartMonth);
  const [subm, appr, orders, billsIn, billsApproved, overdue, vendorsPending, vars, chgs, proposed, disposals, tickets, plans, ending, assets] = await Promise.all([
    PcRequisition.countDocuments({ schoolId, status: 'submitted' }), PcRequisition.countDocuments({ schoolId, status: 'approved' }), PcOrder.countDocuments({ schoolId, status: { $in: ['issued', 'part_received'] } }),
    PcInvoice.countDocuments({ schoolId, status: 'entered' }), PcInvoice.countDocuments({ schoolId, status: 'approved' }), PcInvoice.countDocuments({ schoolId, status: { $in: ['entered', 'approved'] }, dueOn: { $lt: t, $ne: '' } }),
    PcVendor.countDocuments({ schoolId, 'pendingBank.requestedAt': { $ne: null } }), PcVariation.countDocuments({ schoolId, status: 'requested' }), PcChange.countDocuments({ schoolId, status: 'requested' }), PcProject.countDocuments({ schoolId, phase: 'proposed' }),
    PcAsset.countDocuments({ schoolId, status: 'disposal_requested' }), PcTicket.find({ schoolId, status: { $in: ['open', 'assigned', 'in_progress'] } }).select('priority dueOn'), PcPlan.find({ schoolId, active: true }).select('nextDueOn leadDays'),
    PcContract.find({ schoolId, status: 'active', endOn: { $ne: '' } }).select('endOn noticeDays'), PcAsset.find({ schoolId, status: { $nin: ['disposed', 'lost'] } }),
  ]);
  const b = await budgetActual(schoolId, { year }); const deps = assets.map((a) => E.depreciation(plain(a), t));
  return {
    year, today: t, budget: b.totals,
    waiting: { requestsToApprove: subm, requestsToOrder: appr, ordersToReceive: orders, billsToApprove: billsIn, billsToPay: billsApproved, billsOverdue: overdue, bankChanges: vendorsPending, budgetVariations: vars, changeOrders: chgs, projectsToApprove: proposed, disposals },
    maintenance: { open: tickets.length, urgent: tickets.filter((x) => x.priority === 'urgent' || x.priority === 'high').length, overdue: tickets.filter((x) => x.dueOn && x.dueOn < t).length, plansDue: plans.filter((p) => E.addDays(p.nextDueOn, -p.leadDays) <= t).length },
    contractsEnding: ending.filter((c) => c.endOn >= t && E.addDays(c.endOn, -Math.max(c.noticeDays, 30)) <= t).length,
    assets: { count: assets.length, cost: assets.reduce((s, a) => s + a.cost, 0), book: deps.reduce((s, d) => s + d.book, 0) },
  };
}

/* ───────── the daily sweep ───────── */
async function sweep(schoolId) {
  const t = await S.today(schoolId); const out = { tickets: 0, ended: 0, noticed: 0, summary: false };
  for (const p of await PcPlan.find({ schoolId, active: true })) {
    if (E.addDays(p.nextDueOn, -p.leadDays) > t) continue; const planKey = `${p._id}:${p.nextDueOn}`;
    try { await S.numbered(PcTicket, schoolId, 'ticketNo', 'MT', { title: p.task, description: 'Preventive routine', location: p.location, assetId: p.assetId, assetTag: p.assetTag, planKey, priority: 'normal', dueOn: p.nextDueOn, assignedName: p.assignedName, status: p.assignedName ? 'assigned' : 'open', reportedByName: 'Routine', reportedByRole: 'system', trail: [{ at: new Date(), byName: 'Routine', action: 'opened by the routine' }] }); out.tickets += 1; } catch (e) { if (!S.isDup(e)) throw e; }
  }
  for (const c of await PcContract.find({ schoolId, status: 'active', endOn: { $ne: '' } })) {
    if (c.endOn < t) { await PcContract.updateOne({ _id: c._id, schoolId, status: 'active' }, { $set: { status: 'ended' } }); out.ended += 1; continue; }
    if (!c.noticedAt && E.addDays(c.endOn, -c.noticeDays) <= t) { const done = await PcContract.updateOne({ _id: c._id, schoolId, noticedAt: null }, { $set: { noticedAt: new Date() } }); if (done.matchedCount) { await S.tellAdmins(schoolId, 'A contract is ending', `${c.title} ends on ${c.endOn}. Renew it or find a replacement.`); out.noticed += 1; } }
  }
  const mark = await AppSetting.findOne({ key: `procure-sweep:${schoolId}` }); if (mark?.value?.day !== t) {
    const [late, ms] = await Promise.all([PcInvoice.countDocuments({ schoolId, status: { $in: ['entered', 'approved'] }, dueOn: { $lt: t, $ne: '' } }), PcProject.find({ schoolId, phase: { $in: ['approved', 'building', 'handover'] } }).select('milestones')]);
    const slipped = ms.reduce((s, p) => s + p.milestones.filter((m) => !m.done && m.dueOn && m.dueOn < t).length, 0);
    if (late || slipped) { await S.tellAdmins(schoolId, 'Purchasing: things are late', [late ? `${late} supplier bill(s) are past their due date.` : '', slipped ? `${slipped} project milestone(s) are overdue.` : ''].filter(Boolean).join(' ')); out.summary = true; }
    await AppSetting.updateOne({ key: `procure-sweep:${schoolId}` }, { $set: { value: { day: t } } }, { upsert: true });
  }
  return out;
}

module.exports = { createAsset, tagFromOrder, updateAsset, transfer, requestDisposal, decideDisposal, listAssets, assetDetail, byTag, assetLabels, reportTicket, listTickets, updateTicket, createPlan, updatePlan, listPlans, saveContract, listContracts, forecast, budgetActual, fundsReport, pipeline, payables, projectsReport, assetRegister, spendByVendor, overview, sweep, F };
