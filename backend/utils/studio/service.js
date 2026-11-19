// Everything the studio needs from the rest of the product: base templates per school, serial numbers, tokens, the data that
// fills a design for one person, and a frozen copy of the pictures so an issued document can be printed again exactly (PRD E12).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('../../lib/pgdoc');
const DocTemplate = require('../../models/DocTemplate');
const DocTemplateVersion = require('../../models/DocTemplateVersion');
const DocCounter = require('../../models/DocCounter');
const StoredFile = require('../../models/StoredFile');
const StudioAsset = require('../../models/StudioAsset');
const School = require('../../models/School');
const Student = require('../../models/Student');
const Teacher = require('../../models/Teacher');
const Class = require('../../models/Class');
const Exam = require('../../models/Exam');
const Marks = require('../../models/Marks');
const Subject = require('../../models/Subject');
const FeeInvoice = require('../../models/FeeInvoice');
const FeePayment = require('../../models/FeePayment');
const VisitorVisit = require('../../models/VisitorVisit');
const Fin = require('../schoolFinance');
const { buildBase } = require('./baseTemplates');
const { PAPERS, SERIAL_PREFIX } = require('./fields');
const { validate } = require('./validate');

const oid = (v) => (v && mongoose.isValidObjectId(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const sha = (o) => crypto.createHash('sha256').update(typeof o === 'string' ? o : JSON.stringify(o)).digest('hex');
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newToken = () => { const b = crypto.randomBytes(15); let out = ''; let bits = 0; let acc = 0; for (const byte of b) { acc = (acc << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHA[(acc >> (bits - 5)) & 31]; bits -= 5; } } return out.slice(0, 24); };
const TOKEN_RE = /^[0-9A-HJKMNP-TV-Z]{24}$/;
const maskName = (n) => { const p = String(n || '').trim().split(/\s+/).filter(Boolean); if (!p.length) return ''; if (p.length === 1) return `${p[0][0]}***`; return `${p[0]} ${p[p.length - 1][0]}.`; };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }) : '');
const fmtDateTime = (d) => (d ? `${fmtDate(d)} ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' })}` : '');
const money = (n) => Number(n || 0).toLocaleString('en-PK');
const gradeOf = (pct) => (pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F');
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };

// ── base templates ──
async function ensureBase(schoolId) {
  const sid = oid(schoolId); const base = buildBase();
  const have = new Set((await DocTemplate.find({ schoolId: sid, isBase: true })).map((t) => t.key));
  for (const b of base) {
    if (have.has(b.key)) continue;
    try {
      const t = await DocTemplate.create({ schoolId: sid, key: b.key, name: b.name, family: b.family, kind: b.kind || '', paper: b.paper, description: b.description, isBase: true, provenance: b.provenance, createdByName: 'Aulensia' });
      const v = await DocTemplateVersion.create({ schoolId: sid, templateId: t._id, version: 1, state: 'Published', layout: b.layout, theme: {}, locales: ['en', 'ur'], note: 'Original Aulensia design', hash: sha({ layout: b.layout, theme: {} }), createdByName: 'Aulensia', publishedAt: new Date() });
      t.liveVersionId = v._id; t.liveVersion = 1; t.latestVersion = 1; await t.save();
    } catch (e) { if (e.code !== 11000) throw e; }
  }
}

// ── serial numbers and tokens ──
async function nextSerial(schoolId, family, at = new Date()) {
  const year = at.getFullYear(); const key = `${family}:${year}`; const sid = oid(schoolId);
  for (let i = 0; i < 12; i++) {
    let row = await DocCounter.findOne({ schoolId: sid, key });
    if (!row) { try { row = await DocCounter.create({ schoolId: sid, key, n: 0 }); } catch (e) { if (e.code !== 11000) throw e; row = await DocCounter.findOne({ schoolId: sid, key }); } }
    const r = await DocCounter.updateOne({ _id: row._id, n: row.n }, { $set: { n: row.n + 1 } });
    if (r.modifiedCount === 1 || r.matchedCount === 1 || r.nModified === 1) return `${SERIAL_PREFIX[family] || 'DOC'}-${year}-${String(row.n + 1).padStart(6, '0')}`;
  }
  throw new Error('Could not take the next serial number, try again');
}

// ── pictures ──
const isPng = (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50;
const isJpg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
const STORED = /\/api\/files\/stored\/([0-9a-f]{24})\/([A-Za-z0-9_-]+)/;
async function fetchBuffer(schoolId, url) {
  if (!url) return null;
  const m = String(url).match(STORED);
  if (m) { const f = await StoredFile.findById(m[1]); return f && f.key === m[2] && (!f.schoolId || String(f.schoolId) === String(schoolId)) ? f.data : null; }
  if (String(url).startsWith('/uploads/')) { try { const p = path.join(__dirname, '..', '..', String(url).replace(/\.\./g, '')); return fs.readFileSync(p); } catch (e) { return null; } }
  if (/^https:\/\//.test(url)) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(tm);
      if (!r.ok) return null; const ab = Buffer.from(await r.arrayBuffer()); return ab.length <= 3 * 1024 * 1024 ? ab : null;
    } catch (e) { return null; }
  }
  return null;
}
// freeze=true copies the picture into its own stored file so later changes never alter an issued document
async function pictureRef(schoolId, url, freeze) {
  if (!url) return '';
  if (!freeze) return `url:${url}`;
  const buf = await fetchBuffer(schoolId, url);
  if (!buf || !(isPng(buf) || isJpg(buf))) return '';
  const f = await StoredFile.create({ schoolId: oid(schoolId), key: crypto.randomBytes(12).toString('hex'), originalName: 'studio-frozen', mimeType: isPng(buf) ? 'image/png' : 'image/jpeg', size: buf.length, data: buf });
  return `stored:${f._id}`;
}
function makeLoader(schoolId) {
  return async (ref) => {
    let buf = null;
    if (ref.startsWith('stored:')) { const f = await StoredFile.findById(ref.slice(7)); buf = f && (!f.schoolId || String(f.schoolId) === String(schoolId)) ? f.data : null; }
    else if (ref.startsWith('asset:')) { const a = await StudioAsset.findOne({ _id: ref.slice(6), schoolId: oid(schoolId) }); if (a) { const f = await StoredFile.findById(a.fileId); buf = f ? f.data : null; } }
    else if (ref.startsWith('url:')) buf = await fetchBuffer(schoolId, ref.slice(4));
    return buf && (isPng(buf) || isJpg(buf)) ? buf : null;
  };
}

// ── the data that fills a design ──
async function schoolValues(schoolId, freeze) {
  const s = await School.findById(schoolId);
  const logo = await pictureRef(schoolId, s?.logo, freeze);
  return { school: s, v: { 'school.name': s?.name || '', 'school.address': s?.address || '', 'school.phone': s?.phone || '', 'school.email': s?.email || '', 'school.motto': s?.motto || '', 'school.logo': logo } };
}
const bankText = (s) => { const p = s?.paymentInfo || {}; return [p.bankName && `${p.bankName}${p.accountNumber ? ' · ' + p.accountNumber : ''}`, p.accountTitle && `Title: ${p.accountTitle}`, p.iban && `IBAN: ${p.iban}`, p.jazzcash && `JazzCash: ${p.jazzcash}`, p.easypaisa && `Easypaisa: ${p.easypaisa}`, p.instructions].filter(Boolean).join('\n'); };

async function studentValues(schoolId, st, freeze) {
  const cls = st.classId ? await Class.findOne({ _id: st.classId, schoolId: oid(schoolId) }) : null;
  const guard = st.father?.mobileNumber || st.guardian?.mobileNumber || st.mother?.mobileNumber || st.emergencyContact?.mobileNumber || st.mobileNumber || st.phone || '';
  return {
    'student.name': st.fullName || st.name || '', 'student.fatherName': st.father?.name || st.guardian?.name || '', 'student.admissionNo': st.admissionNumber || st.studentId || '',
    'student.rollNo': st.rollNumber || '', 'student.class': cls ? `${cls.standard}${cls.division ? '-' + cls.division : ''}` : (st.division || ''), 'student.house': st.house || '',
    'student.bloodGroup': st.bloodGroup || '', 'student.dob': fmtDate(st.dateOfBirth), 'student.gender': st.gender || '',
    'student.photo': await pictureRef(schoolId, st.avatar || st.photo, freeze), 'student.guardianPhone': guard, 'student.address': st.currentAddress || st.permanentAddress || st.address || '',
    'student.admissionDate': fmtDate(st.admissionDate), 'student.libraryCardNo': st.libraryCardNumber || '', 'student.leavingDate': '', 'student.conduct': 'good',
    'doc.year': st.academicYear || cls?.academicYear || '',
  };
}

async function transcriptValues(schoolId, st, term) {
  const sid = oid(schoolId);
  const exams = await Exam.find({ schoolId: sid, classId: st.classId, name: term });
  if (!exams.length) return { error: `No exam named "${term}" for this class.` };
  const marks = await Marks.find({ schoolId: sid, examId: { $in: exams.map((e) => e._id) } });
  const mine = marks.filter((m) => String(m.studentId) === String(st._id));
  if (!mine.length) return { error: 'No marks recorded for this student in that exam.' };
  const subjects = await Subject.find({ schoolId: sid, _id: { $in: [...new Set(mine.map((m) => String(m.subjectId)))].map(oid) } });
  const nameOf = new Map(subjects.map((s) => [String(s._id), s.name]));
  const rows = mine.sort((a, b) => String(nameOf.get(String(a.subjectId))).localeCompare(String(nameOf.get(String(b.subjectId))))).map((m) => [nameOf.get(String(m.subjectId)) || 'Subject', String(m.marks), String(m.outOfMarks), m.grade || gradeOf((m.marks / m.outOfMarks) * 100)]);
  const total = mine.reduce((a, m) => a + m.marks, 0); const out = mine.reduce((a, m) => a + m.outOfMarks, 0); const pct = out ? (total / out) * 100 : 0;
  const totals = new Map(); marks.forEach((m) => totals.set(String(m.studentId), (totals.get(String(m.studentId)) || 0) + m.marks));
  const rank = [...totals.values()].filter((t) => t > total).length + 1;
  const failed = mine.some((m) => m.passStatus === 'Fail');
  return { values: { 'transcript.term': term, 'transcript.rows': rows, 'transcript.total': `${total} / ${out}`, 'transcript.percent': `${pct.toFixed(1)}%`, 'transcript.grade': gradeOf(pct), 'transcript.result': failed ? 'Fail' : 'Pass', 'transcript.position': ordinal(rank) } };
}

// → { values, subjectName, subjectType, holderName } or { error }
async function resolveValues({ schoolId, family, subjectType, subjectId, custom = {}, freeze = false, term }) {
  const sid = oid(schoolId); const { school, v } = await schoolValues(schoolId, freeze); const out = { ...v };
  const c = custom || {};
  out['custom.title'] = c.title || ''; out['custom.citation'] = c.citation || ''; out['custom.date'] = c.date || fmtDate(new Date()); out['custom.signatory'] = c.signatory || school?.principalName || '';
  out['custom.signatoryTitle'] = c.signatoryTitle || 'Principal'; out['custom.subject'] = c.subject || ''; out['custom.recipient'] = c.recipient || ''; out['custom.body'] = c.body || ''; out['custom.line1'] = c.line1 || ''; out['custom.line2'] = c.line2 || '';
  let name = ''; let type = subjectType; let studentId = null;
  if (subjectType === 'student') {
    const st = await Student.findOne({ _id: oid(subjectId), schoolId: sid }); if (!st) return { error: 'Student not found.' };
    Object.assign(out, await studentValues(schoolId, st, freeze)); name = out['student.name']; studentId = st._id;
    if (c.leavingDate) out['student.leavingDate'] = c.leavingDate; if (c.conduct) out['student.conduct'] = c.conduct;
    if (family === 'reportCard' || family === 'transcript') { const t = await transcriptValues(schoolId, st, term || c.term); if (t.error) return { error: t.error }; Object.assign(out, t.values); }
  } else if (subjectType === 'teacher') {
    const t = await Teacher.findOne({ _id: oid(subjectId), schoolId: sid }); if (!t) return { error: 'Staff member not found.' };
    name = t.fullName || t.name; Object.assign(out, { 'staff.name': name, 'staff.employeeId': t.employeeId || t.staffCode || '', 'staff.designation': t.designation || 'Teacher', 'staff.department': t.department || '', 'staff.phone': t.phone || '', 'staff.photo': await pictureRef(schoolId, t.avatar, freeze), 'staff.bloodGroup': t.bloodGroup || '' });
  } else if (subjectType === 'visitor') {
    const vis = await VisitorVisit.findOne({ _id: oid(subjectId), schoolId: sid }); if (!vis) return { error: 'Visit not found.' };
    if (!['Approved', 'CheckedIn'].includes(vis.status)) return { error: 'A pass is only made for an approved visit.' };
    name = vis.visitorName; Object.assign(out, { 'visitor.name': vis.visitorName, 'visitor.organisation': vis.organisation || '', 'visitor.host': vis.hostName || 'Front office', 'visitor.purpose': vis.purpose, 'visitor.from': fmtDateTime(vis.expectedFrom), 'visitor.to': fmtDateTime(vis.expectedTo) });
  } else if (subjectType === 'invoice') {
    const inv = await FeeInvoice.findOne({ _id: oid(subjectId), schoolId: sid }); if (!inv) return { error: 'Invoice not found.' };
    const st = await Student.findOne({ _id: inv.studentId, schoolId: sid }); if (!st) return { error: 'Student not found.' };
    Object.assign(out, await studentValues(schoolId, st, freeze)); name = out['student.name']; studentId = st._id;
    Object.assign(out, { 'invoice.number': inv.number, 'invoice.challanCode': inv.challanCode, 'invoice.period': inv.period || '', 'invoice.dueDate': fmtDate(inv.dueDate), 'invoice.total': money(inv.total), 'invoice.paid': money(inv.paid), 'invoice.balance': money(Fin.balanceOf(inv)), 'invoice.status': inv.status, 'invoice.lines': (inv.lines || []).map((l) => `${l.title}   ${money(l.net)}`).join('\n'), 'invoice.bankDetails': bankText(school) });
  } else if (subjectType === 'payment') {
    const pay = await FeePayment.findOne({ _id: oid(subjectId), schoolId: sid }); if (!pay) return { error: 'Payment not found.' };
    if (pay.status !== 'Confirmed') return { error: 'A receipt is only made for a confirmed payment.' };
    const st = await Student.findOne({ _id: pay.studentId, schoolId: sid }); if (!st) return { error: 'Student not found.' };
    Object.assign(out, await studentValues(schoolId, st, freeze)); name = out['student.name']; studentId = st._id;
    const METHOD = { cash: 'Cash', bank: 'Bank transfer', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', cheque: 'Cheque', other: 'Other' };
    Object.assign(out, { 'payment.receiptNo': pay.receiptNo || '', 'payment.amount': money(pay.amount), 'payment.method': METHOD[pay.method] || pay.method, 'payment.date': fmtDate(pay.receivedAt), 'payment.cashier': pay.confirmedByName || pay.createdByName || 'School office', 'invoice.lines': (pay.allocations || []).map((a) => `${a.invoiceNumber}   ${money(a.amount)}`).join('\n') || 'Fee payment', 'invoice.total': money(pay.amount), 'invoice.bankDetails': '' });
  } else { type = 'custom'; name = c.holderName || c.recipient || ''; }
  const title = family === 'certificate' ? (c.title || '') : '';
  return { values: out, subjectName: name, subjectType: type, title, studentId };
}

// the sample a proof or a preview is drawn with when no real person is chosen
module.exports = { oid, sha, newToken, TOKEN_RE, maskName, fmtDate, ensureBase, nextSerial, pictureRef, makeLoader, resolveValues, validate, PAPERS, gradeOf };
