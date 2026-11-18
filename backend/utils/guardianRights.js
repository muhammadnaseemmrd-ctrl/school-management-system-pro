// Effective guardian rights (PRD E05). One place decides what an adult may do for a child on a given day.
//   * a parent account linked the old way (Parent.children) and with no GuardianLink rows keeps the normal rights,
//     except pickup, which must always be granted on purpose
//   * once a link row exists, only a link that is effective today grants anything
//   * a restriction that is effective today always wins
const mongoose = require('../lib/pgdoc');
const GuardianLink = require('../models/GuardianLink');
const ContactRestriction = require('../models/ContactRestriction');
const Parent = require('../models/Parent');

const KEYS = ['viewInfo', 'viewAttendance', 'viewMarks', 'viewFees', 'payFees', 'receiveNotices', 'receiveMessages', 'pickup'];
const DEFAULTS = { viewInfo: true, viewAttendance: true, viewMarks: true, viewFees: true, payFees: true, receiveNotices: true, receiveMessages: true, pickup: false };
const NONE = Object.fromEntries(KEYS.map((k) => [k, false]));
const BLOCKS = {
  'no-access': KEYS,
  'no-contact': ['receiveNotices', 'receiveMessages'],
  'no-pickup': ['pickup'],
  'no-fees': ['viewFees', 'payFees'],
};
const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const effective = (row, at) => new Date(row.validFrom) <= at && (!row.validTo || new Date(row.validTo) > at);

// Pure decision from already-loaded rows
function evaluate({ links, restrictions, legacyLinked, at = new Date() }) {
  const live = links.filter((l) => effective(l, at));
  let rights; let linked;
  if (live.length) {
    // several rows for one pair: the most recently started one counts
    const l = live.sort((a, b) => new Date(b.validFrom) - new Date(a.validFrom))[0];
    rights = { ...DEFAULTS, ...JSON.parse(JSON.stringify(l.rights || {})) }; linked = true;
  } else if (!links.length && legacyLinked) { rights = { ...DEFAULTS }; linked = true; }
  else { rights = { ...NONE }; linked = false; }
  const active = restrictions.filter((r) => effective(r, at));
  active.forEach((r) => (BLOCKS[r.type] || []).forEach((k) => { rights[k] = false; }));
  return { linked, rights, restricted: active.map((r) => r.type) };
}

// One parent account and one child
async function resolve(schoolId, parentId, studentId, at = new Date()) {
  const sid = oid(schoolId); const pid = oid(parentId); const stid = oid(studentId);
  if (!sid || !pid || !stid) return { linked: false, rights: { ...NONE }, restricted: [] };
  const [links, restrictions, parent] = await Promise.all([
    GuardianLink.find({ schoolId: sid, studentId: stid, parentId: pid }),
    ContactRestriction.find({ schoolId: sid, studentId: stid, parentId: pid }),
    Parent.findOne({ _id: pid, schoolId: sid }).select('children isActive'),
  ]);
  const legacy = !!(parent && parent.isActive !== false && (parent.children || []).map(String).includes(String(stid)));
  return evaluate({ links, restrictions, legacyLinked: legacy, at });
}

// Many children for one parent at once (parent dashboard)
async function resolveForParent(schoolId, parent, studentIds, at = new Date()) {
  const sid = oid(schoolId); const out = new Map();
  if (!studentIds.length) return out;
  const ids = studentIds.map(oid).filter(Boolean);
  const [links, restrictions] = await Promise.all([
    GuardianLink.find({ schoolId: sid, parentId: parent._id, studentId: { $in: ids } }),
    ContactRestriction.find({ schoolId: sid, parentId: parent._id, studentId: { $in: ids } }),
  ]);
  const kids = new Set((parent.children || []).map(String));
  for (const id of studentIds) {
    out.set(String(id), evaluate({
      links: links.filter((l) => String(l.studentId) === String(id)), restrictions: restrictions.filter((r) => String(r.studentId) === String(id)),
      legacyLinked: parent.isActive !== false && kids.has(String(id)), at,
    }));
  }
  return out;
}

// Which parent accounts may be contacted about these students (used by every notification fan-out)
async function contactableParents(schoolId, studentIds, right = 'receiveNotices', at = new Date()) {
  const sid = oid(schoolId); const ids = (studentIds || []).map(oid).filter(Boolean);
  if (!ids.length) return [];
  const parents = await Parent.find({ schoolId: sid, children: { $in: ids }, isActive: { $ne: false } }).select('_id children isActive');
  if (!parents.length) return [];
  const [links, restrictions] = await Promise.all([
    GuardianLink.find({ schoolId: sid, studentId: { $in: ids }, parentId: { $in: parents.map((p) => p._id) } }),
    ContactRestriction.find({ schoolId: sid, studentId: { $in: ids }, parentId: { $in: parents.map((p) => p._id) } }),
  ]);
  const want = new Set(ids.map(String));
  return parents.filter((p) => (p.children || []).map(String).filter((c) => want.has(c)).some((c) => {
    const r = evaluate({
      links: links.filter((l) => String(l.parentId) === String(p._id) && String(l.studentId) === c),
      restrictions: restrictions.filter((x) => String(x.parentId) === String(p._id) && String(x.studentId) === c), legacyLinked: true, at,
    });
    return r.rights[right];
  }));
}

// Pickup decision for the gate. Never reveals why someone is restricted.
async function pickupDecision(schoolId, studentId, { parentId, personName }, at = new Date()) {
  const sid = oid(schoolId); const stid = oid(studentId);
  const name = String(personName || '').trim().toLowerCase();
  const [links, restrictions] = await Promise.all([
    GuardianLink.find({ schoolId: sid, studentId: stid }), ContactRestriction.find({ schoolId: sid, studentId: stid }),
  ]);
  const mineL = links.filter((l) => (parentId ? String(l.parentId) === String(parentId) : !l.parentId && name && String(l.personName).trim().toLowerCase() === name));
  const mineR = restrictions.filter((r) => (parentId ? String(r.parentId) === String(parentId) : !r.parentId && name && String(r.personName).trim().toLowerCase() === name));
  const hit = mineR.filter((r) => effective(r, at) && ['no-pickup', 'no-access'].includes(r.type));
  if (hit.length) return { decision: 'Denied', code: 'restricted', requiresHumanContact: true, message: 'Do not release the child. Ask the person to wait and call the principal.' };
  const live = mineL.filter((l) => effective(l, at));
  if (!live.length) return { decision: 'Denied', code: mineL.length ? 'ended' : 'not-listed', requiresHumanContact: true, message: 'This person is not on the child\'s authorised pickup list. Do not release the child; call the family or the principal.' };
  const l = live.sort((a, b) => new Date(b.validFrom) - new Date(a.validFrom))[0];
  if (!l.rights || l.rights.pickup !== true) return { decision: 'Denied', code: 'no-pickup-right', requiresHumanContact: true, message: 'This person is linked to the child but is not authorised for pickup. Do not release the child.' };
  return { decision: 'Authorised', code: 'ok', requiresHumanContact: false, message: 'Authorised for pickup.', relationship: l.relationship };
}

module.exports = { KEYS, DEFAULTS, resolve, resolveForParent, contactableParents, pickupDecision, evaluate };
