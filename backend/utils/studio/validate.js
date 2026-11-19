// Checks a design before it goes to review: page size, print safety, merge fields, QR content, image rights, contrast (CAP-0421..0425, 0437, 0438).
const F = require('./fields');
const C = require('./color');

const LAYER_TYPES = ['text', 'rect', 'line', 'image', 'qr', 'barcode', 'table'];
const num = (v) => typeof v === 'number' && Number.isFinite(v);

function paperOf(layout) {
  const p = layout && layout.paper;
  if (!p || !F.PAPERS[p.key]) return null;
  const base = F.PAPERS[p.key]; const portrait = base.h >= base.w;
  const landscape = p.orientation === 'landscape'; const flip = landscape === portrait;
  return { key: p.key, w: flip ? base.h : base.w, h: flip ? base.w : base.h, bleed: num(p.bleedMm) ? p.bleedMm : 3, safe: num(p.safeMm) ? p.safeMm : 3, orientation: landscape ? 'landscape' : 'portrait' };
}

// assets: Map(id -> StudioAsset-like). Returns { errors, warnings, contrast, fields }
function validate(layout, { family, assets = new Map(), theme = {} } = {}) {
  const errors = []; const warnings = []; const contrast = []; const used = new Set();
  const err = (m, layerId, side) => errors.push({ message: m, layerId: layerId || null, side: side || null });
  const warn = (m, layerId, side) => warnings.push({ message: m, layerId: layerId || null, side: side || null });
  const paper = paperOf(layout);
  if (!paper) { err('Choose a paper size: A4, A5, ID-1 card, badge or receipt.'); return { errors, warnings, contrast, fields: [] }; }
  if (paper.bleed < 0 || paper.bleed > 6) err('Bleed must be between 0 and 6 mm.');
  if (paper.safe < 0 || paper.safe > 15) err('Safe margin must be between 0 and 15 mm.');
  const sides = Array.isArray(layout.sides) ? layout.sides : [];
  if (!sides.length || sides.length > 2) { err('A design has one side or two (front and back).'); return { errors, warnings, contrast, fields: [] }; }
  const cat = F.catalog(family); const t = { ...C.DEFAULT_THEME, ...theme };
  let count = 0; const ids = new Set();
  sides.forEach((side, si) => {
    const sk = side.key || (si === 0 ? 'front' : 'back');
    const bg = C.resolveColor(side.background || 'theme.paper', t);
    if (!bg) err(`The ${sk} background colour is not valid.`, null, sk);
    const layers = Array.isArray(side.layers) ? side.layers : [];
    layers.forEach((l, li) => {
      count += 1; const id = l.id || `#${li}`;
      if (!l.id || ids.has(l.id)) err('Every layer needs its own id.', l.id, sk); ids.add(l.id);
      if (!LAYER_TYPES.includes(l.type)) { err(`Layer "${l.name || id}" has an unknown type.`, l.id, sk); return; }
      const nm = l.name || l.type;
      if (![l.x, l.y, l.w, l.h].every(num)) { err(`"${nm}" has no position or size.`, l.id, sk); return; }
      if ((l.w <= 0 && l.type !== 'line') || (l.h <= 0 && l.type !== 'line') || (l.type === 'line' && l.w <= 0 && l.h <= 0)) err(`"${nm}" has no size.`, l.id, sk);
      if (l.x < -paper.bleed - 0.01 || l.y < -paper.bleed - 0.01 || l.x + l.w > paper.w + paper.bleed + 0.01 || l.y + l.h > paper.h + paper.bleed + 0.01) err(`"${nm}" reaches beyond the page and bleed.`, l.id, sk);
      const insideSafe = l.x >= paper.safe - 0.01 && l.y >= paper.safe - 0.01 && l.x + l.w <= paper.w - paper.safe + 0.01 && l.y + l.h <= paper.h - paper.safe + 0.01;
      if (['text', 'qr', 'barcode', 'table'].includes(l.type) && !insideSafe && !l.bleed) warn(`"${nm}" is closer to the edge than the ${paper.safe} mm safe margin and may be cut off.`, l.id, sk);
      if (l.type === 'text') {
        const names = [...F.fieldsIn(l.text), ...F.fieldsIn(l.textUr)];
        names.forEach((k) => { used.add(k); if (!cat[k]) err(`"${nm}" uses {{${k}}}, which is not available for a ${F.FAMILY_LABEL[family] || family}.`, l.id, sk); else if (cat[k].qrOnly) err(`{{${k}}} can only be used in a QR code.`, l.id, sk); else if (cat[k].type === 'image' || cat[k].type === 'rows') err(`{{${k}}} is a picture or a table, not text.`, l.id, sk); });
        if (!num(l.size) || l.size < 4 || l.size > 120) err(`"${nm}" needs a text size between 4 and 120 pt.`, l.id, sk);
        else if (l.size < 6) warn(`"${nm}" is below 6 pt and may be hard to read in print.`, l.id, sk);
        const col = C.resolveColor(l.color || 'theme.ink', t);
        if (!col) err(`"${nm}" has an invalid text colour.`, l.id, sk);
        else if (String(l.text || '').trim()) {
          // the nearest filled rectangle underneath the middle of the text, else the side background
          let under = bg; let unknown = false; const cx = l.x + l.w / 2; const cy = l.y + l.h / 2;
          for (let k = 0; k < li; k++) {
            const u = layers[k]; if (!u || !num(u.x)) continue;
            const inside = cx >= u.x && cx <= u.x + u.w && cy >= u.y && cy <= u.y + u.h;
            if (!inside) continue;
            if (u.type === 'rect' && u.fill) { const f = C.resolveColor(u.fill, t); if (f) { under = f; unknown = false; } } else if (u.type === 'image' && !u.decorativeBehindText) unknown = true;
          }
          if (unknown) warn(`"${nm}" sits on a picture, so its contrast was not checked.`, l.id, sk);
          else if (under) {
            const r = C.ratio(col, under); const need = C.isLarge(l.size, l.bold) ? 3 : 4.5;
            contrast.push({ side: sk, layerId: l.id, name: nm, ratio: Math.round(r * 100) / 100, need, ok: r >= need });
            if (r < need) err(`"${nm}" is hard to read: contrast ${r.toFixed(1)}:1, needs ${need}:1.`, l.id, sk);
          }
        }
      }
      if (l.type === 'rect') { if (l.fill && !C.resolveColor(l.fill, t)) err(`"${nm}" has an invalid fill colour.`, l.id, sk); if (l.stroke && !C.resolveColor(l.stroke, t)) err(`"${nm}" has an invalid line colour.`, l.id, sk); }
      if (l.type === 'line' && !C.resolveColor(l.stroke || 'theme.ink', t)) err(`"${nm}" has an invalid line colour.`, l.id, sk);
      if (l.type === 'image') {
        if (l.source === 'field') {
          used.add(l.field); const d = cat[l.field];
          if (!d || d.type !== 'image') err(`"${nm}" must use a picture field of this document.`, l.id, sk);
        } else if (l.source === 'asset') {
          const a = assets.get(String(l.assetId));
          if (!a || a.retired) err(`"${nm}" uses a picture that is no longer available.`, l.id, sk);
          else if (a.origin !== 'base' && (a.license?.kind === 'unknown' || !a.license?.kind)) err(`"${nm}" uses "${a.name}", which has no usage right recorded.`, l.id, sk);
          else if (a.origin !== 'base' && !a.verified) err(`"${nm}" uses "${a.name}", which an administrator has not cleared for use yet.`, l.id, sk);
        } else err(`"${nm}" needs a picture: choose an uploaded image or a data field.`, l.id, sk);
        if (l.source !== 'field' && !l.alt && !l.decorative) warn(`"${nm}" has no alternative text for the accessible PDF.`, l.id, sk);
      }
      if (l.type === 'qr') {
        used.add('doc.verifyUrl');
        if (String(l.value || '').trim() !== '{{doc.verifyUrl}}') err('A QR code may only carry the verification link, never personal data.', l.id, sk);
        if (Math.min(l.w, l.h) < 14) warn('A QR code smaller than 14 mm may not scan reliably.', l.id, sk);
        if (Math.abs(l.w - l.h) > 0.01) err('A QR code must be square.', l.id, sk);
      }
      if (l.type === 'barcode') {
        used.add('doc.serial');
        if (String(l.value || '').trim() !== '{{doc.serial}}') err('A barcode may only carry the document serial number.', l.id, sk);
        if (l.h < 6) warn('A barcode lower than 6 mm may not scan reliably.', l.id, sk);
      }
      if (l.type === 'table') {
        used.add('transcript.rows'); if (!cat['transcript.rows']) err(`"${nm}" is a table of marks, which this document does not have.`, l.id, sk);
        if (!Array.isArray(l.columns) || !l.columns.length || l.columns.length > 8) err(`"${nm}" needs between 1 and 8 columns.`, l.id, sk);
      }
    });
  });
  if (count > 150) err('A design can have at most 150 layers.');
  if (!count) warn('This design has no layers yet.');
  return { errors, warnings, contrast, fields: [...used].sort() };
}
module.exports = { validate, paperOf, LAYER_TYPES };
