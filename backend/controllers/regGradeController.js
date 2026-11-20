// Grades, changes, appeals and exceptions (PRD E16). A published grade changes only through a signed approval by someone other than
// whoever asked; an appeal is decided by a reviewer and the decision is signed the same way.
const S = require('../utils/registrar/service');
const { E, oid, sid, who, bad, wrap, clean } = S;
const Student = require('../models/Student');
const RegCourse = require('../models/RegCourse');
const RegProgramVersion = require('../models/RegProgramVersion');
const RegTerm = require('../models/RegTerm');
const RegSection = require('../models/RegSection');
const RegEnrollment = require('../models/RegEnrollment');
const RegStudentProgram = require('../models/RegStudentProgram');
const RegGradeChange = require('../models/RegGradeChange');
const RegAppeal = require('../models/RegAppeal');
const RegException = require('../models/RegException');
const { audit } = require('../utils/audit');
const N = require('../utils/notify');

// ---------- the roster and grade entry ----------
async function sectionFor(req, res) {
  const schoolId = sid(req); const sec = await RegSection.findOne({ _id: oid(req.params.id), schoolId }); if (!sec) { bad(res, 404, 'Section not found.'); return null; }
  if (!(await S.sectionAccess(req, sec))) { bad(res, 403, 'You do not teach this section.'); return null; }
  return sec;
}
exports.roster = wrap('reg.roster', async (req, res) => {
  const sec = await sectionFor(req, res); if (!sec) return; const schoolId = sid(req);
  const [term, rows, settings] = await Promise.all([RegTerm.findOne({ _id: sec.termId, schoolId }), RegEnrollment.find({ schoolId, sectionId: sec._id, status: { $in: ['enrolled', 'completed', 'withdrawn'] } }), S.getSettings(schoolId)]);
  const sts = await Student.find({ schoolId, _id: { $in: rows.map((r) => r.studentId) } }).select('name admissionNumber'); const sm = new Map(sts.map((s) => [String(s._id), s]));
  const open = ['open', 'grading'].includes(term?.status) && !sec.gradesSubmittedAt;
  res.json({ section: { _id: sec._id, courseCode: sec.courseCode, courseTitle: sec.courseTitle, section: sec.section, credits: sec.credits, gradesSubmittedAt: sec.gradesSubmittedAt || null }, term: term ? { _id: term._id, name: term.name, status: term.status } : null, canEdit: open,
    grades: [...settings.scale.map((g) => g.grade), 'I'], students: rows.map((r) => ({ enrollmentId: r._id, studentId: r.studentId, name: sm.get(String(r.studentId))?.name || '', admissionNumber: sm.get(String(r.studentId))?.admissionNumber || '', status: r.status, grade: r.grade, gradeState: r.gradeState, attemptNo: r.attemptNo, repeat: r.isRepeat })).sort((a, b) => a.name.localeCompare(b.name)) });
});
exports.saveGrades = wrap('reg.saveGrades', async (req, res) => {
  const sec = await sectionFor(req, res); if (!sec) return; const schoolId = sid(req);
  const term = await RegTerm.findOne({ _id: sec.termId, schoolId }); if (!['open', 'grading'].includes(term?.status)) return bad(res, 409, 'Grades can be entered while the term is open or in grading. Published grades change only through a signed grade change.');
  if (sec.gradesSubmittedAt) return bad(res, 409, 'These grades were submitted. Ask the registrar to reopen them.');
  const list = Array.isArray(req.body?.grades) ? req.body.grades.slice(0, 300) : []; if (!list.length) return bad(res, 400, 'Nothing to save.');
  const { scale } = await S.getSettings(schoolId); const me = req.actorName || '';
  const ids = list.map((g) => oid(g.enrollmentId)).filter(Boolean); const rows = await RegEnrollment.find({ schoolId, sectionId: sec._id, status: 'enrolled', _id: { $in: ids } }); const ok = new Map(rows.map((r) => [String(r._id), r]));
  let saved = 0; const skipped = [];
  for (const g of list) {
    const row = ok.get(String(g.enrollmentId)); const grade = clean(g.grade, 3).toUpperCase().replace(/\s/g, '');
    if (!row) { skipped.push({ enrollmentId: g.enrollmentId, why: 'Not registered in this section.' }); continue; }
    if (grade && (!E.isGrade(scale, grade) || grade === 'W')) { skipped.push({ enrollmentId: g.enrollmentId, why: `${grade || ''} is not a grade on the scale.` }); continue; }
    await RegEnrollment.updateOne({ _id: row._id, schoolId, status: 'enrolled' }, { $set: { grade, gradeState: grade ? 'draft' : 'none', gradedByName: me } }); saved += 1;
  }
  res.json({ saved, skipped });
});
exports.submitGrades = wrap('reg.submitGrades', async (req, res) => {
  const sec = await sectionFor(req, res); if (!sec) return; const schoolId = sid(req);
  const term = await RegTerm.findOne({ _id: sec.termId, schoolId }); if (!['open', 'grading'].includes(term?.status)) return bad(res, 409, 'This term is not taking grades.');
  if (sec.gradesSubmittedAt) return res.json({ ok: true });
  const rows = await RegEnrollment.find({ schoolId, sectionId: sec._id, status: 'enrolled' }); const miss = rows.filter((r) => !r.grade);
  if (miss.length) { const sts = await Student.find({ schoolId, _id: { $in: miss.map((m) => m.studentId) } }).select('name'); return bad(res, 422, `${miss.length} student${miss.length === 1 ? ' has' : 's have'} no grade yet. Enter a grade or I for incomplete.`, { missing: sts.map((s) => s.name) }); }
  await RegSection.updateOne({ _id: sec._id, schoolId }, { $set: { gradesSubmittedAt: new Date() } });
  await RegEnrollment.updateMany({ schoolId, sectionId: sec._id, status: 'enrolled' }, { $set: { gradeState: 'submitted' } });
  await audit(req, { action: 'registrar.grades.submit', entityType: 'RegSection', entityId: String(sec._id), schoolId, detail: { course: sec.courseCode, students: rows.length } });
  await S.notifyAdmins(schoolId, 'Grades submitted', `${req.actorName || 'An instructor'} submitted grades for ${sec.courseCode} section ${sec.section}.`, oid(req.user.userId)); res.json({ ok: true, submitted: rows.length });
});
exports.reopenGrades = wrap('reg.reopenGrades', async (req, res) => {
  const schoolId = sid(req); const sec = await RegSection.findOne({ _id: oid(req.params.id), schoolId }); if (!sec) return bad(res, 404, 'Section not found.');
  const term = await RegTerm.findOne({ _id: sec.termId, schoolId }); if (!['open', 'grading'].includes(term?.status)) return bad(res, 409, 'The term\'s grades are already published. Use a signed grade change.');
  const reason = clean(req.body?.reason, 200); if (reason.length < 5) return bad(res, 400, 'Say why the grades are reopened.');
  await RegSection.updateOne({ _id: sec._id, schoolId }, { $unset: { gradesSubmittedAt: 1 } }); await RegEnrollment.updateMany({ schoolId, sectionId: sec._id, status: 'enrolled', gradeState: 'submitted' }, { $set: { gradeState: 'draft' } });
  await audit(req, { action: 'registrar.grades.reopen', entityType: 'RegSection', entityId: String(sec._id), schoolId, detail: { course: sec.courseCode, reason } });
  if (sec.teacherId) N.notify({ schoolId, recipients: [{ id: sec.teacherId, role: 'teacher' }], title: 'Grades reopened', body: `${sec.courseCode} section ${sec.section}: ${reason}`, link: '/teacher#/registrar', type: 'registrar' }).catch(() => {}); res.json({ ok: true });
});

// publishing a term turns every submitted grade into the final grade
exports.publishTerm = async (req, res, term) => {
  const schoolId = sid(req); const b = req.body || {};
  const secs = await RegSection.find({ schoolId, termId: term._id, status: { $ne: 'cancelled' } }); const live = await RegEnrollment.find({ schoolId, termId: term._id, status: 'enrolled' });
  const per = new Map(); for (const e of live) { const k = String(e.sectionId); if (!per.has(k)) per.set(k, { total: 0, ungraded: 0 }); const p = per.get(k); p.total += 1; if (!e.grade) p.ungraded += 1; }
  const blockers = secs.filter((s) => per.has(String(s._id)) && (!s.gradesSubmittedAt || per.get(String(s._id)).ungraded)).map((s) => ({ section: `${s.courseCode} ${s.section}`, teacher: s.teacherName, ungraded: per.get(String(s._id)).ungraded, submitted: !!s.gradesSubmittedAt }));
  if (blockers.length && !b.markIncomplete) return bad(res, 409, `${blockers.length} section${blockers.length === 1 ? ' still has' : 's still have'} grades to finish. Finish them, or publish with ungraded students marked Incomplete.`, { blockers });
  if (blockers.length && clean(b.reason, 200).length < 5) return bad(res, 400, 'Say why you are publishing with unfinished grades.');
  const cas = await RegTerm.updateOne({ _id: term._id, schoolId, status: 'grading' }, { $set: { status: 'published', publishedAt: new Date(), publishedByName: req.actorName || '' } }); if (!cas.matchedCount) return bad(res, 409, 'Someone else just moved this term.');
  const students = [...new Set(live.map((e) => String(e.studentId)))];
  await RegEnrollment.updateMany({ schoolId, termId: term._id, status: 'enrolled', grade: '' }, { $set: { grade: 'I', gradedByName: req.actorName || '' } });
  await RegEnrollment.updateMany({ schoolId, termId: term._id, status: 'enrolled' }, { $set: { status: 'completed', gradeState: 'final' }, $inc: { gradeVersion: 1 } });
  await RegSection.updateMany({ schoolId, termId: term._id, status: 'open' }, { $set: { status: 'closed' } });
  await audit(req, { action: 'registrar.term.publish', entityType: 'RegTerm', entityId: String(term._id), schoolId, detail: { code: term.code, students: students.length, incomplete: blockers.length ? b.reason : undefined } });
  N.notify({ schoolId, recipients: students.map((id) => ({ id, role: 'student' })), title: 'Grades published', body: `Your ${term.name} grades are on your academic record.`, link: '/student#/record', type: 'registrar' }).catch(() => {});
  res.json({ ok: true, status: 'published', students: students.length, forced: blockers.length });
};

// ---------- grade changes ----------
const validGrade = (scale, g) => E.isGrade(scale, g) && g !== 'W';
const changeShape = (c) => ({ _id: c._id, enrollmentId: c.enrollmentId, studentId: c.studentId, courseCode: c.courseCode, fromGrade: c.fromGrade, toGrade: c.toGrade, reason: c.reason, source: c.source, status: c.status, requestedByName: c.requestedByName, requestedByRole: c.requestedByRole, decidedByName: c.decidedByName, decidedAt: c.decidedAt || null, decisionNote: c.decisionNote, sole: c.sole, signed: !!c.signature, createdAt: c.createdAt });
exports.requestChange = wrap('reg.requestChange', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const e = await RegEnrollment.findOne({ _id: oid(b.enrollmentId), schoolId }); if (!e) return bad(res, 404, 'Registration not found.');
  const sec = await RegSection.findOne({ _id: e.sectionId, schoolId }); if (!(await S.sectionAccess(req, sec))) return bad(res, 403, 'You do not teach this section.');
  if (e.status !== 'completed' || e.gradeState !== 'final') return bad(res, 409, 'Only a published grade needs a signed change. Edit the draft grade instead.');
  const { scale } = await S.getSettings(schoolId); const to = clean(b.toGrade, 3).toUpperCase();
  if (!validGrade(scale, to)) return bad(res, 400, `${b.toGrade || ''} is not a grade on the scale.`); if (to === e.grade) return bad(res, 400, 'That is already the grade.'); if (e.grade === 'W') return bad(res, 409, 'A withdrawal is changed through the registrar, not as a grade change.');
  const reason = clean(b.reason, 400); if (reason.length < 10) return bad(res, 400, 'Explain why the grade is changing (at least 10 characters).');
  if (await RegGradeChange.findOne({ schoolId, enrollmentId: e._id, status: 'pending' })) return bad(res, 409, 'A change for this grade is already waiting for approval.');
  const me = who(req); const c = await RegGradeChange.create({ schoolId, enrollmentId: e._id, studentId: e.studentId, courseCode: e.courseCode, termId: e.termId, fromGrade: e.grade, toGrade: to, reason, source: e.grade === 'I' ? 'incomplete' : 'correction', requestedById: me.id, requestedByName: me.name, requestedByRole: me.role });
  await audit(req, { action: 'registrar.gradechange.request', entityType: 'RegGradeChange', entityId: String(c._id), schoolId, detail: { course: e.courseCode, from: e.grade, to } });
  await S.notifyAdmins(schoolId, 'Grade change to approve', `${me.name} asks to change ${e.courseCode} from ${e.grade} to ${to}.`, me.id); res.status(201).json(changeShape(c));
});
// writes the new grade only if the grade is still what the request saw
async function applyChange(schoolId, c, byName) { return RegEnrollment.updateOne({ _id: c.enrollmentId, schoolId, grade: c.fromGrade, gradeState: 'final' }, { $set: { grade: c.toGrade, gradedByName: byName }, $inc: { gradeVersion: 1 } }); }
exports.decideChange = wrap('reg.decideChange', async (req, res) => {
  const schoolId = sid(req); const c = await RegGradeChange.findOne({ _id: oid(req.params.id), schoolId }); if (!c) return bad(res, 404, 'Request not found.'); if (c.status !== 'pending') return bad(res, 409, `This request is already ${c.status}.`);
  const me = who(req); const sole = await S.soleAdmin(schoolId); const note = clean(req.body?.note, 300);
  if (req.body?.approve === false) { if (note.length < 3) return bad(res, 400, 'Say why it is turned down.'); await RegGradeChange.updateOne({ _id: c._id, schoolId, status: 'pending' }, { $set: { status: 'rejected', decidedById: me.id, decidedByName: me.name, decidedAt: new Date(), decisionNote: note } }); return res.json({ ok: true, status: 'rejected' }); }
  if (c.requestedById && String(c.requestedById) === String(me.id) && !sole) return bad(res, 403, 'A different administrator has to approve a change you asked for.');
  const at = new Date(); const sig = E.sign({ id: String(c._id), enrollmentId: String(c.enrollmentId), from: c.fromGrade, to: c.toGrade, by: String(me.id), at: at.toISOString() });
  const cas = await RegGradeChange.updateOne({ _id: c._id, schoolId, status: 'pending' }, { $set: { status: 'approved', decidedById: me.id, decidedByName: me.name, decidedAt: at, decisionNote: note, sole, signature: sig } }); if (!cas.matchedCount) return bad(res, 409, 'Someone else just decided this.');
  const ap = await applyChange(schoolId, c, me.name);
  if (!ap.matchedCount) { await RegGradeChange.updateOne({ _id: c._id, schoolId }, { $set: { status: 'rejected', decisionNote: 'The grade changed after the request was made.' } }); return bad(res, 409, 'The grade changed after this request was made, so it was not applied. Ask again.'); }
  await audit(req, { action: 'registrar.gradechange.approve', entityType: 'RegGradeChange', entityId: String(c._id), schoolId, detail: { course: c.courseCode, from: c.fromGrade, to: c.toGrade, sole } });
  S.notifyStudent(schoolId, c.studentId, 'Grade updated', `Your ${c.courseCode} grade changed from ${c.fromGrade} to ${c.toGrade}.`, '/student#/record'); res.json({ ok: true, status: 'approved' });
});
exports.changes = wrap('reg.changes', async (req, res) => {
  const schoolId = sid(req); const f = { schoolId }; if (req.query.status) f.status = req.query.status; if (req.user.role === 'teacher') f.requestedById = oid(req.user.userId);
  const rows = await RegGradeChange.find(f).sort({ createdAt: -1 }).limit(200); const sts = await Student.find({ schoolId, _id: { $in: rows.map((r) => r.studentId) } }).select('name'); const sm = new Map(sts.map((s) => [String(s._id), s.name]));
  res.json({ changes: rows.map((c) => ({ ...changeShape(c), studentName: sm.get(String(c.studentId)) || '' })) });
});

// ---------- appeals ----------
const appealShape = (a) => ({ _id: a._id, number: a.number, enrollmentId: a.enrollmentId, studentId: a.studentId, studentName: a.studentName, courseCode: a.courseCode, gradeAtFiling: a.gradeAtFiling, reason: a.reason, status: a.status, instructorNote: a.instructorNote, reviewerName: a.reviewerName, decision: a.decision ? { note: a.decision.note, toGrade: a.decision.toGrade, byName: a.decision.byName, at: a.decision.at, signed: !!a.decision.signature } : null, events: (a.events || []).slice(-12), createdAt: a.createdAt });
exports.fileAppeal = wrap('reg.fileAppeal', async (req, res) => {
  const schoolId = sid(req); const studentId = oid(req.user.userId); const b = req.body || {};
  const e = await RegEnrollment.findOne({ _id: oid(b.enrollmentId), schoolId, studentId }); if (!e) return bad(res, 404, 'Registration not found.');
  if (e.status !== 'completed' || e.gradeState !== 'final' || ['W', 'I', 'AU'].includes(e.grade)) return bad(res, 409, 'Only a published grade can be appealed.');
  const [term, settings, st] = await Promise.all([RegTerm.findOne({ _id: e.termId, schoolId }), S.getSettings(schoolId), Student.findOne({ _id: studentId, schoolId }).select('name')]);
  const until = term?.publishedAt ? new Date(new Date(term.publishedAt).getTime() + settings.policy.appealDays * 86400000) : null; if (!until || until < new Date()) return bad(res, 409, `Appeals are accepted for ${settings.policy.appealDays} days after grades are published. That time has passed.`);
  const reason = clean(b.reason, 1000); if (reason.length < 20) return bad(res, 400, 'Explain your appeal in at least 20 characters so the reviewer can act on it.');
  if (await RegAppeal.findOne({ schoolId, enrollmentId: e._id, status: { $in: ['submitted', 'under_review'] } })) return bad(res, 409, 'There is already an open appeal for this course.');
  try {
    const a = await S.createNumbered(RegAppeal, schoolId, 'number', 'AP', { enrollmentId: e._id, studentId, studentName: st?.name || '', courseCode: e.courseCode, termId: e.termId, gradeAtFiling: e.grade, reason, activeKey: String(e._id), events: [{ at: new Date(), byName: st?.name || 'Student', what: 'Filed' }] });
    await audit(req, { action: 'registrar.appeal.file', entityType: 'RegAppeal', entityId: String(a._id), schoolId, detail: { course: e.courseCode, number: a.number } });
    await S.notifyAdmins(schoolId, 'Grade appeal', `${st?.name || 'A student'} appealed ${e.courseCode} (${a.number}).`); const sec = await RegSection.findOne({ _id: e.sectionId, schoolId }); if (sec?.teacherId) N.notify({ schoolId, recipients: [{ id: sec.teacherId, role: 'teacher' }], title: 'Grade appeal', body: `An appeal was filed on ${e.courseCode}. The reviewer may ask for your note.`, link: '/teacher#/registrar', type: 'registrar' }).catch(() => {});
    res.status(201).json(appealShape(a));
  } catch (err) { if (S.isDup(err) || /could not number/.test(err.message)) return bad(res, 409, 'There is already an open appeal for this course.'); throw err; }
});
exports.withdrawAppeal = wrap('reg.withdrawAppeal', async (req, res) => {
  const schoolId = sid(req); const a = await RegAppeal.findOne({ _id: oid(req.params.id), schoolId, studentId: oid(req.user.userId) }); if (!a) return bad(res, 404, 'Appeal not found.'); if (!['submitted', 'under_review'].includes(a.status)) return bad(res, 409, 'This appeal is already decided.');
  await RegAppeal.updateOne({ _id: a._id, schoolId, status: a.status }, { $set: { status: 'withdrawn' }, $unset: { activeKey: 1 }, $push: { events: { at: new Date(), byName: 'Student', what: 'Withdrawn' } } }); res.json({ ok: true });
});
exports.appeals = wrap('reg.appeals', async (req, res) => {
  const schoolId = sid(req); const f = { schoolId }; if (req.query.status) f.status = req.query.status;
  if (req.user.role === 'teacher') { const secs = await RegSection.find({ schoolId, teacherId: oid(req.user.userId) }).select('_id'); const es = await RegEnrollment.find({ schoolId, sectionId: { $in: secs.map((s) => s._id) } }).select('_id'); f.enrollmentId = { $in: es.map((x) => x._id) }; }
  const rows = await RegAppeal.find(f).sort({ createdAt: -1 }).limit(200); res.json({ appeals: rows.map(appealShape) });
});
exports.assignAppeal = wrap('reg.assignAppeal', async (req, res) => {
  const schoolId = sid(req); const a = await RegAppeal.findOne({ _id: oid(req.params.id), schoolId }); if (!a) return bad(res, 404, 'Appeal not found.'); if (!['submitted', 'under_review'].includes(a.status)) return bad(res, 409, 'This appeal is already decided.');
  const me = who(req); await RegAppeal.updateOne({ _id: a._id, schoolId, status: a.status }, { $set: { status: 'under_review', reviewerId: me.id, reviewerName: me.name }, $push: { events: { at: new Date(), byName: me.name, what: 'Taken for review' } } });
  S.notifyStudent(schoolId, a.studentId, 'Appeal under review', `Your appeal ${a.number} is being reviewed.`, '/student#/record'); res.json({ ok: true });
});
exports.appealNote = wrap('reg.appealNote', async (req, res) => {
  const schoolId = sid(req); const a = await RegAppeal.findOne({ _id: oid(req.params.id), schoolId }); if (!a) return bad(res, 404, 'Appeal not found.'); if (!['submitted', 'under_review'].includes(a.status)) return bad(res, 409, 'This appeal is already decided.');
  const e = await RegEnrollment.findOne({ _id: a.enrollmentId, schoolId }); const sec = e && await RegSection.findOne({ _id: e.sectionId, schoolId }); if (!sec || !(await S.sectionAccess(req, sec))) return bad(res, 403, 'Only the instructor or the registrar can add a note.');
  const note = clean(req.body?.note, 1000); if (note.length < 5) return bad(res, 400, 'Write the note.'); await RegAppeal.updateOne({ _id: a._id, schoolId }, { $set: { instructorNote: note }, $push: { events: { at: new Date(), byName: req.actorName || '', what: 'Instructor note added' } } }); res.json({ ok: true });
});
exports.decideAppeal = wrap('reg.decideAppeal', async (req, res) => {
  const schoolId = sid(req); const a = await RegAppeal.findOne({ _id: oid(req.params.id), schoolId }); if (!a) return bad(res, 404, 'Appeal not found.'); if (!['submitted', 'under_review'].includes(a.status)) return bad(res, 409, 'This appeal is already decided.');
  const me = who(req); const sole = await S.soleAdmin(schoolId); const b = req.body || {}; const note = clean(b.note, 600); if (note.length < 10) return bad(res, 400, 'Write the reasons for the decision (at least 10 characters).');
  if (a.reviewerId && String(a.reviewerId) !== String(me.id) && !sole) return bad(res, 403, `${a.reviewerName} is reviewing this appeal.`);
  const e = await RegEnrollment.findOne({ _id: a.enrollmentId, schoolId }); if (!e) return bad(res, 404, 'Registration not found.'); const at = new Date();
  if (b.outcome === 'reject') {
    const sig = E.sign({ appeal: String(a._id), outcome: 'rejected', by: String(me.id), at: at.toISOString() });
    const r = await RegAppeal.updateOne({ _id: a._id, schoolId, status: a.status }, { $set: { status: 'rejected', decision: { note, byId: me.id, byName: me.name, at, signature: sig } }, $unset: { activeKey: 1 }, $push: { events: { at, byName: me.name, what: 'Rejected' } } }); if (!r.matchedCount) return bad(res, 409, 'Someone else just decided this.');
    S.notifyStudent(schoolId, a.studentId, 'Appeal decided', `Your appeal ${a.number} was not upheld. The reasons are on your record.`, '/student#/record'); await audit(req, { action: 'registrar.appeal.reject', entityType: 'RegAppeal', entityId: String(a._id), schoolId, detail: { number: a.number } }); return res.json({ ok: true, status: 'rejected' });
  }
  if (b.outcome !== 'uphold') return bad(res, 400, 'The outcome must be uphold or reject.');
  const { scale } = await S.getSettings(schoolId); const to = clean(b.toGrade, 3).toUpperCase(); if (!validGrade(scale, to)) return bad(res, 400, 'Give the corrected grade.'); if (to === e.grade) return bad(res, 400, 'That is the grade already.');
  const sig = E.sign({ appeal: String(a._id), outcome: 'upheld', from: e.grade, to, by: String(me.id), at: at.toISOString() });
  const r = await RegAppeal.updateOne({ _id: a._id, schoolId, status: a.status }, { $set: { status: 'upheld', decision: { note, toGrade: to, byId: me.id, byName: me.name, at, signature: sig } }, $unset: { activeKey: 1 }, $push: { events: { at, byName: me.name, what: `Upheld, ${e.grade} to ${to}` } } }); if (!r.matchedCount) return bad(res, 409, 'Someone else just decided this.');
  const gc = await RegGradeChange.create({ schoolId, enrollmentId: e._id, studentId: e.studentId, courseCode: e.courseCode, termId: e.termId, fromGrade: e.grade, toGrade: to, reason: `Appeal ${a.number}: ${note}`, source: 'appeal', appealId: a._id, status: 'approved', requestedByName: a.studentName, requestedByRole: 'student', decidedById: me.id, decidedByName: me.name, decidedAt: at, decisionNote: note, sole, signature: sig });
  const ap = await applyChange(schoolId, gc, me.name); if (!ap.matchedCount) return bad(res, 409, 'The grade changed since the appeal was filed. Check the record and decide again.');
  S.notifyStudent(schoolId, a.studentId, 'Appeal upheld', `Your ${e.courseCode} grade changed from ${e.grade} to ${to}.`, '/student#/record'); await audit(req, { action: 'registrar.appeal.uphold', entityType: 'RegAppeal', entityId: String(a._id), schoolId, detail: { number: a.number, from: e.grade, to } }); res.json({ ok: true, status: 'upheld' });
});

// ---------- advisor exceptions ----------
const exShape = (x) => ({ _id: x._id, studentId: x.studentId, studentName: x.studentName, kind: x.kind, courseCode: x.courseCode, substituteCode: x.substituteCode, groupKey: x.groupKey, termId: x.termId || null, maxCredits: x.maxCredits, versionId: x.versionId || null, reason: x.reason, status: x.status, requestedByName: x.requestedByName, requestedByRole: x.requestedByRole, decidedByName: x.decidedByName, decidedAt: x.decidedAt || null, decisionNote: x.decisionNote, sole: x.sole, signed: !!x.signature, createdAt: x.createdAt });
exports.requestException = wrap('reg.requestException', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const studentId = oid(b.studentId);
  if (!(await S.canSeeStudent(req, studentId))) return bad(res, 403, 'You can ask for exceptions only for your own advisees.');
  const st = await Student.findOne({ _id: studentId, schoolId }).select('name'); const prog = await S.currentProgram(schoolId, studentId); if (!st || !prog) return bad(res, 404, 'This student is not in a programme.');
  const kind = b.kind; if (!['prereq_waiver', 'substitution', 'requirement_waiver', 'overload', 'extra_attempt', 'catalog_switch'].includes(kind)) return bad(res, 400, 'Choose what kind of exception this is.');
  const reason = clean(b.reason, 600); if (reason.length < 10) return bad(res, 400, 'Explain why (at least 10 characters). The registrar decides from this.');
  const catalog = await S.catalogMap(schoolId); const code = (v) => clean(v, 20).toUpperCase(); const doc = { schoolId, studentId, studentName: st.name, kind, reason };
  const ver = await RegProgramVersion.findOne({ _id: prog.versionId, schoolId });
  if (kind === 'prereq_waiver' || kind === 'extra_attempt') { doc.courseCode = code(b.courseCode); if (!catalog.has(doc.courseCode)) return bad(res, 404, `${doc.courseCode || 'That course'} is not in the catalogue.`); }
  if (kind === 'substitution') {
    doc.courseCode = code(b.courseCode); doc.substituteCode = code(b.substituteCode); doc.groupKey = clean(b.groupKey, 30);
    if (!catalog.has(doc.courseCode) || !catalog.has(doc.substituteCode)) return bad(res, 404, 'Both courses must be in the catalogue.'); if (doc.courseCode === doc.substituteCode) return bad(res, 400, 'The substitute must be a different course.');
    if (!(ver?.requirements || []).some((g) => g.rule === 'all' && g.courses.includes(doc.courseCode))) return bad(res, 422, `${doc.courseCode} is not a required course in this student's rules.`);
  }
  if (kind === 'requirement_waiver') { doc.groupKey = clean(b.groupKey, 30); if (!(ver?.requirements || []).some((g) => g.key === doc.groupKey)) return bad(res, 422, 'That requirement group is not in this student\'s rules.'); }
  if (kind === 'overload') { const t = await RegTerm.findOne({ _id: oid(b.termId), schoolId }); const settings = await S.getSettings(schoolId); const m = Number(b.maxCredits); if (!t) return bad(res, 404, 'Term not found.'); if (!(m > settings.policy.maxCreditsPerTerm && m <= 40)) return bad(res, 400, `Ask for more than ${settings.policy.maxCreditsPerTerm} credits and at most 40.`); doc.termId = t._id; doc.maxCredits = m; }
  if (kind === 'catalog_switch') { const v = await RegProgramVersion.findOne({ _id: oid(b.versionId), schoolId, programId: prog.programId, status: 'published' }); if (!v) return bad(res, 404, 'Choose a published version of the same programme.'); if (String(v._id) === String(prog.versionId)) return bad(res, 400, 'The student is already on that version.'); doc.versionId = v._id; doc.courseCode = v.catalogYear; }
  const dup = await RegException.findOne({ schoolId, studentId, kind, courseCode: doc.courseCode || '', groupKey: doc.groupKey || '', status: 'pending' }); if (dup) return bad(res, 409, 'The same request is already waiting for a decision.');
  const me = who(req); const x = await RegException.create({ ...doc, requestedById: me.id, requestedByName: me.name, requestedByRole: me.role });
  await audit(req, { action: 'registrar.exception.request', entityType: 'RegException', entityId: String(x._id), schoolId, detail: { kind, student: st.name } }); await S.notifyAdmins(schoolId, 'Exception to decide', `${me.name} asks for a ${kind.replace('_', ' ')} for ${st.name}.`, me.id); res.status(201).json(exShape(x));
});
exports.decideException = wrap('reg.decideException', async (req, res) => {
  const schoolId = sid(req); const x = await RegException.findOne({ _id: oid(req.params.id), schoolId }); if (!x) return bad(res, 404, 'Request not found.'); if (x.status !== 'pending') return bad(res, 409, `This request is already ${x.status}.`);
  const me = who(req); const sole = await S.soleAdmin(schoolId); const note = clean(req.body?.note, 300);
  if (req.body?.approve === false) { if (note.length < 3) return bad(res, 400, 'Say why it is turned down.'); await RegException.updateOne({ _id: x._id, schoolId, status: 'pending' }, { $set: { status: 'rejected', decidedById: me.id, decidedByName: me.name, decidedAt: new Date(), decisionNote: note } }); S.notifyStudent(schoolId, x.studentId, 'Request decided', 'Your request was not approved.', '/student#/record'); return res.json({ ok: true, status: 'rejected' }); }
  if (x.requestedById && String(x.requestedById) === String(me.id) && !sole) return bad(res, 403, 'A different administrator has to approve a request you made.');
  const at = new Date(); const sig = E.sign({ id: String(x._id), kind: x.kind, student: String(x.studentId), course: x.courseCode, sub: x.substituteCode, group: x.groupKey, by: String(me.id), at: at.toISOString() });
  if (x.kind === 'catalog_switch') { const prog = await S.currentProgram(schoolId, x.studentId); const v = await RegProgramVersion.findOne({ _id: x.versionId, schoolId, status: 'published' }); if (!prog || !v) return bad(res, 409, 'The student or the version has changed. Ask again.'); }
  const cas = await RegException.updateOne({ _id: x._id, schoolId, status: 'pending' }, { $set: { status: 'approved', decidedById: me.id, decidedByName: me.name, decidedAt: at, decisionNote: note, sole, signature: sig } }); if (!cas.matchedCount) return bad(res, 409, 'Someone else just decided this.');
  if (x.kind === 'catalog_switch') { const prog = await S.currentProgram(schoolId, x.studentId); const v = await RegProgramVersion.findOne({ _id: x.versionId, schoolId }); await RegStudentProgram.updateOne({ _id: prog._id, schoolId }, { $set: { versionId: v._id, catalogYear: v.catalogYear }, $push: { history: { at, byName: me.name, change: `Catalogue ${prog.catalogYear} to ${v.catalogYear} (signed exception)` } } }); await RegException.updateOne({ _id: x._id, schoolId }, { $set: { status: 'used' } }); }
  await audit(req, { action: 'registrar.exception.approve', entityType: 'RegException', entityId: String(x._id), schoolId, detail: { kind: x.kind, student: x.studentName, sole } });
  S.notifyStudent(schoolId, x.studentId, 'Request approved', `Your ${x.kind.replace('_', ' ')} was approved.`, '/student#/record'); if (x.requestedByRole === 'teacher') N.notify({ schoolId, recipients: [{ id: x.requestedById, role: 'teacher' }], title: 'Exception approved', body: `${x.studentName}: ${x.kind.replace('_', ' ')} approved.`, link: '/teacher#/registrar', type: 'registrar' }).catch(() => {});
  res.json({ ok: true, status: x.kind === 'catalog_switch' ? 'used' : 'approved' });
});
exports.withdrawException = wrap('reg.withdrawException', async (req, res) => {
  const schoolId = sid(req); const x = await RegException.findOne({ _id: oid(req.params.id), schoolId }); if (!x) return bad(res, 404, 'Request not found.'); if (x.status !== 'pending') return bad(res, 409, 'It is already decided.');
  if (req.user.role !== 'admin' && String(x.requestedById) !== String(req.user.userId)) return bad(res, 403, 'Only the person who asked can withdraw it.');
  await RegException.updateOne({ _id: x._id, schoolId, status: 'pending' }, { $set: { status: 'withdrawn' } }); res.json({ ok: true });
});
exports.exceptions = wrap('reg.exceptions', async (req, res) => {
  const schoolId = sid(req); const f = { schoolId }; if (req.query.status) f.status = req.query.status; if (req.user.role === 'teacher') f.requestedById = oid(req.user.userId);
  res.json({ exceptions: (await RegException.find(f).sort({ createdAt: -1 }).limit(200)).map(exShape) });
});

// ---------- teacher and overview ----------
exports.mySections = wrap('reg.mySections', async (req, res) => {
  const schoolId = sid(req); const secs = await RegSection.find({ schoolId, teacherId: oid(req.user.userId) }).sort({ createdAt: -1 }).limit(60); const terms = await S.termsMap(schoolId);
  res.json({ sections: secs.filter((s) => s.status !== 'cancelled').map((s) => ({ _id: s._id, courseCode: s.courseCode, courseTitle: s.courseTitle, section: s.section, enrolled: s.enrolled, termName: terms.get(String(s.termId))?.name || '', termStatus: terms.get(String(s.termId))?.status || '', gradesSubmittedAt: s.gradesSubmittedAt || null, schedule: s.schedule })) });
});
exports.myAdvisees = wrap('reg.myAdvisees', async (req, res) => {
  const rows = await RegStudentProgram.find({ schoolId: sid(req), advisorId: oid(req.user.userId), isCurrent: true }).sort({ studentName: 1 }); res.json({ advisees: rows.map((p) => ({ studentId: p.studentId, name: p.studentName, program: p.programName, catalogYear: p.catalogYear, status: p.status })) });
});
exports.overview = wrap('reg.overview', async (req, res) => {
  const schoolId = sid(req);
  const [programs, courses, terms, placed, versions, changes, appeals, exs, secs] = await Promise.all([RegProgram0(schoolId), RegCourse.countDocuments({ schoolId, status: 'active' }), RegTerm.find({ schoolId }).select('status name'), RegStudentProgram.find({ schoolId, isCurrent: true }).select('status'), RegProgramVersion.countDocuments({ schoolId, status: 'review' }), RegGradeChange.countDocuments({ schoolId, status: 'pending' }), RegAppeal.countDocuments({ schoolId, status: { $in: ['submitted', 'under_review'] } }), RegException.countDocuments({ schoolId, status: 'pending' }), RegSection.find({ schoolId, status: { $ne: 'cancelled' } }).select('termId gradesSubmittedAt enrolled')]);
  const grading = new Set(terms.filter((t) => ['open', 'grading'].includes(t.status)).map((t) => String(t._id)));
  res.json({ programs, courses, openTerms: terms.filter((t) => t.status === 'open').length, gradingTerms: terms.filter((t) => t.status === 'grading').length, students: { active: placed.filter((p) => p.status === 'active').length, graduated: placed.filter((p) => p.status === 'graduated').length }, waiting: { versions, gradeChanges: changes, appeals, exceptions: exs, sectionsToGrade: secs.filter((s) => grading.has(String(s.termId)) && s.enrolled > 0 && !s.gradesSubmittedAt).length }, soleAdmin: await S.soleAdmin(schoolId) });
});
const RegProgram0 = (schoolId) => require('../models/RegProgram').countDocuments({ schoolId, status: 'active' });
