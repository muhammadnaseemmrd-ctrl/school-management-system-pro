// The import engine shared by every module.
//
// How a file travels, and why: the browser sends the file once, the server parses it in memory,
// checks every row and sends the findings back. The server keeps nothing — no file on disk, no
// half-finished job in the database — so a school with twenty thousand students does not cost the
// server twenty thousand rows of memory between two clicks. The browser then posts the rows back
// in small batches to write them, and the server checks every row again before writing, because a
// row that has been to the browser and back is not to be trusted.

const { parseRow, clean } = require('./values');

const BATCH = 200;        // rows written in one request
const MAX_ERRORS = 6;     // errors listed per row; more than this and the row needs a human anyway

const rowKey = (value, keys) => keys.map((k) => String(value[k] == null ? '' : value[k]).toLowerCase().trim()).join('|');

// A row that still carries the template's example values is the example, not data.
const isExample = (value, def) => {
  const cols = def.columns.filter((c) => c.example != null && c.example !== '');
  if (cols.length < 3) return false;
  const same = cols.filter((c) => String(value[c.key] ?? '').toLowerCase() === String(c.example).toLowerCase());
  return same.length >= Math.min(cols.length, 4) && same.length >= cols.length * 0.7;
};

// One row, from raw cells to a decision. Shared by preview and commit so the two can never drift.
const checkRow = async (raw, def, c) => {
  const out = { n: raw.n, raw: raw.data, errors: [], warnings: [], state: 'create', value: null, match: null };
  const { value, errors, warnings } = parseRow(raw.data, def.columns);
  out.value = value; out.errors = errors; out.warnings = warnings;
  if (isExample(value, def)) { out.state = 'skip'; out.example = true; out.skipReason = 'This is the example row from the template'; return out; }
  if (!out.errors.length && def.refine) {
    try { await def.refine(value, out, c); } catch (e) { out.errors.push(e.message); }
  }
  if (out.errors.length) { out.state = 'error'; out.errors = out.errors.slice(0, MAX_ERRORS); return out; }
  if (def.match) {
    const hit = await def.match(value, c);
    if (hit) {
      out.match = { id: String(hit.id), label: hit.label || '' };
      out._hit = hit;
      if (def.allowUpdate === false) { out.state = 'skip'; out.skipReason = `${hit.label || 'This record'} is already here`; }
      else {
        const changed = def.changes ? def.changes(hit, value, c) : [];
        out.changes = changed;
        if (def.changes && !changed.length) { out.state = 'skip'; out.skipReason = 'Nothing would change'; }
        else out.state = 'update';
      }
    }
  }
  return out;
};

// Everything the browser needs to show the preview, and nothing it does not.
const slim = (r) => ({
  n: r.n, state: r.state, errors: r.errors, warnings: r.warnings,
  match: r.match, changes: r.changes || [], skipReason: r.skipReason || '',
  raw: r.raw, label: r.label || '',
});

const preview = async (def, ctx, rows) => {
  const c = { ...ctx, ...(def.prepare ? await def.prepare(ctx) : {}) };
  const seen = new Map();
  const out = [];
  for (const raw of rows) {
    const r = await checkRow(raw, def, c);
    // two rows in the same file that mean the same record: the second is flagged, not written twice
    if (r.state !== 'error' && !r.example && def.unique && def.unique.length) {
      const k = rowKey(r.value, def.unique);
      if (k.replace(/\|/g, '')) {
        const first = seen.get(k);
        if (first) { r.state = 'error'; r.errors = [`This is the same record as row ${first} in this file`]; }
        else seen.set(k, r.n);
      }
    }
    r.label = def.label1 ? def.label1(r.value) : '';
    out.push(r);
  }
  const summary = { total: out.length, create: 0, update: 0, skip: 0, error: 0 };
  for (const r of out) summary[r.state] += 1;
  return { rows: out.map(slim), summary };
};

// Writing. Every row is checked again from its raw cells: the browser may have changed them.
const commit = async (def, ctx, rows, options = {}) => {
  if (rows.length > BATCH) throw Object.assign(new Error(`Send at most ${BATCH} rows at a time.`), { status: 400 });
  const c = { ...ctx, ...(def.prepare ? await def.prepare(ctx) : {}), options };
  const results = []; const tally = { created: 0, updated: 0, skipped: 0, failed: 0 };
  const seen = new Map();
  for (const raw of rows) {
    const r = await checkRow({ n: raw.n, data: raw.raw || raw.data || {} }, def, c);
    // the same guard the preview used, so the answer the person was shown is the answer they get
    if (r.state !== 'error' && !r.example && def.unique && def.unique.length) {
      const k = rowKey(r.value, def.unique);
      if (k.replace(/\|/g, '')) {
        const first = seen.get(k);
        if (first) { r.state = 'error'; r.errors = [`This is the same record as row ${first} in this file`]; }
        else seen.set(k, r.n);
      }
    }
    try {
      if (r.state === 'error') { results.push({ n: r.n, status: 'failed', error: r.errors[0] || 'This row could not be read' }); tally.failed += 1; continue; }
      if (r.state === 'skip') { results.push({ n: r.n, status: 'skipped', note: r.skipReason }); tally.skipped += 1; continue; }
      if (r.state === 'update') {
        if (!options.updateExisting) { results.push({ n: r.n, status: 'skipped', note: 'Already here; updating was not asked for' }); tally.skipped += 1; continue; }
        const res = await def.update(r._hit, r.value, c);
        results.push({ n: r.n, status: 'updated', id: String(res.id), label: res.label || r.label, changed: res.changed || r.changes || [] });
        tally.updated += 1; continue;
      }
      const res = await def.create(r.value, c);
      results.push({ n: r.n, status: 'created', id: String(res.id), label: res.label || r.label, note: res.note || '', credential: res.credential || null });
      tally.created += 1;
    } catch (e) {
      const dup = e && (e.code === 11000 || /duplicate key/i.test(e.message || ''));
      results.push({ n: r.n, status: 'failed', error: dup ? 'Another record already uses one of these values' : clean(e.message, 200) });
      tally.failed += 1;
    }
  }
  return { results, tally };
};

module.exports = { preview, commit, checkRow, BATCH, isExample };
