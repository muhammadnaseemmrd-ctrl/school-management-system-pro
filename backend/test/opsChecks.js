// Backups, restore drills and operations alerts (E33).
module.exports = async ({ call, expect, log, tokens }) => {
  const zlib = require('zlib'); const crypto = require('crypto');
  const mongoose = require('../lib/pgdoc');
  const School = require('../models/School'); const Student = require('../models/Student');
  const Backup = require('../models/Backup'); const BackupRun = require('../models/BackupRun'); const RestoreDrill = require('../models/RestoreDrill');
  const SA = tokens.superadmin;
  const setData = (id, buf) => mongoose.db.get().query(`UPDATE ${Backup.table} SET bin_data = $1 WHERE id = $2`, [buf, String(id)]);
  console.log('\n— Backups, restore drills and alerts —');

  const school = await School.findOne({ code: 'DEMO01' });
  const sid = String(school._id);
  await Backup.deleteMany({ schoolId: sid }); await BackupRun.deleteMany({ schoolId: sid }); await RestoreDrill.deleteMany({ schoolId: sid });

  const none = await expect('drill without any backup is refused', call('POST', `/superadmin/schools/${sid}/restore-drill`, SA, {}), [422]);
  log(/no backup/i.test(none.data.message), 'the refusal says to make a backup first');
  await expect('school admin cannot run a drill', call('POST', `/superadmin/schools/${sid}/restore-drill`, tokens.admin, {}), [401, 403]);
  await expect('school admin cannot read ops health', call('GET', '/superadmin/ops/health', tokens.admin), [401, 403]);
  await expect('invalid school id rejected', call('POST', '/superadmin/schools/not-an-id/restore-drill', SA, {}), [400]);

  const snap = await require('../utils/backup').createSnapshot(sid, { kind: 'manual', createdByName: 'Owner' });
  const bk = { data: { backup: { _id: snap._id } } };
  const runs = await call('GET', `/superadmin/ops/backup-runs?schoolId=${sid}`, SA);
  const run = runs.data.runs[0];
  log(runs.data.runs.length === 1 && run.status === 'Succeeded' && /^[a-f0-9]{64}$/.test(run.checksum) && run.rowCount > 0, 'every backup attempt is recorded with a checksum and row count');
  const stored = await Backup.findById(bk.data.backup._id).select('+data');
  const raw = zlib.gunzipSync(stored.data);
  log(stored.checksum === crypto.createHash('sha256').update(raw).digest('hex'), 'the saved checksum matches the saved data');

  const before = await Student.countDocuments({ schoolId: sid });
  const d1 = await expect('restore drill runs on the backup', call('POST', `/superadmin/schools/${sid}/restore-drill`, SA, {}));
  const drill = d1.data.drill;
  log(drill.status === 'Passed' && drill.limited === false, 'a healthy backup passes the drill with no skipped checks');
  log(drill.checks.filter((c) => !c.warn && !c.info).every((c) => c.ok === true) && drill.checks.length >= 6, `all ${drill.checks.length} checks reported (readable, checksum, school, counts, sandbox, links, drift)`);
  log(drill.rowsRestored > 100, `${drill.rowsRestored} rows were restored into the sandbox and compared`);
  log((await Student.countDocuments({ schoolId: sid })) === before, 'live data is untouched by a drill');
  const { rows: tmp } = await mongoose.db.get().query("SELECT count(*)::int AS n FROM pg_tables WHERE tablename LIKE 'drill\\_%'");
  log(tmp[0].n === 0, 'the sandbox leaves nothing behind');

  const listed = await call('GET', `/superadmin/ops/restore-drills?schoolId=${sid}`, SA);
  log(listed.data.drills.length === 1 && listed.data.drills[0].status === 'Passed', 'drill history is kept');
  const refreshed = await Backup.findById(bk.data.backup._id); log(refreshed.lastDrillStatus === 'Passed', 'the backup is marked as proven');

  let h = (await call('GET', '/superadmin/ops/health', SA)).data;
  const row = h.schools.find((x) => String(x.schoolId) === sid);
  log(row.backup === 'Healthy' && row.proof === 'Proven', 'health shows a healthy, proven backup for the school');
  log(!h.alerts.some((a) => String(a.schoolId) === sid), 'no alerts for a school with a proven backup');

  // corruption is detected: change the stored bytes but keep the saved checksum
  const obj = JSON.parse(raw.toString()); obj.tables.Student[0].name = 'TAMPERED';
  await setData(stored._id, zlib.gzipSync(Buffer.from(JSON.stringify(obj))));
  const d2 = (await call('POST', `/superadmin/schools/${sid}/restore-drill`, SA, {})).data.drill;
  log(d2.status === 'Failed' && d2.checks.find((c) => /Checksum/.test(c.name)).ok === false, 'a backup whose data was changed fails the checksum and the drill FAILS');

  // a backup that lost rows but still says it has them
  const obj2 = JSON.parse(raw.toString()); obj2.tables.Student.pop();
  const buf2 = Buffer.from(JSON.stringify(obj2));
  await setData(stored._id, zlib.gzipSync(buf2)); await Backup.findByIdAndUpdate(stored._id, { checksum: crypto.createHash('sha256').update(buf2).digest('hex') });
  const d3 = (await call('POST', `/superadmin/schools/${sid}/restore-drill`, SA, {})).data.drill;
  log(d3.status === 'Failed' && d3.checks.find((c) => /Row counts/.test(c.name)).ok === false, 'a backup missing rows it recorded fails the count check');

  // unreadable file
  await setData(stored._id, Buffer.from('not a gzip file'));
  const d4 = (await call('POST', `/superadmin/schools/${sid}/restore-drill`, SA, {})).data.drill;
  log(d4.status === 'Failed' && d4.checks[0].ok === false, 'an unreadable backup fails safely');

  // old backup without a checksum: can pass, but is labelled as limited, never as fully proven
  await setData(stored._id, zlib.gzipSync(raw)); await Backup.findByIdAndUpdate(stored._id, { checksum: '' });
  const d5 = (await call('POST', `/superadmin/schools/${sid}/restore-drill`, SA, {})).data.drill;
  log(d5.status === 'Passed' && d5.limited === true, 'a backup from before checksums passes only as "limited"');
  await Backup.findByIdAndUpdate(stored._id, { checksum: crypto.createHash('sha256').update(raw).digest('hex') });

  // alerts: failed job, stale data
  await BackupRun.create({ schoolId: sid, schoolName: school.name, trigger: 'weekly', status: 'Failed', error: 'disk full', startedAt: new Date() });
  h = (await call('GET', '/superadmin/ops/health', SA)).data;
  log(h.ok === false && h.alerts.some((a) => a.kind === 'failed-backup' && /disk full/.test(a.message)), 'a failed backup job raises an alert with the reason');
  await BackupRun.deleteMany({ schoolId: sid, status: 'Failed' });
  await BackupRun.updateMany({ schoolId: sid }, { $set: { startedAt: new Date(Date.now() - 20 * 86400000) } });
  await School.findByIdAndUpdate(sid, { createdAt: new Date(Date.now() - 90 * 86400000) });
  h = (await call('GET', '/superadmin/ops/health', SA)).data;
  log(h.alerts.some((a) => a.kind === 'stale-backup' && String(a.schoolId) === sid), 'a backup older than 8 days raises a stale-data alert');
  log(h.alerts.some((a) => a.kind === 'failed-drill'), 'a recently failed drill is surfaced as an alert');

  // scheduled drills prove the least-recently-proven schools
  await RestoreDrill.deleteMany({ schoolId: sid });
  await BackupRun.updateMany({ schoolId: sid }, { $set: { startedAt: new Date() } });
  const out = await require('../utils/restoreDrill').runDueDrills({ max: 2 });
  log(out.some((o) => o.school === school.name && o.status === 'Passed'), 'the scheduled job proves an unproven backup');

  const need = { BackupRun: 3, RestoreDrill: 3 };
  const { rows } = await mongoose.db.get().query("SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'");
  const low = Object.entries(need).filter(([n, c]) => rows.filter((r) => r.tablename === mongoose.model(n).table && !/_pkey$/.test(r.indexname)).length < c);
  log(low.length === 0, 'backup and drill collections are indexed');
};
