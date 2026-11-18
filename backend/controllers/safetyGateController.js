// Gate, visitors, contractors, gate log, guard logbook and handover (PRD E09).
//   403 not allowed (incl. approving your own request) · 404 not in this school / not yours · 409 already done · 422 not possible in this state
const mongoose = require('../lib/pgdoc');
const S = require('../utils/safety');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const { can } = require('../utils/permissions');
const AppSetting = require('../models/AppSetting');
const School = require('../models/School');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const User = require('../models/User');
const Parent = require('../models/Parent');
const Class = require('../models/Class');
const GuardianLink = require('../models/GuardianLink');
const VisitorVisit = require('../models/VisitorVisit');
const ContractorPass = require('../models/ContractorPass');
const GateEntry = require('../models/GateEntry');
const GateLogItem = require('../models/GateLogItem');
const GateHandover = require('../models/GateHandover');
const AttendanceDevice = require('../models/AttendanceDevice');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = S.clean;
const pg = (q) => ({ p: Math.max(1, parseInt(q.page, 10) || 1), l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)) });
const sidOf = (req) => req.user.schoolId;
const date = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const hours = (d, h) => new Date(d.getTime() + h * 3600 * 1000);
const operator = async (req) => (await can(req.user, 'safety.gate.operate')).allowed;
const DENY = 'Do not admit this person. Ask them to wait and call the principal.';
exports.operator = operator;

const shapeVisit = (v, { desk = false, mine = false } = {}) => ({
  _id: v._id, visitorName: v.visitorName, phone: desk || mine ? v.phone : '', organisation: v.organisation, kind: v.kind, purpose: v.purpose,
  hostType: v.hostType, hostId: v.hostId, hostName: v.hostName, studentId: v.studentId, expectedFrom: v.expectedFrom, expectedTo: v.expectedTo, walkIn: v.walkIn, status: v.status,
  createdByName: v.createdByName, createdByRole: v.createdByRole, createdById: v.createdById, decidedByName: v.decidedByName, decidedAt: v.decidedAt, decisionNote: v.decisionNote,
  receptionOverride: v.receptionOverride, overrideReason: desk ? v.overrideReason : undefined, inviteLive: !!v.tokenHash && !!v.tokenExpiresAt && new Date(v.tokenExpiresAt) > new Date(), tokenExpiresAt: v.tokenExpiresAt,
  idType: desk ? v.idType : undefined, idLast4: desk ? v.idLast4 : undefined, idChecked: v.idChecked, idRedacted: !!v.idRedactedAt,
  checkInAt: v.checkInAt, checkInMethod: v.checkInMethod, checkInByName: v.checkInByName, manualReason: desk ? v.manualReason : undefined, checkOutAt: v.checkOutAt, checkOutByName: v.checkOutByName, gate: v.gate,
  badge: v.badge?.number ? { number: v.badge.number, zones: v.badge.zones, expiresAt: v.badge.expiresAt, printedCount: v.badge.printedCount } : null,
  overstay: v.status === 'CheckedIn' && !!v.overstayFlaggedAt, createdAt: v.createdAt,
});

/* ───────── policy ───────── */
exports.getSettings = async (req, res) => { try { res.json({ settings: await S.getSettings(sidOf(req)), idTypes: S.ID_TYPES, zones: S.ZONES }); } catch (e) { fail(res, e); } };
exports.putSettings = async (req, res) => {
  try {
    const b = req.body || {}; const cur = await S.getSettings(sidOf(req)); const next = { ...cur };
    const nums = { inviteHours: [1, 168], idRetentionDays: [0, 365], badgeHours: [1, 24], maxVisitHours: [1, 24], contractorMaxHours: [1, 72], handoverAcceptMinutes: [5, 240], familyFallbackMinutes: [1, 60] };
    for (const [k, [lo, hi]] of Object.entries(nums)) if (b[k] !== undefined) { const n = Number(b[k]); if (!Number.isInteger(n) || n < lo || n > hi) return res.status(400).json({ message: `${k} must be a whole number from ${lo} to ${hi}.` }); next[k] = n; }
    for (const k of ['requireId', 'walkInAllowed', 'notifyOnPickup']) if (b[k] !== undefined) next[k] = !!b[k];
    if (b.gates !== undefined) {
      const g = (Array.isArray(b.gates) ? b.gates : []).map((x) => str(x, 40)).filter(Boolean);
      if (!g.length || g.length > 12 || new Set(g.map((x) => x.toLowerCase())).size !== g.length) return res.status(400).json({ message: 'Name one to twelve different gates.' });
      next.gates = g;
    }
    await AppSetting.updateOne({ key: `safety:${sidOf(req)}` }, { $set: { value: next } }, { upsert: true });
    await audit(req, { action: 'safety.settings', entityType: 'AppSetting', entityId: 'safety', schoolId: sidOf(req), detail: { before: cur, after: next } });
    res.json({ settings: next });
  } catch (e) { fail(res, e); }
};

/* ───────── housekeeping: expire, flag, redact ───────── */
async function housekeeping(schoolId) {
  const sid = S.oid(schoolId); const now = new Date(); const st = await S.getSettings(schoolId); let expired = 0; let flagged = 0; let redacted = 0;
  const stale = await VisitorVisit.find({ schoolId: sid, status: { $in: ['Requested', 'Approved'] }, expectedTo: { $lt: now } }).limit(500);
  for (const v of stale) { const r = await VisitorVisit.updateOne({ _id: v._id, status: v.status }, { $set: { status: 'Expired', tokenHash: '' } }); expired += r.modifiedCount || 0; }
  const day = await S.today(schoolId);
  const PickupAuthorization = require('../models/PickupAuthorization');
  const oldAuth = await PickupAuthorization.find({ schoolId: sid, status: 'Active', day: { $lt: day } }).limit(500);
  for (const a of oldAuth) { await PickupAuthorization.updateOne({ _id: a._id, status: 'Active' }, { $set: { status: 'Expired' } }); expired++; }
  const inside = await VisitorVisit.find({ schoolId: sid, status: 'CheckedIn', overstayFlaggedAt: null }).limit(500);
  for (const v of inside) {
    const limit = Math.min(hours(v.checkInAt, st.maxVisitHours).getTime(), v.badge?.expiresAt ? new Date(v.badge.expiresAt).getTime() : Infinity);
    if (limit < now.getTime()) {
      const r = await VisitorVisit.updateOne({ _id: v._id, overstayFlaggedAt: null }, { $set: { overstayFlaggedAt: now } });
      if (r.modifiedCount) { flagged++; await N.notify({ schoolId, recipients: await N.admins(schoolId), title: 'Visitor still on campus', body: `${v.visitorName} (badge ${v.badge?.number}) is past the allowed time.`, type: 'safety', key: `overstay:${v._id}`, link: { admin: '/admin?tab=safetyDesk' } }); }
    }
  }
  if (st.idRetentionDays >= 0) {
    const cutoff = new Date(now.getTime() - st.idRetentionDays * 86400000);
    const rows = await VisitorVisit.find({ schoolId: sid, idRedactedAt: null, idType: { $ne: '' }, createdAt: { $lt: cutoff }, status: { $in: ['CheckedOut', 'Refused', 'Expired', 'Cancelled', 'Declined'] } }).limit(500);
    for (const v of rows) { await VisitorVisit.updateOne({ _id: v._id }, { $set: { idType: '', idLast4: '', idRedactedAt: now } }); redacted++; }
  }
  return { expired, flagged, redacted };
}
exports.housekeeping = housekeeping;

/* ───────── visits ───────── */
async function issueInvite(v, st) {
  const token = S.newToken(); const now = new Date();
  v.tokenHash = S.sha(token); v.tokenIssuedAt = now; v.tokenExpiresAt = new Date(Math.min(hours(now, st.inviteHours).getTime(), new Date(v.expectedTo).getTime()));
  await v.save(); return { inviteCode: S.codeFor('visitor', v._id, token), expiresAt: v.tokenExpiresAt };
}

exports.createVisit = async (req, res) => {
  try {
    const sid = sidOf(req); const b = req.body || {}; const me = await S.actor(req); const st = await S.getSettings(sid); const desk = req.user.role === 'admin';
    const name = str(b.visitorName, 80) || (req.user.role === 'parent' ? me.name : ''); const purpose = str(b.purpose, 200);
    if (!name) return res.status(400).json({ message: 'Enter the visitor\'s name.' });
    if (purpose.length < 3) return res.status(400).json({ message: 'Say why the visitor is coming.' });
    const kind = ['Parent', 'Guest', 'Vendor', 'Official', 'Interview'].includes(b.kind) ? b.kind : 'Guest';
    const walkIn = desk && b.walkIn === true;
    if (walkIn && !st.walkInAllowed) return res.status(422).json({ message: 'This school does not accept walk-in visitors. Ask the visitor to be invited by their host.' });
    const now = new Date(); let from = walkIn ? now : date(b.expectedFrom); let to = walkIn ? hours(now, st.maxVisitHours) : date(b.expectedTo);
    if (!from || !to) return res.status(400).json({ message: 'Choose when the visitor is expected.' });
    if (to <= from) return res.status(400).json({ message: 'The visit must end after it starts.' });
    if (to.getTime() - from.getTime() > 24 * 3600 * 1000) return res.status(400).json({ message: 'A single visit can last at most one day.' });
    if (to < now) return res.status(400).json({ message: 'That time has already passed.' });
    const row = { schoolId: sid, visitorName: name, phone: str(b.phone, 30), organisation: str(b.organisation, 80), kind, purpose, expectedFrom: from, expectedTo: to, walkIn, createdByRole: me.role, createdById: me.id, createdByName: me.name };
    if (await S.barredFromCampus(sid, { name })) {
      await audit(req, { action: 'safety.visit.blocked', entityType: 'VisitorVisit', schoolId: sid, detail: { name, stage: 'create' } });
      return res.status(403).json({ message: 'This visit cannot be arranged. Please contact the school office.' });
    }
    // who hosts
    if (req.user.role === 'teacher') { Object.assign(row, { hostType: 'teacher', hostId: me.id, hostName: me.name, status: 'Approved', decidedByName: me.name, decidedById: me.id, decidedAt: now, decisionNote: 'Host created the visit' }); }
    else if (req.user.role === 'parent') {
      if (!isId(b.studentId)) return res.status(400).json({ message: 'Choose which child the visit is about.' });
      if (!(await S.familyKids(sid, me.id, 'viewInfo')).includes(String(b.studentId))) return res.status(404).json({ message: 'Child not found.' });
      row.studentId = b.studentId; row.parentId = me.id; row.kind = 'Parent'; row.visitorName = me.name || name;
      const stu = await Student.findOne({ _id: b.studentId, schoolId: sid }).select('classId');
      if (b.hostId && b.hostType === 'teacher') {
        const cls = stu?.classId ? await Class.findOne({ _id: stu.classId, schoolId: sid }).select('classTeacherId') : null;
        if (!cls || String(cls.classTeacherId) !== String(b.hostId)) return res.status(422).json({ message: 'You can ask to meet your child\'s class teacher or the school office.' });
        const t = await Teacher.findById(b.hostId).select('name'); Object.assign(row, { hostType: 'teacher', hostId: t._id, hostName: t.name });
      } else Object.assign(row, { hostType: 'office', hostName: 'School office' });
      row.status = 'Requested';
    } else {
      // admin / reception names the host
      if (b.hostType === 'teacher' && isId(b.hostId)) { const t = await Teacher.findOne({ _id: b.hostId, schoolId: sid }).select('name'); if (!t) return res.status(404).json({ message: 'Host not found.' }); Object.assign(row, { hostType: 'teacher', hostId: t._id, hostName: t.name }); }
      else if (b.hostType === 'admin' && isId(b.hostId)) { const u = await User.findOne({ _id: b.hostId, schoolId: sid, role: 'admin' }).select('name'); if (!u) return res.status(404).json({ message: 'Host not found.' }); Object.assign(row, { hostType: 'admin', hostId: u._id, hostName: u.name }); }
      else Object.assign(row, { hostType: 'office', hostName: 'School office' });
      if (row.hostType === 'admin' && String(row.hostId) === String(me.id)) Object.assign(row, { status: 'Approved', decidedById: me.id, decidedByName: me.name, decidedAt: now, decisionNote: 'Host created the visit' });
      else row.status = 'Requested';
    }
    const v = await VisitorVisit.create(row);
    let invite = null; if (v.status === 'Approved') invite = await issueInvite(v, st);
    else {
      const to2 = v.hostType === 'teacher' ? [{ id: v.hostId, role: 'teacher' }] : v.hostType === 'admin' ? [{ id: v.hostId, role: 'admin' }] : await N.admins(sid);
      await N.notify({ schoolId: sid, recipients: to2, exclude: me.id, title: 'A visit needs your approval', body: `${v.visitorName}: ${v.purpose}`, type: 'safety', key: `visitreq:${v._id}`, link: { admin: '/admin?tab=safetyDesk', teacher: '/teacher?tab=safetyDesk' } });
    }
    await audit(req, { action: 'safety.visit.create', entityType: 'VisitorVisit', entityId: v._id, schoolId: sid, detail: { visitor: v.visitorName, kind: v.kind, host: v.hostName, walkIn, status: v.status } });
    res.status(201).json({ visit: shapeVisit(v, { desk, mine: true }), ...(invite || {}) });
  } catch (e) { fail(res, e); }
};

async function visitFor(req, id, { need = 'see' } = {}) {
  if (!isId(id)) return null;
  const v = await VisitorVisit.findOne({ _id: id, schoolId: sidOf(req) });
  if (!v) return null;
  const op = await operator(req);
  if (op) return v;
  const mine = String(v.createdById) === String(req.user.userId) || (v.hostId && String(v.hostId) === String(req.user.userId));
  return mine ? v : null;
}

exports.listVisits = async (req, res) => {
  try {
    const sid = sidOf(req); const { p, l } = pg(req.query); const q = { schoolId: sid }; const op = await operator(req);
    if (!op) q.$or = [{ createdById: req.user.userId }, { hostId: req.user.userId }];
    if (req.query.status) q.status = { $in: String(req.query.status).split(',').filter(Boolean) };
    if (req.query.day) { const d0 = date(`${req.query.day}T00:00:00.000Z`); if (d0) { q.expectedFrom = { $lt: new Date(d0.getTime() + 86400000 + 12 * 3600000) }; q.expectedTo = { $gte: new Date(d0.getTime() - 12 * 3600000) }; } }
    if (req.query.q) { const re = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 40), 'i'); q.visitorName = re; }
    const [rows, total] = await Promise.all([VisitorVisit.find(q).sort({ expectedFrom: -1, _id: -1 }).skip((p - 1) * l).limit(l), VisitorVisit.countDocuments(q)]);
    res.json({ visits: rows.map((v) => shapeVisit(v, { desk: op, mine: true })), pagination: { total, page: p, currentPage: p, pages: Math.ceil(total / l) || 1, totalPages: Math.ceil(total / l) || 1 } });
  } catch (e) { fail(res, e); }
};
exports.getVisit = async (req, res) => {
  try { const v = await visitFor(req, req.params.id); if (!v) return res.status(404).json({ message: 'Visit not found' }); res.json({ visit: shapeVisit(v, { desk: await operator(req), mine: true }) }); } catch (e) { fail(res, e); }
};

// The host approves or declines. The person who arranged a visit cannot approve it, except reception on a walk-in with a written reason.
exports.decideVisit = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {};
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Visit not found' });
    const v = await VisitorVisit.findOne({ _id: req.params.id, schoolId: sid });
    if (!v) return res.status(404).json({ message: 'Visit not found' });
    const isHost = v.hostId && String(v.hostId) === String(me.id) && req.user.role === v.hostType;
    const isAdmin = req.user.role === 'admin';
    if (!isHost && !isAdmin) return res.status(404).json({ message: 'Visit not found' });
    if (v.status !== 'Requested') return res.status(409).json({ message: `This visit is already ${v.status.toLowerCase()}.` });
    const decision = b.decision === 'approve' ? 'approve' : b.decision === 'decline' ? 'decline' : null;
    if (!decision) return res.status(400).json({ message: 'Choose approve or decline.' });
    const note = str(b.note, 200); let override = false;
    if (String(v.createdById) === String(me.id)) {
      if (decision === 'approve') {
        if (!(v.walkIn && isAdmin && b.override === true && note.length >= 10)) return res.status(403).json({ message: 'Someone else has to approve a visit you arranged. For a walk-in the host cannot reach, reception can approve it with a written reason.' });
        override = true;
      }
    }
    const next = decision === 'approve' ? 'Approved' : 'Declined';
    const done = await VisitorVisit.updateOne({ _id: v._id, status: 'Requested' }, { $set: { status: next, decidedById: me.id, decidedByName: me.name, decidedAt: new Date(), decisionNote: note, receptionOverride: override, overrideReason: override ? note : '' } });
    if (!done.modifiedCount) return res.status(409).json({ message: 'Someone else just decided this visit.' });
    await audit(req, { action: override ? 'safety.visit.override' : `safety.visit.${decision}`, entityType: 'VisitorVisit', entityId: v._id, schoolId: sid, detail: { visitor: v.visitorName, note } });
    if (v.createdById && String(v.createdById) !== String(me.id)) await N.notify({ schoolId: sid, recipients: [{ id: v.createdById, role: v.createdByRole }], title: `Visit ${next.toLowerCase()}`, body: `${v.visitorName}: ${note || v.purpose}`, type: 'safety', key: `visitdec:${v._id}`, link: { admin: '/admin?tab=safetyDesk', teacher: '/teacher?tab=safetyDesk', parent: '/parent?tab=desk' } });
    if (override) await N.notify({ schoolId: sid, recipients: await N.admins(sid), exclude: me.id, title: 'Reception approved a walk-in without the host', body: `${v.visitorName}: ${note}`, type: 'safety', key: `visitovr:${v._id}` });
    res.json({ visit: shapeVisit(await VisitorVisit.findById(v._id), { desk: await operator(req), mine: true }) });
  } catch (e) { fail(res, e); }
};

// A fresh invitation code. Earlier codes stop working. Shown once.
exports.invite = async (req, res) => {
  try {
    const v = await visitFor(req, req.params.id); if (!v) return res.status(404).json({ message: 'Visit not found' });
    if (v.status !== 'Approved') return res.status(422).json({ message: v.status === 'Requested' ? 'The host has not approved this visit yet.' : `A ${v.status.toLowerCase()} visit has no invitation.` });
    if (new Date(v.expectedTo) < new Date()) return res.status(422).json({ message: 'The visit window has ended.' });
    const out = await issueInvite(v, await S.getSettings(sidOf(req)));
    await audit(req, { action: 'safety.visit.invite', entityType: 'VisitorVisit', entityId: v._id, schoolId: sidOf(req), detail: { visitor: v.visitorName } });
    res.json(out);
  } catch (e) { fail(res, e); }
};
exports.cancelVisit = async (req, res) => {
  try {
    const v = await visitFor(req, req.params.id); if (!v) return res.status(404).json({ message: 'Visit not found' });
    if (!['Requested', 'Approved'].includes(v.status)) return res.status(409).json({ message: v.status === 'CheckedIn' ? 'The visitor is already inside. Check them out instead.' : `This visit is already ${v.status.toLowerCase()}.` });
    v.status = 'Cancelled'; v.tokenHash = ''; await v.save();
    await audit(req, { action: 'safety.visit.cancel', entityType: 'VisitorVisit', entityId: v._id, schoolId: sidOf(req), detail: { visitor: v.visitorName } });
    res.json({ visit: shapeVisit(v, { desk: await operator(req), mine: true }) });
  } catch (e) { fail(res, e); }
};

async function nextBadge(schoolId, day, zonesKind, skip = 0) {
  const last = await VisitorVisit.find({ schoolId: S.oid(schoolId), 'badge.day': day }).sort({ 'badge.seq': -1 }).limit(1);
  const seq = (last[0]?.badge?.seq || 0) + 1 + skip;
  return { seq, number: `V-${day.slice(5).replace('-', '')}-${String(seq).padStart(3, '0')}`, zones: S.ZONES[zonesKind] || S.ZONES.Guest };
}

exports.checkIn = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const st = await S.getSettings(sid);
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Visit not found' });
    const v = await VisitorVisit.findOne({ _id: req.params.id, schoolId: sid });
    if (!v) return res.status(404).json({ message: 'Visit not found' });
    if (v.status === 'CheckedIn') return res.status(409).json({ message: 'This visitor is already inside.' });
    if (v.status === 'Requested') return res.status(422).json({ message: 'The host has not approved this visit yet.' });
    if (v.status !== 'Approved') return res.status(422).json({ message: `A ${v.status.toLowerCase()} visit cannot be checked in.` });
    const gate = st.gates.includes(b.gate) ? b.gate : st.gates[0]; const now = new Date();
    const method = b.method === 'qr' ? 'qr' : 'manual';
    if (now < new Date(v.expectedFrom.getTime() - 30 * 60000) || now > v.expectedTo) return res.status(422).json({ message: 'This visit is outside its approved time.' });
    if (method === 'qr') {
      const c = S.parseCode(b.code);
      if (!c || c.type !== 'visitor' || String(c.id) !== String(v._id) || !v.tokenHash || !S.safeEq(v.tokenHash, S.sha(c.token))) return res.status(422).json({ message: 'That invitation code is not valid. Use a fresh one or check the visitor in by hand.' });
      if (!v.tokenExpiresAt || new Date(v.tokenExpiresAt) < now) return res.status(422).json({ message: 'That invitation has expired. Ask the host for a new one.' });
    } else if (str(b.manualReason, 120).length < 3) return res.status(400).json({ message: 'Say why the visitor is being checked in by hand (for example: lost the invitation).' });
    if (await S.barredFromCampus(sid, { parentId: v.parentId, name: v.visitorName })) {
      await VisitorVisit.updateOne({ _id: v._id }, { $set: { status: 'Refused', refusedReason: 'restricted', tokenHash: '' } });
      await GateEntry.create({ schoolId: sid, subjectKind: 'visitor', subjectId: v._id, subjectName: v.visitorName, direction: 'in', gate, method, allowed: false, denyReason: 'restricted', recordedById: me.id, recordedByName: me.name });
      await audit(req, { action: 'safety.visit.refused', entityType: 'VisitorVisit', entityId: v._id, schoolId: sid, detail: { visitor: v.visitorName, reason: 'restricted' } });
      await N.notify({ schoolId: sid, recipients: await N.admins(sid), exclude: me.id, title: 'A restricted person asked to enter', body: `${v.visitorName} was refused at ${gate}.`, type: 'safety', key: `barred:${v._id}` });
      return res.status(403).json({ message: DENY, code: 'not-admitted' });
    }
    const idType = str(b.idType, 30); const idDigits = String(b.idNumber || '').replace(/[^A-Za-z0-9]/g, '');
    if (st.requireId) {
      if (b.idChecked !== true || !S.ID_TYPES.includes(idType)) return res.status(422).json({ message: 'Look at the visitor\'s ID and record its type first.', code: 'id-required' });
      if (idDigits.length < 4) return res.status(400).json({ message: 'Enter the ID number so the last four characters can be noted.' });
    }
    if (str(b.purposeConfirmed, 5) !== 'true' && b.purposeConfirmed !== true && st.requireId) return res.status(422).json({ message: 'Confirm the purpose of the visit with the visitor.', code: 'purpose-required' });
    const day = (await require('../utils/attendanceOps').clock(sid)).dateKey; const badgeExp = hours(now, st.badgeHours);
    let badge; let done;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      badge = await nextBadge(sid, day, v.kind, attempt);
      const patch = { status: 'CheckedIn', checkInAt: now, checkInById: me.id, checkInByName: me.name, checkInMethod: method, manualReason: method === 'manual' ? str(b.manualReason, 120) : '', gate,
        idType: idType || '', idLast4: idDigits ? idDigits.slice(-4) : '', idChecked: b.idChecked === true, tokenHash: '', 'badge.number': badge.number, 'badge.day': day, 'badge.seq': badge.seq, 'badge.zones': badge.zones, 'badge.expiresAt': new Date(Math.min(badgeExp.getTime(), v.expectedTo.getTime())) };
      try { done = await VisitorVisit.updateOne({ _id: v._id, status: 'Approved' }, { $set: patch }); } catch (e) { if (e.code !== 11000) throw e; }
    }
    if (!done) return res.status(409).json({ message: 'Badges are being issued very quickly. Try again.' });
    if (!done.modifiedCount) return res.status(409).json({ message: 'This visitor was just checked in by someone else.' });
    await GateEntry.create({ schoolId: sid, subjectKind: 'visitor', subjectId: v._id, subjectName: v.visitorName, direction: 'in', gate, method: method === 'qr' ? 'qr' : 'manual', manualReason: method === 'manual' ? str(b.manualReason, 120) : '', recordedById: me.id, recordedByName: me.name, ref: badge.number });
    await audit(req, { action: 'safety.visit.checkin', entityType: 'VisitorVisit', entityId: v._id, schoolId: sid, detail: { visitor: v.visitorName, badge: badge.number, method, gate } });
    if (v.hostId && String(v.hostId) !== String(me.id) && v.hostType !== 'office') await N.notify({ schoolId: sid, recipients: [{ id: v.hostId, role: v.hostType }], title: 'Your visitor has arrived', body: `${v.visitorName} is at ${gate}.`, type: 'safety', key: `visitin:${v._id}` });
    res.json({ visit: shapeVisit(await VisitorVisit.findById(v._id), { desk: true }) });
  } catch (e) { fail(res, e); }
};

exports.checkOut = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const st = await S.getSettings(sid); const b = req.body || {};
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Visit not found' });
    const v = await VisitorVisit.findOne({ _id: req.params.id, schoolId: sid });
    if (!v) return res.status(404).json({ message: 'Visit not found' });
    if (v.status !== 'CheckedIn') return res.status(409).json({ message: v.status === 'CheckedOut' ? 'This visitor has already left.' : 'This visitor is not inside.' });
    const gate = st.gates.includes(b.gate) ? b.gate : v.gate || st.gates[0];
    const done = await VisitorVisit.updateOne({ _id: v._id, status: 'CheckedIn' }, { $set: { status: 'CheckedOut', checkOutAt: new Date(), checkOutByName: me.name, checkOutMethod: 'manual' } });
    if (!done.modifiedCount) return res.status(409).json({ message: 'This visitor has already left.' });
    await GateEntry.create({ schoolId: sid, subjectKind: 'visitor', subjectId: v._id, subjectName: v.visitorName, direction: 'out', gate, method: 'manual', manualReason: 'Checked out at the desk', recordedById: me.id, recordedByName: me.name, ref: v.badge?.number || '' });
    await audit(req, { action: 'safety.visit.checkout', entityType: 'VisitorVisit', entityId: v._id, schoolId: sid, detail: { visitor: v.visitorName, badge: v.badge?.number } });
    res.json({ visit: shapeVisit(await VisitorVisit.findById(v._id), { desk: true }) });
  } catch (e) { fail(res, e); }
};

exports.badge = async (req, res) => {
  try {
    const v = await VisitorVisit.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sidOf(req) });
    if (!v) return res.status(404).json({ message: 'Visit not found' });
    if (!v.badge?.number || v.status !== 'CheckedIn') return res.status(422).json({ message: 'Only a visitor who is inside has a badge.' });
    v.badge.printedCount = (v.badge.printedCount || 0) + 1; await v.save();
    const school = await School.findById(sidOf(req)).select('name');
    // role limited: name, host, areas and expiry. No ID details, no phone, no purpose.
    res.json({ badge: { number: v.badge.number, site: school?.name || '', visitorName: v.visitorName, kind: v.kind, hostName: v.hostName, zones: v.badge.zones, issuedAt: v.checkInAt, expiresAt: v.badge.expiresAt, gate: v.gate, reprint: v.badge.printedCount > 1 } });
  } catch (e) { fail(res, e); }
};

// Look at a scanned or typed code without changing anything
exports.lookup = async (req, res) => {
  try {
    const c = S.parseCode(req.body?.code); const sid = sidOf(req);
    if (!c) return res.status(422).json({ message: 'That is not an Aulensia code.' });
    if (c.type === 'visitor') {
      const v = await VisitorVisit.findOne({ _id: c.id, schoolId: sid });
      if (!v || !v.tokenHash || !S.safeEq(v.tokenHash, S.sha(c.token))) return res.status(422).json({ message: 'That code is not valid or was replaced by a newer one.' });
      const live = v.tokenExpiresAt && new Date(v.tokenExpiresAt) > new Date();
      return res.json({ type: 'visitor', valid: !!live && v.status === 'Approved', reason: live ? '' : 'expired', visit: shapeVisit(v, { desk: true }), next: v.status === 'Approved' ? 'check-in' : v.status === 'CheckedIn' ? 'check-out' : 'none' });
    }
    const p = await ContractorPass.findOne({ _id: c.id, schoolId: sid });
    if (!p || !p.tokenHash || !S.safeEq(p.tokenHash, S.sha(c.token))) return res.status(422).json({ message: 'That code is not valid or was replaced by a newer one.' });
    res.json({ type: 'contractor', pass: shapePass(p), valid: p.status === 'Active' && new Date(p.validFrom) <= new Date() && new Date(p.validTo) > new Date(), next: p.inside ? 'out' : 'in' });
  } catch (e) { fail(res, e); }
};

/* ───────── contractors ───────── */
const shapePass = (p) => ({ _id: p._id, company: p.company, personName: p.personName, phone: p.phone, purpose: p.purpose, validFrom: p.validFrom, validTo: p.validTo, gates: p.gates || [], deviceIds: p.deviceIds || [], status: p.status, inside: p.inside, lastInAt: p.lastInAt, lastOutAt: p.lastOutAt,
  createdByName: p.createdByName, decidedByName: p.decidedByName, decidedAt: p.decidedAt, decisionNote: p.decisionNote, revokedReason: p.revokedReason, hasCredential: !!p.tokenHash, live: p.status === 'Active' && new Date(p.validFrom) <= new Date() && new Date(p.validTo) > new Date() });
exports.createPass = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const st = await S.getSettings(sid);
    const company = str(b.company, 80); const personName = str(b.personName, 80); const purpose = str(b.purpose, 200);
    if (!company || !personName) return res.status(400).json({ message: 'Enter the company and the person\'s name.' });
    if (purpose.length < 3) return res.status(400).json({ message: 'Say what the contractor is here to do.' });
    const from = date(b.validFrom); const to = date(b.validTo);
    if (!from || !to || to <= from) return res.status(400).json({ message: 'Choose a start and a later end time.' });
    if ((to - from) / 3600000 > st.contractorMaxHours) return res.status(422).json({ message: `A contractor shift can be at most ${st.contractorMaxHours} hours. Issue a new pass for the next shift.` });
    if (to < new Date()) return res.status(400).json({ message: 'That time has already passed.' });
    const gates = (Array.isArray(b.gates) ? b.gates : []).map((x) => str(x, 40)).filter(Boolean);
    if (gates.some((g) => !st.gates.includes(g))) return res.status(400).json({ message: 'Choose gates from the school\'s list.' });
    const deviceIds = (Array.isArray(b.deviceIds) ? b.deviceIds : []).filter(isId);
    if (deviceIds.length) { const n = await AttendanceDevice.countDocuments({ schoolId: sid, _id: { $in: deviceIds } }); if (n !== deviceIds.length) return res.status(404).json({ message: 'One of those readers is not in this school.' }); }
    const p = await ContractorPass.create({ schoolId: sid, company, personName, phone: str(b.phone, 30), purpose, validFrom: from, validTo: to, gates, deviceIds, createdById: me.id, createdByName: me.name });
    await audit(req, { action: 'safety.contractor.create', entityType: 'ContractorPass', entityId: p._id, schoolId: sid, detail: { company, person: personName, from, to, gates, devices: deviceIds.length } });
    await N.notify({ schoolId: sid, recipients: await N.admins(sid), exclude: me.id, title: 'A contractor pass needs approval', body: `${personName} (${company})`, type: 'safety', key: `passreq:${p._id}`, link: { admin: '/admin?tab=safetyDesk' } });
    res.status(201).json({ pass: shapePass(p) });
  } catch (e) { fail(res, e); }
};
exports.listPasses = async (req, res) => {
  try {
    const q = { schoolId: sidOf(req) }; if (req.query.status) q.status = { $in: String(req.query.status).split(',') }; if (req.query.inside === 'true') q.inside = true;
    const { p, l } = pg(req.query); const [rows, total] = await Promise.all([ContractorPass.find(q).sort({ validFrom: -1, _id: -1 }).skip((p - 1) * l).limit(l), ContractorPass.countDocuments(q)]);
    res.json({ passes: rows.map(shapePass), pagination: { total, page: p, currentPage: p, pages: Math.ceil(total / l) || 1, totalPages: Math.ceil(total / l) || 1 } });
  } catch (e) { fail(res, e); }
};
exports.decidePass = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const decision = b.decision === 'approve' ? 'approve' : b.decision === 'decline' ? 'decline' : null;
    if (!decision) return res.status(400).json({ message: 'Choose approve or decline.' });
    const p = await ContractorPass.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid });
    if (!p) return res.status(404).json({ message: 'Pass not found' });
    if (String(p.createdById) === String(me.id)) return res.status(403).json({ message: 'A different administrator has to approve a pass you created.' });
    if (p.status !== 'Pending') return res.status(409).json({ message: `This pass is already ${p.status.toLowerCase()}.` });
    if (decision === 'approve' && new Date(p.validTo) < new Date()) return res.status(422).json({ message: 'This pass has already ended. Create a new one.' });
    const r = await ContractorPass.updateOne({ _id: p._id, status: 'Pending' }, { $set: { status: decision === 'approve' ? 'Active' : 'Declined', decidedById: me.id, decidedByName: me.name, decidedAt: new Date(), decisionNote: str(b.note, 200) } });
    if (!r.modifiedCount) return res.status(409).json({ message: 'Someone else just decided this pass.' });
    await audit(req, { action: `safety.contractor.${decision}`, entityType: 'ContractorPass', entityId: p._id, schoolId: sid, detail: { company: p.company, person: p.personName } });
    res.json({ pass: shapePass(await ContractorPass.findById(p._id)) });
  } catch (e) { fail(res, e); }
};
exports.passCredential = async (req, res) => {
  try {
    const p = await ContractorPass.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sidOf(req) });
    if (!p) return res.status(404).json({ message: 'Pass not found' });
    if (p.status !== 'Active') return res.status(422).json({ message: 'Only an approved pass has a code.' });
    if (new Date(p.validTo) < new Date()) return res.status(422).json({ message: 'This pass has ended.' });
    const token = S.newToken(); p.tokenHash = S.sha(token); await p.save();
    await audit(req, { action: 'safety.contractor.credential', entityType: 'ContractorPass', entityId: p._id, schoolId: sidOf(req), detail: { person: p.personName } });
    res.json({ code: S.codeFor('contractor', p._id, token), validTo: p.validTo });
  } catch (e) { fail(res, e); }
};
exports.revokePass = async (req, res) => {
  try {
    const reason = str(req.body?.reason, 200); if (reason.length < 3) return res.status(400).json({ message: 'Say why the pass is being withdrawn.' });
    const p = await ContractorPass.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sidOf(req) });
    if (!p) return res.status(404).json({ message: 'Pass not found' });
    if (!['Pending', 'Active'].includes(p.status)) return res.status(409).json({ message: `This pass is already ${p.status.toLowerCase()}.` });
    p.status = 'Revoked'; p.revokedReason = reason; p.tokenHash = ''; await p.save();
    await audit(req, { action: 'safety.contractor.revoke', entityType: 'ContractorPass', entityId: p._id, schoolId: sidOf(req), detail: { person: p.personName, reason, inside: p.inside } });
    if (p.inside) await N.notify({ schoolId: sidOf(req), recipients: await N.admins(sidOf(req)), title: 'A withdrawn contractor is still inside', body: `${p.personName} (${p.company}) — ask them to leave.`, type: 'safety', key: `passrev:${p._id}` });
    res.json({ pass: shapePass(p) });
  } catch (e) { fail(res, e); }
};

// One entry decision for contractors, used by the desk and by readers. Leaving is never refused.
async function contractorMove(schoolId, p, { direction, gate, method, deviceId, by }) {
  const now = new Date(); const deny = async (why) => { await GateEntry.create({ schoolId, subjectKind: 'contractor', subjectId: p._id, subjectName: p.personName, direction, gate, method, deviceId, allowed: false, denyReason: why, recordedById: by?.id, recordedByName: by?.name || '' }); return { ok: false, why }; };
  if (direction === 'in') {
    if (p.status !== 'Active') return deny(p.status === 'Pending' ? 'not-approved' : 'revoked');
    if (now < new Date(p.validFrom)) return deny('too-early');
    if (now >= new Date(p.validTo)) return deny('expired');
    if (p.gates?.length && !p.gates.includes(gate)) return deny('wrong-gate');
    if (deviceId && p.deviceIds?.length && !p.deviceIds.map(String).includes(String(deviceId))) return deny('wrong-device');
    if (p.inside) return deny('already-inside');
  } else if (!p.inside) return { ok: false, why: 'not-inside', soft: true };
  await ContractorPass.updateOne({ _id: p._id }, { $set: direction === 'in' ? { inside: true, lastInAt: now } : { inside: false, lastOutAt: now } });
  await GateEntry.create({ schoolId, subjectKind: 'contractor', subjectId: p._id, subjectName: p.personName, direction, gate, method, deviceId, recordedById: by?.id, recordedByName: by?.name || '', ref: p.company });
  return { ok: true };
}
const WHY = { 'not-approved': 'This pass has not been approved yet.', revoked: 'This pass was withdrawn.', 'too-early': 'This pass is not valid yet.', expired: 'This pass has ended.', 'wrong-gate': 'This pass does not allow this gate.', 'wrong-device': 'This pass does not work at this reader.', 'already-inside': 'This person is already inside.', 'not-inside': 'This person is not marked as inside.' };
exports.passMove = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const st = await S.getSettings(sid);
    const p = await ContractorPass.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid });
    if (!p) return res.status(404).json({ message: 'Pass not found' });
    const direction = b.direction === 'out' ? 'out' : 'in'; const gate = st.gates.includes(b.gate) ? b.gate : st.gates[0];
    let method = 'manual';
    if (b.code) {
      const c = S.parseCode(b.code);
      if (!c || c.type !== 'contractor' || String(c.id) !== String(p._id) || !p.tokenHash || !S.safeEq(p.tokenHash, S.sha(c.token))) return res.status(422).json({ message: 'That code is not valid for this pass.' });
      method = 'qr';
    }
    const out = await contractorMove(sid, p, { direction, gate, method, by: me });
    await audit(req, { action: `safety.contractor.${direction}`, entityType: 'ContractorPass', entityId: p._id, schoolId: sid, detail: { person: p.personName, gate, allowed: out.ok, why: out.why || '' } });
    if (!out.ok) return res.status(out.soft ? 409 : 403).json({ message: WHY[out.why] || DENY, code: out.why });
    res.json({ pass: shapePass(await ContractorPass.findById(p._id)) });
  } catch (e) { fail(res, e); }
};

// A gate reader sends a scanned code. Contractors can pass; visitors can leave; a visitor arriving is sent to the desk for the ID check.
exports.deviceScan = async (req, res) => {
  try {
    const d = req.device; const sid = d.schoolId; const st = await S.getSettings(sid); const b = req.body || {}; const direction = b.direction === 'out' ? 'out' : 'in';
    const gate = st.gates.includes(d.gate) ? d.gate : st.gates.includes(b.gate) ? b.gate : st.gates[0]; const c = S.parseCode(b.code);
    const refuse = async (why, extra = {}) => { await GateEntry.create({ schoolId: sid, subjectKind: 'other', subjectName: '', direction, gate, method: 'reader', deviceId: d._id, allowed: false, denyReason: why }); return res.status(403).json({ allowed: false, code: why, message: WHY[why] || DENY, ...extra }); };
    if (!c) return refuse('unknown-code', { message: 'Not an Aulensia code.' });
    if (c.type === 'contractor') {
      const p = await ContractorPass.findOne({ _id: c.id, schoolId: sid });
      if (!p || !p.tokenHash || !S.safeEq(p.tokenHash, S.sha(c.token))) return refuse('unknown-code', { message: 'Code not valid.' });
      const out = await contractorMove(sid, p, { direction, gate, method: 'reader', deviceId: d._id, by: { id: d._id, name: d.name } });
      if (!out.ok) return res.status(out.soft ? 409 : 403).json({ allowed: false, code: out.why, message: WHY[out.why] || DENY });
      return res.json({ allowed: true, who: p.personName, direction });
    }
    const v = await VisitorVisit.findOne({ _id: c.id, schoolId: sid });
    if (!v) return refuse('unknown-code', { message: 'Code not valid.' });
    if (direction === 'out') {
      if (v.status !== 'CheckedIn') return res.status(409).json({ allowed: false, code: 'not-inside', message: 'This visitor is not marked as inside.' });
      await VisitorVisit.updateOne({ _id: v._id, status: 'CheckedIn' }, { $set: { status: 'CheckedOut', checkOutAt: new Date(), checkOutByName: d.name, checkOutMethod: 'reader' } });
      await GateEntry.create({ schoolId: sid, subjectKind: 'visitor', subjectId: v._id, subjectName: v.visitorName, direction: 'out', gate, method: 'reader', deviceId: d._id, ref: v.badge?.number || '' });
      return res.json({ allowed: true, who: v.visitorName, direction: 'out' });
    }
    await GateEntry.create({ schoolId: sid, subjectKind: 'visitor', subjectId: v._id, subjectName: v.visitorName, direction: 'in', gate, method: 'reader', deviceId: d._id, allowed: false, denyReason: 'needs-desk' });
    res.status(202).json({ allowed: false, code: 'needs-desk', message: 'Please go to reception for the ID check and your badge.' });
  } catch (e) { fail(res, e); }
};

/* ───────── gate log ───────── */
exports.gateLog = async (req, res) => {
  try {
    const sid = sidOf(req); const { p, l } = pg(req.query); const q = { schoolId: sid };
    if (req.query.kind) q.subjectKind = req.query.kind; if (req.query.gate) q.gate = String(req.query.gate);
    if (req.query.allowed === 'false') q.allowed = false; if (req.query.method) q.method = req.query.method;
    if (req.query.day) { const d0 = date(`${req.query.day}T00:00:00.000Z`); if (d0) q.at = { $gte: new Date(d0.getTime() - 12 * 3600000), $lt: new Date(d0.getTime() + 36 * 3600000) }; }
    const [rows, total] = await Promise.all([GateEntry.find(q).sort({ at: -1, _id: -1 }).skip((p - 1) * l).limit(l), GateEntry.countDocuments(q)]);
    res.json({ entries: rows, pagination: { total, page: p, currentPage: p, pages: Math.ceil(total / l) || 1, totalPages: Math.ceil(total / l) || 1 } });
  } catch (e) { fail(res, e); }
};
// A person walking through when no reader is working: written down by hand with the reason
exports.manualEntry = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const st = await S.getSettings(sid);
    const kind = ['student', 'staff', 'other'].includes(b.subjectKind) ? b.subjectKind : null; if (!kind) return res.status(400).json({ message: 'Choose student, staff or other.' });
    const direction = b.direction === 'out' ? 'out' : b.direction === 'in' ? 'in' : null; if (!direction) return res.status(400).json({ message: 'Choose in or out.' });
    if (str(b.manualReason, 120).length < 3) return res.status(400).json({ message: 'Say why this was written by hand (for example: reader is offline).' });
    let name = str(b.subjectName, 80); let subjectId;
    if (kind === 'student') { if (!isId(b.subjectId)) return res.status(400).json({ message: 'Choose the student.' }); const s = await Student.findOne({ _id: b.subjectId, schoolId: sid }).select('name'); if (!s) return res.status(404).json({ message: 'Student not found' }); subjectId = s._id; name = s.name; }
    else if (kind === 'staff' && isId(b.subjectId)) { const t = await Teacher.findOne({ _id: b.subjectId, schoolId: sid }).select('name'); if (!t) return res.status(404).json({ message: 'Staff member not found' }); subjectId = t._id; name = t.name; }
    if (!name) return res.status(400).json({ message: 'Enter the person\'s name.' });
    const e = await GateEntry.create({ schoolId: sid, subjectKind: kind, subjectId, subjectName: name, direction, gate: st.gates.includes(b.gate) ? b.gate : st.gates[0], method: 'manual', manualReason: str(b.manualReason, 120), recordedById: me.id, recordedByName: me.name });
    await audit(req, { action: 'safety.gate.manual', entityType: 'GateEntry', entityId: e._id, schoolId: sid, detail: { kind, name, direction, reason: e.manualReason } });
    res.status(201).json({ entry: e });
  } catch (e) { fail(res, e); }
};

/* ───────── guard logbook and handover ───────── */
exports.addLogItem = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const st = await S.getSettings(sid);
    const text = str(b.text, 600); if (text.length < 3) return res.status(400).json({ message: 'Write what happened or what must be done.' });
    const kind = ['Incident', 'Note', 'Action'].includes(b.kind) ? b.kind : 'Note'; const severity = ['Low', 'Medium', 'High'].includes(b.severity) ? b.severity : 'Low';
    const row = await GateLogItem.create({ schoolId: sid, gate: st.gates.includes(b.gate) ? b.gate : st.gates[0], kind, severity, text, status: kind === 'Note' ? 'Resolved' : 'Open', reportedById: me.id, reportedByName: me.name });
    await audit(req, { action: 'safety.logbook.add', entityType: 'GateLogItem', entityId: row._id, schoolId: sid, detail: { kind, severity } });
    if (severity === 'High') await N.notify({ schoolId: sid, recipients: await N.admins(sid), exclude: me.id, title: 'High severity gate incident', body: text.slice(0, 120), type: 'safety', key: `gateinc:${row._id}`, link: { admin: '/admin?tab=safetyDesk' } });
    res.status(201).json({ item: row });
  } catch (e) { fail(res, e); }
};
exports.listLogItems = async (req, res) => {
  try {
    const q = { schoolId: sidOf(req) }; if (req.query.status) q.status = req.query.status; if (req.query.kind) q.kind = req.query.kind; if (req.query.gate) q.gate = String(req.query.gate);
    const { p, l } = pg(req.query); const [rows, total] = await Promise.all([GateLogItem.find(q).sort({ createdAt: -1, _id: -1 }).skip((p - 1) * l).limit(l), GateLogItem.countDocuments(q)]);
    res.json({ items: rows, pagination: { total, page: p, currentPage: p, pages: Math.ceil(total / l) || 1, totalPages: Math.ceil(total / l) || 1 } });
  } catch (e) { fail(res, e); }
};
exports.resolveLogItem = async (req, res) => {
  try {
    const me = await S.actor(req); const resolution = str(req.body?.resolution, 300); if (resolution.length < 3) return res.status(400).json({ message: 'Write what was done about it.' });
    const it = await GateLogItem.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sidOf(req) });
    if (!it) return res.status(404).json({ message: 'Item not found' });
    const r = await GateLogItem.updateOne({ _id: it._id, status: 'Open' }, { $set: { status: 'Resolved', resolvedById: me.id, resolvedByName: me.name, resolvedAt: new Date(), resolution } });
    if (!r.modifiedCount) return res.status(409).json({ message: 'This item is already resolved.' });
    await audit(req, { action: 'safety.logbook.resolve', entityType: 'GateLogItem', entityId: it._id, schoolId: sidOf(req), detail: { resolution } });
    res.json({ item: await GateLogItem.findById(it._id) });
  } catch (e) { fail(res, e); }
};

exports.startHandover = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const st = await S.getSettings(sid);
    const toRole = b.toRole === 'teacher' ? 'teacher' : 'admin'; if (!isId(b.toId)) return res.status(400).json({ message: 'Choose who is taking over.' });
    if (String(b.toId) === String(me.id)) return res.status(403).json({ message: 'You cannot hand the shift to yourself.' });
    const to = await (toRole === 'teacher' ? Teacher : User).findOne({ _id: b.toId, schoolId: sid }).select('name');
    if (!to) return res.status(404).json({ message: 'That person is not at this school.' });
    if (!(await can({ role: toRole, userId: String(to._id), schoolId: sid }, 'safety.gate.operate')).allowed) return res.status(422).json({ message: 'That person is not on gate duty. Ask an administrator to give them gate duty first.' });
    const gate = st.gates.includes(b.gate) ? b.gate : st.gates[0];
    if (await GateHandover.findOne({ schoolId: sid, gate, status: 'Pending' })) return res.status(409).json({ message: 'A handover for this gate is already waiting to be accepted.' });
    const open = await GateLogItem.find({ schoolId: sid, gate, status: 'Open' }).select('_id');
    const h = await GateHandover.create({ schoolId: sid, gate, fromId: me.id, fromRole: me.role, fromName: me.name, toId: to._id, toRole, toName: to.name, witnessName: str(b.witnessName, 80), note: str(b.note, 600), keysAndEquipment: str(b.keysAndEquipment, 200), openItems: open.map((x) => x._id) });
    await audit(req, { action: 'safety.handover.start', entityType: 'GateHandover', entityId: h._id, schoolId: sid, detail: { gate, to: to.name, openItems: open.length } });
    await N.notify({ schoolId: sid, recipients: [{ id: to._id, role: toRole }], title: 'Gate shift handed to you', body: `${me.name} handed over ${gate}: ${open.length} open item${open.length === 1 ? '' : 's'}.`, type: 'safety', key: `handover:${h._id}`, link: { admin: '/admin?tab=safetyDesk', teacher: '/teacher?tab=safetyDesk' } });
    res.status(201).json({ handover: h });
  } catch (e) { fail(res, e); }
};
exports.listHandovers = async (req, res) => {
  try {
    const q = { schoolId: sidOf(req) }; if (req.query.status) q.status = req.query.status; const st = await S.getSettings(sidOf(req));
    const rows = await GateHandover.find(q).sort({ createdAt: -1 }).limit(60);
    res.json({ handovers: rows.map((h) => ({ ...h.toObject(), overdue: h.status === 'Pending' && Date.now() - new Date(h.createdAt).getTime() > st.handoverAcceptMinutes * 60000 })) });
  } catch (e) { fail(res, e); }
};
exports.decideHandover = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const decision = b.decision === 'accept' ? 'accept' : b.decision === 'dispute' ? 'dispute' : null;
    if (!decision) return res.status(400).json({ message: 'Choose accept or dispute.' });
    const h = await GateHandover.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid });
    if (!h) return res.status(404).json({ message: 'Handover not found' });
    if (String(h.fromId) === String(me.id)) return res.status(403).json({ message: 'The person handing over cannot accept their own handover.' });
    if (String(h.toId) !== String(me.id)) return res.status(403).json({ message: 'Only the person taking over can accept this handover.' });
    if (decision === 'dispute' && str(b.note, 300).length < 3) return res.status(400).json({ message: 'Say what does not match.' });
    const r = await GateHandover.updateOne({ _id: h._id, status: 'Pending' }, { $set: { status: decision === 'accept' ? 'Accepted' : 'Disputed', decidedAt: new Date(), decisionNote: str(b.note, 300) } });
    if (!r.modifiedCount) return res.status(409).json({ message: `This handover is already ${h.status.toLowerCase()}.` });
    if (decision === 'accept') for (const id of h.openItems || []) await GateLogItem.updateOne({ _id: id, status: 'Open' }, { $set: { carriedToId: me.id, carriedToName: me.name, handoverId: h._id }, $inc: { carriedCount: 1 } });
    await audit(req, { action: `safety.handover.${decision}`, entityType: 'GateHandover', entityId: h._id, schoolId: sid, detail: { gate: h.gate, items: (h.openItems || []).length } });
    if (decision === 'dispute') await N.notify({ schoolId: sid, recipients: [...(await N.admins(sid)), { id: h.fromId, role: h.fromRole }], exclude: me.id, title: 'A gate handover was disputed', body: str(b.note, 120), type: 'safety', key: `handdisp:${h._id}` });
    res.json({ handover: await GateHandover.findById(h._id) });
  } catch (e) { fail(res, e); }
};

// People who could take over a shift (everyone on gate duty except me)
exports.dutyStaff = async (req, res) => {
  try {
    const sid = sidOf(req); const out = [];
    for (const u of await User.find({ schoolId: sid, role: 'admin', isActive: { $ne: false } }).select('name')) if (String(u._id) !== String(req.user.userId)) out.push({ id: u._id, role: 'admin', name: u.name });
    for (const t of await Teacher.find({ schoolId: sid }).select('name').limit(300)) if (String(t._id) !== String(req.user.userId) && (await can({ role: 'teacher', userId: String(t._id), schoolId: sid }, 'safety.gate.operate')).allowed) out.push({ id: t._id, role: 'teacher', name: t.name });
    res.json({ staff: out, hosts: { teachers: (await Teacher.find({ schoolId: sid }).select('name').limit(300)).map((t) => ({ id: t._id, name: t.name })) } });
  } catch (e) { fail(res, e); }
};
