// Consent register logic (PRD E01). Append-only: the newest row of a person and purpose is "current"; older rows are history.
const mongoose = require('../lib/pgdoc');
const Consent = require('../models/Consent');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Teacher = require('../models/Teacher');
const Campus = require('./campus');

const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const isDup = (e) => e && (e.code === 11000 || /duplicate key|E11000/.test(e.message || ''));

// what a school can ask for. "version" is the wording a person agreed to; raise it when the wording changes.
const PURPOSES = {
  photo_media: { label: 'Photos and videos of the child', detail: 'The school may take and use photos and videos of the child for school news, notice boards and the school page.', subjects: ['student'], version: '2026-1' },
  trip_participation: { label: 'Off-site trips', detail: 'The child may take part in trips and visits away from school.', subjects: ['student'], version: '2026-1' },
  health_sharing: { label: 'Sharing health and allergy details with activity staff', detail: 'Staff running a trip or activity may see the child\'s allergy and emergency health notes.', subjects: ['student'], version: '2026-1' },
  data_sharing: { label: 'Sharing contact details with the class list', detail: 'The parent\'s name and phone may appear on the class contact list shared with other families.', subjects: ['student'], version: '2026-1' },
  bus_tracking: { label: 'Seeing the school bus on a map during a trip', detail: 'While the child\'s bus trip is under way, the family may see where the school vehicle is. Nothing is shown before or after the trip, and the child\'s own phone is never tracked.', subjects: ['student'], version: '2026-1' },
  ai_tools: { label: 'AI-assisted learning tools', detail: 'The child\'s work may be used with AI-assisted learning tools chosen by the school.', subjects: ['student'], version: '2026-1' },
  camera_attendance: { label: 'Attendance signals from badge and QR devices in a school pilot', detail: 'While the school runs a written pilot, a scan of the child\'s badge or QR code at a gate or classroom device may be kept as extra evidence that the child arrived. It never marks the child absent and never leads to a sanction on its own. No photos, faces or fingerprints are used, and the school keeps the manual register as the alternative.', subjects: ['student'], version: '2026-1' },
  news_messages: { label: 'School news and event invitations', detail: 'The school may send news and invitations that are not required notices.', subjects: ['parent'], version: '2026-1' },
  staff_directory: { label: 'Name and photo on the school page', detail: 'The school may show the teacher\'s name and photo on its public page.', subjects: ['teacher'], version: '2026-1' },
};
const MODEL = { student: Student, parent: Parent, teacher: Teacher };
const keyOf = (schoolId, type, id, purpose) => `${schoolId}:${type}:${id}:${purpose}`;

const live = (row, at = new Date()) => row && row.status === 'granted' && !(row.expiresAt && new Date(row.expiresAt) <= at);
const stateOf = (row, at = new Date()) => (!row ? 'none' : row.status === 'withdrawn' ? 'withdrawn' : live(row, at) ? 'granted' : 'expired');

async function subject(schoolId, type, id) {
  const M = MODEL[type]; if (!M || !oid(id)) return null;
  return M.findOne({ _id: oid(id), schoolId: oid(schoolId) }).select('name classId');
}

async function current(schoolId, type, id, purpose) {
  return Consent.findOne({ currentKey: keyOf(schoolId, type, id, purpose) });
}

// -> { allowed, state: 'granted'|'withdrawn'|'expired'|'none', version, since, expiresAt }
async function check(schoolId, type, id, purpose) {
  const row = await current(schoolId, type, id, purpose);
  const state = stateOf(row);
  return { allowed: state === 'granted', state, version: row?.version || '', since: row?.createdAt || null, expiresAt: row?.expiresAt || null };
}

// Add a row and make it the current one. Throws { status, message } for a lost race.
async function append({ schoolId, type, subjectDoc, purpose, status, version, givenByName, givenByRelation, method, evidenceNote, expiresAt, reason, actor }) {
  const key = keyOf(schoolId, type, subjectDoc._id, purpose);
  const old = await Consent.findOne({ currentKey: key });
  if (old) {
    const r = await Consent.updateOne({ _id: old._id, currentKey: key }, { $unset: { currentKey: 1 }, $set: { isCurrent: false, supersededAt: new Date() } });
    if (!r.matchedCount) throw Object.assign(new Error('This record just changed. Reload and try again.'), { status: 409 });
  }
  let campusId = null;
  if (type === 'student' && subjectDoc.classId) campusId = await Campus.campusOfClass(schoolId, subjectDoc.classId);
  try {
    return await Consent.create({ schoolId: oid(schoolId), subjectType: type, subjectId: subjectDoc._id, subjectName: subjectDoc.name || '', purpose, version, status,
      givenByName, givenByRelation, method, evidenceNote, expiresAt: expiresAt || null, reason: reason || '', campusId: campusId ? oid(campusId) : null,
      recordedById: oid(actor.id || actor.userId), recordedByName: actor.name || '', recordedByRole: actor.role || '', currentKey: key, isCurrent: true });
  } catch (e) {
    if (old) await Consent.updateOne({ _id: old._id }, { $set: { currentKey: key, isCurrent: true }, $unset: { supersededAt: 1 } }).catch(() => {});
    if (isDup(e)) throw Object.assign(new Error('This record just changed. Reload and try again.'), { status: 409 });
    throw e;
  }
}

// for other modules: "may we do this for this child?" Defaults to no when nothing is recorded.
const hasConsent = async (schoolId, studentId, purpose) => (await check(schoolId, 'student', studentId, purpose)).allowed;

module.exports = { PURPOSES, MODEL, subject, current, check, append, hasConsent, stateOf, live, oid };
