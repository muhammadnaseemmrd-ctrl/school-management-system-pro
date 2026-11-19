// Turns a design plus its filled-in values into a PDF (PRD E12, CAP-0426..0436). The same function makes single documents,
// print proofs with marks and guides, and imposed sheets with cut marks. Urdu and other right-to-left text is laid out
// word by word in visual order with a Naskh font, because the PDF library draws glyphs in reading order.
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const code128 = require('./code128');
const F = require('./fields');
const C = require('./color');
const { paperOf } = require('./validate');

const MM = 72 / 25.4;
const FONT_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');
const RTL_CH = /[֐-ࣿﭐ-﷿ﹰ-﻿]/;
const BASE = { sans: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'], serif: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'], mono: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'] };
const fontName = (l, rtl) => {
  if (rtl) return l.bold ? 'Naskh-Bold' : 'Naskh';
  const set = BASE[l.font] || BASE.sans; return set[(l.bold ? 1 : 0) + (l.italic ? 2 : 0)];
};
const mm = (v) => v * MM;

// words in reading order -> chunks in left-to-right order; runs of Latin or digits keep their own order
function visualChunks(words) {
  const chunks = [];
  for (const w of words) {
    const rtl = RTL_CH.test(w);
    const last = chunks[chunks.length - 1];
    if (!rtl && last && !last.rtl) last.text += ` ${w}`; else chunks.push({ text: w, rtl });
  }
  return chunks.reverse();
}

function layoutText(doc, text, l, w, size, isRtl) {
  const lh = size * (l.lineHeight || 1.2); const cs = (l.charSpace || 0) * MM * 0.5;
  const paras = String(text).split('\n'); const lines = [];
  const measure = (str, rtlChunk) => { doc.font(fontName(l, rtlChunk)).fontSize(size); return doc.widthOfString(str, { characterSpacing: cs }); };
  for (const p of paras) {
    const words = p.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push([]); continue; }
    let cur = [];
    const widthOf = (ws) => {
      if (!isRtl) return measure(ws.join(' '), false);
      return visualChunks(ws).reduce((a, c, i) => a + measure(c.text, c.rtl) + (i ? measure(' ', false) : 0), 0);
    };
    for (const word of words) {
      const trial = [...cur, word];
      if (cur.length && widthOf(trial) > w) { lines.push(cur); cur = [word]; } else cur = trial;
    }
    lines.push(cur);
  }
  return { lines, lh, cs, measure };
}

function drawText(doc, l, ctx) {
  const raw = (ctx.locale === 'ur' && l.textUr) ? l.textUr : l.text;
  const text = F.fill(ctx.upper || l.upper ? String(raw).toUpperCase() : raw, ctx.values);
  if (!text.trim()) return;
  const isRtl = l.rtl === true || (l.rtl !== false && RTL_CH.test(text));
  const w = mm(l.w); const h = mm(l.h); const x = mm(l.x); const y = mm(l.y);
  let size = l.size || 9; const min = 4;
  let lay = layoutText(doc, text, l, w, size, isRtl);
  if (l.fit !== 'clip') {
    while (lay.lines.length * lay.lh > h + 0.01 && size > min && l.fit !== 'wrap') { size -= 0.5; lay = layoutText(doc, text, l, w, size, isRtl); }
  }
  const total = lay.lines.length * lay.lh;
  const top = l.valign === 'top' ? y : l.valign === 'bottom' ? y + h - total : y + (h - total) / 2;
  const col = C.resolveColor(l.color || 'theme.ink', ctx.theme) || '#000000';
  const align = l.align || (isRtl ? 'right' : 'left');
  doc.save(); doc.rect(x - 0.5, y - 0.5, w + 1, h + 1).clip(); doc.fillColor(col);
  lay.lines.forEach((ws, i) => {
    if (!ws.length) return;
    const ly = top + i * lay.lh + (lay.lh - size) / 2 - size * 0.08;
    const chunks = isRtl ? visualChunks(ws) : [{ text: ws.join(' '), rtl: false }];
    const widths = chunks.map((c) => lay.measure(c.text, c.rtl));
    const space = isRtl ? lay.measure(' ', false) : 0;
    const lineW = widths.reduce((a, b) => a + b, 0) + space * Math.max(0, chunks.length - 1);
    let cx = align === 'center' ? x + (w - lineW) / 2 : align === 'right' ? x + w - lineW : x;
    chunks.forEach((c, k) => {
      doc.font(fontName(l, c.rtl)).fontSize(size).text(c.text, cx, ly, { lineBreak: false, characterSpacing: lay.cs });
      cx += widths[k] + space;
    });
  });
  doc.restore();
}

function drawRect(doc, l, ctx) {
  const fill = l.fill ? C.resolveColor(l.fill, ctx.theme) : null; const stroke = l.stroke ? C.resolveColor(l.stroke, ctx.theme) : null;
  if (!fill && !stroke) return;
  doc.save();
  if (l.opacity != null) doc.opacity(l.opacity);
  const r = mm(l.radius || 0);
  if (r > 0) doc.roundedRect(mm(l.x), mm(l.y), mm(l.w), mm(l.h), r); else doc.rect(mm(l.x), mm(l.y), mm(l.w), mm(l.h));
  if (fill && stroke) doc.lineWidth(mm(l.strokeW || 0.25)).fillAndStroke(fill, stroke);
  else if (fill) doc.fill(fill); else doc.lineWidth(mm(l.strokeW || 0.25)).stroke(stroke);
  doc.restore();
}

function drawLine(doc, l, ctx) {
  const col = C.resolveColor(l.stroke || 'theme.ink', ctx.theme) || '#000000';
  doc.save().lineWidth(mm(l.strokeW || 0.25)).strokeColor(col);
  if (l.dash) doc.dash(mm(l.dash), { space: mm(l.dash) });
  doc.moveTo(mm(l.x), mm(l.y)).lineTo(mm(l.x + l.w), mm(l.y + l.h)).stroke().restore();
}

const refOf = (l, values) => (l.source === 'asset' ? `asset:${l.assetId}` : values[l.field]);
function drawImage(doc, l, ctx) {
  const ref = refOf(l, ctx.values);
  const buf = ref ? ctx.images.get(ref) : null;
  const x = mm(l.x); const y = mm(l.y); const w = mm(l.w); const h = mm(l.h);
  if (!buf) {
    if (/photo/.test(l.field || '')) ctx.notes.push(`Missing picture for ${l.name || l.field || 'image'}`);
    if (l.source === 'field' && /photo/.test(l.field || '')) {
      doc.save().rect(x, y, w, h).fill('#E5E7EB').restore();
      doc.save().lineWidth(0.5).strokeColor('#9CA3AF').rect(x, y, w, h).stroke().restore();
    }
    return;
  }
  doc.save();
  const r = mm(l.radius || 0);
  if (r > 0) doc.roundedRect(x, y, w, h, r).clip(); else doc.rect(x, y, w, h).clip();
  try { doc.image(buf, x, y, l.fit === 'contain' ? { fit: [w, h], align: 'center', valign: 'center' } : { cover: [w, h], align: 'center', valign: 'center' }); } catch (e) { ctx.notes.push(`Picture could not be drawn: ${l.name || ''}`); }
  doc.restore();
}

function drawQr(doc, l, ctx) {
  const url = F.fill(l.value, ctx.values); if (!url) return;
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' }); const n = qr.modules.size; const cell = mm(Math.min(l.w, l.h)) / (n + 2);
  const x = mm(l.x); const y = mm(l.y);
  doc.save().rect(x, y, cell * (n + 2), cell * (n + 2)).fill('#FFFFFF');
  doc.fillColor('#000000');
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) doc.rect(x + (c + 1) * cell, y + (r + 1) * cell, cell + 0.15, cell + 0.15).fill();
  doc.restore();
}

function drawBarcode(doc, l, ctx) {
  const v = F.fill(l.value, ctx.values); const bars = code128.encode(v); if (!bars) return;
  const total = bars.reduce((a, b) => a + b[0], 0); const unit = mm(l.w) / (total + 20);   // 10 modules of quiet zone each side
  doc.save().rect(mm(l.x), mm(l.y), mm(l.w), mm(l.h)).fill('#FFFFFF').fillColor('#000000');
  let cx = mm(l.x) + unit * 10;
  for (const [wd, isBar] of bars) { if (isBar) doc.rect(cx, mm(l.y), wd * unit + 0.05, mm(l.h)).fill(); cx += wd * unit; }
  doc.restore();
}

function drawTable(doc, l, ctx) {
  const rows = Array.isArray(ctx.values['transcript.rows']) ? ctx.values['transcript.rows'] : [];
  const cols = l.columns || []; const sum = cols.reduce((a, c) => a + (c.w || 1), 0);
  const x0 = mm(l.x); const y0 = mm(l.y); const W = mm(l.w); const size = l.size || 9;
  let rowH = mm(l.rowH || 7); const maxRows = Math.floor(mm(l.h) / rowH) - 1;
  if (rows.length > maxRows && rows.length > 0) { rowH = Math.max(mm(4.5), mm(l.h) / (rows.length + 1)); }
  const head = C.resolveColor(l.header || 'theme.primary', ctx.theme) || '#2A5CAC'; const soft = C.resolveColor('theme.soft', ctx.theme);
  let cy = y0;
  const drawRow = (cells, header, odd) => {
    if (cy + rowH > y0 + mm(l.h) + 1) { ctx.notes.push('Table was cut off: too many rows'); return false; }
    doc.save(); if (header) doc.rect(x0, cy, W, rowH).fill(head); else if (odd) doc.rect(x0, cy, W, rowH).fill(soft); doc.restore();
    let cx = x0;
    cols.forEach((c, i) => {
      const cw = (c.w || 1) / sum * W; const txt = String(cells[i] ?? ''); const isRtl = RTL_CH.test(txt);
      doc.fillColor(header ? '#FFFFFF' : C.resolveColor(l.color || 'theme.ink', ctx.theme) || '#000000').font(fontName({ bold: header, font: l.font }, isRtl)).fontSize(size);
      const th = size; const ty = cy + (rowH - th) / 2 - size * 0.05;
      doc.save().rect(cx, cy, cw, rowH).clip();
      doc.text(txt, cx + mm(1.5), ty, { width: cw - mm(3), align: isRtl ? 'right' : (c.align || 'left'), lineBreak: false });
      doc.restore(); cx += cw;
    });
    cy += rowH; return true;
  };
  drawRow(cols.map((c) => c.title), true, false);
  for (let i = 0; i < rows.length; i++) if (!drawRow(rows[i], false, i % 2 === 1)) break;
  doc.save().lineWidth(0.4).strokeColor(C.resolveColor('theme.ink', ctx.theme)).rect(x0, y0, W, Math.max(cy - y0, rowH)).stroke().restore();
}

async function drawSide(doc, side, ctx, bleedClip) {
  const paper = ctx.paper;
  const bg = C.resolveColor(side.background || 'theme.paper', ctx.theme) || '#FFFFFF';
  const b = bleedClip;
  // pictures are fetched first so every layer can be drawn in order without waiting
  for (const l of side.layers || []) if (l.type === 'image' && !l.hidden) { const ref = refOf(l, ctx.values); if (ref && !ctx.images.has(ref)) ctx.images.set(ref, await ctx.loadImage(ref)); }
  doc.save().rect(-mm(b), -mm(b), mm(paper.w + 2 * b), mm(paper.h + 2 * b)).clip();
  doc.markContent('Artifact', { type: 'Layout' }); doc.rect(-mm(b), -mm(b), mm(paper.w + 2 * b), mm(paper.h + 2 * b)).fill(bg); doc.endMarkedContent();
  for (const l of side.layers || []) {
    if (l.hidden) continue;
    const rot = l.rotate ? Number(l.rotate) : 0;
    doc.save();
    if (rot) doc.rotate(rot, { origin: [mm(l.x + l.w / 2), mm(l.y + l.h / 2)] });
    const run = () => {
      if (l.type === 'rect') drawRect(doc, l, ctx); else if (l.type === 'line') drawLine(doc, l, ctx);
      else if (l.type === 'text') drawText(doc, l, ctx); else if (l.type === 'image') drawImage(doc, l, ctx);
      else if (l.type === 'qr') drawQr(doc, l, ctx); else if (l.type === 'barcode') drawBarcode(doc, l, ctx); else if (l.type === 'table') drawTable(doc, l, ctx);
    };
    // Reading order and alternative text for the accessible PDF; decoration is marked as an artifact
    const meaningful = ['text', 'image', 'qr', 'barcode', 'table'].includes(l.type) && !l.decorative;
    if (ctx.struct && meaningful) {
      const type = l.type === 'text' ? 'P' : l.type === 'table' ? 'Table' : 'Figure';
      const alt = l.type === 'qr' ? 'QR code to check this document' : l.type === 'barcode' ? 'Barcode of the serial number' : l.type === 'image' ? (l.alt || l.name || 'Picture') : l.type === 'table' ? 'Table of marks' : undefined;
      const mcid = doc.markStructureContent(type, alt ? { alt } : {});
      run(); doc.endMarkedContent();
      ctx.struct.push(doc.struct(type, alt ? { alt } : {}, [mcid]));
    } else if (ctx.struct) { doc.markContent('Artifact', { type: 'Layout' }); run(); doc.endMarkedContent(); }
    else run();
    doc.restore();
  }
  doc.restore();
}

function cropMarks(doc, x, y, w, h, len = 3, off = 1.2) {
  doc.save().lineWidth(0.3).strokeColor('#000000');
  const L = mm(len); const O = mm(off);
  [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]].forEach(([px, py, sx, sy]) => {
    doc.moveTo(px + sx * O, py).lineTo(px + sx * (O + L), py).stroke(); doc.moveTo(px, py + sy * O).lineTo(px, py + sy * (O + L)).stroke();
  });
  doc.restore();
}

// opts: { docs:[{layout, theme, values, locale}], mode, sheet, title, author, subject, createdAt, loadImage, watermark, accessible }
async function renderPdf(opts) {
  const { docs, mode = 'single', sheet = {}, loadImage } = opts;
  const cache = new Map();
  const imageLoader = async (ref) => { if (!cache.has(ref)) cache.set(ref, (async () => { try { return await loadImage(ref); } catch (e) { return null; } })()); return cache.get(ref); };
  const first = docs[0]; const paper0 = paperOf(first.layout);
  const lang = (opts.lang || first.locale || 'en');
  const pdf = new PDFDocument({
    autoFirstPage: false, margin: 0, compress: true, tagged: opts.accessible !== false, displayTitle: true, lang: lang === 'ur' ? 'ur-PK' : 'en',
    pdfVersion: '1.7', info: { Title: opts.title || 'Document', Author: opts.author || '', Subject: opts.subject || '', Creator: 'Aulensia Studio', Producer: 'Aulensia', CreationDate: opts.createdAt || new Date(), ModDate: opts.createdAt || new Date() },
  });
  pdf.registerFont('Naskh', path.join(FONT_DIR, 'NotoNaskhArabic-Regular.woff')); pdf.registerFont('Naskh-Bold', path.join(FONT_DIR, 'NotoNaskhArabic-Bold.woff'));
  const chunks = []; pdf.on('data', (c) => chunks.push(c));
  const done = new Promise((res, rej) => { pdf.on('end', () => res(Buffer.concat(chunks))); pdf.on('error', rej); });
  const notes = []; const structs = []; const parts = [];
  // one structure part per drawn side, so a two-sided document keeps its reading order page by page
  const closePart = (label) => { if (structs.length) { pdf.addStructure(pdf.struct('Sect', { title: label }, [...structs])); parts.push(1); structs.length = 0; } };
  const images = new Map();
  const mkCtx = (d, paper) => ({ values: d.values || {}, theme: { ...C.DEFAULT_THEME, ...(d.theme || {}) }, locale: d.locale || 'en', paper, loadImage: imageLoader, images, notes, struct: opts.accessible === false ? null : structs });

  if (mode === 'single') {
    for (const d of docs) {
      const paper = paperOf(d.layout);
      for (const side of d.layout.sides) {
        pdf.addPage({ size: [mm(paper.w), mm(paper.h)], margin: 0 });
        await drawSide(pdf, side, mkCtx(d, paper), 0); closePart(side.key || 'side');
      }
    }
  } else if (mode === 'proof') {
    const pad = paper0.bleed + 9;
    for (const side of first.layout.sides) {
      pdf.addPage({ size: [mm(paper0.w + 2 * pad), mm(paper0.h + 2 * pad)], margin: 0 });
      pdf.save().translate(mm(pad), mm(pad));
      await drawSide(pdf, side, mkCtx(first, paper0), paper0.bleed); closePart(side.key || 'side');
      // guides: bleed (red), trim (black marks), safe (green)
      pdf.save().lineWidth(0.4).dash(2, { space: 2 });
      pdf.strokeColor('#D32F2F').rect(-mm(paper0.bleed), -mm(paper0.bleed), mm(paper0.w + 2 * paper0.bleed), mm(paper0.h + 2 * paper0.bleed)).stroke();
      pdf.strokeColor('#2E7D32').rect(mm(paper0.safe), mm(paper0.safe), mm(paper0.w - 2 * paper0.safe), mm(paper0.h - 2 * paper0.safe)).stroke();
      pdf.restore();
      cropMarks(pdf, 0, 0, mm(paper0.w), mm(paper0.h), 5, paper0.bleed + 1);
      pdf.restore();
      pdf.save().fillColor('#9CA3AF').opacity(0.28).font('Helvetica-Bold').fontSize(mm(paper0.w) * 0.28);
      pdf.rotate(-30, { origin: [mm(paper0.w / 2 + pad), mm(paper0.h / 2 + pad)] });
      const wm = opts.watermark || 'PROOF'; const ww = pdf.widthOfString(wm);
      pdf.text(wm, mm(paper0.w / 2 + pad) - ww / 2, mm(paper0.h / 2 + pad) - mm(paper0.w) * 0.14, { lineBreak: false }); pdf.restore();
      pdf.save().fillColor('#374151').font('Helvetica').fontSize(6.5).text(`${opts.title || 'Proof'}  ·  ${side.key || 'side'}  ·  red = bleed, green = safe area, marks = trim  ·  not valid as an issued document`, mm(4), mm(paper0.h + 2 * pad) - mm(4.5), { lineBreak: false }); pdf.restore();
    }
  } else if (mode === 'sheet') {
    const pageW = sheet.page === 'A3' ? 297 : 210; const pageH = sheet.page === 'A3' ? 420 : 297;
    const margin = sheet.marginMm ?? 8; const gap = sheet.gapMm ?? 4; const cw = paper0.w; const ch = paper0.h;
    const cols = Math.max(1, sheet.cols || Math.floor((pageW - 2 * margin + gap) / (cw + gap)));
    const rowsN = Math.max(1, sheet.rows || Math.floor((pageH - 2 * margin + gap) / (ch + gap)));
    const per = cols * rowsN; const bleedDraw = Math.min(paper0.bleed, gap / 2);
    const gridW = cols * cw + (cols - 1) * gap; const gridH = rowsN * ch + (rowsN - 1) * gap;
    const ox = (pageW - gridW) / 2; const oy = (pageH - gridH) / 2;
    const hasBack = docs.some((d) => d.layout.sides.length > 1) && sheet.duplex !== false;
    for (let start = 0; start < docs.length; start += per) {
      const group = docs.slice(start, start + per);
      const sides = hasBack ? [0, 1] : [0];
      for (const si of sides) {
        pdf.addPage({ size: [mm(pageW), mm(pageH)], margin: 0 });
        for (let i = 0; i < group.length; i++) {
          const d = group[i]; const side = d.layout.sides[si]; if (!side) continue;
          const col = i % cols; const row = Math.floor(i / cols);
          const drawCol = si === 1 ? cols - 1 - col : col;   // the back page is flipped along the long edge
          const x = ox + drawCol * (cw + gap); const y = oy + row * (ch + gap);
          pdf.save().translate(mm(x), mm(y));
          await drawSide(pdf, side, mkCtx(d, paper0), bleedDraw); closePart(`${d.label || 'item'} ${side.key || ''}`);
          pdf.restore();
          if (sheet.cutMarks !== false) cropMarks(pdf, mm(x), mm(y), mm(cw), mm(ch), Math.min(3, Math.max(1.2, gap / 2)), Math.min(0.6, gap / 6));
        }
        pdf.save().fillColor('#6B7280').font('Helvetica').fontSize(6).text(`${opts.title || 'Print sheet'} · page ${Math.floor(start / per) * sides.length + si + 1}${si === 1 ? ' (back, flip on long edge)' : ''}`, mm(4), mm(pageH) - mm(5), { lineBreak: false }); pdf.restore();
      }
    }
  }
  pdf.end();
  const buffer = await done;
  return { buffer, notes: [...new Set(notes)] };
}
module.exports = { renderPdf, MM };
