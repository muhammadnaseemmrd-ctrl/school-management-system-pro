// Progress, readiness and credentials (PRD E17).
const S = require('./service');
const { E, oid } = S;
const TrProgress = S.TrProgress; const TrEntitlement = S.TrEntitlement;
const TrSubmission = require('../../models/TrSubmission');
const TrCredential = require('../../models/TrCredential');

// Change one learner's progress with a compare-and-set, so two open tabs cannot overwrite each other's lessons.
async function mutate(schoolId, learnerId, courseId, fn) {
  const q = { schoolId: oid(schoolId), learnerId: oid(learnerId), courseId: oid(courseId) };
  for (let i = 0; i < 6; i += 1) {
    let row = await TrProgress.findOne(q);
    if (!row) { await TrProgress.updateOne(q, { $setOnInsert: { lessons: {}, rev: 0 } }, { upsert: true }); row = await TrProgress.findOne(q); }
    const lessons = JSON.parse(JSON.stringify(row.lessons || {})); const out = await fn(lessons, row);
    if (out && out.abort) return out;
    const r = await TrProgress.updateOne({ _id: row._id, rev: row.rev || 0 }, { $set: { lessons, rev: (row.rev || 0) + 1, lastAt: new Date(), ...(out?.lastLessonId ? { lastLessonId: out.lastLessonId } : {}) } });
    if (r.matchedCount) return { ...(out || {}), lessons };
  }
  throw Object.assign(new Error('Please try again.'), { http: 409 });
}

const acceptedSet = async (schoolId, learnerId, courseId) => new Set((await TrSubmission.find({ schoolId: oid(schoolId), learnerId: oid(learnerId), courseId: oid(courseId), status: 'accepted' }).select('lessonId')).map((s) => s.lessonId));

// Is everything done? Moves the entitlement between none and ready, and tells the instructors the first time it is ready.
async function refreshReadiness(schoolId, ent) {
  const course = await S.TrCourse.findOne({ _id: ent.courseId, schoolId: oid(schoolId) }); if (!course?.live) return null;
  const lessons = E.flat(course.live.modules); const prog = await TrProgress.findOne({ schoolId: oid(schoolId), learnerId: ent.learnerId, courseId: ent.courseId });
  const cohort = ent.cohortId ? await S.TrCohort.findOne({ _id: ent.cohortId, schoolId: oid(schoolId) }) : null;
  const r = E.readiness({ lessons, progress: prog?.lessons || {}, cohort, userId: String(ent.learnerId) });
  if (ent.completion === 'complete') return r;
  if (r.ready && ent.completion === 'none') {
    const set = await TrEntitlement.updateOne({ _id: ent._id, completion: 'none' }, { $set: { completion: 'ready' } });
    if (set.matchedCount) { const l = await S.TrLearner.findById(ent.learnerId).select('name'); await S.notifyTeachers(schoolId, await S.teacherIdsOf(schoolId, course.instructorIds), 'A learner has finished a course', `${l?.name || 'A learner'} finished "${course.title}" and is waiting for your review.`); await S.notifyAdmins(schoolId, 'Course completion to review', `${l?.name || 'A learner'} finished "${course.title}".`); }
  } else if (!r.ready && ent.completion === 'ready') await TrEntitlement.updateOne({ _id: ent._id, completion: 'ready' }, { $set: { completion: 'none' } });
  return r;
}

const check12 = () => require('crypto').randomBytes(6).toString('hex').toUpperCase();
// Issue a certificate for a reviewed completion. The snapshot is what the public page checks against, so it never changes.
async function issueCredential(schoolId, { kind = 'course', learner, course, bundle, ent, by, extra = {} }) {
  const sidv = oid(schoolId); const school = await S.School.findById(sidv).select('name');
  const exists = await TrCredential.findOne({ schoolId: sidv, learnerId: learner._id, ...(kind === 'course' ? { entitlementId: ent._id } : { bundleId: bundle._id }), status: 'valid' }); if (exists) return { credential: exists, created: false };
  const snap = { school: school?.name || '', learner: learner.name, kind, title: kind === 'course' ? course.title : bundle.title, version: kind === 'course' ? course.live?.version : undefined, skills: kind === 'course' ? (course.live?.skills || course.skills || []) : extra.skills || [], hours: kind === 'course' ? Math.round((E.flat(course.live?.modules || []).reduce((s, l) => s + (l.required ? l.minutes : 0), 0) / 60) * 100) / 100 : undefined, courses: extra.courses, completedAt: new Date(), by };
  const hash = E.sha(E.canon(JSON.parse(JSON.stringify(snap)))); let row = null;
  for (let i = 0; i < 6 && !row; i += 1) {
    const key = check12();
    try { row = await S.numbered(TrCredential, sidv, 'serial', 'TC', { verifyKey: key, kind, learnerId: learner._id, learnerName: learner.name, courseId: course?._id || null, bundleId: bundle?._id || null, entitlementId: ent?._id || null, title: snap.title, snapshot: JSON.parse(JSON.stringify(snap)), contentHash: hash, issuedByName: by, signature: '__pending__' }); } catch (e) { if (!S.isDup(e)) throw e; }
  }
  if (!row) throw new Error('could not issue the credential');
  const signature = E.sign({ serial: row.serial, learnerId: String(learner._id), hash });
  await TrCredential.updateOne({ _id: row._id }, { $set: { signature } }); row.signature = signature; return { credential: row, created: true };
}
const verifyCredential = (c) => c.signature === E.sign({ serial: c.serial, learnerId: String(c.learnerId), hash: c.contentHash }) && E.sha(E.canon(JSON.parse(JSON.stringify(c.snapshot)))) === c.contentHash;

module.exports = { mutate, acceptedSet, refreshReadiness, issueCredential, verifyCredential };
