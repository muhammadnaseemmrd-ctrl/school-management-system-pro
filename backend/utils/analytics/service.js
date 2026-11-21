// Shared pieces of analytics and outcome measures (PRD E25): who may see what, the school's clock, periods, notices.
const crypto = require('crypto');
const base = require('../early/service');
const R = require('../registrar/service');
const N = require('../notify');
const { can } = require('../permissions');
const CS = require('../campus');
const Class = require('../../models/Class');
const Teacher = require('../../models/Teacher');

const { oid, sid, who, bad, clean, pg } = base;
class Fail extends Error { constructor(code, message, extra = {}) { super(message); this.code = code; this.extra = extra; } }
const wrap = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof Fail) return bad(res, e.code, e.message, e.extra);
    console.error(`analytics ${name}:`, e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};
const ctxOf = (req) => ({ schoolId: sid(req), actor: who(req), role: req.user.role });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
const today = (schoolId) => base.today(schoolId);

/* ───────── who is looking, and at what ───────── */
// Levels: teacher (their own classes) < lead (a curriculum lead with a time-limited grant: the whole school, learning and attendance)
// < admin (everything; a campus administrator only sees the classes of their campuses).
const RANK = { teacher: 1, lead: 2, admin: 3 };
async function levelOf(user) {
  if (!user) return null;
  if (user.role === 'admin') return 'admin';
  if (user.role === 'teacher') return (await can(user, 'analytics.lead')).allowed ? 'lead' : 'teacher';
  return null;
}
// -> { level, classIds: null (whole school) | string[], key }
async function scopeFor(user) {
  const level = await levelOf(user); if (!level) return null;
  let classIds = null;
  if (level === 'admin') { const sc = await CS.scopeOf(user); if (sc) classIds = [...sc.classIds].sort(); }
  else if (level === 'teacher') {
    const schoolId = oid(user.schoolId); const mine = new Set();
    for (const c of await Class.find({ schoolId, classTeacherId: oid(user.userId) }).select('_id')) mine.add(String(c._id));
    const t = await Teacher.findOne({ _id: oid(user.userId), schoolId }).select('classIds subjectClassAssignments');
    for (const c of t?.classIds || []) mine.add(String(c)); for (const a of t?.subjectClassAssignments || []) if (a.classId) mine.add(String(a.classId));
    classIds = [...mine].sort();
  }
  return { level, classIds, key: classIds === null ? 'all' : `c:${sha(classIds.join(','))}`, limited: classIds !== null };
}
const guard = (min) => async (req, res, next) => {
  try { const lv = await levelOf(req.user); if (lv && RANK[lv] >= RANK[min]) return next(); return bad(res, 403, 'You cannot use analytics.'); }
  catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};
const onRead = guard('teacher'); const onAdmin = guard('admin');
// settings that change what everyone sees belong to an administrator of the whole school, not of one campus
const onWide = async (req, res, next) => {
  try { const sc = await scopeFor(req.user); if (sc && sc.level === 'admin' && !sc.limited) return next(); return bad(res, 403, sc && sc.level === 'admin' ? 'This is set for the whole school. Ask a school-wide administrator.' : 'You cannot use analytics.'); }
  catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};

/* ───────── dates ───────── */
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
const ymOf = (d) => d.slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + n, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };
const lastDayOf = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const isoWeek = (d) => { const x = new Date(`${d}T00:00:00Z`); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3); const y = x.getUTCFullYear(); const j = new Date(Date.UTC(y, 0, 4)); const w = 1 + Math.round(((x - j) / 86400000 - 3 + ((j.getUTCDay() + 6) % 7)) / 7); return `${y}-W${String(w).padStart(2, '0')}`; };
const MAX_DAYS = 400;
// { from, to } from a query: defaults to the last 30 days ending yesterday, never past today, never longer than 400 days
async function period(schoolId, q = {}) {
  const t = await today(schoolId);
  let to = q.to ? String(q.to) : addDays(t, -1); let from = q.from ? String(q.from) : addDays(to, -29);
  if (!isDay(from) || !isDay(to)) throw new Fail(422, 'Give the dates as YYYY-MM-DD.');
  if (to > t) to = t;
  if (from > to) throw new Fail(422, 'The start date is after the end date.');
  if (daysBetween(from, to) + 1 > MAX_DAYS) throw new Fail(422, `Choose at most ${MAX_DAYS} days.`);
  return { from, to, today: t };
}
const previous = ({ from, to }) => { const n = daysBetween(from, to) + 1; return { from: addDays(from, -n), to: addDays(from, -1) }; };

const text = (v, name, { min = 0, max = 300 } = {}) => { const s = String(v || '').trim(); if (s.length < min) throw new Fail(422, `${name} needs at least ${min} characters.`); return s.slice(0, max); };
const trail = (actor, action, note = '') => ({ at: new Date(), byName: actor?.name || '', action, note: String(note || '').slice(0, 300) });
const sole = (schoolId) => R.soleAdmin(schoolId);
// A different administrator must decide, unless the school has only one (then it is recorded as such).
async function separate(ctx, makerId, what) {
  if (String(makerId) !== String(ctx.actor.id)) return false;
  if (await sole(ctx.schoolId)) return true;
  throw new Fail(403, `${what} must be decided by someone other than the person who made it.`, { reason: 'maker_checker' });
}
const tell = async (schoolId, recipients, title, body, link, key = '') => { try { await N.notify({ schoolId, recipients, title, body, link, type: 'analytics', key }); } catch (e) { console.error('analytics notify:', e.message); } };

module.exports = { base, R, N, CS, Fail, wrap, ctxOf, RANK, levelOf, scopeFor, onRead, onAdmin, onWide, guard, isDay, addDays, daysBetween, ymOf, addMonths, lastDayOf, isoWeek, period, previous, today, text, trail, sole, separate, tell, sha, oid, sid, who, bad, clean, pg, MAX_DAYS };
