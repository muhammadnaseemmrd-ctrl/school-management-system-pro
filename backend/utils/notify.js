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
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@darsgah.local', publicKey, privateKey);
      return publicKey;
    })().catch((e) => { vapidReady = null; throw e; });
  }
  return vapidReady;
};

const oid = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const ROLE_OF_MODEL = { User: 'admin', Teacher: 'teacher', Student: 'student', Parent: 'parent' };
const roleOfModel = (m) => ROLE_OF_MODEL[m] || null;

// recipients: [{ id, role }]. Never throws – a notification problem must not break the main action.
const notify = async ({ schoolId, recipients, title, body = '', link = '', type = 'general', key = '', exclude = null }) => {
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

    // Web Push (best effort, limited so a request never hangs)
    const subs = await PushSubscription.find({ userId: { $in: docs.map((d) => d.userId) } }).limit(400);
    if (!subs.length) return;
    await getVapid();
    await Promise.race([
      Promise.allSettled(subs.map(async (s) => {
        try { await getWebpush().sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title, body: String(body).slice(0, 140), url: linkFor(s.userRole) || '/' }), { TTL: 86400 }); }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id }); }
      })),
      new Promise((r) => setTimeout(r, 6000)),
    ]);
  } catch (e) {
    console.error('notify failed:', e.message);
  }
};

/* ── who to tell ── */
const admins = async (schoolId) => (await require('../models/User').find({ schoolId, role: 'admin', isActive: { $ne: false } }).select('_id')).map((u) => ({ id: u._id, role: 'admin' }));
const teachers = async (schoolId) => (await require('../models/Teacher').find({ schoolId }).select('_id')).map((u) => ({ id: u._id, role: 'teacher' }));
const students = async (schoolId, filter = {}) => (await require('../models/Student').find({ schoolId, ...filter }).select('_id')).map((u) => ({ id: u._id, role: 'student' }));
const parentsOf = async (schoolId, studentIds) => (await require('../models/Parent').find({ schoolId, children: { $in: studentIds } }).select('_id')).map((u) => ({ id: u._id, role: 'parent' }));
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

module.exports = { notify, getVapid, roleOfModel, resolveRole, admins, teachers, students, parentsOf, parents, studentAndParents };
