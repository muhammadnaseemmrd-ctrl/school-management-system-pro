// School health: health plans, medication, sick bay visits (PRD E21: HealthPlan, MedicationLog, HealthIncident).
//   Medicine is only recorded as given when a linked parent has consented to that medicine; each dose slot can be recorded once a day.
//   Teachers see an emergency alert for the children they teach, never the full health record. Every full read by staff is recorded.
const S = require('../utils/care/service');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const Student = require('../models/Student');
const HealthPlan = require('../models/HealthPlan');
const MedicationLog = require('../models/MedicationLog');
const HealthIncident = require('../models/HealthIncident');

const { oid, sid, bad, wrap, clean } = S;
const SEV = ['mild', 'moderate', 'severe'];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const list = (v, n, f) => (Array.isArray(v) ? v.slice(0, n).map(f).filter(Boolean) : []);
const cleanConditions = (v) => list(v, 20, (x) => (x && clean(x.name, 80) ? { name: clean(x.name, 80), severity: SEV.includes(x.severity) ? x.severity : 'mild', notes: clean(x.notes, 300) } : null));
const cleanAllergies = (v) => list(v, 20, (x) => (x && clean(x.allergen, 80) ? { allergen: clean(x.allergen, 80), reaction: clean(x.reaction, 200), severity: SEV.includes(x.severity) ? x.severity : 'mild' } : null));
const hasAlert = (p) => !!(p.emergencyPlan || (p.allergies || []).some((a) => a.severity !== 'mild') || (p.conditions || []).some((c) => c.severity === 'severe'));
// What a class teacher may see: enough to act in an emergency
const alertView = (p) => ({ studentId: p.studentId, studentName: p.studentName, allergies: (p.allergies || []).map((a) => ({ allergen: a.allergen, reaction: a.reaction, severity: a.severity })), conditions: (p.conditions || []).filter((c) => c.severity === 'severe').map((c) => ({ name: c.name, severity: c.severity })), emergencyPlan: p.emergencyPlan, diet: p.diet });
const medView = (m) => ({ _id: m._id, name: m.name, dose: m.dose, times: m.times, route: m.route, instructions: m.instructions, startOn: m.startOn, endOn: m.endOn, active: m.active, consented: !!m.consentAt, consentAt: m.consentAt, consentByName: m.consentByName });

async function needHealth(req, res) { const c = await S.ctx(req); if (!c.health) { bad(res, 403, 'You do not run the sick bay.'); return null; } return c; }

exports.summary = wrap('hsummary', async (req, res) => {
  if (!(await needHealth(req, res))) return; const s = sid(req); const day = await S.today(s);
  const [plans, incidents, logs] = await Promise.all([HealthPlan.find({ schoolId: s }).select('studentId alert medications proposal'), HealthIncident.countDocuments({ schoolId: s, day }), MedicationLog.find({ schoolId: s, day }).select('status')]);
  const due = await dueDoses(s, day, plans);
  res.json({ day, plans: plans.length, alerts: plans.filter((p) => p.alert).length, proposals: plans.filter((p) => p.proposal && p.proposal.at).length, incidentsToday: incidents, dosesToday: { total: due.length, given: due.filter((d) => d.log && d.log.status === 'given').length, open: due.filter((d) => !d.log).length, missed: due.filter((d) => d.log && ['missed', 'refused'].includes(d.log.status)).length }, logged: logs.length });
});

exports.getPlan = wrap('getPlan', async (req, res) => {
  const c = await S.ctx(req); const st = await S.studentOf(req, req.params.studentId); if (!st) return bad(res, 404, 'Student not found.');
  const p = await HealthPlan.findOne({ schoolId: sid(req), studentId: st._id });
  if (c.health) { await S.logRead(req, 'health', p ? p._id : st._id, st._id, 'health'); return res.json({ student: { _id: st._id, name: st.name, className: await S.className(st.classId) }, plan: p ? { ...p.toObject(), medications: (p.medications || []).map(medView) } : null, view: 'full' }); }
  if (!S.canTouch(c, st)) return bad(res, 404, 'Student not found.');
  res.json({ student: { _id: st._id, name: st.name, className: await S.className(st.classId) }, plan: p && p.alert ? alertView(p) : null, view: 'alert' });
});
exports.putPlan = wrap('putPlan', async (req, res) => {
  if (!(await needHealth(req, res))) return; const st = await S.studentOf(req, req.params.studentId); if (!st) return bad(res, 404, 'Student not found.'); const b = req.body || {}; const s = sid(req);
  const cur = await HealthPlan.findOne({ schoolId: s, studentId: st._id }); const set = { studentName: st.name, classId: st.classId || null, updatedByName: req.actorName || '', verifiedAt: new Date(), verifiedByName: req.actorName || '' };
  if (b.conditions !== undefined) set.conditions = cleanConditions(b.conditions); if (b.allergies !== undefined) set.allergies = cleanAllergies(b.allergies);
  for (const [k, n] of [['emergencyPlan', 1500], ['diet', 300], ['doctorName', 80], ['doctorPhone', 30]]) if (b[k] !== undefined) set[k] = clean(b[k], n);
  const merged = { ...(cur ? cur.toObject() : {}), ...set }; set.alert = hasAlert(merged);
  if (!cur) { try { await HealthPlan.create({ schoolId: s, studentId: st._id, ...set }); } catch (e) { if (e.code !== 11000) throw e; await HealthPlan.updateOne({ schoolId: s, studentId: st._id }, { $set: set }); } } else await HealthPlan.updateOne({ _id: cur._id, schoolId: s }, { $set: set });
  await audit(req, { action: 'care.health.plan', entityType: 'HealthPlan', entityId: st._id, schoolId: s, detail: { student: st.name } });
  res.json({ ok: true, alert: set.alert });
});

/* ── medication ── */
function cleanMed(b, partial = false) {
  const m = {}; const err = (t) => { throw Object.assign(new Error(t), { code: 422 }); };
  if (!partial || b.name !== undefined) { m.name = clean(b.name, 80); if (m.name.length < 2) err('Name the medicine.'); }
  if (!partial || b.dose !== undefined) { m.dose = clean(b.dose, 60); if (!m.dose) err('Write the dose.'); }
  if (b.times !== undefined) { m.times = list(b.times, 6, (t) => (HM.test(String(t)) ? String(t) : null)); if ((Array.isArray(b.times) ? b.times.length : 0) !== m.times.length) err('Dose times must look like 08:30.'); }
  if (b.route !== undefined) m.route = clean(b.route, 30) || 'oral'; if (b.instructions !== undefined) m.instructions = clean(b.instructions, 400);
  for (const k of ['startOn', 'endOn']) if (b[k] !== undefined) { if (b[k] && !S.isDay(b[k])) err('Dates must look like 2026-03-31.'); m[k] = b[k] || ''; }
  if (m.startOn && m.endOn && m.endOn < m.startOn) err('The end date is before the start.'); return m;
}
const bail = (res, e) => { if (e.code === 422) { bad(res, 422, e.message); return true; } return false; };
exports.addMed = wrap('addMed', async (req, res) => {
  if (!(await needHealth(req, res))) return; const st = await S.studentOf(req, req.params.studentId); if (!st) return bad(res, 404, 'Student not found.'); const s = sid(req);
  let m; try { m = cleanMed(req.body || {}); } catch (e) { if (bail(res, e)) return; throw e; }
  const plan = await HealthPlan.findOne({ schoolId: s, studentId: st._id }); if (!plan) return bad(res, 422, 'Save the health plan first.');
  if ((plan.medications || []).length >= 15) return bad(res, 422, 'That is the most medicines one plan can hold.');
  await HealthPlan.updateOne({ _id: plan._id, schoolId: s }, { $push: { medications: { ...m, times: m.times || [], active: true } } });
  const parents = await N.parentsOf(s, [st._id]); if (parents.length) await N.notify({ schoolId: s, recipients: parents, title: `Medicine consent needed for ${st.name}`, body: `${m.name} ${m.dose}. Open Wellbeing to give or refuse consent.`, type: 'care', link: '#/wellbeing', key: `care-med:${plan._id}:${m.name}` });
  await audit(req, { action: 'care.health.med.add', entityType: 'HealthPlan', entityId: plan._id, schoolId: s, detail: { student: st.name, medicine: m.name } });
  res.status(201).json({ ok: true });
});
exports.setMed = wrap('setMed', async (req, res) => {
  if (!(await needHealth(req, res))) return; const s = sid(req); const plan = await HealthPlan.findOne({ schoolId: s, studentId: oid(req.params.studentId) }); if (!plan) return bad(res, 404, 'No health plan.');
  const mi = (plan.medications || []).findIndex((x) => String(x._id) === String(req.params.mid)); if (mi < 0) return bad(res, 404, 'Medicine not found.'); const med = plan.medications[mi]; const b = req.body || {}; const P = `medications.${mi}`;
  let m; try { m = cleanMed(b, true); } catch (e) { if (bail(res, e)) return; throw e; } const set = {};
  for (const [k, v] of Object.entries(m)) set[`${P}.${k}`] = v; if (b.active !== undefined) set[`${P}.active`] = !!b.active;
  // changing what is given voids the old consent
  if (['dose', 'name', 'times'].some((k) => m[k] !== undefined && JSON.stringify(m[k]) !== JSON.stringify(med[k]))) { set[`${P}.consentAt`] = null; set[`${P}.consentByName`] = ''; }
  if (!Object.keys(set).length) return bad(res, 422, 'Nothing to change.'); await HealthPlan.updateOne({ _id: plan._id, schoolId: s, 'medications._id': med._id }, { $set: set }); res.json({ ok: true, consentVoided: set[`${P}.consentAt`] === null });
});
// Parent's answer about a medicine
exports.consent = wrap('consent', async (req, res) => {
  const b = req.body || {}; const kid = await S.familyChild(req, b.studentId, 'viewInfo'); if (!kid || kid.self) return bad(res, 403, 'Only a linked parent can answer this.');
  const s = sid(req); const plan = await HealthPlan.findOne({ schoolId: s, studentId: kid.student._id }); const mi = plan ? (plan.medications || []).findIndex((x) => String(x._id) === String(b.medId)) : -1; if (mi < 0) return bad(res, 404, 'Medicine not found.'); const med = plan.medications[mi]; const P = `medications.${mi}`;
  const yes = b.consent !== false;
  await HealthPlan.updateOne({ _id: plan._id, schoolId: s, 'medications._id': med._id }, { $set: yes ? { [`${P}.consentAt`]: new Date(), [`${P}.consentById`]: oid(req.user.userId), [`${P}.consentByName`]: req.actorName || '', [`${P}.consentNote`]: clean(b.note, 200) } : { [`${P}.consentAt`]: null, [`${P}.consentByName`]: '', [`${P}.consentNote`]: clean(b.note, 200) } });
  await audit(req, { action: yes ? 'care.health.consent' : 'care.health.consent.withdraw', entityType: 'HealthPlan', entityId: plan._id, schoolId: s, detail: { student: kid.student.name, medicine: med.name } });
  await N.notify({ schoolId: s, recipients: await S.holders(s, 'care.health.manage'), title: yes ? 'Medicine consent given' : 'Medicine consent withdrawn', body: `${kid.student.name}: ${med.name}`, type: 'care', link: '#/care', key: `care-consent:${plan._id}:${med._id}:${yes}` });
  res.json({ ok: true, consented: yes });
});

// Dose slots for a day, with what has been recorded
async function dueDoses(s, day, plans) {
  const logs = await MedicationLog.find({ schoolId: s, day }); const by = new Map(logs.map((l) => [`${l.studentId}:${l.medId}:${l.slot}`, l])); const out = [];
  for (const p of plans) for (const m of p.medications || []) {
    if (!m.active || !m.consentAt || (m.startOn && day < m.startOn) || (m.endOn && day > m.endOn)) continue;
    for (const slot of (m.times && m.times.length ? m.times : [''])) out.push({ studentId: p.studentId, studentName: p.studentName, planId: p._id, medId: m._id, name: m.name, dose: m.dose, route: m.route, instructions: m.instructions, slot, log: by.get(`${p.studentId}:${m._id}:${slot}`) || null });
  }
  return out.sort((a, b) => (a.slot || '99').localeCompare(b.slot || '99') || a.studentName.localeCompare(b.studentName));
}
exports.dueDoses = dueDoses;
exports.today = wrap('today', async (req, res) => {
  if (!(await needHealth(req, res))) return; const s = sid(req); const day = S.isDay(req.query.day) ? req.query.day : await S.today(s);
  const plans = await HealthPlan.find({ schoolId: s, 'medications.active': true }); const doses = await dueDoses(s, day, plans);
  const waiting = []; for (const p of plans) for (const m of p.medications || []) if (m.active && !m.consentAt) waiting.push({ studentId: p.studentId, studentName: p.studentName, medId: m._id, name: m.name, dose: m.dose });
  res.json({ day, doses, waitingForConsent: waiting });
});
exports.logDose = wrap('logDose', async (req, res) => {
  if (!(await needHealth(req, res))) return; const b = req.body || {}; const s = sid(req); const st = await S.studentOf(req, b.studentId); if (!st) return bad(res, 404, 'Student not found.');
  const plan = await HealthPlan.findOne({ schoolId: s, studentId: st._id }); const med = plan && (plan.medications || []).find((x) => String(x._id) === String(b.medId)); if (!med) return bad(res, 404, 'Medicine not found.');
  const day = S.isDay(b.day) ? b.day : await S.today(s); const status = String(b.status || ''); if (!['given', 'refused', 'missed', 'withheld'].includes(status)) return bad(res, 422, 'Choose given, refused, missed or withheld.');
  if (!med.active) return bad(res, 422, 'This medicine is no longer active.'); if ((med.startOn && day < med.startOn) || (med.endOn && day > med.endOn)) return bad(res, 422, 'This medicine is not due on that day.');
  if (status === 'given' && !med.consentAt) return bad(res, 422, 'A parent has not consented to this medicine, so it cannot be given.');
  const slot = clean(b.slot, 5); if ((med.times || []).length ? !med.times.includes(slot) : slot !== '') return bad(res, 422, (med.times || []).length ? 'That is not one of the dose times.' : 'This medicine has no set times.');
  const note = clean(b.note, 300); if (['refused', 'withheld', 'missed'].includes(status) && note.length < 3) return bad(res, 422, 'Say why.');
  const doc = { schoolId: s, studentId: st._id, studentName: st.name, medId: med._id, medName: med.name, dose: med.dose, day, slot, status, byId: oid(req.user.userId), byName: req.actorName || '', note };
  try { await MedicationLog.create(doc); } catch (e) {
    if (e.code !== 11000) throw e;
    // a dose the system marked as missed can still be recorded late
    const u = await MedicationLog.updateOne({ schoolId: s, studentId: st._id, medId: med._id, day, slot, status: 'missed', byId: null }, { $set: { status, byId: doc.byId, byName: doc.byName, note: note || 'Recorded late', at: new Date() } });
    if (!u.modifiedCount) return bad(res, 409, 'This dose is already recorded.');
  }
  if (['refused', 'withheld'].includes(status)) { const par = await N.parentsOf(s, [st._id]); if (par.length) await N.notify({ schoolId: s, recipients: par, title: `${st.name}: medicine ${status}`, body: `${med.name} was ${status} at the sick bay. ${note}`, type: 'care', link: '#/wellbeing', key: `care-dose:${st._id}:${med._id}:${day}:${slot}` }); }
  await audit(req, { action: 'care.health.dose', entityType: 'MedicationLog', entityId: st._id, schoolId: s, detail: { student: st.name, medicine: med.name, status, day, slot } });
  res.status(201).json({ ok: true });
});
exports.doseLog = wrap('doseLog', async (req, res) => {
  if (!(await needHealth(req, res))) return; const f = { schoolId: sid(req) }; if (oid(req.query.studentId)) f.studentId = oid(req.query.studentId); if (S.isDay(req.query.day)) f.day = req.query.day;
  res.json({ log: await MedicationLog.find(f).sort({ day: -1, slot: 1 }).limit(200) });
});

/* ── sick bay ── */
exports.addIncident = wrap('addIncident', async (req, res) => {
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Staff only.'); const b = req.body || {}; const s = sid(req); const st = await S.studentOf(req, b.studentId); if (!st) return bad(res, 404, 'Student not found.');
  if (!(c.health || S.teachesStudent(c, st))) return bad(res, 403, 'You can only record visits for children you teach.');
  const kind = ['illness', 'injury', 'allergy', 'medication', 'other'].includes(b.kind) ? b.kind : 'illness'; const outcome = ['returned', 'rested', 'sent-home', 'ambulance'].includes(b.outcome) ? b.outcome : 'returned';
  const symptoms = clean(b.symptoms, 500); if (symptoms.length < 3) return bad(res, 422, 'Describe what happened.'); const t = b.temperatureC === undefined || b.temperatureC === '' || b.temperatureC === null ? null : Number(b.temperatureC);
  if (t !== null && (!(t >= 30 && t <= 45))) return bad(res, 422, 'Temperature must be between 30 and 45 degrees.'); const day = await S.today(s);
  const inc = await HealthIncident.create({ schoolId: s, studentId: st._id, studentName: st.name, classId: st.classId || null, kind, day, symptoms, action: clean(b.action, 500), temperatureC: t, outcome, followUp: clean(b.followUp, 300), loggedById: oid(req.user.userId), loggedByName: req.actorName || '', loggedByRole: req.user.role });
  const par = await N.parentsOf(s, [st._id]); const serious = outcome === 'ambulance' || outcome === 'sent-home' || kind === 'allergy';
  if (par.length) { await N.notify({ schoolId: s, recipients: par, title: outcome === 'ambulance' ? `URGENT: ${st.name} needs an ambulance` : outcome === 'sent-home' ? `${st.name} is being sent home` : `${st.name} visited the sick bay`, body: `${symptoms.slice(0, 120)}${b.action ? ` — ${clean(b.action, 100)}` : ''}`, type: outcome === 'ambulance' ? 'safety' : 'care', link: '#/wellbeing', key: `care-inc:${inc._id}`, urgent: serious }); await HealthIncident.updateOne({ _id: inc._id, schoolId: s }, { $set: { parentNotifiedAt: new Date() } }); }
  if (serious) await N.notify({ schoolId: s, recipients: (await N.admins(s)).filter((a) => String(a.id) !== req.user.userId), title: `${st.name}: ${outcome === 'ambulance' ? 'ambulance called' : outcome === 'sent-home' ? 'sent home from the sick bay' : 'allergic reaction'}`, body: symptoms.slice(0, 120), type: outcome === 'ambulance' ? 'safety' : 'care', link: '#/care', key: `care-inc-a:${inc._id}`, urgent: true });
  await audit(req, { action: 'care.health.incident', entityType: 'HealthIncident', entityId: inc._id, schoolId: s, detail: { student: st.name, kind, outcome } });
  res.status(201).json({ incident: inc, parentsTold: par.length > 0 });
});
exports.incidents = wrap('incidents', async (req, res) => {
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Staff only.'); const s = sid(req); const f = { schoolId: s };
  if (oid(req.query.studentId)) { const st = await S.studentOf(req, req.query.studentId); if (!st || !(c.health || S.teachesStudent(c, st))) return bad(res, 404, 'Student not found.'); f.studentId = st._id; } else if (!c.health) return bad(res, 403, 'Choose a student.');
  if (S.isDay(req.query.day)) f.day = req.query.day; res.json({ incidents: await HealthIncident.find(f).sort({ at: -1 }).limit(100) });
});
// Emergency alerts for the classes a teacher teaches (or every class for the nurse)
exports.alerts = wrap('alerts', async (req, res) => {
  const c = await S.ctx(req); if (!c.staff) return bad(res, 403, 'Staff only.'); const s = sid(req); let studentIds;
  if (c.health) studentIds = null; else { if (!c.classIds.size) return res.json({ alerts: [] }); studentIds = (await Student.find({ schoolId: s, classId: { $in: [...c.classIds].map(oid) }, isActive: { $ne: false } }).select('_id')).map((x) => x._id); }
  const f = { schoolId: s, alert: true }; if (studentIds) f.studentId = { $in: studentIds };
  const plans = await HealthPlan.find(f).sort({ studentName: 1 }).limit(300); res.json({ alerts: plans.map(alertView) });
});

/* ── families ── */
exports.family = wrap('family', async (req, res) => {
  const kids = await S.myChildren(req); const s = sid(req); const out = [];
  for (const k of kids) {
    const [plan, inc] = await Promise.all([HealthPlan.findOne({ schoolId: s, studentId: k.student._id }), HealthIncident.find({ schoolId: s, studentId: k.student._id }).select('-loggedById').sort({ at: -1 }).limit(15)]);
    out.push({ studentId: k.student._id, name: k.student.name, self: !!k.self, plan: plan ? { conditions: plan.conditions, allergies: plan.allergies, emergencyPlan: plan.emergencyPlan, diet: plan.diet, doctorName: plan.doctorName, doctorPhone: plan.doctorPhone, medications: (plan.medications || []).map(medView), verifiedAt: plan.verifiedAt, proposal: plan.proposal && plan.proposal.at ? { at: plan.proposal.at } : null } : null, incidents: inc });
  }
  res.json({ children: out });
});
exports.propose = wrap('propose', async (req, res) => {
  const b = req.body || {}; const kid = await S.familyChild(req, b.studentId, 'viewInfo'); if (!kid || kid.self) return bad(res, 403, 'Only a linked parent can send health information.'); const s = sid(req);
  const data = { conditions: cleanConditions(b.conditions), allergies: cleanAllergies(b.allergies), emergencyPlan: clean(b.emergencyPlan, 1500), diet: clean(b.diet, 300), doctorName: clean(b.doctorName, 80), doctorPhone: clean(b.doctorPhone, 30),
    medications: list(b.medications, 5, (m) => { try { return cleanMed(m); } catch (e) { return null; } }) };
  if (!data.conditions.length && !data.allergies.length && !data.emergencyPlan && !data.diet && !data.medications.length && !data.doctorName) return bad(res, 422, 'Add something to send.');
  const upd = { proposal: { data, byId: oid(req.user.userId), byName: req.actorName || '', at: new Date() }, studentName: kid.student.name };
  const cur = await HealthPlan.findOne({ schoolId: s, studentId: kid.student._id });
  if (cur) await HealthPlan.updateOne({ _id: cur._id, schoolId: s }, { $set: upd }); else { try { await HealthPlan.create({ schoolId: s, studentId: kid.student._id, classId: kid.student.classId || null, ...upd }); } catch (e) { if (e.code !== 11000) throw e; await HealthPlan.updateOne({ schoolId: s, studentId: kid.student._id }, { $set: upd }); } }
  await N.notify({ schoolId: s, recipients: await S.holders(s, 'care.health.manage'), title: 'A parent sent health information', body: `${kid.student.name}. Review it in Student care.`, type: 'care', link: '#/care', key: `care-prop:${kid.student._id}:${Date.now()}` });
  res.status(201).json({ ok: true });
});
exports.decideProposal = wrap('decideProposal', async (req, res) => {
  if (!(await needHealth(req, res))) return; const s = sid(req); const plan = await HealthPlan.findOne({ schoolId: s, studentId: oid(req.params.studentId) }); if (!plan || !plan.proposal || !plan.proposal.at) return bad(res, 404, 'Nothing is waiting.');
  const accept = (req.body || {}).accept !== false; const d = plan.proposal.data || {}; const st = await S.studentOf(req, plan.studentId);
  if (!accept) { await HealthPlan.updateOne({ _id: plan._id, schoolId: s }, { $set: { proposal: null } }); if (plan.proposal.byId) await N.notify({ schoolId: s, recipients: [{ id: plan.proposal.byId, role: 'parent' }], title: 'The sick bay could not use your health information', body: clean((req.body || {}).note, 200) || 'Please contact the school office.', type: 'care', link: '#/wellbeing', key: `care-prop-x:${plan._id}:${Date.now()}` }); return res.json({ ok: true, accepted: false }); }
  const set = { proposal: null, verifiedAt: new Date(), verifiedByName: req.actorName || '', updatedByName: req.actorName || '' }; const merged = plan.toObject();
  for (const k of ['conditions', 'allergies']) if (d[k] && d[k].length) { set[k] = [...(plan[k] || []), ...d[k]].slice(0, 30); merged[k] = set[k]; }
  for (const k of ['emergencyPlan', 'diet', 'doctorName', 'doctorPhone']) if (d[k]) { set[k] = d[k]; merged[k] = d[k]; }
  set.alert = hasAlert(merged);
  const meds = (d.medications || []).map((m) => ({ ...m, times: m.times || [], active: true, consentAt: plan.proposal.at, consentById: plan.proposal.byId, consentByName: plan.proposal.byName, consentNote: 'Sent by the parent' }));
  await HealthPlan.updateOne({ _id: plan._id, schoolId: s }, { $set: set, ...(meds.length ? { $push: { medications: { $each: meds } } } : {}) });
  await audit(req, { action: 'care.health.proposal.accept', entityType: 'HealthPlan', entityId: plan._id, schoolId: s, detail: { student: st ? st.name : '' } }); res.json({ ok: true, accepted: true });
});
exports.proposals = wrap('proposals', async (req, res) => {
  if (!(await needHealth(req, res))) return; const rows = await HealthPlan.find({ schoolId: sid(req), 'proposal.at': { $ne: null } }).select('studentId studentName proposal');
  res.json({ proposals: rows.filter((r) => r.proposal && r.proposal.at).map((r) => ({ studentId: r.studentId, studentName: r.studentName, at: r.proposal.at, byName: r.proposal.byName, data: r.proposal.data })) });
});
