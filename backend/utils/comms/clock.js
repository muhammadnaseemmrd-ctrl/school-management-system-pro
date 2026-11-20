// The school's clock: quiet hours and working-hours deadlines (PRD E20). Everything is judged in the school's own time zone.
const { nowInTz, DAY } = require('../time');
const School = require('../../models/School');

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const mins = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const addDay = (key, n) => { const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const tzCache = new Map();
async function tzOf(schoolId) {
  const k = String(schoolId); const hit = tzCache.get(k);
  if (hit && Date.now() - hit.at < 60000) return hit.tz;
  const s = await School.findById(schoolId).select('timezone');
  const tz = (s && s.timezone) || process.env.DEFAULT_TIMEZONE || 'UTC'; tzCache.set(k, { tz, at: Date.now() }); return tz;
}
const offsetMin = (tz, date) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(date.getTime() / 1000) * 1000) / 60000;
};
// The instant when the school's clock shows `minutes` after midnight on `dayKey`
function localToDate(tz, dayKey, minutes) {
  const [y, m, d] = dayKey.split('-').map(Number); const guess = Date.UTC(y, m - 1, d) + minutes * 60000;
  const o1 = offsetMin(tz, new Date(guess)); const first = guess - o1 * 60000; const o2 = offsetMin(tz, new Date(first));
  return new Date(guess - o2 * 60000);
}

/* ── quiet hours ── */
const inWin = (m, from, to) => (from === to ? false : from < to ? m >= from && m < to : m >= from || m < to);
// When the person may next be pushed, or null when they may be pushed now. `windows` is every window that applies (the school's and the person's).
function quietUntil(at, windows, tz) {
  const ws = windows.filter((w) => w && HM.test(w.from) && HM.test(w.to)); if (!ws.length) return null;
  let cur = new Date(at); let moved = false;
  for (let i = 0; i < 4; i += 1) {
    const p = nowInTz(tz, cur); const hit = ws.find((w) => inWin(p.minutes, mins(w.from), mins(w.to)));
    if (!hit) return moved ? cur : null;
    const f = mins(hit.from); const t = mins(hit.to); const nextDay = f > t && p.minutes >= f;
    cur = localToDate(tz, nextDay ? addDay(p.dateKey, 1) : p.dateKey, t); moved = true;
  }
  return cur;
}

/* ── working hours ── */
const workCfg = (s) => ({ days: s.workDays || [1, 2, 3, 4, 5, 6], open: mins(s.hours?.from || '08:00'), close: mins(s.hours?.to || '15:00') });
// The instant `minutes` of working time after `start`
function addBusinessMinutes(start, minutes, settings, tz) {
  const c = workCfg(settings); let cur = new Date(start); let left = Math.max(0, Math.round(minutes));
  if (!left) return cur;
  for (let i = 0; i < 800 && left > 0; i += 1) {
    const p = nowInTz(tz, cur);
    if (c.days.includes(DAY.indexOf(p.dayName)) && p.minutes < c.close) {
      const from = Math.max(p.minutes, c.open); const avail = c.close - from;
      if (left <= avail) return localToDate(tz, p.dateKey, from + left);
      left -= avail;
    }
    cur = localToDate(tz, addDay(p.dateKey, 1), 0);
  }
  return cur;
}
// Working minutes between two instants
function businessMinutesBetween(a, b, settings, tz) {
  const c = workCfg(settings); const end = new Date(b); let cur = new Date(a); let total = 0;
  if (end <= cur) return 0;
  const endP = nowInTz(tz, end);
  for (let i = 0; i < 800 && cur < end; i += 1) {
    const p = nowInTz(tz, cur);
    if (c.days.includes(DAY.indexOf(p.dayName))) {
      const to = Math.min(c.close, p.dateKey === endP.dateKey ? endP.minutes : 1440); const from = Math.max(p.minutes, c.open);
      if (to > from) total += to - from;
    }
    if (p.dateKey === endP.dateKey) break;
    cur = localToDate(tz, addDay(p.dateKey, 1), 0);
  }
  return total;
}
const fmtWhen = (tz, d, lang = 'en') => new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

module.exports = { HM, mins, addDay, tzOf, localToDate, quietUntil, addBusinessMinutes, businessMinutesBetween, fmtWhen, inWin };
