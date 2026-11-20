// Reading a photographed OMR sheet (PRD E14, CAP-0321). Pure functions over grey-scale pixels, so the same file runs in the
// browser (instant "retake?" feedback) and on the server (the authoritative reading). No native libraries are needed.
//
// Pipeline: grey image -> find the four corner anchors (three solid squares and one hollow one, so the sheet can be read
// whichever way up it was photographed) -> straighten the page to a fixed scale -> measure how dark each bubble is
// compared with the paper around it -> report sharpness, lighting and alignment.
const { PAGE, ANCHOR, BUBBLE } = require('./layout');

const PPM = 4; // pixels per millimetre of the straightened page (840 x 1188)

function toGray(rgba, w, h) { const g = new Uint8ClampedArray(w * h); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8; return g; }

// Dark where a pixel is clearly darker than its neighbourhood: copes with shadows and uneven light across the page.
function darkMask(gray, w, h) {
  const win = Math.max(25, Math.round(Math.min(w, h) * 0.12)) | 1; const half = win >> 1; const W1 = w + 1; const integ = new Uint32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x < w; x++) { run += gray[y * w + x]; integ[(y + 1) * W1 + x + 1] = integ[y * W1 + x + 1] + run; } }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1); const sum = integ[y1 * W1 + x1] - integ[y0 * W1 + x1] - integ[y1 * W1 + x0] + integ[y0 * W1 + x0]; const mean = sum / ((x1 - x0) * (y1 - y0)); out[y * w + x] = gray[y * w + x] < mean * 0.7 ? 1 : 0; } }
  return out;
}

function components(mask, w, h) {
  const labels = new Int32Array(w * h); const stack = new Int32Array(w * h); const list = []; let id = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s]) continue; id++; let sp = 0; stack[sp++] = s; labels[s] = id;
    const c = { id, area: 0, minx: w, maxx: 0, miny: h, maxy: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, border: false };
    while (sp) {
      const p = stack[--sp]; const y = (p / w) | 0; const x = p - y * w; c.area++; c.sx += x; c.sy += y; c.sxx += x * x; c.syy += y * y; c.sxy += x * y;
      if (x < c.minx) c.minx = x; if (x > c.maxx) c.maxx = x; if (y < c.miny) c.miny = y; if (y > c.maxy) c.maxy = y;
      for (let dy = -1; dy <= 1; dy++) { const ny = y + dy; if (ny < 0 || ny >= h) { c.border = true; continue; }
        for (let dx = -1; dx <= 1; dx++) { const nx = x + dx; if (nx < 0 || nx >= w) { c.border = true; continue; } const q = ny * w + nx; if (mask[q] && !labels[q]) { labels[q] = id; stack[sp++] = q; } } }
    }
    list.push(c);
  }
  return { labels, list };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

// The four corner marks. Solid squares and discs both look compact, so squares are told from discs by how far their
// corners stick out of their own centre, which does not change when the page is turned.
function findAnchors(gray, w, h) {
  const mask = darkMask(gray, w, h); const { labels, list } = components(mask, w, h); const total = w * h;
  const cand = list.filter((c) => !c.border && c.area >= 40 && c.area <= total * 0.04 && Math.max(c.maxx - c.minx, c.maxy - c.miny) <= 2 * Math.min(c.maxx - c.minx, c.maxy - c.miny) + 4);
  if (cand.length < 4) return { ok: false, reason: 'corners', found: cand.length };
  const byId = new Map(); for (const c of cand) { c.cx = c.sx / c.area; c.cy = c.sy / c.area; c.rmax = 0; byId.set(c.id, c); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const l = labels[y * w + x]; if (!l) continue; const c = byId.get(l); if (!c) continue; const d = (x - c.cx) * (x - c.cx) + (y - c.cy) * (y - c.cy); if (d > c.rmax) c.rmax = d; }
  const solids = []; const hollows = [];
  for (const c of cand) {
    const vx = c.sxx / c.area - c.cx * c.cx, vy = c.syy / c.area - c.cy * c.cy, vxy = c.sxy / c.area - c.cx * c.cy; const tr = vx + vy; const det = vx * vy - vxy * vxy; const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc; if (l2 <= 0 || l1 / l2 > 1.6) continue; const rr = Math.sqrt(c.rmax) / Math.sqrt(c.area);
    if (rr >= 0.64 && rr <= 0.8) solids.push({ ...c, p: [c.cx, c.cy], size: Math.sqrt(c.area) }); else if (rr > 0.8 && rr <= 1.0 && c.area > 150) hollows.push({ ...c, p: [c.cx, c.cy], size: Math.sqrt(c.area / 0.64) });
  }
  if (!hollows.length || solids.length < 3) return { ok: false, reason: 'corners', found: solids.length + hollows.length };
  solids.sort((a, b) => b.area - a.area); const S = solids.slice(0, 14); let best = null;
  for (const hh of hollows) for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) for (let k = j + 1; k < S.length; k++) {
    const t = [S[i], S[j], S[k]]; const sizes = [hh.size, ...t.map((s) => s.size)]; if (Math.max(...sizes) / Math.min(...sizes) > 1.7) continue;
    const far = t.reduce((m, s) => (dist(s.p, hh.p) > dist(m.p, hh.p) ? s : m)); const rest = t.filter((s) => s !== far); const tl = far.p; const br = hh.p;
    const a = cross(tl, br, rest[0].p) < 0 ? { tr: rest[0], bl: rest[1] } : { tr: rest[1], bl: rest[0] }; if (cross(tl, br, a.tr.p) >= 0 || cross(tl, br, a.bl.p) <= 0) continue;
    const top = dist(tl, a.tr.p), left = dist(tl, a.bl.p); const ratio = Math.min(top, left) ? top / left : 0; if (ratio < 0.45 || ratio > 0.95) continue; // the printed rectangle is 182 x 269 mm
    const area = Math.abs(cross(tl, a.tr.p, br)) / 2 + Math.abs(cross(tl, br, a.bl.p)) / 2; if (!best || area > best.area) best = { area, tl, tr: a.tr.p, bl: a.bl.p, br };
  }
  if (!best) return { ok: false, reason: 'corners', found: solids.length + hollows.length };
  return { ok: true, anchors: { tl: best.tl, tr: best.tr, bl: best.bl, br: best.br } };
}

// Eight numbers that carry any four points to any other four.
function homography(src, dst) {
  const A = []; for (let i = 0; i < 4; i++) { const [x, y] = src[i]; const [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]); A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-12) return null; [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]; } }
  return A.map((row, i) => row[8] / row[i]);
}
const applyH = (H, x, y) => { const d = H[6] * x + H[7] * y + 1; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; };

// The page as it was printed: 210 x 297 mm at PPM pixels per mm (each pixel averages four samples to avoid jagged edges).
function rectify(gray, w, h, anchors) {
  const C = ANCHOR.centers; const H = homography([C.tl, C.tr, C.bl, C.br], [anchors.tl, anchors.tr, anchors.bl, anchors.br]); if (!H) return null;
  const W = Math.round(PAGE.w * PPM), Hh = Math.round(PAGE.h * PPM); const out = new Uint8ClampedArray(W * Hh);
  const sample = (x, y) => { if (x < 0) x = 0; if (y < 0) y = 0; if (x > w - 1.001) x = w - 1.001; if (y > h - 1.001) y = h - 1.001; const x0 = x | 0, y0 = y | 0; const fx = x - x0, fy = y - y0; const i = y0 * w + x0; return (gray[i] * (1 - fx) + gray[i + 1] * fx) * (1 - fy) + (gray[i + w] * (1 - fx) + gray[i + w + 1] * fx) * fy; };
  for (let v = 0; v < Hh; v++) for (let u = 0; u < W; u++) { let s = 0; for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { const p = applyH(H, (u + ox) / PPM, (v + oy) / PPM); s += sample(p[0], p[1]); } out[v * W + u] = s / 4; }
  return { w: W, h: Hh, data: out };
}

const median = (arr) => { const a = Float32Array.from(arr).sort(); return a.length ? a[a.length >> 1] : 0; };
function discStats(rect, cx, cy, r0, r1) { // mean of the pixels between radii r0 and r1 (mm) and the median of the same
  const { w, h, data } = rect; const px = cx * PPM, py = cy * PPM; const R1 = r1 * PPM, R0 = r0 * PPM; const vals = []; let sum = 0;
  for (let y = Math.max(0, Math.floor(py - R1)); y <= Math.min(h - 1, Math.ceil(py + R1)); y++) for (let x = Math.max(0, Math.floor(px - R1)); x <= Math.min(w - 1, Math.ceil(px + R1)); x++) { const d = Math.hypot(x + 0.5 - px, y + 0.5 - py); if (d >= R0 && d <= R1) { vals.push(data[y * w + x]); sum += data[y * w + x]; } }
  return { mean: vals.length ? sum / vals.length : 0, median: median(vals), n: vals.length };
}

// Where the printed corner marks really are on the straightened page (should be within a fraction of a millimetre of where they were printed).
function anchorOffsets(rect) {
  const out = {};
  for (const [k, [ax, ay]] of Object.entries(ANCHOR.centers)) {
    const R = 7 * PPM; const px = ax * PPM, py = ay * PPM; let sx = 0, sy = 0, n = 0; const hollow = k === 'br';
    for (let y = Math.max(0, Math.round(py - R)); y < Math.min(rect.h, Math.round(py + R)); y++) for (let x = Math.max(0, Math.round(px - R)); x < Math.min(rect.w, Math.round(px + R)); x++) { if (rect.data[y * rect.w + x] < 110) { sx += x + 0.5; sy += y + 0.5; n++; } }
    out[k] = n > 20 ? [sx / n / PPM - ax, sy / n / PPM - ay] : null; void hollow;
  }
  return out;
}

// How wide the edge of a corner mark looks, in mm: a sharp photo gives a thin edge, a shaken or out-of-focus one a smeared edge.
function edgeWidthMm(rect, ink, paper) {
  const widths = []; const lo = ink + 0.1 * (paper - ink), hi = ink + 0.9 * (paper - ink);
  for (const k of ['tl', 'tr', 'bl']) {
    const [ax, ay] = ANCHOR.centers[k];
    for (const side of [-1, 1]) {
      const prof = []; for (let i = 0; i <= 8 * PPM; i++) { const x = (ax + side * (2 + 6 - i / PPM)) * PPM; let s = 0, n = 0; for (let dy = -2; dy <= 2; dy++) { const yy = Math.round(ay * PPM + dy); const xx = Math.round(x); if (xx >= 0 && xx < rect.w && yy >= 0 && yy < rect.h) { s += rect.data[yy * rect.w + xx]; n++; } } prof.push(n ? s / n : paper); }
      // the profile runs from the paper outside the mark toward its ink: find where it crosses 90% and 10% of the way
      const cross = (level) => { for (let i = 1; i < prof.length; i++) if (prof[i - 1] > level && prof[i] <= level) return i - 1 + (prof[i - 1] - level) / (prof[i - 1] - prof[i]); return -1; };
      const a = cross(hi), b = cross(lo);
      if (a >= 0 && b >= 0) widths.push(Math.abs(b - a) / PPM);
    }
  }
  return widths.length ? median(widths) : 9;
}

function analyse(rect, layout) {
  const offs = anchorOffsets(rect); const inkVals = []; for (const k of ['tl', 'tr', 'bl']) { const [ax, ay] = ANCHOR.centers[k]; inkVals.push(discStats(rect, ax, ay, 0, 1.6).mean); } const ink = median(inkVals);
  const rings = []; const fills = (list) => list.map((b) => { const ring = discStats(rect, b.x, b.y, BUBBLE.ringIn, BUBBLE.ringOut); const disc = discStats(rect, b.x, b.y, 0, BUBBLE.sample); rings.push(ring.median); const span = Math.max(20, ring.median - ink); return Math.max(0, Math.min(1, (ring.median - disc.mean) / span)); });
  const q = layout.rows.map((r) => fills(r.cols).map((v) => Math.round(v * 1000) / 1000)); const id = layout.idCols.map((c) => fills(c).map((v) => Math.round(v * 1000) / 1000)); const form = layout.formCols.map((c) => fills(c).map((v) => Math.round(v * 1000) / 1000));
  const paper = median(rings); const worst = Math.max(0, ...Object.values(offs).filter(Boolean).map((o) => Math.hypot(o[0], o[1])));
  return { fills: { q, id, form }, ink: Math.round(ink), paper: Math.round(paper), contrast: Math.round(paper - ink), edgeMm: Math.round(edgeWidthMm(rect, ink, paper) * 100) / 100, alignMm: Math.round(worst * 100) / 100, anchorsSeen: Object.values(offs).filter(Boolean).length };
}

// Everything in one go: find the corners, straighten, measure. `rectified` is returned so it can be stored and shown to the reviewer.
function process(gray, w, h, layout) {
  const f = findAnchors(gray, w, h); if (!f.ok) return { ok: false, reason: f.reason, found: f.found };
  const A = f.anchors; const rect = rectify(gray, w, h, A); if (!rect) return { ok: false, reason: 'corners', found: 4 };
  const rotationDeg = Math.round(Math.atan2(A.tr[1] - A.tl[1], A.tr[0] - A.tl[0]) * 1800 / Math.PI) / 10;
  const perspective = Math.round(Math.max(Math.abs(1 - dist(A.tl, A.tr) / dist(A.bl, A.br)), Math.abs(1 - dist(A.tl, A.bl) / dist(A.tr, A.br))) * 1000) / 1000;
  const info = analyse(rect, layout);
  return { ok: true, anchors: A, rotationDeg, perspective, rect, ...info, image: { w, h } };
}

module.exports = { PPM, toGray, darkMask, components, findAnchors, homography, applyH, rectify, analyse, process, discStats, edgeWidthMm };
