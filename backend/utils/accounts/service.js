// Shared pieces of the school ledger (PRD E23): who may do what, settings with versions, numbering, trails and notices.
const crypto = require('crypto');
const base = require('../early/service');
const R = require('../registrar/service');
const E = require('./engine');
const N = require('../notify');
const { can } = require('../permissions');
const AppSetting = require('../../models/AppSetting');

const { oid, sid, who, bad, clean, pg } = base;
const isDup = R.isDup;
class Fail extends Error { constructor(code, message, extra = {}) { super(message); this.code = code; this.extra = extra; } }
const wrap = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof Fail) return bad(res, e.code, e.message, e.extra);
    console.error(`accounts ${name}:`, e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};
const ctxOf = (req) => ({ schoolId: sid(req), actor: who(req), role: req.user.role });

/* ───────── who may do what ───────── */
// Three time-limited grants for teachers or other staff (PRD E01). Administrators hold all three.
const grant = async (user, action) => user.role === 'admin' || (user.role === 'teacher' && (await can(user, action)).allowed);
const tiers = async (user) => {
  const approve = await grant(user, 'accounts.approve'); const prepare = approve || await grant(user, 'accounts.prepare'); const audit = prepare || await grant(user, 'accounts.audit');
  return { admin: user.role === 'admin', approve, prepare, audit };
};
const guard = (pick, msg) => async (req, res, next) => { try { const t = await tiers(req.user); if (t[pick]) return next(); return bad(res, 403, msg); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const onRead = guard('audit', 'You cannot read the school\'s ledger.');
const onPrepare = guard('prepare', 'You do not keep the school\'s books.');
const onApprove = guard('approve', 'You cannot approve or post in the ledger.');
const sole = (schoolId) => R.soleAdmin(schoolId);

/* ───────── settings, with versions ───────── */
const getCfg = async (schoolId) => {
  const s = await AppSetting.findOne({ key: `acct:${schoolId}` }); const v = s?.value || {};
  const history = v.history?.length ? v.history : [];
  const cur = history.length ? history[history.length - 1] : null;
  return { settings: E.merge(cur ? cur.settings : {}), version: cur ? cur.version : 0, history, ready: !!(cur && cur.settings && cur.settings.startDate) };
};
const putCfg = (schoolId, value) => AppSetting.updateOne({ key: `acct:${schoolId}` }, { $set: { value } }, { upsert: true });
// Small mutable state kept next to the settings (feed cursors, last run, held items).
const getState = async (schoolId) => (await AppSetting.findOne({ key: `acct-state:${schoolId}` }))?.value || {};
const putState = (schoolId, value) => AppSetting.updateOne({ key: `acct-state:${schoolId}` }, { $set: { value } }, { upsert: true });
const today = (schoolId) => base.today(schoolId);

/* ───────── numbering, trails and notices ───────── */
const numbered = async (Model, schoolId, field, prefix, doc) => {
  const start = (await Model.countDocuments({ schoolId })) + 1; const year = new Date().getUTCFullYear();
  for (let i = 0; i < 12; i += 1) {
    try { return await Model.create({ ...doc, schoolId, [field]: `${prefix}-${year}-${String(start + i).padStart(6, '0')}` }); }
    catch (e) { if (!isDup(e) || (e.keyPattern && Object.keys(e.keyPattern).length && !(field in e.keyPattern))) throw e; }
  }
  throw new Error('could not number the record');
};
const trail = (actor, action, note = '') => ({ at: new Date(), byId: actor?.id || null, byName: actor?.name || '', action, note: String(note || '').slice(0, 300) });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-US')}`;
const tellAdmins = async (schoolId, title, body, link = '/admin#/accounts', exclude = null) => { try { await N.notify({ schoolId, recipients: await N.admins(schoolId), title, body, link, type: 'accounts', exclude }); } catch (e) { /* the books go on */ } };
// A different person must decide, unless the school has only one administrator (then it is recorded as such).
async function separate(ctx, makerId, what) {
  if (String(makerId) !== String(ctx.actor.id)) return false;
  if (await sole(ctx.schoolId)) return true;
  throw new Fail(403, `${what} must be decided by someone other than the person who made it.`, { reason: 'maker_checker' });
}
const num = (v, name, { min = 0, max = 1e12, int = true } = {}) => { const x = Number(v); if (!Number.isFinite(x) || x < min || x > max || (int && !Number.isInteger(x))) throw new Fail(422, `${name} must be ${int ? 'a whole number' : 'a number'} between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`); return x; };
const day = (v, name) => { const s = String(v || '').trim(); if (!E.isDay(s)) throw new Fail(422, `Give ${name} as a date.`); return s; };
const text = (v, name, { min = 0, max = 300 } = {}) => { const s = String(v || '').trim(); if (s.length < min) throw new Fail(422, `${name} needs at least ${min} characters.`); return s.slice(0, max); };

module.exports = { base, R, E, N, can, Fail, wrap, ctxOf, tiers, onRead, onPrepare, onApprove, sole, getCfg, putCfg, getState, putState, today, numbered, trail, sha, money, tellAdmins, separate, num, day, text, oid, sid, who, bad, clean, pg, isDup };
