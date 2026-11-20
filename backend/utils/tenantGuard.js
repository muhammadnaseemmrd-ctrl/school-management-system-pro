// Tenant guard (PRD E01). The school a record belongs to comes from the verified session, never from the request body.
// Update endpoints that hand the body to the database must run it through safeBody first, otherwise an admin could send
// { schoolId: <another school> } and move a record out of (or into) a school.
const mongoose = require('../lib/pgdoc');

// fields no client may ever set on an existing record
const ALWAYS = ['_id', 'id', '__v', 'schoolId', 'createdAt', 'updatedAt', 'importJobId', 'rolloverRunId'];

function safeBody(body, extraBlocked = []) {
  const out = {};
  const blocked = new Set([...ALWAYS, ...extraBlocked]);
  Object.keys(body || {}).forEach((k) => {
    if (blocked.has(k) || k.startsWith('$') || k.includes('.')) return;
    out[k] = body[k];
  });
  return out;
}

const isId = (v) => mongoose.isValidObjectId(String(v || ''));

// Are all these ids records of this school? Used before linking a teacher, parent or grant to another record.
async function allInSchool(Model, schoolId, ids) {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String))];
  if (!list.length) return true;
  if (!list.every(isId)) return false;
  const n = await Model.countDocuments({ schoolId, _id: { $in: list } });
  return n === list.length;
}

module.exports = { safeBody, allInSchool, isId };
