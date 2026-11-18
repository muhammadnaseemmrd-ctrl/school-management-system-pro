// Emergency assembly and drills (PRD E09, CAP-0155/0156/0361/0362): a roster taken when the alarm starts, a head count per class,
// outsiders on site, families told only when their child is accounted for, a phone fallback, and a signed report with follow-ups.
//   403 not allowed (incl. signing your own close) · 404 not yours · 409 already done · 422 head count does not add up
const mongoose = require('../lib/pgdoc');
const S = require('../utils/safety');
const A = require('../utils/attendanceOps');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const { can } = require('../utils/permissions');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Class = require('../models/Class');
const Notification = require('../models/Notification');
const DailyAttendance = require('../models/DailyAttendance');
const PickupEvent = require('../models/PickupEvent');
const VisitorVisit = require('../models/VisitorVisit');
const ContractorPass = require('../models/ContractorPass');
const SafetyDrill = require('../models/SafetyDrill');
const MusterRecord = require('../models/MusterRecord');
const ops = require('./attendanceOpsController')._internals;

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = S.clean;
const sidOf = (req) => req.user.schoolId;
const KINDS = ['Fire', 'Earthquake', 'Lockdown', 'Evacuation', 'Emergency'];

async function tally(drillId) {
  const rows = await MusterRecord.find({ drillId }).select('kind status classId classLabel');
  const t = { expected: 0, safe: 0, missing: 0, unknown: 0, released: 0, others: 0, othersSafe: 0 };
  for (const r of rows) {
    if (r.kind !== 'student') { t.others++; if (r.status === 'Safe') t.othersSafe++; continue; }
    t.expected++;
    if (r.status === 'Safe') t.safe++; else if (r.status === 'Missing') t.missing++; else if (r.status === 'Released') t.released++; else t.unknown++;   // Expected counts as not yet accounted for
  }
  return t;
}
const shape = (d, t) => ({ _id: d._id, kind: d.kind, real: d.real, title: d.title, assemblyPoint: d.assemblyPoint, offSite: d.offSite, status: d.status, startedByName: d.startedByName, startedAt: d.startedAt, closedByName: d.closedByName, closedAt: d.closedAt, forceReason: d.forceReason,
  signedByName: d.signedByName, signedAt: d.signedAt, summary: d.summary, durationSeconds: d.durationSeconds, familiesNotifiedAt: d.familiesNotifiedAt, actions: (d.actions || []).map((a, i) => ({ index: i, text: a.text, ownerName: a.ownerName, dueDate: a.dueDate, done: a.done, doneAt: a.doneAt })), counts: t || d.counts });
const unaccounted = (t) => t.unknown + t.missing;

exports.start = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {};
    const kind = KINDS.includes(b.kind) ? b.kind : null; if (!kind) return res.status(400).json({ message: `Choose a kind: ${KINDS.join(', ')}.` });
    if (await SafetyDrill.findOne({ schoolId: sid, status: 'Open' })) return res.status(409).json({ message: 'A drill or emergency assembly is already running. Close it first.' });
    const clock = await A.clock(sid); const real = b.real === true || kind === 'Emergency';
    // who is expected: every active student who is not marked absent or on leave today and was not already collected
    const [students, marks, gone, visitors, contractors] = await Promise.all([
      Student.find({ schoolId: sid, isActive: { $ne: false }, classId: { $exists: true, $ne: null } }).select('name classId'),
      DailyAttendance.find({ schoolId: sid, date: clock.dateUTC, status: { $in: ['Absent', 'Leave'] } }).select('studentId'),
      PickupEvent.find({ schoolId: sid, day: clock.dateKey, outcome: 'Released' }).select('studentId'),
      VisitorVisit.find({ schoolId: sid, status: 'CheckedIn' }).select('visitorName'),
      ContractorPass.find({ schoolId: sid, inside: true }).select('personName'),
    ]);
    const skip = new Set([...marks, ...gone].map((m) => String(m.studentId)));
    const classes = new Map((await Class.find({ schoolId: sid }).select('standard division')).map((c) => [String(c._id), `${c.standard}${c.division ? `-${c.division}` : ''}`]));
    const d = await SafetyDrill.create({ schoolId: sid, kind, real, title: str(b.title, 80) || `${kind} ${real ? 'emergency' : 'drill'}`, assemblyPoint: str(b.assemblyPoint, 80), offSite: b.offSite === true, startedById: me.id, startedByName: me.name });
    const lines = [
      ...students.filter((s) => !skip.has(String(s._id))).map((s) => ({ schoolId: sid, drillId: d._id, kind: 'student', refId: s._id, name: s.name, classId: s.classId, classLabel: classes.get(String(s.classId)) || '' })),
      ...visitors.map((v) => ({ schoolId: sid, drillId: d._id, kind: 'visitor', refId: v._id, name: v.visitorName })),
      ...contractors.map((c) => ({ schoolId: sid, drillId: d._id, kind: 'contractor', refId: c._id, name: c.personName })),
    ];
    if (lines.length) await MusterRecord.insertMany(lines);
    const t = await tally(d._id); d.counts = { expected: t.expected, safe: 0, missing: 0, unknown: t.expected, released: 0, others: t.others }; await d.save();
    await audit(req, { action: 'safety.drill.start', entityType: 'SafetyDrill', entityId: d._id, schoolId: sid, detail: { kind, real, expected: t.expected, others: t.others } });
    const heads = (await Class.find({ schoolId: sid, classTeacherId: { $ne: null } }).select('classTeacherId')).map((c) => ({ id: c.classTeacherId, role: 'teacher' }));
    await N.notify({ schoolId: sid, recipients: [...heads, ...(await N.admins(sid))], exclude: me.id, title: `${d.title}: take your head count`, body: d.assemblyPoint ? `Assemble at ${d.assemblyPoint}.` : 'Count your class and mark each student.', type: 'safety', key: `drill:${d._id}`, link: { admin: '/admin?tab=safetyDesk', teacher: '/teacher?tab=safetyDesk' } });
    res.status(201).json({ drill: shape(d, t) });
  } catch (e) { fail(res, e); }
};

exports.list = async (req, res) => {
  try {
    const rows = await SafetyDrill.find({ schoolId: sidOf(req) }).sort({ startedAt: -1 }).limit(50);
    const out = []; for (const d of rows) out.push(shape(d, d.status === 'Open' ? await tally(d._id) : d.counts));
    res.json({ drills: out });
  } catch (e) { fail(res, e); }
};
exports.current = async (req, res) => {
  try { const d = await SafetyDrill.findOne({ schoolId: sidOf(req), status: 'Open' }); res.json({ drill: d ? shape(d, await tally(d._id)) : null }); } catch (e) { fail(res, e); }
};
exports.get = async (req, res) => {
  try {
    const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sidOf(req) }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    const rows = await MusterRecord.find({ drillId: d._id }); const by = new Map();
    for (const r of rows.filter((x) => x.kind === 'student')) {
      const k = String(r.classId); const c = by.get(k) || { classId: r.classId, label: r.classLabel, expected: 0, safe: 0, missing: 0, unknown: 0, released: 0 };
      c.expected++; if (r.status === 'Safe') c.safe++; else if (r.status === 'Missing') c.missing++; else if (r.status === 'Released') c.released++; else c.unknown++; by.set(k, c);
    }
    const open = rows.filter((x) => x.kind === 'student' && x.status !== 'Safe' && x.status !== 'Released').slice(0, 100).map((x) => ({ _id: x._id, name: x.name, classLabel: x.classLabel, status: x.status, note: x.note }));
    const others = rows.filter((x) => x.kind !== 'student').map((x) => ({ _id: x._id, kind: x.kind, name: x.name, status: x.status }));
    res.json({ drill: shape(d, d.status === 'Open' ? await tally(d._id) : d.counts), classes: [...by.values()].sort((a, b) => String(a.label).localeCompare(String(b.label))), notAccountedFor: open, others });
  } catch (e) { fail(res, e); }
};

// A teacher counts their own class. Admins may count any class.
exports.classRoster = async (req, res) => {
  try {
    const sid = sidOf(req); const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    const classIds = isId(req.query.classId) ? [req.query.classId] : (await ops.myClassIds(req)) || [];
    const out = [];
    for (const cid of classIds) {
      if (!(await ops.manageClass(req, cid))) continue;
      const rows = await MusterRecord.find({ drillId: d._id, kind: 'student', classId: cid }).sort({ name: 1 });
      out.push({ classId: cid, label: rows[0]?.classLabel || '', students: rows.map((r) => ({ _id: r._id, studentId: r.refId, name: r.name, status: r.status, note: r.note })) });
    }
    if (isId(req.query.classId) && !out.length) return res.status(404).json({ message: 'Class not found' });
    res.json({ drill: { _id: d._id, title: d.title, kind: d.kind, status: d.status, assemblyPoint: d.assemblyPoint }, classes: out });
  } catch (e) { fail(res, e); }
};
exports.muster = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {};
    const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    if (d.status !== 'Open') return res.status(422).json({ message: 'This drill is closed. Counts can no longer change.' });
    if (!isId(b.classId) || !(await ops.manageClass(req, b.classId))) return res.status(404).json({ message: 'Class not found' });
    const lines = await MusterRecord.find({ drillId: d._id, kind: 'student', classId: b.classId }); const byStu = new Map(lines.map((r) => [String(r.refId), r]));
    const marks = [];
    if (b.allSafe === true) { const except = new Set((Array.isArray(b.except) ? b.except : []).map(String)); for (const r of lines) if (!except.has(String(r.refId)) && r.status === 'Expected') marks.push({ studentId: r.refId, status: 'Safe' }); }
    for (const m of Array.isArray(b.marks) ? b.marks : []) marks.push(m);
    if (!marks.length) return res.status(400).json({ message: 'Mark at least one student.' });
    let changed = 0; const missing = [];
    for (const m of marks) {
      const line = byStu.get(String(m.studentId)); if (!line) return res.status(404).json({ message: 'One of those students is not on this class\'s list.' });
      if (!['Safe', 'Missing', 'Unknown', 'Released'].includes(m.status)) return res.status(400).json({ message: 'Each mark must be Safe, Missing, Unknown or Released.' });
      if (['Missing', 'Released'].includes(m.status) && str(m.note, 200).length < 3) return res.status(400).json({ message: m.status === 'Missing' ? 'Say when and where the student was last seen.' : 'Say who the student was handed to.' });
      if (line.status === m.status && !m.note) continue;
      await MusterRecord.updateOne({ _id: line._id }, { $set: { status: m.status, markedById: me.id, markedByName: me.name, markedAt: new Date(), note: str(m.note, 200) } }); changed++;
      if (m.status === 'Missing') missing.push(line);
    }
    for (const line of missing) await N.notify({ schoolId: sid, recipients: await N.admins(sid), exclude: me.id, title: 'A student is missing from the head count', body: `${line.name} (${line.classLabel}) — ${d.title}`, type: 'safety', key: `drillmiss:${d._id}:${line.refId}`, link: { admin: '/admin?tab=safetyDesk' } });
    await audit(req, { action: 'safety.drill.muster', entityType: 'SafetyDrill', entityId: d._id, schoolId: sid, detail: { classId: b.classId, changed, missing: missing.length } });
    res.json({ changed, counts: await tally(d._id) });
  } catch (e) { fail(res, e); }
};
exports.markOther = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const status = ['Safe', 'Missing'].includes(req.body?.status) ? req.body.status : null; if (!status) return res.status(400).json({ message: 'Choose Safe or Missing.' });
    const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    if (d.status !== 'Open') return res.status(422).json({ message: 'This drill is closed.' });
    const line = await MusterRecord.findOne({ _id: isId(req.params.lineId) ? req.params.lineId : null, drillId: d._id, kind: { $in: ['visitor', 'contractor'] } }); if (!line) return res.status(404).json({ message: 'Person not found' });
    await MusterRecord.updateOne({ _id: line._id }, { $set: { status, markedById: me.id, markedByName: me.name, markedAt: new Date() } });
    await audit(req, { action: 'safety.drill.other', entityType: 'SafetyDrill', entityId: d._id, schoolId: sid, detail: { name: line.name, status } });
    res.json({ counts: await tally(d._id) });
  } catch (e) { fail(res, e); }
};

// Tell the families of students who are accounted for. Families of anyone missing or unknown get a person's phone call, not a message.
exports.notifyFamilies = async (req, res) => {
  try {
    const sid = sidOf(req); const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    if (d.status !== 'Open') return res.status(422).json({ message: 'This drill is closed.' });
    const safe = (await MusterRecord.find({ drillId: d._id, kind: 'student', status: 'Safe' }).select('refId')).map((r) => r.refId);
    if (!safe.length) return res.status(422).json({ message: 'No student is marked safe yet.' });
    const recipients = [...(await N.parentsOf(sid, safe, 'viewInfo'))];
    await N.notify({ schoolId: sid, recipients, title: `${d.title}: your child is safe`, body: d.assemblyPoint ? `Your child has been counted and is safe at ${d.assemblyPoint}.` : 'Your child has been counted and is safe.', type: 'safety', key: `drillfam:${d._id}`, link: { parent: '/parent?tab=desk' } });
    d.familiesNotifiedAt = new Date(); await d.save();
    await audit(req, { action: 'safety.drill.notify', entityType: 'SafetyDrill', entityId: d._id, schoolId: sid, detail: { students: safe.length, families: recipients.length } });
    res.json({ studentsAccountedFor: safe.length, familiesNotified: recipients.length });
  } catch (e) { fail(res, e); }
};
// Second channel: families who have not opened the notice, and families of children still not accounted for, with phone numbers
exports.fallback = async (req, res) => {
  try {
    const sid = sidOf(req); const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    const st = await S.getSettings(sid); const out = [];
    const lines = await MusterRecord.find({ drillId: d._id, kind: 'student' }).select('refId name status classLabel');
    const waited = d.familiesNotifiedAt && Date.now() - new Date(d.familiesNotifiedAt).getTime() >= st.familyFallbackMinutes * 60000;
    const sendCall = async (line, why) => {
      const parents = await N.parentsOf(sid, [line.refId], 'viewInfo');
      const rows = await Parent.find({ _id: { $in: parents.map((p) => p.id) } }).select('name phone');
      for (const p of rows) out.push({ studentName: line.name, classLabel: line.classLabel, why, parentName: p.name, phone: p.phone || '' });
    };
    for (const l of lines.filter((x) => ['Missing', 'Unknown', 'Expected'].includes(x.status)).slice(0, 80)) await sendCall(l, 'not yet accounted for');
    if (d.familiesNotifiedAt) {
      const safe = lines.filter((x) => x.status === 'Safe');
      for (const l of safe.slice(0, 300)) {
        const parents = await N.parentsOf(sid, [l.refId], 'viewInfo'); if (!parents.length) continue;
        const read = await Notification.find({ userId: { $in: parents.map((p) => p.id) }, key: `drillfam:${d._id}`, readAt: { $ne: null } }).select('userId');
        if (!read.length && waited) await sendCall(l, 'has not opened the notice');
      }
    }
    res.json({ waitMinutes: st.familyFallbackMinutes, calls: out.slice(0, 200) });
  } catch (e) { fail(res, e); }
};

exports.close = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const b = req.body || {};
    const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    if (d.status !== 'Open') return res.status(409).json({ message: 'This drill is already closed.' });
    const t = await tally(d._id); const summary = str(b.summary, 800); const force = str(b.forceReason, 300);
    if (summary.length < 5) return res.status(400).json({ message: 'Write a short summary of how it went.' });
    if (unaccounted(t) > 0 && force.length < 10) return res.status(422).json({ message: `${unaccounted(t)} student${unaccounted(t) === 1 ? ' is' : 's are'} still not accounted for. Finish the count, or write why it is being closed anyway.`, counts: t, code: 'not-accounted' });
    const r = await SafetyDrill.updateOne({ _id: d._id, status: 'Open' }, { $set: { status: 'Closed', closedAt: new Date(), closedById: me.id, closedByName: me.name, summary, forceReason: unaccounted(t) > 0 ? force : '', durationSeconds: Math.round((Date.now() - new Date(d.startedAt).getTime()) / 1000), counts: { expected: t.expected, safe: t.safe, missing: t.missing, unknown: t.unknown, released: t.released, others: t.others } } });
    if (!r.modifiedCount) return res.status(409).json({ message: 'This drill is already closed.' });
    await audit(req, { action: 'safety.drill.close', entityType: 'SafetyDrill', entityId: d._id, schoolId: sid, detail: { counts: t, forced: unaccounted(t) > 0, force } });
    res.json({ drill: shape(await SafetyDrill.findById(d._id)) });
  } catch (e) { fail(res, e); }
};
exports.sign = async (req, res) => {
  try {
    const sid = sidOf(req); const me = await S.actor(req); const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    if (d.status === 'Open') return res.status(422).json({ message: 'Close the drill before signing the report.' });
    if (d.status === 'Signed') return res.status(409).json({ message: 'This report is already signed.' });
    if (String(d.closedById) === String(me.id)) return res.status(403).json({ message: 'A different administrator has to sign the report you closed.' });
    const r = await SafetyDrill.updateOne({ _id: d._id, status: 'Closed' }, { $set: { status: 'Signed', signedAt: new Date(), signedById: me.id, signedByName: me.name } });
    if (!r.modifiedCount) return res.status(409).json({ message: 'This report is already signed.' });
    await audit(req, { action: 'safety.drill.sign', entityType: 'SafetyDrill', entityId: d._id, schoolId: sid, detail: { title: d.title } });
    res.json({ drill: shape(await SafetyDrill.findById(d._id)) });
  } catch (e) { fail(res, e); }
};
exports.addAction = async (req, res) => {
  try {
    const sid = sidOf(req); const b = req.body || {}; const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sid }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    if (d.status === 'Signed') return res.status(422).json({ message: 'A signed report cannot change. Add the action to the next drill.' });
    const text = str(b.text, 300); if (text.length < 3) return res.status(400).json({ message: 'Write what must be done.' });
    if (b.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate))) return res.status(400).json({ message: 'Enter the due date as YYYY-MM-DD.' });
    d.actions.push({ text, ownerName: str(b.ownerName, 60), dueDate: b.dueDate || '', done: false }); await d.save();
    await audit(req, { action: 'safety.drill.action', entityType: 'SafetyDrill', entityId: d._id, schoolId: sid, detail: { text } });
    res.status(201).json({ drill: shape(d) });
  } catch (e) { fail(res, e); }
};
// Follow-ups stay open for months, so completing one is allowed even after the report is signed
exports.completeAction = async (req, res) => {
  try {
    const d = await SafetyDrill.findOne({ _id: isId(req.params.id) ? req.params.id : null, schoolId: sidOf(req) }); if (!d) return res.status(404).json({ message: 'Drill not found' });
    const a = d.actions[Number(req.params.index)]; if (!a) return res.status(404).json({ message: 'Action not found' });
    if (a.done) return res.status(409).json({ message: 'This action is already done.' });
    a.done = true; a.doneAt = new Date(); await d.save();
    await audit(req, { action: 'safety.drill.action.done', entityType: 'SafetyDrill', entityId: d._id, schoolId: sidOf(req), detail: { text: a.text } });
    res.json({ drill: shape(d) });
  } catch (e) { fail(res, e); }
};

/* ───────── desk overview ───────── */
exports.overview = async (req, res) => {
  try {
    const sid = sidOf(req); const G = require('./safetyGateController'); const hk = await G.housekeeping(sid); const st = await S.getSettings(sid); const clock = await A.clock(sid);
    const GateHandover = require('../models/GateHandover'); const GateLogItem = require('../models/GateLogItem'); const GateEntry = require('../models/GateEntry');
    const [inside, requested, expected, contractors, passPending, handovers, openItems, events, drillRow, denied] = await Promise.all([
      VisitorVisit.find({ schoolId: sid, status: 'CheckedIn' }).sort({ checkInAt: 1 }).limit(100),
      VisitorVisit.countDocuments({ schoolId: sid, status: 'Requested' }),
      VisitorVisit.find({ schoolId: sid, status: 'Approved', expectedTo: { $gte: new Date() } }).sort({ expectedFrom: 1 }).limit(50),
      ContractorPass.find({ schoolId: sid, inside: true }),
      ContractorPass.countDocuments({ schoolId: sid, status: 'Pending' }),
      GateHandover.find({ schoolId: sid, status: 'Pending' }),
      GateLogItem.find({ schoolId: sid, status: 'Open' }).sort({ createdAt: -1 }).limit(50),
      PickupEvent.find({ schoolId: sid, day: clock.dateKey }),
      SafetyDrill.findOne({ schoolId: sid, status: 'Open' }),
      GateEntry.countDocuments({ schoolId: sid, allowed: false, at: { $gte: new Date(Date.now() - 24 * 3600000) } }),
    ]);
    const needsReview = await PickupEvent.countDocuments({ schoolId: sid, reviewState: 'NeedsReview' });
    const exceptionsPending = events.filter((e) => e.outcome === 'Pending').length;
    const findings = [];
    for (const v of inside.filter((x) => x.overstayFlaggedAt)) findings.push({ kind: 'Overstay', severity: 'Medium', text: `${v.visitorName} (badge ${v.badge?.number}) is past the allowed time.`, ref: String(v._id) });
    for (const c of contractors.filter((x) => new Date(x.validTo) < new Date())) findings.push({ kind: 'ContractorOverstay', severity: 'High', text: `${c.personName} (${c.company}) is still inside after the pass ended.`, ref: String(c._id) });
    for (const h of handovers.filter((x) => Date.now() - new Date(x.createdAt).getTime() > st.handoverAcceptMinutes * 60000)) findings.push({ kind: 'HandoverWaiting', severity: 'Medium', text: `${h.gate} handover to ${h.toName} has waited more than ${st.handoverAcceptMinutes} minutes.`, ref: String(h._id) });
    if (needsReview) findings.push({ kind: 'OverrideReview', severity: 'High', text: `${needsReview} emergency override${needsReview === 1 ? '' : 's'} still need a second administrator's review.` });
    if (exceptionsPending) findings.push({ kind: 'ExceptionWaiting', severity: 'High', text: `${exceptionsPending} pickup exception${exceptionsPending === 1 ? ' is' : 's are'} waiting for a decision.` });
    for (const it of openItems.filter((x) => x.severity === 'High')) findings.push({ kind: 'OpenIncident', severity: 'High', text: it.text.slice(0, 100), ref: String(it._id) });
    res.json({ day: clock.dateKey, housekeeping: hk, settings: st,
      onSite: { visitors: inside.length, contractors: contractors.length },
      counts: { visitorsInside: inside.length, awaitingApproval: requested, expectedToday: expected.length, contractorsInside: contractors.length, passesPending: passPending, handoversPending: handovers.length, openLogItems: openItems.length,
        releasedToday: events.filter((e) => e.outcome === 'Released').length, refusedToday: events.filter((e) => e.outcome === 'Refused').length, exceptionsPending, overridesToReview: needsReview, deniedAtGate24h: denied },
      inside: inside.map((v) => ({ _id: v._id, visitorName: v.visitorName, kind: v.kind, hostName: v.hostName, badge: v.badge?.number, checkInAt: v.checkInAt, gate: v.gate, overstay: !!v.overstayFlaggedAt })),
      expected: expected.map((v) => ({ _id: v._id, visitorName: v.visitorName, kind: v.kind, hostName: v.hostName, expectedFrom: v.expectedFrom, expectedTo: v.expectedTo })),
      contractorsInside: contractors.map((c) => ({ _id: c._id, personName: c.personName, company: c.company, validTo: c.validTo })),
      drill: drillRow ? shape(drillRow, await tally(drillRow._id)) : null, findings });
  } catch (e) { fail(res, e); }
};
