// populate(): resolve ObjectId refs (including refPath polymorphic refs and nested populate) with batched queries.
const registry = require('./registry');
const { ObjectId, objectIdFrom, isPlain } = require('./schema');

function normalize(spec, select) {
  if (Array.isArray(spec)) return spec.flatMap((s) => normalize(s, select));
  if (typeof spec === 'string') return spec.split(/\s+/).filter(Boolean).map((path) => ({ path, select }));
  if (isPlain(spec)) return [{ ...spec }];
  return [];
}

// Visit every [holder, key] slot reachable through the (possibly array-nested) path.
function slots(obj, parts, cb) {
  if (obj == null) return;
  if (Array.isArray(obj)) { obj.forEach((o) => slots(o, parts, cb)); return; }
  if (typeof obj !== 'object') return;
  if (parts.length === 1) { cb(obj, parts[0]); return; }
  slots(obj[parts[0]], parts.slice(1), cb);
}

const isDocLike = (v) => v && typeof v === 'object' && !(v instanceof ObjectId) && v._id !== undefined;

async function populateDocs(Model, docs, spec, select) {
  const list = (docs || []).filter(Boolean);
  if (!list.length) return;
  for (const s of normalize(spec, select)) {
    const parts = s.path.split('.');
    const info = Model.schema.resolve(s.path);
    const desc = info && info.desc && (info.desc.kind === 'array' ? info.desc.of : info.desc);
    const ref = (desc && desc.opts && desc.opts.ref) || (info && info.desc && info.desc.opts && info.desc.opts.ref);
    const refPath = (desc && desc.opts && desc.opts.refPath) || (info && info.desc && info.desc.opts && info.desc.opts.refPath);

    const found = []; // { holder, key, name, ids:[], isArray }
    for (const d of list) {
      slots(d, parts, (holder, key) => {
        const v = holder[key];
        if (v === undefined || v === null) return;
        const arr = Array.isArray(v);
        const items = arr ? v : [v];
        let name = s.model ? (typeof s.model === 'string' ? s.model : s.model.modelName) : ref;
        if (!name && refPath) name = holder[refPath.split('.').pop()];
        if (!name) return;
        found.push({ holder, key, name, items, arr });
      });
    }
    const byModel = new Map();
    for (const f of found) {
      for (const it of f.items) {
        if (isDocLike(it)) continue;
        const id = objectIdFrom(it);
        if (!id) continue;
        if (!byModel.has(f.name)) byModel.set(f.name, new Set());
        byModel.get(f.name).add(id.toHexString());
      }
    }
    const loaded = new Map(); // name -> Map(id -> doc)
    for (const [name, ids] of byModel) {
      const M = registry.get(name);
      if (!M) continue;
      let query = M.find({ _id: { $in: [...ids] }, ...(s.match || {}) });
      const sel = s.select || (s.options && s.options.select);
      if (sel) query = query.select(sel);
      if (s.populate) query = query.populate(s.populate);
      const rows = await query;
      loaded.set(name, new Map(rows.map((r) => [String(r._id), r])));
    }
    for (const f of found) {
      const m = loaded.get(f.name) || new Map();
      const resolve = (it) => (isDocLike(it) ? it : m.get(String((objectIdFrom(it) || it))) || null);
      if (f.arr) f.holder[f.key] = f.items.map(resolve).filter((x) => x !== null);
      else f.holder[f.key] = resolve(f.items[0]);
    }
  }
}

module.exports = { populateDocs };
