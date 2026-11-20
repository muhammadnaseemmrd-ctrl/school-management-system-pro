// The transcript as a PDF (PRD E16). The reference, content hash and signature are printed so the copy can be checked on the public page.
const PDFDocument = require('pdfkit');

function render(snap, meta) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `Transcript ${meta.serial}`, Author: snap.school || 'Aulensia', Subject: 'Academic transcript' }, tagged: true, lang: 'en' });
    const chunks = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const W = doc.page.width - 84; const ink = '#1b2837'; const mute = '#5b6b7b'; const line = '#e3e7e7';
    const official = snap.kind !== 'unofficial';
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(16).text(snap.school || '', { width: W });
    doc.font('Helvetica').fontSize(10).fillColor(mute).text(snap.kind === 'final' ? 'Final transcript' : official ? 'Official academic transcript' : 'Unofficial transcript (not valid for submission)', { width: W });
    if (meta.status === 'revoked') doc.fillColor('#9f1239').font('Helvetica-Bold').fontSize(12).text('WITHDRAWN: this transcript is no longer valid', { width: W });
    doc.moveDown(0.6); doc.font('Helvetica-Bold').fontSize(12).fillColor(ink).text(snap.student?.name || '');
    doc.font('Helvetica').fontSize(9.5).fillColor(mute).text([snap.student?.admissionNumber ? `Admission no. ${snap.student.admissionNumber}` : '', snap.program ? `${snap.program.name}, catalogue ${snap.program.catalogYear}` : '', snap.program?.graduation ? `Graduated ${String(snap.program.graduation.at || '').slice(0, 10)}` : ''].filter(Boolean).join('  ·  '), { width: W });
    doc.moveDown(0.6); doc.moveTo(42, doc.y).lineTo(42 + W, doc.y).strokeColor(line).stroke(); doc.moveDown(0.5);
    const cols = [42, 110, 400, 450, 500]; const row = (a, b, c, d, bold) => { const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(bold ? ink : '#3b4a5c'); doc.text(a, cols[0], y, { width: 64, lineBreak: false }); doc.text(b, cols[1], y, { width: 285, lineBreak: false, ellipsis: true }); doc.text(c, cols[2], y, { width: 44, lineBreak: false }); doc.text(d, cols[3], y, { width: 44, lineBreak: false }); doc.moveDown(0.95); };
    for (const t of snap.terms || []) {
      if (doc.y > doc.page.height - 130) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(ink).text(`${t.name}${t.code ? ` (${t.code})` : ''}`, 42); doc.moveDown(0.2);
      row('Code', 'Course', 'Credits', 'Grade', true);
      for (const c of t.courses) { if (doc.y > doc.page.height - 80) doc.addPage(); row(c.code, `${c.title}${c.repeat ? ' (repeat)' : ''}${c.countsInAverage === false ? ' (not in average)' : ''}`, String(c.credits), c.grade || ''); }
      if (t.gpa !== null && t.gpa !== undefined) { doc.font('Helvetica').fontSize(9).fillColor(mute).text(`Term average ${Number(t.gpa).toFixed(2)}  ·  credits earned ${t.earned ?? 0}`, 42); }
      doc.moveDown(0.5);
    }
    if (doc.y > doc.page.height - 150) doc.addPage();
    doc.moveTo(42, doc.y).lineTo(42 + W, doc.y).strokeColor(line).stroke(); doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text(`Cumulative average ${Number(snap.cgpa || 0).toFixed(2)}  ·  credits earned ${snap.creditsEarned || 0}`);
    doc.font('Helvetica').fontSize(8.5).fillColor(mute).text(`Grade scale: ${(snap.scale || []).map((g) => `${g.grade} ${g.points}`).join(', ')}. Repeated courses: ${snap.repeatRule === 'best' ? 'the best attempt counts' : snap.repeatRule === 'average' ? 'all attempts are averaged' : 'the latest attempt counts'}. W withdrew, I incomplete, AU audit.`, { width: W });
    if (official && meta.verifyKey) {
      doc.moveDown(0.8); doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text(`Reference ${meta.serial}  ·  Check code ${meta.verifyKey}`);
      doc.font('Helvetica').fontSize(7.5).fillColor(mute).text(`Check this transcript at /verify-transcript/${meta.verifyKey}. Content hash ${String(meta.hash || '').slice(0, 32)}…  Signature ${String(meta.signature || '').slice(0, 32)}…  Issued ${meta.issuedAt ? new Date(meta.issuedAt).toISOString().slice(0, 10) : ''}${meta.issuedBy ? ` by ${meta.issuedBy}` : ''}.`, { width: W });
    }
    doc.end();
  });
}
module.exports = { render };
