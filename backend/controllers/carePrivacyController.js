// Privacy requests about the care data held on a child (PRD E21: PrivacyRequest).
//   An access export never contains safeguarding records, private counselling notes, concerns, or anything about other people.
//   Erasure removes what the school keeps by choice; safeguarding records and health plans stay under a legal hold, and the answer says so.
const S = require('../utils/care/service');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const PrivacyRequest = require('../models/PrivacyRequest');
const HealthPlan = require('../models/HealthPlan');
const HealthIncident = require('../models/HealthIncident');
const MedicationLog = require('../models/MedicationLog');
const Accommodation = require('../models/Accommodation');
const CareGoal = require('../models/CareGoal');
const CareAppointment = require('../models/CareAppointment');
const CareCareer = require('../models/CareCareer');
const MentorPair = require('../models/MentorPair');
const CareCase = require('../models/CareCase');

const { oid, sid, bad, wrap, clean, pg } = S;
const KINDS = ['access', 'correction', 'restrict', 'erasure'];

exports.create = wrap('privCreate', async (req, res) => {
  const role = req.user.role; if (!['parent', 'student'].includes(role)) return bad(res, 403, 'Families and students send privacy requests.');
  const b = req.body || {}; const kid = await S.familyChild(req, role === 'student' ? req.user.userId : b.studentId, 'viewInfo'); if (!kid) return bad(res, 404, 'Child not found.');
  if (!KINDS.includes(b.kind)) return bad(res, 422, 'Choose what you are asking for.'); const detail = clean(b.detail, 800); if (b.kind !== 'access' && detail.length < 5) return bad(res, 422, 'Tell us what you want changed or removed.');
  const s = sid(req); const set = await S.getSettings(s); const dueAt = new Date(Date.now() + set.privacyDays * 86400000);
  const r = await PrivacyRequest.create({ schoolId: s, number: await S.nextNumber(s, 'PR'), studentId: kid.student._id, studentName: kid.student.name, requesterId: oid(req.user.userId), requesterRole: role, requesterName: req.actorName || '', kind: b.kind, detail, dueAt });
  await N.notify({ schoolId: s, recipients: await S.holders(s, 'care.privacy.manage'), title: 'A privacy request was received', body: `${r.number}: ${b.kind} for ${kid.student.name}. Due ${dueAt.toISOString().slice(0, 10)}.`, type: 'care', link: '#/care', key: `care-priv:${r._id}` });
  res.status(201).json({ request: r });
});
exports.list = wrap('privList', async (req, res) => {
  const s = sid(req); const c = await S.ctx(req); const { p, l } = pg(req.query); const f = { schoolId: s };
  if (c.privacy) { if (['Open', 'In review', 'Fulfilled', 'Refused'].includes(req.query.status)) f.status = req.query.status; else if (req.query.status === 'open') f.status = { $in: ['Open', 'In review'] }; } else f.requesterId = oid(req.user.userId);
  const [rows, total] = await Promise.all([PrivacyRequest.find(f).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), PrivacyRequest.countDocuments(f)]); res.json({ requests: rows, total, page: p, canManage: !!c.privacy });
});
exports.decide = wrap('privDecide', async (req, res) => {
  const c = await S.ctx(req); if (!c.privacy) return bad(res, 403, 'Not allowed.'); const s = sid(req); const r = await PrivacyRequest.findOne({ _id: oid(req.params.id), schoolId: s }); if (!r) return bad(res, 404, 'Request not found.');
  if (['Fulfilled', 'Refused'].includes(r.status)) return bad(res, 409, 'This was already answered.'); const b = req.body || {}; const action = String(b.action || '');
  if (action === 'review') { await PrivacyRequest.updateOne({ _id: r._id, schoolId: s }, { $set: { status: 'In review' } }); return res.json({ ok: true, status: 'In review' }); }
  if (!['fulfil', 'refuse'].includes(action)) return bad(res, 422, 'Use review, fulfil or refuse.'); let response = clean(b.response, 800); if (action === 'refuse' && response.length < 10) return bad(res, 422, 'Give the reason for refusing.');
  let legalHold = false; let removed = {};
  if (action === 'fulfil' && r.kind === 'erasure') {
    const held = await CareCase.countDocuments({ schoolId: s, studentId: r.studentId, confidential: true });
    const [g, ca, ap, mp] = await Promise.all([CareGoal.deleteMany({ schoolId: s, studentId: r.studentId }), CareCareer.deleteMany({ schoolId: s, studentId: r.studentId }), CareAppointment.deleteMany({ schoolId: s, studentId: r.studentId, status: { $in: ['Done', 'Cancelled', 'Missed'] } }), MentorPair.updateOne({ schoolId: s, studentId: r.studentId }, { $set: { meetings: [] } })]);
    removed = { goals: g.deletedCount || 0, career: ca.deletedCount || 0, appointments: ap.deletedCount || 0 }; legalHold = true;
    response = `${response ? `${response} ` : ''}Removed: goals, career notes and past appointments. Kept under legal hold: health plan${held ? ', safeguarding records' : ''} and the sick bay and medicine logs.`.slice(0, 800);
  }
  await PrivacyRequest.updateOne({ _id: r._id, schoolId: s }, { $set: { status: action === 'fulfil' ? 'Fulfilled' : 'Refused', response, legalHold, decidedByName: req.actorName || '', decidedAt: new Date() } });
  await audit(req, { action: `care.privacy.${action}`, entityType: 'PrivacyRequest', entityId: r._id, schoolId: s, detail: { number: r.number, kind: r.kind, removed } });
  await N.notify({ schoolId: s, recipients: [{ id: r.requesterId, role: r.requesterRole }], title: `Your privacy request ${r.number} was ${action === 'fulfil' ? 'answered' : 'refused'}`, body: response.slice(0, 160), type: 'care', link: '#/wellbeing', key: `care-priv-d:${r._id}` });
  res.json({ ok: true, status: action === 'fulfil' ? 'Fulfilled' : 'Refused', legalHold, removed });
});
// The export for an access request: health, adjustments, goals, appointments and sick bay history. Nothing from cases, notes or concerns.
exports.exportData = wrap('privExport', async (req, res) => {
  const s = sid(req); const c = await S.ctx(req); const r = await PrivacyRequest.findOne({ _id: oid(req.params.id), schoolId: s }); if (!r) return bad(res, 404, 'Request not found.');
  const mine = String(r.requesterId) === String(req.user.userId); if (!(c.privacy || mine)) return bad(res, 404, 'Request not found.');
  if (r.kind !== 'access') return bad(res, 422, 'Only access requests have an export.'); if (!c.privacy && r.status !== 'Fulfilled') return bad(res, 409, 'The school has not released this yet.');
  const id = r.studentId; const strip = (x) => { const o = x.toObject ? x.toObject() : x; for (const k of ['schoolId', '__v', 'proposal', 'receiptHash']) delete o[k]; return o; };
  const [plan, inc, doses, acc, goals, appts, career, mentors] = await Promise.all([HealthPlan.findOne({ schoolId: s, studentId: id }), HealthIncident.find({ schoolId: s, studentId: id }).sort({ at: -1 }), MedicationLog.find({ schoolId: s, studentId: id }).sort({ day: -1 }), Accommodation.find({ schoolId: s, studentId: id }), CareGoal.find({ schoolId: s, studentId: id }), CareAppointment.find({ schoolId: s, studentId: id }).sort({ at: -1 }), CareCareer.findOne({ schoolId: s, studentId: id }), MentorPair.find({ schoolId: s, studentId: id })]);
  await S.logRead(req, 'notes', r._id, id, c.privacy ? 'privacy' : 'family');
  res.json({ generatedAt: new Date(), request: r.number, student: { _id: id, name: r.studentName },
    excluded: 'Safeguarding and confidential case records, private counselling notes, concerns raised by others, and anything about other people are not part of this export.',
    healthPlan: plan ? strip(plan) : null, sickBayVisits: inc.map(strip), medicineLog: doses.map(strip), adjustments: acc.map(strip), goals: goals.map(strip),
    appointments: appts.map((a) => { const o = strip(a); if (a.kind === 'counselling') { delete o.reasonLine; } return o; }), career: career ? strip(career) : null, mentors: mentors.map((m) => ({ mentorName: m.mentorName, focus: m.focus, status: m.status, startedOn: m.startedOn, meetings: (m.meetings || []).length })) });
});
