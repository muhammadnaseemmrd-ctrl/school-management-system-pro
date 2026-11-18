// HR rules (PRD E07): dates, leave balances, payroll arithmetic. Whole PKR, dates as YYYY-MM-DD strings.
const mongoose = require('../lib/pgdoc');
const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
const dow = (s) => new Date(`${s}T00:00:00Z`).getUTCDay();
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const range = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) { out.push(d); if (out.length > 400) break; } return out; };
const workDays = (a, b) => range(a, b).filter((d) => dow(d) !== 0);                 // Sunday is the weekly day off
const monthBounds = (period) => { const [y, m] = period.split('-').map(Number); const from = `${period}-01`; const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); return { from, to }; };
const toMin = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : NaN; };
const overlap = (a1, a2, b1, b2) => toMin(a1) < toMin(b2) && toMin(b1) < toMin(a2);
const DEFAULTS = { annual: 14, sick: 8, casual: 10, overtimeMultiplier: 1.5, lateGraceMinutes: 10, maxAdvanceMultiple: 3 };
const CHECKLIST = { base: [['bank', 'Bank and contact details verified'], ['credentials', 'Identity and credentials checked'], ['access', 'Login or access card issued'], ['equipment', 'Equipment and uniform issued']], teacher: [['safeguarding', 'Safeguarding training completed']] };
const CLEARANCE = [['equipment', 'Equipment and uniform returned'], ['keys', 'Keys and access card returned'], ['library', 'Library books returned'], ['finance', 'Finance dues checked'], ['handover', 'Work handed over']];

// Annual tax from slabs: each band says fixed amount + rate on income above where the band starts
function slabTax(annual, slabs) {
  const s = [...(slabs || [])].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity)); let prev = 0;
  for (const b of s) { if (annual <= (b.upTo ?? Infinity)) return Math.round((b.fixed || 0) + ((b.ratePercent || 0) / 100) * Math.max(0, annual - prev)); prev = b.upTo ?? prev; }
  return 0;
}

module.exports = { oid, DAYNAMES, isDate, dow, todayStr, addDays, range, workDays, monthBounds, toMin, overlap, DEFAULTS, CHECKLIST, CLEARANCE, slabTax };
