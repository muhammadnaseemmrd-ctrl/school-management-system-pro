// Gate, visitor, dismissal and drill rules (PRD E09). Pure helpers plus the pickup decision that every release goes through.
const crypto = require('crypto');
const mongoose = require('../lib/pgdoc');
const AppSetting = require('../models/AppSetting');
const PickupAuthorization = require('../models/PickupAuthorization');
const G = require('./guardianRights');
const A = require('./attendanceOps');

const DEFAULTS = {
  gates: ['Main gate'],
  inviteHours: 24,          // how long an approved invitation code works after it was issued, at most until the visit window ends
  requireId: true,          // reception must look at an ID before a visitor gets a badge
  idRetentionDays: 30,      // ID type and last four characters are wiped after this
  badgeHours: 8,
  maxVisitHours: 8,         // a visitor still inside after this is flagged
  walkInAllowed: true,
  contractorMaxHours: 12,
  handoverAcceptMinutes: 30,
  familyFallbackMinutes: 5, // a family that has not opened the in-app notice after this long goes on the phone-call list
  notifyOnPickup: true,
};
const ZONES = {
  Parent: ['Reception', 'Admin office', 'Meeting room'], Guest: ['Reception', 'Meeting room'], Vendor: ['Reception', 'Delivery bay'],
  Official: ['Reception', 'Admin office', 'Classroom corridor'], Interview: ['Reception', 'Admin office'],
};
const ID_TYPES = ['CNIC', 'Passport', 'Driving licence', 'Employee card', 'Other'];
const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);

async function getSettings(schoolId) { const s = await AppSetting.findOne({ key: `safety:${schoolId}` }); return { ...DEFAULTS, ...(s?.value || {}) }; }
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const newToken = () => crypto.randomBytes(18).toString('base64url');
const newCode = () => String(crypto.randomInt(100000, 1000000));
const safeEq = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

// What the desk sees when a code is scanned: "AUL-V.<id>.<token>" for visitors, "AUL-C.<id>.<token>" for contractors
function parseCode(raw) {
  const m = /^AUL-([VC])\.([a-f0-9]{24})\.([A-Za-z0-9_-]{10,40})$/.exec(String(raw || '').trim());
  return m ? { type: m[1] === 'V' ? 'visitor' : 'contractor', id: m[2], token: m[3] } : null;
}
const codeFor = (type, id, token) => `AUL-${type === 'visitor' ? 'V' : 'C'}.${id}.${token}`;

async function today(schoolId) { return (await A.clock(schoolId)).dateKey; }

// Who may collect this child now? A restriction always wins; then a named guardian; then a one-day authorisation with the right code.
async function collectorDecision(schoolId, studentId, { parentId, personName, code }, day) {
  const dec = await G.pickupDecision(schoolId, studentId, { parentId, personName });
  if (dec.code === 'restricted') return { ...dec, basis: 'none' };
  if (dec.decision === 'Authorised') return { ...dec, basis: 'guardian' };
  const name = norm(personName);
  if (!parentId && name && code) {
    const rows = await PickupAuthorization.find({ schoolId: oid(schoolId), studentId: oid(studentId), day, status: 'Active' });
    const hit = rows.find((r) => norm(r.personName) === name && safeEq(r.codeHash, sha(String(code).trim())));
    if (hit) return { decision: 'Authorised', code: 'authorisation', requiresHumanContact: false, message: 'Authorised for pickup today.', relationship: hit.relationship, basis: 'authorisation', authorizationId: hit._id, authorization: hit };
  }
  return { ...dec, basis: 'none' };
}

// Is this adult barred from the campus entirely? (a no-access restriction, by account or by name)
async function barredFromCampus(schoolId, { parentId, name }) {
  const ContactRestriction = require('../models/ContactRestriction');
  const rows = await ContactRestriction.find({ schoolId: oid(schoolId), type: 'no-access' });
  const at = new Date(); const n = norm(name);
  return rows.some((r) => new Date(r.validFrom) <= at && (!r.validTo || new Date(r.validTo) > at)
    && ((parentId && r.parentId && String(r.parentId) === String(parentId)) || (!r.parentId && n && norm(r.personName) === n)));
}

// Children a parent may act for under one guardian right (links and the older children list both count)
async function familyKids(schoolId, parentId, right = 'viewInfo') {
  const Parent = require('../models/Parent'); const GuardianLink = require('../models/GuardianLink');
  const [par, links] = await Promise.all([Parent.findOne({ _id: parentId, schoolId }).select('children'), GuardianLink.find({ schoolId: oid(schoolId), parentId: oid(parentId) }).select('studentId')]);
  const ids = [...new Set([...(par?.children || []), ...links.map((l) => l.studentId)].map(String))]; const out = [];
  for (const id of ids) { const g = await G.resolve(schoolId, parentId, id); if (g.linked && g.rights[right]) out.push(id); }
  return out;
}

const clean = (v, n = 200) => String(v ?? '').trim().slice(0, n);

module.exports = { DEFAULTS, ZONES, ID_TYPES, getSettings, sha, newToken, newCode, safeEq, norm, hhmm, parseCode, codeFor, today, collectorDecision, barredFromCampus, familyKids, clean, oid };

// The signed-in person's display name, looked up once per request (tokens carry only the id and role)
async function actor(req) {
  if (req.actorName) return { id: req.user.userId, role: req.user.role, name: req.actorName };
  const M = { admin: 'User', teacher: 'Teacher', parent: 'Parent', student: 'Student' }[req.user.role];
  const row = M ? await require(`../models/${M}`).findById(req.user.userId).select('name') : null;
  req.actorName = row?.name || ''; return { id: req.user.userId, role: req.user.role, name: req.actorName };
}
module.exports.actor = actor;
