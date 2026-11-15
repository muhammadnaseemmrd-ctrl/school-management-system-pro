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

async function runAggregate(M, pipeline) {
  const stages = [...pipeline];
  let filter = {};
  if (stages[0] && stages[0].$match) filter = stages.shift().$match;
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
