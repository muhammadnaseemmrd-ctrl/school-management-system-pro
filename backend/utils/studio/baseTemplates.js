// Aulensia's own original base designs (PRD E12, CAP-0422). Drawn from scratch for this product; free to use and change by any
// school on the platform. A school copies one to change it, the original is never edited.
const PROVENANCE = { source: 'aulensia-original', author: 'Aulensia design team', license: 'Original Aulensia design, free for schools on the platform' };
const mk = () => {
  let n = 0; const id = () => `l${++n}`;
  return {
    text: (name, x, y, w, h, text, o = {}) => ({ id: id(), type: 'text', name, x, y, w, h, text, font: 'sans', size: 9, color: 'theme.ink', valign: 'middle', fit: 'shrink', ...o }),
    rect: (name, x, y, w, h, fill, o = {}) => ({ id: id(), type: 'rect', name, x, y, w, h, fill, ...o }),
    frame: (name, x, y, w, h, stroke, sw, o = {}) => ({ id: id(), type: 'rect', name, x, y, w, h, fill: '', stroke, strokeW: sw, ...o }),
    line: (name, x, y, w, stroke = 'theme.ink', sw = 0.25, o = {}) => ({ id: id(), type: 'line', name, x, y, w, h: 0, stroke, strokeW: sw, ...o }),
    field: (name, x, y, w, h, field, o = {}) => ({ id: id(), type: 'image', source: 'field', name, x, y, w, h, field, fit: 'cover', ...o }),
    qr: (x, y, s, o = {}) => ({ id: id(), type: 'qr', name: 'Verification QR', x, y, w: s, h: s, value: '{{doc.verifyUrl}}', ...o }),
    barcode: (x, y, w, h, o = {}) => ({ id: id(), type: 'barcode', name: 'Serial barcode', x, y, w, h, value: '{{doc.serial}}', ...o }),
    table: (name, x, y, w, h, columns, o = {}) => ({ id: id(), type: 'table', name, x, y, w, h, columns, size: 9, rowH: 7, header: 'theme.primary', ...o }),
  };
};
const paper = (key, orientation, bleed = 3, safe = 5) => ({ key, orientation, bleedMm: bleed, safeMm: safe });
const WHITE = '#FFFFFF';

function idCard() {
  const L = mk(); const W = 85.6; const H = 53.98;
  const front = [
    L.rect('Header band', -3, -3, W + 6, 16, 'theme.primary', { bleed: true }),
    L.field('School logo', 4, 3.4, 8, 8, 'school.logo', { fit: 'contain' }),
    L.text('School name', 14, 3.4, 68, 4.6, '{{school.name}}', { size: 8.5, bold: true, color: WHITE }),
    L.text('Card title', 14, 8, 68, 3.6, 'STUDENT IDENTITY CARD', { size: 6, color: WHITE, textUr: 'طالب علم کا شناختی کارڈ', charSpace: 0.4 }),
    L.field('Photo', 4, 16, 20, 25, 'student.photo', { radius: 1.5 }),
    L.text('Name', 27, 16, 54, 6, '{{student.name}}', { size: 11, bold: true }),
    L.text('Class', 27, 22.5, 54, 4, 'Class {{student.class}}', { size: 7.5 }),
    L.text('Admission no', 27, 27, 36, 4, 'Adm. No: {{student.admissionNo}}', { size: 7 }),
    L.text('Roll and blood', 27, 31.5, 36, 4, 'Roll {{student.rollNo}}  ·  Blood {{student.bloodGroup}}', { size: 7 }),
    L.text('House', 27, 36, 36, 4, 'House: {{student.house}}', { size: 7 }),
    L.qr(65, 28.5, 16),
    L.rect('Footer band', -3, 46, W + 6, 10.98, 'theme.accent', { bleed: true }),
    L.text('Valid until', 4, 46.8, 40, 3.6, 'Valid until {{doc.validUntil}}', { size: 6.5, color: WHITE }),
    L.text('Serial', 44, 46.8, 37.6, 3.6, '{{doc.serial}}', { size: 6.5, color: WHITE, align: 'right' }),
  ];
  const back = [
    L.rect('Top rule', -3, -3, W + 6, 8, 'theme.primary', { bleed: true }),
    L.text('Back title', 5, 3.2, 75, 3.6, 'This card belongs to {{school.name}}', { size: 6.5, color: WHITE, bold: true, textUr: 'یہ کارڈ اسکول کی ملکیت ہے' }),
    L.text('Return note', 5, 9, 75, 5, 'If found, please return to the school office or call {{school.phone}}.', { size: 7, valign: 'top', fit: 'wrap' }),
    L.text('Address', 5, 15, 75, 4, '{{school.address}}', { size: 6.5 }),
    L.text('Emergency', 5, 21, 75, 4, 'Guardian contact: {{student.guardianPhone}}', { size: 7, bold: true }),
    L.barcode(5, 30, 48, 9),
    L.text('Barcode caption', 5, 39.6, 48, 3, '{{doc.serial}}', { size: 6, color: 'theme.ink' }),
    L.line('Signature line', 58, 38, 22.6),
    L.text('Signatory', 58, 39, 22.6, 3.4, 'Principal', { size: 6.5, align: 'center', textUr: 'پرنسپل' }),
    L.rect('Footer', -3, 47, W + 6, 9.98, 'theme.accent', { bleed: true }),
    L.text('Motto', 5, 47.4, 75, 3.4, '{{school.motto}}', { size: 6.5, color: WHITE, align: 'center' }),
  ];
  return { paper: paper('ID-1', 'landscape', 3, 3), sides: [{ key: 'front', background: 'theme.paper', layers: front }, { key: 'back', background: 'theme.paper', layers: back }] };
}

function libraryCard() {
  const L = mk(); const W = 85.6;
  const front = [
    L.rect('Header band', -3, -3, W + 6, 14, 'theme.accent', { bleed: true }),
    L.text('School', 5, 3.4, 75, 4.4, '{{school.name}}', { size: 8.5, bold: true, color: WHITE }),
    L.text('Title', 5, 7.4, 75, 3.4, 'LIBRARY CARD', { size: 6.5, color: WHITE, textUr: 'لائبریری کارڈ', charSpace: 0.5 }),
    L.text('Name', 5, 15, 75, 6, '{{student.name}}', { size: 11, bold: true }),
    L.text('Class', 5, 21.6, 75, 4, 'Class {{student.class}}  ·  Adm. No {{student.admissionNo}}', { size: 7.5 }),
    L.text('Card number', 5, 26.4, 75, 4, 'Card No: {{student.libraryCardNo}}', { size: 8, bold: true }),
    L.barcode(5, 33, 52, 11),
    L.text('Serial', 5, 44.4, 52, 3.4, '{{doc.serial}}', { size: 6.5 }),
    L.qr(63, 31, 16),
  ];
  const back = [
    L.rect('Top rule', -3, -3, W + 6, 8, 'theme.accent', { bleed: true }),
    L.text('Rules heading', 5, 3.2, 75, 3.6, 'Library rules', { size: 7, bold: true, color: WHITE, textUr: 'لائبریری کے قواعد' }),
    L.text('Rules', 5, 9, 75, 30, '1. Bring this card every time you borrow a book.\n2. Books are due on the date stamped by the librarian.\n3. A lost card must be reported at once; a new card replaces the old one.', { size: 7, valign: 'top', fit: 'wrap', lineHeight: 1.35 }),
  ];
  return { paper: paper('ID-1', 'landscape', 3, 3), sides: [{ key: 'front', background: 'theme.paper', layers: front }, { key: 'back', background: 'theme.paper', layers: back }] };
}

function staffBadge() {
  const L = mk(); const W = 90; const H = 120;
  const front = [
    L.rect('Header band', -3, -3, W + 6, 28, 'theme.primary', { bleed: true }),
    L.field('School logo', 8, 7, 14, 14, 'school.logo', { fit: 'contain' }),
    L.text('School', 25, 7, 57, 8, '{{school.name}}', { size: 11, bold: true, color: WHITE, fit: 'wrap' }),
    L.text('Badge title', 25, 16, 57, 5, 'STAFF', { size: 8, color: WHITE, charSpace: 1.5, textUr: 'عملہ' }),
    L.field('Photo', 25, 30, 40, 46, 'staff.photo', { radius: 2 }),
    L.text('Name', 8, 80, 74, 9, '{{staff.name}}', { size: 15, bold: true, align: 'center' }),
    L.text('Designation', 8, 89, 74, 6, '{{staff.designation}}', { size: 10, align: 'center' }),
    L.text('Employee id', 8, 95, 74, 5, 'ID {{staff.employeeId}}', { size: 9, align: 'center', bold: true }),
    L.qr(33, 100, 14, { x: 8 }),
    L.text('Serial', 25, 103, 57, 5, '{{doc.serial}}', { size: 8, align: 'right' }),
    L.rect('Footer band', -3, 116, W + 6, 7, 'theme.accent', { bleed: true }),
  ];
  return { paper: paper('Badge', 'portrait', 3, 5), sides: [{ key: 'front', background: 'theme.paper', layers: front }] };
}

function visitorPass() {
  const L = mk(); const W = 90;
  const front = [
    L.rect('Header band', -3, -3, W + 6, 30, 'theme.accent', { bleed: true }),
    L.text('Title', 8, 8, 74, 12, 'VISITOR', { size: 28, bold: true, color: WHITE, align: 'center', textUr: 'مہمان' }),
    L.text('School', 8, 20, 74, 5, '{{school.name}}', { size: 9, color: WHITE, align: 'center' }),
    L.text('Name', 8, 32, 74, 10, '{{visitor.name}}', { size: 18, bold: true, align: 'center' }),
    L.text('Organisation', 8, 42, 74, 6, '{{visitor.organisation}}', { size: 10, align: 'center' }),
    L.line('Divider', 8, 51, 74),
    L.text('Host', 8, 54, 74, 6, 'Visiting: {{visitor.host}}', { size: 10 }),
    L.text('Purpose', 8, 61, 74, 6, 'Purpose: {{visitor.purpose}}', { size: 10 }),
    L.text('From', 8, 68, 74, 6, 'From: {{visitor.from}}', { size: 10 }),
    L.text('To', 8, 75, 74, 6, 'Until: {{visitor.to}}', { size: 10 }),
    L.qr(8, 88, 24),
    L.text('Return note', 36, 90, 46, 20, 'Wear this pass where it can be seen and return it at the gate when you leave.', { size: 8, valign: 'top', fit: 'wrap' }),
    L.text('Serial', 36, 108, 46, 5, '{{doc.serial}}', { size: 8, align: 'right' }),
  ];
  return { paper: paper('Badge', 'portrait', 3, 5), sides: [{ key: 'front', background: 'theme.paper', layers: front }] };
}

// A4 portrait header shared by the paper documents
const head = (L, title, titleUr) => [
  L.rect('Header band', -3, -3, 216, 31, 'theme.primary', { bleed: true }),
  L.field('School logo', 12, 7, 17, 17, 'school.logo', { fit: 'contain' }),
  L.text('School name', 33, 7, 150, 9, '{{school.name}}', { size: 18, bold: true, color: WHITE }),
  L.text('School contact', 33, 16, 150, 6, '{{school.address}}  ·  {{school.phone}}', { size: 9, color: WHITE }),
  L.text('Title', 12, 32, 186, 10, title, { size: 17, bold: true, color: 'theme.primary', textUr: titleUr }),
  L.line('Title rule', 12, 43, 186, 'theme.accent', 0.6),
];
const foot = (L, y = 270) => [
  L.line('Footer rule', 12, y, 186, 'theme.ink', 0.2),
  L.text('Footer serial', 12, y + 2, 120, 4, 'Serial {{doc.serial}}  ·  Issued {{doc.issueDate}}', { size: 7.5 }),
  L.text('Footer verify', 12, y + 6, 120, 4, 'Check this document by scanning the QR code.', { size: 7, textUr: 'اس دستاویز کی تصدیق کیو آر کوڈ سکین کر کے کریں' }),
  L.qr(176, y + 1.5, 16),
];

function reportCard(title = 'Report Card', titleUr = 'رپورٹ کارڈ') {
  const L = mk();
  const rows = [
    ...head(L, '{{transcript.term}} — ' + title, titleUr),
    L.text('Student', 12, 47, 120, 6, 'Student: {{student.name}}', { size: 11, bold: true }),
    L.text('Father', 12, 53, 120, 6, 'Father: {{student.fatherName}}', { size: 10 }),
    L.text('Class', 135, 47, 63, 6, 'Class: {{student.class}}', { size: 10 }),
    L.text('Roll', 135, 53, 63, 6, 'Roll No: {{student.rollNo}}   Adm: {{student.admissionNo}}', { size: 9 }),
    L.table('Marks table', 12, 64, 186, 120, [{ title: 'Subject', w: 90, align: 'left' }, { title: 'Obtained', w: 32, align: 'right' }, { title: 'Out of', w: 32, align: 'right' }, { title: 'Grade', w: 32, align: 'center' }], { size: 10, rowH: 8 }),
    L.rect('Summary panel', 12, 192, 186, 26, 'theme.soft'),
    L.text('Total', 16, 194, 85, 7, 'Total: {{transcript.total}}', { size: 11, bold: true }),
    L.text('Percentage', 16, 201, 85, 7, 'Percentage: {{transcript.percent}}', { size: 11 }),
    L.text('Grade', 16, 208, 85, 7, 'Overall grade: {{transcript.grade}}', { size: 11 }),
    L.text('Result', 108, 194, 86, 7, 'Result: {{transcript.result}}', { size: 11, bold: true }),
    L.text('Position', 108, 201, 86, 7, 'Position in class: {{transcript.position}}', { size: 11 }),
    L.text('Remarks', 12, 222, 186, 14, '{{custom.citation}}', { size: 10, valign: 'top', fit: 'wrap' }),
    L.line('Teacher line', 12, 258, 55), L.text('Teacher', 12, 259, 55, 4, 'Class teacher', { size: 8, textUr: 'کلاس ٹیچر' }),
    L.line('Principal line', 143, 258, 55), L.text('Principal', 143, 259, 55, 4, '{{custom.signatoryTitle}}', { size: 8, align: 'right' }),
    ...foot(L),
  ];
  return { paper: paper('A4', 'portrait', 3, 6), sides: [{ key: 'front', background: 'theme.paper', layers: rows }] };
}

function certificate(title, titleUr, body, extra = {}) {
  const L = mk(); const W = 297; const H = 210;
  const layers = [
    L.rect('Paper tint', -3, -3, W + 6, H + 6, 'theme.soft', { bleed: true }),
    L.frame('Outer frame', 10, 10, W - 20, H - 20, 'theme.primary', 1.6, { bleed: true }),
    L.frame('Inner frame', 14, 14, W - 28, H - 28, 'theme.accent', 0.5, { bleed: true }),
    L.field('School logo', W / 2 - 11, 22, 22, 22, 'school.logo', { fit: 'contain' }),
    L.text('School', 30, 46, W - 60, 8, '{{school.name}}', { size: 16, bold: true, align: 'center', color: 'theme.primary' }),
    L.text('Title', 30, 57, W - 60, 18, title, { size: 34, bold: true, align: 'center', font: 'serif', textUr: titleUr }),
    L.line('Title rule', W / 2 - 40, 77, 80, 'theme.accent', 0.8),
    L.text('Body', 40, 84, W - 80, 56, body, { size: 15, align: 'center', font: 'serif', valign: 'top', fit: 'wrap', lineHeight: 1.45 }),
    L.line('Signature line', 40, 168, 70), L.text('Signatory', 40, 169, 70, 6, '{{custom.signatory}}  —  {{custom.signatoryTitle}}', { size: 10, align: 'center' }),
    L.text('Date', 187, 160, 70, 6, '{{custom.date}}', { size: 11, align: 'center' }), L.line('Date line', 187, 168, 70), L.text('Date caption', 187, 169, 70, 6, 'Date', { size: 10, align: 'center', textUr: 'تاریخ' }),
    L.qr(W / 2 - 9, 160, 18), L.text('Serial', W / 2 - 40, 179, 80, 5, '{{doc.serial}}', { size: 8, align: 'center' }),
  ];
  return { paper: paper('A4', 'landscape', 3, 12), sides: [{ key: 'front', background: 'theme.soft', layers }], ...extra };
}

function bill(title, titleUr, receipt = false) {
  const L = mk();
  const layers = [
    ...head(L, title, titleUr),
    L.text('Student', 12, 47, 120, 6, 'Student: {{student.name}}', { size: 11, bold: true }),
    L.text('Class', 12, 53, 120, 6, 'Class {{student.class}}  ·  Adm. No {{student.admissionNo}}', { size: 10 }),
    L.text('Number', 135, 47, 63, 6, receipt ? 'Receipt: {{payment.receiptNo}}' : 'Invoice: {{invoice.number}}', { size: 10, bold: true, align: 'right' }),
    L.text('Period', 135, 53, 63, 6, 'Period: {{invoice.period}}', { size: 10, align: 'right' }),
    L.rect('Lines panel', 12, 64, 186, 70, 'theme.soft'),
    L.text('Lines heading', 16, 66, 120, 6, 'Fee details', { size: 10, bold: true, textUr: 'فیس کی تفصیل' }),
    L.text('Lines', 16, 73, 178, 56, '{{invoice.lines}}', { size: 11, valign: 'top', fit: 'wrap', lineHeight: 1.5 }),
    L.text('Total', 100, 140, 98, 8, 'Total: PKR {{invoice.total}}', { size: 13, bold: true, align: 'right' }),
    L.text('Paid', 100, 148, 98, 7, receipt ? 'Paid now: PKR {{payment.amount}}' : 'Paid so far: PKR {{invoice.paid}}', { size: 11, align: 'right' }),
    L.text('Balance', 100, 155, 98, 7, 'Balance: PKR {{invoice.balance}}', { size: 11, align: 'right' }),
    L.text('Due', 12, 140, 80, 7, receipt ? 'Paid on {{payment.date}}' : 'Due date: {{invoice.dueDate}}', { size: 11 }),
    L.text('Status', 12, 148, 80, 7, 'Status: {{invoice.status}}', { size: 11 }),
    L.text('Bank', 12, 172, 120, 20, '{{invoice.bankDetails}}', { size: 9, valign: 'top', fit: 'wrap' }),
    L.barcode(12, 200, 80, 14), L.text('Challan code', 12, 215, 80, 4, 'Challan {{invoice.challanCode}}', { size: 8 }),
    ...foot(L),
  ];
  return { paper: paper('A4', 'portrait', 3, 6), sides: [{ key: 'front', background: 'theme.paper', layers }] };
}

function receiptRoll() {
  const L = mk(); const ink = '#000000';
  const layers = [
    L.text('School', 4, 5, 72, 7, '{{school.name}}', { size: 11, bold: true, align: 'center', color: ink, fit: 'wrap' }),
    L.text('Contact', 4, 13, 72, 6, '{{school.phone}}', { size: 8, align: 'center', color: ink }),
    L.line('Rule 1', 4, 21, 72, ink, 0.3),
    L.text('Heading', 4, 23, 72, 6, 'FEE RECEIPT', { size: 10, bold: true, align: 'center', color: ink, textUr: 'فیس کی رسید' }),
    L.text('Number', 4, 30, 72, 5, 'No: {{payment.receiptNo}}', { size: 8.5, color: ink }),
    L.text('Date', 4, 35, 72, 5, 'Date: {{payment.date}}', { size: 8.5, color: ink }),
    L.text('Student', 4, 41, 72, 5, '{{student.name}}', { size: 9, bold: true, color: ink }),
    L.text('Class', 4, 46, 72, 5, 'Class {{student.class}}', { size: 8.5, color: ink }),
    L.line('Rule 2', 4, 54, 72, ink, 0.3),
    L.text('Lines', 4, 56, 72, 42, '{{invoice.lines}}', { size: 8.5, valign: 'top', fit: 'wrap', color: ink, lineHeight: 1.4 }),
    L.line('Rule 3', 4, 100, 72, ink, 0.3),
    L.text('Amount', 4, 102, 72, 8, 'PAID  PKR {{payment.amount}}', { size: 12, bold: true, align: 'right', color: ink }),
    L.text('Method', 4, 111, 72, 5, 'By {{payment.method}}', { size: 8.5, color: ink }),
    L.text('Cashier', 4, 116, 72, 5, 'Received by {{payment.cashier}}', { size: 8.5, color: ink }),
    L.qr(30, 128, 20),
    L.text('Serial', 4, 150, 72, 5, '{{doc.serial}}', { size: 8, align: 'center', color: ink }),
    L.text('Thanks', 4, 156, 72, 6, 'Thank you', { size: 9, align: 'center', color: ink, textUr: 'شکریہ' }),
  ];
  return { paper: paper('Receipt', 'portrait', 0, 3), sides: [{ key: 'front', background: '#FFFFFF', layers }] };
}

function letterhead(withBody = true) {
  const L = mk();
  const layers = [
    L.rect('Header band', -3, -3, 216, 28, 'theme.primary', { bleed: true }),
    L.field('School logo', 12, 6, 16, 16, 'school.logo', { fit: 'contain' }),
    L.text('School name', 32, 6, 160, 9, '{{school.name}}', { size: 18, bold: true, color: WHITE }),
    L.text('Contact line', 32, 15, 160, 6, '{{school.address}}  ·  {{school.phone}}  ·  {{school.email}}', { size: 9, color: WHITE }),
    L.line('Header rule', 12, 29, 186, 'theme.accent', 0.8),
    ...(withBody ? [
      L.text('Date', 140, 36, 58, 6, '{{custom.date}}', { size: 10, align: 'right' }),
      L.text('Recipient', 12, 44, 120, 6, '{{custom.recipient}}', { size: 11, bold: true }),
      L.text('Subject', 12, 54, 186, 7, 'Subject: {{custom.subject}}', { size: 12, bold: true }),
      L.text('Body', 12, 64, 186, 150, '{{custom.body}}', { size: 11, valign: 'top', fit: 'wrap', lineHeight: 1.5 }),
      L.line('Signature line', 12, 245, 55), L.text('Signatory', 12, 246, 90, 10, '{{custom.signatory}}\n{{custom.signatoryTitle}}', { size: 10, valign: 'top', fit: 'wrap' }),
    ] : []),
    ...foot(L),
  ];
  return { paper: paper('A4', 'portrait', 3, 6), sides: [{ key: 'front', background: 'theme.paper', layers }] };
}

const CERTS = {
  completion: ['Certificate of Completion', 'تکمیل کا سرٹیفکیٹ', 'This is to certify that\n{{student.name}}\n{{custom.citation}}'],
  merit: ['Certificate of Merit', 'اعزازی سرٹیفکیٹ', 'Proudly awarded to\n{{student.name}}\n{{custom.citation}}'],
  appreciation: ['Certificate of Appreciation', 'تعریفی سرٹیفکیٹ', 'In grateful appreciation of\n{{student.name}}\n{{custom.citation}}'],
  transfer: ['School Leaving Certificate', 'اسکول چھوڑنے کا سرٹیفکیٹ', 'This is to certify that {{student.name}}, son/daughter of {{student.fatherName}}, Admission No. {{student.admissionNo}}, studied in this school from {{student.admissionDate}} to {{student.leavingDate}} and last attended {{student.class}}.\nConduct: {{student.conduct}}.'],
  character: ['Character Certificate', 'کریکٹر سرٹیفکیٹ', 'This is to certify that {{student.name}}, son/daughter of {{student.fatherName}}, is a student of this school in {{student.class}} and bears a good moral character to the best of our knowledge.\n{{custom.citation}}'],
  conduct: ['Conduct Certificate', 'حسن سلوک کا سرٹیفکیٹ', 'This is to certify that {{student.name}} of {{student.class}} has shown {{student.conduct}} conduct during the academic year {{doc.year}}.\n{{custom.citation}}'],
};

function buildBase() {
  const out = [
    { key: 'id-card-student', name: 'Student ID card', family: 'idCard', paper: 'ID-1', description: 'Photo, class, QR and barcode on the back. Front and back.', layout: idCard() },
    { key: 'library-card', name: 'Library card', family: 'libraryCard', paper: 'ID-1', description: 'Card number with barcode and rules on the back.', layout: libraryCard() },
    { key: 'staff-badge', name: 'Staff badge', family: 'staffBadge', paper: 'Badge', description: 'Portrait badge with photo, role and QR.', layout: staffBadge() },
    { key: 'visitor-pass', name: 'Visitor pass', family: 'visitorPass', paper: 'Badge', description: 'Day pass with host, purpose, validity and QR.', layout: visitorPass() },
    { key: 'report-card', name: 'Report card', family: 'reportCard', paper: 'A4', description: 'Marks table, totals, remarks and signatures.', layout: reportCard() },
    { key: 'transcript', name: 'Transcript', family: 'transcript', paper: 'A4', description: 'Official transcript of results for one term.', layout: reportCard('Academic Transcript', 'تعلیمی ٹرانسکرپٹ') },
    ...Object.entries(CERTS).map(([kind, [t, tu, body]]) => ({ key: `certificate-${kind}`, name: t, family: 'certificate', kind, paper: 'A4', description: `${t}, A4 landscape.`, layout: certificate(t, tu, body) })),
    { key: 'fee-challan', name: 'Fee challan', family: 'challan', paper: 'A4', description: 'Fee lines, due date, bank details and barcode.', layout: bill('Fee Challan', 'فیس چالان') },
    { key: 'fee-invoice', name: 'Fee invoice', family: 'invoice', paper: 'A4', description: 'Itemised invoice with balance.', layout: bill('Fee Invoice', 'فیس انوائس') },
    { key: 'fee-receipt-roll', name: 'Fee receipt (80 mm roll)', family: 'receipt', paper: 'Receipt', description: 'Black and white receipt for a thermal printer.', layout: receiptRoll() },
    { key: 'letterhead', name: 'Letterhead', family: 'letterhead', paper: 'A4', description: 'School letterhead with a body for short letters.', layout: letterhead(true) },
    { key: 'official-letter', name: 'Official letter', family: 'letter', paper: 'A4', description: 'Letter to a parent about one student.', layout: letterhead(true) },
  ];
  return out.map((t) => ({ ...t, provenance: PROVENANCE }));
}
module.exports = { buildBase, PROVENANCE };
