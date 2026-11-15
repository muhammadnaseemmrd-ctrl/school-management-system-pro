// Database driver adapter: node-postgres (production: Neon / Vercel Postgres) or PGlite (in-process Postgres for
// local development and tests, no installation required).
let impl = null;
let info = { host: 'none', driver: 'none' };

const normalize = (r) => ({
  rows: (r.rows || []).map((row) => {
    for (const k of Object.keys(row)) if (row[k] instanceof Uint8Array && !Buffer.isBuffer(row[k])) row[k] = Buffer.from(row[k]);
    return row;
  }),
  rowCount: r.rowCount !== undefined ? r.rowCount : (r.affectedRows !== undefined ? r.affectedRows : (r.rows || []).length),
});

async function connectPg(url) {
  const { Pool } = require('pg');
  const u = new URL(url);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 4),
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    ssl: /localhost|127\.0\.0\.1/.test(u.hostname) || u.searchParams.get('sslmode') === 'disable' ? undefined : { rejectUnauthorized: false },
  });
  pool.on('error', (e) => console.error('pg pool error:', e.message));
  await pool.query('select 1');
  info = { host: u.hostname, driver: 'pg' };
  return {
    query: async (text, params) => normalize(await pool.query(text, params)),
    tx: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(async (text, params) => normalize(await c.query(text, params)));
        await c.query('COMMIT');
        return r;
      } catch (e) {
        try { await c.query('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      } finally { c.release(); }
    },
    close: () => pool.end(),
  };
}

async function connectLite(dir) {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite(dir || undefined);
  await db.waitReady;
  info = { host: dir ? `pglite:${dir}` : 'pglite:memory', driver: 'pglite' };
  return {
    query: async (text, params) => normalize(await db.query(text, params)),
    tx: (fn) => db.transaction(async (tx) => fn(async (text, params) => normalize(await tx.query(text, params)))),
    close: () => db.close(),
  };
}

async function connect(uri) {
  if (impl) return impl;
  const url = uri || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (url && /^postgres(ql)?:\/\//i.test(url)) impl = await connectPg(url);
  else if (url && url.startsWith('pglite:')) impl = await connectLite(url.slice(7) === 'memory' ? null : url.slice(7));
  else if (process.env.PGLITE_DIR) impl = await connectLite(process.env.PGLITE_DIR);
  else throw new Error('No database configured. Set DATABASE_URL (Postgres connection string) or PGLITE_DIR for a local file database.');
  return impl;
}

const get = () => { if (!impl) throw new Error('Database is not connected yet'); return impl; };
const close = async () => { if (impl) { const i = impl; impl = null; await i.close(); } };

module.exports = { connect, get, close, info: () => info, isConnected: () => !!impl };
