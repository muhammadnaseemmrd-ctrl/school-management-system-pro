// Draws a synthetic photograph of a filled OMR sheet so the reader can be tested without a camera:
// the printed page is drawn at high resolution, then turned, tilted, shaded, blurred, noised and JPEG-compressed.
const jpeg = require('jpeg-js');
const { PAGE, ANCHOR, BUBBLE } = require('../utils/omr/layout');
const V = require('../utils/omr/vision');

const S = 8; // px per mm for the printed page
function printPage(layout, marks = {}) { // marks: {q:{1:[0], 2:[1,2]}, id:'000123', form:'0007', level:{ 'q-1-0':0.5 }}
  const W = PAGE.w * S, H = PAGE.h * S; const g = new Float32Array(W * H).fill(236);
  const rect = (x0, y0, x1, y1, v) => { for (let y = Math.max(0, Math.floor(y0 * S)); y < Math.min(H, Math.ceil(y1 * S)); y++) for (let x = Math.max(0, Math.floor(x0 * S)); x < Math.min(W, Math.ceil(x1 * S)); x++) g[y * W + x] = v; };
  const disc = (cx, cy, r0, r1, v) => { for (let y = Math.floor((cy - r1) * S); y <= Math.ceil((cy + r1) * S); y++) for (let x = Math.floor((cx - r1) * S); x <= Math.ceil((cx + r1) * S); x++) { const d = Math.hypot((x + 0.5) / S - cx, (y + 0.5) / S - cy); if (d >= r0 && d <= r1 && x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = v; } };
  const a = ANCHOR.size / 2; for (const [k, [cx, cy]] of Object.entries(ANCHOR.centers)) { rect(cx - a, cy - a, cx + a, cy + a, 28); if (k === 'br') rect(cx - a + ANCHOR.line, cy - a + ANCHOR.line, cx + a - ANCHOR.line, cy + a - ANCHOR.line, 236); }
  // printed text lookalikes: short dark dashes in the header and beside the question numbers
  for (let i = 0; i < 40; i++) rect(30 + (i % 10) * 15, 22 + Math.floor(i / 10) * 6, 30 + (i % 10) * 15 + 9, 23.2 + Math.floor(i / 10) * 6, 60);
  for (const r of layout.rows) rect(r.labelX - 2, r.y - 1.2, r.labelX + 2, r.y + 1.2, 80);
  for (const b of layout.bubbles) disc(b.x, b.y, BUBBLE.r - 0.25, BUBBLE.r, 50);
  const fillBubble = (b, level = 1) => disc(b.x, b.y, 0, BUBBLE.r - 0.15, 236 - level * (236 - 35));
  for (const r of layout.rows) { const ch = (marks.q || {})[r.q] || []; for (const c of ch) { const lv = (marks.level || {})[`q-${r.q}-${c}`]; fillBubble(r.cols[c], lv === undefined ? 1 : lv); } }
  if (marks.id) [...marks.id].forEach((d, p) => { if (/\d/.test(d)) fillBubble(layout.idCols[p][Number(d)]); });
  if (marks.form) [...marks.form].forEach((d, p) => fillBubble(layout.formCols[p][Number(d)]));
  return { W, H, g };
}

function boxBlur(src, W, H, r) { if (!r) return src; const t = new Float32Array(W * H), o = new Float32Array(W * H); const n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { t[y * W + x] = s / n; s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { o[y * W + x] = s / n; s += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } }
  return o; }

// Photograph the page: quad = where the four page corners land in the picture
function photograph(page, { w = 1500, h = 1100, quad, blur = 0, shade = 0.25, noise = 4, seed = 1, q = 85 } = {}) {
  const P = [[0, 0], [PAGE.w, 0], [PAGE.w, PAGE.h], [0, PAGE.h]]; const Hinv = V.homography(quad, P); let rnd = seed; const rand = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [X, Y] = V.applyH(Hinv, x + 0.5, y + 0.5); let v;
    if (X < 0 || Y < 0 || X >= PAGE.w || Y >= PAGE.h) v = 70; else { const px = X * S - 0.5, py = Y * S - 0.5; const x0 = Math.max(0, Math.min(page.W - 2, Math.floor(px))), y0 = Math.max(0, Math.min(page.H - 2, Math.floor(py))); const fx = Math.min(1, Math.max(0, px - x0)), fy = Math.min(1, Math.max(0, py - y0)); const i = y0 * page.W + x0; v = (page.g[i] * (1 - fx) + page.g[i + 1] * fx) * (1 - fy) + (page.g[i + page.W] * (1 - fx) + page.g[i + page.W + 1] * fx) * fy; }
    out[y * w + x] = v * (1 - shade * (x / w) * 0.8 - shade * (y / h) * 0.4); }
  const b = boxBlur(out, w, h, blur); const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, b[i] + (rand() - 0.5) * 2 * noise)); rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; }
  const enc = jpeg.encode({ data: rgba, width: w, height: h }, q); return { jpeg: enc.data, w, h };
}
// Where the page corners land when the page is turned by `deg` clockwise and drawn at `s` px per mm, centred at (cx, cy)
const rot = (cx, cy, s, deg) => { const a = deg * Math.PI / 180; return [[0, 0], [PAGE.w, 0], [PAGE.w, PAGE.h], [0, PAGE.h]].map(([x, y]) => { const dx = (x - PAGE.w / 2) * s, dy = (y - PAGE.h / 2) * s; return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]; }); };
// An upright portrait page filling most of a portrait picture
const uprightQuad = (w, h, margin = 40, tilt = 0) => [[margin + tilt * 40, margin], [w - margin - tilt * 40, margin], [w - margin, h - margin], [margin, h - margin]];
module.exports = { printPage, photograph, rot, uprightQuad, jpeg };
