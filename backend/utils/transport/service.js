// Shared pieces of school transport (PRD E22): who may do what, the settings with their versions, notices to families and the people running the buses.
const crypto = require('crypto');
const base = require('../early/service');
const R = require('../registrar/service');
const E = require('./engine');
const A = require('../attendanceOps');
const N = require('../notify');
const { can } = require('../permissions');
const AppSetting = require('../../models/AppSetting');
const PermissionGrant = require('../../models/PermissionGrant');
const TpDriver = require('../../models/TpDriver');

const { oid, sid, who, bad, clean, pg } = base;
const isDup = R.isDup;
class Fail extends Error { constructor(code, message, extra = {}) { super(message); this.code = code; this.extra = extra; } }
const wrap = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof Fail) return bad(res, e.code, e.message, e.extra);
    console.error(`transport ${name}:`, e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};
const ctxOf = (req) => ({ schoolId: sid(req), actor: who(req), role: req.user.role });

/* ───────── who may do what ───────── */
// Administrators run transport. A teacher needs a time-limited grant: a manager plans vehicles, drivers, routes and inspections; a dispatcher runs the day.
const isManager = async (user) => user.role === 'admin' || (user.role === 'teacher' && (await can(user, 'transport.manage')).allowed);
const isDispatcher = async (user) => (await isManager(user)) || (user.role === 'teacher' && (await can(user, 'transport.dispatch')).allowed);
const guard = (check, msg) => async (req, res, next) => { try { if (await check(req.user)) return next(); return bad(res, 403, msg); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const onManage = guard(isManager, 'You are not a transport manager.');
const onDispatch = guard(isDispatcher, 'You are not a transport dispatcher.');
// A manager who is not an administrator gets the dispatcher's day too, but only an administrator changes the rules.

/* ───────── settings, with versions ───────── */
const getCfg = async (schoolId) => {
  const s = await AppSetting.findOne({ key: `transport:${schoolId}` }); const v = s?.value || {};
  const history = v.history?.length ? v.history : [{ version: 1, reason: 'Starting values', at: new Date(0), byName: 'Default', settings: {} }];
  const cur = history[history.length - 1]; return { settings: E.merge(cur.settings), version: cur.version, history };
};
const putCfg = (schoolId, value) => AppSetting.updateOne({ key: `transport:${schoolId}` }, { $set: { value } }, { upsert: true });
const today = (schoolId) => base.today(schoolId);
const tzOf = async (schoolId) => { const School = require('../../models/School'); const s = await School.findById(schoolId).select('timezone'); return s?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC'; };

/* ───────── numbering and trails ───────── */
const numbered = async (Model, schoolId, field, prefix, doc) => {
  const start = (await Model.countDocuments({ schoolId })) + 1; const year = new Date().getUTCFullYear();
  for (let i = 0; i < 12; i += 1) {
    try { return await Model.create({ ...doc, schoolId, [field]: `${prefix}-${year}-${String(start + i).padStart(5, '0')}` }); }
    catch (e) { if (!isDup(e) || (e.keyPattern && Object.keys(e.keyPattern).length && !(field in e.keyPattern))) throw e; }
  }
  throw new Error('could not number the record');
};
const trail = (actor, action, note = '') => ({ at: new Date(), byId: actor?.id || null, byName: actor?.name || '', action, note: String(note || '').slice(0, 300) });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newKey = () => crypto.randomBytes(24).toString('base64url');
const hm = (d, tz) => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d)); } catch (e) { return new Date(d).toISOString().slice(11, 16); } };

/* ───────── who gets told ───────── */
// Dispatchers: every active administrator, plus teachers holding a live dispatch or manage grant.
async function dispatchers(schoolId) {
  const admins = await N.admins(schoolId); const now = new Date();
  const grants = await PermissionGrant.find({ schoolId, action: { $in: ['transport.dispatch', 'transport.manage'] }, granteeModel: 'Teacher', revokedAt: null, validFrom: { $lte: now }, validTo: { $gt: now } }).select('granteeId');
  const seen = new Set(); const out = [...admins];
  for (const g of grants) { const k = String(g.granteeId); if (!seen.has(k)) { seen.add(k); out.push({ id: g.granteeId, role: 'teacher' }); } }
  return out;
}
const tellDispatch = async (schoolId, title, body, { urgent = false, type = 'transport', link = '/admin#/transport' } = {}) => {
  try { await N.notify({ schoolId, recipients: await dispatchers(schoolId), title, body, link, type, urgent }); } catch (e) { /* a notice problem never stops the action */ }
};
// Guardians who may hear about these children (never someone with a no-contact restriction), plus the students themselves are not told.
const tellFamilies = async (schoolId, studentIds, title, body, { type = 'transport', urgent = false } = {}) => {
  try {
    const recipients = await N.parentsOf(schoolId, studentIds, 'receiveNotices'); if (!recipients.length) return 0;
    await N.notify({ schoolId, recipients, title, body, link: '/parent#/bus', type, urgent }); return recipients.length;
  } catch (e) { return 0; }
};

/* ───────── drivers sign in with their own key ───────── */
const driverAuth = async (req, res, next) => {
  try {
    const id = req.get('X-Driver-Id'); const key = req.get('X-Driver-Key');
    if (!oid(id) || !key) return bad(res, 401, 'Driver id and key are required.');
    const d = await TpDriver.findById(id);
    const a = Buffer.from(sha(key)); const b = Buffer.from(d?.keyHash || '');
    if (!d || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return bad(res, 401, 'This driver link is not recognised.');
    if (d.status !== 'active') return bad(res, 403, 'This driver link is switched off. Ask the transport office.');
    req.driver = d; TpDriver.updateOne({ _id: d._id }, { $set: { lastSeenAt: new Date() } }).catch(() => {}); next();
  } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};

module.exports = { E, A, N, base, R, oid, sid, who, bad, clean, pg, isDup, Fail, wrap, ctxOf, isManager, isDispatcher, onManage, onDispatch, getCfg, putCfg, today, tzOf, numbered, trail, sha, newKey, hm, dispatchers, tellDispatch, tellFamilies, driverAuth };
