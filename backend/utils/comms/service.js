// Shared rules for family communication (PRD E20): settings, preferences, who may talk to whom about which child, and delivery with quiet hours.
const mongoose = require('../../lib/pgdoc');
const AppSetting = require('../../models/AppSetting');
const CmPref = require('../../models/CmPref');
const CmDelivery = require('../../models/CmDelivery');
const Teacher = require('../../models/Teacher');
const Student = require('../../models/Student');
const Parent = require('../../models/Parent');
const E = require('../early/service');
const G = require('../guardianRights');
const N = require('../notify');
const K = require('./clock');
const { both } = require('./i18n');

const { oid, sid, bad, wrap, clean, pg } = E;
const DEFAULTS = {
  quiet: { on: true, from: '21:00', to: '07:00' }, urgentBypass: true,
  workDays: [1, 2, 3, 4, 5, 6], hours: { from: '08:00', to: '15:00' },
  // minutes of working time
  sla: { normal: { first: 420, resolve: 2520 }, high: { first: 240, resolve: 1260 }, urgent: { first: 60, resolve: 420 } },
  threadReplyMinutes: 420, autoCloseDays: 7, reopenDays: 14,
  ptm: { slotMinutes: 10, cancelHoursBefore: 4, maxPerFamily: 6 },
};
const deep = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' ? deep(a[k], b[k]) : b[k]; return o; };
const sCache = new Map();
async function getSettings(schoolId) {
  const k = String(schoolId); const hit = sCache.get(k); if (hit && Date.now() - hit.at < 30000) return hit.v;
  const row = await AppSetting.findOne({ key: `comms:${k}` }); const v = deep(DEFAULTS, (row && row.value) || {}); sCache.set(k, { v, at: Date.now() }); return v;
}
async function saveSettings(schoolId, patch) {
  const k = String(schoolId); const row = await AppSetting.findOne({ key: `comms:${k}` }); const next = deep((row && row.value) || {}, patch);
  await AppSetting.updateOne({ key: `comms:${k}` }, { $set: { value: next } }, { upsert: true }); sCache.delete(k); return getSettings(schoolId);
}
const prefOf = async (schoolId, role, id) => (await CmPref.findOne({ schoolId: oid(schoolId), role, userId: oid(id) })) || { lang: 'en', quietOn: false, push: true };

// Who teaches a child: the class teacher, anyone with the class on their list, and subject teachers for that class
const teachesClass = (t, classId) => !!classId && ([t.classTeacherOf, ...(t.classIds || []), ...(t.subjectClassAssignments || []).map((a) => a.classId)].filter(Boolean).map(String).includes(String(classId)));
async function teachersOfClass(schoolId, classId) {
  const all = await Teacher.find({ schoolId: oid(schoolId), isActive: { $ne: false } }).select('name classIds classTeacherOf subjectClassAssignments subjectIds');
  return all.filter((t) => teachesClass(t, classId));
}
async function canStaffReach(user, student) {
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  const t = await Teacher.findOne({ _id: oid(user.userId), schoolId: oid(user.schoolId) }).select('classIds classTeacherOf subjectClassAssignments');
  return !!t && teachesClass(t, student.classId);
}
// May this parent use the school's contact channels about this child
async function parentScope(schoolId, parentId, studentId, right = 'receiveMessages') {
  const r = await G.resolve(schoolId, parentId, studentId);
  return { ok: r.linked && !!r.rights[right], rights: r.rights, restricted: r.restricted };
}

/* ── delivery ── */
// to: [{role,id}] ; title/body: { en, ur }. Each person gets the language they chose. Quiet hours are applied inside notify().
async function deliver({ schoolId, to, title, body, link, type = 'general', key = '', urgent = false, kind = 'general', refId = null, exclude = null }) {
  const list = (to || []).filter((r) => r && oid(r.id) && r.role); if (!list.length) return;
  const prefs = await CmPref.find({ schoolId: oid(schoolId), userId: { $in: list.map((r) => oid(r.id)) } });
  const langOf = new Map(prefs.map((p) => [`${p.role}:${p.userId}`, p.lang]));
  const groups = { en: [], ur: [] };
  for (const r of list) groups[langOf.get(`${r.role}:${r.id}`) === 'ur' ? 'ur' : 'en'].push(r);
  for (const lang of ['en', 'ur']) {
    if (!groups[lang].length) continue;
    await N.notify({ schoolId, recipients: groups[lang], title: title[lang] || title.en, body: (body && (body[lang] || body.en)) || '', link, type, key: key ? `${key}:${lang}` : '', exclude, urgent, track: { kind, refId, lang } });
  }
}
// Push anything that was held for quiet hours or failed earlier. Safe to run often.
async function dispatchDue(schoolId, limit = 300) {
  const now = new Date(); const sidv = oid(schoolId); const settings = await getSettings(schoolId); const tz = await K.tzOf(schoolId);
  const rows = await CmDelivery.find({ schoolId: sidv, channel: 'push', attempts: { $lt: 3 }, $or: [{ state: 'deferred', deferUntil: { $lte: now } }, { state: 'failed', nextTryAt: { $lte: now } }] }).limit(limit);
  let sent = 0; let held = 0; let failed = 0;
  const prefs = rows.length ? await CmPref.find({ schoolId: sidv, userId: { $in: rows.map((r) => r.recipientId) } }) : [];
  const pmap = new Map(prefs.map((p) => [`${p.role}:${p.userId}`, p]));
  for (const r of rows) {
    const p = pmap.get(`${r.recipientRole}:${r.recipientId}`);
    const until = r.bypassedQuiet ? null : K.quietUntil(now, [settings.quiet.on ? settings.quiet : null, p && p.quietOn ? { from: p.quietFrom, to: p.quietTo } : null], tz);
    if (until) { r.deferUntil = until; await r.save(); held += 1; continue; }
    if (p && p.push === false) { r.state = 'skipped'; r.reason = 'push turned off'; await r.save(); continue; }
    const res = await N.pushOnly(r.recipientId, r.recipientRole, r.payload || {});
    r.attempts += 1;
    if (res === 'sent') { r.state = 'sent'; r.sentAt = new Date(); sent += 1; } else if (res === 'none') { r.state = 'skipped'; r.reason = 'no device'; } else { r.state = 'failed'; r.nextTryAt = new Date(Date.now() + [5, 30, 120][Math.min(2, r.attempts - 1)] * 60000); failed += 1; }
    await r.save();
  }
  return { sent, held, failed, looked: rows.length };
}

module.exports = { DEFAULTS, getSettings, saveSettings, prefOf, teachesClass, teachersOfClass, canStaffReach, parentScope, deliver, dispatchDue, both, oid, sid, bad, wrap, clean, pg, K };
