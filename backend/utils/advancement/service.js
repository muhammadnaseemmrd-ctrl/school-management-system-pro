// Shared pieces of alumni, giving and quality work (PRD E32).
const crypto = require('crypto');
const S = require('../analytics/service');
const DocCounter = require('../../models/DocCounter');
const vault = require('../integrations/vault');
const { can } = require('../permissions');
const { audit } = require('../audit');

const { Fail, oid, sid } = S;
const wide = async (user) => !(await S.CS.scopeOf(user));
// administrators of the whole school, or a teacher with the matching grant. Campus-limited administrators are not enough: these records are school-wide.
const guard = (perm) => async (req, res, next) => {
  try {
    if (req.user.role === 'admin') { if (await wide(req.user)) return next(); return S.bad(res, 403, 'This is kept for the whole school. Ask a school-wide administrator.'); }
    if (req.user.role === 'teacher' && (await can(req.user, perm)).allowed) return next();
    return S.bad(res, 403, 'You cannot use this.');
  } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};
const adminWide = async (req, res, next) => { try { if (req.user.role === 'admin' && (await wide(req.user))) return next(); return S.bad(res, 403, 'Only a school-wide administrator can do this.'); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const staff = (req, res, next) => (['admin', 'teacher'].includes(req.user.role) ? next() : S.bad(res, 403, 'This is for staff.'));
async function nextNo(schoolId, prefix) {
  const year = new Date().getUTCFullYear(); const key = `${prefix.toLowerCase()}-${year}`;
  let row = await DocCounter.findOne({ schoolId, key });
  if (!row) { try { row = await DocCounter.create({ schoolId, key, n: 0 }); } catch (e) { if (e.code !== 11000) throw e; row = await DocCounter.findOne({ schoolId, key }); } }
  for (let i = 0; i < 10; i++) { const r = await DocCounter.updateOne({ _id: row._id, n: row.n }, { $set: { n: row.n + 1 } }); if (r.matchedCount) return `${prefix}-${year}-${String(row.n + 1).padStart(5, '0')}`; row = await DocCounter.findOne({ _id: row._id }); }
  throw new Fail(503, 'Please try again in a moment.');
}
// a private link: only a hash is kept, and the first 8 characters find the row
const link = (kind) => { const secret = vault.token(18); const prefix = vault.token(6).replace(/[^A-Za-z0-9]/g, 'x').slice(0, 8); return { token: `${kind}_${prefix}_${secret}`, prefix, hash: vault.sha(secret) }; };
const parse = (token) => { const m = /^[a-z]+_([A-Za-z0-9]{8})_([A-Za-z0-9_-]{20,})$/.exec(String(token || '')); return m ? { prefix: m[1], hash: vault.sha(m[2]) } : null; };
const day = () => new Date().toISOString().slice(0, 10);
const isDay = S.isDay; const addMonths = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const addDays = S.addDays;
const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮]/g, '').replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const email = (v) => { const s = txt(v, 160).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : ''; };
const phone = (v) => { const s = txt(v, 30); return /^[+\d][\d\s-]{7,}$/.test(s) ? s : ''; };
const csvCell = (v) => { const s = String(v == null ? '' : v); const g = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return `"${g.replace(/"/g, '""')}"`; };
const note = (req, action, entityType, entityId, detail, schoolId) => audit(req, { action: `adv.${action}`, entityType, entityId, schoolId: schoolId || (req?.user ? sid(req) : null), detail });
const same = (a, b) => { const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || '')); return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y); };
const person = async (schoolId, id) => { if (!id) return null; const User = require('../../models/User'); const Teacher = require('../../models/Teacher'); let u = null; try { u = await User.findOne({ _id: oid(id), schoolId: oid(schoolId) }).select('name role isActive'); } catch (e) { return null; } if (u && u.isActive !== false) return { id: u._id, name: u.name, role: u.role }; try { const t = await Teacher.findOne({ _id: oid(id), schoolId: oid(schoolId) }).select('name'); if (t) return { id: t._id, name: t.name, role: 'teacher' }; } catch (e) { /* none */ } return null; };
const money = (n) => Math.round(Number(n) * 100) / 100;
const minCell = async (schoolId) => { try { const a = require('../analytics/catalog'); return (await require('../../models/AppSetting').findOne({ schoolId, key: 'analytics-settings' }))?.value?.minCell || a.MIN_CELL || 5; } catch (e) { return 5; } };
module.exports = { adminWide, same, person, money, S, Fail, oid, sid, wide, guard, staff, nextNo, link, parse, day, isDay, addMonths, addDays, txt, email, phone, csvCell, note, minCell, vault, can };
