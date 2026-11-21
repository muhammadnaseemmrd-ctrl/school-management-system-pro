// Shared pieces of procurement, funds, assets and facilities (PRD E19): who may work the office, the settings with their versions, numbering and trails.
const crypto = require('crypto');
const base = require('../early/service');
const R = require('../registrar/service');
const E = require('./engine');
const A = require('../attendanceOps');
const N = require('../notify');
const { can } = require('../permissions');
const AppSetting = require('../../models/AppSetting');

const { oid, sid, who, bad, clean, pg } = base;
const isDup = R.isDup;
class Fail extends Error { constructor(code, message, extra = {}) { super(message); this.code = code; this.extra = extra; } }
const wrap = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof Fail) return bad(res, e.code, e.message, e.extra);
    console.error(`procure ${name}:`, e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};
const ctxOf = (req) => ({ schoolId: sid(req), actor: who(req), role: req.user.role });

/* ───────── who may do what ───────── */
// Administrators run the office. A teacher can report faults; with a time-limited grant they can raise requests or work as the purchasing officer (PRD E01).
const isOfficer = async (user) => user.role === 'admin' || (user.role === 'teacher' && (await can(user, 'procure.officer')).allowed);
const canRequest = async (user) => (await isOfficer(user)) || (user.role === 'teacher' && (await can(user, 'procure.request')).allowed);
const guard = (check, msg) => async (req, res, next) => { try { if (await check(req.user)) return next(); return bad(res, 403, msg); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const onOffice = guard(isOfficer, 'You are not on the purchasing office.');
const onRequest = guard(canRequest, 'You cannot raise purchase requests.');
const sole = (schoolId) => R.soleAdmin(schoolId);

/* ───────── settings, with versions ───────── */
const getCfg = async (schoolId) => {
  const s = await AppSetting.findOne({ key: `procure:${schoolId}` }); const v = s?.value || {};
  const history = v.history?.length ? v.history : [{ version: 1, reason: 'Starting values', at: new Date(0), byName: 'Default', settings: {} }];
  const cur = history[history.length - 1]; return { settings: E.merge(cur.settings), version: cur.version, history };
};
const putCfg = (schoolId, value) => AppSetting.updateOne({ key: `procure:${schoolId}` }, { $set: { value } }, { upsert: true });
const today = (schoolId) => base.today(schoolId);

/* ───────── numbering, trails and notices ───────── */
// Numbered records: PREFIX-YYYY-NNNNN. Only a clash on the number itself tries the next one; any other clash (an invoice number, a routine date) goes back to the caller as the duplicate it is.
const numbered = async (Model, schoolId, field, prefix, doc) => {
  const start = (await Model.countDocuments({ schoolId })) + 1; const year = new Date().getUTCFullYear();
  for (let i = 0; i < 12; i += 1) {
    try { return await Model.create({ ...doc, schoolId, [field]: `${prefix}-${year}-${String(start + i).padStart(5, '0')}` }); }
    catch (e) { if (!isDup(e) || (e.keyPattern && Object.keys(e.keyPattern).length && !(field in e.keyPattern))) throw e; }
  }
  throw new Error('could not number the record');
};
const trail = (actor, action, note = '') => ({ at: new Date(), byId: actor?.id || null, byName: actor?.name || '', action, note: String(note || '').slice(0, 300) });
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-US')}`;
const tellAdmins = async (schoolId, title, body, link = '/admin#/purchasing', exclude = null) => { try { await N.notify({ schoolId, recipients: await N.admins(schoolId), title, body, link, type: 'procure', exclude }); } catch (e) { /* the office goes on */ } };
const tellPerson = async (schoolId, id, role, title, body, link = '/admin#/purchasing') => { try { await N.notify({ schoolId, recipients: [{ id, role }], title, body, link, type: 'procure' }); } catch (e) { /* the office goes on */ } };
// A different person must decide, unless the school has only one administrator (then it is recorded as such).
async function separate(ctx, makerId, what) {
  if (String(makerId) !== String(ctx.actor.id)) return false;
  if (await sole(ctx.schoolId)) return true;
  throw new Fail(403, `${what} must be decided by someone other than the person who made it.`, { reason: 'maker_checker' });
}
const num = (v, name, { min = 0, max = 1e9, int = true } = {}) => { const x = Number(v); if (!Number.isFinite(x) || x < min || x > max || (int && !Number.isInteger(x))) throw new Fail(422, `${name} must be ${int ? 'a whole number' : 'a number'} between ${min} and ${max.toLocaleString('en-US')}.`); return x; };
const day = (v, name) => { const s = String(v || '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Fail(422, `Give ${name} as a date.`); return s; };
const optDay = (v, name) => (v ? day(v, name) : '');

module.exports = { base, R, E, A, N, can, Fail, wrap, ctxOf, isOfficer, canRequest, onOffice, onRequest, sole, getCfg, putCfg, today, numbered, trail, key, sha, money, tellAdmins, tellPerson, separate, num, day, optDay, oid, sid, who, bad, clean, pg, isDup };
