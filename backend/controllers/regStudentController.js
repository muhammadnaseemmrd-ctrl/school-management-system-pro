// Students in the registrar (PRD E16): placing a student in a programme, registration with prerequisite checks, the record,
// the degree audit, graduation and signed transcripts.
const crypto = require('crypto');
const S = require('../utils/registrar/service');
const { E, oid, sid, who, bad, wrap, clean } = S;
const Student = require('../models/Student');
const School = require('../models/School');
const Teacher = require('../models/Teacher');
const RegCourse = require('../models/RegCourse');
const RegProgram = require('../models/RegProgram');
const RegProgramVersion = require('../models/RegProgramVersion');
const RegTerm = require('../models/RegTerm');
const RegSection = require('../models/RegSection');
const RegEnrollment = require('../models/RegEnrollment');
const RegStudentProgram = require('../models/RegStudentProgram');
const RegException = require('../models/RegException');
const RegTranscript = require('../models/RegTranscript');
const { audit } = require('../utils/audit');

// ---------- finding people ----------
exports.people = wrap('reg.people', async (req, res) => {
  const schoolId = sid(req); const q = clean(req.query.q, 40).toLowerCase(); const { p, l } = S.pg(req.query);
  const placed = await RegStudentProgram.find({ schoolId, isCurrent: true }); const pm = new Map(placed.map((x) => [String(x.studentId), x]));
  const sf = { schoolId, isActive: { $ne: false } };
  let rows = await Student.find(sf).select('name admissionNumber email').sort({ name: 1 });
  if (q) rows = rows.filter((s) => `${s.name} ${s.admissionNumber || ''}`.toLowerCase().includes(q));
  if (req.query.placed === 'yes') rows = rows.filter((s) => pm.has(String(s._id))); if (req.query.placed === 'no') rows = rows.filter((s) => !pm.has(String(s._id)));
  if (req.query.programId) rows = rows.filter((s) => pm.get(String(s._id)) && String(pm.get(String(s._id)).programId) === String(req.query.programId));
  if (req.query.status) rows = rows.filter((s) => pm.get(String(s._id))?.status === req.query.status);
  res.json({ total: rows.length, page: p, people: rows.slice((p - 1) * l, p * l).map((s) => { const x = pm.get(String(s._id)); return { _id: s._id, name: s.name, admissionNumber: s.admissionNumber || '', program: x ? { programId: x.programId, name: x.programName, catalogYear: x.catalogYear, status: x.status, advisorName: x.advisorName, advisorId: x.advisorId || null } : null }; }) });
});

// ---------- placing a student in a programme ----------
exports.place = wrap('reg.place', async (req, res) => {
  const schoolId = sid(req); const studentId = oid(req.params.studentId); const b = req.body || {};
  const st = await Student.findOne({ _id: studentId, schoolId }).select('name'); if (!st) return bad(res, 404, 'Student not found.');
  const prog = await RegProgram.findOne({ _id: oid(b.programId), schoolId }); if (!prog) return bad(res, 404, 'Programme not found.'); if (prog.status !== 'active') return bad(res, 409, 'This programme is retired.');
  let ver = b.versionId ? await RegProgramVersion.findOne({ _id: oid(b.versionId), schoolId, programId: prog._id }) : (await RegProgramVersion.find({ schoolId, programId: prog._id, status: 'published' }).sort({ catalogYear: -1 }))[0];
  if (!ver || ver.status !== 'published') return bad(res, 422, 'This programme has no published rules for that catalogue year. Publish a version first.');
  let adv = null; if (b.advisorId) { adv = await Teacher.findOne({ _id: oid(b.advisorId), schoolId }).select('name'); if (!adv) return bad(res, 404, 'Advisor not found in this school.'); }
  const cur = await S.currentProgram(schoolId, studentId);
  if (cur) {
    if (!b.switch) return bad(res, 409, `${st.name} is already in ${cur.programName} (${cur.status}). Pass switch to move them.`);
    const r = await RegStudentProgram.updateOne({ _id: cur._id, schoolId, isCurrent: true }, { $set: { isCurrent: false, ...(cur.status === 'active' ? { status: 'withdrawn' } : {}) }, $unset: { currentKey: 1 }, $push: { history: { at: new Date(), byName: req.actorName || '', change: `Moved to ${prog.name}` } } });
    if (!r.matchedCount) return bad(res, 409, 'Someone else just changed this student.');
  }
  try {
    const doc = await RegStudentProgram.create({ schoolId, studentId, studentName: st.name, programId: prog._id, programName: prog.name, versionId: ver._id, catalogYear: ver.catalogYear, advisorId: adv?._id, advisorName: adv?.name || '', currentKey: `${schoolId}:${studentId}`, startedAt: S.dayKey(), history: [{ at: new Date(), byName: req.actorName || '', change: `Placed in ${prog.name}, catalogue ${ver.catalogYear}` }] });
    await audit(req, { action: 'registrar.place', entityType: 'RegStudentProgram', entityId: String(doc._id), schoolId, detail: { student: st.name, program: prog.code, year: ver.catalogYear } });
    S.notifyStudent(schoolId, studentId, 'Your programme', `You are in ${prog.name}, catalogue ${ver.catalogYear}.`, '/student#/record'); res.status(201).json(doc);
  } catch (e) { if (S.isDup(e)) return bad(res, 409, 'Someone else just placed this student.'); throw e; }
});
exports.setAdvisor = wrap('reg.setAdvisor', async (req, res) => {
  const schoolId = sid(req); const cur = await S.currentProgram(schoolId, oid(req.params.studentId)); if (!cur) return bad(res, 404, 'This student is not in a programme.');
  let adv = null; if (req.body?.advisorId) { adv = await Teacher.findOne({ _id: oid(req.body.advisorId), schoolId }).select('name'); if (!adv) return bad(res, 404, 'Advisor not found in this school.'); }
  await RegStudentProgram.updateOne({ _id: cur._id, schoolId }, adv ? { $set: { advisorId: adv._id, advisorName: adv.name }, $push: { history: { at: new Date(), byName: req.actorName || '', change: `Advisor ${adv.name}` } } } : { $set: { advisorName: '' }, $unset: { advisorId: 1 }, $push: { history: { at: new Date(), byName: req.actorName || '', change: 'Advisor removed' } } });
  if (adv) require('../utils/notify').notify({ schoolId, recipients: [{ id: adv._id, role: 'teacher' }], title: 'New advisee', body: `${cur.studentName} is now one of your advisees.`, link: '/teacher#/registrar', type: 'registrar' }).catch(() => {});
  res.json({ ok: true });
});

// ---------- registration ----------
// Everything that decides whether this student may take this section, with the exact reason when not.
async function evaluate(schoolId, studentId, section, { settings, terms, history, exceptions, prog, term, loadByTerm }) {
  const reasons = []; const info = {}; const course = await RegCourse.findOne({ _id: section.courseId, schoolId });
  if (!course || course.status === 'retired') reasons.push({ kind: 'course', message: 'This course is no longer offered.' });
  if (section.status !== 'open') reasons.push({ kind: 'section', message: 'This section is closed.' });
  if (section.enrolled >= section.capacity) reasons.push({ kind: 'full', message: 'This section is full.' });
  const mine = history.filter((e) => e.status === 'enrolled' && String(e.termId) === String(section.termId));
  if (mine.some((e) => String(e.courseId) === String(section.courseId))) reasons.push({ kind: 'duplicate', message: 'Already registered for this course this term.' });
  if (course) {
    const ex = exceptions.filter((x) => x.status === 'approved');
    const rep = E.repeatCheck(course.code, history.filter((e) => e.status !== 'enrolled' || String(e.termId) !== String(section.termId)), settings.scale, settings.policy, { extraAttempt: ex.some((x) => x.kind === 'extra_attempt' && x.courseCode === course.code) });
    if (!rep.ok) reasons.push({ kind: rep.kind, message: rep.reason }); else { info.attemptNo = rep.attemptNo || 1; info.isRepeat = info.attemptNo > 1; if (rep.usedException) info.extraId = ex.find((x) => x.kind === 'extra_attempt' && x.courseCode === course.code)?._id || null; }
    const waiver = ex.find((x) => x.kind === 'prereq_waiver' && x.courseCode === course.code);
    const pre = E.prereqCheck(course, history.filter((e) => e.status !== 'enrolled'), settings.scale, settings.policy, { concurrent: mine.map((e) => e.courseCode), waived: !!waiver });
    if (!pre.ok) reasons.push({ kind: 'prerequisite', message: `Needs ${pre.missing.map((m) => (m.corequisite ? `${m.code} at the same time` : `${m.code}${m.minGrade ? ` with ${m.minGrade} or better` : ''}`)).join(', ')} first.`, missing: pre.missing });
    info.waiverId = waiver?._id || null;
    const load = mine.reduce((s, e) => s + (e.credits || 0), 0) + (course.credits || 0); const over = ex.find((x) => x.kind === 'overload' && String(x.termId) === String(section.termId) && x.maxCredits >= load);
    if (load > settings.policy.maxCreditsPerTerm && !over) reasons.push({ kind: 'load', message: `That makes ${load} credits this term; the limit is ${settings.policy.maxCreditsPerTerm}.` });
    if (section.schedule) { const clash = mine.find((e) => { const o = loadByTerm.get(String(e.sectionId)); return o && o.schedule && o.schedule.toLowerCase() === section.schedule.toLowerCase(); }); if (clash) reasons.push({ kind: 'clash', message: `Meets at the same time as ${clash.courseCode}.` }); }
  }
  return { ok: reasons.length === 0, reasons, info, course };
}
async function context(schoolId, studentId, termId) {
  const [settings, terms] = await Promise.all([S.getSettings(schoolId), S.termsMap(schoolId)]);
  const history = await S.history(schoolId, studentId, terms); const exceptions = (await RegException.find({ schoolId, studentId, status: 'approved' })).map(S.plain);
  const secs = await RegSection.find({ schoolId, termId }); const loadByTerm = new Map(secs.map((s) => [String(s._id), S.plain(s)]));
  return { settings, terms, history, exceptions, loadByTerm };
}
async function doEnroll(req, res, studentId, { selfService = false } = {}) {
  const schoolId = sid(req); const sec = await RegSection.findOne({ _id: oid(req.body?.sectionId), schoolId }); if (!sec) return bad(res, 404, 'Section not found.');
  const term = await RegTerm.findOne({ _id: sec.termId, schoolId }); if (!term || term.status !== 'open') return bad(res, 409, 'Registration is not open for this term.');
  const st = await Student.findOne({ _id: studentId, schoolId, isActive: { $ne: false } }).select('name'); if (!st) return bad(res, 404, 'Student not found.');
  const prog = await S.currentProgram(schoolId, studentId); if (!prog || prog.status !== 'active') return bad(res, 409, 'This student is not in an active programme.');
  const today = S.dayKey(); let late = false;
  if (term.addDropUntil && today > term.addDropUntil) { if (selfService) return bad(res, 409, 'The add and drop deadline has passed. Ask the registrar.'); late = true; if (clean(req.body?.lateReason, 200).length < 5) return bad(res, 400, 'The deadline has passed. Give the reason for adding late.'); }
  const ctx = await context(schoolId, studentId, term._id);
  if (selfService && !ctx.settings.policy.selfRegistration) return bad(res, 403, 'Registration is done through your advisor or the registrar.');
  const ev = await evaluate(schoolId, studentId, sec, { ...ctx, prog, term });
  if (!ev.ok) return bad(res, 422, ev.reasons[0].message, { reasons: ev.reasons });
  // take the seat first; the unique key stops a second registration for the same course
  const seat = await RegSection.updateOne({ _id: sec._id, schoolId, status: 'open', enrolled: { $lt: sec.capacity } }, { $inc: { enrolled: 1 } });
  if (!seat.matchedCount) return bad(res, 409, 'The last seat was just taken.');
  try {
    const e = await RegEnrollment.create({ schoolId, studentId, sectionId: sec._id, termId: term._id, courseId: sec.courseId, courseCode: sec.courseCode, courseTitle: sec.courseTitle, credits: sec.credits, activeKey: `${studentId}:${sec.courseId}:${term._id}`, attemptNo: ev.info.attemptNo || 1, isRepeat: !!ev.info.isRepeat, prereqOverride: ev.info.waiverId || undefined, enrolledByName: selfService ? 'Student' : (req.actorName || '') });
    if (ev.info.extraId) await RegException.updateOne({ _id: ev.info.extraId, schoolId, status: 'approved' }, { $set: { status: 'used' } });
    await audit(req, { action: 'registrar.enroll', entityType: 'RegEnrollment', entityId: String(e._id), schoolId, detail: { student: st.name, course: sec.courseCode, term: term.code, late, repeat: !!ev.info.isRepeat } });
    res.status(201).json({ ok: true, enrollmentId: e._id, attemptNo: e.attemptNo, repeat: e.isRepeat, late });
  } catch (err) { await RegSection.updateOne({ _id: sec._id, schoolId, enrolled: { $gt: 0 } }, { $inc: { enrolled: -1 } }); if (S.isDup(err)) return bad(res, 409, 'Already registered for this course this term.'); throw err; }
}
exports.enroll = wrap('reg.enroll', async (req, res) => { const studentId = oid(req.params.studentId); if (!(await S.canSeeStudent(req, studentId))) return bad(res, 403, 'You do not advise this student.'); return doEnroll(req, res, studentId); });
exports.meEnroll = wrap('reg.meEnroll', (req, res) => doEnroll(req, res, oid(req.user.userId), { selfService: true }));

async function doDrop(req, res, studentId, selfService) {
  const schoolId = sid(req); const e = await RegEnrollment.findOne({ _id: oid(req.params.id), schoolId, studentId }); if (!e) return bad(res, 404, 'Registration not found.');
  if (e.status !== 'enrolled') return bad(res, 409, 'This registration is already finished.');
  const term = await RegTerm.findOne({ _id: e.termId, schoolId }); const today = S.dayKey(); const within = term.status === 'open' && (!term.addDropUntil || today <= term.addDropUntil);
  if (within) {
    const r = await RegEnrollment.updateOne({ _id: e._id, schoolId, status: 'enrolled' }, { $set: { status: 'dropped', droppedAt: new Date() }, $unset: { activeKey: 1 } }); if (!r.matchedCount) return bad(res, 409, 'Already changed.');
    await RegSection.updateOne({ _id: e.sectionId, schoolId, enrolled: { $gt: 0 } }, { $inc: { enrolled: -1 } });
    await audit(req, { action: 'registrar.drop', entityType: 'RegEnrollment', entityId: String(e._id), schoolId, detail: { course: e.courseCode } }); return res.json({ ok: true, result: 'dropped' });
  }
  if (selfService) return bad(res, 409, 'The drop deadline has passed. Ask the registrar to withdraw you from the course.');
  if (!['open', 'grading'].includes(term.status)) return bad(res, 409, 'This term is finished.');
  const reason = clean(req.body?.reason, 200); if (reason.length < 5) return bad(res, 400, 'Give the reason for withdrawing after the deadline.');
  const r = await RegEnrollment.updateOne({ _id: e._id, schoolId, status: 'enrolled' }, { $set: { status: 'withdrawn', grade: 'W', gradeState: 'final', droppedAt: new Date(), gradedByName: req.actorName || '' }, $inc: { gradeVersion: 1 } }); if (!r.matchedCount) return bad(res, 409, 'Already changed.');
  await RegSection.updateOne({ _id: e.sectionId, schoolId, enrolled: { $gt: 0 } }, { $inc: { enrolled: -1 } });
  await audit(req, { action: 'registrar.withdraw', entityType: 'RegEnrollment', entityId: String(e._id), schoolId, detail: { course: e.courseCode, reason } });
  S.notifyStudent(schoolId, studentId, 'Withdrawn from a course', `You were withdrawn from ${e.courseCode}. It shows as W on your record.`, '/student#/record'); res.json({ ok: true, result: 'withdrawn' });
}
exports.drop = wrap('reg.drop', async (req, res) => { const studentId = oid(req.params.studentId); if (!(await S.canSeeStudent(req, studentId))) return bad(res, 403, 'You do not advise this student.'); return doDrop(req, res, studentId, false); });
exports.meDrop = wrap('reg.meDrop', (req, res) => doDrop(req, res, oid(req.user.userId), true));

// what a student can register for now, each with the reasons it is not possible
exports.catalogFor = async (req, res, studentId) => {
  const schoolId = sid(req); const prog = await S.currentProgram(schoolId, studentId);
  const term = (await RegTerm.find({ schoolId, status: 'open' }).sort({ startDate: 1 }))[0];
  if (!term) return res.json({ term: null, sections: [], message: 'No term is open for registration right now.' });
  if (!prog || prog.status !== 'active') return res.json({ term: { _id: term._id, name: term.name }, sections: [], message: 'You are not in an active programme yet.' });
  const ctx = await context(schoolId, studentId, term._id); const secs = await RegSection.find({ schoolId, termId: term._id, status: 'open' }).sort({ courseCode: 1, section: 1 });
  const out = [];
  for (const s of secs) { const ev = await evaluate(schoolId, studentId, s, { ...ctx, prog, term }); const mine = ctx.history.find((e) => e.status === 'enrolled' && String(e.sectionId) === String(s._id)); out.push({ _id: s._id, courseCode: s.courseCode, courseTitle: s.courseTitle, credits: s.credits, section: s.section, teacherName: s.teacherName, schedule: s.schedule, room: s.room, seatsLeft: Math.max(0, s.capacity - s.enrolled), registered: !!mine, enrollmentId: mine?._id || null, ok: ev.ok || !!mine, reasons: mine ? [] : ev.reasons }); }
  const load = ctx.history.filter((e) => e.status === 'enrolled' && String(e.termId) === String(term._id)).reduce((s, e) => s + (e.credits || 0), 0);
  res.json({ term: { _id: term._id, name: term.name, addDropUntil: term.addDropUntil }, sections: out, credits: { registered: load, limit: ctx.settings.policy.maxCreditsPerTerm }, selfRegistration: ctx.settings.policy.selfRegistration });
};
exports.catalog = wrap('reg.catalog', async (req, res) => { const studentId = oid(req.params.studentId); if (!(await S.canSeeStudent(req, studentId))) return bad(res, 403, 'You do not advise this student.'); return exports.catalogFor(req, res, studentId); });
exports.meCatalog = wrap('reg.meCatalog', (req, res) => exports.catalogFor(req, res, oid(req.user.userId)));

// ---------- record and audit ----------
exports.record = wrap('reg.record', async (req, res) => {
  const studentId = oid(req.params.studentId); if (!(await S.canSeeStudent(req, studentId))) return bad(res, 403, 'You do not have access to this student.');
  const rec = await S.record(sid(req), studentId); if (!rec) return bad(res, 404, 'Student not found.');
  const [ex, tr] = await Promise.all([RegException.find({ schoolId: sid(req), studentId }).sort({ createdAt: -1 }).limit(30), RegTranscript.find({ schoolId: sid(req), studentId }).sort({ createdAt: -1 }).select('-snapshot').limit(20)]);
  res.json({ ...rec, exceptions: ex, transcripts: tr });
});
exports.meRecord = wrap('reg.meRecord', async (req, res) => {
  const schoolId = sid(req); const studentId = oid(req.user.userId); const rec = await S.record(schoolId, studentId); if (!rec) return bad(res, 404, 'Student not found.');
  const RegAppeal = require('../models/RegAppeal'); const RegGradeChange = require('../models/RegGradeChange');
  const [ex, tr, ap, gc] = await Promise.all([RegException.find({ schoolId, studentId }).sort({ createdAt: -1 }).limit(30), RegTranscript.find({ schoolId, studentId, status: 'valid' }).sort({ createdAt: -1 }).select('-snapshot').limit(20), RegAppeal.find({ schoolId, studentId }).sort({ createdAt: -1 }).limit(30), RegGradeChange.find({ schoolId, studentId, status: 'approved' }).sort({ decidedAt: -1 }).limit(30)]);
  const tm = await S.termsMap(schoolId); const days = rec.settings.policy.appealDays;
  rec.terms.forEach((t) => { const term = tm.get(t.termId); const until = term?.publishedAt ? new Date(new Date(term.publishedAt).getTime() + days * 86400000) : null; t.appealUntil = until; t.courses.forEach((c) => { c.canAppeal = !!(until && until > new Date() && c.gradeState === 'final' && !['W', 'I', 'AU'].includes(c.grade) && !ap.some((a) => String(a.enrollmentId) === String(c.enrollmentId) && ['submitted', 'under_review'].includes(a.status))); }); });
  const { settings, ...rest } = rec; res.json({ ...rest, scale: settings.scale, policy: { repeat: settings.policy.repeat, repeatBelow: settings.policy.repeatBelow, appealDays: days, maxCreditsPerTerm: settings.policy.maxCreditsPerTerm, selfRegistration: settings.policy.selfRegistration }, exceptions: ex.map((x) => ({ _id: x._id, kind: x.kind, courseCode: x.courseCode, status: x.status, reason: x.reason, createdAt: x.createdAt })), transcripts: tr, appeals: ap, gradeChanges: gc.map((g) => ({ courseCode: g.courseCode, fromGrade: g.fromGrade, toGrade: g.toGrade, decidedAt: g.decidedAt, source: g.source })) });
});
// the same record against another published year of the same programme, changing nothing
exports.whatIf = wrap('reg.whatIf', async (req, res) => {
  const schoolId = sid(req); const studentId = oid(req.params.studentId); if (!(await S.canSeeStudent(req, studentId))) return bad(res, 403, 'You do not have access to this student.');
  const prog = await S.currentProgram(schoolId, studentId); if (!prog) return bad(res, 404, 'This student is not in a programme.');
  const ver = await RegProgramVersion.findOne({ _id: oid(req.query.versionId), schoolId, programId: prog.programId, status: 'published' }); if (!ver) return bad(res, 404, 'Choose a published version of the same programme.');
  const [settings, catalog, enrolls, ex] = await Promise.all([S.getSettings(schoolId), S.catalogMap(schoolId), S.history(schoolId, studentId), RegException.find({ schoolId, studentId, status: { $in: ['approved', 'used'] } })]);
  res.json({ catalogYear: ver.catalogYear, audit: E.audit({ version: S.plain(ver), catalog, enrolls, exceptions: ex.map(S.plain), scale: settings.scale, policy: settings.policy }) });
});

// ---------- graduation ----------
exports.candidates = wrap('reg.candidates', async (req, res) => {
  const schoolId = sid(req); const f = { schoolId, status: 'active', isCurrent: true }; if (req.query.programId) f.programId = oid(req.query.programId);
  const progs = await RegStudentProgram.find(f).limit(300); const ids = progs.map((p) => p.studentId);
  const [settings, terms, catalog, enrolls, exs, vers] = await Promise.all([S.getSettings(schoolId), S.termsMap(schoolId), S.catalogMap(schoolId), RegEnrollment.find({ schoolId, studentId: { $in: ids }, status: { $in: ['enrolled', 'completed', 'withdrawn'] } }), RegException.find({ schoolId, studentId: { $in: ids }, status: { $in: ['approved', 'used'] } }), RegProgramVersion.find({ schoolId })]);
  const vm = new Map(vers.map((v) => [String(v._id), S.plain(v)])); const by = new Map(); enrolls.forEach((e) => { const k = String(e.studentId); const o = S.plain(e); o.termStart = terms.get(String(o.termId))?.startDate || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(o); });
  const exBy = new Map(); exs.forEach((x) => { const k = String(x.studentId); if (!exBy.has(k)) exBy.set(k, []); exBy.get(k).push(S.plain(x)); });
  const rows = progs.map((p) => { const v = vm.get(String(p.versionId)); const a = v ? E.audit({ version: v, catalog, enrolls: by.get(String(p.studentId)) || [], exceptions: exBy.get(String(p.studentId)) || [], scale: settings.scale, policy: settings.policy }) : null; return { studentId: p.studentId, name: p.studentName, program: p.programName, catalogYear: p.catalogYear, eligible: !!a?.eligible, inProgress: (by.get(String(p.studentId)) || []).some((e) => e.status === 'enrolled'), earned: a?.credits.earned || 0, needed: a?.credits.needed || 0, cgpa: a?.cgpa || 0, blockers: a?.blockers || ['No published rules'] }; });
  rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.earned - a.earned);
  res.json({ total: rows.length, eligible: rows.filter((r) => r.eligible).length, students: rows });
});
exports.graduate = wrap('reg.graduate', async (req, res) => {
  const schoolId = sid(req); const studentId = oid(req.params.studentId); const me = who(req);
  const prog = await S.currentProgram(schoolId, studentId); if (!prog) return bad(res, 404, 'This student is not in a programme.');
  if (prog.status === 'graduated') return bad(res, 409, 'This student has already graduated.'); if (prog.status !== 'active') return bad(res, 409, `This student is ${prog.status}.`);
  const live = await RegEnrollment.countDocuments({ schoolId, studentId, status: 'enrolled' }); if (live) return bad(res, 409, `${live} course${live === 1 ? ' is' : 's are'} still in progress. Publish the term first.`);
  const rec = await S.record(schoolId, studentId); if (!rec.audit) return bad(res, 422, 'The student\'s programme version has no rules.');
  if (!rec.audit.eligible) return bad(res, 422, 'The degree audit is not complete.', { blockers: rec.audit.blockers });
  const r = await RegStudentProgram.updateOne({ _id: prog._id, schoolId, status: 'active' }, { $set: { status: 'graduated', graduation: { at: new Date(), byName: me.name, byId: me.id, cgpa: rec.cgpa, credits: rec.audit.credits.earned, auditHash: rec.audit.hash, exceptionIds: rec.audit.exceptionsApplied.map((x) => x._id) } }, $push: { history: { at: new Date(), byName: me.name, change: 'Graduated' } } });
  if (!r.matchedCount) return bad(res, 409, 'Someone else just changed this student.');
  const t = await issue(req, studentId, 'final', rec); await audit(req, { action: 'registrar.graduate', entityType: 'RegStudentProgram', entityId: String(prog._id), schoolId, detail: { student: prog.studentName, cgpa: rec.cgpa, transcript: t.serial } });
  S.notifyStudent(schoolId, studentId, 'Congratulations', `You have completed ${prog.programName}. Your final transcript ${t.serial} is ready.`, '/student#/record'); res.json({ ok: true, transcript: { _id: t._id, serial: t.serial, verifyKey: t.verifyKey } });
});

// ---------- transcripts ----------
const snapshotOf = async (schoolId, rec, kind) => {
  const school = await School.findById(schoolId).select('name'); const official = kind !== 'unofficial';
  const terms = rec.terms.filter((t) => (official ? ['published', 'closed'].includes(t.status) : true)).map((t) => ({ code: t.code, name: t.name, startDate: t.startDate, gpa: t.gpa, earned: t.earned, courses: t.courses.filter((c) => (official ? c.gradeState === 'final' : true)).map((c) => ({ code: c.code, title: c.title, credits: c.credits, grade: c.grade || (official ? '' : 'In progress'), repeat: c.repeat, countsInAverage: c.countsInAverage })) })).filter((t) => t.courses.length);
  return { school: school?.name || '', student: { name: rec.student.name, admissionNumber: rec.student.admissionNumber }, program: rec.program ? { name: rec.program.programName, catalogYear: rec.program.catalogYear, status: rec.program.status, graduation: rec.program.status === 'graduated' ? { at: rec.program.graduation?.at, cgpa: rec.program.graduation?.cgpa, credits: rec.program.graduation?.credits } : null } : null, terms, cgpa: rec.cgpa, creditsEarned: rec.creditsEarned, scale: rec.settings.scale, repeatRule: rec.settings.policy.repeat, kind };
};
async function issue(req, studentId, kind, rec) {
  const schoolId = sid(req); rec = rec || await S.record(schoolId, studentId, { withAudit: false });
  const snap = await snapshotOf(schoolId, rec, kind); snap.issuedAt = new Date().toISOString();
  const hash = E.sha(E.canon(snap)); const verifyKey = crypto.randomBytes(7).toString('hex').toUpperCase().slice(0, 12); const me = who(req);
  const doc = await S.createNumbered(RegTranscript, schoolId, 'serial', kind === 'final' ? 'FT' : 'TR', { studentId, studentName: rec.student.name, kind, programName: snap.program?.name || '', snapshot: snap, contentHash: hash, verifyKey, issuedById: me.id, issuedByName: me.name });
  const sig = E.sign({ serial: doc.serial, studentId: String(studentId), hash }); await RegTranscript.updateOne({ _id: doc._id, schoolId }, { $set: { signature: sig } }); doc.signature = sig; return doc;
}
exports.issueTranscript = wrap('reg.issueTranscript', async (req, res) => {
  const schoolId = sid(req); const studentId = oid(req.params.studentId); const st = await Student.findOne({ _id: studentId, schoolId }).select('name'); if (!st) return bad(res, 404, 'Student not found.');
  const kind = req.body?.kind === 'final' ? 'final' : 'official'; const prog = await S.currentProgram(schoolId, studentId);
  if (kind === 'final' && prog?.status !== 'graduated') return bad(res, 409, 'A final transcript is issued when the student graduates.');
  const t = await issue(req, studentId, kind); await audit(req, { action: 'registrar.transcript.issue', entityType: 'RegTranscript', entityId: String(t._id), schoolId, detail: { serial: t.serial, student: st.name } });
  S.notifyStudent(schoolId, studentId, 'Transcript issued', `Your official transcript ${t.serial} is ready.`, '/student#/record'); res.status(201).json({ _id: t._id, serial: t.serial, verifyKey: t.verifyKey, kind: t.kind });
});
exports.transcriptRequest = wrap('reg.transcriptRequest', async (req, res) => {
  const schoolId = sid(req); const st = await Student.findOne({ _id: oid(req.user.userId), schoolId }).select('name'); if (!st) return bad(res, 404, 'Student not found.');
  await S.notifyAdmins(schoolId, 'Transcript requested', `${st.name} asked for an official transcript.`); res.json({ ok: true });
});
const canRead = async (req, t) => (req.user.role === 'admin') || (req.user.role === 'student' && String(t.studentId) === String(req.user.userId) && t.status === 'valid') || (req.user.role === 'teacher' && (await S.canSeeStudent(req, t.studentId)));
exports.transcript = wrap('reg.transcript', async (req, res) => { const t = await RegTranscript.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!t || !(await canRead(req, t))) return bad(res, 404, 'Transcript not found.'); res.json({ _id: t._id, serial: t.serial, kind: t.kind, status: t.status, verifyKey: t.verifyKey, signature: t.signature, contentHash: t.contentHash, issuedByName: t.issuedByName, createdAt: t.createdAt, snapshot: t.snapshot, revokeReason: t.revokeReason || '' }); });
exports.revokeTranscript = wrap('reg.revokeTranscript', async (req, res) => {
  const schoolId = sid(req); const t = await RegTranscript.findOne({ _id: oid(req.params.id), schoolId }); if (!t) return bad(res, 404, 'Transcript not found.'); if (t.status === 'revoked') return res.json({ ok: true });
  const reason = clean(req.body?.reason, 300); if (reason.length < 5) return bad(res, 400, 'Say why the transcript is withdrawn.');
  await RegTranscript.updateOne({ _id: t._id, schoolId, status: 'valid' }, { $set: { status: 'revoked', revokedAt: new Date(), revokedByName: req.actorName || '', revokeReason: reason } });
  await audit(req, { action: 'registrar.transcript.revoke', entityType: 'RegTranscript', entityId: String(t._id), schoolId, detail: { serial: t.serial, reason } }); res.json({ ok: true });
});
exports.transcriptPdf = wrap('reg.transcriptPdf', async (req, res) => {
  const schoolId = sid(req); let snap; let meta;
  if (req.params.id === 'live') { // an unofficial copy of the current record, never stored
    const sId = req.user.role === 'student' ? oid(req.user.userId) : oid(req.query.studentId); if (!sId || !(await S.canSeeStudent(req, sId))) return bad(res, 404, 'Student not found.');
    const rec = await S.record(schoolId, sId, { withAudit: false }); if (!rec) return bad(res, 404, 'Student not found.'); snap = await snapshotOf(schoolId, rec, 'unofficial'); meta = { serial: 'UNOFFICIAL', status: 'valid', verifyKey: '' };
  } else { const t = await RegTranscript.findOne({ _id: oid(req.params.id), schoolId }); if (!t || !(await canRead(req, t))) return bad(res, 404, 'Transcript not found.'); snap = t.snapshot; meta = { serial: t.serial, status: t.status, verifyKey: t.verifyKey, signature: t.signature, hash: t.contentHash, issuedBy: t.issuedByName, issuedAt: t.createdAt }; }
  const buf = await require('../utils/registrar/pdf').render(snap, meta); res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${meta.serial}.pdf"`, 'Cache-Control': 'no-store' }); res.send(buf);
});
// public check by the reference on the printed copy: a masked name and whether it is still valid, nothing more
exports.verify = async (req, res) => {
  try {
    const key = String(req.params.key || '').toUpperCase(); const miss = () => res.status(404).json({ valid: false, message: 'We could not find a transcript with this reference.' });
    if (!/^[A-F0-9]{12}$/.test(key)) return miss(); const t = await RegTranscript.findOne({ verifyKey: key }); if (!t) return miss();
    const school = await School.findById(t.schoolId).select('name'); const ok = t.signature === E.sign({ serial: t.serial, studentId: String(t.studentId), hash: t.contentHash }) && E.sha(E.canon(t.snapshot)) === t.contentHash;
    const masked = String(t.studentName || '').split(/\s+/).map((w, i) => (i === 0 ? w : `${w.charAt(0)}.`)).join(' ');
    res.set('Cache-Control', 'no-store'); res.json({ valid: t.status === 'valid' && ok, status: t.status === 'valid' ? (ok ? 'Valid' : 'Altered') : 'Withdrawn', serial: t.serial, kind: t.kind, school: school?.name || '', student: masked, program: t.programName, issuedAt: t.createdAt });
  } catch (e) { console.error('reg.verify:', e); res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};
