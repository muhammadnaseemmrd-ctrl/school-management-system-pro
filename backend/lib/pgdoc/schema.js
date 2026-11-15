// Schema definition + casting + validation for the Postgres document layer.
// API-compatible with the subset of Mongoose this project uses, so models/controllers stay unchanged.
const { ObjectId } = require('bson');

// Stricter than bson's own check (which also accepts any 12-character string).
const HEX24 = /^[0-9a-fA-F]{24}$/;
ObjectId.isValid = (v) => v instanceof ObjectId || (typeof v === 'string' && HEX24.test(v));

class ValidationError extends Error {
  constructor(modelName, errors) {
    const msgs = Object.values(errors).map((e) => e.message);
    super(`${modelName} validation failed: ${Object.entries(errors).map(([k, e]) => `${k}: ${e.message}`).join(', ')}`);
    this.name = 'ValidationError';
    this.errors = errors;
    this.messages = msgs;
  }
}
class CastError extends Error {
  constructor(type, value, path, model) {
    super(`Cast to ${type} failed for value "${typeof value === 'object' ? JSON.stringify(value) : value}" (type ${typeof value}) at path "${path}"${model ? ` for model "${model}"` : ''}`);
    this.name = 'CastError';
    this.kind = type;
    this.path = path;
    this.value = value;
  }
}

class ObjectIdType {}
class MixedType {}

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const TYPE_OF = (t) => {
  if (t === String || t === 'String') return 'string';
  if (t === Number || t === 'Number') return 'number';
  if (t === Date || t === 'Date') return 'date';
  if (t === Boolean || t === 'Boolean') return 'boolean';
  if (t === Buffer || t === 'Buffer') return 'buffer';
  if (t === ObjectIdType || t === ObjectId || t === 'ObjectId') return 'objectid';
  if (t === MixedType || t === Object || t === 'Mixed') return 'mixed';
  return null;
};

const OPT_KEYS = ['required', 'default', 'enum', 'trim', 'lowercase', 'uppercase', 'min', 'max', 'minlength', 'maxlength',
  'validate', 'select', 'ref', 'refPath', 'index', 'unique', 'sparse', 'expires', 'immutable', 'match'];
const pickOpts = (def) => { const o = {}; for (const k of OPT_KEYS) if (def[k] !== undefined) o[k] = def[k]; return o; };

const isLeafDef = (def) => {
  if (!Object.prototype.hasOwnProperty.call(def, 'type')) return false;
  const t = def.type;
  // `type: { type: String }` means "a field called type", not a definition of type.
  if (isPlain(t) && Object.prototype.hasOwnProperty.call(t, 'type')) return false;
  return true;
};

class Schema {
  constructor(def = {}, options = {}) {
    this.options = options;
    this.children = {};
    this._indexes = [];
    this._hooks = { validate: [], save: [] };
    this.methods = {};
    this.statics = {};
    this.add(def);
    if (options.timestamps) {
      this.add({ createdAt: { type: Date }, updatedAt: { type: Date } });
    }
    this.useId = options._id !== false;
  }

  add(def, prefix) {
    for (const [key, val] of Object.entries(def)) {
      if (key === '_id' && val === false) continue;
      this.children[key] = Schema.parse(val);
    }
    return this;
  }

  static parse(def) {
    if (def instanceof Schema) return { kind: 'subdoc', schema: def, opts: {} };
    if (Array.isArray(def)) return Schema.parseArray(def[0], {}, def.length === 0);
    if (typeof def === 'function' || typeof def === 'string') {
      if (def === Map) return { kind: 'map', of: { kind: 'leaf', type: 'mixed', opts: {} }, opts: {} };
      const t = TYPE_OF(def);
      return { kind: 'leaf', type: t || 'mixed', opts: {} };
    }
    if (isPlain(def)) {
      if (isLeafDef(def)) {
        const t = def.type;
        const opts = pickOpts(def);
        if (Array.isArray(t)) return Schema.parseArray(t[0], opts, t.length === 0);
        if (t instanceof Schema) return { kind: 'subdoc', schema: t, opts };
        if (t === Map) {
          const of = def.of ? Schema.parse(def.of) : { kind: 'leaf', type: 'mixed', opts: {} };
          return { kind: 'map', of, opts };
        }
        if (isPlain(t)) return Schema.parseNested(t);
        const leaf = { kind: 'leaf', type: TYPE_OF(t) || 'mixed', opts };
        if (opts.enum) leaf.enumValues = Array.isArray(opts.enum) ? opts.enum : opts.enum.values;
        return leaf;
      }
      return Schema.parseNested(def);
    }
    return { kind: 'leaf', type: 'mixed', opts: {} };
  }

  static parseNested(def) {
    const children = {};
    for (const [k, v] of Object.entries(def)) {
      if (k === '_id' && v === false) continue;
      children[k] = Schema.parse(v);
    }
    return { kind: 'nested', children, opts: {} };
  }

  static parseArray(el, opts, empty) {
    if (empty || el === undefined) return { kind: 'array', of: { kind: 'leaf', type: 'mixed', opts: {} }, opts };
    if (el instanceof Schema) return { kind: 'array', of: { kind: 'subdoc', schema: el, opts: {} }, opts };
    if (isPlain(el) && !isLeafDef(el)) {
      const sub = new Schema(el, { _id: el._id !== false });
      return { kind: 'array', of: { kind: 'subdoc', schema: sub, opts: {} }, opts };
    }
    return { kind: 'array', of: Schema.parse(el), opts };
  }

  index(fields, options = {}) { this._indexes.push({ fields, options }); return this; }
  pre(name, fn) { (this._hooks[name] = this._hooks[name] || []).push(fn); return this; }
  post() { return this; }
  virtual() { throw new Error('Schema.virtual is not supported by the Postgres layer'); }

  // Lookup a path descriptor ("a.b.c"); returns undefined when unknown.
  path(p) { const r = this.resolve(p); return r && r.desc; }

  // Resolve a dotted path for queries. Returns { desc, inArray, unknown }.
  resolve(p) {
    const segs = String(p).split('.');
    let cur = { kind: 'nested', children: this.children };
    let inArray = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (cur.kind === 'array') {
        inArray = true;
        if (/^\d+$/.test(s)) continue;
        cur = cur.of;
      }
      if (cur.kind === 'nested') {
        if (s === '_id' && cur === undefined) return undefined;
        const next = cur.children[s];
        if (!next) return { desc: undefined, inArray, unknown: true };
        cur = next;
      } else if (cur.kind === 'subdoc') {
        if (s === '_id') { cur = { kind: 'leaf', type: 'objectid', opts: {} }; continue; }
        const next = cur.schema.children[s];
        if (!next) return { desc: undefined, inArray, unknown: true };
        cur = next;
      } else if (cur.kind === 'map') {
        cur = cur.of;
      } else {
        // leaf (mixed etc.) – deeper segments are unknown shape
        if (cur.type === 'mixed') return { desc: cur, inArray, unknown: false, mixedDeep: true };
        return { desc: undefined, inArray, unknown: true };
      }
    }
    if (cur.kind === 'array') inArray = true;
    return { desc: cur, inArray, unknown: false };
  }

  // Indexed leaf paths declared inline (index:true / unique:true) at the top level.
  collectIndexes() {
    const out = [];
    const walk = (children, prefix) => {
      for (const [k, d] of Object.entries(children)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (d.kind === 'nested') walk(d.children, p);
        else if (d.kind === 'leaf' || d.kind === 'array') {
          if (d.opts && d.opts.unique) out.push({ fields: { [p]: 1 }, options: { unique: true, sparse: !!d.opts.sparse } });
          else if (d.opts && d.opts.index) out.push({ fields: { [p]: 1 }, options: {} });
          if (d.kind === 'leaf' && d.opts && d.opts.expires) out.push({ fields: { [p]: 1 }, options: { expireAfterSeconds: d.opts.expires } });
        }
      }
    };
    walk(this.children, '');
    for (const i of this._indexes) out.push(i);
    return out;
  }
}
Schema.Types = { ObjectId: ObjectIdType, Mixed: MixedType, String, Number, Date, Boolean, Buffer, Map };

// ---------------------------------------------------------------- casting

const isEmptyId = (v) => v === '' || v === undefined || v === null;

const objectIdFrom = (v) => {
  if (v instanceof ObjectId) return v;
  if (typeof v === 'string' && HEX24.test(v)) return new ObjectId(v);
  if (v && typeof v === 'object' && v._id !== undefined && !(v instanceof Date)) return objectIdFrom(v._id);
  return undefined;
};

// Cast a single leaf value. Returns the cast value or throws CastError.
function castLeaf(desc, value, path) {
  const t = desc.type;
  const o = desc.opts || {};
  if (value === null || value === undefined) return value === undefined ? undefined : null;
  switch (t) {
    case 'string': {
      let s;
      if (typeof value === 'string') s = value;
      else if (typeof value === 'number' || typeof value === 'boolean') s = String(value);
      else if (value instanceof ObjectId) s = value.toHexString();
      else if (value instanceof Date) s = value.toISOString();
      else throw new CastError('string', value, path);
      if (o.trim) s = s.trim();
      if (o.lowercase) s = s.toLowerCase();
      if (o.uppercase) s = s.toUpperCase();
      return s;
    }
    case 'number': {
      if (value === '') return null;
      if (typeof value === 'number' && !Number.isNaN(value)) return value;
      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
      if (typeof value === 'boolean') return value ? 1 : 0;
      throw new CastError('Number', value, path);
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1 || value === '1' || value === 'yes') return true;
      if (value === 'false' || value === 0 || value === '0' || value === 'no') return false;
      throw new CastError('boolean', value, path);
    }
    case 'date': {
      if (value === '') return null;
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) throw new CastError('date', value, path);
      return d;
    }
    case 'objectid': {
      if (value === '') return null;
      const id = objectIdFrom(value);
      if (!id) throw new CastError('ObjectId', value, path);
      return id;
    }
    case 'buffer': {
      if (Buffer.isBuffer(value)) return value;
      if (value instanceof Uint8Array) return Buffer.from(value);
      if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
      if (typeof value === 'string') return Buffer.from(value, 'base64');
      throw new CastError('Buffer', value, path);
    }
    default:
      return value;
  }
}

// Cast any descriptor. `ctx` = { defaults: bool, errors: {}, model, applyHydrate }
function castDesc(desc, value, path, ctx) {
  try {
    switch (desc.kind) {
      case 'leaf': return castLeaf(desc, value, path);
      case 'map': {
        if (value === null || value === undefined) return value;
        const entries = value instanceof Map ? [...value.entries()] : isPlain(value) ? Object.entries(value) : null;
        if (!entries) throw new CastError('Map', value, path);
        const m = new Map();
        for (const [k, v] of entries) m.set(k, castDesc(desc.of, v, `${path}.${k}`, ctx));
        return m;
      }
      case 'array': {
        if (value === null || value === undefined) return [];
        const arr = Array.isArray(value) ? value : [value];
        return arr.map((v, i) => castDesc(desc.of, v, `${path}.${i}`, ctx));
      }
      case 'subdoc': {
        if (value === null || value === undefined) return value;
        const input = value && typeof value.toObject === 'function' ? value.toObject() : value;
        if (!input || typeof input !== 'object') throw new CastError('Embedded', value, path);
        return buildObject(desc.schema, input, path, ctx, true);
      }
      case 'nested': {
        if (value === null || value === undefined) return value;
        if (typeof value !== 'object') throw new CastError('Object', value, path);
        return buildChildren(desc.children, value, path, ctx);
      }
      default: return value;
    }
  } catch (e) {
    if (e instanceof CastError && ctx && ctx.errors) {
      ctx.errors[path] = { name: 'CastError', message: e.message, path, kind: e.kind, value: e.value };
      return undefined;
    }
    throw e;
  }
}

const cloneDefault = (v) => {
  if (v instanceof Date) return new Date(v);
  if (Array.isArray(v)) return v.map(cloneDefault);
  if (v instanceof Map) return new Map([...v.entries()].map(([k, x]) => [k, cloneDefault(x)]));
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneDefault(x)]));
  return v;
};

function buildChildren(children, input, prefix, ctx) {
  const out = {};
  const scope = ctx.scope && !prefix ? ctx.scope : null; // top-level loaded-field filter
  for (const [key, desc] of Object.entries(children)) {
    if (scope && !scope(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    let v = input[key];
    if (v === undefined && desc.kind === 'array') v = ctx.defaults ? [] : undefined;
    if (v === undefined && desc.kind === 'nested') {
      if (!ctx.defaults) continue;
      const nested = buildChildren(desc.children, {}, path, ctx);
      out[key] = nested;
      continue;
    }
    if (v === undefined && ctx.defaults && desc.opts && desc.opts.default !== undefined) {
      const d = typeof desc.opts.default === 'function' ? desc.opts.default.call(ctx.doc) : cloneDefault(desc.opts.default);
      v = d;
    }
    if (v === undefined && desc.kind === 'map' && ctx.defaults) v = new Map();
    if (v === undefined) continue;
    const cast = castDesc(desc, v, path, ctx);
    if (cast !== undefined) out[key] = cast;
  }
  return out;
}

function buildObject(schema, input, prefix, ctx, isSub) {
  const out = buildChildren(schema.children, input, prefix, isSub ? { ...ctx, scope: null } : ctx);
  if (isSub && schema.useId) {
    const id = input._id !== undefined ? objectIdFrom(input._id) : undefined;
    out._id = id || new ObjectId();
  }
  return out;
}

// Build a hydrated (typed) document body from loose input. Unknown keys are dropped (strict mode).
function buildDoc(schema, input, { defaults = true, doc, scope } = {}) {
  const ctx = { defaults, errors: {}, doc, scope };
  const out = buildChildren(schema.children, input || {}, '', ctx);
  return { doc: out, errors: ctx.errors };
}

// ---------------------------------------------------------------- validation

const optVal = (spec) => (Array.isArray(spec) ? spec[0] : spec && typeof spec === 'object' && !(spec instanceof RegExp) && 'value' in spec ? spec.value : spec);
const optMsg = (spec) => (Array.isArray(spec) ? spec[1] : spec && typeof spec === 'object' && spec.message);

const isBlank = (desc, v) => v === undefined || v === null || (desc.kind === 'leaf' && desc.type === 'string' && v === '');

function validateValue(desc, v, path, errors, doc) {
  const o = desc.opts || {};
  const add = (kind, message) => { errors[path] = { name: 'ValidatorError', kind, path, value: v, message }; };
  if (o.required !== undefined && o.required !== false) {
    const req = typeof o.required === 'function' ? o.required.call(doc) : optVal(o.required);
    if (req && (desc.kind === 'array' ? !Array.isArray(v) : isBlank(desc, v))) {
      return add('required', optMsg(o.required) || `Path \`${path}\` is required.`);
    }
  }
  if (v === undefined || v === null) return;
  if (desc.kind === 'leaf') {
    if (o.enum !== undefined) {
      const values = Array.isArray(o.enum) ? o.enum : o.enum.values;
      if (values && !values.includes(v)) {
        return add('enum', (o.enum.message || `\`${v}\` is not a valid enum value for path \`${path}\`.`).replace('{VALUE}', v).replace('{PATH}', path));
      }
    }
    if (o.min !== undefined && v < optVal(o.min)) return add('min', optMsg(o.min) || `Path \`${path}\` (${v}) is less than minimum allowed value (${optVal(o.min)}).`);
    if (o.max !== undefined && v > optVal(o.max)) return add('max', optMsg(o.max) || `Path \`${path}\` (${v}) is more than maximum allowed value (${optVal(o.max)}).`);
    if (o.minlength !== undefined && typeof v === 'string' && v.length < optVal(o.minlength)) {
      return add('minlength', optMsg(o.minlength) || `Path \`${path}\` (\`${v}\`) is shorter than the minimum allowed length (${optVal(o.minlength)}).`);
    }
    if (o.maxlength !== undefined && typeof v === 'string' && v.length > optVal(o.maxlength)) {
      return add('maxlength', optMsg(o.maxlength) || `Path \`${path}\` (\`${v}\`) is longer than the maximum allowed length (${optVal(o.maxlength)}).`);
    }
    if (o.match !== undefined && typeof v === 'string') {
      const re = optVal(o.match);
      if (re instanceof RegExp && !re.test(v)) return add('regexp', optMsg(o.match) || `Path \`${path}\` is invalid (${v}).`);
    }
  }
  if (typeof o.validate === 'function') {
    let ok = true;
    try { ok = o.validate.call(doc, v); } catch { ok = false; }
    if (ok === false) return add('user defined', `Validator failed for path \`${path}\` with value \`${v}\``);
  } else if (o.validate && typeof o.validate.validator === 'function') {
    let ok = true;
    try { ok = o.validate.validator.call(doc, v); } catch { ok = false; }
    if (ok === false) return add('user defined', o.validate.message || `Validator failed for path \`${path}\` with value \`${v}\``);
  }
}

function validateChildren(children, obj, prefix, errors, doc, scope) {
  for (const [key, desc] of Object.entries(children)) {
    if (scope && !prefix && !scope(key)) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const v = obj ? obj[key] : undefined;
    if (desc.kind === 'nested') { validateChildren(desc.children, v || {}, path, errors, doc); continue; }
    if (desc.kind === 'subdoc') {
      validateValue(desc, v, path, errors, doc);
      if (v) validateChildren(desc.schema.children, v, path, errors, doc);
      continue;
    }
    if (desc.kind === 'array') {
      validateValue(desc, v, path, errors, doc);
      if (Array.isArray(v) && desc.of.kind === 'subdoc') v.forEach((el, i) => validateChildren(desc.of.schema.children, el, `${path}.${i}`, errors, doc));
      continue;
    }
    validateValue(desc, v, path, errors, doc);
  }
}

function validateDoc(schema, obj, doc, scope) {
  const errors = {};
  validateChildren(schema.children, obj, '', errors, doc, scope);
  return errors;
}

// ---------------------------------------------------------------- stored (JSON) form

const toStoredValue = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (v instanceof ObjectId) return v.toHexString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [k, toStoredValue(x)]));
  if (Buffer.isBuffer(v)) return undefined;
  if (Array.isArray(v)) return v.map((x) => { const s = toStoredValue(x); return s === undefined ? null : s; });
  if (typeof v === 'object') {
    if (typeof v.toObject === 'function') return toStoredValue(v.toObject());
    const o = {};
    for (const [k, x] of Object.entries(v)) { const s = toStoredValue(x); if (s !== undefined) o[k] = s; }
    return o;
  }
  return v;
};

module.exports = {
  Schema, ObjectId, ObjectIdType, MixedType, ValidationError, CastError,
  buildDoc, validateDoc, validateValue, castDesc, castLeaf, toStoredValue, objectIdFrom, isPlain, isEmptyId, HEX24,
};
