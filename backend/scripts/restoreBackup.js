#!/usr/bin/env node
/**
 * Restore one school's data from a backup.
 *
 *   node scripts/restoreBackup.js --backup <stored backup id>           (a weekly/manual copy kept in the database)
 *   node scripts/restoreBackup.js --file path/to/backup.json            (backup.json from a downloaded ZIP)
 *   add  --replace   to first remove the school's current rows in the restored tables (full roll-back)
 *   add  --dry-run   to only show what would be restored
 *
 * Rows are matched by id: existing rows are overwritten, missing rows are re-created. Backups downloaded from the
 * app have no passwords, so restored users must reset their password (stored copies keep them).
 * Uploaded file contents are not part of backups, so StoredFile rows are skipped.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs'); const zlib = require('zlib');
const mongoose = require('../lib/pgdoc');
const registry = require('../lib/pgdoc/registry');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const q = (id) => `"${String(id).replace(/"/g, '""')}"`;

(async () => {
  await mongoose.connect();
  let payload;
  if (arg('file')) payload = JSON.parse(fs.readFileSync(arg('file'), 'utf8'));
  else if (arg('backup')) {
    const b = await require('../models/Backup').findById(arg('backup')).select('+data');
    if (!b) throw new Error('Backup not found');
    payload = JSON.parse(zlib.gunzipSync(b.data).toString());
  } else { console.error('Usage: node scripts/restoreBackup.js --backup <id> | --file backup.json [--replace] [--dry-run]'); process.exit(1); }
  if (payload.format !== 'darsgah-backup') throw new Error('This is not a Darsgah backup file');

  const schoolId = String(payload.school._id);
  const dry = !!arg('dry-run'); const replace = !!arg('replace');
  console.log(`Restoring "${payload.school.name}" (${payload.school.code}) from ${payload.createdAt}${dry ? ' [dry run]' : ''}${replace ? ' [replace]' : ''}`);
  if (payload.credentials === 'removed') console.log('Note: this backup has no passwords – users will need a password reset.');

  const work = [['School', [payload.school]], ...Object.entries(payload.tables).filter(([n]) => n !== 'StoredFile')];
  if (dry) { work.forEach(([n, rows]) => console.log(`  ${n}: ${rows.length}`)); process.exit(0); }

  await mongoose.db.get().tx(async (query) => {
    for (const [name, rows] of work) {
      const M = registry.get(name); if (!M) continue;
      if (replace && name !== 'School') await query(`DELETE FROM ${q(M.table)} WHERE doc->>'schoolId' = $1`, [schoolId]);
      for (const r of rows) {
        const { _id, ...doc } = r;
        await query(`INSERT INTO ${q(M.table)} (id, doc) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc`, [String(_id), JSON.stringify(doc)]);
      }
      console.log(`  ${name}: ${rows.length} restored`);
    }
  });
  console.log('Done.');
  process.exit(0);
})().catch((e) => { console.error('Restore failed:', e.message); process.exit(1); });
