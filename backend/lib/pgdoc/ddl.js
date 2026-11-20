// Create tables + indexes for every registered model (idempotent, skipped when nothing changed).
const crypto = require('crypto');
const db = require('./db');
const registry = require('./registry');
const W = require('./where');
const { q, bufferPaths } = require('./model');

const short = (s) => (s.length <= 60 ? s : `${s.slice(0, 40)}_${crypto.createHash('sha1').update(s).digest('hex').slice(0, 10)}`);

function plan() {
  const stmts = []; const ttl = [];
  for (const M of registry.models.values()) {
    const t = M.table;
    const bins = bufferPaths(M.schema);
    stmts.push(`CREATE TABLE IF NOT EXISTS ${q(t)} (id text PRIMARY KEY, doc jsonb NOT NULL DEFAULT '{}'::jsonb${bins.map((p) => `, ${q(`bin_${p}`)} bytea`).join('')})`);
    const specs = M.schema.collectIndexes();
    if (M.schema.children.schoolId && !specs.some((s) => Object.keys(s.fields)[0] === 'schoolId')) specs.push({ fields: { schoolId: 1 }, options: {} });
    const seen = new Set();
    for (const { fields, options } of specs) {
      const keys = Object.keys(fields);
      if (options.expireAfterSeconds && keys.length === 1) { ttl.push({ table: t, field: keys[0], seconds: options.expireAfterSeconds }); continue; }
      if (keys.some((k) => k === '_id')) continue;
      const name = short(`${t}_${keys.join('_')}_${options.unique ? 'uq' : 'ix'}`);
      if (seen.has(name)) continue; seen.add(name);
      if (options.unique) {
        M._uniques[name] = keys;
        stmts.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${q(name)} ON ${q(t)} (${keys.map((k) => `NULLIF(${W.E(k)}, 'null'::jsonb)`).join(', ')})`);
      } else {
        stmts.push(`CREATE INDEX IF NOT EXISTS ${q(name)} ON ${q(t)} (${keys.map((k) => W.E(k)).join(', ')})`);
      }
    }
  }
  return { stmts, ttl };
}

async function ensureSchema() {
  const { stmts, ttl } = plan();
  const hash = crypto.createHash('sha1').update(stmts.join(';')).digest('hex');
  const d = db.get();
  await d.query('CREATE TABLE IF NOT EXISTS pgdoc_meta (k text PRIMARY KEY, v text)');
  const cur = await d.query(`SELECT v FROM pgdoc_meta WHERE k = 'schema_hash'`);
  if (!(cur.rows[0] && cur.rows[0].v === hash)) {
    await d.tx(async (query) => {
      await query('SELECT pg_advisory_xact_lock(727274)');
      const again = await query(`SELECT v FROM pgdoc_meta WHERE k = 'schema_hash'`);
      if (again.rows[0] && again.rows[0].v === hash) return;
      // One round trip per batch instead of per statement: hundreds of sequential CREATE ... IF NOT EXISTS calls to a
      // remote Postgres can take longer than a serverless function is allowed to run after a deploy.
      if (db.info().driver === 'pg') {
        for (let i = 0; i < stmts.length; i += 40) await query(stmts.slice(i, i + 40).join(';\n'));
      } else {
        for (const s of stmts) await query(s);
      }
      await query(`INSERT INTO pgdoc_meta (k, v) VALUES ('schema_hash', $1) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`, [hash]);
    });
  }
  return ttl;
}

let ttlRules = [];
let lastSweep = 0;
async function sweepExpired(force) {
  if (!force && Date.now() - lastSweep < 3600 * 1000) return;
  lastSweep = Date.now();
  for (const r of ttlRules) {
    try {
      await db.get().query(`DELETE FROM ${q(r.table)} WHERE (doc #>> ${W.pathLit(r.field)})::timestamptz < now() - ($1 || ' seconds')::interval`, [String(r.seconds)]);
    } catch (e) { console.warn('ttl sweep failed:', e.message); }
  }
}

async function init() {
  ttlRules = await ensureSchema();
  await sweepExpired(true);
}

module.exports = { init, sweepExpired, plan };
