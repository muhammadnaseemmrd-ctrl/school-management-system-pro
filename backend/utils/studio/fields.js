// The merge fields a design may use, per document family (PRD E12, CAP-0424). A design can only name fields listed here,
// so a template can never pull a column the family is not meant to show.
const GROUPS = {
  school: {
    'school.name': { label: 'School name', sample: 'Demo Public School' }, 'school.address': { label: 'School address', sample: 'Street 4, F-8, Islamabad' },
    'school.phone': { label: 'School phone', sample: '051 1234567' }, 'school.email': { label: 'School email', sample: 'office@demo.school' },
    'school.motto': { label: 'School motto', sample: 'Learn, Lead, Serve' }, 'school.logo': { label: 'School logo', type: 'image' },
  },
  doc: {
    'doc.serial': { label: 'Serial number', sample: 'CRT-2026-000123' }, 'doc.issueDate': { label: 'Issue date', sample: '19 Nov 2026' },
    'doc.validUntil': { label: 'Valid until', sample: '31 Mar 2027' }, 'doc.verifyUrl': { label: 'Verification link (QR only)', sample: 'https://aulensia.app/verify/SAMPLE0000000000000000', qrOnly: true },
    'doc.title': { label: 'Document title', sample: 'Certificate of Merit' }, 'doc.year': { label: 'Academic year', sample: '2026-2027' },
  },
  student: {
    'student.name': { label: 'Student name', sample: 'Ayesha Khan', personal: true }, 'student.fatherName': { label: 'Father name', sample: 'Imran Khan', personal: true },
    'student.admissionNo': { label: 'Admission number', sample: 'ADM-1042', personal: true }, 'student.rollNo': { label: 'Roll number', sample: '14' },
    'student.class': { label: 'Class', sample: 'Grade 6-A' }, 'student.house': { label: 'House', sample: 'Iqbal House' },
    'student.bloodGroup': { label: 'Blood group', sample: 'B+', personal: true }, 'student.dob': { label: 'Date of birth', sample: '12 Mar 2014', personal: true },
    'student.gender': { label: 'Gender', sample: 'Female' }, 'student.photo': { label: 'Student photo', type: 'image', personal: true },
    'student.guardianPhone': { label: 'Guardian phone', sample: '0300 1234567', personal: true }, 'student.address': { label: 'Home address', sample: 'House 12, Street 3, G-9, Islamabad', personal: true },
    'student.admissionDate': { label: 'Admission date', sample: '01 Apr 2020' }, 'student.libraryCardNo': { label: 'Library card number', sample: 'LIB-1042' },
    'student.leavingDate': { label: 'Leaving date', sample: '30 Jun 2026' }, 'student.conduct': { label: 'Conduct remark', sample: 'Good' },
  },
  staff: {
    'staff.name': { label: 'Staff name', sample: 'Sara Khan', personal: true }, 'staff.employeeId': { label: 'Employee ID', sample: 'EMP-017' },
    'staff.designation': { label: 'Designation', sample: 'Senior Teacher' }, 'staff.department': { label: 'Department', sample: 'Science' },
    'staff.phone': { label: 'Staff phone', sample: '0300 7654321', personal: true }, 'staff.photo': { label: 'Staff photo', type: 'image', personal: true },
    'staff.bloodGroup': { label: 'Blood group', sample: 'O+', personal: true },
  },
  visitor: {
    'visitor.name': { label: 'Visitor name', sample: 'Bilal Ahmed', personal: true }, 'visitor.organisation': { label: 'Organisation', sample: 'Book Traders' },
    'visitor.host': { label: 'Host', sample: 'Front office' }, 'visitor.purpose': { label: 'Purpose', sample: 'Deliver books' },
    'visitor.from': { label: 'Valid from', sample: '19 Nov 2026 09:00' }, 'visitor.to': { label: 'Valid to', sample: '19 Nov 2026 11:00' },
  },
  invoice: {
    'invoice.number': { label: 'Invoice number', sample: 'INV-2026-0042' }, 'invoice.challanCode': { label: 'Challan code', sample: 'CH-77A1B2' },
    'invoice.period': { label: 'Period', sample: 'December 2026' }, 'invoice.dueDate': { label: 'Due date', sample: '10 Dec 2026' },
    'invoice.total': { label: 'Total (PKR)', sample: '18,500' }, 'invoice.paid': { label: 'Paid (PKR)', sample: '0' }, 'invoice.balance': { label: 'Balance (PKR)', sample: '18,500' },
    'invoice.lines': { label: 'Fee lines (list)', sample: 'Tuition 15,000\nTransport 3,500', multiline: true }, 'invoice.status': { label: 'Status', sample: 'Open' },
    'invoice.bankDetails': { label: 'Bank details', sample: 'Meezan Bank · 0123-4567890\nTitle: Demo Public School', multiline: true },
  },
  payment: {
    'payment.receiptNo': { label: 'Receipt number', sample: 'RC-2026-0911' }, 'payment.amount': { label: 'Amount (PKR)', sample: '18,500' },
    'payment.method': { label: 'Method', sample: 'Bank transfer' }, 'payment.date': { label: 'Paid on', sample: '08 Dec 2026' },
    'payment.cashier': { label: 'Received by', sample: 'Front office' },
  },
  transcript: {
    'transcript.term': { label: 'Term or exam', sample: 'Annual Exam 2026' }, 'transcript.rows': { label: 'Subject table', type: 'rows', sample: [['English', '88', '100', 'A'], ['Mathematics', '92', '100', 'A+'], ['Science', '79', '100', 'B+']] },
    'transcript.total': { label: 'Total marks', sample: '259 / 300' }, 'transcript.percent': { label: 'Percentage', sample: '86.3%' },
    'transcript.grade': { label: 'Overall grade', sample: 'A' }, 'transcript.result': { label: 'Result', sample: 'Pass' }, 'transcript.position': { label: 'Position in class', sample: '3rd' },
  },
  custom: {
    'custom.title': { label: 'Award or letter title', sample: 'Certificate of Merit' }, 'custom.citation': { label: 'Citation', sample: 'for outstanding performance in Mathematics', multiline: true },
    'custom.date': { label: 'Date on the document', sample: '19 Nov 2026' }, 'custom.signatory': { label: 'Signatory name', sample: 'Dr. Nadia Rauf' }, 'custom.signatoryTitle': { label: 'Signatory title', sample: 'Principal' },
    'custom.subject': { label: 'Letter subject', sample: 'Fee concession approved' }, 'custom.recipient': { label: 'Recipient', sample: 'The Parent / Guardian' },
    'custom.body': { label: 'Letter body', sample: 'This is to inform you that your request has been approved.\n\nRegards,', multiline: true },
    'custom.line1': { label: 'Free line 1', sample: '' }, 'custom.line2': { label: 'Free line 2', sample: '' },
  },
};
const FAMILY_GROUPS = {
  idCard: ['school', 'doc', 'student'], libraryCard: ['school', 'doc', 'student'], staffBadge: ['school', 'doc', 'staff'], visitorPass: ['school', 'doc', 'visitor'],
  reportCard: ['school', 'doc', 'student', 'transcript', 'custom'], transcript: ['school', 'doc', 'student', 'transcript', 'custom'],
  certificate: ['school', 'doc', 'student', 'staff', 'custom'], challan: ['school', 'doc', 'student', 'invoice'], invoice: ['school', 'doc', 'student', 'invoice', 'payment'],
  receipt: ['school', 'doc', 'student', 'invoice', 'payment'], letterhead: ['school', 'doc', 'custom'], letter: ['school', 'doc', 'student', 'custom'],
};
const FAMILY_LABEL = { idCard: 'Student ID card', libraryCard: 'Library card', staffBadge: 'Staff badge', visitorPass: 'Visitor pass', reportCard: 'Report card', transcript: 'Transcript', certificate: 'Certificate', challan: 'Fee challan', invoice: 'Invoice', receipt: 'Receipt', letterhead: 'Letterhead', letter: 'Official letter' };
// Documents that exist once per person at a time: a new one replaces the old one
const SINGLETON = new Set(['idCard', 'libraryCard', 'staffBadge']);
const SUBJECT = { idCard: 'student', libraryCard: 'student', staffBadge: 'teacher', visitorPass: 'visitor', reportCard: 'student', transcript: 'student', certificate: 'student', challan: 'invoice', invoice: 'invoice', receipt: 'payment', letterhead: 'custom', letter: 'student' };
const SERIAL_PREFIX = { idCard: 'ID', libraryCard: 'LIB', staffBadge: 'STF', visitorPass: 'VIS', reportCard: 'RPT', transcript: 'TRN', certificate: 'CRT', challan: 'CHN', invoice: 'INV', receipt: 'RCP', letterhead: 'LTR', letter: 'LET' };
const CERT_KINDS = ['completion', 'merit', 'appreciation', 'transfer', 'character', 'conduct'];

const PAPERS = {
  A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 }, 'ID-1': { w: 85.6, h: 53.98 }, Badge: { w: 90, h: 120 }, Receipt: { w: 80, h: 200 },
};
// the family's own fields, as a flat map
const catalog = (family) => {
  const out = {};
  for (const g of FAMILY_GROUPS[family] || []) Object.assign(out, GROUPS[g]);
  return out;
};
const FIELD_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const fieldsIn = (text) => { const out = []; String(text || '').replace(FIELD_RE, (_, k) => { out.push(k); return ''; }); return out; };
const fill = (text, values) => String(text || '').replace(FIELD_RE, (_, k) => { const v = values[k]; return v === undefined || v === null ? '' : String(v); });
const sampleValues = (family) => {
  const out = {}; const c = catalog(family);
  for (const [k, def] of Object.entries(c)) if (def.sample !== undefined) out[k] = def.sample;
  return out;
};
module.exports = { GROUPS, FAMILY_GROUPS, FAMILY_LABEL, SINGLETON, SUBJECT, SERIAL_PREFIX, CERT_KINDS, PAPERS, catalog, fieldsIn, fill, sampleValues, FIELD_RE };
// Urdu sample text so a template can be previewed right-to-left before any real data is used (CAP-0432)
module.exports.URDU_SAMPLE = {
  'school.name': 'ڈیمو پبلک اسکول', 'school.address': 'گلی نمبر ۴، ایف ۸، اسلام آباد', 'school.motto': 'سیکھو، رہنمائی کرو، خدمت کرو',
  'student.name': 'عائشہ خان', 'student.fatherName': 'عمران خان', 'student.class': 'جماعت ششم', 'student.house': 'اقبال ہاؤس',
  'staff.name': 'سارہ خان', 'staff.designation': 'سینئر استاد', 'visitor.name': 'بلال احمد', 'visitor.host': 'فرنٹ آفس', 'visitor.purpose': 'کتابیں پہنچانا',
  'custom.signatory': 'ڈاکٹر نادیہ رؤف', 'custom.signatoryTitle': 'پرنسپل', 'custom.citation': 'ریاضی میں شاندار کارکردگی پر',
  'invoice.lines': 'ٹیوشن 15,000\nٹرانسپورٹ 3,500', 'payment.method': 'نقد', 'payment.cashier': 'فرنٹ آفس',
};
