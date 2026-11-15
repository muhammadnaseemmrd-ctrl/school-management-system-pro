// Translate Mongo-style filters, sorts and projections into SQL over (id text, doc jsonb).
const { ObjectId, CastError, HEX24, isPlain } = require('./schema');

const SEG = /^[A-Za-z0-9_$-]+$/;
const segs = (p) => {
  const parts = String(p).split('.');
  for (const s of parts) if (!SEG.test(s)) throw new Error(`Unsafe field path: ${p}`);
  return parts;
};
// jsonb text-array literal for #> and #>>; stable text so expression indexes match.
const pathLit = (p) => `'{${segs(p).join(',')}}'`;
const E = (p) => `(doc #> ${pathLit(p)})`;
const T = (p) => `(doc #>> ${pathLit(p)})`;
const jsonPath = (p) => '$.' + segs(p).map((s) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : JSON.stringify(s))).join('.');

// Convert a query operand into its stored (JSON) form using the schema type of the path.
function castOperand(desc, v, path) {
  if (v === undefined || v === null) return null;
  if (v instanceof ObjectId) return v.toHexString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (desc && desc.kind === 'leaf') {
    switch (desc.type) {
      case 'objectid': {
        if (typeof v === 'string' && HEX24.test(v)) return v.toLowerCase();
        if (v && typeof v === 'object' && v._id) return castOperand(desc, v._id, path);
        throw new CastError('ObjectId', v, path);
      }
      case 'number': {
        if (typeof v === 'number') return v;
        const n = Number(v);
        if (v === '' || Number.isNaN(n)) throw new CastError('Number', v, path);
        return n;
      }
      case 'date': {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) throw new CastError('date', v, path);
        return d.toISOString();
      }
      case 'boolean': return v === true || v === 'true' || v === 1 || v === '1';
      case 'string': return typeof v === 'string' ? v : String(v);
      default: break;
    }
  }
  if (Array.isArray(v)) return v.map((x) => castOperand(desc, x, path));
  if (v && typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  return v;
}

const isOpObject = (v) => isPlain(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => k.startsWith('$'));
const reSource = (re) => (re instanceof RegExp ? re.source : String(re));
const reFlags = (re, opt) => ((re instanceof RegExp && re.flags.includes('i')) || (opt && String(opt).includes('i')) ? 'i' : '');

class Ctx {
  constructor(schema) { this.schema = schema; this.params = []; }
  p(v) { this.params.push(v); return `$${this.params.length}`; }
  json(v) { return `${this.p(JSON.stringify(v === undefined ? null : v))}::jsonb`; }
}

function idCond(ctx, op, v) {
  const norm = (x) => { if (x === undefined || x === null) return null; if (x instanceof ObjectId) return x.toHexString(); if (typeof x === 'string' && HEX24.test(x)) return x.toLowerCase(); throw new CastError('ObjectId', x, '_id'); };
  switch (op) {
    case '$eq': { const x = norm(v); return x === null ? 'FALSE' : `id = ${ctx.p(x)}`; }
    case '$ne': { const x = norm(v); return x === null ? 'TRUE' : `id <> ${ctx.p(x)}`; }
    case '$in': { const l = (v || []).map(norm).filter((x) => x !== null); return l.length ? `id IN (${l.map((x) => ctx.p(x)).join(',')})` : 'FALSE'; }
    case '$nin': { const l = (v || []).map(norm).filter((x) => x !== null); return l.length ? `id NOT IN (${l.map((x) => ctx.p(x)).join(',')})` : 'TRUE'; }
    case '$exists': return v ? 'TRUE' : 'FALSE';
    case '$gt': case '$gte': case '$lt': case '$lte': {
      const sym = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op];
      return `id ${sym} ${ctx.p(norm(v))}`;
    }
    default: throw new Error(`Unsupported operator on _id: ${op}`);
  }
}

// One operator applied to one field.
function opCond(ctx, field, info, op, v, siblings) {
  const desc = info.desc;
  const useArr = info.inArray;
  const cast = (x) => castOperand(desc, x, field);
  const jp = jsonPath(field);
  const arrExists = (pred, vars) => `jsonb_path_exists(doc, ${ctx.p(`${jp} ? (${pred})`)}::jsonpath, ${ctx.p(JSON.stringify(vars))}::jsonb)`;

  switch (op) {
    case '$eq': return eqCond(ctx, field, info, v);
    case '$ne': return `NOT (${eqCond(ctx, field, info, v)})`;
    case '$gt': case '$gte': case '$lt': case '$lte': {
      const sym = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op];
      const val = cast(v);
      if (val === null) return 'FALSE';
      if (useArr) return arrExists(`@ ${sym} $v`, { v: val });
      return `(${E(field)} ${sym} ${ctx.json(val)}) IS TRUE`;
    }
    case '$in': case '$nin': {
      const list = Array.isArray(v) ? v : [v];
      const parts = list.map((x) => (x instanceof RegExp ? regexCond(ctx, field, info, x, '') : eqCond(ctx, field, info, x)));
      const c = parts.length ? `(${parts.join(' OR ')})` : 'FALSE';
      return op === '$in' ? c : `NOT ${c}`;
    }
    case '$exists': {
      const c = useArr ? `jsonb_path_exists(doc, ${ctx.p(jp)}::jsonpath)` : `${E(field)} IS NOT NULL`;
      return v ? c : `NOT (${c})`;
    }
    case '$regex': return regexCond(ctx, field, info, v, siblings.$options);
    case '$options': return 'TRUE';
    case '$not': return `NOT (${fieldCond(ctx, field, info, v)})`;
    case '$size': {
      return `COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(${E(field)})='array' THEN ${E(field)} ELSE '[]'::jsonb END), 0) = ${ctx.p(Number(v))}`;
    }
    case '$all': {
      const list = (Array.isArray(v) ? v : [v]).map((x) => eqCond(ctx, field, info, x));
      return list.length ? `(${list.join(' AND ')})` : 'TRUE';
    }
    case '$elemMatch': {
      // Supports equality / comparison conditions on the fields of array elements.
      const conds = []; const vars = {}; let n = 0;
      const addC = (k, val) => {
        const sub = k === '' ? '@' : `@.${segs(k).join('.')}`;
        if (isOpObject(val)) {
          for (const [o, x] of Object.entries(val)) {
            const sym = { $eq: '==', $ne: '!=', $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[o];
            if (!sym) throw new Error(`Unsupported $elemMatch operator ${o}`);
            const name = `v${n++}`; vars[name] = castOperand(undefined, x); conds.push(`${sub} ${sym} $${name}`);
          }
        } else { const name = `v${n++}`; vars[name] = castOperand(undefined, val); conds.push(`${sub} == $${name}`); }
      };
      for (const [k, val] of Object.entries(v)) addC(k, val);
      return `jsonb_path_exists(doc, ${ctx.p(`${jp}[*] ? (${conds.join(' && ')})`)}::jsonpath, ${ctx.p(JSON.stringify(vars))}::jsonb)`;
    }
    default: throw new Error(`Unsupported query operator: ${op}`);
  }
}

function eqCond(ctx, field, info, v) {
  if (v instanceof RegExp) return regexCond(ctx, field, info, v, '');
  const val = castOperand(info.desc, v, field);
  if (val === null) {
    if (info.inArray) return `NOT jsonb_path_exists(doc, ${ctx.p(`${jsonPath(field)} ? (@ != null)`)}::jsonpath)`;
    return `(${E(field)} IS NULL OR ${E(field)} = 'null'::jsonb)`;
  }
  if (info.inArray) {
    return `jsonb_path_exists(doc, ${ctx.p(`${jsonPath(field)} ? (@ == $v)`)}::jsonpath, ${ctx.p(JSON.stringify({ v: val }))}::jsonb)`;
  }
  if (ctx.ci && typeof val === 'string') return `(lower(${T(field)}) = lower(${ctx.p(val)})) IS TRUE`;
  return `(${E(field)} = ${ctx.json(val)}) IS TRUE`;
}

function regexCond(ctx, field, info, re, opt) {
  const src = reSource(re); const flags = reFlags(re, opt);
  if (info.inArray) {
    return `jsonb_path_exists(doc, ${ctx.p(`${jsonPath(field)} ? (@ like_regex ${JSON.stringify(src)}${flags ? ' flag "i"' : ''})`)}::jsonpath)`;
  }
  return `(${T(field)} ${flags ? '~*' : '~'} ${ctx.p(src)}) IS TRUE`;
}

function fieldCond(ctx, field, info, val) {
  if (val instanceof RegExp) return regexCond(ctx, field, info, val, '');
  if (isOpObject(val)) {
    const parts = Object.entries(val).filter(([o]) => o !== '$options').map(([o, x]) => opCond(ctx, field, info, o, x, val));
    return parts.length ? `(${parts.join(' AND ')})` : 'TRUE';
  }
  return eqCond(ctx, field, info, val);
}

function buildFilter(schema, filter, ctx) {
  if (!filter || typeof filter !== 'object') return 'TRUE';
  const parts = [];
  for (const [key, raw] of Object.entries(filter)) {
    if (key === '$or' || key === '$and' || key === '$nor') {
      const list = (raw || []).map((f) => buildFilter(schema, f, ctx));
      if (!list.length) continue;
      if (key === '$or') parts.push(`(${list.join(' OR ')})`);
      else if (key === '$and') parts.push(`(${list.join(' AND ')})`);
      else parts.push(`NOT (${list.join(' OR ')})`);
      continue;
    }
    if (key.startsWith('$')) throw new Error(`Unsupported top-level operator: ${key}`);
    const val = raw === undefined ? null : raw;
    if (key === '_id' || key === 'id') {
      if (isOpObject(val)) { for (const [o, x] of Object.entries(val)) parts.push(idCond(ctx, o, x)); }
      else parts.push(idCond(ctx, Array.isArray(val) ? '$in' : '$eq', val));
      continue;
    }
    const info = schema.resolve(key) || { desc: undefined, inArray: false };
    parts.push(fieldCond(ctx, key, info, val));
  }
  return parts.length ? parts.join(' AND ') : 'TRUE';
}

// ---- sort / projection

const DIR = (v) => (v === -1 || v === 'desc' || v === 'descending' ? -1 : 1);
function parseSort(sort) {
  if (!sort) return [];
  if (typeof sort === 'string') {
    return sort.split(/\s+/).filter(Boolean).map((s) => (s.startsWith('-') ? [s.slice(1), -1] : [s.replace(/^\+/, ''), 1]));
  }
  if (Array.isArray(sort)) return sort.map(([k, d]) => [k, DIR(d)]);
  return Object.entries(sort).map(([k, d]) => [k, DIR(d)]);
}
function orderBy(sort) {
  const list = parseSort(sort);
  const parts = list.map(([k, d]) => {
    const col = k === '_id' || k === 'id' ? 'id' : E(k);
    return `${col} ${d === -1 ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`;
  });
  if (!list.some(([k]) => k === '_id' || k === 'id')) parts.push('id ASC');
  return `ORDER BY ${parts.join(', ')}`;
}

// -> { include:Set|null, exclude:Set, force:Set }
function parseSelect(sel) {
  const out = { include: null, exclude: new Set(), force: new Set() };
  if (!sel) return out;
  const items = typeof sel === 'string'
    ? sel.split(/\s+/).filter(Boolean).map((s) => (s.startsWith('-') ? [s.slice(1), 0] : s.startsWith('+') ? [s.slice(1), '+'] : [s, 1]))
    : Object.entries(sel).map(([k, v]) => [k, v === 1 || v === true ? 1 : 0]);
  for (const [k, v] of items) {
    const top = k.split('.')[0];
    if (v === '+') out.force.add(top);
    else if (v === 1) { out.include = out.include || new Set(); out.include.add(top); }
    else out.exclude.add(top);
  }
  return out;
}

module.exports = { Ctx, buildFilter, orderBy, parseSort, parseSelect, castOperand, E, T, pathLit, segs, isOpObject };
