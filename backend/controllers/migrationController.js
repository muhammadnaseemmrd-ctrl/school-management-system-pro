// Data import and year rollover (PRD E29). Administrators only.
const mongoose = require('../lib/pgdoc');
const ImportJob = require('../models/ImportJob');
const RolloverRun = require('../models/RolloverRun');
const School = require('../models/School');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { audit } = require('../utils/audit');
const N = require('../utils/notify');
const I = require('../utils/migration/importer');
const R = require('../utils/migration/rollover');
const csv = require('../utils/migration/csv');
const { oid, sid, bad, wrap, clean, pg } = require('../utils/early/service');

const me = (req) => ({ id: oid(req.user.userId), name: req.actorName || '' });
const jobHead = (j) => ({ _id: j._id, kind: j.kind, fileName: j.fileName, status: j.status, summary: j.summary, result: j.result, createdByName: j.createdByName, createdAt: j.createdAt, committedAt: j.committedAt, rolledBackAt: j.rolledBackAt, rollbackReason: j.rollbackReason, rollbackResult: j.rollbackResult, options: { createMissingClasses: !!j.options?.createMissingClasses } });
const rowView = (r) => ({ n: r.n, state: r.state, raw: r.raw, errors: r.errors, warnings: r.warnings, match: r.match, diff: r.diff, decision: r.decision, classLabel: r.classLabel, result: r.result ? { status: r.result.status, error: r.result.error, warning: r.result.warning, rolledBack: r.result.rolledBack } : null });
const loadJob = async (req) => { const id = oid(req.params.id); return id ? ImportJob.findOne({ _id: id, schoolId: sid(req) }) : null; };
const loadRun = async (req) => { const id = oid(req.params.id); return id ? RolloverRun.findOne({ _id: id, schoolId: sid(req) }) : null; };

exports.overview = wrap('overview', async (req, res) => {
  const schoolId = sid(req); const school = await School.findById(schoolId).select('academicYear academicYearHistory name');
  const [classes, students, jobs, runs, freeze] = await Promise.all([Class.countDocuments({ schoolId }), Student.countDocuments({ schoolId, isActive: { $ne: false } }), ImportJob.find({ schoolId }).sort({ createdAt: -1 }).limit(8).select('-rows'), RolloverRun.find({ schoolId }).sort({ createdAt: -1 }).limit(5).select('-plan -journal'), R.freezeOf(schoolId)]);
  const cls = await Class.find({ schoolId }).select('standard');
  res.json({ academicYear: school?.academicYear || '', nextYear: R.nextYearLabel(school?.academicYear), history: school?.academicYearHistory || [], classes, students, ladder: R.defaultLadder(cls), freeze, maxRows: I.MAX_ROWS, imports: jobs.map(jobHead), rollovers: runs.map(runHead) });
});

exports.template = wrap('template', async (req, res) => {
  const kind = req.params.kind; if (!csv.TEMPLATE[kind]) return bad(res, 404, 'Unknown template');
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="aulensia-${kind}-template.csv"`).send(csv.toCsv(csv.TEMPLATE[kind], [csv.TEMPLATE_SAMPLE[kind]]));
});

// ── import ──
exports.importPreview = wrap('import preview', async (req, res) => {
  const b = req.body || {}; const out = await I.preview({ schoolId: sid(req), user: me(req), kind: b.kind, fileName: b.fileName, csvText: typeof b.csv === 'string' ? b.csv : '', rows: b.rows, options: b.options || {} });
  if (out.status !== 201) return bad(res, out.status, out.message, { mapped: out.mapped, unknown: out.unknown });
  await audit(req, { action: 'migration.import.preview', entityType: 'ImportJob', entityId: out.job._id, schoolId: sid(req), detail: { kind: out.job.kind, rows: out.job.summary.total } });
  res.status(201).json({ job: jobHead(out.job), rows: out.job.rows.filter((r) => r.state !== 'ok' && r.state !== 'skip' || r.warnings.length).slice(0, 100).map(rowView) });
});
exports.importList = wrap('import list', async (req, res) => { const { p, l } = pg(req.query); const q = { schoolId: sid(req) }; const [rows, total] = await Promise.all([ImportJob.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).select('-rows'), ImportJob.countDocuments(q)]); res.json({ jobs: rows.map(jobHead), total, page: p }); });
exports.importGet = wrap('import get', async (req, res) => {
  const j = await loadJob(req); if (!j) return bad(res, 404, 'Import not found'); const { p, l } = pg(req.query); const st = clean(req.query.state, 12);
  let rows = j.rows; if (st) rows = rows.filter((r) => (st === 'failed' ? r.result?.status === 'failed' : r.state === st)); const total = rows.length;
  res.json({ job: jobHead(j), rows: rows.slice((p - 1) * l, p * l).map(rowView), total, page: p });
});
exports.importDecisions = wrap('import decisions', async (req, res) => {
  const j = await loadJob(req); if (!j) return bad(res, 404, 'Import not found'); if (j.status !== 'Previewed') return bad(res, 409, 'Decisions can only be changed before the import starts.');
  const n = I.setDecisions(j, req.body?.decisions || {}, req.body?.defaultReview); await ImportJob.updateOne({ _id: j._id }, { $set: { rows: j.rows } });
  res.json({ updated: n, stillOpen: j.rows.filter((r) => r.state === 'review' && !r.decision).length });
});
exports.importCommit = wrap('import commit', async (req, res) => {
  const j = await loadJob(req); if (!j) return bad(res, 404, 'Import not found'); const out = await I.commit({ job: j, batch: req.body?.batch });
  if (out.status === 200 && out.body.done && !out.body.alreadyCommitted) {
    await audit(req, { action: 'migration.import.commit', entityType: 'ImportJob', entityId: j._id, schoolId: sid(req), detail: { kind: j.kind, tally: out.body.tally } });
    await N.notify({ schoolId: sid(req), recipients: await N.admins(sid(req)), title: `Import finished: ${j.fileName || j.kind}`, body: `${out.body.tally?.created || 0} created, ${out.body.tally?.updated || 0} updated.`, link: '/admin#/migration', type: 'general', key: `import:${j._id}` }).catch(() => {});
  }
  res.status(out.status).json(out.body);
});
exports.importRollback = wrap('import rollback', async (req, res) => {
  const j = await loadJob(req); if (!j) return bad(res, 404, 'Import not found'); const reason = clean(req.body?.reason, 300); if (reason.length < 5) return bad(res, 400, 'Say why the import is being taken back (at least 5 characters).');
  const out = await I.rollback({ job: j, reason }); if (out.status !== 200) return bad(res, out.status, out.message);
  await audit(req, { action: 'migration.import.rollback', entityType: 'ImportJob', entityId: j._id, schoolId: sid(req), detail: { reason, ...out.result, kept: out.result.kept.length } }); res.json({ result: out.result });
});
exports.importCancel = wrap('import cancel', async (req, res) => { const r = await ImportJob.updateOne({ _id: oid(req.params.id), schoolId: sid(req), status: 'Previewed' }, { $set: { status: 'Cancelled' } }); if (!r.matchedCount) return bad(res, 409, 'Only an import that has not started can be cancelled.'); res.json({ ok: true }); });
exports.importIssues = wrap('import issues', async (req, res) => { const j = await loadJob(req); if (!j) return bad(res, 404, 'Import not found'); res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="import-issues.csv"').send(I.issuesCsv(j)); });

// ── rollover ──
const runHead = (r) => ({ _id: r._id, fromYear: r.fromYear, toYear: r.toYear, status: r.status, createdByName: r.createdByName, createdAt: r.createdAt, frozen: r.frozen, review: r.review, committedAt: r.committedAt, committedByName: r.committedByName, rolledBackAt: r.rolledBackAt, rolledBackByName: r.rolledBackByName, rollbackReason: r.rollbackReason, progress: r.progress, counts: r.plan?.counts || null, planHash: r.planHash });
const runFull = (r, req) => { const { p, l } = pg(req.query); const act = clean(req.query.action, 10); const q = clean(req.query.q, 60).toLowerCase(); let st = r.plan?.students || []; if (act) st = st.filter((e) => e.action === act); if (q) st = st.filter((e) => String(e.name).toLowerCase().includes(q) || String(e.admissionNumber).toLowerCase().includes(q)); return { run: { ...runHead(r), config: r.config, readiness: r.readiness, rollbackResult: r.rollbackResult, plan: r.plan ? { ladder: r.plan.ladder, counts: r.plan.counts, routes: r.plan.routes, newClasses: r.plan.newClasses, warnings: r.plan.warnings } : null }, students: st.slice((p - 1) * l, p * l).map((e) => ({ id: e.id, name: e.name, admissionNumber: e.admissionNumber, from: e.fromLabel, to: e.toLabel, action: e.action, reason: e.reason, manual: !!e.manual })), totalStudents: st.length, page: p }; };

exports.rolloverList = wrap('rollover list', async (req, res) => { const rows = await RolloverRun.find({ schoolId: sid(req) }).sort({ createdAt: -1 }).limit(20).select('-plan -journal'); res.json({ runs: rows.map(runHead) }); });
exports.rolloverCreate = wrap('rollover create', async (req, res) => {
  const schoolId = sid(req); const school = await School.findById(schoolId).select('academicYear'); const b = req.body || {};
  const toYear = (R.parseYear(b.toYear) || { label: '' }).label || R.nextYearLabel(school.academicYear); if (!toYear) return bad(res, 400, 'Give the new academic year, for example 2026-2027.');
  const open = await RolloverRun.findOne({ schoolId, status: { $in: R.OPEN } }); if (open) return bad(res, 409, `A rollover to ${open.toYear} is already open. Finish or cancel it first.`, { id: open._id });
  const run = await RolloverRun.create({ schoolId, fromYear: school.academicYear || '', toYear, createdBy: me(req).id, createdByName: me(req).name, config: { holdOnDues: !!b.holdOnDues, ladder: Array.isArray(b.ladder) ? b.ladder.map((x) => clean(x, 40)).filter(Boolean) : [], overrides: {}, acknowledgedDuplicates: [] } });
  await audit(req, { action: 'migration.rollover.create', entityType: 'RolloverRun', entityId: run._id, schoolId, detail: { fromYear: run.fromYear, toYear } });
  await R.previewRun(run); res.status(201).json(runFull(await RolloverRun.findById(run._id), req));
});
exports.rolloverGet = wrap('rollover get', async (req, res) => { const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); res.json(runFull(r, req)); });
exports.rolloverConfig = wrap('rollover config', async (req, res) => {
  const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); if (!['Draft', 'Reviewed'].includes(r.status)) return bad(res, 409, 'The settings can only change before the commit starts.');
  const b = req.body || {}; const cfg = { ...r.config, overrides: { ...(r.config?.overrides || {}) } };
  if (Array.isArray(b.ladder)) cfg.ladder = b.ladder.map((x) => clean(x, 40)).filter(Boolean);
  if (typeof b.holdOnDues === 'boolean') cfg.holdOnDues = b.holdOnDues;
  if (Array.isArray(b.acknowledgedDuplicates)) cfg.acknowledgedDuplicates = b.acknowledgedDuplicates.map((x) => clean(x, 120));
  if (b.overrides && typeof b.overrides === 'object') for (const [id, o] of Object.entries(b.overrides)) { if (!oid(id)) continue; if (!o) delete cfg.overrides[id]; else if (['promote', 'repeat', 'graduate'].includes(o.action)) cfg.overrides[id] = { action: o.action, reason: clean(o.reason, 200) }; }
  if (b.toYear !== undefined) { const y = R.parseYear(b.toYear); if (!y) return bad(res, 400, 'The new year should look like 2026-2027.'); await RolloverRun.updateOne({ _id: r._id }, { $set: { toYear: y.label } }); r.toYear = y.label; }
  await RolloverRun.updateOne({ _id: r._id }, { $set: { config: cfg } }); r.config = cfg; await R.previewRun(r);
  res.json(runFull(await RolloverRun.findById(r._id), req));
});
exports.rolloverPreview = wrap('rollover preview', async (req, res) => { const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); if (!['Draft', 'Reviewed'].includes(r.status)) return bad(res, 409, `This rollover is ${r.status.toLowerCase()}.`); await R.previewRun(r); res.json(runFull(await RolloverRun.findById(r._id), req)); });
exports.rolloverFreeze = wrap('rollover freeze', async (req, res) => {
  const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); if (!['Draft', 'Reviewed'].includes(r.status)) return bad(res, 409, 'Results can only be frozen before the commit.');
  if (r.frozen?.at) return res.json(runFull(r, req));
  const Marks = require('../models/Marks'); const marksCount = await Marks.countDocuments({ schoolId: sid(req) });
  await RolloverRun.updateOne({ _id: r._id }, { $set: { frozen: { at: new Date(), byName: me(req).name, marksCount } } }); await audit(req, { action: 'migration.rollover.freeze', entityType: 'RolloverRun', entityId: r._id, schoolId: sid(req), detail: { marksCount } });
  const f = await RolloverRun.findById(r._id); await R.previewRun(f); res.json(runFull(await RolloverRun.findById(r._id), req));
});
exports.rolloverUnfreeze = wrap('rollover unfreeze', async (req, res) => { const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); if (!['Draft', 'Reviewed'].includes(r.status)) return bad(res, 409, 'Results stay frozen once the commit has started. Roll the rollover back instead.'); await RolloverRun.updateOne({ _id: r._id }, { $set: { frozen: null, status: 'Draft', review: null } }); await audit(req, { action: 'migration.rollover.unfreeze', entityType: 'RolloverRun', entityId: r._id, schoolId: sid(req) }); await R.previewRun(await RolloverRun.findById(r._id)); res.json(runFull(await RolloverRun.findById(r._id), req)); });
exports.rolloverReview = wrap('rollover review', async (req, res) => {
  const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); if (!['Draft', 'Reviewed'].includes(r.status)) return bad(res, 409, `This rollover is ${r.status.toLowerCase()}.`);
  const b = req.body || {}; if (b.acknowledge !== true) return bad(res, 400, 'Confirm that you have read the counts and the rollback record.');
  const fresh = await R.previewRun(r); if (b.planHash && b.planHash !== fresh.planHash) return bad(res, 409, 'The plan changed since you opened it. Read the new counts first.', { planHash: fresh.planHash });
  if (fresh.readiness.blockers.length) return bad(res, 422, 'The rollover is blocked.', { blockers: fresh.readiness.blockers });
  const u = me(req); const review = { byName: u.name, byId: String(u.id), at: new Date(), planHash: fresh.planHash, note: clean(b.note, 300), selfReviewed: String(r.createdBy) === String(u.id) };
  await RolloverRun.updateOne({ _id: r._id }, { $set: { status: 'Reviewed', review } }); await audit(req, { action: 'migration.rollover.review', entityType: 'RolloverRun', entityId: r._id, schoolId: sid(req), detail: { planHash: fresh.planHash, counts: fresh.plan.counts, selfReviewed: review.selfReviewed } });
  res.json(runFull(await RolloverRun.findById(r._id), req));
});
exports.rolloverCommit = wrap('rollover commit', async (req, res) => {
  const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); const out = await R.commit({ run: r, user: me(req), batch: req.body?.batch });
  if (out.status === 200 && out.body.done && !out.body.alreadyCommitted) { await audit(req, { action: 'migration.rollover.commit', entityType: 'RolloverRun', entityId: r._id, schoolId: sid(req), detail: { toYear: r.toYear, counts: out.body.counts } }); await N.notify({ schoolId: sid(req), recipients: await N.admins(sid(req)), title: `Academic year ${r.toYear} is open`, body: `${out.body.counts.promote} promoted, ${out.body.counts.repeat} repeating, ${out.body.counts.graduate} graduated.`, link: '/admin#/migration', type: 'general', key: `rollover:${r._id}` }).catch(() => {}); }
  res.status(out.status).json(out.body);
});
exports.rolloverRollback = wrap('rollover rollback', async (req, res) => {
  const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); const reason = clean(req.body?.reason, 300); if (reason.length < 5) return bad(res, 400, 'Say why the rollover is being taken back (at least 5 characters).');
  const out = await R.rollback({ run: r, user: me(req), reason }); if (out.status !== 200) return bad(res, out.status, out.message);
  await audit(req, { action: 'migration.rollover.rollback', entityType: 'RolloverRun', entityId: r._id, schoolId: sid(req), detail: { reason, restored: out.result.restored, conflicts: out.result.conflicts.length } }); res.json({ result: out.result });
});
exports.rolloverCancel = wrap('rollover cancel', async (req, res) => { const r = await RolloverRun.updateOne({ _id: oid(req.params.id), schoolId: sid(req), status: { $in: ['Draft', 'Reviewed'] } }, { $set: { status: 'Cancelled' } }); if (!r.matchedCount) return bad(res, 409, 'Only a rollover that has not started committing can be cancelled.'); res.json({ ok: true }); });
exports.rolloverStudents = wrap('rollover students', async (req, res) => { const r = await loadRun(req); if (!r) return bad(res, 404, 'Rollover not found'); res.json(runFull(r, req)); });
