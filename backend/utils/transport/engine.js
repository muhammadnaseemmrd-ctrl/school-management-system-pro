// Pure rules for school transport (PRD E22): settings, school-clock times, stop times, ETA and onboard reconciliation. Nothing here touches the database.
const { nowInTz } = require('../time');

const DEFAULT_CHECKLIST = [
  { key: 'tyres', label: 'Tyres and wheel nuts look safe', critical: true },
  { key: 'brakes', label: 'Brakes work', critical: true },
  { key: 'lights', label: 'Lights, indicators and horn work', critical: true },
  { key: 'doors', label: 'Doors and emergency exit open and close', critical: true },
  { key: 'seats', label: 'Seats and seat belts are fixed and clean', critical: false },
  { key: 'firstaid', label: 'First-aid kit and fire extinguisher on board', critical: false },
  { key: 'fuel', label: 'Enough fuel for the whole run', critical: false },
  { key: 'phone', label: 'Driver phone charged and working', critical: false },
];
const DEFAULT_INSPECTION = [
  { key: 'brakes', label: 'Brakes and brake fluid', critical: true },
  { key: 'tyres', label: 'Tyres, spare and wheel nuts', critical: true },
  { key: 'steering', label: 'Steering and suspension', critical: true },
  { key: 'lights', label: 'Lights, indicators, reflectors', critical: true },
  { key: 'exits', label: 'Doors, emergency exit and window latches', critical: true },
  { key: 'belts', label: 'Seat belts and seat mounts', critical: true },
  { key: 'extinguisher', label: 'Fire extinguisher in date', critical: true },
  { key: 'firstaid', label: 'First-aid kit stocked', critical: false },
  { key: 'engine', label: 'Engine, oil, coolant and exhaust', critical: false },
  { key: 'body', label: 'Body, floor and mirrors', critical: false },
  { key: 'camera', label: 'Cameras or reverse alarm (if fitted)', critical: false },
];
const DEFAULTS = {
  lateNoticeMin: 10,          // tell families when the run is this late at their stop
  approachNotice: true,       // tell families when the bus reaches their stop
  earliestStartMin: 60,       // a trip may start this long before the planned time
  latestStartMin: 180,        // and this long after it, before it counts as missed
  staleActiveHours: 6,        // an active trip older than this is closed by the daily sweep and flagged
  pingMinSeconds: 5,          // positions closer together than this are ignored
  incidentPingDays: 14,       // positions kept this long only when an incident needs them
  inspectionEveryDays: 30,    // a vehicle is due for inspection this often
  documentWarnDays: 30,       // warn this long before fitness, insurance or licence expiry
  checklist: DEFAULT_CHECKLIST,
  inspection: DEFAULT_INSPECTION,
};
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const items = (arr, d) => (Array.isArray(arr) && arr.length ? arr.slice(0, 40).map((x, i) => ({ key: String(x.key || `i${i}`).replace(/[^a-z0-9_]/gi, '').slice(0, 24) || `i${i}`, label: String(x.label || '').trim().slice(0, 120), critical: !!x.critical })).filter((x) => x.label) : d);
function merge(patch = {}) {
  const p = patch || {};
  const out = {
    lateNoticeMin: clampInt(p.lateNoticeMin, 3, 120, DEFAULTS.lateNoticeMin), approachNotice: p.approachNotice === undefined ? DEFAULTS.approachNotice : !!p.approachNotice,
    earliestStartMin: clampInt(p.earliestStartMin, 5, 240, DEFAULTS.earliestStartMin), latestStartMin: clampInt(p.latestStartMin, 15, 600, DEFAULTS.latestStartMin),
    staleActiveHours: clampInt(p.staleActiveHours, 1, 24, DEFAULTS.staleActiveHours), pingMinSeconds: clampInt(p.pingMinSeconds, 1, 120, DEFAULTS.pingMinSeconds),
    incidentPingDays: clampInt(p.incidentPingDays, 1, 90, DEFAULTS.incidentPingDays), inspectionEveryDays: clampInt(p.inspectionEveryDays, 7, 365, DEFAULTS.inspectionEveryDays),
    documentWarnDays: clampInt(p.documentWarnDays, 1, 120, DEFAULTS.documentWarnDays),
    checklist: items(p.checklist, DEFAULT_CHECKLIST), inspection: items(p.inspection, DEFAULT_INSPECTION),
  };
  return out;
}

/* ── dates and school-clock times ── */
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const mins = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const addDays = (key, n) => new Date(new Date(`${key}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const weekday = (key) => new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 Sunday
// The instant when the school's clock shows `minutes` after midnight on `dateKey`
function localToUtc(dateKey, minutes, tz = 'UTC') {
  const base = new Date(`${dateKey}T00:00:00Z`).getTime() + minutes * 60000;
  let t = base;
  for (let i = 0; i < 3; i += 1) {
    const got = nowInTz(tz, new Date(t)); const gotMs = new Date(`${got.dateKey}T00:00:00Z`).getTime() + got.minutes * 60000;
    const diff = base - gotMs; if (!diff) break; t += diff;
  }
  return new Date(t);
}

/* ── stops of one run ── */
// stops: [{ _id, name, seq, offsetMin, lat, lng }] in morning order. Morning: first stop at the start time, school at start + duration.
// Afternoon: the bus leaves school at the start time and drops in the reverse order, the first stop of the morning being the last drop.
function runStops(stops, direction, startAt, durationMin) {
  const live = stops.filter((s) => s.active !== false).sort((a, b) => a.seq - b.seq);
  const maxOff = live.length ? Math.max(...live.map((s) => s.offsetMin || 0)) : 0;
  const span = Math.max(durationMin, maxOff);
  const base = startAt.getTime();
  const ordered = direction === 'morning' ? live : live.slice().reverse();
  return ordered.map((s, i) => ({
    stopId: s._id, name: s.name, seq: i + 1, lat: s.lat ?? null, lng: s.lng ?? null,
    plannedAt: new Date(base + (direction === 'morning' ? (s.offsetMin || 0) : (span - (s.offsetMin || 0))) * 60000),
  }));
}

/* ── distance and ETA ── */
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) {
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
const has = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== null && p.lng !== null;
// How far behind the plan the run is, in minutes (positive = late). Uses the last stop reached, or the start if none yet.
function delayMinutes(trip, now = new Date()) {
  const stops = trip.stops || [];
  const reached = stops.filter((s) => s.arrivedAt).sort((a, b) => new Date(b.arrivedAt) - new Date(a.arrivedAt))[0];
  let d;
  if (reached) d = (new Date(reached.arrivedAt) - new Date(reached.plannedAt)) / 60000;
  else if (trip.startedAt) d = (new Date(trip.startedAt) - new Date(trip.plannedStart)) / 60000;
  else d = 0;
  // a stop that is overdue and not yet reached makes the run at least that late
  const next = stops.find((s) => !s.arrivedAt);
  if (next && now > new Date(next.plannedAt)) d = Math.max(d, (now - new Date(next.plannedAt)) / 60000);
  return Math.round(d);
}
// ETA to every stop not yet reached. With a position and stop coordinates the estimate follows the remaining road at the speed the bus has been making;
// without them it is the plan moved by the delay so far. Always an estimate: families are shown "about".
function etas(trip, now = new Date(), speedKmh = 0) {
  const stops = trip.stops || []; const delay = delayMinutes(trip, now);
  const out = {}; const pos = trip.lastPos && has(trip.lastPos) ? trip.lastPos : null;
  let cursor = pos; let t = now.getTime(); const v = Math.max(15, Math.min(60, speedKmh || 30));
  let useGeo = !!pos;
  for (const s of stops) {
    if (s.arrivedAt) continue;
    if (useGeo && has(s)) {
      const dist = km(cursor, s) * 1.3; t += (dist / v) * 3600000 + 60000; cursor = s;
      out[String(s.stopId)] = new Date(Math.max(t, now.getTime())).toISOString();
    } else {
      useGeo = false;
      out[String(s.stopId)] = new Date(Math.max(new Date(s.plannedAt).getTime() + Math.max(0, delay) * 60000, now.getTime())).toISOString();
    }
  }
  return { delayMin: delay, etaByStop: out };
}
// A position from a phone is only accepted when it is plausible
function checkPing(p, now = new Date()) {
  const lat = Number(p?.lat); const lng = Number(p?.lng); const sp = Number(p?.speedKmh ?? 0); const at = p?.at ? new Date(p.at) : now;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, why: 'position' };
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + 120000 || at.getTime() < now.getTime() - 6 * 3600000) return { ok: false, why: 'time' };
  if (!Number.isFinite(sp) || sp < 0 || sp > 160) return { ok: false, why: 'speed' };
  return { ok: true, lat, lng, speedKmh: Math.round(sp), at };
}

/* ── boarding ── */
const ONBOARD = new Set(['boarded']);
const GONE = new Set(['alighted', 'no_show', 'opted_out', 'absent']);
// Who is still on the bus and who has not been accounted for
function reconcile(boards) {
  const c = { expected: 0, boarded: 0, alighted: 0, noShow: 0, optedOut: 0, absent: 0, exceptions: 0 };
  for (const b of boards) {
    if (b.state === 'expected') c.expected += 1; else if (b.state === 'boarded') c.boarded += 1; else if (b.state === 'alighted') c.alighted += 1;
    else if (b.state === 'no_show') c.noShow += 1; else if (b.state === 'opted_out') c.optedOut += 1; else if (b.state === 'absent') c.absent += 1;
    if (b.state === 'exception' || (b.exception && b.exception.kind && !b.exception.resolved)) c.exceptions += 1;
  }
  return c;
}
// Can the trip be closed? Everyone who boarded must have got off; a driver who still cannot account for a child must say why and the school is told.
function canClose(boards, trip, { emptyChecked, reason } = {}) {
  const onboard = boards.filter((b) => ONBOARD.has(b.state)).length;
  const waiting = boards.filter((b) => b.state === 'expected').length;
  if (!emptyChecked) return { ok: false, code: 'empty_check', message: 'Walk through the bus and confirm it is empty before ending the trip.' };
  if ((onboard || waiting) && !String(reason || '').trim()) return { ok: false, code: 'unreconciled', onboard, waiting, message: `${onboard} child(ren) are still marked on board and ${waiting} were not marked at all. Account for them, or write why the trip is ending with children unaccounted for.` };
  return { ok: true, onboard, waiting };
}
// Who may receive a child at the stop
const HANDOFF_KINDS = ['guardian', 'authorised', 'school', 'self'];

/* ── plate and phone keys ── */
const plateKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const phoneKey = (s) => String(s || '').replace(/\D/g, '').replace(/^0+/, '').replace(/^92/, '');

module.exports = { DEFAULTS, DEFAULT_CHECKLIST, DEFAULT_INSPECTION, merge, isDay, isTime, mins, addDays, weekday, localToUtc, runStops, km, delayMinutes, etas, checkPing, reconcile, canClose, HANDOFF_KINDS, plateKey, phoneKey };
