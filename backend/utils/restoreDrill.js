// Restore drills (PRD E33): prove a stored backup can really be restored before anyone relies on it.
// The backup is loaded into temporary tables that exist only inside one database transaction (an isolated sandbox
// that shares nothing with live data), then compared row by row with what the backup says it holds.
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const db = require('../lib/pgdoc/db');
const registry = require('../lib/pgdoc/registry');
const Backup = require('../models/Backup');
const BackupRun = require('../models/BackupRun');
const RestoreDrill = require('../models/RestoreDrill');
const School = require('../models/School');
const { TABLES, collect } = require('./backup');

const gunzip = promisify(zlib.gunzip);
const q = (id) => `"${String(id).replace(/"/g, '""')}"`;
const DAY = 24 * 3600 * 1000;
const STALE_DAYS = 8;      // a school should have a good backup at least weekly
const DRILL_DAYS = 30;     // and a restore proof at least monthly

const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
const httpError = (status, message) => Object.assign(new Error(message), { status });

const running = new Set();

async function runDrill(schoolId, { backupId, actor = null, trigger = 'owner' } = {}) {
  const sid = String(schoolId);
  if (running.has(sid)) throw httpError(409, 'A restore drill for this school is already running');
  running.add(sid);
  const t0 = Date.now();
  try {
    const school = await School.findById(sid).select('name');
    if (!school) throw httpError(404, 'School not found');
    const filter = backupId ? { _id: backupId, schoolId: sid } : { schoolId: sid };
    const b = await Backup.findOne(filter).sort({ createdAt: -1 }).select('+data');
    if (!b || !b.data) throw httpError(422, backupId ? 'Backup not found for this school' : 'This school has no backup to test yet. Make a backup first.');

    const checks = [];
    const add = (name, ok, detail = '', extra = {}) => checks.push({ name, ok, detail, ...extra });

    // 1) the file can be read
    let raw; let payload;
    try {
      raw = await gunzip(b.data);
      payload = JSON.parse(raw.toString());
      if (!['aulensia-backup', 'darsgah-backup'].includes(payload.format)) throw new Error('not an Aulensia backup');
      add('Backup file opens and is readable', true, `${(raw.length / 1024).toFixed(0)} KB of data`);
    } catch (e) {
      add('Backup file opens and is readable', false, e.message);
      return await save(b, school, checks, 0, t0, actor, trigger);
    }

    // 2) it is the same bytes that were saved
    const sum = crypto.createHash('sha256').update(raw).digest('hex');
    if (b.checksum) add('Checksum matches the one saved with the backup', sum === b.checksum, sum === b.checksum ? sum.slice(0, 16) + '…' : 'The stored data has changed since it was saved');
    else add('Checksum matches the one saved with the backup', null, 'This backup was made before checksums existed. Take a new backup to get a full proof.');

    // 3) it belongs to this school and the counts it recorded are the counts it holds
    add('Backup is for this school', String(payload.school && payload.school._id) === sid, payload.school ? payload.school.name : 'missing school record');
    const bad = [];
    for (const [name, n] of Object.entries(payload.counts || {})) if ((payload.tables[name] || []).length !== n) bad.push(`${name}: recorded ${n}, found ${(payload.tables[name] || []).length}`);
    add('Row counts match what the backup recorded', bad.length === 0, bad.join('; ') || `${Object.keys(payload.counts || {}).length} tables agree`);

    // 4) isolated restore into temporary tables, then compare every row
    const work = [['School', [payload.school]], ...Object.entries(payload.tables).filter(([n]) => TABLES.includes(n))];
    let restored = 0; const mismatch = []; let sandboxError = '';
    try {
      await db.get().tx(async (query) => {
        for (const [name, rows] of work) {
          const M = registry.get(name); if (!M) continue;
          const tmp = `drill_${name.toLowerCase()}`;
          await query(`CREATE TEMP TABLE ${q(tmp)} (LIKE ${q(M.table)} INCLUDING ALL) ON COMMIT DROP`);
          const items = rows.map((r) => { const { _id, ...doc } = r; return [String(_id), JSON.stringify(doc)]; });
          for (let i = 0; i < items.length; i += 400) {
            const part = items.slice(i, i + 400);
            await query(`INSERT INTO ${q(tmp)} (id, doc) SELECT x, y::jsonb FROM unnest($1::text[], $2::text[]) AS u(x, y)`, [part.map((p) => p[0]), part.map((p) => p[1])]);
          }
          const back = await query(`SELECT id, doc FROM ${q(tmp)} ORDER BY id`);
          if (back.rows.length !== rows.length) { mismatch.push(`${name}: restored ${back.rows.length} of ${rows.length} rows`); continue; }
          const want = new Map(items.map((p) => [p[0], canon(JSON.parse(p[1]))]));
          let diff = 0;
          for (const r of back.rows) if (want.get(r.id) !== canon(r.doc)) diff += 1;
          if (diff) mismatch.push(`${name}: ${diff} row(s) differ after restore`);
          restored += back.rows.length;
        }
      });
    } catch (e) { sandboxError = e.message; }
    add('Restored into an isolated sandbox, every row identical', !sandboxError && mismatch.length === 0,
      sandboxError || mismatch.join('; ') || `${restored} rows restored and compared; live data untouched`);

    // 5) links between records still resolve (warning only: a school may already have old orphans)
    const ids = (n) => new Set((payload.tables[n] || []).map((r) => String(r._id)));
    const cls = ids('Class'); const stu = ids('Student'); const exm = ids('Exam');
    const orphans = [];
    const miss = (label, rows, pick, set) => { const n = rows.filter((r) => { const v = pick(r); return v && !set.has(String(v)); }).length; if (n) orphans.push(`${label}: ${n}`); };
    miss('students without their class', payload.tables.Student || [], (r) => r.classId, cls);
    miss('marks without their student', payload.tables.Marks || [], (r) => r.studentId, stu);
    miss('marks without their exam', payload.tables.Marks || [], (r) => r.examId, exm);
    miss('fees without their student', payload.tables.StudentFee || [], (r) => r.studentId, stu);
    (payload.tables.Parent || []).forEach((p) => { (p.children || []).forEach((c) => { if (c && !stu.has(String(c))) orphans.push('parent linked to a missing child'); }); });
    add('Links between records are intact', orphans.length === 0, orphans.length ? [...new Set(orphans)].join('; ') : 'No dangling links', { warn: true });

    // 6) how far live data has moved on since the backup (information only)
    try {
      const live = (await collect(sid)).counts; const moved = [];
      for (const [n, c] of Object.entries(payload.counts || {})) if ((live[n] || 0) !== c) moved.push(`${n} ${c}→${live[n] || 0}`);
      add('Changes since this backup', true, moved.length ? moved.join(', ') : 'Nothing has changed since', { info: true });
    } catch (e) { add('Changes since this backup', true, 'Could not compare with live data', { info: true }); }

    return await save(b, school, checks, restored, t0, actor, trigger);
  } finally { running.delete(sid); }
}

async function save(b, school, checks, rows, t0, actor, trigger) {
  const failed = checks.some((c) => c.ok === false && !c.warn);
  const limited = checks.some((c) => c.ok === null);
  const drill = await RestoreDrill.create({
    schoolId: school._id, schoolName: school.name, backupId: b._id, backupCreatedAt: b.createdAt, status: failed ? 'Failed' : 'Passed', limited,
    durationMs: Date.now() - t0, rowsRestored: rows, checks, startedBy: actor && actor.userId ? actor.userId : undefined,
    startedByName: actor ? actor.name || '' : 'Scheduled', trigger,
  });
  await Backup.findByIdAndUpdate(b._id, { lastDrillStatus: drill.status, lastDrillAt: new Date() });
  return drill;
}

// Everything an operator needs to see at a glance: failed jobs, stale data, backups nobody has proven.
async function opsHealth() {
  const now = Date.now();
  const schools = await School.find({ isActive: true }).select('name code createdAt');
  const runs = await BackupRun.find({ startedAt: { $gte: new Date(now - 30 * DAY) } }).sort({ startedAt: -1 }).limit(2000)
    .select('schoolId status startedAt error schoolName trigger');
  const drills = await RestoreDrill.find({ startedAt: { $gte: new Date(now - 120 * DAY) } }).sort({ startedAt: -1 }).limit(2000)
    .select('schoolId status startedAt backupId limited');
  const lastOk = new Map(); const lastAny = new Map();
  for (const r of runs) {
    const k = String(r.schoolId);
    if (!lastAny.has(k)) lastAny.set(k, r);
    if (r.status === 'Succeeded' && !lastOk.has(k)) lastOk.set(k, r);
  }
  const lastPass = new Map();
  for (const d of drills) { const k = String(d.schoolId); if (d.status === 'Passed' && !lastPass.has(k)) lastPass.set(k, d); }

  const alerts = []; const rows = [];
  for (const s of schools) {
    const k = String(s._id);
    const ok = lastOk.get(k); const pass = lastPass.get(k);
    const backupAgeDays = ok ? (now - new Date(ok.startedAt).getTime()) / DAY : null;
    const young = now - new Date(s.createdAt).getTime() < STALE_DAYS * DAY;
    let backup = 'Healthy';
    if (!ok) backup = young ? 'Waiting for first backup' : 'No backup';
    else if (backupAgeDays > STALE_DAYS) backup = 'Stale';
    const drillAgeDays = pass ? (now - new Date(pass.startedAt).getTime()) / DAY : null;
    let proof = 'Proven';
    if (!pass) proof = 'Never proven'; else if (drillAgeDays > DRILL_DAYS) proof = 'Proof is old';
    rows.push({ schoolId: s._id, name: s.name, code: s.code, backup, lastBackupAt: ok ? ok.startedAt : null, proof, lastProofAt: pass ? pass.startedAt : null });
    if (backup === 'No backup' || backup === 'Stale') alerts.push({ level: 'error', kind: 'stale-backup', schoolId: s._id, message: `${s.name}: ${backup === 'No backup' ? 'no successful backup' : `last good backup is ${Math.floor(backupAgeDays)} days old`}` });
    const latest = lastAny.get(k);
    if (latest && latest.status === 'Failed') alerts.push({ level: 'error', kind: 'failed-backup', schoolId: s._id, message: `${s.name}: last backup failed (${latest.error || 'unknown error'})` });
    if (ok && (proof === 'Never proven' || proof === 'Proof is old')) alerts.push({ level: 'warn', kind: 'unproven', schoolId: s._id, message: `${s.name}: backup exists but no passed restore drill in ${DRILL_DAYS} days` });
  }
  const failedDrills = drills.filter((d) => d.status === 'Failed' && now - new Date(d.startedAt).getTime() < 14 * DAY);
  failedDrills.forEach((d) => alerts.push({ level: 'error', kind: 'failed-drill', schoolId: d.schoolId, message: 'A restore drill failed in the last 14 days. See the drill details.' }));
  const lastRun = runs[0] || null;
  return {
    ok: alerts.filter((a) => a.level === 'error').length === 0,
    alerts, schools: rows,
    lastBackupRunAt: lastRun ? lastRun.startedAt : null,
    thresholds: { staleBackupDays: STALE_DAYS, drillDays: DRILL_DAYS },
  };
}

// Scheduled use: prove a couple of the least-recently-proven schools per run (kept small so it fits a cron window).
async function runDueDrills({ max = 2, budgetMs = 20000 } = {}) {
  const t0 = Date.now(); const health = await opsHealth(); const out = [];
  const due = health.schools.filter((s) => s.backup !== 'No backup' && s.backup !== 'Waiting for first backup' && (s.proof !== 'Proven'))
    .sort((a, b) => (a.lastProofAt ? new Date(a.lastProofAt).getTime() : 0) - (b.lastProofAt ? new Date(b.lastProofAt).getTime() : 0)).slice(0, max);
  for (const s of due) {
    if (Date.now() - t0 > budgetMs) break;
    try { const d = await runDrill(s.schoolId, { trigger: 'scheduled' }); out.push({ school: s.name, status: d.status }); }
    catch (e) { out.push({ school: s.name, error: e.message }); }
  }
  return out;
}

module.exports = { runDrill, opsHealth, runDueDrills, STALE_DAYS, DRILL_DAYS };
