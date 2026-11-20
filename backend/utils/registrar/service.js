// Shared pieces of the registrar (PRD E16): settings, who may see what, and the student's full record built from the database.
const base = require('../early/service');
const User = require('../../models/User');
const Teacher = require('../../models/Teacher');
const Student = require('../../models/Student');
const AppSetting = require('../../models/AppSetting');
const RegTerm = require('../../models/RegTerm');
const RegCourse = require('../../models/RegCourse');
const RegEnrollment = require('../../models/RegEnrollment');
const RegStudentProgram = require('../../models/RegStudentProgram');
const RegProgramVersion = require('../../models/RegProgramVersion');
const RegException = require('../../models/RegException');
const RegSection = require('../../models/RegSection');
const E = require('./engine');

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const getSettings = async (schoolId) => {
  const s = await AppSetting.findOne({ key: `registrar:${schoolId}` }); const v = s?.value || {};
  return { scale: E.normScale(v.scale), policy: { ...E.DEFAULT_POLICY, selfRegistration: true, ...(v.policy || {}) } };
};
const putSettings = (schoolId, value) => AppSetting.updateOne({ key: `registrar:${schoolId}` }, { $set: { value } }, { upsert: true });
const soleAdmin = async (schoolId) => (await User.countDocuments({ schoolId, role: 'admin', isActive: { $ne: false } })) <= 1;
const plain = (d) => (d && d.toObject ? d.toObject() : d);

const termsMap = async (schoolId) => new Map((await RegTerm.find({ schoolId })).map((t) => [String(t._id), plain(t)]));
const catalogMap = async (schoolId) => new Map((await RegCourse.find({ schoolId })).map((c) => [c.code, plain(c)]));

// every enrolment of one student, each carrying the start date of its term so repeats are put in the order they happened
async function history(schoolId, studentId, terms) {
  const tm = terms || await termsMap(schoolId);
  const rows = await RegEnrollment.find({ schoolId, studentId, status: { $in: ['enrolled', 'completed', 'withdrawn'] } });
  return rows.map((r) => { const o = plain(r); o.termStart = tm.get(String(o.termId))?.startDate || ''; return o; });
}
const currentProgram = (schoolId, studentId) => RegStudentProgram.findOne({ schoolId, studentId, isCurrent: true });

// the student's record: programme, enrolments by term with averages, the cumulative average and the audit
async function record(schoolId, studentId, { withAudit = true } = {}) {
  const [st, settings, terms, catalog] = await Promise.all([Student.findOne({ _id: studentId, schoolId }).select('name admissionNumber email classId'), getSettings(schoolId), termsMap(schoolId), catalogMap(schoolId)]);
  if (!st) return null;
  const enrolls = await history(schoolId, studentId, terms);
  const prog = await currentProgram(schoolId, studentId);
  const published = (t) => t && ['published', 'closed'].includes(t.status);
  const byTerm = new Map();
  for (const e of enrolls) { const k = String(e.termId); if (!byTerm.has(k)) byTerm.set(k, []); byTerm.get(k).push(e); }
  const gp = E.gpaOf(enrolls, settings.scale, settings.policy);
  const termList = [...byTerm.entries()].map(([k, list]) => {
    const t = terms.get(k); const pub = published(t); const tg = E.termGpa(enrolls, k, settings.scale, settings.policy);
    return { termId: k, code: t?.code || '', name: t?.name || '', startDate: t?.startDate || '', status: t?.status || '', gpa: pub ? tg.gpa : null, earned: pub ? tg.earned : null,
      courses: list.map((e) => ({ enrollmentId: e._id, sectionId: e.sectionId, code: e.courseCode, title: e.courseTitle, credits: e.credits, status: e.status, grade: pub || e.gradeState === 'final' ? e.grade : '', gradeState: e.gradeState, repeat: !!e.isRepeat, attemptNo: e.attemptNo, countsInAverage: gp.flags.get(String(e._id))?.counts ?? null })) };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate));
  let version = null; let result = null;
  if (prog && withAudit) { version = await RegProgramVersion.findOne({ _id: prog.versionId, schoolId }); const ex = await RegException.find({ schoolId, studentId, status: { $in: ['approved', 'used'] } }); if (version) result = E.audit({ version: plain(version), catalog, enrolls, exceptions: ex.map(plain), scale: settings.scale, policy: settings.policy }); }
  return { student: { _id: st._id, name: st.name, admissionNumber: st.admissionNumber || '', email: st.email || '' }, program: prog ? plain(prog) : null, terms: termList, cgpa: gp.gpa, creditsEarned: gp.earned, creditsInAverage: gp.creditsInAverage, audit: result, settings: { scale: settings.scale, policy: settings.policy } };
}

// A teacher may act on a section they teach and see the students they advise.
const teacherId = (req) => (req.user.role === 'teacher' ? base.oid(req.user.userId) : null);
const sectionAccess = async (req, sec) => req.user.role === 'admin' || (req.user.role === 'teacher' && sec.teacherId && String(sec.teacherId) === String(req.user.userId));
const adviseesOf = async (schoolId, tid) => (await RegStudentProgram.find({ schoolId, advisorId: tid, isCurrent: true }).select('studentId')).map((p) => String(p.studentId));
// who may read this student's registrar record
async function canSeeStudent(req, studentId) {
  const r = req.user.role; const schoolId = base.sid(req);
  if (r === 'admin') return !!(await Student.findOne({ _id: studentId, schoolId }).select('_id'));
  if (r === 'student') return String(req.user.userId) === String(studentId);
  if (r === 'teacher') { const p = await currentProgram(schoolId, studentId); return !!(p && p.advisorId && String(p.advisorId) === String(req.user.userId)); }
  return false;
}
const notifyStudent = (schoolId, studentId, title, body, link = '') => require('../notify').notify({ schoolId, recipients: [{ id: studentId, role: 'student' }], title, body, link, type: 'registrar' }).catch(() => {});
const notifyAdmins = async (schoolId, title, body, exclude = null) => require('../notify').notify({ schoolId, recipients: await require('../notify').admins(schoolId), title, body, link: '/admin#/registrar', type: 'registrar', exclude }).catch(() => {});
// Numbered records (appeals, transcripts): count + 1, and a unique index makes a second request that picked the same number try the next one.
const isDup = (e) => e && (e.code === 11000 || /duplicate key|E11000/.test(e.message || ''));
const createNumbered = async (Model, schoolId, field, prefix, doc) => {
  const start = (await Model.countDocuments({ schoolId })) + 1;
  for (let i = 0; i < 8; i += 1) {
    try { return await Model.create({ ...doc, schoolId, [field]: `${prefix}-${new Date().getUTCFullYear()}-${String(start + i).padStart(5, '0')}` }); } catch (e) { if (!isDup(e)) throw e; }
  }
  throw new Error('could not number the record');
};

module.exports = { ...base, E, dayKey, getSettings, putSettings, soleAdmin, plain, termsMap, catalogMap, history, currentProgram, record, teacherId, sectionAccess, adviseesOf, canSeeStudent, notifyStudent, notifyAdmins, createNumbered, isDup, Teacher, Student, RegSection };
