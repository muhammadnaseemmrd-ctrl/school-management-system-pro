// Dismissal and pickup (PRD E09): who may collect a child, one-day alternates, desk exceptions with a second person,
// audited emergency override, and the record of every attempt. A restriction can never be overridden by anyone.
//   403 refused (never says why) · 404 not yours · 409 already done · 422 not possible in this state
const mongoose = require('../lib/pgdoc');
const S = require('../utils/safety');
const A = require('../utils/attendanceOps');
const G = require('../utils/guardianRights');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const { can } = require('../utils/permissions');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Class = require('../models/Class');
const GuardianLink = require('../models/GuardianLink');
const DailyAttendance = require('../models/DailyAttendance');
const PickupAuthorization = require('../models/PickupAuthorization');
const PickupEvent = require('../models/PickupEvent');
const GateEntry = require('../models/GateEntry');
const ops = require('./attendanceOpsController')._internals;

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = S.clean;
const pg = (q) => ({ p: Math.max(1, parseInt(q.page, 10) || 1), l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)) });
const sidOf = (req) => req.user.schoolId;
const REFUSE = 'Do not release the child. Ask the person to wait and call the principal.';   // the same words for every refusal, whatever the cause
const operator = async (req) => (await can(req.user, 'safety.gate.operate')).allowed;
const hm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const liveLink = (l, at = new Date()) => new Date(l.validFrom) <= at && (!l.validTo || new Date(l.validTo) > at);

// Desk staff (gate duty) may deal with any child; a class teacher with their own class only
async function studentFor(req, id) {
  if (!isId(id)) return null;
  const stu = await Student.findOne({ _id: id, schoolId: sidOf(req) }).select('name classId rollNumber studentId');
  if (!stu) return null;
  if (await operator(req)) return stu;
  if (req.user.role === 'teacher' && stu.classId && (await can(req.user, 'safety.pickup.verify')).allowed && (await ops.manageClass(req, stu.classId))) return stu;
  return null;
}
const classLabel = async (sid, classId) => { const c = classId ? await Class.findOne({ _id: classId, schoolId: sid }).select('standard division') : null; return c ? `${c.standard}${c.division ? `-${c.division}` : ''}` : ''; };

const shapeEvent = (e, admin) => ({ _id: e._id, studentId: e.studentId, classId: e.classId, day: e.day, at: e.at, collectorName: e.collectorName, relationship: e.relationship, collectorPhone: admin ? e.collectorPhone : undefined, basis: e.basis, outcome: e.outcome,
  refusedCode: admin ? e.refusedCode : undefined, reason: e.reason, familyConfirmedWith: e.familyConfirmedWith, absentOverride: e.absentOverride, gate: e.gate,
  requestedByName: e.requestedByName, requestedById: e.requestedById, decidedByName: e.decidedByName, decidedAt: e.decidedAt, decisionNote: e.decisionNote, releasedByName: e.releasedByName, reviewState: e.reviewState, reviewedByName: e.reviewedByName, reviewedAt: e.reviewedAt, reviewNote: e.reviewNote });


// Classes this person may run dismissal or a head count for
exports.myClasses = async (req, res) => {
  try {
    const sid = sidOf(req); const filter = { schoolId: sid };
    if (!(await operator(req))) { const mine = await ops.myClassIds(req); filter._id = { $in: mine || [] }; }
    const rows = await Class.find(filter).select('standard division').limit(200);
    res.json({ classes: rows.map((c) => ({ _id: c._id, label: `${c.standard}${c.division ? `-${c.division}` : ''}` })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) });
  } catch (e) { fail(res, e); }
};

/* ───────── who is on the list ───────── */
exports.search = async (req, res) => {
  try {
    const sid = sidOf(req); const q = String(req.query.q || '').trim(); if (q.length < 2) return res.json({ students: [] });
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 40), 'i'); const filter = { schoolId: sid, $or: [{ name: re }, { studentId: re }, { rollNumber: re }] };
    if (!(await operator(req))) { const mine = await ops.myClassIds(req); filter.classId = { $in: mine || [] }; }
    const rows = await Student.find(filter).select('name classId rollNumber studentId').limit(15);
    const out = []; for (const s of rows) out.push({ _id: s._id, name: s.name, rollNumber: s.rollNumber, studentId: s.studentId, classId: s.classId, classLabel: await classLabel(sid, s.classId) });
    res.json({ students: out });
  } catch (e) { fail(res, e); }
};

// A person may be listed even if the child has a restriction on them elsewhere: restricted people are simply left out, with no hint
async function listedPeople(sid, studentId, day) {
  const links = (await GuardianLink.find({ schoolId: sid, studentId })).filter((l) => liveLink(l) && l.rights?.pickup === true);
  const out = [];
  for (const l of links) {
    const who = l.parentId ? await Parent.findById(l.parentId).select('name phone') : null; const name = who?.name || l.personName;
    const d = await G.pickupDecision(sid, studentId, { parentId: l.parentId, personName: l.parentId ? undefined : l.personName });
    if (d.decision === 'Authorised') out.push({ parentId: l.parentId || null, name, relationship: l.relationship, phone: who?.phone || l.phone || '', kind: 'guardian' });
  }
  const alt = await PickupAuthorization.find({ schoolId: sid, studentId, day, status: 'Active' });
  for (const a of alt) {
    const d = await G.pickupDecision(sid, studentId, { personName: a.personName });
    if (d.code !== 'restricted') out.push({ authorizationId: a._id, name: a.personName, relationship: a.relationship, phone: a.phone, kind: 'alternate' });
  }
  return out;
}
exports.roster = async (req, res) => {
  try {
    const sid = sidOf(req); const classId = req.query.classId;
    if (!isId(classId)) return res.status(400).json({ message: 'Choose a class.' });
    const op = await operator(req); if (!op && !(await ops.manageClass(req, classId))) return res.status(404).json({ message: 'Class not found' });
    const clock = await A.clock(sid); const day = clock.dateKey; const students = await Student.find({ schoolId: sid, classId, isActive: { $ne: false } }).select('name rollNumber').sort({ name: 1 }).limit(200);
    const marks = await DailyAttendance.find({ schoolId: sid, classId, date: clock.dateUTC }); const mk = new Map(marks.map((m) => [String(m.studentId), m]));
    const rel = await PickupEvent.find({ schoolId: sid, classId, day, outcome: 'Released' }); const rl = new Map(rel.map((e) => [String(e.studentId), e]));
    const pend = await PickupEvent.find({ schoolId: sid, classId, day, outcome: 'Pending' }); const pd = new Set(pend.map((e) => String(e.studentId)));
    const rows = [];
    for (const s of students) {
      const m = mk.get(String(s._id)); const r = rl.get(String(s._id));
      rows.push({ _id: s._id, name: s.name, rollNumber: s.rollNumber, today: m ? m.status : 'Not marked', released: r ? { at: r.at, by: r.collectorName, basis: r.basis } : null, exceptionPending: pd.has(String(s._id)), people: r ? [] : await listedPeople(sid, s._id, day) });
    }
    res.json({ day, label: await classLabel(sid, classId), students: rows });
  } catch (e) { fail(res, e); }
};
exports.check = async (req, res) => {
  try {
    const stu = await studentFor(req, req.body?.studentId); if (!stu) return res.status(404).json({ message: 'Student not found' });
    const b = req.body || {}; if (!b.parentId && !str(b.personName, 80)) return res.status(400).json({ message: 'Choose who is collecting the child.' });
    if (b.parentId && !isId(b.parentId)) return res.status(400).json({ message: 'Invalid person' });
    const day = await S.today(sidOf(req)); const d = await S.collectorDecision(sidOf(req), stu._id, { parentId: b.parentId, personName: b.personName, code: b.code }, day);
    await audit(req, { action: 'safety.pickup.check', entityType: 'Student', entityId: stu._id, schoolId: sidOf(req), detail: { decision: d.decision, reason: d.code, basis: d.basis, person: b.personName || '', parentId: b.parentId || null } });
    res.json({ studentName: stu.name, decision: d.decision, code: d.decision === 'Authorised' ? 'ok' : 'not-authorised', message: d.decision === 'Authorised' ? d.message : REFUSE, relationship: d.relationship });
  } catch (e) { fail(res, e); }
};

/* ───────── release ───────── */
async function recordRelease(req, stu, { collectorName, parentId, relationship, phone, basis, authorizationId, reason = '', familyConfirmedWith = '', absentOverride = false, gate, requestedBy, decidedBy, existing, reviewState = '' }) {
  const sid = sidOf(req); const me = await S.actor(req); const st = await S.getSettings(sid); const clock = await A.clock(sid); const now = new Date();
  const base = { schoolId: sid, studentId: stu._id, classId: stu.classId, day: clock.dateKey, at: now, collectorName, collectorParentId: parentId || undefined, relationship: relationship || '', collectorPhone: phone || '', basis, authorizationId, outcome: 'Released', reason, familyConfirmedWith, absentOverride,
    gate: st.gates.includes(gate) ? gate : st.gates[0], releasedById: me.id, releasedByName: me.name, reviewState };
  let ev;
  if (existing) { await PickupEvent.updateOne({ _id: existing._id }, { $set: { ...base, requestedById: existing.requestedById, decidedById: decidedBy?.id, decidedByName: decidedBy?.name || '', decidedAt: now } }); ev = await PickupEvent.findById(existing._id); }
  else ev = await PickupEvent.create({ ...base, requestedById: requestedBy?.id || me.id, requestedByRole: requestedBy?.role || me.role, requestedByName: requestedBy?.name || me.name, decidedById: decidedBy?.id, decidedByName: decidedBy?.name || '', decidedAt: decidedBy ? now : undefined });
  if (authorizationId) await PickupAuthorization.updateOne({ _id: authorizationId, status: 'Active' }, { $set: { status: 'Used', usedAt: now } });
  await GateEntry.create({ schoolId: sid, subjectKind: 'student', subjectId: stu._id, subjectName: stu.name, direction: 'out', gate: base.gate, method: 'pickup', recordedById: me.id, recordedByName: me.name, ref: `pickup:${ev._id}` });
  // leaving early shows on the register and tells the family through the E08 alert rules
  try {
    const rec = await DailyAttendance.findOne({ studentId: stu._id, date: clock.dateUTC });
    if (rec && ['Present', 'Late'].includes(rec.status)) {
      const before = A.snapOf(rec); const next = { status: 'HalfDay', leftAt: hm(clock.minutes), arrivedAt: null, authorizedBy: collectorName, remarks: rec.remarks || '' };
      await DailyAttendance.updateOne({ _id: rec._id }, { $set: next });
      await A.logChange({ schoolId: sid, studentId: stu._id, date: clock.dateKey, before, after: A.snapOf(next), source: 'pickup', by: me.id, role: me.role, reason: `Collected by ${collectorName}` });
      await A.syncAlert({ schoolId: sid, student: stu, classId: stu.classId, date: clock.dateKey, record: next, marker: me.id, markerModel: me.role === 'admin' ? 'User' : 'Teacher' });
      await A.dispatchDue(sid);
    }
  } catch (e) { console.error('pickup attendance', e.message); }
  if (st.notifyOnPickup) await N.notify({ schoolId: sid, recipients: [...(await N.parentsOf(sid, [stu._id], 'viewInfo')), { id: stu._id, role: 'student' }], title: `${stu.name} was collected`, body: `${collectorName}${relationship ? ` (${relationship})` : ''} collected ${stu.name} at ${hm(clock.minutes)}.`, type: 'safety', key: `pickup:${ev._id}`, link: { parent: '/parent?tab=desk' } });
  return ev;
}
async function refuse(req, stu, spec, code) {
  const me = await S.actor(req); const clock = await A.clock(sidOf(req));
  const ev = await PickupEvent.create({ schoolId: sidOf(req), studentId: stu._id, classId: stu.classId, day: clock.dateKey, collectorName: spec.personName || '', collectorParentId: spec.parentId || undefined, outcome: 'Refused', refusedCode: code, requestedById: me.id, requestedByRole: me.role, requestedByName: me.name, basis: 'none' });
  await audit(req, { action: 'safety.pickup.refused', entityType: 'Student', entityId: stu._id, schoolId: sidOf(req), detail: { reason: code, person: spec.personName || '', parentId: spec.parentId || null } });
  if (code === 'restricted') await N.notify({ schoolId: sidOf(req), recipients: await N.admins(sidOf(req)), exclude: me.id, title: 'A restricted person tried to collect a child', body: `${stu.name}: ${spec.personName || 'a guardian account'} was refused at the gate.`, type: 'safety', key: `pickupbar:${ev._id}`, link: { admin: '/admin?tab=safetyDesk' } });
  return ev;
}
async function absentToday(sid, stu) {
  const clock = await A.clock(sid); const rec = await DailyAttendance.findOne({ studentId: stu._id, date: clock.dateUTC });
  return rec && ['Absent', 'Leave'].includes(rec.status) ? rec.status : null;
}
const clean = (b) => ({ parentId: isId(b.parentId) ? b.parentId : null, personName: str(b.personName, 80), code: str(b.code, 12) });

exports.release = async (req, res) => {
  try {
    const sid = sidOf(req); const stu = await studentFor(req, req.body?.studentId); if (!stu) return res.status(404).json({ message: 'Student not found' });
    const b = req.body || {}; const spec = clean(b); if (!spec.parentId && !spec.personName) return res.status(400).json({ message: 'Choose who is collecting the child.' });
    const day = await S.today(sid);
    const done = await PickupEvent.findOne({ schoolId: sid, studentId: stu._id, day, outcome: 'Released' });
    if (done) return res.status(409).json({ message: 'This child was already collected today.' });
    const d = await S.collectorDecision(sid, stu._id, spec, day);
    if (d.decision !== 'Authorised') { await refuse(req, stu, spec, d.code); return res.status(403).json({ message: REFUSE, code: 'not-authorised' }); }
    const gone = await absentToday(sid, stu);
    if (gone && !(b.overrideAbsent === true && str(b.reason, 200).length >= 5)) return res.status(422).json({ message: `${stu.name} is marked ${gone.toLowerCase()} today. If the child really is on campus, confirm it with a reason.`, code: 'absent-today' });
    const who = spec.parentId ? await Parent.findById(spec.parentId).select('name phone') : null;
    const ev = await recordRelease(req, stu, { collectorName: who?.name || spec.personName || d.authorization?.personName, parentId: spec.parentId, relationship: d.relationship, phone: who?.phone || d.authorization?.phone || '', basis: d.basis, authorizationId: d.authorizationId, reason: str(b.reason, 200), absentOverride: !!gone, gate: b.gate });
    await audit(req, { action: 'safety.pickup.release', entityType: 'PickupEvent', entityId: ev._id, schoolId: sid, detail: { studentId: stu._id, basis: d.basis, collector: ev.collectorName } });
    res.status(201).json({ event: shapeEvent(ev, req.user.role === 'admin') });
  } catch (e) { fail(res, e); }
};

// Someone not on the list: the desk asks, a different administrator decides after the family has been phoned
exports.requestException = async (req, res) => {
  try {
    const sid = sidOf(req); const stu = await studentFor(req, req.body?.studentId); if (!stu) return res.status(404).json({ message: 'Student not found' });
    const b = req.body || {}; const me = await S.actor(req); const name = str(b.personName, 80); const reason = str(b.reason, 300); const family = str(b.familyConfirmedWith, 80);
    if (!name) return res.status(400).json({ message: 'Enter the name of the person asking to collect the child.' });
    if (reason.length < 10) return res.status(400).json({ message: 'Write why this cannot wait for the usual list (at least 10 characters).' });
    if (family.length < 2) return res.status(400).json({ message: 'Phone a guardian first and write who you spoke to.' });
    const day = await S.today(sid);
    if (await PickupEvent.findOne({ schoolId: sid, studentId: stu._id, day, outcome: 'Released' })) return res.status(409).json({ message: 'This child was already collected today.' });
    if (await PickupEvent.findOne({ schoolId: sid, studentId: stu._id, day, outcome: 'Pending' })) return res.status(409).json({ message: 'An exception for this child is already waiting for a decision.' });
    const d = await G.pickupDecision(sid, stu._id, { personName: name });
    if (d.code === 'restricted') { await refuse(req, stu, { personName: name }, 'restricted'); return res.status(403).json({ message: REFUSE, code: 'not-authorised' }); }
    const clock = await A.clock(sid);
    const ev = await PickupEvent.create({ schoolId: sid, studentId: stu._id, classId: stu.classId, day: clock.dateKey, collectorName: name, relationship: str(b.relationship, 40), collectorPhone: str(b.phone, 30), basis: 'exception', outcome: 'Pending', reason, familyConfirmedWith: family, requestedById: me.id, requestedByRole: me.role, requestedByName: me.name });
    await audit(req, { action: 'safety.pickup.exception.request', entityType: 'PickupEvent', entityId: ev._id, schoolId: sid, detail: { studentId: stu._id, person: name, reason, familyConfirmedWith: family } });
    await N.notify({ schoolId: sid, recipients: await N.admins(sid), exclude: me.id, title: 'A pickup exception needs a decision', body: `${stu.name}: ${name} — ${reason.slice(0, 80)}`, type: 'safety', key: `pickupexc:${ev._id}`, link: { admin: '/admin?tab=safetyDesk' } });
    res.status(201).json({ event: shapeEvent(ev, req.user.role === 'admin') });
  } catch (e) { fail(res, e); }
};
exports.decideException = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const decision = b.decision === 'approve' ? 'approve' : b.decision === 'decline' ? 'decline' : null;
    if (!decision) return res.status(400).json({ message: 'Choose approve or decline.' });
    const ev = await PickupEvent.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid, basis: 'exception' });
    if (!ev) return res.status(404).json({ message: 'Exception not found' });
    if (String(ev.requestedById) === String(me.id)) return res.status(403).json({ message: 'A different administrator has to decide an exception you asked for.' });
    if (ev.outcome !== 'Pending') return res.status(409).json({ message: `This exception is already ${ev.outcome.toLowerCase()}.` });
    const stu = await Student.findOne({ _id: ev.studentId, schoolId: sid }).select('name classId');
    if (decision === 'decline') {
      const r = await PickupEvent.updateOne({ _id: ev._id, outcome: 'Pending' }, { $set: { outcome: 'Declined', decidedById: me.id, decidedByName: me.name, decidedAt: new Date(), decisionNote: str(b.note, 200) } });
      if (!r.modifiedCount) return res.status(409).json({ message: 'Someone else just decided this.' });
      await audit(req, { action: 'safety.pickup.exception.decline', entityType: 'PickupEvent', entityId: ev._id, schoolId: sid, detail: { person: ev.collectorName } });
      return res.json({ event: shapeEvent(await PickupEvent.findById(ev._id), true) });
    }
    // checked again now: a restriction added since the request still wins
    const d = await G.pickupDecision(sid, ev.studentId, { personName: ev.collectorName });
    if (d.code === 'restricted') { await PickupEvent.updateOne({ _id: ev._id }, { $set: { outcome: 'Refused', refusedCode: 'restricted', decidedById: me.id, decidedByName: me.name, decidedAt: new Date() } }); return res.status(403).json({ message: REFUSE, code: 'not-authorised' }); }
    if (await PickupEvent.findOne({ schoolId: sid, studentId: ev.studentId, day: ev.day, outcome: 'Released' })) return res.status(409).json({ message: 'This child was already collected today.' });
    const rel = await recordRelease(req, stu, { collectorName: ev.collectorName, relationship: ev.relationship, phone: ev.collectorPhone, basis: 'exception', reason: ev.reason, familyConfirmedWith: ev.familyConfirmedWith, gate: ev.gate, existing: ev, decidedBy: me });
    await PickupEvent.updateOne({ _id: rel._id }, { $set: { decisionNote: str(b.note, 200) } });
    await audit(req, { action: 'safety.pickup.exception.approve', entityType: 'PickupEvent', entityId: ev._id, schoolId: sid, detail: { person: ev.collectorName, requestedBy: ev.requestedByName } });
    res.json({ event: shapeEvent(await PickupEvent.findById(ev._id), true) });
  } catch (e) { fail(res, e); }
};
// A real emergency: one administrator may release without waiting for a second person. Still blocked for a restricted person, always audited, always reviewed.
exports.override = async (req, res) => {
  try {
    const sid = sidOf(req); const stu = await studentFor(req, req.body?.studentId); if (!stu) return res.status(404).json({ message: 'Student not found' });
    const b = req.body || {}; const me = await S.actor(req); const name = str(b.personName, 80); const reason = str(b.reason, 300);
    if (!(await can(req.user, 'safety.pickup.override')).allowed) return res.status(403).json({ message: 'Only an administrator can use the emergency override.' });
    if (!name) return res.status(400).json({ message: 'Enter the name of the person collecting the child.' });
    if (reason.length < 15) return res.status(400).json({ message: 'Describe the emergency (at least 15 characters).' });
    const day = await S.today(sid);
    if (await PickupEvent.findOne({ schoolId: sid, studentId: stu._id, day, outcome: 'Released' })) return res.status(409).json({ message: 'This child was already collected today.' });
    const d = await G.pickupDecision(sid, stu._id, { personName: name });
    if (d.code === 'restricted') { await refuse(req, stu, { personName: name }, 'restricted'); return res.status(403).json({ message: REFUSE, code: 'not-authorised' }); }
    const ev = await recordRelease(req, stu, { collectorName: name, relationship: str(b.relationship, 40), phone: str(b.phone, 30), basis: 'emergency-override', reason, familyConfirmedWith: str(b.familyConfirmedWith, 80), gate: b.gate, reviewState: 'NeedsReview', absentOverride: !!(await absentToday(sid, stu)) });
    await audit(req, { action: 'safety.pickup.override', entityType: 'PickupEvent', entityId: ev._id, schoolId: sid, detail: { studentId: stu._id, person: name, reason } });
    await N.notify({ schoolId: sid, recipients: await N.admins(sid), exclude: me.id, title: 'Emergency pickup override used', body: `${stu.name} was released to ${name}. Another administrator must review it.`, type: 'safety', key: `pickupovr:${ev._id}`, link: { admin: '/admin?tab=safetyDesk' } });
    res.status(201).json({ event: shapeEvent(ev, true) });
  } catch (e) { fail(res, e); }
};
exports.review = async (req, res) => {
  try {
    const me = await S.actor(req); const note = str(req.body?.note, 300); if (note.length < 3) return res.status(400).json({ message: 'Write what you found when you reviewed it.' });
    const ev = await PickupEvent.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sidOf(req), reviewState: { $in: ['NeedsReview', 'Reviewed'] } });
    if (!ev) return res.status(404).json({ message: 'Nothing to review here.' });
    if (String(ev.releasedById) === String(me.id)) return res.status(403).json({ message: 'A different administrator has to review an override you used.' });
    const r = await PickupEvent.updateOne({ _id: ev._id, reviewState: 'NeedsReview' }, { $set: { reviewState: 'Reviewed', reviewedById: me.id, reviewedByName: me.name, reviewedAt: new Date(), reviewNote: note } });
    if (!r.modifiedCount) return res.status(409).json({ message: 'This was already reviewed.' });
    await audit(req, { action: 'safety.pickup.review', entityType: 'PickupEvent', entityId: ev._id, schoolId: sidOf(req), detail: { note } });
    res.json({ event: shapeEvent(await PickupEvent.findById(ev._id), true) });
  } catch (e) { fail(res, e); }
};

/* ───────── the record ───────── */
exports.listEvents = async (req, res) => {
  try {
    const sid = sidOf(req); const { p, l } = pg(req.query); const q = { schoolId: sid }; const admin = req.user.role === 'admin';
    if (req.query.day) q.day = String(req.query.day); if (req.query.outcome) q.outcome = { $in: String(req.query.outcome).split(',') }; if (req.query.basis) q.basis = String(req.query.basis); if (req.query.review === 'pending') q.reviewState = 'NeedsReview';
    if (isId(req.query.studentId)) q.studentId = req.query.studentId;
    if (!(await operator(req))) { const mine = await ops.myClassIds(req); q.classId = { $in: mine || [] }; }
    const [rows, total] = await Promise.all([PickupEvent.find(q).sort({ at: -1, _id: -1 }).skip((p - 1) * l).limit(l), PickupEvent.countDocuments(q)]);
    const names = new Map((await Student.find({ _id: { $in: rows.map((r) => r.studentId) } }).select('name')).map((s) => [String(s._id), s.name]));
    res.json({ events: rows.map((e) => ({ ...shapeEvent(e, admin), studentName: names.get(String(e.studentId)) || '' })), pagination: { total, page: p, currentPage: p, pages: Math.ceil(total / l) || 1, totalPages: Math.ceil(total / l) || 1 } });
  } catch (e) { fail(res, e); }
};
// A family sees when their own child was collected, and only what they need to know
exports.myEvents = async (req, res) => {
  try {
    const sid = sidOf(req); const out = []; let kids = [];
    if (req.user.role === 'student') kids = [req.user.userId];
    else kids = await S.familyKids(sid, req.user.userId, 'viewInfo');
    if (isId(req.query.studentId)) kids = kids.filter((k) => String(k) === String(req.query.studentId));
    if (!kids.length) return res.json({ events: [] });
    const rows = await PickupEvent.find({ schoolId: sid, studentId: { $in: kids }, outcome: 'Released' }).sort({ at: -1 }).limit(60);
    const names = new Map((await Student.find({ _id: { $in: kids } }).select('name')).map((s) => [String(s._id), s.name]));
    for (const e of rows) out.push({ _id: e._id, studentId: e.studentId, studentName: names.get(String(e.studentId)) || '', at: e.at, collectorName: e.collectorName, relationship: e.relationship, basis: e.basis });
    res.json({ events: out });
  } catch (e) { fail(res, e); }
};

/* ───────── one-day alternates ───────── */
exports.createAuthorization = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {}; const clock = await A.clock(sid);
    if (!isId(b.studentId)) return res.status(400).json({ message: 'Choose the child.' });
    const stu = await Student.findOne({ _id: b.studentId, schoolId: sid }).select('name classId'); if (!stu) return res.status(404).json({ message: 'Child not found.' });
    let confirmedWith = '';
    if (req.user.role === 'parent') {
      const g = await G.resolve(sid, me.id, stu._id); if (!g.linked || !g.rights.pickup) return res.status(404).json({ message: 'Child not found.' });
    } else if (req.user.role === 'admin') {
      confirmedWith = str(b.confirmedWith, 80); if (confirmedWith.length < 2) return res.status(400).json({ message: 'Phone a guardian first and write who confirmed this.' });
    } else return res.status(403).json({ message: 'Access denied' });
    const name = str(b.personName, 80); if (name.length < 3) return res.status(400).json({ message: 'Enter the full name of the person who will collect.' });
    const day = str(b.day, 10) || clock.dateKey; if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ message: 'Choose a valid date.' });
    const last = A.addDays(clock.dateKey, 7);
    if (day < clock.dateKey) return res.status(400).json({ message: 'That day has passed.' }); if (day > last) return res.status(400).json({ message: 'You can authorise someone up to 7 days ahead.' });
    const d = await G.pickupDecision(sid, stu._id, { personName: name });
    if (d.code === 'restricted') return res.status(422).json({ message: 'This person cannot be authorised. Please contact the school office.' });
    if (await PickupAuthorization.findOne({ schoolId: sid, studentId: stu._id, day, status: 'Active', personName: name })) return res.status(409).json({ message: 'This person is already authorised for that day.' });
    const code = S.newCode();
    const a = await PickupAuthorization.create({ schoolId: sid, studentId: stu._id, personName: name, phone: str(b.phone, 30), relationship: str(b.relationship, 40) || 'Family friend', day, codeHash: S.sha(code), createdByRole: me.role, createdById: me.id, createdByName: me.name, confirmedWith });
    await audit(req, { action: 'safety.pickup.authorise', entityType: 'PickupAuthorization', entityId: a._id, schoolId: sid, detail: { studentId: stu._id, person: name, day, confirmedWith } });
    if (req.user.role === 'admin') await N.notify({ schoolId: sid, recipients: await N.parentsOf(sid, [stu._id], 'viewInfo'), title: 'Someone else may collect your child', body: `${name} may collect ${stu.name} on ${day}.`, type: 'safety', key: `pickupauth:${a._id}`, link: { parent: '/parent?tab=desk' } });
    res.status(201).json({ authorization: shapeAuth(a), code });   // the code is shown once
  } catch (e) { fail(res, e); }
};
const shapeAuth = (a) => ({ _id: a._id, studentId: a.studentId, personName: a.personName, phone: a.phone, relationship: a.relationship, day: a.day, status: a.status, createdByName: a.createdByName, createdByRole: a.createdByRole, confirmedWith: a.confirmedWith, usedAt: a.usedAt, createdAt: a.createdAt });
exports.listAuthorizations = async (req, res) => {
  try {
    const sid = sidOf(req); const q = { schoolId: sid }; if (req.query.status) q.status = req.query.status; if (req.query.day) q.day = String(req.query.day);
    if (req.user.role === 'parent') { q.createdById = req.user.userId; if (isId(req.query.studentId)) q.studentId = req.query.studentId; }
    else if (!(await operator(req))) return res.status(403).json({ message: 'Access denied' });
    else if (isId(req.query.studentId)) q.studentId = req.query.studentId;
    const rows = await PickupAuthorization.find(q).sort({ day: -1, createdAt: -1 }).limit(100);
    const names = new Map((await Student.find({ _id: { $in: rows.map((r) => r.studentId) } }).select('name')).map((s) => [String(s._id), s.name]));
    res.json({ authorizations: rows.map((a) => ({ ...shapeAuth(a), studentName: names.get(String(a.studentId)) || '' })) });
  } catch (e) { fail(res, e); }
};
exports.revokeAuthorization = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const a = await PickupAuthorization.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid });
    if (!a) return res.status(404).json({ message: 'Authorisation not found' });
    if (req.user.role === 'parent' && String(a.createdById) !== String(me.id)) return res.status(404).json({ message: 'Authorisation not found' });
    if (!['parent', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Access denied' });
    const r = await PickupAuthorization.updateOne({ _id: a._id, status: 'Active' }, { $set: { status: 'Revoked', revokedAt: new Date(), revokedByName: me.name } });
    if (!r.modifiedCount) return res.status(409).json({ message: `This authorisation is already ${a.status.toLowerCase()}.` });
    await audit(req, { action: 'safety.pickup.revoke', entityType: 'PickupAuthorization', entityId: a._id, schoolId: sid, detail: { person: a.personName, day: a.day } });
    res.json({ authorization: shapeAuth(await PickupAuthorization.findById(a._id)) });
  } catch (e) { fail(res, e); }
};
