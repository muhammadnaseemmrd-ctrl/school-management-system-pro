// Printable activity sheets (PRD E15, CAP-0280): tracing pages and observation sheets, made on the server so they print the same anywhere.
const PDFDocument = require('pdfkit');

const PATTERNS = ['lines', 'zigzag', 'waves', 'loops', 'circles'];
const GLYPHS = /^[A-Za-z0-9]{1,12}$/;
const INK = '#1B2837'; const SOFT = '#9AA6B2'; const LINE = '#C9D3DC';

function done(doc) { return new Promise((resolve, reject) => { const bufs = []; doc.on('data', (b) => bufs.push(b)); doc.on('end', () => resolve(Buffer.concat(bufs))); doc.on('error', reject); doc.end(); }); }
function head(doc, title, sub) {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(title, 40, 36); doc.font('Helvetica').fontSize(10).fillColor('#5B6B7B').text(sub || '', 40, 60);
  doc.fillColor(INK).fontSize(10).text('Name', 380, 40); doc.moveTo(412, 52).lineTo(555, 52).lineWidth(0.6).strokeColor(INK).stroke(); doc.text('Date', 380, 62); doc.moveTo(412, 74).lineTo(555, 74).stroke();
}
function guide(doc, x, y, w, h) { doc.lineWidth(0.6).strokeColor(LINE).undash(); doc.moveTo(x, y).lineTo(x + w, y).stroke(); doc.moveTo(x, y + h).lineTo(x + w, y + h).stroke(); doc.dash(2, { space: 3 }).moveTo(x, y + h / 2).lineTo(x + w, y + h / 2).stroke(); doc.undash(); }

function pattern(doc, kind, x, y, w, h) {
  doc.lineWidth(1.4).strokeColor(SOFT).dash(2, { space: 3 });
  const steps = Math.floor(w / 28);
  if (kind === 'lines') for (let i = 0; i < steps; i++) { const px = x + 10 + i * 28; doc.moveTo(px, y + 6).lineTo(px, y + h - 6).stroke(); }
  if (kind === 'zigzag') { doc.moveTo(x + 4, y + h - 6); for (let i = 0; i < steps * 2; i++) doc.lineTo(x + 4 + (i + 1) * 14, i % 2 === 0 ? y + 6 : y + h - 6); doc.stroke(); }
  if (kind === 'waves') { doc.moveTo(x + 4, y + h / 2); for (let i = 0; i < steps; i++) { const sx = x + 4 + i * 28; doc.bezierCurveTo(sx + 7, y + 2, sx + 21, y + 2, sx + 28, y + h / 2 - 0.01); doc.bezierCurveTo(sx + 35, y + h - 2, sx + 49, y + h - 2, sx + 56, y + h / 2); i += 1; } doc.stroke(); }
  if (kind === 'loops') for (let i = 0; i < steps; i++) { doc.circle(x + 16 + i * 28, y + h / 2, Math.min(11, h / 2 - 5)).stroke(); }
  if (kind === 'circles') for (let i = 0; i < Math.floor(steps / 1.5); i++) { doc.circle(x + 18 + i * 40, y + h / 2, Math.min(14, h / 2 - 4)).stroke(); }
  doc.undash();
}

// Tracing: each row has the glyph as a solid example, then dotted copies to trace
async function tracing({ text, pattern: pat, rows = 8, school = '' }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'Tracing practice', Author: school || 'Aulensia' } });
  head(doc, 'Trace and talk', 'Trace slowly with a thick crayon. There are no marks: enjoy the shapes.');
  const items = pat ? [pat] : String(text || '').split('');
  const n = Math.min(Math.max(1, parseInt(rows, 10) || 8), 10); const top = 100; const rowH = Math.floor((A4H - 130) / n);
  for (let r = 0; r < n; r++) {
    const y = top + r * rowH; const gh = rowH - 14; guide(doc, 40, y + 6, 515, gh - 12);
    const it = items[r % items.length];
    if (pat) pattern(doc, it, 44, y + 6, 507, gh - 12);
    else {
      const size = Math.round((gh - 12) * 1.25); doc.font('Helvetica').fontSize(size);
      const w = doc.widthOfString(it) + 18; const count = Math.max(2, Math.floor(515 / w)); const ty = y + 6 - size * 0.05 - (size - (gh - 12)) * 0.1;
      doc.fillColor(INK).text(it, 44, ty, { lineBreak: false });
      doc.dash(1.2, { space: 2.4 }).lineWidth(0.8).strokeColor(SOFT);
      for (let i = 1; i < count; i++) doc.text(it, 44 + i * w, ty, { lineBreak: false, fill: false, stroke: true });
      doc.undash();
    }
  }
  return done(doc);
}
const A4H = 842;

// Observation sheet: who did what, with room to note what was seen. Children down the side, milestones across.
async function observation({ title, room, day, kids, items, school = '' }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, info: { Title: 'Observation sheet', Author: school || 'Aulensia' } });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(title || 'Observation sheet', 30, 28); doc.font('Helvetica').fontSize(9).fillColor('#5B6B7B').text(`${room || ''}  ${day || ''}`, 30, 50);
  const cols = items.slice(0, 8); const nameW = 130; const gap = (842 - 60 - nameW) / Math.max(1, cols.length + 1); const top = 78;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('Child', 34, top + 4);
  cols.forEach((c, i) => doc.text(c.length > 30 ? `${c.slice(0, 28)}…` : c, 30 + nameW + i * gap + 2, top, { width: gap - 6, height: 28 }));
  doc.text('Notes', 30 + nameW + cols.length * gap + 2, top + 4);
  doc.moveTo(30, top + 32).lineTo(812, top + 32).lineWidth(0.8).strokeColor(INK).stroke();
  const rowH = Math.min(34, Math.floor((595 - 60 - top - 40) / Math.max(1, kids.length)));
  kids.forEach((k, r) => {
    const y = top + 36 + r * rowH; doc.font('Helvetica').fontSize(9).fillColor(INK).text(k, 34, y + rowH / 2 - 5, { width: nameW - 8, ellipsis: true, lineBreak: false });
    cols.forEach((_, i) => doc.rect(30 + nameW + i * gap + gap / 2 - 6, y + rowH / 2 - 6, 12, 12).lineWidth(0.6).strokeColor(SOFT).stroke());
    doc.moveTo(30, y + rowH).lineTo(812, y + rowH).lineWidth(0.3).strokeColor(LINE).stroke();
  });
  doc.font('Helvetica').fontSize(8).fillColor('#5B6B7B').text('E = exploring  P = practising  C = confident. Describe what you saw, not a score.', 30, 548, { lineBreak: false });
  return done(doc);
}

module.exports = { tracing, observation, PATTERNS, GLYPHS };
