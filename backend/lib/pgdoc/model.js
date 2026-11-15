// Document / Model / Query implementation over Postgres (id text PK + doc jsonb [+ bytea columns]).
const db = require('./db');
const registry = require('./registry');
const W = require('./where');
const { populateDocs } = require('./populate');
const { runAggregate } = require('./aggregate');
const {
  ObjectId, ValidationError, CastError, buildDoc, validateDoc, validateValue, castDesc, toStoredValue, objectIdFrom, isPlain, HEX24,
} = require('./schema');

const q = (id) => `"${String(id).replace(/"/g, '""')}"`;
const pluralize = (n) => {
  const s = n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (/(s|x|ch|sh)$/.test(s)) return `${s}es`;
  if (/[^aeiou]y$/.test(s)) return `${s.slice(0, -1)}ies`;
  return `${s}s`;
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- helpers

function plain(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof Document) return v.toObject();
  if (v instanceof ObjectId || v instanceof Date || Buffer.isBuffer(v)) return v;
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [k, plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = plain(x); return o; }
  return v;
}

async function runHooks(list, doc) {
  for (const fn of list || []) {
    await new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => { if (settled) return; settled = true; err ? reject(err) : resolve(); };
      let r;
      try { r = fn.length >= 1 ? fn.call(doc, done) : fn.call(doc); } catch (e) { return done(e); }
      if (r && typeof r.then === 'function') r.then(() => done(), done);
      else if (fn.length === 0) done();
    });
  }
}

function mapPgError(e, M) {
  if (e && e.code === '23505') {
    const name = e.constraint || (String(e.message).match(/"([^"]+)"/) || [])[1];
    const spec = M._uniques && M._uniques[name];
    const err = new Error(`E11000 duplicate key error collection: ${M.modelName} index: ${name} dup key`);
    err.name = 'MongoServerError';
    err.code = 11000;
    err.keyPattern = spec ? Object.fromEntries(spec.map((f) => [f, 1])) : {};
    err.keyValue = {};
    return err;
  }
  return e;
}

// Which top-level fields are loaded for a given projection (default excludes select:false paths).
function scopeFor(schema, sel) {
  const hidden = new Set(Object.entries(schema.children).filter(([, d]) => d.opts && d.opts.select === false).map(([k]) => k));
  if (!sel.include && !sel.exclude.size && !hidden.size) return null;
  return (key) => {
    if (sel.include) return sel.include.has(key) || sel.force.has(key);
    if (sel.exclude.has(key)) return false;
    if (hidden.has(key) && !sel.force.has(key)) return false;
    return true;
  };
}

const bufferPaths = (schema) => Object.entries(schema.children).filter(([, d]) => d.kind === 'leaf' && d.type === 'buffer').map(([k]) => k);

// ---------------------------------------------------------------- Document

class Document {
  constructor(obj = {}) {
    const M = this.constructor;
    const input = obj && typeof obj.toObject === 'function' ? obj.toObject() : obj || {};
    const { doc } = buildDoc(M.schema, input, { defaults: true, doc: this });
    Object.defineProperty(this, '$__', { value: { isNew: true, orig: {}, scope: null, bin: {} }, enumerable: false, writable: true });
    this._id = (input._id !== undefined && objectIdFrom(input._id)) || new ObjectId();
    Object.assign(this, doc);
  }

  get id() { return this._id ? this._id.toHexString() : undefined; }
  get isNew() { return this.$__.isNew; }
  set isNew(v) { this.$__.isNew = !!v; }

  static _fromRow(row, sel, lean) {
    const M = this;
    const scope = scopeFor(M.schema, sel);
    const { doc } = buildDoc(M.schema, row.doc || {}, { defaults: true, scope });
    const id = new ObjectId(row.id);
    const bins = bufferPaths(M.schema);
    for (const p of bins) if (row[`bin_${p}`] !== undefined && row[`bin_${p}`] !== null) doc[p] = row[`bin_${p}`];
    if (lean) return { _id: id, ...doc };
    const inst = Object.create(M.prototype);
    const orig = {};
    for (const [k, v] of Object.entries(doc)) { const s = toStoredValue(v); if (s !== undefined) orig[k] = JSON.stringify(s); }
    Object.defineProperty(inst, '$__', { value: { isNew: false, orig, scope, bin: Object.fromEntries(bins.map((p) => [p, doc[p]])) }, enumerable: false, writable: true });
    inst._id = id;
    Object.assign(inst, doc);
    return inst;
  }

  toObject() {
    const o = {};
    for (const [k, v] of Object.entries(this)) o[k] = plain(v);
    return o;
  }

  toJSON() { return this.toObject(); }

  get(path) { return String(path).split('.').reduce((a, k) => (a == null ? undefined : a[k]), this); }

  set(path, value) {
    if (typeof path === 'object') { for (const [k, v] of Object.entries(path)) this.set(k, v); return this; }
    const parts = String(path).split('.');
    let cur = this;
    for (let i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] == null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = value;
    return this;
  }

  markModified() { return this; }
  isModified(path) {
    const st = this.$__;
    const stored = toStoredValue(path ? this[path] : this);
    return path ? JSON.stringify(stored) !== st.orig[path] : false;
  }
  equals(other) { return !!other && String(other._id || other) === String(this._id); }
  depopulate() { return this; }
  $isEmpty() { return false; }

  async populate(spec, select) {
    await populateDocs(this.constructor, [this], spec, select);
    return this;
  }

  async validate() {
    const M = this.constructor;
    await runHooks(M.schema._hooks.validate, this);
    const errors = this._validateNow();
    if (Object.keys(errors).length) throw new ValidationError(M.modelName, errors);
  }

  _validateNow() {
    const M = this.constructor; const st = this.$__;
    const input = {}; for (const k of Object.keys(this)) input[k] = this[k];
    const { doc: casted, errors } = buildDoc(M.schema, input, { defaults: st.isNew, doc: this, scope: st.scope });
    const verr = validateDoc(M.schema, casted, this, st.scope);
    const all = { ...errors, ...verr };
    if (!Object.keys(all).length) for (const k of Object.keys(casted)) this[k] = casted[k];
    return all;
  }

  async save() {
    const M = this.constructor; const st = this.$__;
    await runHooks(M.schema._hooks.validate, this);
    const errors = this._validateNow();
    if (Object.keys(errors).length) throw new ValidationError(M.modelName, errors);
    await runHooks(M.schema._hooks.save, this);

    const ts = !!M.schema.options.timestamps;
    const now = new Date();
    if (ts) {
      if (st.isNew && !this.createdAt) this.createdAt = now;
    }
    const stored = {};
    for (const [k, v] of Object.entries(this)) {
      if (k === '_id') continue;
      const s = toStoredValue(v);
      if (s !== undefined) stored[k] = s;
    }
    const bins = bufferPaths(M.schema);
    try {
      if (st.isNew) {
        if (ts) { this.updatedAt = now; stored.updatedAt = now.toISOString(); if (!stored.createdAt) stored.createdAt = now.toISOString(); }
        const cols = ['id', 'doc']; const vals = [this._id.toHexString(), JSON.stringify(stored)];
        for (const p of bins) if (Buffer.isBuffer(this[p])) { cols.push(`bin_${p}`); vals.push(this[p]); }
        await db.get().query(`INSERT INTO ${q(M.table)} (${cols.map(q).join(',')}) VALUES (${cols.map((c, i) => (c === 'doc' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(',')})`, vals);
        st.isNew = false;
      } else {
        const changed = {}; const removed = [];
        for (const [k, v] of Object.entries(stored)) if (JSON.stringify(v) !== st.orig[k]) changed[k] = v;
        for (const k of Object.keys(st.orig)) if (!(k in stored)) removed.push(k);
        const binChanged = bins.filter((p) => Buffer.isBuffer(this[p]) && this[p] !== st.bin[p]);
        if (Object.keys(changed).length || removed.length || binChanged.length) {
          if (ts) { this.updatedAt = now; changed.updatedAt = now.toISOString(); stored.updatedAt = changed.updatedAt; }
          const params = [this._id.toHexString(), JSON.stringify(changed)];
          let expr = `(doc || $2::jsonb)`;
          for (const k of removed) { params.push(k); expr += ` - $${params.length}::text`; }
          let sets = `doc = ${expr}`;
          for (const p of binChanged) { params.push(this[p]); sets += `, ${q(`bin_${p}`)} = $${params.length}`; }
          await db.get().query(`UPDATE ${q(M.table)} SET ${sets} WHERE id = $1`, params);
        }
      }
    } catch (e) { throw mapPgError(e, M); }
    st.orig = {}; for (const [k, v] of Object.entries(stored)) st.orig[k] = JSON.stringify(v);
    for (const p of bins) st.bin[p] = this[p];
    return this;
  }

  async deleteOne() {
    await db.get().query(`DELETE FROM ${q(this.constructor.table)} WHERE id = $1`, [this._id.toHexString()]);
    return this;
  }
  remove() { return this.deleteOne(); }
}

// ---------------------------------------------------------------- update operators

const getAt = (obj, parts) => parts.reduce((a, k) => (a == null ? undefined : a[k]), obj);
function setAt(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}
function unsetAt(obj, parts) {
  const parent = getAt(obj, parts.slice(0, -1));
  if (parent && typeof parent === 'object') delete parent[parts[parts.length - 1]];
}
const eqVal = (a, b) => String(a instanceof ObjectId ? a.toHexString() : a instanceof Date ? a.toISOString() : JSON.stringify(a)) === String(b instanceof ObjectId ? b.toHexString() : b instanceof Date ? b.toISOString() : JSON.stringify(b));

// Cast a value destined for `path` using the schema; undefined => path is unknown (ignored, as strict mode does).
function castForPath(M, path, value, validate) {
  const info = M.schema.resolve(path);
  if (!info || !info.desc) return info && info.mixedDeep ? value : undefined;
  const errors = {};
  let v;
  if (info.desc.kind === 'array' && !Array.isArray(value) && value !== null && value !== undefined) {
    v = castDesc(info.desc.of, value, path, { defaults: false, errors });
  } else {
    v = castDesc(info.desc, value, path, { defaults: true, errors });
  }
  if (validate) validateValue(info.desc, v, path, errors, null);
  if (Object.keys(errors).length) throw new ValidationError(M.modelName, errors);
  return v;
}

function applyUpdate(M, doc, update, { isInsert, validate }) {
  const ops = {}; const set = {};
  for (const [k, v] of Object.entries(update || {})) {
    if (k.startsWith('$')) ops[k] = v; else set[k] = v;
  }
  if (Object.keys(set).length) ops.$set = { ...(ops.$set || {}), ...set };
  const isUnsupported = Object.keys(ops).filter((k) => !['$set', '$unset', '$inc', '$push', '$addToSet', '$pull', '$setOnInsert', '$currentDate'].includes(k));
  if (isUnsupported.length) throw new Error(`Unsupported update operator: ${isUnsupported.join(', ')}`);

  const doSet = (obj) => {
    for (const [path, value] of Object.entries(obj || {})) {
      const parts = path.split('.');
      const v = castForPath(M, path, value, validate);
      if (v === undefined && value !== undefined) continue;
      setAt(doc, parts, v);
    }
  };
  if (isInsert && ops.$setOnInsert) doSet(ops.$setOnInsert);
  doSet(ops.$set);
  for (const path of Object.keys(ops.$unset || {})) unsetAt(doc, path.split('.'));
  for (const [path, n] of Object.entries(ops.$inc || {})) {
    const parts = path.split('.'); const cur = getAt(doc, parts);
    setAt(doc, parts, (typeof cur === 'number' ? cur : 0) + Number(n));
  }
  for (const [path, val] of Object.entries(ops.$push || {})) {
    const parts = path.split('.'); const info = M.schema.resolve(path);
    let arr = getAt(doc, parts); if (!Array.isArray(arr)) { arr = []; setAt(doc, parts, arr); }
    const items = isPlain(val) && Array.isArray(val.$each) ? val.$each : [val];
    for (const it of items) { const v = info && info.desc && info.desc.kind === 'array' ? castDesc(info.desc.of, it, path, { defaults: true, errors: {} }) : it; arr.push(v); }
  }
  for (const [path, val] of Object.entries(ops.$addToSet || {})) {
    const parts = path.split('.'); const info = M.schema.resolve(path);
    let arr = getAt(doc, parts); if (!Array.isArray(arr)) { arr = []; setAt(doc, parts, arr); }
    const items = isPlain(val) && Array.isArray(val.$each) ? val.$each : [val];
    for (const it of items) {
      const v = info && info.desc && info.desc.kind === 'array' ? castDesc(info.desc.of, it, path, { defaults: true, errors: {} }) : it;
      if (!arr.some((x) => eqVal(x, v))) arr.push(v);
    }
  }
  for (const [path, val] of Object.entries(ops.$pull || {})) {
    const parts = path.split('.'); const arr = getAt(doc, parts);
    if (!Array.isArray(arr)) continue;
    const info = M.schema.resolve(path);
    const probe = info && info.desc && info.desc.kind === 'array' && !isPlain(val) ? castDesc(info.desc.of, val, path, { defaults: false, errors: {} }) : val;
    setAt(doc, parts, arr.filter((x) => !(isPlain(probe) ? Object.entries(probe).every(([k, v]) => eqVal(x && x[k], v)) : eqVal(x, probe))));
  }
}

function seedFromFilter(M, filter) {
  const seed = {};
  for (const [k, v] of Object.entries(filter || {})) {
    if (k.startsWith('$')) continue;
    if (isPlain(v) && Object.keys(v).some((x) => x.startsWith('$'))) { if ('$eq' in v) seed[k] = v.$eq; continue; }
    if (k.includes('.')) continue;
    seed[k] = v;
  }
  return seed;
}

const storedBody = (hydrated) => {
  const out = {};
  for (const [k, v] of Object.entries(hydrated)) { if (k === '_id') continue; const s = toStoredValue(v); if (s !== undefined) out[k] = s; }
  return out;
};

// Read-modify-write update inside a transaction (row-locked, so $inc and friends are atomic).
async function runUpdate(M, filter, update, opts, many) {
  const returnNew = !!(opts && (opts.new === true || opts.returnDocument === 'after'));
  const timestamps = !!M.schema.options.timestamps && !(opts && opts.timestamps === false);
  const sel = W.parseSelect(opts && opts.select);
  try {
    return await db.get().tx(async (query) => {
      const ctx = new W.Ctx(M.schema);
      const where = W.buildFilter(M.schema, filter, ctx);
      const bins = bufferPaths(M.schema);
      const sort = opts && opts.sort ? W.orderBy(opts.sort) : 'ORDER BY id ASC';
      const { rows } = await query(`SELECT id, doc${bins.map((p) => `, ${q(`bin_${p}`)}`).join('')} FROM ${q(M.table)} WHERE ${where} ${sort} ${many ? '' : 'LIMIT 1'} FOR UPDATE`, ctx.params);
      let matched = 0; let modified = 0; let upsertedId = null; let resultDoc = null;
      for (const row of rows) {
        matched += 1;
        const ALL = { include: null, exclude: new Set(), force: new Set(Object.keys(M.schema.children)) };
        const before = M._fromRow(row, ALL, true);
        const beforeStored = storedBody(before);
        const work = { _id: before._id, ...buildDoc(M.schema, beforeStored, { defaults: true }).doc };
        for (const p of bins) if (before[p] !== undefined) work[p] = before[p];
        applyUpdate(M, work, update, { isInsert: false, validate: !!(opts && opts.runValidators) });
        if (timestamps) work.updatedAt = new Date();
        const afterStored = storedBody(work);
        const changed = {}; const removed = [];
        for (const [k, v] of Object.entries(afterStored)) if (!sameJSON(v, beforeStored[k])) changed[k] = v;
        for (const k of Object.keys(beforeStored)) if (!(k in afterStored)) removed.push(k);
        if (Object.keys(changed).length || removed.length) {
          const params = [row.id, JSON.stringify(changed)]; let expr = '(doc || $2::jsonb)';
          for (const k of removed) { params.push(k); expr += ` - $${params.length}::text`; }
          await query(`UPDATE ${q(M.table)} SET doc = ${expr} WHERE id = $1`, params);
          modified += 1;
        }
        if (!many) resultDoc = returnNew ? { ...work } : before;
      }
      if (!matched && opts && opts.upsert) {
        const seed = seedFromFilter(M, filter);
        const doc = new M(seed);
        const work = { ...doc.toObject() };
        applyUpdate(M, work, update, { isInsert: true, validate: false });
        const fresh = new M(work);
        if (work._id) fresh._id = objectIdFrom(work._id) || fresh._id;
        const errors = fresh._validateNow();
        if (Object.keys(errors).length) throw new ValidationError(M.modelName, errors);
        const stored = storedBody(fresh);
        if (M.schema.options.timestamps) { stored.createdAt = stored.createdAt || new Date().toISOString(); stored.updatedAt = new Date().toISOString(); }
        const cols = ['id', 'doc']; const vals = [fresh._id.toHexString(), JSON.stringify(stored)];
        for (const p of bins) if (Buffer.isBuffer(fresh[p])) { cols.push(`bin_${p}`); vals.push(fresh[p]); }
        await query(`INSERT INTO ${q(M.table)} (${cols.map(q).join(',')}) VALUES (${cols.map((c, i) => (c === 'doc' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(',')})`, vals);
        upsertedId = fresh._id;
        resultDoc = returnNew ? { _id: fresh._id, ...buildDoc(M.schema, stored, { defaults: true }).doc } : null;
      }
      return { matched, modified, upsertedId, resultDoc, sel };
    });
  } catch (e) { throw mapPgError(e, M); }
}

// ---------------------------------------------------------------- Query

class Query {
  constructor(model, op, filter, projection, options) {
    this.model = model; this.op = op; this.filter = filter || {};
    this.opts = { select: projection || null, sort: null, limit: 0, skip: 0, populate: [], lean: false, ...(options || {}) };
    if (options && options.sort) this.opts.sort = options.sort;
    this.update = null;
  }
  sort(s) { this.opts.sort = s; return this; }
  select(s) {
    const cur = this.opts.select;
    if (!cur) this.opts.select = s;
    else if (typeof cur === 'string' && typeof s === 'string') this.opts.select = `${cur} ${s}`;
    else this.opts.select = { ...(typeof cur === 'object' ? cur : {}), ...(typeof s === 'object' ? s : {}) };
    return this;
  }
  limit(n) { this.opts.limit = Number(n) || 0; return this; }
  skip(n) { this.opts.skip = Number(n) || 0; return this; }
  lean() { this.opts.lean = true; return this; }
  populate(path, select) {
    if (Array.isArray(path)) path.forEach((p) => this.populate(p)); else this.opts.populate.push({ spec: path, select });
    return this;
  }
  setOptions(o) { Object.assign(this.opts, o); return this; }
  session() { return this; }
  maxTimeMS() { return this; }
  hint() { return this; }
  collation(c) { this.opts.ci = !!(c && c.strength !== undefined && c.strength <= 2); return this; }
  exec() { return this._run(); }
  then(res, rej) { return this._run().then(res, rej); }
  catch(rej) { return this._run().catch(rej); }
  finally(fn) { return this._run().finally(fn); }

  async _rows(limitOne) {
    const M = this.model; const ctx = new W.Ctx(M.schema); ctx.ci = !!this.opts.ci;
    const where = W.buildFilter(M.schema, this.filter, ctx);
    const sel = W.parseSelect(this.opts.select);
    const bins = bufferPaths(M.schema).filter((p) => (sel.include ? sel.include.has(p) : !sel.exclude.has(p)));
    let sql = `SELECT id, doc${bins.map((p) => `, ${q(`bin_${p}`)}`).join('')} FROM ${q(M.table)} WHERE ${where} ${W.orderBy(this.opts.sort)}`;
    const lim = limitOne ? 1 : this.opts.limit;
    if (lim) sql += ` LIMIT ${Math.floor(lim)}`;
    if (this.opts.skip) sql += ` OFFSET ${Math.floor(this.opts.skip)}`;
    const { rows } = await db.get().query(sql, ctx.params);
    const docs = rows.map((r) => M._fromRow(r, sel, this.opts.lean));
    for (const p of this.opts.populate) await populateDocs(M, docs, p.spec, p.select);
    return docs;
  }

  async _run() {
    const M = this.model;
    switch (this.op) {
      case 'find': return this._rows(false);
      case 'findOne': { const r = await this._rows(true); return r[0] || null; }
      case 'count': {
        const ctx = new W.Ctx(M.schema);
        const { rows } = await db.get().query(`SELECT count(*)::int AS n FROM ${q(M.table)} WHERE ${W.buildFilter(M.schema, this.filter, ctx)}`, ctx.params);
        const n = rows[0].n;
        return this.opts.limit ? Math.min(n, this.opts.limit) : n;
      }
      case 'exists': {
        const ctx = new W.Ctx(M.schema);
        const { rows } = await db.get().query(`SELECT id FROM ${q(M.table)} WHERE ${W.buildFilter(M.schema, this.filter, ctx)} LIMIT 1`, ctx.params);
        return rows[0] ? { _id: new ObjectId(rows[0].id) } : null;
      }
      case 'distinct': {
        const field = this.opts.distinctField; const ctx = new W.Ctx(M.schema);
        const info = M.schema.resolve(field);
        const { rows } = await db.get().query(`SELECT DISTINCT ${W.E(field)} AS v FROM ${q(M.table)} WHERE ${W.buildFilter(M.schema, this.filter, ctx)} AND ${W.E(field)} IS NOT NULL`, ctx.params);
        const out = [];
        for (const r of rows) {
          const vals = Array.isArray(r.v) ? r.v : [r.v];
          for (const x of vals) { const c = info && info.desc ? castDesc(info.desc.kind === 'array' ? info.desc.of : info.desc, x, field, { defaults: false, errors: {} }) : x; if (!out.some((y) => eqVal(y, c))) out.push(c); }
        }
        return out;
      }
      case 'updateOne': case 'updateMany': {
        const r = await runUpdate(M, this.filter, this.update, this.opts, this.op === 'updateMany');
        return { acknowledged: true, matchedCount: r.matched, modifiedCount: r.modified, upsertedCount: r.upsertedId ? 1 : 0, upsertedId: r.upsertedId };
      }
      case 'findOneAndUpdate': {
        const r = await runUpdate(M, this.filter, this.update, this.opts, false);
        if (!r.resultDoc) return null;
        const body = r.resultDoc;
        const sel = W.parseSelect(this.opts.select);
        const row = { id: String(body._id), doc: storedBody(body) };
        const doc = M._fromRow(row, sel, this.opts.lean);
        for (const p of this.opts.populate) await populateDocs(M, [doc], p.spec, p.select);
        return doc;
      }
      case 'deleteOne': case 'deleteMany': case 'findOneAndDelete': {
        const many = this.op === 'deleteMany';
        let found = null;
        if (this.op === 'findOneAndDelete') {
          found = await this._rows(true);
          if (!found[0]) return null;
          const r = await db.get().query(`DELETE FROM ${q(M.table)} WHERE id = $1`, [String(found[0]._id)]);
          return found[0];
        }
        const ctx = new W.Ctx(M.schema);
        const where = W.buildFilter(M.schema, this.filter, ctx);
        const sql = many
          ? `DELETE FROM ${q(M.table)} WHERE ${where}`
          : `DELETE FROM ${q(M.table)} WHERE id = (SELECT id FROM ${q(M.table)} WHERE ${where} ORDER BY id LIMIT 1)`;
        const r = await db.get().query(sql, ctx.params);
        return { acknowledged: true, deletedCount: r.rowCount };
      }
      default: throw new Error(`Unsupported query op ${this.op}`);
    }
  }
}

// ---------------------------------------------------------------- Model statics (inherited by every model class)

class Model extends Document {
  static find(filter, projection, options) { return new Query(this, 'find', filter, projection, options); }
  static findOne(filter, projection, options) { return new Query(this, 'findOne', filter, projection, options); }
  static findById(id, projection, options) {
    if (id === undefined || id === null) return new Query(this, 'findOne', { _id: null }, projection, options);
    return new Query(this, 'findOne', { _id: id }, projection, options);
  }
  static countDocuments(filter) { return new Query(this, 'count', filter); }
  static estimatedDocumentCount() { return new Query(this, 'count', {}); }
  static exists(filter) { return new Query(this, 'exists', filter); }
  static distinct(field, filter) { const qy = new Query(this, 'distinct', filter); qy.opts.distinctField = field; return qy; }

  static _upd(op, filter, update, options) { const qy = new Query(this, op, filter, options && options.select, options); qy.update = update; return qy; }
  static updateOne(filter, update, options) { return this._upd('updateOne', filter, update, options); }
  static updateMany(filter, update, options) { return this._upd('updateMany', filter, update, options); }
  static findOneAndUpdate(filter, update, options) { return this._upd('findOneAndUpdate', filter, update, options); }
  static findByIdAndUpdate(id, update, options) { return this._upd('findOneAndUpdate', { _id: id }, update, options); }
  static replaceOne(filter, doc, options) { return this._upd('updateOne', filter, { $set: doc }, options); }
  static deleteOne(filter) { return new Query(this, 'deleteOne', filter); }
  static deleteMany(filter) { return new Query(this, 'deleteMany', filter); }
  static findOneAndDelete(filter, options) { return new Query(this, 'findOneAndDelete', filter, options && options.select, options); }
  static findByIdAndDelete(id, options) { return new Query(this, 'findOneAndDelete', { _id: id }, options && options.select, options); }
  static findByIdAndRemove(id, options) { return this.findByIdAndDelete(id, options); }

  static async create(docs, ...rest) {
    const list = Array.isArray(docs) ? docs : [docs, ...rest.filter((r) => r && typeof r === 'object' && !Array.isArray(r) && !('session' in r) && !('ordered' in r))];
    const out = [];
    for (const d of list) { const inst = d instanceof this ? d : new this(d); await inst.save(); out.push(inst); }
    return Array.isArray(docs) ? out : out[0];
  }

  static async insertMany(docs, options = {}) {
    const list = (Array.isArray(docs) ? docs : [docs]).map((d) => (d instanceof this ? d : new this(d)));
    const M = this; const bins = bufferPaths(M.schema);
    const ts = !!M.schema.options.timestamps; const now = new Date();
    const ready = [];
    for (const inst of list) {
      await runHooks(M.schema._hooks.validate, inst);
      const errors = inst._validateNow();
      if (Object.keys(errors).length) { if (options.ordered === false) continue; throw new ValidationError(M.modelName, errors); }
      await runHooks(M.schema._hooks.save, inst);
      if (ts) { inst.createdAt = inst.createdAt || now; inst.updatedAt = now; }
      ready.push(inst);
    }
    const inserted = [];
    const onConflict = options.ordered === false ? ' ON CONFLICT DO NOTHING' : '';
    try {
      if (bins.length) {
        for (const inst of ready) { await inst.save(); inserted.push(inst); }
      } else {
        for (let i = 0; i < ready.length; i += 500) {
          const chunk = ready.slice(i, i + 500); const params = [];
          const values = chunk.map((inst) => {
            params.push(inst._id.toHexString(), JSON.stringify(storedBody(inst)));
            return `($${params.length - 1}, $${params.length}::jsonb)`;
          });
          const r = await db.get().query(`INSERT INTO ${q(M.table)} (id, doc) VALUES ${values.join(',')}${onConflict} RETURNING id`, params);
          const ok = new Set(r.rows.map((x) => x.id));
          for (const inst of chunk) if (ok.has(inst._id.toHexString())) inserted.push(inst);
        }
      }
    } catch (e) { throw mapPgError(e, M); }
    for (const inst of inserted) {
      inst.$__.isNew = false; inst.$__.orig = {};
      for (const [k, v] of Object.entries(storedBody(inst))) inst.$__.orig[k] = JSON.stringify(v);
    }
    return inserted;
  }

  static async bulkWrite(ops) {
    let matched = 0; let modified = 0; let upserted = 0; let inserted = 0; let deleted = 0;
    for (const op of ops) {
      const [kind, spec] = Object.entries(op)[0];
      if (kind === 'updateOne' || kind === 'updateMany') {
        const r = await runUpdate(this, spec.filter, spec.update, { upsert: !!spec.upsert }, kind === 'updateMany');
        matched += r.matched; modified += r.modified; if (r.upsertedId) upserted += 1;
      } else if (kind === 'insertOne') { await this.create(spec.document); inserted += 1; }
      else if (kind === 'deleteOne' || kind === 'deleteMany') { const r = await this[kind](spec.filter); deleted += r.deletedCount; }
      else if (kind === 'replaceOne') { const r = await runUpdate(this, spec.filter, { $set: spec.replacement }, { upsert: !!spec.upsert }, false); matched += r.matched; modified += r.modified; }
      else throw new Error(`Unsupported bulkWrite op: ${kind}`);
    }
    return { ok: 1, matchedCount: matched, modifiedCount: modified, upsertedCount: upserted, insertedCount: inserted, deletedCount: deleted };
  }

  static aggregate(pipeline) {
    const M = this;
    const p = { exec: () => runAggregate(M, pipeline), then: (a, b) => runAggregate(M, pipeline).then(a, b), catch: (b) => runAggregate(M, pipeline).catch(b) };
    return p;
  }

  static async populate(docs, spec, select) {
    const list = Array.isArray(docs) ? docs : [docs];
    await populateDocs(this, list, spec, select);
    return docs;
  }

  static hydrate(obj) { return new this(obj); }
  static async init() { return this; }
  static async syncIndexes() { return []; }
  static async createIndexes() { return []; }
  static async ensureIndexes() { return []; }
  static createCollection() { return Promise.resolve(); }
}

function createModel(name, schema) {
  if (registry.models.has(name)) return registry.models.get(name);
  class M extends Model {}
  Object.defineProperty(M, 'name', { value: name });
  M.modelName = name;
  M.schema = schema;
  M.table = pluralize(name);
  M.collection = { name: M.table, collectionName: M.table };
  M._uniques = {};
  Object.assign(M.prototype, schema.methods);
  for (const [k, fn] of Object.entries(schema.statics)) M[k] = fn;
  registry.models.set(name, M);
  return M;
}

module.exports = { Model, Document, Query, createModel, q, runHooks, plain, applyUpdate, bufferPaths, pluralize };
