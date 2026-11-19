import React, { useMemo } from 'react';
import QRCode from 'qrcode';

// Shared pieces for drawing a studio design in the browser: the same layers the server turns into a PDF (PRD E12).
export const STATE_TONE = { Draft: 'Pending', Review: 'Active', Published: 'Approved', Archived: 'None', Issued: 'Approved', Revoked: 'Suspended', Superseded: 'None', Queued: 'Pending', Printed: 'Approved', Failed: 'Suspended', Cancelled: 'None', Printing: 'Active', NeedsAttention: 'Suspended', Done: 'Approved' };
export const STATE_LABEL = { Draft: 'Draft', Review: 'In review', Published: 'Live', Archived: 'Retired', Issued: 'Valid', Revoked: 'Withdrawn', Superseded: 'Replaced', Queued: 'Waiting', Printed: 'Printed', Failed: 'Failed', Cancelled: 'Dropped', Printing: 'Printing', NeedsAttention: 'Needs attention', Done: 'Done' };
export const PX_PER_MM = 96 / 25.4;
export const PT_MM = 25.4 / 72;
export const DEFAULT_THEME = { primary: '#2A5CAC', accent: '#A8523D', ink: '#1B2837', paper: '#FFFFFF', soft: '#F7F6F2' };
export const PAPERS = { A4: [210, 297], A5: [148, 210], 'ID-1': [85.6, 53.98], Badge: [90, 120], Receipt: [80, 200] };
export const RTL_RE = /[֐-ࣿﭐ-﷿ﹰ-﻿]/;
export const FIELD_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
export const fillText = (t, values) => String(t || '').replace(FIELD_RE, (_, k) => (values[k] === undefined || values[k] === null ? '' : String(values[k])));
export const paperDims = (p) => { const b = PAPERS[p.key] || [210, 297]; const portrait = b[1] >= b[0]; const land = p.orientation === 'landscape'; return land === portrait ? [b[1], b[0]] : [b[0], b[1]]; };
export const color = (c, theme) => { const t = { ...DEFAULT_THEME, ...(theme || {}) }; if (!c) return null; if (String(c).startsWith('theme.')) return t[String(c).slice(6)] || null; return /^#[0-9a-fA-F]{6}$/.test(c) ? c : null; };
export const FONTS = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", monospace' };
export const RTL_FONT = '"Noto Naskh Arabic", "Noto Nastaliq Urdu", "Segoe UI", Tahoma, "Geeza Pro", serif';

let _ctx;
const measureCtx = () => { if (!_ctx) _ctx = document.createElement('canvas').getContext('2d'); return _ctx; };
// the same wrap-then-shrink rule the server uses, so the editor shows what will print
export function layoutText(l, text, rtl) {
  const ctx = measureCtx(); let size = l.size || 9; const lh = l.lineHeight || 1.2; const wmm = l.w; const hmm = l.h;
  const font = (s) => `${l.italic ? 'italic ' : ''}${l.bold ? 'bold ' : ''}${s}px ${rtl ? RTL_FONT : FONTS[l.font] || FONTS.sans}`;
  const wrap = (s) => {
    ctx.font = font(s * PT_MM * 10); const maxW = wmm * 10; const out = [];
    for (const p of String(text).split('\n')) {
      const words = p.split(/\s+/).filter(Boolean); if (!words.length) { out.push(''); continue; }
      let cur = ''; for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (cur && ctx.measureText(t).width > maxW) { out.push(cur); cur = w; } else cur = t; }
      out.push(cur);
    }
    return out;
  };
  let lines = wrap(size);
  if (l.fit !== 'clip' && l.fit !== 'wrap') while (lines.length * size * PT_MM * lh > hmm && size > 4) { size -= 0.5; lines = wrap(size); }
  return { lines, size, lh };
}

export function qrPath(text) {
  try { const q = QRCode.create(text || ' ', { errorCorrectionLevel: 'M' }); const n = q.modules.size; let d = ''; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules.get(r, c)) d += `M${c + 1} ${r + 1}h1v1h-1z`; return { d, n }; } catch (e) { return { d: '', n: 21 }; }
}
const P = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
export function code128(text) {
  const s = String(text || ''); if (!s || !/^[\x20-\x7e]+$/.test(s)) return null;
  const codes = [104]; let sum = 104; [...s].forEach((ch, i) => { const v = ch.charCodeAt(0) - 32; codes.push(v); sum += v * (i + 1); }); codes.push(sum % 103, 106);
  const bars = []; let x = 0; [...codes.map((c) => P[c]).join('')].forEach((w, i) => { const wd = Number(w); if (i % 2 === 0) bars.push([x, wd]); x += wd; });
  return { bars, total: x };
}

const Qr = ({ value, color: col = '#000' }) => { const q = useMemo(() => qrPath(value), [value]); return <svg viewBox={`0 0 ${q.n + 2} ${q.n + 2}`} width="100%" height="100%" shapeRendering="crispEdges" preserveAspectRatio="xMidYMid meet" role="img" aria-label="QR code"><rect width={q.n + 2} height={q.n + 2} fill="#fff" /><path d={q.d} fill={col} /></svg>; };
const Barcode = ({ value }) => { const b = useMemo(() => code128(value), [value]); if (!b) return null; const quiet = 10; return <svg viewBox={`0 0 ${b.total + quiet * 2} 10`} width="100%" height="100%" preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label="Barcode"><rect width={b.total + quiet * 2} height="10" fill="#fff" />{b.bars.map(([x, w], i) => <rect key={i} x={x + quiet} y="0" width={w} height="10" fill="#000" />)}</svg>; };

// One layer, drawn in a box measured in millimetres
export const LayerView = ({ l, values, theme, images, locale, scale }) => {
  const box = { position: 'absolute', left: l.x * scale, top: l.y * scale, width: l.w * scale, height: l.h * scale, transform: l.rotate ? `rotate(${l.rotate}deg)` : undefined, pointerEvents: 'none' };
  if (l.type === 'rect') { const fill = color(l.fill, theme); const stroke = color(l.stroke, theme); return <div style={{ ...box, background: fill || 'transparent', border: stroke ? `${Math.max(0.5, (l.strokeW || 0.25) * scale)}px solid ${stroke}` : undefined, borderRadius: (l.radius || 0) * scale, opacity: l.opacity ?? 1, boxSizing: 'border-box' }} />; }
  if (l.type === 'line') { const stroke = color(l.stroke || 'theme.ink', theme) || '#000'; return <svg style={{ ...box, overflow: 'visible' }}><line x1="0" y1="0" x2={l.w * scale} y2={l.h * scale} stroke={stroke} strokeWidth={Math.max(0.5, (l.strokeW || 0.25) * scale)} strokeDasharray={l.dash ? `${l.dash * scale}` : undefined} /></svg>; }
  if (l.type === 'text') {
    const raw = locale === 'ur' && l.textUr ? l.textUr : l.text; const text = fillText(l.upper ? String(raw).toUpperCase() : raw, values); const rtl = l.rtl === true || (l.rtl !== false && RTL_RE.test(text));
    const lay = layoutText(l, text, rtl); const align = l.align || (rtl ? 'right' : 'left'); const col = color(l.color || 'theme.ink', theme) || '#000';
    const total = lay.lines.length * lay.size * PT_MM * lay.lh * scale; const top = l.valign === 'top' ? 0 : l.valign === 'bottom' ? l.h * scale - total : (l.h * scale - total) / 2;
    return <div style={{ ...box, overflow: 'hidden' }}><div style={{ position: 'absolute', left: 0, right: 0, top, color: col, fontFamily: rtl ? RTL_FONT : FONTS[l.font] || FONTS.sans, fontWeight: l.bold ? 700 : 400, fontStyle: l.italic ? 'italic' : 'normal', fontSize: lay.size * PT_MM * scale, lineHeight: `${lay.size * PT_MM * lay.lh * scale}px`, textAlign: align, direction: rtl ? 'rtl' : 'ltr', whiteSpace: 'pre', letterSpacing: l.charSpace ? `${l.charSpace * 0.5 * scale * 0.35}px` : undefined }}>{lay.lines.join('\n')}</div></div>;
  }
  if (l.type === 'image') {
    const ref = l.source === 'asset' ? `asset:${l.assetId}` : values[l.field]; const url = ref ? images?.[ref] || (String(ref).startsWith('url:') ? ref.slice(4) : null) : null;
    const photo = /photo/.test(l.field || '');
    if (!url) return photo ? <div style={{ ...box, background: '#E5E7EB', border: '1px solid #9CA3AF', borderRadius: (l.radius || 0) * scale, boxSizing: 'border-box' }} /> : <div style={box} />;
    return <div style={{ ...box, overflow: 'hidden', borderRadius: (l.radius || 0) * scale }}><img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: l.fit === 'contain' ? 'contain' : 'cover' }} /></div>;
  }
  if (l.type === 'qr') return <div style={box}><Qr value={fillText(l.value, values)} /></div>;
  if (l.type === 'barcode') return <div style={box}><Barcode value={fillText(l.value, values)} /></div>;
  if (l.type === 'table') {
    const rows = Array.isArray(values['transcript.rows']) ? values['transcript.rows'] : []; const cols = l.columns || []; const sum = cols.reduce((a, c) => a + (c.w || 1), 0) || 1; const rh = (l.rowH || 7) * scale; const fs = (l.size || 9) * PT_MM * scale;
    const head = color(l.header || 'theme.primary', theme) || '#2A5CAC'; const soft = color('theme.soft', theme);
    const cell = (c, i, txt, header) => <div key={i} style={{ width: `${((c.w || 1) / sum) * 100}%`, padding: `0 ${1.5 * scale}px`, textAlign: c.align || 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: header ? '#fff' : color(l.color || 'theme.ink', theme), fontWeight: header ? 700 : 400 }}>{txt}</div>;
    return <div style={{ ...box, border: `1px solid ${color('theme.ink', theme)}`, overflow: 'hidden', boxSizing: 'border-box', fontSize: fs, fontFamily: FONTS.sans }}><div style={{ display: 'flex', height: rh, alignItems: 'center', background: head }}>{cols.map((c, i) => cell(c, i, c.title, true))}</div>{rows.map((r, ri) => <div key={ri} style={{ display: 'flex', height: rh, alignItems: 'center', background: ri % 2 ? soft : 'transparent' }}>{cols.map((c, i) => cell(c, i, r[i] ?? '', false))}</div>)}</div>;
  }
  return null;
};

// A whole side: background, bleed tint and layers. children are drawn above (used by the editor for handles)
export const SideView = ({ layout, sideIndex = 0, values, theme, images, locale, scale, showBleed = false, showSafe = false, children, style }) => {
  const [w, h] = paperDims(layout.paper); const side = layout.sides[sideIndex] || layout.sides[0]; const bleed = layout.paper.bleedMm || 0; const safe = layout.paper.safeMm || 0;
  const bg = color(side.background || 'theme.paper', theme) || '#fff'; const pad = showBleed ? bleed : 0;
  return (
    <div style={{ position: 'relative', width: (w + 2 * pad) * scale, height: (h + 2 * pad) * scale, background: showBleed ? '#e9d5d5' : bg, ...style }}>
      <div style={{ position: 'absolute', left: pad * scale, top: pad * scale, width: w * scale, height: h * scale, background: bg, overflow: showBleed ? 'visible' : 'hidden' }}>
        {(side.layers || []).filter((l) => !l.hidden).map((l) => <LayerView key={l.id} l={l} values={values} theme={theme} images={images} locale={locale} scale={scale} />)}
        {showSafe && <div style={{ position: 'absolute', left: safe * scale, top: safe * scale, right: safe * scale, bottom: safe * scale, border: '1px dashed #2E7D32', pointerEvents: 'none' }} />}
        {children}
      </div>
      {showBleed && <div style={{ position: 'absolute', inset: 0, border: '1px dashed #D32F2F', pointerEvents: 'none' }} />}
    </div>
  );
};

// small preview for the gallery, scaled to a fixed width
export const Thumb = ({ preview, values, width = 220 }) => {
  if (!preview) return <div className="skeleton" style={{ width, height: width * 0.7 }} />;
  const [w] = paperDims(preview.paper); const scale = width / w; const layout = { paper: preview.paper, sides: [preview.side] };
  return <SideView layout={layout} values={values} theme={preview.theme} images={{}} locale="en" scale={scale} style={{ boxShadow: '0 0 0 1px #e3e7e7' }} />;
};

export const blobUrl = async (apiClient, path) => { const r = await apiClient.get(path, { responseType: 'blob' }); return { url: URL.createObjectURL(r.data), notes: r.headers?.['x-studio-notes'] ? decodeURIComponent(r.headers['x-studio-notes']) : '' }; };

// ── PNG export: the stored copy of an issued document drawn on a canvas at print resolution ──
const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
export async function renderPng({ layout, theme, values, images, locale }, sideIndex = 0, dpi = 300) {
  const [w, h] = paperDims(layout.paper); const k = dpi / 25.4; const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k); const c = cv.getContext('2d');
  const side = layout.sides[sideIndex] || layout.sides[0]; c.fillStyle = color(side.background || 'theme.paper', theme) || '#fff'; c.fillRect(0, 0, cv.width, cv.height);
  for (const l of (side.layers || []).filter((x) => !x.hidden)) {
    c.save(); if (l.rotate) { c.translate((l.x + l.w / 2) * k, (l.y + l.h / 2) * k); c.rotate((l.rotate * Math.PI) / 180); c.translate(-(l.x + l.w / 2) * k, -(l.y + l.h / 2) * k); }
    const x = l.x * k; const y = l.y * k; const bw = l.w * k; const bh = l.h * k;
    if (l.type === 'rect') { const f = color(l.fill, theme); const s = color(l.stroke, theme); if (f) { c.fillStyle = f; c.fillRect(x, y, bw, bh); } if (s) { c.strokeStyle = s; c.lineWidth = (l.strokeW || 0.25) * k; c.strokeRect(x, y, bw, bh); } }
    else if (l.type === 'line') { c.strokeStyle = color(l.stroke || 'theme.ink', theme) || '#000'; c.lineWidth = (l.strokeW || 0.25) * k; c.beginPath(); c.moveTo(x, y); c.lineTo(x + bw, y + bh); c.stroke(); }
    else if (l.type === 'text') {
      const raw = locale === 'ur' && l.textUr ? l.textUr : l.text; const text = fillText(l.upper ? String(raw).toUpperCase() : raw, values); const rtl = l.rtl === true || (l.rtl !== false && RTL_RE.test(text)); const lay = layoutText(l, text, rtl);
      c.fillStyle = color(l.color || 'theme.ink', theme) || '#000'; const px = lay.size * PT_MM * k; c.font = `${l.italic ? 'italic ' : ''}${l.bold ? 'bold ' : ''}${px}px ${rtl ? RTL_FONT : FONTS[l.font] || FONTS.sans}`; c.direction = rtl ? 'rtl' : 'ltr'; c.textBaseline = 'middle';
      const align = l.align || (rtl ? 'right' : 'left'); const lhp = px * lay.lh; const total = lay.lines.length * lhp; const top = l.valign === 'top' ? y : l.valign === 'bottom' ? y + bh - total : y + (bh - total) / 2;
      c.save(); c.beginPath(); c.rect(x, y, bw, bh); c.clip(); lay.lines.forEach((ln, i) => { const tx = align === 'center' ? x + bw / 2 : align === 'right' ? x + bw : x; c.textAlign = align; c.fillText(ln, tx, top + i * lhp + lhp / 2); }); c.restore();
    } else if (l.type === 'image') {
      const ref = l.source === 'asset' ? `asset:${l.assetId}` : values[l.field]; const img = await loadImg(ref ? images?.[ref] : null);
      if (img) { c.save(); c.beginPath(); c.rect(x, y, bw, bh); c.clip(); const r = l.fit === 'contain' ? Math.min(bw / img.width, bh / img.height) : Math.max(bw / img.width, bh / img.height); c.drawImage(img, x + (bw - img.width * r) / 2, y + (bh - img.height * r) / 2, img.width * r, img.height * r); c.restore(); }
    } else if (l.type === 'qr') { const q = QRCode.create(fillText(l.value, values) || ' ', { errorCorrectionLevel: 'M' }); const n = q.modules.size; const cell = Math.min(bw, bh) / (n + 2); c.fillStyle = '#fff'; c.fillRect(x, y, cell * (n + 2), cell * (n + 2)); c.fillStyle = '#000'; for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) if (q.modules.get(r, cc)) c.fillRect(x + (cc + 1) * cell, y + (r + 1) * cell, cell + 0.3, cell + 0.3); }
    else if (l.type === 'barcode') { const b = code128(fillText(l.value, values)); if (b) { const u = bw / (b.total + 20); c.fillStyle = '#fff'; c.fillRect(x, y, bw, bh); c.fillStyle = '#000'; b.bars.forEach(([bx, bwid]) => c.fillRect(x + (bx + 10) * u, y, bwid * u + 0.3, bh)); } }
    else if (l.type === 'table') {
      const rows = Array.isArray(values['transcript.rows']) ? values['transcript.rows'] : []; const cols = l.columns || []; const sum = cols.reduce((a, cc) => a + (cc.w || 1), 0) || 1; const rh = (l.rowH || 7) * k; const px = (l.size || 9) * PT_MM * k; c.font = `${px}px Helvetica, Arial, sans-serif`; c.textBaseline = 'middle'; c.direction = 'ltr';
      const draw = (cells, yy, header, odd) => { if (header) { c.fillStyle = color(l.header || 'theme.primary', theme) || '#2A5CAC'; c.fillRect(x, yy, bw, rh); } else if (odd) { c.fillStyle = color('theme.soft', theme); c.fillRect(x, yy, bw, rh); } let cx = x; cols.forEach((cc, i) => { const cw = ((cc.w || 1) / sum) * bw; c.fillStyle = header ? '#fff' : color(l.color || 'theme.ink', theme); c.textAlign = cc.align || 'left'; const tx = cc.align === 'right' ? cx + cw - 1.5 * k : cc.align === 'center' ? cx + cw / 2 : cx + 1.5 * k; c.fillText(String(cells[i] ?? ''), tx, yy + rh / 2, cw - 3 * k); cx += cw; }); };
      draw(cols.map((cc) => cc.title), y, true, false); rows.forEach((r, i) => draw(r, y + rh * (i + 1), false, i % 2)); c.strokeStyle = color('theme.ink', theme); c.lineWidth = 0.4 * k; c.strokeRect(x, y, bw, rh * (rows.length + 1));
    }
    c.restore();
  }
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}
