// The approved annual report as a printable document (PRD E32). The check code printed on it matches the public page.
const PDFDocument = require('pdfkit');
const fmt = (m) => (m.value === null || m.value === undefined ? 'not shown' : `${typeof m.value === 'number' ? Number(m.value).toLocaleString('en-US') : m.value}${m.unit === '%' ? '%' : m.unit && m.unit !== 'people' ? ` ${m.unit}` : ''}`);
function render(r, meta) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: r.title, Author: meta.school || 'Aulensia', Subject: `Annual report ${r.year}` }, tagged: true, lang: 'en' });
    const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const W = doc.page.width - 96; const ink = '#1b2837'; const mute = '#5b6b7b';
    const room = (n) => { if (doc.y > doc.page.height - n) doc.addPage(); };
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(18).text(meta.school || '', { width: W });
    doc.fontSize(14).text(r.title, { width: W }); doc.font('Helvetica').fontSize(9.5).fillColor(mute).text(`Year ${r.year}  ·  ${r.status}${r.approvedAt ? `  ·  approved ${String(r.approvedAt.toISOString ? r.approvedAt.toISOString() : r.approvedAt).slice(0, 10)} by ${r.approvedByName}` : ''}`, { width: W });
    doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text('The year in figures');
    for (const m of r.metrics) { room(60); doc.moveDown(0.3); doc.font('Helvetica-Bold').fontSize(10.5).fillColor(ink).text(`${m.label}: ${fmt(m)}`, { width: W }); doc.font('Helvetica').fontSize(8.5).fillColor(mute).text(`Source: ${m.source}`, { width: W }); }
    const stories = (r.stories || []).filter((s) => s.approved);
    if (stories.length) { doc.moveDown(1); room(120); doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text('Stories'); for (const s of stories) { room(140); doc.moveDown(0.4); doc.font('Helvetica-Bold').fontSize(10.5).fillColor(ink).text(s.title, { width: W }); doc.font('Helvetica').fontSize(10).fillColor('#3b4a5c').text(s.text, { width: W }); } }
    doc.moveDown(1.2); room(80); doc.font('Helvetica').fontSize(8).fillColor(mute).text(`Check code (SHA-256): ${r.hash}`, { width: W }); doc.text('Figures are counted from the school\'s own records. Stories are published with the agreement of the people in them.', { width: W });
    doc.end();
  });
}
module.exports = { render };
