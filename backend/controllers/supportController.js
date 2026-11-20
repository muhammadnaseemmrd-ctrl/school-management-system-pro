// Schools asking Aulensia for help, and the owner's inbox (PRD E28). Every case belongs to one school; a school never sees another's.
const S = require('../utils/sales/service'); const SupportCase = require('../models/SupportCase'); const SaaSInvoice = require('../models/SaaSInvoice'); const School = require('../models/School'); const User = require('../models/User'); const SuperAdmin = require('../models/SuperAdmin');
const { notify } = require('../utils/notify'); const N = require('../utils/notify'); const { audit } = require('../utils/audit'); const { getPlansMap } = require('../utils/plans');
const { oid, validId, wrap, bad, clean, cleanBlock, addWorkingHours } = S;
const CATS = ['billing', 'technical', 'how-to', 'data', 'security', 'feature', 'other']; const PRIOS = ['low', 'normal', 'high', 'urgent'];
const page = (q, def = 25) => { const limit = Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 100); const p = Math.max(parseInt(q.page, 10) || 1, 1); return { limit, skip: (p - 1) * limit, p }; };
const ownerName = async (req) => { if (!req.actorName) { const a = await SuperAdmin.findById(req.user.userId).select('name'); req.actorName = (a && a.name) || 'Owner'; } return req.actorName; };

// Paying plans are answered sooner: a paid school's "normal" is treated as one step up
const effectivePriority = (prio, plan) => (plan && plan !== 'free' && prio === 'normal' ? 'normal' : prio);
function deadlines(set, prio, from) { return { first: addWorkingHours(from, set.firstResponseHours[prio]), resolve: addWorkingHours(from, set.resolveHours[prio]) }; }

const view = (c, forOwner) => ({ _id: c._id, number: c.number, schoolId: forOwner ? c.schoolId : undefined, schoolName: forOwner ? c.schoolName : undefined, schoolCode: forOwner ? c.schoolCode : undefined, planSlug: forOwner ? c.planSlug : undefined, openedByName: c.openedByName, openedByEmail: forOwner ? c.openedByEmail : undefined,
  subject: c.subject, category: c.category, priority: c.priority, status: c.status, assigneeName: forOwner ? c.assigneeName : undefined, firstResponseDueAt: c.firstResponseDueAt, firstRespondedAt: c.firstRespondedAt, resolveDueAt: c.resolveDueAt, resolvedAt: c.resolvedAt, closedAt: c.closedAt,
  firstResponseBreached: c.firstResponseBreached, resolveBreached: c.resolveBreached, reopened: c.reopened, rating: c.rating, ratingNote: c.ratingNote, lastMessageAt: c.lastMessageAt, lastFrom: c.lastFrom, createdAt: c.createdAt,
  messages: (c.messages || []).filter((m) => forOwner || !m.internal).map((m) => ({ from: m.from, byName: m.byName, text: m.text, internal: forOwner ? m.internal : undefined, at: m.at })) });
const row = (c, forOwner) => { const v = view(c, forOwner); v.messageCount = v.messages.length; delete v.messages; return v; };

/* ───────────── the school's side ───────────── */
exports.schoolList = wrap('schoolList', async (req, res) => {
  const { limit, skip, p } = page(req.query); const f = { schoolId: oid(req.user.schoolId) }; if (['Open', 'WaitingOnSchool', 'Resolved', 'Closed'].includes(req.query.status)) f.status = req.query.status;
  const [rows, total] = await Promise.all([SupportCase.find(f).select('-messages').sort({ lastMessageAt: -1 }).skip(skip).limit(limit), SupportCase.countDocuments(f)]);
  res.json({ cases: rows.map((c) => row(c, false)), pagination: { total, pages: Math.ceil(total / limit), currentPage: p } });
});
exports.schoolOpen = wrap('schoolOpen', async (req, res) => {
  const b = req.body || {}; const subject = clean(b.subject, 160); const text = cleanBlock(b.message, 4000);
  if (subject.length < 4) return bad(res, 422, 'Give the problem a short title (at least 4 characters).'); if (text.length < 10) return bad(res, 422, 'Please describe the problem (at least 10 characters).');
  const category = CATS.includes(b.category) ? b.category : 'other'; const prio = PRIOS.includes(b.priority) ? b.priority : 'normal'; const clientKey = b.clientKey ? String(b.clientKey).slice(0, 60) : undefined;
  // a double click or a retry with the same key is one case
  if (clientKey) { const dup = await SupportCase.findOne({ schoolId: oid(req.user.schoolId), clientKey }); if (dup) return res.status(200).json({ case: view(dup, false), duplicate: true }); }
  const open = await SupportCase.countDocuments({ schoolId: oid(req.user.schoolId), status: { $in: ['Open', 'WaitingOnSchool'] } }); if (open >= 20) return bad(res, 429, 'You already have 20 open cases. Please wait for some to be resolved.');
  const school = await School.findById(req.user.schoolId).select('name code plan'); const u = await User.findById(req.user.userId).select('name email'); const set = await S.settings(); const now = new Date(); const d = deadlines(set, prio, now);
  let c; try { c = await SupportCase.create({ number: await S.nextNumber('SUP'), schoolId: school._id, schoolName: school.name, schoolCode: school.code, planSlug: school.plan, openedBy: oid(req.user.userId), openedByName: (u && u.name) || '', openedByEmail: (u && u.email) || '', subject, category, priority: prio, messages: [{ from: 'school', byName: (u && u.name) || '', text }], firstResponseDueAt: d.first, resolveDueAt: d.resolve, lastMessageAt: now, lastFrom: 'school', clientKey }); }
  catch (e) { if (e.code === 11000 && clientKey) { c = await SupportCase.findOne({ schoolId: oid(req.user.schoolId), clientKey }); return res.status(200).json({ case: view(c, false), duplicate: true }); } throw e; }
  await audit(req, { action: 'support.open', entityType: 'SupportCase', entityId: c._id, schoolId: school._id, detail: { number: c.number, priority: prio } }); res.status(201).json({ case: view(c, false) });
});
async function schoolCase(req, res) { if (!validId(req.params.id)) { bad(res, 404, 'Case not found'); return null; } const c = await SupportCase.findOne({ _id: oid(req.params.id), schoolId: oid(req.user.schoolId) }); if (!c) { bad(res, 404, 'Case not found'); return null; } return c; }
exports.schoolGet = wrap('schoolGet', async (req, res) => { const c = await schoolCase(req, res); if (!c) return; res.json({ case: view(c, false) }); });
exports.schoolReply = wrap('schoolReply', async (req, res) => {
  const c = await schoolCase(req, res); if (!c) return; if (c.status === 'Closed') return bad(res, 409, 'This case is closed. Open a new one.'); const text = cleanBlock(req.body && req.body.message, 4000); if (text.length < 2) return bad(res, 422, 'Please write a message.');
  const u = await User.findById(req.user.userId).select('name'); const now = new Date(); const set = {}; let reopen = false;
  // an answer from the school restarts the clock that stopped while we waited on them
  if (c.status === 'WaitingOnSchool') { set.status = 'Open'; if (c.waitingSince) { const paused = now - new Date(c.waitingSince); set.pausedMs = (c.pausedMs || 0) + paused; if (c.resolveDueAt) set.resolveDueAt = new Date(new Date(c.resolveDueAt).getTime() + paused); } set.waitingSince = null; }
  if (c.status === 'Resolved') { const cfg = await S.settings(); const d = deadlines(cfg, c.priority, now); Object.assign(set, { status: 'Open', resolvedAt: null, resolveDueAt: d.resolve, resolveBreached: false, firstResponseDueAt: d.first, reopened: (c.reopened || 0) + 1 }); reopen = true; }
  Object.assign(set, { lastMessageAt: now, lastFrom: 'school' });
  await SupportCase.updateOne({ _id: c._id }, { $set: set, $push: { messages: { from: 'school', byName: (u && u.name) || '', text, internal: false, at: now } } });
  res.json({ case: view(await SupportCase.findById(c._id), false), reopened: reopen });
});
exports.schoolResolve = wrap('schoolResolve', async (req, res) => {
  const c = await schoolCase(req, res); if (!c) return; if (['Resolved', 'Closed'].includes(c.status)) return res.json({ case: view(c, false) }); const now = new Date();
  await SupportCase.updateOne({ _id: c._id }, { $set: { status: 'Resolved', resolvedAt: now, resolveBreached: c.resolveDueAt && now > new Date(c.resolveDueAt) ? true : c.resolveBreached, waitingSince: null } }); res.json({ case: view(await SupportCase.findById(c._id), false) });
});
exports.schoolRate = wrap('schoolRate', async (req, res) => {
  const c = await schoolCase(req, res); if (!c) return; if (!['Resolved', 'Closed'].includes(c.status)) return bad(res, 409, 'You can rate a case once it is resolved.'); const r = Math.round(Number(req.body && req.body.rating)); if (!(r >= 1 && r <= 5)) return bad(res, 422, 'Choose 1 to 5 stars.');
  await SupportCase.updateOne({ _id: c._id }, { $set: { rating: r, ratingNote: clean(req.body.note, 300) } }); res.json({ case: view(await SupportCase.findById(c._id), false) });
});
exports.schoolInvoices = wrap('schoolInvoices', async (req, res) => {
  const { invoiceView } = require('./salesController'); const rows = await SaaSInvoice.find({ schoolId: oid(req.user.schoolId), status: { $ne: 'Void' } }).sort({ issuedAt: -1 }).limit(50); const s = await S.settings();
  res.json({ invoices: rows.map(invoiceView), payment: rows.some((i) => i.status === 'Issued') ? { bankName: s.bankName, accountTitle: s.accountTitle, accountNumber: s.accountNumber, iban: s.iban, jazzcash: s.jazzcash, easypaisa: s.easypaisa, note: s.paymentNote } : null });
});

/* ───────────── the owner's inbox ───────────── */
exports.ownerList = wrap('ownerList', async (req, res) => {
  const { limit, skip, p } = page(req.query); const f = {}; if (['Open', 'WaitingOnSchool', 'Resolved', 'Closed'].includes(req.query.status)) f.status = req.query.status; else if (req.query.status === 'active') f.status = { $in: ['Open', 'WaitingOnSchool'] };
  if (PRIOS.includes(req.query.priority)) f.priority = req.query.priority; if (validId(req.query.schoolId)) f.schoolId = oid(req.query.schoolId); if (req.query.breached === '1') f.$or = [{ firstResponseBreached: true }, { resolveBreached: true }];
  const [rows, total] = await Promise.all([SupportCase.find(f).select('-messages').sort({ status: 1, firstResponseDueAt: 1, lastMessageAt: -1 }).skip(skip).limit(limit), SupportCase.countDocuments(f)]);
  const now = Date.now(); res.json({ cases: rows.map((c) => ({ ...row(c, true), firstResponseOverdue: !c.firstRespondedAt && c.status === 'Open' && c.firstResponseDueAt && new Date(c.firstResponseDueAt).getTime() < now })), pagination: { total, pages: Math.ceil(total / limit), currentPage: p } });
});
exports.ownerStats = wrap('ownerStats', async (req, res) => {
  const all = await SupportCase.find({ createdAt: { $gte: new Date(Date.now() - 90 * 86400000) } }).select('status firstRespondedAt firstResponseDueAt firstResponseBreached resolveBreached rating createdAt resolvedAt');
  const answered = all.filter((c) => c.firstRespondedAt); const within = answered.filter((c) => !c.firstResponseBreached).length; const done = all.filter((c) => ['Resolved', 'Closed'].includes(c.status)); const rated = all.filter((c) => c.rating);
  res.json({ open: all.filter((c) => c.status === 'Open').length, waiting: all.filter((c) => c.status === 'WaitingOnSchool').length, breached: all.filter((c) => c.firstResponseBreached || c.resolveBreached).length, firstResponseOnTimePct: answered.length ? Math.round((within / answered.length) * 100) : null, resolved90d: done.length, avgRating: rated.length ? Math.round((rated.reduce((n, c) => n + c.rating, 0) / rated.length) * 10) / 10 : null });
});
async function anyCase(req, res) { if (!validId(req.params.id)) { bad(res, 404, 'Case not found'); return null; } const c = await SupportCase.findById(req.params.id); if (!c) { bad(res, 404, 'Case not found'); return null; } return c; }
exports.ownerGet = wrap('ownerGet', async (req, res) => { const c = await anyCase(req, res); if (!c) return; res.json({ case: view(c, true) }); });
exports.ownerReply = wrap('ownerReply', async (req, res) => {
  const c = await anyCase(req, res); if (!c) return; if (c.status === 'Closed') return bad(res, 409, 'This case is closed.'); const text = cleanBlock(req.body && req.body.message, 4000); if (text.length < 2) return bad(res, 422, 'Please write a message.');
  const internal = req.body.internal === true; const by = await ownerName(req); const now = new Date(); const set = { lastMessageAt: now };
  if (!internal) {
    set.lastFrom = 'owner';
    if (!c.firstRespondedAt) { set.firstRespondedAt = now; set.firstResponseBreached = c.firstResponseBreached || (c.firstResponseDueAt && now > new Date(c.firstResponseDueAt)) || false; }
    // waiting on the school stops the resolution clock until they answer
    if (req.body.waitForSchool === true && c.status === 'Open') { set.status = 'WaitingOnSchool'; set.waitingSince = now; }
  }
  await SupportCase.updateOne({ _id: c._id }, { $set: set, $push: { messages: { from: 'owner', byName: by, text, internal, at: now } } });
  if (!internal) await notify({ schoolId: c.schoolId, recipients: await N.admins(c.schoolId), title: `Reply on ${c.number}`, body: c.subject, link: '#/saasSupport', type: 'support', key: `support:${c._id}:${now.getTime()}` });
  await audit(req, { action: internal ? 'support.note' : 'support.reply', entityType: 'SupportCase', entityId: c._id, schoolId: c.schoolId, detail: { number: c.number } }); res.json({ case: view(await SupportCase.findById(c._id), true) });
});
exports.ownerUpdate = wrap('ownerUpdate', async (req, res) => {
  const c = await anyCase(req, res); if (!c) return; const b = req.body || {}; const set = {}; const now = new Date(); const by = await ownerName(req);
  if (b.priority !== undefined) { if (!PRIOS.includes(b.priority)) return bad(res, 422, 'Unknown priority.'); if (b.priority !== c.priority) { const cfg = await S.settings(); const d = deadlines(cfg, b.priority, new Date(c.createdAt)); set.priority = b.priority; if (!c.firstRespondedAt) set.firstResponseDueAt = d.first; set.resolveDueAt = new Date(d.resolve.getTime() + (c.pausedMs || 0)); } }
  if (b.assigneeName !== undefined) set.assigneeName = clean(b.assigneeName, 80);
  if (b.status !== undefined && b.status !== c.status) {
    if (!['Open', 'WaitingOnSchool', 'Resolved', 'Closed'].includes(b.status)) return bad(res, 422, 'Unknown status.');
    if (b.status === 'Closed' && c.status !== 'Resolved') return bad(res, 409, 'Resolve a case before closing it.');
    if (b.status === 'WaitingOnSchool') { set.waitingSince = now; } else if (c.status === 'WaitingOnSchool' && c.waitingSince) { const paused = now - new Date(c.waitingSince); set.pausedMs = (c.pausedMs || 0) + paused; set.waitingSince = null; if (c.resolveDueAt) set.resolveDueAt = new Date(new Date(c.resolveDueAt).getTime() + paused); }
    if (b.status === 'Resolved') { set.resolvedAt = now; if (c.resolveDueAt && now > new Date(c.resolveDueAt)) set.resolveBreached = true; } if (b.status === 'Closed') set.closedAt = now; if (b.status === 'Open' && ['Resolved', 'Closed'].includes(c.status)) { set.reopened = (c.reopened || 0) + 1; set.resolvedAt = null; set.closedAt = null; }
    set.status = b.status;
  }
  if (!Object.keys(set).length) return res.json({ case: view(c, true) }); await SupportCase.updateOne({ _id: c._id }, { $set: set, $push: { messages: { from: 'owner', byName: by, text: `Changed: ${Object.keys(set).filter((k) => ['status', 'priority', 'assigneeName'].includes(k)).map((k) => `${k} to ${set[k]}`).join(', ') || 'details'}`, internal: true, at: now } } });
  if (set.status === 'Resolved') await notify({ schoolId: c.schoolId, recipients: await N.admins(c.schoolId), title: `${c.number} was marked resolved`, body: c.subject, link: '#/saasSupport', type: 'support', key: `support:${c._id}:resolved:${now.getTime()}` });
  res.json({ case: view(await SupportCase.findById(c._id), true) });
});

/* ───────────── daily housekeeping: flag breaches once, close what has been quiet ───────────── */
exports.sweep = async () => {
  const now = new Date(); let flagged = 0; let closed = 0;
  const late1 = await SupportCase.find({ status: 'Open', firstRespondedAt: null, firstResponseBreached: false, firstResponseDueAt: { $lt: now } }); for (const c of late1) { const r = await SupportCase.updateOne({ _id: c._id, firstResponseBreached: false }, { $set: { firstResponseBreached: true } }); flagged += r.modifiedCount || 0; }
  const late2 = await SupportCase.find({ status: 'Open', resolveBreached: false, resolveDueAt: { $lt: now } }); for (const c of late2) { const r = await SupportCase.updateOne({ _id: c._id, resolveBreached: false }, { $set: { resolveBreached: true } }); flagged += r.modifiedCount || 0; }
  const quiet = await SupportCase.find({ status: 'Resolved', resolvedAt: { $lt: S.addDays(now, -7) } }); for (const c of quiet) { const r = await SupportCase.updateOne({ _id: c._id, status: 'Resolved' }, { $set: { status: 'Closed', closedAt: now } }); closed += r.modifiedCount || 0; }
  return { flagged, closed };
};
