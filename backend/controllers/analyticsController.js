// Analytics and outcome measures (PRD E25): measures with stated numerators, denominators and role scope, versioned definitions,
// saved and scheduled reports, exceptions with owners, and an opt-in teacher time pulse.
const S = require('../utils/analytics/service');
const C = require('../utils/analytics/catalog');
const Rn = require('../utils/analytics/runs');
const Rp = require('../utils/analytics/reports');
const PDF = require('../utils/analytics/pdf');
const E = require('../utils/accounts/engine');
const { audit } = require('../utils/audit');
const AnMetric = require('../models/AnMetric'); const AnSchedule = require('../models/AnSchedule'); const AnRun = require('../models/AnRun'); const AnAction = require('../models/AnAction');
const User = require('../models/User'); const Teacher = require('../models/Teacher'); const School = require('../models/School'); const Class = require('../models/Class');
const { Fail, sid, wrap, ctxOf, oid } = S;
const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'analytics', entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const body = (req) => req.body || {};
const scopeOf = async (req) => { const sc = await S.scopeFor(req.user); if (!sc) throw new Fail(403, 'You cannot use analytics.'); return sc; };
const must = async (req, res, key) => {
  const defs = await C.definitions(sid(req)); const d = defs.get(key); if (!d) throw new Fail(404, 'This measure does not exist.');
  const ok = C.canSee(d, await scopeOf(req)); if (!ok.ok) throw new Fail(403, ok.why); return d;
};

/* ───────── who am I here, and what can I see ───────── */
exports.access = wrap('access', async (req, res) => {
  const sc = await scopeOf(req); const defs = await C.definitions(sid(req)); const visible = [...defs.values()].filter((d) => C.canSee(d, sc).ok);
  res.json({ level: sc.level, limited: sc.limited, classes: sc.classIds === null ? null : sc.classIds.length, measures: visible.length, groupBys: C.GROUPS, admin: sc.level === 'admin', today: await S.today(sid(req)) });
});
exports.catalog = wrap('catalog', async (req, res) => {
  const sc = await scopeOf(req); const defs = [...(await C.definitions(sid(req))).values()]; const visible = []; const hidden = [];
  for (const d of defs) { const ok = C.canSee(d, sc); if (ok.ok) visible.push(C.view(d)); else hidden.push({ key: d.key, name: d.name, domain: d.domain, why: ok.why }); }
  res.json({ measures: visible, hidden });
});

/* ───────── measuring ───────── */
exports.measure = wrap('measure', async (req, res) => {
  const d = await must(req, res, req.params.key); const sc = await scopeOf(req); const p = await S.period(sid(req), req.query); const groupBy = String(req.query.groupBy || 'none');
  const cur = await C.measure(sid(req), d, { from: p.from, to: p.to, groupBy, scope: sc, today: p.today }); const pv = S.previous(p);
  const prev = await C.measure(sid(req), d, { from: pv.from, to: pv.to, groupBy: 'none', scope: sc, today: pv.to });
  res.json({ ...cur, definition: C.view(d), previous: { from: pv.from, to: pv.to, value: prev.total.value, suppressed: prev.total.suppressed }, change: cur.total.value !== null && prev.total.value !== null ? C.r1(cur.total.value - prev.total.value) : null, exceptions: Rn.exceptionsOf(d, cur) });
});
exports.overview = wrap('overview', async (req, res) => {
  const sc = await scopeOf(req); const p = await S.period(sid(req), req.query); const groupBy = String(req.query.groupBy || 'class');
  const ev = await Rn.evaluate(sid(req), req.user, { from: p.from, to: p.to, groupBy: C.GROUPS.includes(groupBy) ? groupBy : 'class' }); const pv = S.previous(p);
  const prevEv = await Rn.evaluate(sid(req), req.user, { from: pv.from, to: pv.to, groupBy: 'none' }); const pm = new Map(prevEv.results.map((r) => [r.key, r]));
  const defs = await C.definitions(sid(req));
  const results = ev.results.map((r) => { const o = pm.get(r.key); return { ...r, definition: C.view(defs.get(r.key)), previousValue: o && !o.total.suppressed ? o.total.value : null, change: o && !o.total.suppressed && r.total.value !== null && o.total.value !== null ? C.r1(r.total.value - o.total.value) : null }; });
  const q = { schoolId: oid(sid(req)), status: 'open' }; if (sc.level !== 'admin') q.ownerId = oid(req.user.userId);
  const jobs = await AnAction.find(q).sort({ dueOn: 1 }).limit(8); const today = p.today;
  res.json({ from: p.from, to: p.to, previous: pv, level: sc.level, results, hidden: ev.hidden, exceptions: ev.exceptions, jobs: jobs.map((j) => jobView(j, today)), openJobs: await AnAction.countDocuments(q) });
});

/* ───────── definitions ───────── */
const defRow = (d, doc) => ({ ...C.view(d), pending: doc ? doc.versions.find((v) => v.status === 'pending') || null : null, retired: !!doc?.retired, history: doc ? doc.versions.map((v) => ({ version: v.version, status: v.status, reason: v.reason, madeByName: v.madeByName, madeAt: v.madeAt, decidedByName: v.decidedByName, decidedAt: v.decidedAt, decisionNote: v.decisionNote, soleAdmin: v.soleAdmin, params: v.params, alert: v.alert, target: v.target, minCell: v.minCell, minLevel: v.minLevel, name: v.name, filters: v.filters })).reverse() : [] });
exports.definitions = wrap('definitions', async (req, res) => {
  const defs = await C.definitions(sid(req), { includeRetired: true }); const docs = new Map((await AnMetric.find({ schoolId: oid(sid(req)) }).lean()).map((d) => [d.key, d]));
  const out = [...defs.values()].map((d) => defRow(d, docs.get(d.key)));
  for (const doc of docs.values()) if (doc.custom && !defs.has(doc.key) && C.BY_KEY.has(doc.baseKey)) out.push({ ...defRow(C.build(C.BY_KEY.get(doc.baseKey), { ...doc, published: 0 }), doc), key: doc.key, custom: true, name: doc.versions[0]?.name || 'New measure', version: 0, awaiting: true });
  res.json({ measures: out.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name)) });
});
async function proposeVersion(req, doc, base, custom) {
  const b = body(req); const reason = S.text(b.reason, 'The reason', { min: 5, max: 300 }); const v = C.cleanDraft(base, b, { custom });
  if (custom || doc.custom) { v.name = S.text(b.name, 'The name', { min: 3, max: 80 }); if (v.filters.subjectIds.length && base.domain !== 'Learning') throw new Fail(422, 'Only learning measures can be narrowed to subjects.'); }
  const next = (doc.counter || 0) + 1; const a = ctxOf(req).actor;
  return { version: next, status: 'pending', ...v, reason, madeById: a.id, madeByName: a.name, madeAt: new Date() };
}
exports.createCustom = wrap('createCustom', async (req, res) => {
  const base = C.BY_KEY.get(String(body(req).baseKey || '')); if (!base) throw new Fail(422, 'Choose the measure to narrow.');
  if (await AnMetric.countDocuments({ schoolId: oid(sid(req)), custom: true, retired: false }) >= 40) throw new Fail(409, 'This school already has 40 custom measures.');
  const v = await proposeVersion(req, { counter: 0 }, base, true); const key = `c_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const doc = await AnMetric.create({ schoolId: oid(sid(req)), key, custom: true, baseKey: base.key, counter: 1, versions: [v] }); await A(req, 'analytics.measure.propose', key, v.name);
  await S.tell(sid(req), (await require('../utils/notify').admins(sid(req))).filter((r) => String(r.id) !== String(req.user.userId)), 'A measure is waiting for approval', `${v.name}: made by ${v.madeByName}.`, '/admin#/analytics', `an:def:${key}:1`);
  res.status(201).json({ key, version: 1, status: 'pending' });
});
exports.proposeDefinition = wrap('proposeDefinition', async (req, res) => {
  const key = req.params.key; let doc = await AnMetric.findOne({ schoolId: oid(sid(req)), key }); const builtin = C.BY_KEY.get(key);
  if (!doc && !builtin) throw new Fail(404, 'This measure does not exist.');
  if (doc?.retired) throw new Fail(409, 'This measure has been retired.');
  if (!doc) doc = await AnMetric.create({ schoolId: oid(sid(req)), key, custom: false, baseKey: key, counter: 0, versions: [] });
  if (doc.versions.some((v) => v.status === 'pending')) throw new Fail(409, 'A change is already waiting for approval. Decide it first.', { reason: 'pending' });
  const base = C.BY_KEY.get(doc.baseKey); const v = await proposeVersion(req, doc, base, false);
  const r = await AnMetric.updateOne({ _id: doc._id, counter: doc.counter || 0 }, { $set: { counter: v.version }, $push: { versions: v } }); if (!r.matchedCount) throw new Fail(409, 'Someone else just changed this measure. Try again.');
  await A(req, 'analytics.measure.propose', key, v.reason);
  await S.tell(sid(req), (await require('../utils/notify').admins(sid(req))).filter((x) => String(x.id) !== String(req.user.userId)), 'A measure change is waiting for approval', `${base.name}: ${v.reason}`, '/admin#/analytics', `an:def:${key}:${v.version}`);
  res.status(201).json({ key, version: v.version, status: 'pending' });
});
exports.decideDefinition = wrap('decideDefinition', async (req, res) => {
  const key = req.params.key; const doc = await AnMetric.findOne({ schoolId: oid(sid(req)), key }); const pend = doc?.versions.find((v) => v.status === 'pending');
  if (!pend) throw new Fail(404, 'Nothing is waiting for approval.'); const ctx = ctxOf(req); const approve = body(req).approve === true;
  const note = S.text(body(req).note, 'The note', { min: approve ? 0 : 5, max: 300 }); const sole = await S.separate(ctx, pend.madeById, 'A change to a measure');
  const versions = doc.versions.map((v) => (v.version === pend.version ? { ...(v.toObject ? v.toObject() : v), status: approve ? 'published' : 'rejected', decidedById: ctx.actor.id, decidedByName: ctx.actor.name, decidedAt: new Date(), decisionNote: note, soleAdmin: sole }
    : approve && v.status === 'published' ? { ...(v.toObject ? v.toObject() : v), status: 'superseded' } : v));
  const r = await AnMetric.updateOne({ _id: doc._id, 'versions.version': pend.version }, { $set: { versions: versions, published: approve ? pend.version : doc.published } }); if (!r.matchedCount) throw new Fail(409, 'Someone else just decided this. Reload.');
  await A(req, `analytics.measure.${approve ? 'publish' : 'reject'}`, key, note);
  await S.tell(sid(req), [{ id: String(pend.madeById), role: 'admin' }], approve ? 'Measure change approved' : 'Measure change turned down', `${pend.name || C.BY_KEY.get(doc.baseKey)?.name}${note ? `: ${note}` : ''}`, '/admin#/analytics');
  res.json({ key, version: pend.version, status: approve ? 'published' : 'rejected', soleAdmin: sole });
});
exports.retire = wrap('retire', async (req, res) => {
  const doc = await AnMetric.findOne({ schoolId: oid(sid(req)), key: req.params.key }); if (!doc || !doc.custom) throw new Fail(404, 'Only a custom measure can be retired.');
  const reason = S.text(body(req).reason, 'The reason', { min: 5, max: 300 }); await AnMetric.updateOne({ _id: doc._id }, { $set: { retired: true, retiredReason: reason, retiredAt: new Date() } });
  const sch = await AnSchedule.find({ schoolId: oid(sid(req)), active: true, metrics: doc.key }); for (const s of sch) await AnSchedule.updateOne({ _id: s._id }, { $set: { metrics: s.metrics.filter((m) => m !== doc.key) } });
  await A(req, 'analytics.measure.retire', doc.key, reason); res.json({ key: doc.key, retired: true, removedFromReports: sch.length });
});

/* ───────── bigger reports ───────── */
exports.progress = wrap('progress', async (req, res) => { const sc = await scopeOf(req); const p = await S.period(sid(req), { from: req.query.from || S.addDays((await S.today(sid(req))), -180), to: req.query.to }); const defs = await C.definitions(sid(req)); res.json(await Rp.progress(sid(req), sc, { ...p, minCell: defs.get('learning.average').minCell })); });
exports.ageing = wrap('ageing', async (req, res) => { const sc = await scopeOf(req); const gb = String(req.query.groupBy || 'none'); const defs = await C.definitions(sid(req)); const d = defs.get('fees.collection'); const t = await S.today(sid(req));
  res.json(await Rp.ageing(sid(req), sc, { today: t, groupBy: ['none', 'class', 'standard', 'campus'].includes(gb) ? gb : 'none', minCell: d.minCell })); });
exports.funnel = wrap('funnel', async (req, res) => { const sc = await scopeOf(req); if (sc.limited) throw new Fail(403, 'The admissions funnel covers the whole school.'); const p = await S.period(sid(req), { from: req.query.from || S.addDays(await S.today(sid(req)), -365), to: req.query.to }); res.json(await Rp.funnel(sid(req), sc, p)); });
exports.health = wrap('health', async (req, res) => res.json(await Rp.health(sid(req))));

/* ───────── saved runs, packs and schedules ───────── */
const runHead = (r) => ({ _id: r._id, kind: r.kind, title: r.title, from: r.from, to: r.to, groupBy: r.groupBy, periodKey: r.periodKey, level: r.level, measures: r.measureCount, exceptions: r.exceptionCount, urgent: r.urgentCount, createdByName: r.createdByName, createdAt: r.createdAt, scheduleId: r.scheduleId });
exports.runs = wrap('runs', async (req, res) => {
  const sc = await scopeOf(req); const { p, l } = S.pg(req.query); const q = { schoolId: oid(sid(req)) };
  if (!(sc.level === 'admin' && !sc.limited)) q.$or = [{ viewerIds: oid(req.user.userId) }, { createdById: oid(req.user.userId) }];
  const [rows, total] = await Promise.all([AnRun.find(q).select('-results -exceptions -hidden').sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), AnRun.countDocuments(q)]);
  res.json({ runs: rows.map(runHead), total, page: p });
});
const loadRun = async (req) => { const id = oid(req.params.id); const r = id ? await AnRun.findOne({ _id: id, schoolId: oid(sid(req)) }) : null; if (!r || !(await Rn.canOpen(req.user, r))) throw new Fail(404, 'Report not found.'); return r; };
exports.run = wrap('run', async (req, res) => { const r = await loadRun(req); res.json({ ...runHead(r), results: r.results, exceptions: r.exceptions, hidden: r.hidden, hash: r.hash }); });
const runCsv = (r) => { const out = [['Measure', 'Group', 'Value %', 'Counted', 'Against', 'Unit', 'Definition version', 'From', 'To']];
  for (const m of r.results) { out.push([m.name, 'All', m.total.suppressed ? 'hidden' : m.total.value ?? '', m.total.num ?? '', m.total.den ?? '', m.unit, m.version || 'built-in', r.from, r.to]); for (const g of m.groups || []) out.push([m.name, g.label, g.suppressed ? 'hidden' : g.value ?? '', g.num ?? '', g.den ?? '', m.unit, m.version || 'built-in', r.from, r.to]); } return out; };
exports.runFile = wrap('runFile', async (req, res) => {
  const r = await loadRun(req); const fmt = req.params.fmt;
  if (fmt === 'csv') { res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="aulensia-measures-${r.from}-${r.to}.csv"`); return res.send(E.csv(runCsv(r))); }
  const school = await School.findById(oid(sid(req))).select('name').lean(); const buf = await PDF.render(r, { school: school?.name || '' });
  res.set('Content-Type', 'application/pdf').set('Content-Disposition', `inline; filename="aulensia-measures-${r.from}-${r.to}.pdf"`).send(buf);
});
exports.saveRun = wrap('saveRun', async (req, res) => {
  const b = body(req); const p = await S.period(sid(req), b); const keys = Array.isArray(b.keys) ? b.keys.map(String).slice(0, 40) : []; const gb = C.GROUPS.includes(b.groupBy) ? b.groupBy : 'none';
  const title = S.text(b.title, 'The title', { min: 3, max: 120 }); const a = ctxOf(req).actor;
  const { run } = await Rn.saveRun({ schoolId: sid(req), user: req.user, actor: a, kind: b.kind === 'pack' ? 'pack' : 'manual', title, from: p.from, to: p.to, groupBy: gb, keys });
  await A(req, 'analytics.run.save', run._id, title); res.status(201).json({ ...runHead(run), hash: run.hash });
});
async function cleanSchedule(req, b, cur = {}) {
  const defs = await C.definitions(sid(req)); const name = S.text(b.name ?? cur.name, 'The name', { min: 3, max: 80 });
  const metrics = [...new Set((b.metrics ?? cur.metrics ?? []).map(String))].slice(0, 40); if (!metrics.length) throw new Fail(422, 'Choose at least one measure.'); for (const k of metrics) if (!defs.has(k)) throw new Fail(422, `"${k}" is not a measure of this school.`);
  const cadence = b.cadence ?? cur.cadence; if (!['weekly', 'monthly'].includes(cadence)) throw new Fail(422, 'Choose weekly or monthly.');
  const dow = Number(b.dow ?? cur.dow ?? 1); const dom = Number(b.dom ?? cur.dom ?? 1); if (cadence === 'weekly' && !(Number.isInteger(dow) && dow >= 0 && dow <= 6)) throw new Fail(422, 'Choose a day of the week.'); if (cadence === 'monthly' && !(Number.isInteger(dom) && dom >= 1 && dom <= 28)) throw new Fail(422, 'Choose a day of the month from 1 to 28.');
  const periodRule = b.periodRule ?? cur.periodRule ?? 'last_7_days'; if (!['last_7_days', 'last_30_days', 'last_full_month', 'month_to_date'].includes(periodRule)) throw new Fail(422, 'Choose the period the report covers.');
  const groupBy = b.groupBy ?? cur.groupBy ?? 'none'; if (!C.GROUPS.includes(groupBy)) throw new Fail(422, 'Choose how to group.');
  const given = b.recipients ?? (cur.recipients || []).map((r) => ({ userId: String(r.userId), role: r.role })); if (!Array.isArray(given) || !given.length || given.length > 60) throw new Fail(422, 'Choose between 1 and 60 people to receive it.');
  const recipients = []; const seen = new Set();
  for (const g of given) {
    const role = g.role === 'teacher' ? 'teacher' : 'admin'; const id = oid(g.userId); if (!id || seen.has(`${role}:${id}`)) continue; seen.add(`${role}:${id}`);
    const row = await (role === 'admin' ? User : Teacher).findOne({ _id: id, schoolId: oid(sid(req)) }).select('name role isActive').lean(); if (!row || row.isActive === false || (role === 'admin' && row.role !== 'admin')) throw new Fail(422, 'One of the people chosen is not an active member of this school.');
    recipients.push({ userId: id, role, name: row.name || '' });
  }
  if (!recipients.length) throw new Fail(422, 'Choose at least one person.');
  return { name, metrics, cadence, dow, dom, periodRule, groupBy, recipients };
}
// what each person on a report will not see, so nobody is surprised by a missing line
async function reach(req, s) {
  const defs = await C.definitions(sid(req)); const out = [];
  for (const r of s.recipients) { const sc = await S.scopeFor({ role: r.role, userId: String(r.userId), schoolId: String(sid(req)) }); const missing = s.metrics.map((k) => defs.get(k)).filter(Boolean).filter((d) => !C.canSee(d, sc).ok).map((d) => d.name); out.push({ userId: String(r.userId), role: r.role, name: r.name, level: sc?.level || null, missing }); }
  return out;
}
const schedView = async (req, s) => ({ _id: s._id, name: s.name, metrics: s.metrics, cadence: s.cadence, dow: s.dow, dom: s.dom, periodRule: s.periodRule, groupBy: s.groupBy, active: s.active, nextDate: s.nextDate, lastRunDate: s.lastRunDate, lastError: s.lastError, createdByName: s.createdByName, recipients: await reach(req, s) });
exports.schedules = wrap('schedules', async (req, res) => { const list = await AnSchedule.find({ schoolId: oid(sid(req)) }).sort({ createdAt: -1 }).limit(100); res.json({ schedules: await Promise.all(list.map((s) => schedView(req, s))) }); });
exports.createSchedule = wrap('createSchedule', async (req, res) => {
  if (await AnSchedule.countDocuments({ schoolId: oid(sid(req)), active: true }) >= 30) throw new Fail(409, 'A school can have 30 active reports.');
  const c = await cleanSchedule(req, body(req)); const today = await S.today(sid(req)); const a = ctxOf(req).actor;
  const s = await AnSchedule.create({ schoolId: oid(sid(req)), ...c, nextDate: Rn.nextDue(c, today), createdById: a.id, createdByName: a.name }); await A(req, 'analytics.schedule.create', s._id, c.name);
  res.status(201).json(await schedView(req, s));
});
exports.updateSchedule = wrap('updateSchedule', async (req, res) => {
  const s = await AnSchedule.findOne({ _id: oid(req.params.id), schoolId: oid(sid(req)) }); if (!s) throw new Fail(404, 'Report not found.'); const b = body(req); const set = {};
  if (typeof b.active === 'boolean') { set.active = b.active; if (b.active) set.nextDate = Rn.nextDue(s, await S.today(sid(req))); }
  if (['name', 'metrics', 'cadence', 'dow', 'dom', 'periodRule', 'groupBy', 'recipients'].some((k) => b[k] !== undefined)) { const c = await cleanSchedule(req, b, s.toObject ? s.toObject() : s); Object.assign(set, c); set.nextDate = Rn.nextDue(c, await S.today(sid(req))); }
  await AnSchedule.updateOne({ _id: s._id }, { $set: set }); await A(req, 'analytics.schedule.update', s._id, Object.keys(set).join(','));
  res.json(await schedView(req, await AnSchedule.findById(s._id)));
});
exports.runSchedule = wrap('runSchedule', async (req, res) => {
  const s = await AnSchedule.findOne({ _id: oid(req.params.id), schoolId: oid(sid(req)) }); if (!s) throw new Fail(404, 'Report not found.');
  const runs = await Rn.runSchedule(s, await S.today(sid(req)), { actor: ctxOf(req).actor }); await A(req, 'analytics.schedule.run', s._id, `${runs.length} run(s)`);
  res.json({ runs: runs.map(runHead) });
});
exports.sweep = wrap('sweep', async (req, res) => res.json(await Rn.sweep(sid(req))));

/* ───────── jobs that follow from a slipping measure ───────── */
const jobView = (j, today) => ({ _id: j._id, title: j.title, detail: j.detail, metricKey: j.metricKey, groupKey: j.groupKey, groupLabel: j.groupLabel, classId: j.classId, source: j.source, ownerId: j.ownerId, ownerRole: j.ownerRole, ownerName: j.ownerName, dueOn: j.dueOn, status: j.status, overdue: j.status === 'open' && j.dueOn < today, doneAt: j.doneAt, doneNote: j.doneNote, droppedReason: j.droppedReason, createdByName: j.createdByName, createdAt: j.createdAt, history: j.history });
async function jobScope(req) {
  const sc = await scopeOf(req); const q = { schoolId: oid(sid(req)) };
  if (sc.level === 'admin' && !sc.limited) return q;
  if (sc.level === 'admin') { q.$or = [{ ownerId: oid(req.user.userId) }, { createdById: oid(req.user.userId) }, { classId: { $in: sc.classIds.map(oid) } }]; return q; }
  q.ownerId = oid(req.user.userId); return q;
}
exports.jobs = wrap('jobs', async (req, res) => {
  const q = await jobScope(req); const st = String(req.query.status || 'open'); if (['open', 'done', 'dropped'].includes(st)) q.status = st; const today = await S.today(sid(req)); const { p, l } = S.pg(req.query);
  const [rows, total] = await Promise.all([AnAction.find(q).sort({ dueOn: 1 }).skip((p - 1) * l).limit(l), AnAction.countDocuments(q)]); res.json({ jobs: rows.map((j) => jobView(j, today)), total, page: p });
});
exports.createJob = wrap('createJob', async (req, res) => {
  const b = body(req); const title = S.text(b.title, 'The title', { min: 5, max: 160 }); const detail = S.text(b.detail, 'The detail', { max: 500 }); const today = await S.today(sid(req));
  if (!S.isDay(b.dueOn) || b.dueOn < today || b.dueOn > S.addDays(today, 180)) throw new Fail(422, 'Choose a due date within the next 180 days.');
  const role = b.ownerRole === 'teacher' ? 'teacher' : 'admin'; const oidv = oid(b.ownerId); const owner = oidv ? await (role === 'admin' ? User : Teacher).findOne({ _id: oidv, schoolId: oid(sid(req)) }).select('name role isActive').lean() : null;
  if (!owner || owner.isActive === false || (role === 'admin' && owner.role !== 'admin')) throw new Fail(422, 'Choose an active administrator or teacher of this school as the owner.');
  const metricKey = String(b.metricKey || ''); const groupKey = String(b.groupKey || '').slice(0, 60);
  if (metricKey) { if (!(await C.definitions(sid(req))).has(metricKey)) throw new Fail(422, 'That measure does not exist.'); const dup = await AnAction.findOne({ schoolId: oid(sid(req)), metricKey, groupKey, status: 'open' }); if (dup) throw new Fail(409, 'There is already an open job for this.', { jobId: dup._id, reason: 'duplicate' }); }
  const sc = await scopeOf(req); let classId = oid(b.classId); if (classId) { const ok = sc.classIds === null || sc.classIds.includes(String(classId)); const cls = ok ? await Class.findOne({ _id: classId, schoolId: oid(sid(req)) }).select('_id') : null; if (!cls) classId = null; }
  const a = ctxOf(req).actor;
  const j = await AnAction.create({ schoolId: oid(sid(req)), title, detail, metricKey, groupKey, groupLabel: S.text(b.groupLabel, 'The label', { max: 80 }), classId, runId: oid(b.runId), source: b.source === 'exception' ? 'exception' : 'manual', ownerId: oidv, ownerRole: role, ownerName: owner.name || '', dueOn: b.dueOn, createdById: a.id, createdByName: a.name, history: [S.trail(a, 'created', '')] });
  await A(req, 'analytics.job.create', j._id, title); if (String(oidv) !== String(a.id)) await S.tell(sid(req), [{ id: String(oidv), role }], 'A job for you', `${title} (by ${j.dueOn})`, Rn.linkFor(role), `an:job:${j._id}`);
  res.status(201).json(jobView(j, today));
});
const loadJob = async (req) => { const j = await AnAction.findOne({ _id: oid(req.params.id), schoolId: oid(sid(req)) }); if (!j) throw new Fail(404, 'Job not found.'); return j; };
exports.doneJob = wrap('doneJob', async (req, res) => {
  const j = await loadJob(req); const mine = String(j.ownerId) === String(req.user.userId); const isAdmin = req.user.role === 'admin'; if (!mine && !isAdmin) throw new Fail(403, 'Only the owner or an administrator can finish this job.');
  if (isAdmin && !mine) { const sc = await scopeOf(req); if (sc.limited && !(j.classId && sc.classIds.includes(String(j.classId))) && String(j.createdById) !== String(req.user.userId)) throw new Fail(403, 'This job is outside your campuses.'); }
  const note = S.text(body(req).note, 'The note', { max: 300 }); const a = ctxOf(req).actor;
  const r = await AnAction.updateOne({ _id: j._id, status: 'open' }, { $set: { status: 'done', doneAt: new Date(), doneNote: note }, $push: { history: S.trail(a, 'done', note) } }); if (!r.matchedCount) throw new Fail(409, 'This job is already closed.');
  await A(req, 'analytics.job.done', j._id, note);
  if (String(j.createdById) !== String(a.id)) await S.tell(sid(req), [{ id: String(j.createdById), role: 'admin' }], 'A job was finished', `${j.title}${note ? `: ${note}` : ''}`, '/admin#/analytics', `an:jobdone:${j._id}`);
  res.json({ _id: j._id, status: 'done' });
});
exports.dropJob = wrap('dropJob', async (req, res) => {
  const j = await loadJob(req); const reason = S.text(body(req).reason, 'The reason', { min: 5, max: 300 }); const a = ctxOf(req).actor;
  const r = await AnAction.updateOne({ _id: j._id, status: 'open' }, { $set: { status: 'dropped', droppedReason: reason }, $push: { history: S.trail(a, 'dropped', reason) } }); if (!r.matchedCount) throw new Fail(409, 'This job is already closed.');
  await A(req, 'analytics.job.drop', j._id, reason); await S.tell(sid(req), [{ id: String(j.ownerId), role: j.ownerRole }], 'A job was cancelled', `${j.title}: ${reason}`, Rn.linkFor(j.ownerRole)); res.json({ _id: j._id, status: 'dropped' });
});
exports.reassignJob = wrap('reassignJob', async (req, res) => {
  const j = await loadJob(req); if (j.status !== 'open') throw new Fail(409, 'This job is already closed.'); const b = body(req); const role = b.ownerRole === 'teacher' ? 'teacher' : 'admin'; const id = oid(b.ownerId);
  const owner = id ? await (role === 'admin' ? User : Teacher).findOne({ _id: id, schoolId: oid(sid(req)) }).select('name role isActive').lean() : null; if (!owner || owner.isActive === false || (role === 'admin' && owner.role !== 'admin')) throw new Fail(422, 'Choose an active administrator or teacher of this school.');
  const set = { ownerId: id, ownerRole: role, ownerName: owner.name || '', overdueNoticeOn: '' }; if (b.dueOn) { const today = await S.today(sid(req)); if (!S.isDay(b.dueOn) || b.dueOn < today || b.dueOn > S.addDays(today, 180)) throw new Fail(422, 'Choose a due date within the next 180 days.'); set.dueOn = b.dueOn; }
  const a = ctxOf(req).actor; await AnAction.updateOne({ _id: j._id, status: 'open' }, { $set: set, $push: { history: S.trail(a, 'reassigned', `to ${owner.name}`) } }); await A(req, 'analytics.job.reassign', j._id, owner.name);
  await S.tell(sid(req), [{ id: String(id), role }], 'A job for you', `${j.title} (by ${set.dueOn || j.dueOn})`, Rn.linkFor(role), `an:job:${j._id}:${String(id)}`); res.json({ _id: j._id, ownerName: owner.name });
});
exports.people = wrap('people', async (req, res) => {
  const [admins, teachers] = await Promise.all([User.find({ schoolId: oid(sid(req)), role: 'admin', isActive: { $ne: false } }).select('name').lean(), Teacher.find({ schoolId: oid(sid(req)), isActive: { $ne: false } }).select('name').lean()]);
  res.json({ admins: admins.map((u) => ({ id: String(u._id), name: u.name })), teachers: teachers.map((u) => ({ id: String(u._id), name: u.name })) });
});

/* ───────── the teacher time pulse ───────── */
const onlyTeacher = (req) => { if (req.user.role !== 'teacher') throw new Fail(403, 'The time pulse is for teachers.'); };
exports.pulseMe = wrap('pulseMe', async (req, res) => { onlyTeacher(req); res.json(await Rp.pulseMe(sid(req), req.user.userId)); });
exports.pulseJoin = wrap('pulseJoin', async (req, res) => { onlyTeacher(req); res.json(await Rp.pulseOpt(sid(req), req.user.userId, true)); });
exports.pulseLeave = wrap('pulseLeave', async (req, res) => { onlyTeacher(req); const r = await Rp.pulseOpt(sid(req), req.user.userId, false, { erase: body(req).erase === true }); await A(req, 'analytics.pulse.leave', req.user.userId, r.erased ? 'erased' : ''); res.json(r); });
exports.pulseEntry = wrap('pulseEntry', async (req, res) => { onlyTeacher(req); res.json(await Rp.pulseEntry(sid(req), req.user.userId, body(req))); });
exports.pulseReport = wrap('pulseReport', async (req, res) => { const p = await S.period(sid(req), { from: req.query.from || S.addDays(await S.today(sid(req)), -57), to: req.query.to }); res.json(await Rp.pulseReport(sid(req), p)); });
