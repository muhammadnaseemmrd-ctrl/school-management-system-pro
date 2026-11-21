// Results kept and handed on (PRD E25): exceptions, saved runs, scheduled reports and the jobs that follow from a slipping measure.
const S = require('./service');
const C = require('./catalog');
const AnRun = require('../../models/AnRun'); const AnSchedule = require('../../models/AnSchedule'); const AnAction = require('../../models/AnAction');
const User = require('../../models/User'); const Teacher = require('../../models/Teacher');

const { Fail } = S;
const scopeKeyOf = (sc) => `${sc.level}|${sc.key}`;
const linkFor = (role) => (role === 'admin' ? '/admin#/analytics' : '/teacher#/analytics');
const fmt = (def, v) => (v === null || v === undefined ? '—' : `${v}%`);

/* ───────── exceptions: where a measure has crossed a line the school set ───────── */
const severity = (v, a) => {
  if ((a.criticalBelow !== undefined && v < a.criticalBelow) || (a.criticalAbove !== undefined && v > a.criticalAbove)) return 'critical';
  if ((a.below !== undefined && v < a.below) || (a.above !== undefined && v > a.above)) return 'warn';
  return null;
};
const lineOf = (v, a, sev) => { if (sev === 'critical') return a.criticalBelow !== undefined && v < a.criticalBelow ? `below ${a.criticalBelow}%` : `above ${a.criticalAbove}%`; return a.below !== undefined && v < a.below ? `below ${a.below}%` : `above ${a.above}%`; };
const distance = (v, a) => Math.max(a.below !== undefined ? a.below - v : -Infinity, a.above !== undefined ? v - a.above : -Infinity);
function exceptionsOf(def, res) {
  const a = res.alert || {}; if (!Object.keys(a).length) return [];
  const out = [];
  const one = (level, g, v) => { const sev = severity(v, a); if (!sev) return; out.push({ metricKey: def.key, name: def.name, level, groupKey: g?.key || '', groupLabel: g?.label || '', value: v, severity: sev, line: lineOf(v, a, sev), message: `${def.name}${g ? ` for ${g.label}` : ''} is ${v}%, ${lineOf(v, a, sev)}.`, dist: distance(v, a) }); };
  if (!res.total.suppressed && res.total.value !== null) one('total', null, res.total.value);
  const gs = (res.groups || []).filter((g) => !g.suppressed && g.value !== null).map((g) => ({ g, sev: severity(g.value, a) })).filter((x) => x.sev).sort((x, y) => (x.sev === y.sev ? distance(y.g.value, a) - distance(x.g.value, a) : x.sev === 'critical' ? -1 : 1)).slice(0, 5);
  for (const { g } of gs) one('group', g, g.value);
  return out.map(({ dist, ...rest }) => rest);
}

/* ───────── measuring a set of measures for one viewer ───────── */
async function evaluate(schoolId, user, { keys, from, to, groupBy = 'none' }) {
  const scope = await S.scopeFor(user); if (!scope) throw new Fail(403, 'You cannot use analytics.');
  const defs = await C.definitions(schoolId); const today = await S.today(schoolId);
  const want = keys && keys.length ? keys : [...defs.keys()]; const results = []; const hidden = []; const exceptions = [];
  for (const key of want) {
    const def = defs.get(key); if (!def) { hidden.push({ key, name: key, why: 'This measure does not exist or has been retired.' }); continue; }
    const ok = C.canSee(def, scope); if (!ok.ok) { hidden.push({ key, name: def.name, why: ok.why }); continue; }
    const res = await C.measure(schoolId, def, { from, to, groupBy, scope, today }); results.push(res); exceptions.push(...exceptionsOf(def, res));
  }
  const sev = { critical: 0, warn: 1 }; exceptions.sort((a, b) => sev[a.severity] - sev[b.severity] || (a.level === 'total' ? -1 : 1));
  return { results, hidden, exceptions, scope };
}

/* ───────── saved runs ───────── */
async function saveRun({ schoolId, user, actor, kind, title, from, to, groupBy, keys, scheduleId = null, periodKey = '', viewerIds = [] }) {
  const ev = await evaluate(schoolId, user, { keys, from, to, groupBy });
  const body = { schoolId: S.oid(schoolId), scheduleId: scheduleId ? S.oid(scheduleId) : null, kind, title: String(title || '').slice(0, 120), periodKey, scopeKey: scopeKeyOf(ev.scope), level: ev.scope.level, from, to, groupBy,
    results: ev.results, exceptions: ev.exceptions, hidden: ev.hidden, measureCount: ev.results.length, exceptionCount: ev.exceptions.length, urgentCount: ev.exceptions.filter((e) => e.severity === 'critical').length, viewerIds: viewerIds.map(S.oid).filter(Boolean), createdById: actor?.id || null, createdByName: actor?.name || 'System', hash: S.sha(JSON.stringify([ev.results, ev.exceptions])) };
  try { return { run: await AnRun.create(body), created: true }; } catch (e) {
    if (S.R.isDup(e) && scheduleId) return { run: await AnRun.findOne({ schoolId: body.schoolId, scheduleId: body.scheduleId, periodKey, scopeKey: body.scopeKey }), created: false };
    throw e;
  }
}
// who may open a saved run: the people it was made for, its maker, and any administrator who sees the whole school
async function canOpen(user, run) {
  if (!run || String(run.schoolId) !== String(user.schoolId)) return false;
  const me = String(user.userId);
  if (String(run.createdById) === me || (run.viewerIds || []).some((v) => String(v) === me)) return true;
  const sc = await S.scopeFor(user); return !!sc && sc.level === 'admin' && !sc.limited;
}

/* ───────── scheduled reports ───────── */
function rulePeriod(rule, runDate) {
  if (rule === 'last_full_month') { const ym = S.addMonths(S.ymOf(runDate), -1); return { from: `${ym}-01`, to: S.lastDayOf(ym) }; }
  const to = S.addDays(runDate, -1);
  if (rule === 'last_30_days') return { from: S.addDays(to, -29), to };
  if (rule === 'month_to_date') return { from: `${S.ymOf(to)}-01`, to };
  return { from: S.addDays(to, -6), to };
}
// the first due day after (or on) `from`
function nextDue(s, from, inclusive = false) {
  let d = inclusive ? from : S.addDays(from, 1);
  for (let i = 0; i < 62; i += 1) { const x = new Date(`${d}T00:00:00Z`); if (s.cadence === 'weekly' ? x.getUTCDay() === s.dow : x.getUTCDate() === s.dom) return d; d = S.addDays(d, 1); }
  return d;
}
const periodKeyOf = (s, runDate) => (s.cadence === 'weekly' ? S.isoWeek(runDate) : S.ymOf(runDate));
async function recipientUsers(schoolId, schedule) {
  const out = [];
  for (const r of schedule.recipients || []) {
    const M = r.role === 'admin' ? User : Teacher; const row = await M.findOne({ _id: r.userId, schoolId: S.oid(schoolId) }).select('name isActive role').lean();
    if (!row || row.isActive === false || (r.role === 'admin' && row.role !== 'admin')) continue;
    out.push({ id: String(r.userId), role: r.role, name: row.name || r.name, user: { role: r.role, userId: String(r.userId), schoolId: String(schoolId) } });
  }
  return out;
}
// one run per distinct view (level + classes), shared by the people who see the same thing
async function runSchedule(schedule, runDate, { actor = null } = {}) {
  const schoolId = String(schedule.schoolId); const rec = await recipientUsers(schoolId, schedule);
  if (!rec.length) throw new Fail(409, 'None of the people on this report can be reached any more.');
  const { from, to } = rulePeriod(schedule.periodRule, runDate); const periodKey = periodKeyOf(schedule, runDate);
  const views = new Map();
  for (const r of rec) { const sc = await S.scopeFor(r.user); if (!sc) continue; const k = scopeKeyOf(sc); if (!views.has(k)) views.set(k, []); views.get(k).push(r); }
  const made = [];
  for (const [, people] of views) {
    const { run, created } = await saveRun({ schoolId, user: people[0].user, actor, kind: 'scheduled', title: schedule.name, from, to, groupBy: schedule.groupBy, keys: schedule.metrics, scheduleId: schedule._id, periodKey, viewerIds: people.map((p) => p.id) });
    made.push(run);
    if (created) for (const role of ['admin', 'teacher']) {
      const to2 = people.filter((p) => p.role === role).map((p) => ({ id: p.id, role })); if (!to2.length) continue;
      const crit = run.exceptions.filter((e) => e.severity === 'critical').length; const warn = run.exceptions.length - crit;
      await S.tell(schoolId, to2, `Report ready: ${schedule.name}`, run.exceptions.length ? `${crit ? `${crit} urgent, ` : ''}${warn} to look at. ${from} to ${to}.` : `Nothing needs attention. ${from} to ${to}.`, linkFor(role), `an:run:${run._id}`);
    }
  }
  return made;
}
async function sweep(schoolId) {
  const today = await S.today(schoolId); const out = { ran: 0, failed: 0, reminded: 0 };
  for (const s of await AnSchedule.find({ schoolId: S.oid(schoolId), active: true, nextDate: { $lte: today } }).limit(50)) {
    let err = '';
    try { const runs = await runSchedule(s, today); out.ran += runs.length; } catch (e) { err = e instanceof Fail ? e.message : 'The report could not be run.'; if (!(e instanceof Fail)) console.error('analytics schedule:', e); out.failed += 1; }
    await AnSchedule.updateOne({ _id: s._id, nextDate: s.nextDate }, { $set: { nextDate: nextDue(s, today), lastRunDate: today, lastError: err } });
  }
  // an open job past its date: its owner is told once
  for (const t of await AnAction.find({ schoolId: S.oid(schoolId), status: 'open', dueOn: { $lt: today }, overdueNoticeOn: '' }).limit(200)) {
    const claim = await AnAction.updateOne({ _id: t._id, overdueNoticeOn: '' }, { $set: { overdueNoticeOn: today } }); if (!claim.matchedCount) continue;
    await S.tell(schoolId, [{ id: String(t.ownerId), role: t.ownerRole }], 'A job is overdue', `"${t.title}" was due ${t.dueOn}.`, linkFor(t.ownerRole), `an:late:${t._id}`); out.reminded += 1;
  }
  return out;
}

module.exports = { exceptionsOf, evaluate, saveRun, canOpen, rulePeriod, nextDue, periodKeyOf, runSchedule, sweep, scopeKeyOf, linkFor, severity };
