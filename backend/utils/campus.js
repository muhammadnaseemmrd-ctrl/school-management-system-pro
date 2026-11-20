// Campus scope (PRD E01). A school is the tenant; a campus is a site inside it.
//   * an administrator with no active campus membership is school-wide (the principal, the owner)
//   * the first membership makes them a campus admin: they see and change only classes (and the students in them) of their campuses
//   * a class with no campus belongs to the default campus
// Everything is deny by default: a campus admin never reaches a record outside their campuses, even by guessing its id.
const mongoose = require('../lib/pgdoc');
const Campus = require('../models/Campus');
const CampusMembership = require('../models/CampusMembership');
const Class = require('../models/Class');
const Student = require('../models/Student');

const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const TTL_MS = 8000;
const cache = new Map();
const bust = (schoolId) => { const p = `${schoolId}:`; for (const k of [...cache.keys()]) if (k.startsWith(p)) cache.delete(k); };

// every school has exactly one default campus, created the first time anyone needs it
async function ensureDefault(schoolId) {
  const sid = oid(schoolId);
  let c = await Campus.findOne({ schoolId: sid, isDefault: true });
  if (c) return c;
  try { c = await Campus.create({ schoolId: sid, name: 'Main campus', code: 'MAIN', isDefault: true }); } catch (e) {
    if (!(e.code === 11000 || /duplicate key|E11000/.test(e.message || ''))) throw e;
    c = await Campus.findOne({ schoolId: sid, isDefault: true }) || await Campus.findOne({ schoolId: sid, code: 'MAIN' });
    if (c && !c.isDefault) { await Campus.updateOne({ _id: c._id, schoolId: sid }, { $set: { isDefault: true } }); c.isDefault = true; }
  }
  return c;
}

// -> null when the person sees the whole school, otherwise { campusIds[], classIds:Set, includeUnassigned }
async function scopeOf(user) {
  if (!user || user.role !== 'admin' || !user.schoolId || !oid(user.userId)) return null;
  const key = `${user.schoolId}:${user.userId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.scope;
  const sid = oid(user.schoolId);
  const rows = (await CampusMembership.find({ schoolId: sid, userId: oid(user.userId) })).filter((r) => !r.revokedAt);
  let scope = null;
  if (rows.length) {
    const campusIds = [...new Set(rows.map((r) => String(r.campusId)))];
    const def = await ensureDefault(sid);
    const includeUnassigned = campusIds.includes(String(def._id));
    const classes = await Class.find({ schoolId: sid }).select('campusId');
    const classIds = new Set(classes.filter((c) => (c.campusId ? campusIds.includes(String(c.campusId)) : includeUnassigned)).map((c) => String(c._id)));
    scope = { campusIds, classIds, includeUnassigned, defaultId: String(def._id) };
  }
  cache.set(key, { at: Date.now(), scope });
  return scope;
}

async function canAccessClass(user, classId) {
  const sc = await scopeOf(user);
  if (!sc) return true;
  return !!classId && sc.classIds.has(String(classId));
}

async function canAccessCampus(user, campusId) {
  const sc = await scopeOf(user);
  if (!sc) return true;
  return !!campusId && sc.campusIds.includes(String(campusId));
}

// a student of a school, for a campus admin: in a class of their campus, or unplaced while they hold the default campus
async function canAccessStudentRecord(user, studentId) {
  const sc = await scopeOf(user);
  if (!sc) return true;
  const st = oid(studentId) ? await Student.findOne({ _id: oid(studentId), schoolId: oid(user.schoolId) }).select('classId') : null;
  if (!st) return false;
  return st.classId ? sc.classIds.has(String(st.classId)) : sc.includeUnassigned;
}

// which campus a class sits in (the default campus when none is set)
async function campusOfClass(schoolId, classId) {
  if (!oid(classId)) return null;
  const c = await Class.findOne({ _id: oid(classId), schoolId: oid(schoolId) }).select('campusId');
  if (!c) return null;
  return c.campusId ? String(c.campusId) : String((await ensureDefault(schoolId))._id);
}

module.exports = { ensureDefault, scopeOf, canAccessClass, canAccessCampus, canAccessStudentRecord, campusOfClass, bust };
