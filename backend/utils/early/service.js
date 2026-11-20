// Shared rules for nursery care (PRD E15): who may see a room, the staff-to-child ratio, family sharing and consent.
const crypto = require('crypto');
const mongoose = require('../../lib/pgdoc');
const AppSetting = require('../../models/AppSetting');
const Teacher = require('../../models/Teacher');
const Student = require('../../models/Student');
const EyRoom = require('../../models/EyRoom');
const EyPlacement = require('../../models/EyPlacement');
const EyDay = require('../../models/EyDay');
const EyPresence = require('../../models/EyPresence');
const EyProfile = require('../../models/EyProfile');
const EyRatioEvent = require('../../models/EyRatioEvent');
const A = require('../attendanceOps');
const N = require('../notify');

const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const sid = (req) => oid(req.user.schoolId);
const who = (req) => ({ id: oid(req.user.userId), name: req.actorName || '', role: req.user.role });
const bad = (res, code, message, extra = {}) => res.status(code).json({ message, ...extra });
const wrap = (name, fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error(`early ${name}:`, e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const clean = (v, n = 300) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const pg = (q) => ({ p: Math.max(1, parseInt(q.page, 10) || 1), l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)) });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

const BANDS = { baby: 'Babies (under 1)', toddler: 'Toddlers (1 to 2)', twos: 'Twos', preschool: 'Pre-school (3 to 5)', mixed: 'Mixed ages' };
// Starting values only. A school's own policy and the rules where it works decide the real numbers, so every value is editable and none is presented as a legal minimum.
const DEFAULTS = {
  ratios: { baby: 3, toddler: 4, twos: 6, preschool: 8, mixed: 6 },   // children per adult
  notifyOnCheckIn: true, notifyOnCheckOut: true, absenceAskAfter: '09:30', wellnessLookAtArrival: true,
  napAlertMinutes: 210,          // a nap longer than this is pointed out to the carer
  photoMaxKb: 600, diaryNeedsReview: true,
};
const getSettings = async (schoolId) => { const s = await AppSetting.findOne({ key: `early:${schoolId}` }); return { ...DEFAULTS, ...(s?.value || {}), ratios: { ...DEFAULTS.ratios, ...((s?.value || {}).ratios || {}) } }; };
const putSettings = (schoolId, value) => AppSetting.updateOne({ key: `early:${schoolId}` }, { $set: { value } }, { upsert: true });
const allowedChildren = (room, st) => Math.max(1, Number(room.ratio) > 0 ? Number(room.ratio) : (st.ratios[room.ageBand] || 8));

const today = async (schoolId) => (await A.clock(schoolId)).dateKey;

// Administrators see every room. A teacher sees the rooms they are named in (lead or carer).
async function scopeOf(req) {
  if (req.user.role === 'admin') return { admin: true, rooms: null };
  const rows = await EyRoom.find({ schoolId: sid(req), active: true, $or: [{ leadId: oid(req.user.userId) }, { staffIds: oid(req.user.userId) }] }).select('_id leadId');
  return { admin: false, rooms: new Set(rows.map((r) => String(r._id))), leads: new Set(rows.filter((r) => String(r.leadId) === String(req.user.userId)).map((r) => String(r._id))) };
}
const inScope = (scope, roomId) => scope.admin || scope.rooms.has(String(roomId));
const isLead = (scope, room) => scope.admin || (scope.leads && scope.leads.has(String(room._id || room)));
async function roomFor(req, id, { lead = false } = {}) {
  const room = oid(id) ? await EyRoom.findOne({ _id: id, schoolId: sid(req) }) : null;
  if (!room) return { error: [404, 'That room is not in your school.'] };
  const scope = await scopeOf(req);
  if (!inScope(scope, room._id)) return { error: [403, 'You are not on the team for this room.'] };
  if (lead && !isLead(scope, room)) return { error: [403, 'Only the room lead or an administrator can do this.'] };
  return { room, scope };
}

const placementOf = (schoolId, childId) => EyPlacement.findOne({ schoolId: oid(schoolId), childId: oid(childId), to: null });
async function childIn(req, childId) {
  const pl = oid(childId) ? await placementOf(req.user.schoolId, childId) : null;
  if (!pl) return { error: [404, 'That child is not placed in a nursery room.'] };
  const r = await roomFor(req, pl.roomId); if (r.error) return r;
  const child = await Student.findOne({ _id: childId, schoolId: sid(req) }).select('name dateOfBirth gender studentId classId photo');
  if (!child) return { error: [404, 'That child is not in your school.'] };
  return { ...r, child, placement: pl };
}

const ageMonths = (dob, at = new Date()) => { if (!dob) return null; const d = new Date(dob); if (Number.isNaN(d.getTime())) return null; return Math.max(0, (at.getUTCFullYear() - d.getUTCFullYear()) * 12 + (at.getUTCMonth() - d.getUTCMonth()) - (at.getUTCDate() < d.getUTCDate() ? 1 : 0)); };
const ageLabel = (m) => (m == null ? '' : m < 24 ? `${m} months` : `${Math.floor(m / 12)} y ${m % 12} m`);

/* ───────── ratio and capacity ───────── */
// Counts only. Records a period in EyRatioEvent when a room goes over, and closes it when it is back inside.
async function ratioOf(schoolId, room, st) {
  const sidv = oid(schoolId);
  const [kids, carers] = await Promise.all([EyDay.countDocuments({ schoolId: sidv, roomId: room._id, day: await today(schoolId), status: 'In' }), EyPresence.countDocuments({ schoolId: sidv, roomId: room._id, outAt: null })]);
  const per = allowedChildren(room, st); const allowed = carers * per;
  const overRatio = kids > 0 && kids > allowed; const overCap = kids > (room.capacity || 0);
  return { roomId: String(room._id), name: room.name, ageBand: room.ageBand, children: kids, staff: carers, perAdult: per, allowedChildren: allowed, capacity: room.capacity, needStaff: kids ? Math.max(0, Math.ceil(kids / per) - carers) : 0, overRatio, overCapacity: overCap, ok: !overRatio && !overCap };
}
async function settleRatio(schoolId, room, notifyAdmins = true) {
  const st = await getSettings(schoolId); const r = await ratioOf(schoolId, room, st); const sidv = oid(schoolId); const day = await today(schoolId);
  for (const [kind, over] of [['ratio', r.overRatio], ['capacity', r.overCapacity]]) {
    const open = await EyRatioEvent.findOne({ schoolId: sidv, roomId: room._id, kind, endedAt: null });
    if (over && !open) {
      await EyRatioEvent.create({ schoolId: sidv, roomId: room._id, roomName: room.name, kind, day, children: r.children, staff: r.staff, allowedChildren: r.allowedChildren, capacity: room.capacity });
      if (notifyAdmins) await N.notify({ schoolId, recipients: [...(await N.admins(schoolId)), ...(room.leadId ? [{ id: room.leadId, role: 'teacher' }] : [])], title: kind === 'ratio' ? `${room.name}: not enough carers` : `${room.name}: over capacity`, body: kind === 'ratio' ? `${r.children} children with ${r.staff} carer${r.staff === 1 ? '' : 's'} (${r.allowedChildren} allowed).` : `${r.children} children, room holds ${room.capacity}.`, link: '#/earlyYears', type: 'safety', key: `ey-${kind}:${room._id}:${day}` });
    } else if (!over && open) { open.endedAt = new Date(); open.children = open.children; await open.save(); }
    else if (over && open) { open.children = Math.max(open.children || 0, r.children); await open.save(); }
  }
  return r;
}

/* ───────── what a family may see ───────── */
const defaultConsent = { journal: true, photos: false, portfolio: false };
async function consentOf(schoolId, childIds) {
  const rows = await EyProfile.find({ schoolId: oid(schoolId), childId: { $in: childIds.map(oid).filter(Boolean) } }).select('childId consent');
  const m = new Map(rows.map((r) => [String(r.childId), { ...defaultConsent, ...JSON.parse(JSON.stringify(r.consent || {})) }]));
  for (const id of childIds) if (!m.has(String(id))) m.set(String(id), { ...defaultConsent });
  return m;
}

// A diary must be accompanied by staff who talked a behaviour note over with the family, and everything in it must still be active
const FAMILY_TYPES = new Set(['meal', 'drink', 'nap', 'toilet', 'mood', 'activity', 'observation', 'note', 'health', 'medication', 'behavior']);
const needsTalk = (c) => c.careType === 'behavior';

// The words shown for one care entry, in either language
function line(c, lang = 'en') {
  const d = c.data || {}; const t = new Date(c.at); const hh = `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  const L = {
    en: { meal: `Ate ${d.amount || 'some'} of ${d.item || d.course || 'a meal'}`, drink: `Had ${d.item || 'a drink'}`, nap: d.end ? `Slept ${d.start || ''} to ${d.end}` : `Went down for a nap${d.start ? ` at ${d.start}` : ''}`, toilet: `Toilet: ${d.kind || 'visit'}`, mood: `Mood: ${d.value || 'settled'}`, health: clean(c.text, 200) || 'Health note', medication: `Medicine: ${d.name || ''} ${d.dose || ''}`.trim(), activity: `Activity: ${d.title || c.text || ''}`.trim(), observation: c.text || 'Observation', behavior: c.text || 'Behaviour note', note: c.text || '' },
    ur: { meal: `کھانا: ${d.item || d.course || ''} (${d.amount || ''})`, drink: `مشروب: ${d.item || ''}`, nap: d.end ? `نیند: ${d.start || ''} سے ${d.end}` : 'سو گیا/گئی', toilet: `واش روم: ${d.kind || ''}`, mood: `مزاج: ${d.value || ''}`, health: c.text || 'صحت کا نوٹ', medication: `دوا: ${d.name || ''}`, activity: `سرگرمی: ${d.title || c.text || ''}`, observation: c.text || '', behavior: c.text || '', note: c.text || '' },
  }[lang === 'ur' ? 'ur' : 'en'];
  return { at: c.at, time: hh, type: c.careType, text: (L[c.careType] || c.text || '') + (c.text && !['health', 'observation', 'behavior', 'note', 'activity'].includes(c.careType) ? ` — ${c.text}` : '') };
}

module.exports = { oid, sid, who, bad, wrap, clean, pg, sha, isDay, BANDS, DEFAULTS, getSettings, putSettings, allowedChildren, today, scopeOf, inScope, isLead, roomFor, placementOf, childIn, ageMonths, ageLabel, ratioOf, settleRatio, consentOf, defaultConsent, FAMILY_TYPES, needsTalk, line };
