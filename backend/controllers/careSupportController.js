// Special needs and student support (PRD E21: Accommodation, Goal, Achievement, CounselAppointment, MentorPair, CareerPathway, CareTraining) and what families and students see.
const S = require('../utils/care/service');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Accommodation = require('../models/Accommodation');
const CareGoal = require('../models/CareGoal');
const CareAppointment = require('../models/CareAppointment');
const MentorPair = require('../models/MentorPair');
const CareCareer = require('../models/CareCareer');
const CareTraining = require('../models/CareTraining');
const CareCase = require('../models/CareCase');
const HealthPlan = require('../models/HealthPlan');

const { oid, sid, bad, wrap, clean } = S;
const KINDS = ['extra-time', 'reader', 'separate-room', 'assistive-tech', 'seating', 'breaks', 'modified-work', 'other'];
const roleOf = (p) => (p.model === 'User' ? 'admin' : 'teacher');
const liveOn = (a, day) => a.status === 'Active' && (!a.validFrom || a.validFrom <= day) && (!a.validTo || a.validTo >= day);

/* ───────── accommodations ───────── */
exports.proposeAccommodation = wrap('proposeAcc', async (req, res) => {
  const c = await S.ctx(req); const b = req.body || {}; const s = sid(req); const st = await S.studentOf(req, b.studentId); if (!st || !S.canTouch(c, st)) return bad(res, 404, 'Student not found.');
  if (!KINDS.includes(b.kind)) return bad(res, 422, 'Choose the kind of adjustment.'); const pct = Number(b.extraTimePct) || 0;
  if (b.kind === 'extra-time' && (!Number.isInteger(pct) || pct < 5 || pct > 100)) return bad(res, 422, 'Extra time is 5 to 100 percent.');
  const detail = clean(b.detail, 600); if (detail.length < 5) return bad(res, 422, 'Describe the adjustment.');
  const day = await S.today(s); const set = await S.getSettings(s);
  for (const k of ['validFrom', 'validTo', 'reviewOn']) if (b[k] && !S.isDay(b[k])) return bad(res, 422, 'Dates must look like 2026-03-31.'); if (b.validFrom && b.validTo && b.validTo < b.validFrom) return bad(res, 422, 'The end date is before the start.');
  const a = await Accommodation.create({ schoolId: s, studentId: st._id, studentName: st.name, classId: st.classId || null, kind: b.kind, detail, extraTimePct: b.kind === 'extra-time' ? pct : 0, evidence: clean(b.evidence, 600), validFrom: b.validFrom || '', validTo: b.validTo || '', reviewOn: b.reviewOn || S.addDays(day, set.accommodationReviewDays), proposedById: oid(req.user.userId), proposedByName: req.actorName || '' });
  await N.notify({ schoolId: s, recipients: await S.holders(s, 'care.case.work', req.user.userId), title: 'A support adjustment needs a decision', body: `${st.name}: ${b.kind}`, type: 'care', link: '#/care', key: `care-acc:${a._id}` });
  res.status(201).json({ accommodation: a });
});
exports.decideAccommodation = wrap('decideAcc', async (req, res) => {
  const c = await S.ctx(req); if (!c.work) return bad(res, 403, 'Only a support coordinator can decide.'); const s = sid(req); const a = await Accommodation.findOne({ _id: oid(req.params.id), schoolId: s }); if (!a) return bad(res, 404, 'Not found.');
  if (a.status !== 'Proposed') return bad(res, 409, 'This was already decided.'); const approve = (req.body || {}).approve !== false; const note = clean((req.body || {}).note, 300);
  let sole = false;
  if (String(a.proposedById) === c.userId) { const others = await S.otherApprovers(s, 'care.case.work', c.userId); if (others.length) return bad(res, 403, 'A different coordinator must decide on what you proposed.'); sole = true; }
  if (!approve && note.length < 3) return bad(res, 422, 'Say why it is declined.'); const day = await S.today(s);
  const u = await Accommodation.updateOne({ _id: a._id, schoolId: s, status: 'Proposed' }, { $set: { status: approve ? 'Active' : 'Declined', decidedById: oid(req.user.userId), decidedByName: req.actorName || '', decidedAt: new Date(), decisionNote: note, soleApprover: sole, ...(approve && !a.validFrom ? { validFrom: day } : {}) } });
  if (!u.modifiedCount) return bad(res, 409, 'This was already decided.');
  await audit(req, { action: approve ? 'care.accommodation.approve' : 'care.accommodation.decline', entityType: 'Accommodation', entityId: a._id, schoolId: s, detail: { student: a.studentName, kind: a.kind, sole } });
  if (approve) { const par = await N.parentsOf(s, [a.studentId]); const tea = (await C().teachersOfClass(s, a.classId)).map((t) => ({ id: t._id, role: 'teacher' }));
    if (par.length) await N.notify({ schoolId: s, recipients: par, title: `A support adjustment was agreed for ${a.studentName}`, body: `${a.kind}. Open Wellbeing for details.`, type: 'care', link: '#/wellbeing', key: `care-acc-p:${a._id}` });
    if (tea.length) await N.notify({ schoolId: s, recipients: tea, title: `Adjustment for ${a.studentName}`, body: `${a.kind}${a.extraTimePct ? ` (${a.extraTimePct}% extra time)` : ''}: ${a.detail.slice(0, 80)}`, type: 'care', link: '#/care', key: `care-acc-t:${a._id}` }); }
  res.json({ ok: true, status: approve ? 'Active' : 'Declined', sole });
});
const C = () => S.C;
exports.endAccommodation = wrap('endAcc', async (req, res) => {
  const c = await S.ctx(req); if (!c.work) return bad(res, 403, 'Only a support coordinator can end an adjustment.'); const s = sid(req); const day = await S.today(s);
  const u = await Accommodation.updateOne({ _id: oid(req.params.id), schoolId: s, status: 'Active' }, { $set: { status: 'Ended', endedAt: new Date(), validTo: day, decisionNote: clean((req.body || {}).note, 300) } }); if (!u.modifiedCount) return bad(res, 404, 'No active adjustment.'); res.json({ ok: true });
});
exports.listAccommodations = wrap('listAcc', async (req, res) => {
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Staff only.'); const s = sid(req); const day = await S.today(s); const f = { schoolId: s };
  if (oid(req.query.studentId)) f.studentId = oid(req.query.studentId); if (['Proposed', 'Active', 'Declined', 'Ended'].includes(req.query.status)) f.status = req.query.status;
  if (!c.work) { if (!c.classIds.size) return res.json({ accommodations: [] }); f.classId = { $in: [...c.classIds].map(oid) }; f.status = 'Active'; }
  let rows = await Accommodation.find(f).sort({ createdAt: -1 }).limit(300); if (!c.work) rows = rows.filter((a) => liveOn(a, day));
  res.json({ accommodations: rows.map((a) => (c.work ? a : { _id: a._id, studentId: a.studentId, studentName: a.studentName, kind: a.kind, detail: a.detail, extraTimePct: a.extraTimePct, validTo: a.validTo })) });
});
// For exams and timetables: who needs what on a day
exports.forClass = wrap('accClass', async (req, res) => {
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Staff only.'); if (!(c.work || c.classIds.has(String(req.params.classId)))) return bad(res, 404, 'Class not found.');
  const s = sid(req); const day = S.isDay(req.query.day) ? req.query.day : await S.today(s); const rows = (await Accommodation.find({ schoolId: s, classId: oid(req.params.classId), status: 'Active' })).filter((a) => liveOn(a, day));
  const by = {}; for (const a of rows) { (by[a.studentId] = by[a.studentId] || { studentId: a.studentId, studentName: a.studentName, extraTimePct: 0, adjustments: [] }); by[a.studentId].extraTimePct = Math.max(by[a.studentId].extraTimePct, a.extraTimePct || 0); by[a.studentId].adjustments.push({ kind: a.kind, detail: a.detail }); }
  res.json({ day, students: Object.values(by) });
});
// A teacher's view of one class: who needs what, at a glance
exports.classView = wrap('classView', async (req, res) => {
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Staff only.'); const cid = oid(req.params.classId); if (!(c.work || c.health || c.classIds.has(String(cid)))) return bad(res, 404, 'Class not found.');
  const s = sid(req); const day = await S.today(s); const kids = await Student.find({ schoolId: s, classId: cid, isActive: { $ne: false } }).select('name rollNumber').sort({ rollNumber: 1, name: 1 }); const ids = kids.map((k) => k._id);
  const [acc, plans, goals] = await Promise.all([Accommodation.find({ schoolId: s, studentId: { $in: ids }, status: 'Active' }), HealthPlan.find({ schoolId: s, studentId: { $in: ids }, alert: true }).select('studentId'), CareGoal.find({ schoolId: s, studentId: { $in: ids }, status: 'Active', kind: 'iep' }).select('studentId')]);
  const me = oid(req.user.userId); const cases = await CareCase.find({ schoolId: s, studentId: { $in: ids }, status: { $ne: 'Closed' }, $or: [{ leadId: me }, { 'circle.id': me }] }).select('studentId number title confidential');
  res.json({ day, students: kids.map((k) => ({ _id: k._id, name: k.name, rollNumber: k.rollNumber, healthAlert: plans.some((p) => String(p.studentId) === String(k._id)), accommodations: acc.filter((a) => String(a.studentId) === String(k._id) && liveOn(a, day)).map((a) => ({ kind: a.kind, detail: a.detail, extraTimePct: a.extraTimePct })), iepGoals: goals.filter((g) => String(g.studentId) === String(k._id)).length, myCases: cases.filter((x) => String(x.studentId) === String(k._id)).map((x) => ({ _id: x._id, number: x.number, title: x.confidential ? 'Confidential' : x.title })) })) });
});

/* ───────── goals and achievements ───────── */
exports.addGoal = wrap('addGoal', async (req, res) => {
  const b = req.body || {}; const s = sid(req); const role = req.user.role; let st;
  if (role === 'student') { st = await S.studentOf(req, req.user.userId); if (!st) return bad(res, 404, 'Student not found.'); if (b.kind && b.kind !== 'personal') return bad(res, 403, 'You can add your own goals.'); }
  else { const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Not allowed.'); st = await S.studentOf(req, b.studentId); if (!st || !S.canTouch(c, st)) return bad(res, 404, 'Student not found.'); if (b.kind === 'iep' && !c.work) return bad(res, 403, 'Only a support coordinator sets learning plan goals.'); }
  const kind = role === 'student' ? 'personal' : (['iep', 'personal', 'achievement'].includes(b.kind) ? b.kind : 'personal'); const title = clean(b.title, 140); if (title.length < 3) return bad(res, 422, 'Give it a title.');
  if (b.dueOn && !S.isDay(b.dueOn)) return bad(res, 422, 'Due date must look like 2026-03-31.');
  const g = await CareGoal.create({ schoolId: s, studentId: st._id, studentName: st.name, kind, title, target: clean(b.target, 300), dueOn: b.dueOn || '', progress: kind === 'achievement' ? 100 : 0, status: kind === 'achievement' ? 'Met' : 'Active', shared: b.shared !== false, ownerId: oid(req.user.userId), ownerRole: role, ownerName: req.actorName || '' });
  if (kind === 'achievement' && g.shared) { const to = [{ id: st._id, role: 'student' }, ...(await N.parentsOf(s, [st._id]))]; await N.notify({ schoolId: s, recipients: to, title: `Well done, ${st.name}!`, body: title, type: 'care', link: '#/wellbeing', key: `care-ach:${g._id}` }); }
  res.status(201).json({ goal: g });
});
exports.reviewGoal = wrap('reviewGoal', async (req, res) => {
  const s = sid(req); const g = await CareGoal.findOne({ _id: oid(req.params.id), schoolId: s }); if (!g) return bad(res, 404, 'Goal not found.'); const role = req.user.role; const c = await S.ctx(req);
  const mine = String(g.ownerId) === String(req.user.userId); const ok = mine || c.work || (role === 'student' && String(g.studentId) === String(req.user.userId) && g.kind === 'personal'); if (!ok) return bad(res, 403, 'This goal is not yours to review.');
  if (g.status !== 'Active') return bad(res, 409, 'This goal is finished.'); const p = Number((req.body || {}).progress); if (!Number.isInteger(p) || p < 0 || p > 100) return bad(res, 422, 'Progress is 0 to 100.');
  const drop = (req.body || {}).drop === true; const met = p >= 100;
  await CareGoal.updateOne({ _id: g._id, schoolId: s }, { $set: { progress: drop ? g.progress : p, status: drop ? 'Dropped' : met ? 'Met' : 'Active' }, $push: { reviews: { at: new Date(), progress: p, note: clean((req.body || {}).note, 300), byName: req.actorName || '' } } });
  res.json({ ok: true, status: drop ? 'Dropped' : met ? 'Met' : 'Active' });
});
exports.listGoals = wrap('listGoals', async (req, res) => {
  const s = sid(req); const f = { schoolId: s }; const role = req.user.role;
  if (role === 'student') f.studentId = oid(req.user.userId);
  else if (role === 'parent') { const k = await S.familyChild(req, req.query.studentId, 'viewInfo'); if (!k) return bad(res, 404, 'Child not found.'); f.studentId = k.student._id; f.shared = true; f.kind = { $ne: 'iep' }; }
  else { const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Not allowed.'); const st = await S.studentOf(req, req.query.studentId); if (!st || !S.canTouch(c, st)) return bad(res, 404, 'Student not found.'); f.studentId = st._id; }
  res.json({ goals: await CareGoal.find(f).sort({ createdAt: -1 }).limit(100) });
});

/* ───────── appointments ───────── */
const overlaps = async (s, staffId, at, mins, exceptId) => {
  const from = new Date(at.getTime() - 120 * 60000); const to = new Date(at.getTime() + mins * 60000);
  const rows = await CareAppointment.find({ schoolId: s, staffId, status: 'Booked', at: { $gte: from, $lt: to } });
  return rows.some((r) => String(r._id) !== String(exceptId) && r.at < new Date(at.getTime() + mins * 60000) && new Date(r.at.getTime() + (r.durationMin || 30) * 60000) > at);
};
const rightFor = (c, kind) => (kind === 'counselling' ? c.counsel : kind === 'nurse' ? c.health : c.work);
exports.requestAppointment = wrap('reqAppt', async (req, res) => {
  const role = req.user.role; const b = req.body || {}; const s = sid(req); const kind = String(b.kind || '');
  if (!['counselling', 'nurse', 'mentor', 'parent-meeting'].includes(kind)) return bad(res, 422, 'Choose who you want to see.');
  const c = await S.ctx(req); let st; let status = 'Requested'; let staff = null; let at = null; const mins = Number(b.durationMin) || 30;
  if (role === 'student') { if (!['counselling', 'nurse'].includes(kind)) return bad(res, 403, 'You can ask for the counsellor or the nurse.'); st = await S.studentOf(req, req.user.userId); }
  else if (role === 'parent') { if (!['parent-meeting', 'nurse'].includes(kind)) return bad(res, 403, 'You can ask for a meeting or the nurse.'); const k = await S.familyChild(req, b.studentId, 'receiveMessages'); if (!k) return bad(res, 403, 'You cannot ask for this child.'); st = k.student; }
  else { if (!c.staff) return bad(res, 403, 'Not allowed.'); st = await S.studentOf(req, b.studentId); if (!st || !S.canTouch(c, st)) return bad(res, 404, 'Student not found.'); }
  if (!st) return bad(res, 404, 'Student not found.');
  if (c.staff && (b.at || b.staffId)) {
    if (!rightFor(c, kind) && !(kind === 'mentor' && c.classIds.size)) return bad(res, 403, 'You cannot book this kind of appointment.'); at = new Date(b.at); if (Number.isNaN(at.getTime())) return bad(res, 422, 'Choose a time.');
    if (mins < 10 || mins > 180) return bad(res, 422, 'Choose 10 to 180 minutes.'); staff = await S.person(s, b.staffId || req.user.userId); if (!staff) return bad(res, 422, 'That person is not on staff.');
    if (await overlaps(s, staff.id, at, mins)) return bad(res, 409, `${staff.name} already has something at that time.`); status = 'Booked';
  }
  const a = await CareAppointment.create({ schoolId: s, studentId: st._id, studentName: st.name, kind, staffId: staff ? staff.id : null, staffName: staff ? staff.name : '', at, durationMin: mins, room: clean(b.room, 40), status, requestedByRole: role, reasonLine: kind === 'counselling' && role !== 'student' ? '' : clean(b.reason, 160) });
  if (status === 'Requested') { const act = kind === 'counselling' ? 'care.counsel' : kind === 'nurse' ? 'care.health.manage' : 'care.case.work'; await N.notify({ schoolId: s, recipients: await S.holders(s, act), title: kind === 'counselling' ? 'A student asked to see the counsellor' : kind === 'nurse' ? `${st.name} asked to see the nurse` : 'A meeting was requested', body: kind === 'counselling' ? 'Open Student care to book a time.' : st.name, type: 'care', link: '#/care', key: `care-appt:${a._id}` }); }
  else await notifyBooked(s, a, st);
  res.status(201).json({ appointment: a });
});
async function notifyBooked(s, a, st) {
  const to = a.kind === 'parent-meeting' ? await N.parentsOf(s, [a.studentId]) : [{ id: a.studentId, role: 'student' }, ...(a.kind === 'nurse' || a.kind === 'mentor' ? await N.parentsOf(s, [a.studentId]) : [])];
  if (to.length) await N.notify({ schoolId: s, recipients: to, title: `${st.name}: appointment booked`, body: `${a.kind === 'parent-meeting' ? 'Meeting' : a.kind === 'counselling' ? 'Support session' : a.kind === 'nurse' ? 'Sick bay' : 'Mentor'} on ${a.at.toISOString().slice(0, 16).replace('T', ' ')} UTC with ${a.staffName}.`, type: 'care', link: '#/wellbeing', key: `care-appt-b:${a._id}:${a.at.getTime()}` });
}
exports.scheduleAppointment = wrap('schedAppt', async (req, res) => {
  const c = await S.ctx(req); const s = sid(req); const a = await CareAppointment.findOne({ _id: oid(req.params.id), schoolId: s }); if (!a) return bad(res, 404, 'Appointment not found.'); if (!rightFor(c, a.kind)) return bad(res, 403, 'You cannot book this kind of appointment.');
  if (!['Requested', 'Booked'].includes(a.status)) return bad(res, 409, 'This appointment is finished.'); const b = req.body || {}; const at = new Date(b.at); if (Number.isNaN(at.getTime())) return bad(res, 422, 'Choose a time.');
  const mins = Number(b.durationMin) || a.durationMin || 30; if (mins < 10 || mins > 180) return bad(res, 422, 'Choose 10 to 180 minutes.'); const staff = await S.person(s, b.staffId || req.user.userId); if (!staff) return bad(res, 422, 'That person is not on staff.');
  if (await overlaps(s, staff.id, at, mins, a._id)) return bad(res, 409, `${staff.name} already has something at that time.`);
  await CareAppointment.updateOne({ _id: a._id, schoolId: s }, { $set: { status: 'Booked', at, durationMin: mins, staffId: staff.id, staffName: staff.name, room: clean(b.room, 40) || a.room } });
  const st = await S.studentOf(req, a.studentId); await notifyBooked(s, { ...a.toObject(), at, staffName: staff.name }, st || { name: a.studentName }); res.json({ ok: true });
});
exports.setAppointment = wrap('setAppt', async (req, res) => {
  const role = req.user.role; const s = sid(req); const a = await CareAppointment.findOne({ _id: oid(req.params.id), schoolId: s }); if (!a) return bad(res, 404, 'Appointment not found.'); const to = String((req.body || {}).status || '');
  if (!['Done', 'Missed', 'Cancelled'].includes(to)) return bad(res, 422, 'Use Done, Missed or Cancelled.'); if (!['Requested', 'Booked'].includes(a.status)) return bad(res, 409, 'Already finished.');
  const c = await S.ctx(req); const own = (role === 'student' && String(a.studentId) === String(req.user.userId)) || (role === 'parent' && !!(await S.familyChild(req, a.studentId, 'receiveMessages')));
  if (own) { if (to !== 'Cancelled') return bad(res, 403, 'You can cancel your own request.'); } else if (!(rightFor(c, a.kind) || String(a.staffId || '') === c.userId)) return bad(res, 403, 'Not allowed.');
  if (to !== 'Cancelled' && a.status !== 'Booked') return bad(res, 422, 'Book a time first.');
  await CareAppointment.updateOne({ _id: a._id, schoolId: s }, { $set: { status: to } }); res.json({ ok: true });
});
function apptFilter(req, c) {
  const s = sid(req); const f = { schoolId: s }; const q = req.query;
  if (oid(q.studentId)) f.studentId = oid(q.studentId); if (['Requested', 'Booked', 'Done', 'Missed', 'Cancelled'].includes(q.status)) f.status = q.status; if (q.status === 'open') f.status = { $in: ['Requested', 'Booked'] };
  if (S.isDay(q.day)) { f.at = { $gte: new Date(`${q.day}T00:00:00Z`), $lt: new Date(`${S.addDays(q.day, 1)}T00:00:00Z`) }; }
  const kinds = []; if (c.counsel) kinds.push('counselling'); if (c.health) kinds.push('nurse'); if (c.work) kinds.push('parent-meeting', 'mentor', 'nurse'); return { f, kinds: [...new Set(kinds)] };
}
exports.listAppointments = wrap('listAppt', async (req, res) => {
  const s = sid(req); const role = req.user.role;
  if (role === 'student') return res.json({ appointments: await CareAppointment.find({ schoolId: s, studentId: oid(req.user.userId) }).sort({ at: -1 }).limit(50) });
  if (role === 'parent') { const kids = await S.myChildren(req); const ids = kids.filter((k) => k.rights.receiveMessages || k.rights.viewInfo).map((k) => k.student._id); return res.json({ appointments: await CareAppointment.find({ schoolId: s, studentId: { $in: ids }, kind: { $ne: 'counselling' } }).sort({ at: -1 }).limit(50) }); }
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Not allowed.'); const { f, kinds } = apptFilter(req, c); const me = oid(req.user.userId);
  f.$or = [{ staffId: me }, ...(kinds.length ? [{ kind: { $in: kinds } }] : [])];
  let rows = await CareAppointment.find(f).sort({ at: 1 }).limit(200);
  // counselling appointments are only for counsellors (and the person booked)
  rows = rows.filter((a) => a.kind !== 'counselling' || c.counsel || String(a.staffId || '') === c.userId); res.json({ appointments: rows });
});

/* ───────── mentors ───────── */
exports.addMentor = wrap('addMentor', async (req, res) => {
  const c = await S.ctx(req); if (!c.work) return bad(res, 403, 'Only a support coordinator pairs mentors.'); const s = sid(req); const b = req.body || {}; const st = await S.studentOf(req, b.studentId); if (!st) return bad(res, 404, 'Student not found.');
  const m = await S.person(s, b.mentorId); if (!m) return bad(res, 422, 'That mentor is not on staff.'); if (await MentorPair.findOne({ schoolId: s, studentId: st._id, mentorId: m.id, status: 'Active' })) return bad(res, 409, 'Already paired.');
  const day = await S.today(s); const p = await MentorPair.create({ schoolId: s, studentId: st._id, studentName: st.name, mentorId: m.id, mentorName: m.name, focus: clean(b.focus, 300), startedOn: day });
  await N.notify({ schoolId: s, recipients: [{ id: m.id, role: roleOf(m) }, { id: st._id, role: 'student' }, ...(await N.parentsOf(s, [st._id]))], title: `${m.name} will mentor ${st.name}`, body: clean(b.focus, 100), type: 'care', link: '#/care', key: `care-mentor:${p._id}` });
  res.status(201).json({ pair: p });
});
exports.mentorMeeting = wrap('mentorMeet', async (req, res) => {
  const c = await S.ctx(req); const s = sid(req); const p = await MentorPair.findOne({ _id: oid(req.params.id), schoolId: s }); if (!p) return bad(res, 404, 'Pair not found.'); if (!(c.work || String(p.mentorId) === c.userId)) return bad(res, 403, 'Only the mentor can log a meeting.');
  if (p.status !== 'Active') return bad(res, 409, 'This pairing has ended.'); const note = clean((req.body || {}).note, 400); if (note.length < 3) return bad(res, 422, 'Write a short note.');
  await MentorPair.updateOne({ _id: p._id, schoolId: s }, { $push: { meetings: { at: new Date(), note } } }); res.json({ ok: true });
});
exports.endMentor = wrap('endMentor', async (req, res) => {
  const c = await S.ctx(req); if (!c.work) return bad(res, 403, 'Only a support coordinator ends a pairing.'); const s = sid(req); const day = await S.today(s);
  const u = await MentorPair.updateOne({ _id: oid(req.params.id), schoolId: s, status: 'Active' }, { $set: { status: 'Ended', endedOn: day } }); if (!u.modifiedCount) return bad(res, 404, 'No active pairing.'); res.json({ ok: true });
});
exports.listMentors = wrap('listMentors', async (req, res) => {
  const s = sid(req); const role = req.user.role;
  if (role === 'student') return res.json({ pairs: (await MentorPair.find({ schoolId: s, studentId: oid(req.user.userId), status: 'Active' })).map((p) => ({ _id: p._id, mentorName: p.mentorName, focus: p.focus, startedOn: p.startedOn, meetings: (p.meetings || []).length })) });
  if (role === 'parent') { const ids = (await S.myChildren(req)).map((k) => k.student._id); return res.json({ pairs: (await MentorPair.find({ schoolId: s, studentId: { $in: ids }, status: 'Active' })).map((p) => ({ _id: p._id, studentId: p.studentId, studentName: p.studentName, mentorName: p.mentorName, focus: p.focus, meetings: (p.meetings || []).length })) }); }
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Not allowed.'); const f = { schoolId: s }; if (!c.work) f.mentorId = oid(req.user.userId); if (oid(req.query.studentId)) f.studentId = oid(req.query.studentId); if (req.query.status !== 'all') f.status = 'Active';
  res.json({ pairs: await MentorPair.find(f).sort({ createdAt: -1 }).limit(200) });
});

/* ───────── careers ───────── */
const PATHWAYS = [
  { id: 'medicine', name: 'Medicine and health sciences', keys: ['biology', 'medicine', 'doctor', 'nursing', 'health', 'helping', 'science'], subjects: ['Biology', 'Chemistry', 'Physics'] },
  { id: 'engineering', name: 'Engineering', keys: ['engineering', 'building', 'maths', 'physics', 'machines', 'robots', 'design'], subjects: ['Mathematics', 'Physics', 'Computer Science'] },
  { id: 'computing', name: 'Computing and technology', keys: ['computer', 'coding', 'programming', 'games', 'technology', 'ai', 'software'], subjects: ['Computer Science', 'Mathematics'] },
  { id: 'business', name: 'Business and finance', keys: ['business', 'money', 'accounting', 'finance', 'trade', 'leading', 'shop'], subjects: ['Economics', 'Accounting', 'Mathematics'] },
  { id: 'law', name: 'Law and public service', keys: ['law', 'debate', 'justice', 'politics', 'public', 'speaking'], subjects: ['English', 'Social Studies', 'Islamiyat'] },
  { id: 'teaching', name: 'Teaching and education', keys: ['teaching', 'children', 'school', 'explaining', 'reading'], subjects: ['English', 'Urdu', 'Mathematics'] },
  { id: 'arts', name: 'Arts, design and media', keys: ['art', 'drawing', 'music', 'writing', 'media', 'film', 'fashion', 'design'], subjects: ['Art', 'English', 'Computer Science'] },
  { id: 'agri', name: 'Agriculture and environment', keys: ['farming', 'plants', 'animals', 'environment', 'nature', 'agriculture'], subjects: ['Biology', 'Chemistry', 'Geography'] },
  { id: 'trades', name: 'Skilled trades and vocational training', keys: ['hands', 'repair', 'electric', 'cars', 'cooking', 'sewing', 'workshop'], subjects: ['Technical Drawing', 'Mathematics'] },
  { id: 'sports', name: 'Sport and fitness', keys: ['sport', 'cricket', 'football', 'fitness', 'coaching', 'running'], subjects: ['Physical Education', 'Biology'] },
];
const suggest = (interests, strengths) => {
  const words = [...interests, ...strengths].map((x) => String(x).toLowerCase()); if (!words.length) return [];
  return PATHWAYS.map((p) => ({ ...p, score: p.keys.filter((k) => words.some((w) => w.includes(k) || k.includes(w))).length })).filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(({ id, name, subjects, score }) => ({ id, name, subjects, score }));
};
exports.pathways = wrap('pathways', async (req, res) => res.json({ pathways: PATHWAYS.map(({ id, name, subjects }) => ({ id, name, subjects })) }));
async function careerTarget(req, studentId) {
  const role = req.user.role; if (role === 'student') { const st = await S.studentOf(req, req.user.userId); return st ? { st, self: true } : null; }
  if (role === 'parent') { const k = await S.familyChild(req, studentId, 'viewInfo'); return k ? { st: k.student, parent: true } : null; }
  const c = await S.ctx(req); if (!c.staff) return null; const st = await S.studentOf(req, studentId); return st && S.canTouch(c, st) ? { st, c } : null;
}
exports.getCareer = wrap('getCareer', async (req, res) => {
  const t = await careerTarget(req, req.params.studentId); if (!t) return bad(res, 404, 'Student not found.'); const doc = await CareCareer.findOne({ schoolId: sid(req), studentId: t.st._id });
  res.json({ student: { _id: t.st._id, name: t.st.name }, career: doc, suggestions: suggest(doc ? doc.interests : [], doc ? doc.strengths : []) });
});
exports.putCareer = wrap('putCareer', async (req, res) => {
  const t = await careerTarget(req, req.params.studentId); if (!t || t.parent) return bad(res, 404, 'Student not found.'); const b = req.body || {}; const s = sid(req); const tags = (v) => (Array.isArray(v) ? [...new Set(v.slice(0, 12).map((x) => clean(x, 40)).filter(Boolean))] : []);
  const set = { studentName: t.st.name, updatedByRole: req.user.role }; if (b.interests !== undefined) set.interests = tags(b.interests); if (b.strengths !== undefined) set.strengths = tags(b.strengths); if (b.notes !== undefined) set.notes = clean(b.notes, 600);
  if (!t.self) { if (b.pathway !== undefined) set.pathway = clean(b.pathway, 100); if (b.subjects !== undefined) set.subjects = tags(b.subjects); if (b.nextStep !== undefined) set.nextStep = clean(b.nextStep, 300); set.reviewedByName = req.actorName || ''; set.reviewedAt = new Date(); }
  const cur = await CareCareer.findOne({ schoolId: s, studentId: t.st._id }); if (cur) await CareCareer.updateOne({ _id: cur._id, schoolId: s }, { $set: set }); else { try { await CareCareer.create({ schoolId: s, studentId: t.st._id, ...set }); } catch (e) { if (e.code !== 11000) throw e; await CareCareer.updateOne({ schoolId: s, studentId: t.st._id }, { $set: set }); } }
  const doc = await CareCareer.findOne({ schoolId: s, studentId: t.st._id }); res.json({ career: doc, suggestions: suggest(doc.interests, doc.strengths) });
});

/* ───────── training ───────── */
const COURSES = ['safeguarding', 'first-aid', 'anti-bullying', 'special-needs', 'mental-health'];
exports.addTraining = wrap('addTraining', async (req, res) => {
  const c = await S.ctx(req); if (!c.work && !c.dsl) return bad(res, 403, 'Not allowed.'); const s = sid(req); const b = req.body || {}; if (!COURSES.includes(b.course)) return bad(res, 422, 'Choose a course.');
  if (!S.isDay(b.completedOn)) return bad(res, 422, 'Completion date must look like 2026-03-31.'); const p = await S.person(s, b.staffId); if (!p) return bad(res, 404, 'Staff member not found.'); const set = await S.getSettings(s);
  let exp = b.expiresOn; if (exp && !S.isDay(exp)) return bad(res, 422, 'Expiry date must look like 2026-03-31.'); if (!exp) { const d = new Date(`${b.completedOn}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + set.trainingMonths); exp = d.toISOString().slice(0, 10); }
  if (exp < b.completedOn) return bad(res, 422, 'It expires before it was completed.');
  const t = await CareTraining.create({ schoolId: s, staffId: p.id, staffModel: p.model, staffName: p.name, course: b.course, completedOn: b.completedOn, expiresOn: exp, note: clean(b.note, 200), recordedByName: req.actorName || '' }); res.status(201).json({ training: t });
});
exports.trainingRegister = wrap('register', async (req, res) => {
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Staff only.'); const s = sid(req); const day = await S.today(s); const mine = !(c.work || c.dsl);
  const staff = await S.staffList(s); const all = await CareTraining.find({ schoolId: s, ...(mine ? { staffId: oid(req.user.userId) } : {}) }).sort({ completedOn: -1 }).limit(2000);
  const soon = S.addDays(day, 30);
  const rows = (mine ? staff.filter((p) => String(p.id) === c.userId) : staff).map((p) => {
    const courses = {}; for (const k of COURSES) { const r = all.find((x) => String(x.staffId) === String(p.id) && x.course === k); courses[k] = r ? { completedOn: r.completedOn, expiresOn: r.expiresOn, state: r.expiresOn < day ? 'expired' : r.expiresOn <= soon ? 'expiring' : 'valid' } : { state: 'missing' }; }
    return { staffId: p.id, name: p.name, model: p.model, courses };
  });
  res.json({ day, courses: COURSES, staff: rows, safeguardingGaps: rows.filter((r) => r.model === 'Teacher' && ['missing', 'expired'].includes(r.courses.safeguarding.state)).length });
});

/* ───────── what a family or a student sees ───────── */
exports.familySupport = wrap('familySupport', async (req, res) => {
  const s = sid(req); const day = await S.today(s); const kids = await S.myChildren(req); const out = [];
  for (const k of kids) {
    const id = k.student._id; const self = !!k.self;
    const [acc, goals, appts, pairs, career] = await Promise.all([Accommodation.find({ schoolId: s, studentId: id, status: 'Active' }), CareGoal.find({ schoolId: s, studentId: id, ...(self ? {} : { shared: true, kind: { $ne: 'iep' } }) }).sort({ createdAt: -1 }).limit(30),
      CareAppointment.find({ schoolId: s, studentId: id, status: { $in: ['Requested', 'Booked'] }, ...(self ? {} : { kind: { $ne: 'counselling' } }) }).sort({ at: 1 }).limit(20), MentorPair.find({ schoolId: s, studentId: id, status: 'Active' }), CareCareer.findOne({ schoolId: s, studentId: id })]);
    out.push({ studentId: id, name: k.student.name, self, className: await S.className(k.student.classId),
      accommodations: acc.filter((a) => liveOn(a, day)).map((a) => ({ kind: a.kind, detail: a.detail, extraTimePct: a.extraTimePct, validTo: a.validTo })), goals, appointments: appts, mentors: pairs.map((p) => ({ mentorName: p.mentorName, focus: p.focus, meetings: (p.meetings || []).length })),
      career: career ? { interests: career.interests, strengths: career.strengths, pathway: career.pathway, subjects: career.subjects, nextStep: career.nextStep } : null, canMessage: !!(k.rights && (k.rights.receiveMessages || self)) });
  }
  res.json({ children: out });
});
