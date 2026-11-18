// Small aggregation engine: first $match runs in SQL, the rest ($group/$sort/$limit/...) runs in JS on typed documents.
const db = require('./db');
const W = require('./where');
const { ObjectId } = require('./schema');

const getPath = (obj, path) => String(path).split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj);
const keyOf = (v) => JSON.stringify(v, (k, x) => (x instanceof ObjectId ? x.toHexString() : x));

function evalExpr(e, doc) {
  if (typeof e === 'string' && e.startsWith('$')) return getPath(doc, e.slice(1));
  if (e && typeof e === 'object' && !(e instanceof Date) && !(e instanceof ObjectId)) {
    const ks = Object.keys(e);
    if (ks.length === 1 && ks[0].startsWith('$')) {
      const op = ks[0]; const arg = e[op];
      const d = () => { const v = evalExpr(Array.isArray(arg) ? arg[0] : arg, doc); return v instanceof Date ? v : v ? new Date(v) : null; };
      switch (op) {
        case '$year': return d() && d().getUTCFullYear();
        case '$month': return d() && d().getUTCMonth() + 1;
        case '$dayOfMonth': return d() && d().getUTCDate();
        case '$dayOfWeek': return d() && d().getUTCDay() + 1;
        case '$hour': return d() && d().getUTCHours();
        case '$add': return arg.reduce((a, x) => a + (Number(evalExpr(x, doc)) || 0), 0);
        case '$multiply': return arg.reduce((a, x) => a * (Number(evalExpr(x, doc)) || 0), 1);
        case '$ifNull': { const v = evalExpr(arg[0], doc); return v === null || v === undefined ? evalExpr(arg[1], doc) : v; }
        case '$toString': return String(evalExpr(arg, doc));
        default: throw new Error(`Unsupported aggregation expression ${op}`);
      }
    }
    const o = {}; for (const [k, v] of Object.entries(e)) o[k] = evalExpr(v, doc); return o;
  }
  return e;
}

function group(docs, spec) {
  const groups = new Map();
  for (const doc of docs) {
    const id = evalExpr(spec._id === undefined ? null : spec._id, doc);
    const k = keyOf(id);
    if (!groups.has(k)) groups.set(k, { id, rows: [] });
    groups.get(k).rows.push(doc);
  }
  const out = [];
  for (const g of groups.values()) {
    const row = { _id: g.id };
    for (const [field, acc] of Object.entries(spec)) {
      if (field === '_id') continue;
      const [op, arg] = Object.entries(acc)[0];
      const vals = () => g.rows.map((r) => evalExpr(arg, r));
      switch (op) {
        case '$sum': row[field] = vals().reduce((a, x) => a + (typeof x === 'number' ? x : 0), 0); break;
        case '$avg': { const v = vals().filter((x) => typeof x === 'number'); row[field] = v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; break; }
        case '$min': row[field] = vals().reduce((a, x) => (a === undefined || x < a ? x : a), undefined); break;
        case '$max': row[field] = vals().reduce((a, x) => (a === undefined || x > a ? x : a), undefined); break;
        case '$first': row[field] = vals()[0]; break;
        case '$last': { const v = vals(); row[field] = v[v.length - 1]; break; }
        case '$push': row[field] = vals(); break;
        case '$addToSet': { const seen = new Set(); row[field] = vals().filter((x) => { const k = keyOf(x); if (seen.has(k)) return false; seen.add(k); return true; }); break; }
        case '$count': row[field] = g.rows.length; break;
        default: throw new Error(`Unsupported accumulator ${op}`);
      }
    }
    out.push(row);
  }
  return out;
}

// Fast path: [$match?, $group { _id: null | '$field', x: { $sum: '$numField' | <number> } | { $count: {} } ... }, $sort/$limit...]
// runs as one GROUP BY in Postgres instead of loading every matching row into memory.
// Returns undefined when the pipeline is not that simple (the JS engine below handles it).
async function trySqlGroup(M, stages, filter) {
  const g = stages[0] && stages[0].$group;
  if (!g) return undefined;
  const idExpr = g._id === undefined ? null : g._id;
  let keyPath = null; let keyType = null;
  if (idExpr !== null) {
    if (typeof idExpr !== 'string' || !idExpr.startsWith('$')) return undefined;
    keyPath = idExpr.slice(1);
    const r = M.schema.resolve(keyPath);
    if (!r || r.unknown || r.inArray || !r.desc || r.desc.kind !== 'leaf' || !['string', 'number', 'boolean', 'objectid'].includes(r.desc.type)) return undefined;
    keyType = r.desc.type;
  }
  const ctx = new W.Ctx(M.schema);
  const where = W.buildFilter(M.schema, filter, ctx);
  const cols = [];
  for (const [field, acc] of Object.entries(g)) {
    if (field === '_id') continue;
    if (!acc || typeof acc !== 'object') return undefined;
    const [op, arg] = Object.entries(acc)[0] || [];
    if (op === '$sum' && typeof arg === 'number' && Number.isFinite(arg)) cols.push({ field, sql: `COALESCE(SUM(${arg}), 0)` });
    else if (op === '$sum' && typeof arg === 'string' && arg.startsWith('$')) {
      const r = M.schema.resolve(arg.slice(1));
      if (!r || r.unknown || r.inArray || !r.desc || r.desc.kind !== 'leaf' || r.desc.type !== 'number') return undefined;
      cols.push({ field, sql: `COALESCE(SUM(CASE WHEN jsonb_typeof(${W.E(arg.slice(1))}) = 'number' THEN (${W.T(arg.slice(1))})::numeric END), 0)` });
    } else if (op === '$count') cols.push({ field, sql: 'COUNT(*)' });
    else return undefined;
  }
  const keySql = keyPath ? `${W.T(keyPath)} AS k, ` : '';
  const sql = `SELECT ${keySql}${cols.map((c, i) => `${c.sql} AS c${i}`).join(', ')}${cols.length ? '' : '1 AS one'} FROM "${M.table}" WHERE ${where}${keyPath ? ` GROUP BY ${W.T(keyPath)}` : ''}`;
  const { rows } = await db.get().query(sql, ctx.params);
  const out = rows.map((r) => {
    const row = { _id: null };
    if (keyPath) {
      const raw = r.k;
      row._id = raw === null || raw === undefined ? null : keyType === 'number' ? Number(raw) : keyType === 'boolean' ? raw === 'true' : keyType === 'objectid' ? new ObjectId(raw) : raw;
    }
    cols.forEach((c, i) => { row[c.field] = Number(r[`c${i}`]); });
    return row;
  });
  return out;
}

async function runAggregate(M, pipeline) {
  const stages = [...pipeline];
  let filter = {};
  if (stages[0] && stages[0].$match) filter = stages.shift().$match;
  const fast = await trySqlGroup(M, stages, filter);
  if (fast) {
    let docs = fast;
    for (const st of stages.slice(1)) {
      const [op, arg] = Object.entries(st)[0];
      if (op === '$sort') {
        const keys = Object.entries(arg);
        docs.sort((a, b) => { for (const [k, d] of keys) { const x = getPath(a, k); const y = getPath(b, k); if (x < y) return -d; if (x > y) return d; } return 0; });
      } else if (op === '$limit') docs = docs.slice(0, arg);
      else if (op === '$skip') docs = docs.slice(arg);
      else throw new Error(`Unsupported aggregation stage ${op}`);
    }
    return docs;
  }
  const ctx = new W.Ctx(M.schema);
  const where = W.buildFilter(M.schema, filter, ctx);
  const { rows } = await db.get().query(`SELECT id, doc FROM "${M.table}" WHERE ${where}`, ctx.params);
  let docs = rows.map((r) => M._fromRow(r, { include: null, exclude: new Set(), force: new Set() }, true));
  for (const st of stages) {
    const [op, arg] = Object.entries(st)[0];
    if (op === '$group') docs = group(docs, arg);
    else if (op === '$sort') {
      const keys = Object.entries(arg);
      docs.sort((a, b) => { for (const [k, d] of keys) { const x = getPath(a, k); const y = getPath(b, k); if (x < y) return -d; if (x > y) return d; } return 0; });
    } else if (op === '$limit') docs = docs.slice(0, arg);
    else if (op === '$skip') docs = docs.slice(arg);
    else if (op === '$count') docs = [{ [arg]: docs.length }];
    else if (op === '$match') {
      const { buildFilter } = W; // late match: evaluate simple equality in JS
      docs = docs.filter((d) => Object.entries(arg).every(([k, v]) => keyOf(getPath(d, k)) === keyOf(v)));
    } else if (op === '$project') {
      docs = docs.map((d) => { const o = {}; for (const [k, v] of Object.entries(arg)) { if (v === 1 || v === true) o[k] = getPath(d, k); else if (v !== 0) o[k] = evalExpr(v, d); } if (arg._id !== 0) o._id = d._id; return o; });
    } else throw new Error(`Unsupported aggregation stage ${op}`);
  }
  return docs;
}

module.exports = { runAggregate };
