// The printable answer sheet (PRD E14, CAP-0320): numbered bubbles, a candidate number grid, the sheet code and four corner marks.
const PDFDocument = require('pdfkit');
const { ANCHOR, BUBBLE, PAGE, formDigits } = require('./layout');
const MM = 72 / 25.4; const m = (v) => v * MM;

function drawPage(doc, layout, o) {
  const { form, school, person } = o; const black = '#000000';
  const a = ANCHOR.size / 2;
  for (const [k, [cx, cy]] of Object.entries(ANCHOR.centers)) { doc.rect(m(cx - a), m(cy - a), m(ANCHOR.size), m(ANCHOR.size)).fill(black); if (k === 'br') doc.rect(m(cx - a + ANCHOR.line), m(cy - a + ANCHOR.line), m(ANCHOR.size - 2 * ANCHOR.line), m(ANCHOR.size - 2 * ANCHOR.line)).fill('#ffffff'); }
  const text = (s, x, y, size, opts = {}) => doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(opts.color || '#222222').text(String(s), m(x), m(y), { lineBreak: false, ...opts.o });
  text(school || '', 24, 11, 12, { bold: true });
  text(form.title, 24, 18, 10, { bold: true });
  text(`Sheet ${formDigits(form.code)}  ·  ${layout.questions} questions, ${layout.choices} choices  ·  ${o.className || ''}${o.subjectName ? '  ·  ' + o.subjectName : ''}`, 24, 24, 7.5, { color: '#555555' });
  if (person) { text(person.name, 24, 31, 11, { bold: true }); text(`${person.admission ? 'Admission no. ' + person.admission + '   ' : ''}Candidate no. ${String(person.no).padStart(layout.idDigits, '0')}`, 24, 37, 8, { color: '#444444' }); }
  else { text('Name', 24, 32, 8, { color: '#555555' }); doc.moveTo(m(36), m(35.5)).lineTo(m(130), m(35.5)).lineWidth(0.5).strokeColor('#444444').stroke(); text('Date', 134, 32, 8, { color: '#555555' }); doc.moveTo(m(144), m(35.5)).lineTo(m(186), m(35.5)).stroke(); }
  doc.font('Helvetica').fontSize(6.8).fillColor('#444444').text(form.instructions || 'Use a dark pen or a soft pencil. Fill the bubble completely. Mark one answer for each question. To change an answer, rub the old mark out fully. Do not tick, cross or write outside the boxes, and keep the sheet flat and unfolded.', m(24), m(43), { width: m(160), lineGap: 1 });
  // candidate number and sheet code grids
  text('Candidate number', layout.id.x0 - 3, 55.2, 7, { bold: true }); text('Sheet code (printed)', layout.form.x0 - 3, 55.2, 7, { bold: true });
  const grid = (cols, g, filled) => cols.forEach((col, p) => {
    if (!filled) { doc.rect(m(g.x0 + p * g.dx - 2.7), m(58.6), m(5.4), m(5.6)).lineWidth(0.4).strokeColor('#444444').stroke(); }
    col.forEach((b) => { const on = filled && filled[p] === b.d; doc.circle(m(b.x), m(b.y), m(BUBBLE.r)).lineWidth(0.25).strokeColor('#333333').stroke(); if (on) doc.circle(m(b.x), m(b.y), m(BUBBLE.r - 0.15)).fill(black); if (p === 0) text(b.d, b.x - 7.2, b.y - 1.3, 6, { color: '#777777' }); });
    // the digit written above a person's own column is for people; the reader only looks at the bubbles
  });
  const idDigits = person ? String(person.no).padStart(layout.idDigits, '0').split('').map(Number) : null;
  grid(layout.idCols, layout.id, idDigits); grid(layout.formCols, layout.form, formDigits(form.code).split('').map(Number));
  if (idDigits) idDigits.forEach((d, p) => text(d, layout.id.x0 + p * layout.id.dx - 0.8, 59.9, 8, { color: '#444444' }));
  formDigits(form.code).split('').forEach((d, p) => text(d, layout.form.x0 + p * layout.form.dx - 0.8, 59.9, 8, { color: '#444444' }));
  // question rows
  const cols = Math.ceil(layout.questions / 25);
  for (let c = 0; c < cols; c++) { const first = layout.rows[c * 25]; if (!first) break; first.cols.forEach((b, i) => text(layout.letters[i], b.x - 0.9, layout.q.y0 - 6.2, 7, { bold: true, color: '#444444' })); }
  for (const r of layout.rows) { text(r.q, r.labelX - 3.2, r.y - 1.3, 7, { color: '#333333', o: { width: m(5.5), align: 'right', lineBreak: false } }); r.cols.forEach((b) => doc.circle(m(b.x), m(b.y), m(BUBBLE.r)).lineWidth(0.25).strokeColor('#333333').stroke()); }
  text(`Aulensia answer sheet · ${formDigits(form.code)} · ${person ? 'for ' + person.name : 'blank'}`, 24, 289.5, 5.5, { color: '#888888' });
}

// people: null for blank sheets (copies pages), or [{name, admission, no}] for one pre-filled sheet each
function renderSheetPdf({ layout, form, school, className, subjectName, people, copies = 1 }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [m(PAGE.w), m(PAGE.h)], margin: 0, autoFirstPage: false, info: { Title: `${form.title} answer sheet`, Author: school || 'Aulensia' } });
    const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const list = people && people.length ? people : Array.from({ length: Math.max(1, copies) }, () => null);
    for (const p of list) { doc.addPage({ size: [m(PAGE.w), m(PAGE.h)], margin: 0 }); drawPage(doc, layout, { form, school, className, subjectName, person: p }); }
    doc.end();
  });
}
module.exports = { renderSheetPdf };
