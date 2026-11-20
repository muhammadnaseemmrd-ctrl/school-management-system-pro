// Time-based care duties (PRD E21): escalate unassigned or unseen concerns, review dates, medicine not recorded, expiring adjustments, overdue privacy requests, expired break-glass windows.
const S = require('./service');
const N = require('../notify');
const CareCase = require('../../models/CareCase');
const CareReport = require('../../models/CareReport');
const CareAccess = require('../../models/CareAccess');
const HealthPlan = require('../../models/HealthPlan');
const MedicationLog = require('../../models/MedicationLog');
const Accommodation = require('../../models/Accommodation');
const PrivacyRequest = require('../../models/PrivacyRequest');
const CareTraining = require('../../models/CareTraining');
const AppSetting = require('../../models/AppSetting');
const { dueDoses } = require('../../controllers/careHealthController');

const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
// once-only guard shared by repeated sweeps
async function once(key) { const u = await AppSetting.updateOne({ key }, { $setOnInsert: { value: 1 } }, { upsert: true }); return !!(u.upsertedCount || (u.matchedCount === 0)); }

async function run(schoolId, now = new Date()) {
  const s = S.oid(schoolId); const set = await S.getSettings(s); const clock = await S.C.K.tzOf(s); const { nowInTz } = require('../time'); const local = nowInTz(clock, now); const day = local.dateKey;
  const out = { escalatedCases: 0, escalatedReports: 0, reviewsDue: 0, missedDoses: 0, accommodationsEnded: 0, accommodationReviews: 0, privacyOverdue: 0, accessClosed: 0, trainingExpiring: 0 };
  const dsl = await S.holders(s, 'care.safeguarding.lead'); const admins = await N.admins(s);

  // cases with nobody leading them
  const cutoff = new Date(now.getTime() - set.escalateHours * 3600000);
  for (const k of await CareCase.find({ schoolId: s, status: 'Open', leadId: null, escalatedAt: null, createdAt: { $lte: cutoff } }).limit(200)) {
    const u = await CareCase.updateOne({ _id: k._id, schoolId: s, escalatedAt: null }, { $set: { escalatedAt: now }, $push: { events: { at: now, kind: 'escalated', byName: 'System', text: `No lead after ${set.escalateHours} hours.` } } });
    if (u.modifiedCount) { out.escalatedCases += 1; await N.notify({ schoolId: s, recipients: k.confidential ? dsl : admins, title: 'A support case still has no lead', body: k.confidential ? `${k.number} (confidential)` : `${k.number}: ${k.title}`, type: 'care', link: '#/care', key: `care-esc:${k._id}`, urgent: true }); }
  }
  // concerns nobody has looked at
  const rc = new Date(now.getTime() - set.reportTriageHours * 3600000);
  for (const d of await CareReport.find({ schoolId: s, status: 'New', escalatedAt: null, createdAt: { $lte: rc } }).limit(200)) {
    const u = await CareReport.updateOne({ _id: d._id, schoolId: s, escalatedAt: null }, { $set: { escalatedAt: now } });
    if (u.modifiedCount) { out.escalatedReports += 1; await N.notify({ schoolId: s, recipients: [...dsl, ...admins], title: 'A concern has not been looked at', body: `Waiting more than ${set.reportTriageHours} hours.`, type: 'safety', link: '#/care', key: `care-rep-esc:${d._id}`, urgent: true }); }
  }
  // review dates
  for (const k of await CareCase.find({ schoolId: s, status: { $in: ['Open', 'Active'] }, reviewOn: { $lte: day, $ne: '' } }).limit(300)) {
    if (!(await once(`care:review:${k._id}:${k.reviewOn}`))) continue; out.reviewsDue += 1;
    await CareCase.updateOne({ _id: k._id, schoolId: s }, { $set: { status: 'Review' }, $push: { events: { at: now, kind: 'status', byName: 'System', text: 'Review is due.' } } });
    const to = k.leadId ? [{ id: k.leadId, role: k.leadModel === 'User' ? 'admin' : 'teacher' }] : (k.confidential ? dsl : admins);
    await N.notify({ schoolId: s, recipients: to, title: 'A support case is due for review', body: k.confidential ? `${k.number} (confidential)` : `${k.number}: ${k.title}`, type: 'care', link: '#/care', key: `care-rev:${k._id}:${k.reviewOn}` });
  }
  // medicine not recorded two hours after its time
  const plans = await HealthPlan.find({ schoolId: s, 'medications.active': true }); const doses = await dueDoses(s, day, plans);
  for (const d of doses) {
    if (d.log || !d.slot || local.minutes < toMin(d.slot) + 120) continue;
    try { await MedicationLog.create({ schoolId: s, studentId: d.studentId, studentName: d.studentName, medId: d.medId, medName: d.name, dose: d.dose, day, slot: d.slot, status: 'missed', byId: null, byName: 'System', note: `Not recorded by ${hm(toMin(d.slot) + 120)}.` }); } catch (e) { if (e.code === 11000) continue; throw e; }
    out.missedDoses += 1; const par = await N.parentsOf(s, [d.studentId]);
    await N.notify({ schoolId: s, recipients: [...(await S.holders(s, 'care.health.manage')), ...par], title: `${d.studentName}: ${d.name} was not recorded`, body: `The ${d.slot} dose has no entry yet.`, type: 'care', link: '#/care', key: `care-miss:${d.studentId}:${d.medId}:${day}:${d.slot}`, urgent: true });
  }
  // medicines past their end date stop
  for (const p of plans) for (let i = 0; i < (p.medications || []).length; i += 1) { const m = p.medications[i]; if (m.active && m.endOn && m.endOn < day) await HealthPlan.updateOne({ _id: p._id, schoolId: s, 'medications._id': m._id }, { $set: { [`medications.${i}.active`]: false } }); }
  // adjustments: end the ones past their date, remind about reviews
  for (const a of await Accommodation.find({ schoolId: s, status: 'Active', validTo: { $lt: day, $ne: '' } }).limit(300)) { const u = await Accommodation.updateOne({ _id: a._id, schoolId: s, status: 'Active' }, { $set: { status: 'Ended', endedAt: now } }); if (u.modifiedCount) out.accommodationsEnded += 1; }
  for (const a of await Accommodation.find({ schoolId: s, status: 'Active', reviewOn: { $lte: day, $ne: '' } }).limit(300)) {
    if (!(await once(`care:accrev:${a._id}:${a.reviewOn}`))) continue; out.accommodationReviews += 1;
    await N.notify({ schoolId: s, recipients: await S.holders(s, 'care.case.work'), title: 'An adjustment is due for review', body: `${a.studentName}: ${a.kind}`, type: 'care', link: '#/care', key: `care-accrev:${a._id}:${a.reviewOn}` });
  }
  // privacy requests past their date
  for (const r of await PrivacyRequest.find({ schoolId: s, status: { $in: ['Open', 'In review'] }, dueAt: { $lt: now }, overdueNotified: false }).limit(100)) {
    const u = await PrivacyRequest.updateOne({ _id: r._id, schoolId: s, overdueNotified: false }, { $set: { overdueNotified: true } });
    if (u.modifiedCount) { out.privacyOverdue += 1; await N.notify({ schoolId: s, recipients: await S.holders(s, 'care.privacy.manage'), title: 'A privacy request is overdue', body: r.number, type: 'care', link: '#/care', key: `care-priv-o:${r._id}`, urgent: true }); }
  }
  // break-glass windows that have run out
  const n = await CareAccess.updateMany({ schoolId: s, status: 'Approved', validTo: { $lte: now } }, { $set: { status: 'Revoked' } }); out.accessClosed = n.modifiedCount || 0;
  // training that expires within a month (once per record)
  const soon = S.addDays(day, 30);
  for (const t of await CareTraining.find({ schoolId: s, course: 'safeguarding', expiresOn: { $lte: soon, $gte: day } }).limit(200)) {
    const newer = await CareTraining.findOne({ schoolId: s, staffId: t.staffId, course: 'safeguarding', completedOn: { $gt: t.completedOn } }); if (newer || !(await once(`care:train:${t._id}`))) continue;
    out.trainingExpiring += 1; await N.notify({ schoolId: s, recipients: [{ id: t.staffId, role: t.staffModel === 'User' ? 'admin' : 'teacher' }, ...(await S.holders(s, 'care.case.work'))], title: 'Safeguarding training is expiring', body: `${t.staffName}: ends ${t.expiresOn}.`, type: 'care', link: '#/care', key: `care-train:${t._id}` });
  }
  return out;
}
module.exports = { run };
