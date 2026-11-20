// The certificate as a PDF (PRD E17). The reference, check code and signature are printed so the copy can be checked on the public page.
const PDFDocument = require('pdfkit');
const QR = require('qrcode');

async function render(c, origin) {
  const url = `${origin || ''}/verify-credential/${c.verifyKey}`; const qr = await QR.toBuffer(url, { margin: 1, width: 220 });
  return new Promise((resolve, reject) => {
    const s = c.snapshot || {}; const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50, info: { Title: `Certificate ${c.serial}`, Author: s.school || 'Aulensia', Subject: s.title || '' }, tagged: true, lang: 'en' });
    const chunks = []; doc.on('data', (d) => chunks.push(d)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    const W = doc.page.width - 100; const ink = '#1b2837'; const mute = '#5b6b7b';
    doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).lineWidth(1.5).strokeColor('#2a5cac').stroke();
    doc.fillColor(mute).font('Helvetica').fontSize(12).text(s.school || '', 50, 70, { width: W, align: 'center' });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(30).text(c.kind === 'specialization' ? 'Certificate of Specialization' : 'Certificate of Completion', 50, 110, { width: W, align: 'center' });
    if (c.status === 'revoked') doc.fillColor('#9f1239').fontSize(14).text('WITHDRAWN: this certificate is no longer valid', 50, 156, { width: W, align: 'center' });
    doc.fillColor(mute).font('Helvetica').fontSize(13).text('This is to certify that', 50, 190, { width: W, align: 'center' });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(26).text(s.learner || c.learnerName, 50, 215, { width: W, align: 'center' });
    doc.fillColor(mute).font('Helvetica').fontSize(13).text('has completed', 50, 262, { width: W, align: 'center' });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text(s.title || c.title, 50, 285, { width: W, align: 'center' });
    const meta = [s.hours ? `${s.hours} hours of study` : '', s.completedAt ? `Completed ${new Date(s.completedAt).toISOString().slice(0, 10)}` : '', c.expiresAt ? `Valid until ${new Date(c.expiresAt).toISOString().slice(0, 10)}` : ''].filter(Boolean).join('  ·  ');
    if (meta) doc.fillColor(mute).font('Helvetica').fontSize(11).text(meta, 50, 322, { width: W, align: 'center' });
    const skills = (s.skills || []).map((k) => k.name || k.code).filter(Boolean).join(', '); if (skills) doc.fillColor(mute).fontSize(10).text(`Skills: ${skills}`, 80, 345, { width: W - 60, align: 'center' });
    if (s.courses?.length) doc.fillColor(mute).fontSize(10).text(`Courses: ${s.courses.join(', ')}`, 80, 345, { width: W - 60, align: 'center' });
    doc.image(qr, 60, doc.page.height - 150, { width: 80 });
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(9).text(`Reference ${c.serial}  ·  Check code ${c.verifyKey}`, 160, doc.page.height - 140, { width: W - 120 });
    doc.fillColor(mute).font('Helvetica').fontSize(7.5).text(`Check this certificate at ${url}. Content hash ${String(c.contentHash).slice(0, 32)}…  Signature ${String(c.signature).slice(0, 32)}…  Issued ${new Date(c.createdAt || Date.now()).toISOString().slice(0, 10)}${c.issuedByName ? ` by ${c.issuedByName}` : ''}.`, 160, doc.page.height - 124, { width: W - 120 });
    doc.end();
  });
}
module.exports = { render };
