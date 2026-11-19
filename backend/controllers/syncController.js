// Offline sync (PRD E11): queued teacher writes are applied once, compared with what changed on the server meanwhile, and anything
// that clashes goes to a conflict inbox instead of one side silently winning.
const mongoose = require('../lib/pgdoc');
const SyncMutation = require('../models/SyncMutation'); const SyncRevision = require('../models/SyncRevision'); const Draft = require('../models/TeacherDraft'); const Conflict = require('../models/SyncConflict');
const Marks = require('../models/Marks'); const Exam = require('../models/Exam'); const DailyAttendance = require('../models/DailyAttendance'); const Attendance = require('../models/Attendance');
const Teacher = require('../models/Teacher'); const Student = require('../models/Student'); const Class = require('../models/Class'); const User = require('../models/User'); const Subject = require('../models/Subject');
const A = require('../utils/attendanceOps'); const N = require('../utils/notify'); const invoke = require('../utils/invoke'); const { audit } = require('../utils/audit');
const daily = require('./dailyAttendanceController'); const period = require('./attendancePeriodController'); const marksCtl = require('./marksController'); const homework = require('./homeworkController');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const sid = (req) => req.user.schoolId; const me = (req) => req.user.userId; const isAdmin = (req) => req.user.role === 'admin';
const fail = (res, e) => { console.error('sync:', e); res.status(500).json({ message: e.message }); };
const ID_RE = /^[A-Za-z0-9._:-]{8,80}$/; const LOCAL_RE = /^[A-Za-z0-9_-]{6,60}$/;
const DRAFT_KINDS = ['homework', 'lessonNote', 'reminder']; const DAILY = ['Present', 'Absent', 'Late', 'HalfDay', 'Leave', 'Excused']; const MAX_BATCH = 50;
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const nameOf = async (req) => req.actorName || (req.user.role === 'teacher' ? (await Teacher.findById(me(req)).select('name'))?.name : (await User.findById(me(req)).select('name'))?.name) || 'Someone';

// bump a revision with compare-and-set so two devices cannot both think they made version N+1
async function bump(req, entityKey, mutationId) {
  const name = await nameOf(req);
  for (let i = 0; i < 4; i += 1) {
    const cur = await SyncRevision.findOne({ schoolId: sid(req), entityKey });
    if (!cur) { try { return (await SyncRevision.create({ schoolId: sid(req), entityKey, revision: 1, lastById: me(req), lastByName: name, lastMutationId: mutationId })).revision; } catch (e) { if (e.code !== 11000) throw e; continue; } }
    const r = await SyncRevision.updateOne({ _id: cur._id, revision: cur.revision }, { $set: { revision: cur.revision + 1, lastById: me(req), lastByName: name, lastMutationId: mutationId } });
    if (r.modifiedCount || r.matchedCount) return cur.revision + 1;
  }
  throw new Error('Could not record the new version. Try again.');
}
const lastBy = async (req, entityKey) => (await SyncRevision.findOne({ schoolId: sid(req), entityKey }))?.lastByName || '';

async function openConflict(req, m, c) {
  const owner = req.user.role === 'teacher' ? await Teacher.findById(me(req)).select('name') : await User.findById(me(req)).select('name');
  const row = await Conflict.create({ schoolId: sid(req), kind: m.kind, entityKey: c.entityKey, label: c.label, ownerId: me(req), ownerName: owner?.name || '', mutationId: m.mutationId, mine: c.mine, server: c.server, base: c.base ?? null, context: c.context ?? null, serverChangedBy: c.serverChangedBy || '', status: 'Open' });
  return row;
}
async function tellAboutConflicts(req, rows) {
  if (!rows.length) return;
  await N.notify({ schoolId: sid(req), recipients: [{ id: me(req), role: req.user.role }], title: rows.length === 1 ? 'A saved change clashed with a newer one' : `${rows.length} saved changes clashed with newer ones`, body: 'Open Today, then Conflicts, to choose which to keep.', link: { teacher: '/teacher?tab=today', admin: '/admin?tab=syncDesk' }, type: 'general', key: `sync-conflict-${rows[0]._id}` });
}

/* ───────── drafts ───────── */
const draftBody = (p = {}) => ({ kind: p.kind, title: str(p.title, 120), body: str(p.body, 4000), classId: isId(p.classId) ? p.classId : null, subjectId: isId(p.subjectId) ? p.subjectId : null, date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? p.date : '', dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(p.dueDate || '')) ? p.dueDate : '' });
const draftView = (d) => ({ localId: d.localId, kind: d.kind, title: d.title, body: d.body, classId: d.classId, subjectId: d.subjectId, date: d.date, dueDate: d.dueDate, revision: d.revision, status: d.status, updatedAt: d.updatedAt });
const draftFields = ['kind', 'title', 'body', 'classId', 'subjectId', 'date', 'dueDate'];
const sameDraft = (a, b) => draftFields.every((k) => String(a[k] ?? '') === String(b[k] ?? ''));

async function applyDraft(req, m) {
  if (req.user.role !== 'teacher') return { status: 'Rejected', message: 'Only teachers keep drafts.' };
  const localId = String(m.entityKey || '').replace(/^draft:/, ''); if (!LOCAL_RE.test(localId)) return { status: 'Rejected', message: 'The draft id is not valid.' };
  const p = m.payload || {}; const key = `draft:${localId}`; const cur = await Draft.findOne({ schoolId: sid(req), teacherId: me(req), localId });
  if (p.discard) { if (cur && cur.status === 'Draft') { cur.status = 'Discarded'; cur.revision += 1; await cur.save(); } return { status: 'Applied', message: 'Draft discarded.', revision: cur?.revision || 0 }; }
  if (!DRAFT_KINDS.includes(p.kind)) return { status: 'Rejected', message: 'Choose homework, lesson note or reminder.' };
  const v = draftBody(p); if (!v.title && !v.body) return { status: 'Rejected', message: 'A draft needs a title or some text.' };
  if (v.classId && !(await Class.exists({ _id: v.classId, schoolId: sid(req) }))) return { status: 'Rejected', message: 'That class is not in this school.' };
  if (!cur) { const d = await Draft.create({ schoolId: sid(req), teacherId: me(req), localId, ...v, lastDeviceId: m.deviceId || '', revision: 1 }); return { status: 'Applied', message: 'Draft saved.', revision: d.revision }; }
  if (cur.status === 'Published') return { status: 'Rejected', message: 'This draft was already published, so it cannot be changed.' };
  if (cur.status === 'Discarded') return { status: 'Rejected', message: 'This draft was discarded on another device.' };
  if (sameDraft(cur, v)) return { status: 'Applied', message: 'Already up to date.', revision: cur.revision };
  if (Number(m.baseRevision) === cur.revision) { Object.assign(cur, v, { revision: cur.revision + 1, lastDeviceId: m.deviceId || '' }); await cur.save(); return { status: 'Applied', message: 'Draft saved.', revision: cur.revision }; }
  const c = await openConflict(req, m, { entityKey: key, label: `Draft: ${cur.title || 'untitled'}`, mine: v, server: { ...draftBody(cur), revision: cur.revision }, base: { revision: Number(m.baseRevision) || 0 }, serverChangedBy: cur.lastDeviceId ? 'another device of yours' : 'another device' });
  return { status: 'Conflicted', message: 'This draft was changed on another device. Choose which version to keep.', conflicts: [c] };
}

/* ───────── marks ───────── */
async function applyMarks(req, m) {
  const p = m.payload || {}; if (![p.examId, p.studentId, p.subjectId].every(isId)) return { status: 'Rejected', message: 'The exam, student and subject are needed.' };
  const key = `marks:${p.examId}:${p.studentId}:${p.subjectId}`; if (m.entityKey && m.entityKey !== key) return { status: 'Rejected', message: 'The change does not match the mark it names.' };
  const marks = Number(p.marks); const out = Number(p.outOfMarks); if (!Number.isFinite(marks) || !Number.isFinite(out) || out <= 0 || marks < 0 || marks > out) return { status: 'Rejected', message: 'Marks must be between 0 and the total.' };
  const remarks = str(p.remarks, 300); const exam = await Exam.findOne({ _id: p.examId, schoolId: sid(req) }); if (!exam) return { status: 'Rejected', message: 'That exam is not in this school.' };
  const student = await Student.findOne({ _id: p.studentId, schoolId: sid(req) }).select('name classId'); if (!student || String(student.classId) !== String(exam.classId)) return { status: 'Rejected', message: 'That student is not in the exam class.' };
  if (req.user.role === 'teacher') { // who may write is decided before anything about the current mark is revealed or compared
    const t = await Teacher.findOne({ _id: me(req), schoolId: sid(req) }).select('subjectClassAssignments'); const ok = (t?.subjectClassAssignments || []).some((x) => String(x.subjectId) === String(p.subjectId) && String(x.classId) === String(exam.classId));
    if (!ok) return { status: 'Rejected', message: 'You are not assigned to teach this subject in this class.' };
  }
  const cur = await Marks.findOne({ schoolId: sid(req), examId: p.examId, studentId: p.studentId, subjectId: p.subjectId }); const base = p.base || null;
  const mine = { marks, outOfMarks: out, remarks };
  if (cur) {
    if (cur.marks === marks && String(cur.remarks || '') === remarks) return { status: 'Applied', message: 'Already up to date.', revision: (await SyncRevision.findOne({ schoolId: sid(req), entityKey: key }))?.revision || 0 };
    const unchanged = base && cur.marks === Number(base.marks) && String(cur.remarks || '') === String(base.remarks || '');
    if (!unchanged) {
      const sub = await Subject.findById(p.subjectId).select('name');
      const c = await openConflict(req, m, { entityKey: key, label: `${exam.name}: ${student.name}${sub ? `, ${sub.name}` : ''}`, mine, server: { marks: cur.marks, outOfMarks: cur.outOfMarks, remarks: cur.remarks || '' }, base, context: { examId: p.examId, studentId: p.studentId, subjectId: p.subjectId }, serverChangedBy: (await lastBy(req, key)) || 'someone else' });
      return { status: 'Conflicted', message: `The mark for ${student.name} was changed by someone else. Choose which to keep.`, conflicts: [c] };
    }
  }
  const r = await invoke(marksCtl.enterMarks, req, { body: { examId: p.examId, studentId: p.studentId, subjectId: p.subjectId, marks, outOfMarks: out, passStatus: marks >= (exam.passingMarks ?? 35) ? 'Pass' : 'Fail', remarks } });
  if (r.status >= 400) return r.status >= 500 ? { status: 'Retry', message: r.body?.message || 'Try again.' } : { status: 'Rejected', message: r.body?.message || 'The mark was refused.' };
  return { status: 'Applied', message: 'Mark saved.', revision: await bump(req, key, m.mutationId) };
}

/* ───────── attendance (daily and per lesson): three-way compare per student ───────── */
const threeWay = (records, base, server) => {
  const ok = []; const clash = [];
  for (const r of records) { const b = base && base[String(r.studentId)] != null ? base[String(r.studentId)] : null; const s = server.get(String(r.studentId)) ?? null; if (s != null && s !== b && s !== r.status && !(s === 'Leave' && r.status === 'Absent')) clash.push({ ...r, serverStatus: s, baseStatus: b }); else ok.push(r); }
  return { ok, clash };
};
async function applyRegister(req, m, isPeriod) {
  const p = m.payload || {}; const records = Array.isArray(p.records) ? p.records : []; if (!isId(p.classId)) return { status: 'Rejected', message: 'Choose the class.' }; if (!A.isDay(p.date)) return { status: 'Rejected', message: 'The date must look like 2026-11-24.' }; if (!records.length) return { status: 'Rejected', message: 'There are no students in this register.' };
  const cls = await Class.findOne({ _id: p.classId, schoolId: sid(req) }).select('standard division'); if (!cls) return { status: 'Rejected', message: 'That class is not in this school.' };
  const subjectId = isPeriod && isId(p.subjectId) ? p.subjectId : null; const day = A.toUTCDay(p.date);
  const server = new Map();
  if (isPeriod) for (const a of await Attendance.find({ schoolId: sid(req), classId: p.classId, subjectId, date: day })) server.set(String(a.userId), a.status);
  else for (const a of await DailyAttendance.find({ schoolId: sid(req), classId: p.classId, date: day })) server.set(String(a.studentId), a.status);
  const { ok, clash } = threeWay(records, p.base, server); const entityKey = isPeriod ? `period:${p.classId}:${p.date}:${p.startTime}` : `att:${p.classId}:${p.date}`;
  let applied = 0;
  if (ok.length) {
    const body = isPeriod ? { classId: p.classId, subjectId: p.subjectId, startTime: p.startTime, endTime: p.endTime, date: p.date, records: ok, capturedAt: p.capturedAt || (m.capturedAt && m.capturedAt.toISOString()) } : { date: p.date, records: ok };
    const r = await invoke(isPeriod ? period.mark : daily.saveClassSheet, req, { body, params: isPeriod ? {} : { classId: p.classId } });
    if (r.status >= 500) return { status: 'Retry', message: r.body?.message || 'Try again.' };
    if (r.status >= 400) return { status: 'Rejected', message: r.body?.message || 'The register was refused.' };
    applied = ok.length; await bump(req, entityKey, m.mutationId);
  }
  const students = new Map((await Student.find({ schoolId: sid(req), _id: { $in: clash.map((c) => c.studentId).filter(isId) } }).select('name')).map((s) => [String(s._id), s.name]));
  const rows = [];
  for (const c of clash) rows.push(await openConflict(req, m, { entityKey: `${entityKey}:${c.studentId}`, label: `${isPeriod ? 'Lesson register' : 'Register'} ${cls.standard}-${cls.division}, ${p.date}: ${students.get(String(c.studentId)) || 'a student'}`, mine: { status: c.status, leftAt: c.leftAt || null, arrivedAt: c.arrivedAt || null, note: c.note || '' }, server: { status: c.serverStatus }, base: { status: c.baseStatus }, context: { classId: p.classId, subjectId, startTime: p.startTime || '', endTime: p.endTime || '', date: p.date, studentId: c.studentId, period: !!isPeriod }, serverChangedBy: (await lastBy(req, entityKey)) || 'another teacher or the office' }));
  if (!rows.length) return { status: 'Applied', message: `${applied} student(s) saved.`, revision: 0 };
  return { status: applied ? 'Partial' : 'Conflicted', message: `${applied} saved. ${rows.length} student(s) were marked differently by someone else and are waiting for your choice.`, conflicts: rows };
}

const HANDLERS = { draft: applyDraft, marks: applyMarks, attendance: (r, m) => applyRegister(r, m, false), period: (r, m) => applyRegister(r, m, true) };

async function processOne(req, raw) {
  const mutationId = String(raw?.mutationId || ''); if (!ID_RE.test(mutationId)) return { mutationId, status: 'Rejected', message: 'mutationId must be 8-80 letters, numbers or - _ . :' };
  const kind = String(raw.kind || ''); if (!HANDLERS[kind]) return { mutationId, status: 'Rejected', message: 'Unknown kind of change.' };
  const m = { mutationId, kind, entityKey: str(raw.entityKey, 160), baseRevision: Number(raw.baseRevision) || 0, deviceId: str(raw.deviceId, 60), payload: raw.payload || {}, capturedAt: raw.capturedAt && !Number.isNaN(new Date(raw.capturedAt).getTime()) ? new Date(raw.capturedAt) : null };
  if (m.capturedAt && m.capturedAt.getTime() > Date.now() + 120000) m.capturedAt = new Date();
  try { await SyncMutation.create({ schoolId: sid(req), userId: me(req), role: req.user.role, deviceId: m.deviceId, mutationId, kind, entityKey: m.entityKey, baseRevision: m.baseRevision, capturedAt: m.capturedAt, status: 'Running' }); }
  catch (e) {
    if (e.code !== 11000) throw e;
    const prior = await SyncMutation.findOne({ schoolId: sid(req), mutationId });
    if (!prior) return { mutationId, status: 'Retry', message: 'Try again.' };
    if (String(prior.userId) !== String(me(req))) return { mutationId, status: 'Rejected', message: 'This id was used by someone else.' };
    if (prior.status === 'Running') { if (Date.now() - new Date(prior.updatedAt).getTime() < 120000) return { mutationId, status: 'Retry', message: 'Still being processed.' }; }
    else return { mutationId, status: prior.status, duplicate: true, message: prior.message, revision: prior.revision, conflictIds: prior.conflictIds || [], result: prior.result };
  }
  let out;
  try { out = await HANDLERS[kind](req, m); } catch (e) { console.error('sync handler:', e); out = { status: 'Retry', message: e.message }; }
  if (out.status === 'Retry') { await SyncMutation.deleteOne({ schoolId: sid(req), mutationId }); return { mutationId, status: 'Retry', message: out.message }; }
  const conflicts = out.conflicts || []; const ids = conflicts.map((c) => c._id);
  await SyncMutation.updateOne({ schoolId: sid(req), mutationId }, { $set: { status: out.status, message: out.message || '', revision: out.revision || 0, conflictIds: ids } });
  await tellAboutConflicts(req, conflicts);
  await audit(req, { action: `sync.${out.status.toLowerCase()}`, entityType: 'SyncMutation', entityId: mutationId, schoolId: sid(req), detail: { kind, entityKey: m.entityKey, capturedAt: m.capturedAt, conflicts: ids.length } });
  return { mutationId, status: out.status, message: out.message, revision: out.revision || 0, conflictIds: ids };
}

exports.push = async (req, res) => {
  try {
    const list = Array.isArray(req.body?.mutations) ? req.body.mutations : null; if (!list || !list.length) return res.status(400).json({ message: 'Send the queued changes as mutations.' });
    if (list.length > MAX_BATCH) return res.status(400).json({ message: `Send at most ${MAX_BATCH} changes at a time.` });
    const deviceId = str(req.body.deviceId, 60); const results = [];
    for (const raw of list) results.push(await processOne(req, { ...raw, deviceId: raw?.deviceId || deviceId }));
    const open = await Conflict.countDocuments({ schoolId: sid(req), ownerId: me(req), status: 'Open' });
    res.json({ results, serverTime: new Date().toISOString(), openConflicts: open });
  } catch (e) { fail(res, e); }
};

/* ───────── pull, status, history ───────── */
exports.pull = async (req, res) => {
  try {
    const since = req.query.since && !Number.isNaN(new Date(req.query.since).getTime()) ? new Date(req.query.since) : new Date(0); const q = { schoolId: sid(req), teacherId: me(req), updatedAt: { $gt: since } };
    const drafts = req.user.role === 'teacher' ? (await Draft.find(q).sort({ updatedAt: 1 }).limit(200)).map((d) => ({ ...draftView(d), discarded: d.status === 'Discarded' })) : [];
    const open = await Conflict.countDocuments({ schoolId: sid(req), $or: [{ ownerId: me(req) }, { assignedToId: me(req) }], status: 'Open' });
    res.json({ serverTime: new Date().toISOString(), drafts, openConflicts: open });
  } catch (e) { fail(res, e); }
};
exports.mutations = async (req, res) => {
  try { const q = { schoolId: sid(req), userId: me(req) }; if (req.query.status) q.status = String(req.query.status); res.json({ mutations: await SyncMutation.find(q).sort({ receivedAt: -1 }).limit(100).select('mutationId kind entityKey status message receivedAt capturedAt deviceId') }); } catch (e) { fail(res, e); }
};

/* ───────── drafts (online) ───────── */
exports.listDrafts = async (req, res) => {
  try { const q = { schoolId: sid(req), teacherId: me(req), status: req.query.status === 'Published' ? 'Published' : 'Draft' }; res.json({ drafts: (await Draft.find(q).sort({ updatedAt: -1 }).limit(200)).map(draftView) }); } catch (e) { fail(res, e); }
};
exports.publishDraft = async (req, res) => {
  try {
    const d = await Draft.findOne({ schoolId: sid(req), teacherId: me(req), localId: req.params.localId }); if (!d) return res.status(404).json({ message: 'Draft not found.' });
    if (d.status !== 'Draft') return res.status(409).json({ message: d.status === 'Published' ? 'Already published.' : 'This draft was discarded.' });
    if (d.kind !== 'homework') return res.status(422).json({ message: 'Only homework drafts are published. Lesson notes and reminders stay private to you.' });
    if (!d.classId || !d.subjectId || !d.dueDate || !d.title) return res.status(422).json({ message: 'Choose the class, the subject and the due date, and give the homework a title first.' });
    const cl = await Class.findOne({ _id: d.classId, schoolId: sid(req) }); if (!cl) return res.status(422).json({ message: 'The class no longer exists.' });
    const r = await invoke(homework.createHomework, req, { body: { classStandard: cl.standard, classDivision: cl.division, subjectId: String(d.subjectId), title: d.title, description: d.body, dueDate: d.dueDate } });
    if (r.status >= 400) return res.status(r.status).json({ message: r.body?.message || 'The homework could not be published.' });
    const hw = r.body?.homework || r.body; d.status = 'Published'; d.publishedRef = hw?._id || null; d.publishedAt = new Date(); d.revision += 1; await d.save();
    await audit(req, { action: 'sync.draft.publish', entityType: 'TeacherDraft', entityId: d.localId, schoolId: sid(req), detail: { homeworkId: hw?._id } });
    res.json({ message: 'Homework published.', draft: draftView(d) });
  } catch (e) { fail(res, e); }
};
exports.discardDraft = async (req, res) => {
  try {
    const d = await Draft.findOne({ schoolId: sid(req), teacherId: me(req), localId: req.params.localId }); if (!d) return res.status(404).json({ message: 'Draft not found.' });
    if (d.status !== 'Draft') return res.status(409).json({ message: 'This draft is not open any more.' });
    d.status = 'Discarded'; d.revision += 1; await d.save(); res.json({ message: 'Draft discarded.' });
  } catch (e) { fail(res, e); }
};

/* ───────── conflicts ───────── */
const conflictView = (c) => ({ _id: c._id, kind: c.kind, label: c.label, entityKey: c.entityKey, ownerName: c.ownerName, ownerId: c.ownerId, mine: c.mine, server: c.server, base: c.base, serverChangedBy: c.serverChangedBy, status: c.status, assignedToName: c.assignedToName, assignedToRole: c.assignedToRole, assignedByName: c.assignedByName, resolution: c.resolution, resolutionNote: c.resolutionNote, resolvedByName: c.resolvedByName, resolvedByRole: c.resolvedByRole, resolvedAt: c.resolvedAt, createdAt: c.createdAt });
const canAct = (req, c) => isAdmin(req) || String(c.ownerId) === String(me(req)) || String(c.assignedToId || '') === String(me(req));
exports.listConflicts = async (req, res) => {
  try {
    const status = ['Open', 'Resolved'].includes(req.query.status) ? req.query.status : 'Open'; const q = { schoolId: sid(req), status: status === 'Open' ? { $in: ['Open', 'Resolving'] } : 'Resolved' };
    if (!isAdmin(req)) q.$or = [{ ownerId: me(req) }, { assignedToId: me(req) }];
    res.json({ conflicts: (await Conflict.find(q).sort({ createdAt: -1 }).limit(200)).map(conflictView) });
  } catch (e) { fail(res, e); }
};
exports.delegate = async (req, res) => {
  try {
    const c = await Conflict.findOne({ _id: req.params.id, schoolId: sid(req) }); if (!c || !canAct(req, c)) return res.status(404).json({ message: 'Conflict not found.' });
    if (c.status !== 'Open') return res.status(409).json({ message: 'This conflict is already being resolved or closed.' });
    const b = req.body || {}; const by = await nameOf(req); let to;
    if (b.to === 'office') to = { id: null, role: 'admin', name: 'The school office' };
    else if (isId(b.teacherId)) { const t = await Teacher.findOne({ _id: b.teacherId, schoolId: sid(req) }).select('name'); if (!t) return res.status(404).json({ message: 'That teacher is not in this school.' }); if (String(t._id) === String(c.ownerId)) return res.status(422).json({ message: 'Choose someone other than the owner.' }); to = { id: t._id, role: 'teacher', name: t.name }; }
    else return res.status(400).json({ message: 'Choose the office or a teacher.' });
    await Conflict.updateOne({ _id: c._id }, { $set: { assignedToId: to.id, assignedToRole: to.role, assignedToName: to.name, assignedByName: by } });
    if (to.role === 'admin') await N.notify({ schoolId: sid(req), recipients: (await N.admins(sid(req))), title: 'A teacher asks the office to settle a conflict', body: c.label, link: '/admin?tab=syncDesk', type: 'general', key: `sync-delegate-${c._id}` });
    else await N.notify({ schoolId: sid(req), recipients: [{ id: to.id, role: 'teacher' }], title: 'You were asked to settle a clash', body: c.label, link: '/teacher?tab=today', type: 'general', key: `sync-delegate-${c._id}` });
    await audit(req, { action: 'sync.conflict.delegate', entityType: 'SyncConflict', entityId: c._id, schoolId: sid(req), detail: { to: to.name } });
    res.json({ message: `Handed to ${to.name}.` });
  } catch (e) { fail(res, e); }
};
exports.resolve = async (req, res) => {
  try {
    const c = await Conflict.findOne({ _id: req.params.id, schoolId: sid(req) }); if (!c || !canAct(req, c)) return res.status(404).json({ message: 'Conflict not found.' });
    // a conflict handed to the office is settled by the office; the owner can still take it back by choosing the other side
    if (c.assignedToRole === 'admin' && !isAdmin(req)) return res.status(403).json({ message: 'This was handed to the school office. They will settle it.' });
    const b = req.body || {}; const resolution = b.resolution; if (!['mine', 'server', 'merged'].includes(resolution)) return res.status(400).json({ message: 'Choose mine, server or merged.' });
    const claim = await Conflict.updateOne({ _id: c._id, status: 'Open' }, { $set: { status: 'Resolving' } }); if (!claim.modifiedCount && !claim.matchedCount) return res.status(409).json({ message: 'Someone is already settling this.' });
    const fresh = await Conflict.findById(c._id); if (fresh.status !== 'Resolving') return res.status(409).json({ message: 'This conflict is already closed.' });
    let msg = 'Kept the saved version.';
    try {
      if (resolution !== 'server') { const out = await applyResolution(req, c, resolution, b.value || {}); if (out.error) { await Conflict.updateOne({ _id: c._id }, { $set: { status: 'Open' } }); return res.status(out.status || 422).json({ message: out.error }); } msg = out.message; }
    } catch (e) { await Conflict.updateOne({ _id: c._id }, { $set: { status: 'Open' } }); throw e; }
    await Conflict.updateOne({ _id: c._id }, { $set: { status: 'Resolved', resolution, resolutionNote: str(b.note, 300), resolvedById: me(req), resolvedByName: await nameOf(req), resolvedByRole: req.user.role, resolvedAt: new Date() } });
    await audit(req, { action: 'sync.conflict.resolve', entityType: 'SyncConflict', entityId: c._id, schoolId: sid(req), detail: { kind: c.kind, resolution, entityKey: c.entityKey } });
    if (String(c.ownerId) !== String(me(req))) await N.notify({ schoolId: sid(req), recipients: [{ id: c.ownerId, role: 'teacher' }], title: 'A clash you had was settled', body: `${c.label}: ${resolution === 'server' ? 'the saved version was kept' : resolution === 'mine' ? 'your version was kept' : 'the two were combined'}.`, link: '/teacher?tab=today', type: 'general', key: `sync-resolved-${c._id}` });
    res.json({ message: msg });
  } catch (e) { fail(res, e); }
};
async function applyResolution(req, c, resolution, value) {
  if (c.kind === 'draft') {
    const localId = c.entityKey.replace(/^draft:/, ''); const d = await Draft.findOne({ schoolId: sid(req), teacherId: c.ownerId, localId }); if (!d) return { error: 'The draft no longer exists.', status: 404 }; if (d.status !== 'Draft') return { error: 'The draft is no longer open.', status: 409 };
    const pick = resolution === 'merged' ? draftBody({ ...c.mine, title: value.title ?? c.mine.title, body: value.body ?? c.mine.body }) : draftBody(c.mine);
    if (!pick.title && !pick.body) return { error: 'The combined draft is empty.' };
    Object.assign(d, pick, { revision: d.revision + 1 }); await d.save(); return { message: 'Draft updated.' };
  }
  if (c.kind === 'marks') {
    const x = c.context || {}; const marks = resolution === 'merged' ? Number(value.marks) : Number(c.mine.marks); const remarks = resolution === 'merged' ? str(value.remarks, 300) : c.mine.remarks;
    if (!Number.isFinite(marks) || marks < 0 || marks > Number(c.mine.outOfMarks)) return { error: 'Marks must be between 0 and the total.' };
    const exam = await Exam.findOne({ _id: x.examId, schoolId: sid(req) }); if (!exam) return { error: 'The exam no longer exists.', status: 404 };
    const r = await invoke(marksCtl.enterMarks, req, { body: { examId: x.examId, studentId: x.studentId, subjectId: x.subjectId, marks, outOfMarks: c.mine.outOfMarks, passStatus: marks >= (exam.passingMarks ?? 35) ? 'Pass' : 'Fail', remarks } });
    if (r.status >= 400) return { error: r.body?.message || 'The mark was refused.', status: r.status };
    await bump(req, c.entityKey, `resolve-${c._id}`); return { message: 'Mark updated.' };
  }
  const x = c.context || {}; const status = resolution === 'merged' ? value.status : c.mine.status; if (!DAILY.includes(status)) return { error: 'Choose a valid status.' };
  const rec = { studentId: x.studentId, status, leftAt: c.mine.leftAt || undefined, arrivedAt: c.mine.arrivedAt || undefined, note: c.mine.note || undefined };
  const r = x.period ? await invoke(period.mark, req, { body: { classId: x.classId, subjectId: x.subjectId, startTime: x.startTime, endTime: x.endTime, date: x.date, records: [rec] } }) : await invoke(daily.saveClassSheet, req, { body: { date: x.date, records: [rec] }, params: { classId: x.classId } });
  if (r.status >= 400) return { error: r.body?.message || 'The register was refused.', status: r.status };
  await bump(req, c.entityKey, `resolve-${c._id}`); return { message: 'Register updated.' };
}

/* ───────── office view ───────── */
exports.overview = async (req, res) => {
  try {
    const schoolId = sid(req); const since = new Date(Date.now() - 30 * 86400000); const rows = await SyncMutation.find({ schoolId, receivedAt: { $gte: since } }).select('status userId deviceId receivedAt kind');
    const by = {}; rows.forEach((r) => { by[r.status] = (by[r.status] || 0) + 1; });
    const open = await Conflict.find({ schoolId, status: { $in: ['Open', 'Resolving'] } }).sort({ createdAt: 1 }); const names = new Map((await Teacher.find({ schoolId }).select('name')).map((t) => [String(t._id), t.name]));
    const total = rows.filter((r) => r.status !== 'Running').length; const good = rows.filter((r) => ['Applied', 'Partial', 'Conflicted'].includes(r.status)).length; // applied once, or explicitly conflicted
    const devices = new Map(); rows.forEach((r) => { if (!r.deviceId) return; const k = `${r.userId}:${r.deviceId}`; const d = devices.get(k) || { userId: String(r.userId), deviceId: r.deviceId, last: r.receivedAt, count: 0 }; d.count += 1; if (r.receivedAt > d.last) d.last = r.receivedAt; devices.set(k, d); });
    res.json({ since, counts: { total, applied: by.Applied || 0, partial: by.Partial || 0, conflicted: by.Conflicted || 0, rejected: by.Rejected || 0 }, integrity: total ? Math.round((good / total) * 1000) / 10 : 100, openConflicts: open.length, oldestOpenHours: open[0] ? Math.round((Date.now() - new Date(open[0].createdAt).getTime()) / 36e5) : 0, byTeacher: [...open.reduce((m, c) => m.set(String(c.ownerId), (m.get(String(c.ownerId)) || 0) + 1), new Map())].map(([id, n]) => ({ teacherId: id, name: names.get(id) || '', open: n })), devices: [...devices.values()].map((d) => ({ ...d, name: names.get(d.userId) || '' })).sort((a, b) => b.last - a.last).slice(0, 30) });
  } catch (e) { fail(res, e); }
};
exports.recentRejections = async (req, res) => {
  try { const rows = await SyncMutation.find({ schoolId: sid(req), status: 'Rejected' }).sort({ receivedAt: -1 }).limit(50); const names = new Map((await Teacher.find({ schoolId: sid(req) }).select('name')).map((t) => [String(t._id), t.name])); res.json({ rejections: rows.map((r) => ({ _id: r._id, kind: r.kind, message: r.message, entityKey: r.entityKey, who: names.get(String(r.userId)) || '', receivedAt: r.receivedAt, deviceId: r.deviceId })) }); } catch (e) { fail(res, e); }
};
exports.helpers = { threeWay };
