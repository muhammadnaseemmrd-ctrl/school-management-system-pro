// Notifications for every role. Saved in the database (bell icon) and, when the person has
// allowed it, delivered as a browser/phone push even if the app is closed (Web Push, free).
// web-push is loaded lazily so a problem with the push library can never stop the API from starting.
let _webpush;
const getWebpush = () => {
  if (_webpush === undefined) {
    try { _webpush = require('web-push'); } catch (e) { console.warn('web-push unavailable:', e.message); _webpush = null; }
  }
  if (!_webpush) throw new Error('web-push unavailable');
  return _webpush;
};
const mongoose = require('../lib/pgdoc');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const AppSetting = require('../models/AppSetting');

let vapidReady = null;
const getVapid = () => {
  if (!vapidReady) {
    vapidReady = (async () => {
      const webpush = getWebpush();
      let doc = await AppSetting.findOne({ key: 'vapid' });
      if (!doc) {
        const keys = webpush.generateVAPIDKeys();
        await AppSetting.updateOne({ key: 'vapid' }, { $setOnInsert: { value: keys } }, { upsert: true });
        doc = await AppSetting.findOne({ key: 'vapid' });
      }
      const { publicKey, privateKey } = doc.value;
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@aulensia.local', publicKey, privateKey);
      return publicKey;
    })().catch((e) => { vapidReady = null; throw e; });
  }
  return vapidReady;
};

const oid = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const ROLE_OF_MODEL = { User: 'admin', Teacher: 'teacher', Student: 'student', Parent: 'parent' };
const roleOfModel = (m) => ROLE_OF_MODEL[m] || null;

// recipients: [{ id, role }]. Never throws – a notification problem must not break the main action.
const BYPASS_QUIET = new Set(['safety']); // gate, drill and pickup alerts are never held back
const notify = async ({ schoolId, recipients, title, body = '', link = '', type = 'general', key = '', exclude = null, urgent = false, track = null }) => {
  try {
    const seen = new Set();
    let list = (recipients || []).filter((r) => {
      const id = r && oid(r.id);
      if (!id || !r.role) return false;
      if (exclude && String(exclude) === String(id)) return false;
      const k = `${r.role}:${id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 1500);
    if (!list.length) return;

    if (key) {
      const done = await Notification.find({ userId: { $in: list.map((r) => oid(r.id)) }, key }).select('userId');
      const skip = new Set(done.map((d) => String(d.userId)));
      list = list.filter((r) => !skip.has(String(r.id)));
      if (!list.length) return;
    }
    const linkFor = (role) => (link && typeof link === 'object' ? link[role] || link.default || '' : link || '');
    const docs = list.map((r) => ({ schoolId: oid(schoolId), userId: oid(r.id), userRole: r.role, type, title, body: String(body).slice(0, 300), link: linkFor(r.role), key }));
    await Notification.insertMany(docs, { ordered: false });

    // Quiet hours (PRD E20): the in-app copy above is always saved at once. A push waits while the school's quiet hours, or the person's own, apply.
    // Safety alerts and urgent office messages go straight through. Held pushes are sent later by comms.dispatchDue.
    const now = new Date(); const later = new Map(); const off = new Set();
    try {
      const C = require('./comms/service'); const settings = await C.getSettings(schoolId); const tz = await C.K.tzOf(schoolId);
      const prefs = await require('../models/CmPref').find({ schoolId: oid(schoolId), userId: { $in: docs.map((d) => d.userId) } });
      const pmap = new Map(prefs.map((x) => [`${x.role}:${x.userId}`, x]));
      const bypass = (urgent && settings.urgentBypass) || BYPASS_QUIET.has(type);
      for (const d of docs) {
        const pf = pmap.get(`${d.userRole}:${d.userId}`);
        if (pf && pf.push === false) { off.add(String(d.userId)); continue; }
        if (bypass) continue;
        const until = C.K.quietUntil(now, [settings.quiet.on ? settings.quiet : null, pf && pf.quietOn ? { from: pf.quietFrom, to: pf.quietTo } : null], tz);
        if (until) later.set(String(d.userId), until);
      }
    } catch (e) { console.error('quiet hours check failed:', e.message); }
    const Delivery = require('../models/CmDelivery'); const meta = track || {};
    const base = (d) => ({ schoolId: oid(schoolId), recipientRole: d.userRole, recipientId: d.userId, kind: meta.kind || type, refId: oid(meta.refId), lang: meta.lang || 'en', bypassedQuiet: !!(urgent || BYPASS_QUIET.has(type)) });
    const rows = [];
    if (track) for (const d of docs) rows.push({ ...base(d), channel: 'inapp', state: 'sent', sentAt: now });
    for (const d of docs) {
      const k = String(d.userId);
      if (later.has(k)) rows.push({ ...base(d), channel: 'push', state: 'deferred', deferUntil: later.get(k), payload: { title, body: String(body).slice(0, 140), url: linkFor(d.userRole) || '/' } });
      else if (off.has(k) && track) rows.push({ ...base(d), channel: 'push', state: 'skipped', reason: 'push turned off' });
    }
    // Web Push (best effort, limited so a request never hangs)
    const subs = await PushSubscription.find({ userId: { $in: docs.map((d) => d.userId).filter((u) => !later.has(String(u)) && !off.has(String(u))) } }).limit(400);
    const outcome = new Map();
    if (subs.length) {
      await getVapid();
      await Promise.race([
        Promise.allSettled(subs.map(async (s) => {
          try { await getWebpush().sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title, body: String(body).slice(0, 140), url: linkFor(s.userRole) || '/' }), { TTL: 86400 }); outcome.set(String(s.userId), 'sent'); }
          catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id }); else if (outcome.get(String(s.userId)) !== 'sent') outcome.set(String(s.userId), 'failed'); }
        })),
        new Promise((r) => setTimeout(r, 6000)),
      ]);
    }
    if (track) {
      for (const d of docs) {
        const k = String(d.userId); if (later.has(k) || off.has(k)) continue;
        const o = outcome.get(k);
        if (o === 'sent') rows.push({ ...base(d), channel: 'push', state: 'sent', sentAt: now, attempts: 1 });
        else if (o === 'failed') rows.push({ ...base(d), channel: 'push', state: 'failed', attempts: 1, nextTryAt: new Date(Date.now() + 5 * 60000), payload: { title, body: String(body).slice(0, 140), url: linkFor(d.userRole) || '/' } });
        else rows.push({ ...base(d), channel: 'push', state: 'skipped', reason: 'no device' });
      }
    }
    if (rows.length) await Delivery.insertMany(rows, { ordered: false });
  } catch (e) {
    console.error('notify failed:', e.message);
  }
};

// Send one push now (used to release pushes held for quiet hours). Returns 'sent', 'none' (no device) or 'failed'.
const pushOnly = async (userId, role, payload) => {
  try {
    const subs = await PushSubscription.find({ userId: oid(userId) }).limit(10);
    if (!subs.length) return 'none';
    await getVapid(); let ok = false;
    await Promise.all(subs.map(async (s) => {
      try { await getWebpush().sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: payload.title || '', body: payload.body || '', url: payload.url || '/' }), { TTL: 86400 }); ok = true; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id }); }
    }));
    return ok ? 'sent' : 'failed';
  } catch (e) { return 'failed'; }
};

/* ── who to tell ── */
const admins = async (schoolId) => (await require('../models/User').find({ schoolId, role: 'admin', isActive: { $ne: false } }).select('_id')).map((u) => ({ id: u._id, role: 'admin' }));
const teachers = async (schoolId) => (await require('../models/Teacher').find({ schoolId }).select('_id')).map((u) => ({ id: u._id, role: 'teacher' }));
const students = async (schoolId, filter = {}) => (await require('../models/Student').find({ schoolId, ...filter }).select('_id')).map((u) => ({ id: u._id, role: 'student' }));
// Only parent accounts that may be contacted about these students (guardian rights + restrictions, PRD E05)
const parentsOf = async (schoolId, studentIds, right = 'receiveNotices') => (await require('./guardianRights').contactableParents(schoolId, studentIds, right)).map((u) => ({ id: u._id, role: 'parent' }));
const parents = async (schoolId) => (await require('../models/Parent').find({ schoolId }).select('_id')).map((u) => ({ id: u._id, role: 'parent' }));
// a student plus their parents
const studentAndParents = async (schoolId, studentIds) => [...(studentIds || []).map((id) => ({ id, role: 'student' })), ...(await parentsOf(schoolId, studentIds))];

// Find which kind of account an id belongs to
const resolveRole = async (id) => {
  if (!oid(id)) return null;
  const checks = [['admin', 'User'], ['teacher', 'Teacher'], ['student', 'Student'], ['parent', 'Parent']];
  for (const [role, model] of checks) if (await require(`../models/${model}`).exists({ _id: id })) return role;
  return null;
};

module.exports = { notify, pushOnly, getVapid, roleOfModel, resolveRole, admins, teachers, students, parentsOf, parents, studentAndParents };
