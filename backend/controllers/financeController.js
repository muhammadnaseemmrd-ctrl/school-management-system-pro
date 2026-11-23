// School fee finance (PRD E06). 403 not allowed (including approving your own request) · 404 not in this school · 422 not possible in the current state.
const crypto = require('crypto');
const mongoose = require('../lib/pgdoc');
const Invoice = require('../models/FeeInvoice'); const Payment = require('../models/FeePayment'); const Adjustment = require('../models/FeeAdjustment'); const Rule = require('../models/FeeRule');
const Session = require('../models/CashierSession'); const Line = require('../models/BankStatementLine'); const Batch = require('../models/BankStatementBatch');
const Student = require('../models/Student'); const Parent = require('../models/Parent'); const School = require('../models/School'); const AppSetting = require('../models/AppSetting'); const PaymentProof = require('../models/PaymentProof');
const F = require('../utils/schoolFinance'); const G = require('../utils/guardianRights'); const N = require('../utils/notify'); const { audit } = require('../utils/audit');
const { buildSummary } = require('./feeCenterController')._internals;

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const whole = (v) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
const pg = (q) => ({ p: Math.max(1, parseInt(q.page, 10) || 1), l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)) });
const day = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const studentIn = (sid, id) => (isId(id) ? Student.findOne({ _id: id, schoolId: sid }).populate('classId', 'standard division') : null);
const invView = (i) => ({ _id: i._id, number: i.number, challanCode: i.challanCode, studentId: i.studentId, period: i.period, issueDate: i.issueDate, dueDate: i.dueDate, lines: i.lines, total: i.total, adjusted: i.adjusted, writtenOff: i.writtenOff, paid: i.paid, balance: F.balanceOf(i), status: i.status, lateFeeApplied: i.lateFeeApplied, voidReason: i.voidReason });
const payView = (p) => ({ _id: p._id, studentId: p.studentId, amount: p.amount, method: p.method, reference: p.reference, receivedAt: p.receivedAt, status: p.status, receiptNo: p.receiptNo, evidence: p.evidence, allocations: p.allocations, refunded: p.refunded, refunds: p.refunds, unallocated: F.unallocated(p), createdByName: p.createdByName, confirmedByName: p.confirmedByName });
const settings = async (sid) => { const s = await AppSetting.findOne({ key: `finance:${sid}` }); return { graceDays: 0, lateFeeAmount: 0, templates: {}, ...(s?.value || {}) }; };

// The designed documents a fee screen can print from. The studio holds the designs; fee
// management only remembers which one to use for a voucher, an invoice and a receipt, so a school
// that has drawn its own challan does not have to go and find it every time.
const FEE_FAMILIES = { challan: 'Fee challan', invoice: 'Invoice', receipt: 'Receipt' };

/* ───────── invoices ───────── */
exports.generate = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {};
    const due = day(b.dueDate); if (!due) return res.status(400).json({ message: 'Choose the due date.' });
    const period = str(b.period, 40); if (!period) return res.status(400).json({ message: 'Name the period, for example "November 2026".' });
    let students = [];
    if (Array.isArray(b.studentIds) && b.studentIds.length) { if (b.studentIds.length > 500) return res.status(400).json({ message: 'Choose at most 500 students at a time.' }); students = (await Promise.all(b.studentIds.map((id) => studentIn(sid, id)))).filter(Boolean); }
    else if (isId(b.classId)) students = await Student.find({ schoolId: sid, classId: b.classId }).populate('classId', 'standard division');
    else return res.status(400).json({ message: 'Choose a class or some students.' });
    if (!students.length) return res.status(404).json({ message: 'No students found.' });
    const live = await Invoice.find({ schoolId: sid, status: { $in: F.LIVE.concat(['Void']).filter((x) => x !== 'Void') } }).select('studentId lines.key');
    const taken = new Set(live.flatMap((i) => i.lines.map((l) => `${i.studentId}:${l.key}`)));
    const out = { created: [], skipped: [] };
    for (const s of students) {
      const sum = await buildSummary(sid, s);
      let items = sum.items.filter((it) => ['Unpaid', 'Rejected'].includes(it.status) && !taken.has(`${s._id}:${it.key}`));
      if (Array.isArray(b.itemKeys) && b.itemKeys.length) items = items.filter((it) => b.itemKeys.includes(it.key));
      if (!items.length) { out.skipped.push({ studentId: s._id, name: s.name, why: 'Nothing unpaid that is not already on an invoice' }); continue; }
      const lines = await F.discountsFor(sid, s, items.map((it) => ({ key: it.key, kind: it.kind, title: it.title, amount: Math.round(it.amount), installment: it.installment, chargeId: it.chargeId ? String(it.chargeId) : undefined })));
      const total = lines.reduce((t, l) => t + l.net, 0);
      if (b.dryRun) { out.created.push({ studentId: s._id, name: s.name, total, lines: lines.length, discount: lines.reduce((t, l) => t + l.discount, 0) }); continue; }
      const inv = await F.withNumber(Invoice, sid, 'number', (n) => n, (n0, n) => Invoice.create({ schoolId: sid, studentId: s._id, number: F.invoiceNo(n), challanCode: F.challanFor(n), period, dueDate: due, lines, total, status: total === 0 ? 'Paid' : 'Open', createdByName: req.actorName || '' }));
      lines.forEach((l) => taken.add(`${s._id}:${l.key}`));
      out.created.push({ studentId: s._id, name: s.name, invoiceId: inv._id, number: inv.number, total });
      if (inv.status === 'Paid') await F.syncLegacy(inv);
    }
    if (!b.dryRun) await audit(req, { action: 'finance.invoice.generate', entityType: 'FeeInvoice', entityId: period, schoolId: sid, detail: { period, created: out.created.length, skipped: out.skipped.length } });
    res.status(b.dryRun ? 200 : 201).json({ dryRun: !!b.dryRun, ...out });
  } catch (e) { fail(res, e); }
};

exports.listInvoices = async (req, res) => {
  try {
    const sid = req.user.schoolId; const { p, l } = pg(req.query); const q = { schoolId: sid };
    if (req.query.status) q.status = String(req.query.status);
    if (isId(req.query.studentId)) q.studentId = req.query.studentId;
    if (req.query.overdue === '1') { q.status = { $in: ['Open', 'PartiallyPaid'] }; q.dueDate = { $lt: new Date() }; }
    if (req.query.search) { const s = String(req.query.search); const ids = (await Student.find({ schoolId: sid, name: { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }).select('_id')).map((x) => x._id); q.$or = [{ number: { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { challanCode: s }, { studentId: { $in: ids } }]; }
    const [rows, total] = await Promise.all([Invoice.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), Invoice.countDocuments(q)]);
    const names = new Map((await Student.find({ schoolId: sid, _id: { $in: rows.map((r) => r.studentId) } }).select('name')).map((s) => [String(s._id), s.name]));
    res.json({ invoices: rows.map((r) => ({ ...invView(r), studentName: names.get(String(r.studentId)) || '' })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
  } catch (e) { fail(res, e); }
};

exports.getInvoice = async (req, res) => {
  try {
    const sid = req.user.schoolId; const inv = isId(req.params.id) ? await Invoice.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    const [student, pays, adjs] = await Promise.all([Student.findOne({ _id: inv.studentId, schoolId: sid }).select('name rollNumber'), Payment.find({ schoolId: sid, studentId: inv.studentId }), Adjustment.find({ schoolId: sid, invoiceId: inv._id })]);
    res.json({ invoice: invView(inv), student, payments: pays.filter((p) => p.allocations.some((a) => a.invoiceId === String(inv._id))).map(payView), adjustments: adjs });
  } catch (e) { fail(res, e); }
};

exports.challan = async (req, res) => {
  try {
    const sid = req.user.schoolId; const inv = isId(req.params.id) ? await Invoice.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    if (inv.status === 'Void') return res.status(422).json({ message: 'A void invoice has no challan.' });
    const [school, student] = await Promise.all([School.findById(sid).select('name code address phone paymentInfo'), Student.findOne({ _id: inv.studentId, schoolId: sid }).populate('classId', 'standard division')]);
    res.json({ school, student: { name: student.name, rollNumber: student.rollNumber, class: student.classId ? `${student.classId.standard}-${student.classId.division}` : '' }, invoice: invView(inv), copies: ['Bank copy', 'School copy', 'Parent copy'] });
  } catch (e) { fail(res, e); }
};

exports.voidInvoice = async (req, res) => {
  try {
    const sid = req.user.schoolId; const inv = isId(req.params.id) ? await Invoice.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    if (inv.status === 'Void') return res.status(422).json({ message: 'This invoice is already void.' });
    if (str(req.body?.reason).length < 3) return res.status(400).json({ message: 'Write why the invoice is void.' });
    if (inv.paid > 0) return res.status(422).json({ message: 'Money has been received against this invoice. Refund it first, then void.' });
    const was = inv.status; inv.status = 'Void'; inv.voidReason = str(req.body.reason, 200); await inv.save();
    if (was === 'Paid') { inv.status = 'Open'; await F.syncLegacy(inv); inv.status = 'Void'; }
    await audit(req, { action: 'finance.invoice.void', entityType: 'FeeInvoice', entityId: inv._id, schoolId: sid, detail: { reason: inv.voidReason } });
    res.json({ invoice: invView(inv) });
  } catch (e) { fail(res, e); }
};

exports.runLateFees = async (req, res) => {
  try {
    // the grace period and the late fee can be set for the group and changed by a campus inside the group's limits (PRD E26);
    // with no policy they are the school's own finance settings, so nothing changes until a policy is published
    const sid = req.user.schoolId; const policy = require('../utils/group/policy'); const CS = require('../utils/campus');
    const Class = require('../models/Class'); const Student = require('../models/Student');
    const open = await Invoice.find({ schoolId: sid, status: { $in: ['Open', 'PartiallyPaid'] }, lateFeeApplied: false });
    const def = String((await CS.ensureDefault(sid))._id);
    const classCampus = new Map((await Class.find({ schoolId: sid }).select('campusId')).map((c) => [String(c._id), c.campusId ? String(c.campusId) : def]));
    const kids = new Map((await Student.find({ schoolId: sid, _id: { $in: [...new Set(open.map((i) => String(i.studentId)))] } }).select('classId')).map((s) => [String(s._id), s.classId ? classCampus.get(String(s.classId)) || def : def]));
    const rules = new Map();
    const ruleFor = async (campus) => { if (!rules.has(campus)) rules.set(campus, { days: (await policy.effective(sid, campus, 'fees.lateGraceDays')).value, amount: (await policy.effective(sid, campus, 'fees.lateFeeAmount')).value }); return rules.get(campus); };
    for (const c of new Set([def, ...classCampus.values()])) await ruleFor(c);
    if (![...rules.values()].some((r) => r.amount > 0)) return res.status(422).json({ message: 'Set a late fee amount in the finance settings first.' });
    let applied = 0; let total = 0;
    for (const inv of open) {
      const r = await ruleFor(kids.get(String(inv.studentId)) || def);
      if (!(r.amount > 0) || !(new Date(inv.dueDate) < new Date(Date.now() - (r.days || 0) * 864e5))) continue;
      inv.lines.push({ key: `late:${inv._id}`, kind: 'late', title: 'Late fee', amount: r.amount, discount: 0, net: r.amount, discounts: [], lateFee: true }); inv.total += r.amount; inv.lateFeeApplied = true; await inv.save(); applied += 1; total += r.amount;
    }
    const amounts = [...new Set([...rules.values()].filter((r) => r.amount > 0).map((r) => r.amount))];
    await audit(req, { action: 'finance.late-fees.run', entityType: 'FeeInvoice', entityId: 'late-fees', schoolId: sid, detail: { applied, total } });
    res.json({ applied, amount: amounts.length === 1 ? amounts[0] : null, total });
  } catch (e) { fail(res, e); }
};

exports.getSettings = async (req, res) => { try { res.json({ settings: await settings(req.user.schoolId) }); } catch (e) { fail(res, e); } };
exports.putSettings = async (req, res) => {
  try {
    const sid = req.user.schoolId;
    const cur = await settings(sid);
    const g = req.body?.graceDays === undefined ? cur.graceDays : whole(req.body.graceDays);
    const a = req.body?.lateFeeAmount === undefined ? cur.lateFeeAmount : whole(req.body.lateFeeAmount);
    if (!(g >= 0 && g <= 90)) return res.status(400).json({ message: 'Grace days must be a whole number from 0 to 90.' });
    if (!(a >= 0 && a <= 100000)) return res.status(400).json({ message: 'The late fee must be a whole number of rupees, 0 or more.' });

    let templates = cur.templates || {};
    if (req.body?.templates && typeof req.body.templates === 'object') {
      const DocTemplate = require('../models/DocTemplate');
      const next = {};
      for (const family of Object.keys(FEE_FAMILIES)) {
        const raw = req.body.templates[family];
        if (raw === undefined) { if (templates[family]) next[family] = templates[family]; continue; }
        if (!raw) continue;                                  // cleared on purpose
        if (!isId(raw)) return res.status(400).json({ message: `That is not a ${FEE_FAMILIES[family].toLowerCase()} design.` });
        const tpl = await DocTemplate.findOne({ _id: raw, schoolId: sid });
        if (!tpl) return res.status(404).json({ message: `That ${FEE_FAMILIES[family].toLowerCase()} design was not found.` });
        if (tpl.family !== family) return res.status(422).json({ message: `"${tpl.name}" is a ${tpl.family} design, not a ${FEE_FAMILIES[family].toLowerCase()}.` });
        if (tpl.archived) return res.status(422).json({ message: `"${tpl.name}" is archived. Restore it or choose another.` });
        if (!tpl.liveVersionId) return res.status(422).json({ message: `"${tpl.name}" has no approved version yet. Approve it in the documents studio first.` });
        next[family] = String(tpl._id);
      }
      templates = next;
    }

    await AppSetting.updateOne({ key: `finance:${sid}` }, { $set: { value: { graceDays: g, lateFeeAmount: a, templates } } }, { upsert: true });
    await audit(req, { action: 'finance.settings', entityType: 'AppSetting', entityId: 'finance', schoolId: sid, detail: { graceDays: g, lateFeeAmount: a, templates } });
    res.json({ settings: { graceDays: g, lateFeeAmount: a, templates } });
  } catch (e) { fail(res, e); }
};

// Which designs a school could print fees from, and which one it uses now.
exports.documentTemplates = async (req, res) => {
  try {
    const sid = req.user.schoolId;
    const DocTemplate = require('../models/DocTemplate');
    const rows = await DocTemplate.find({ schoolId: sid, family: { $in: Object.keys(FEE_FAMILIES) }, archived: { $ne: true } }).sort({ family: 1, name: 1 }).limit(200);
    const cur = await settings(sid);
    res.json({
      families: Object.entries(FEE_FAMILIES).map(([key, label]) => ({
        key,
        label,
        chosen: cur.templates?.[key] || '',
        templates: rows.filter((t) => t.family === key).map((t) => ({ _id: t._id, name: t.name, ready: !!t.liveVersionId })),
      })),
    });
  } catch (e) { fail(res, e); }
};

// Print a fee document from the school's own design. The studio does the issuing, so the document
// gets a serial, a verification page and the same trail as any other document the school issues.
const issueFrom = async (req, res, { family, subjectId, label }) => {
  const sid = req.user.schoolId;
  const cur = await settings(sid);
  const templateId = req.body?.templateId || cur.templates?.[family];
  if (!templateId) return res.status(422).json({ message: `No ${FEE_FAMILIES[family].toLowerCase()} design has been chosen yet. Choose one in fee settings.`, code: 'NO_TEMPLATE' });
  const DocTemplate = require('../models/DocTemplate');
  const Version = require('../models/DocTemplateVersion');
  const tpl = isId(templateId) ? await DocTemplate.findOne({ _id: templateId, schoolId: sid }) : null;
  if (!tpl || tpl.family !== family) return res.status(404).json({ message: `That ${FEE_FAMILIES[family].toLowerCase()} design was not found.` });
  if (tpl.archived) return res.status(422).json({ message: 'That design is archived. Choose another in fee settings.' });
  const ver = tpl.liveVersionId ? await Version.findOne({ _id: tpl.liveVersionId, schoolId: sid }) : null;
  if (!ver || ver.state !== 'Published') return res.status(422).json({ message: 'That design has no approved version yet. Approve it in the documents studio first.' });

  const { _issueOne, _view } = require('./studioIssueController');
  const Issuance = require('../models/DocIssuance');

  // A challan or a receipt is one document. Printing it again hands back the same one, with the
  // same serial, rather than minting a new number every time somebody presses print. Asking for a
  // fresh one (after the amount has changed, say) is a deliberate choice.
  if (!req.body?.fresh) {
    const already = await Issuance.findOne({ schoolId: sid, family, subjectId, status: 'Issued' }).sort({ issuedAt: -1 });
    if (already) return res.json({ document: _view(already), pdfPath: `/api/studio/issuances/${already._id}/pdf`, reused: true });
  }

  const out = await _issueOne(req, { tpl, ver, subjectId: String(subjectId), custom: {}, locale: req.body?.locale === 'ur' ? 'ur' : 'en', replace: !!req.body?.replace, replaceReason: String(req.body?.replaceReason || 'Reprinted from fee management') });
  if (!out.doc) return res.status(422).json({ message: out.skipped || `The ${label} could not be made.` });
  res.status(201).json({ document: _view(out.doc), pdfPath: `/api/studio/issuances/${out.doc._id}/pdf` });
};

exports.invoiceDocument = async (req, res) => {
  try {
    const sid = req.user.schoolId;
    const inv = isId(req.params.id) ? await Invoice.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    if (inv.status === 'Void') return res.status(422).json({ message: 'A void invoice has nothing to print.' });
    const family = req.query.kind === 'invoice' || req.body?.kind === 'invoice' ? 'invoice' : 'challan';
    await issueFrom(req, res, { family, subjectId: inv._id, label: FEE_FAMILIES[family].toLowerCase() });
  } catch (e) { fail(res, e); }
};

exports.paymentDocument = async (req, res) => {
  try {
    const sid = req.user.schoolId;
    const pay = isId(req.params.id) ? await Payment.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!pay) return res.status(404).json({ message: 'Payment not found' });
    if (pay.status !== 'Confirmed') return res.status(422).json({ message: 'A receipt exists only for a confirmed payment.' });
    await issueFrom(req, res, { family: 'receipt', subjectId: pay._id, label: 'receipt' });
  } catch (e) { fail(res, e); }
};

/* ───────── cashier sessions ───────── */
exports.openSession = async (req, res) => {
  try {
    const sid = req.user.schoolId; const fl = req.body?.openingFloat === undefined ? 0 : whole(req.body.openingFloat);
    if (!(fl >= 0)) return res.status(400).json({ message: 'The opening cash must be a whole number of rupees, 0 or more.' });
    if (await Session.findOne({ schoolId: sid, cashierId: req.user.userId, status: 'Open' })) return res.status(422).json({ message: 'You already have a till open. Close it first.' });
    const s = await Session.create({ schoolId: sid, cashierId: req.user.userId, cashierName: req.actorName || '', openingFloat: fl });
    await audit(req, { action: 'finance.session.open', entityType: 'CashierSession', entityId: s._id, schoolId: sid, detail: { openingFloat: fl } });
    res.status(201).json({ session: s });
  } catch (e) { fail(res, e); }
};

exports.closeSession = async (req, res) => {
  try {
    const sid = req.user.schoolId; const s = isId(req.params.id) ? await Session.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!s) return res.status(404).json({ message: 'Till not found' });
    if (String(s.cashierId) !== String(req.user.userId)) return res.status(403).json({ message: 'Only the cashier who opened this till can close it.' });
    if (s.status !== 'Open') return res.status(422).json({ message: 'This till is already closed.' });
    const counted = whole(req.body?.countedCash); if (!(counted >= 0)) return res.status(400).json({ message: 'Enter the cash you counted, in whole rupees.' });
    const pays = await Payment.find({ schoolId: sid, sessionId: s._id, method: 'cash', status: 'Confirmed' });
    const cashIn = pays.reduce((t, p) => t + p.amount, 0); const cashOut = pays.reduce((t, p) => t + p.refunded, 0);
    const expected = s.openingFloat + cashIn - cashOut; const variance = counted - expected;
    if (variance !== 0 && str(req.body?.varianceNote).length < 5) return res.status(422).json({ message: `The count is ${variance > 0 ? 'over' : 'short'} by Rs ${Math.abs(variance).toLocaleString('en-PK')}. Write what you think happened before closing.`, expected, variance });
    Object.assign(s, { status: 'Closed', closedAt: new Date(), cashIn, cashOut, expectedCash: expected, countedCash: counted, variance, varianceNote: str(req.body?.varianceNote, 300), depositSlip: str(req.body?.depositSlip, 60) });
    await s.save();
    await audit(req, { action: 'finance.session.close', entityType: 'CashierSession', entityId: s._id, schoolId: sid, detail: { expected, counted, variance, depositSlip: s.depositSlip } });
    res.json({ session: s, receipts: pays.length });
  } catch (e) { fail(res, e); }
};

exports.listSessions = async (req, res) => { try { const { p, l } = pg(req.query); const q = { schoolId: req.user.schoolId }; const [rows, total] = await Promise.all([Session.find(q).sort({ openedAt: -1 }).skip((p - 1) * l).limit(l), Session.countDocuments(q)]); res.json({ sessions: rows, mine: rows.find((r) => r.status === 'Open' && String(r.cashierId) === String(req.user.userId)) || (await Session.findOne({ schoolId: req.user.schoolId, cashierId: req.user.userId, status: 'Open' })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } }); } catch (e) { fail(res, e); } };

/* ───────── payments ───────── */
const openInvoicesFor = async (sid, studentId, onlyId) => {
  const q = { schoolId: sid, studentId, status: { $in: ['Open', 'PartiallyPaid'] } }; if (onlyId) q._id = onlyId;
  return (await Invoice.find(q)).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
};
const confirm = async (req, pay, evidence) => {
  pay.evidence = evidence; pay.status = 'Confirmed'; pay.confirmedByName = req.actorName || '';
  pay.receiptNo = await F.withNumber(Payment, req.user.schoolId, 'receiptNo', (n) => F.receiptNo(n), async (no) => no);
  return pay;
};

exports.createPayment = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {};
    const key = str(req.get('Idempotency-Key') || b.idempotencyKey, 80);
    if (key) { const dup = await Payment.findOne({ schoolId: sid, idempotencyKey: key }); if (dup) return res.status(200).json({ duplicate: true, payment: payView(dup) }); }
    const student = await studentIn(sid, b.studentId); if (!student) return res.status(404).json({ message: 'Student not found' });
    const amount = whole(b.amount); if (!(amount >= 1 && amount <= 50000000)) return res.status(400).json({ message: 'Enter the amount in whole rupees.' });
    const method = b.method; if (!['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque', 'other'].includes(method)) return res.status(400).json({ message: 'Choose how it was paid.' });
    let payer = null; if (b.payerParentId) { payer = isId(b.payerParentId) ? await Parent.findOne({ _id: b.payerParentId, schoolId: sid, children: student._id }) : null; if (!payer) return res.status(404).json({ message: 'That payer is not a guardian of this student.' }); }
    let session = null;
    if (method === 'cash') { session = await Session.findOne({ schoolId: sid, cashierId: req.user.userId, status: 'Open' }); if (!session) return res.status(422).json({ message: 'Open your till before taking cash.' }); }
    else if (str(b.reference).length < 3) return res.status(400).json({ message: 'Enter the transaction reference so it can be matched to the bank.' });
    let only = null; if (b.invoiceId) { only = isId(b.invoiceId) ? await Invoice.findOne({ _id: b.invoiceId, schoolId: sid, studentId: student._id }) : null; if (!only) return res.status(404).json({ message: 'Invoice not found for this student.' }); if (!['Open', 'PartiallyPaid'].includes(only.status)) return res.status(422).json({ message: `That invoice is ${only.status.toLowerCase()}.` }); }
    const pay = new Payment({ schoolId: sid, studentId: student._id, payerParentId: payer?._id || null, amount, method, reference: str(b.reference, 80), receivedAt: day(b.receivedAt) || new Date(), sessionId: session?._id || null, idempotencyKey: key, note: str(b.note, 200), createdByName: req.actorName || '' });
    if (method === 'cash') {                                       // the open till is the source of truth for cash
      pay.status = 'Confirmed'; pay.evidence = { kind: 'cash-session', refId: String(session._id) }; pay.confirmedByName = req.actorName || '';
      pay.receiptNo = await F.withNumber(Payment, sid, 'receiptNo', (n) => F.receiptNo(n), async (no) => { pay.receiptNo = no; await pay.save(); return no; });
      const r = await F.allocate(pay, await openInvoicesFor(sid, student._id, only?._id)); await pay.save();
      await audit(req, { action: 'finance.payment.cash', entityType: 'FeePayment', entityId: pay._id, schoolId: sid, detail: { amount, receiptNo: pay.receiptNo, credit: r.left } });
      require('../utils/integrations/webhook').emit(sid, 'payment.received', { payment: pay }, { eventId: `pay_${pay._id}` });
    } else {
      await pay.save();                                            // waits for a bank line or an approved proof
      await audit(req, { action: 'finance.payment.pending', entityType: 'FeePayment', entityId: pay._id, schoolId: sid, detail: { amount, method, reference: pay.reference } });
    }
    res.status(201).json({ payment: payView(pay) });
  } catch (e) { fail(res, e); }
};

exports.confirmPayment = async (req, res) => {
  try {
    const sid = req.user.schoolId; const pay = isId(req.params.id) ? await Payment.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!pay) return res.status(404).json({ message: 'Payment not found' });
    if (pay.status !== 'Pending') return res.status(422).json({ message: `This payment is already ${pay.status.toLowerCase()}.` });
    const b = req.body || {}; let evidence = null;
    if (b.reject) { if (str(b.note).length < 3) return res.status(400).json({ message: 'Write why this payment is rejected.' }); pay.status = 'Rejected'; pay.note = str(b.note, 200); await pay.save(); await audit(req, { action: 'finance.payment.reject', entityType: 'FeePayment', entityId: pay._id, schoolId: sid, detail: { note: pay.note } }); return res.json({ payment: payView(pay) }); }
    if (b.bankLineId) {
      const line = isId(b.bankLineId) ? await Line.findOne({ _id: b.bankLineId, schoolId: sid }) : null;
      if (!line) return res.status(404).json({ message: 'Bank line not found' });
      if (line.status !== 'Unmatched') return res.status(422).json({ message: 'That bank line is already used.' });
      if (line.amount !== pay.amount) return res.status(422).json({ message: `The bank line is Rs ${line.amount.toLocaleString('en-PK')} but this payment is Rs ${pay.amount.toLocaleString('en-PK')}.` });
      evidence = { kind: 'bank-line', refId: String(line._id) }; line.status = 'Matched'; line.paymentId = pay._id; await line.save();
    } else if (b.proofId) {
      const proof = isId(b.proofId) ? await PaymentProof.findOne({ _id: b.proofId, schoolId: sid, studentId: pay.studentId }) : null;
      if (!proof) return res.status(404).json({ message: 'Payment proof not found for this student.' });
      if (proof.status !== 'Approved') return res.status(422).json({ message: 'That proof has not been approved.' });
      evidence = { kind: 'proof', refId: String(proof._id) };
    } else return res.status(422).json({ message: 'A payment is confirmed by a matched bank line or an approved payment proof.' });
    await confirm(req, pay, evidence); await F.allocate(pay, await openInvoicesFor(sid, pay.studentId)); await pay.save();
    await audit(req, { action: 'finance.payment.confirm', entityType: 'FeePayment', entityId: pay._id, schoolId: sid, detail: { evidence } });
    require('../utils/integrations/webhook').emit(sid, 'payment.received', { payment: pay }, { eventId: `pay_${pay._id}` });
    res.json({ payment: payView(pay) });
  } catch (e) { fail(res, e); }
};

exports.applyCredit = async (req, res) => {
  try {
    const sid = req.user.schoolId; const student = await studentIn(sid, req.params.studentId); if (!student) return res.status(404).json({ message: 'Student not found' });
    const pays = (await Payment.find({ schoolId: sid, studentId: student._id, status: 'Confirmed' })).filter((p) => F.unallocated(p) > 0); let total = 0;
    for (const p of pays) { const r = await F.allocate(p, await openInvoicesFor(sid, student._id)); await p.save(); total += r.allocated.reduce((t, a) => t + a.amount, 0); }
    await audit(req, { action: 'finance.credit.apply', entityType: 'Student', entityId: student._id, schoolId: sid, detail: { applied: total } });
    res.json({ applied: total });
  } catch (e) { fail(res, e); }
};

exports.listPayments = async (req, res) => {
  try {
    const sid = req.user.schoolId; const { p, l } = pg(req.query); const q = { schoolId: sid };
    if (req.query.status) q.status = String(req.query.status); if (isId(req.query.studentId)) q.studentId = req.query.studentId;
    const [rows, total] = await Promise.all([Payment.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), Payment.countDocuments(q)]);
    const names = new Map((await Student.find({ schoolId: sid, _id: { $in: rows.map((r) => r.studentId) } }).select('name')).map((s) => [String(s._id), s.name]));
    res.json({ payments: rows.map((r) => ({ ...payView(r), studentName: names.get(String(r.studentId)) || '' })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
  } catch (e) { fail(res, e); }
};

exports.receipt = async (req, res) => {
  try {
    const sid = req.user.schoolId; const pay = isId(req.params.id) ? await Payment.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!pay) return res.status(404).json({ message: 'Payment not found' });
    if (pay.status !== 'Confirmed') return res.status(422).json({ message: 'A receipt exists only for a confirmed payment.' });
    const [school, student] = await Promise.all([School.findById(sid).select('name code address phone'), Student.findOne({ _id: pay.studentId, schoolId: sid }).select('name rollNumber')]);
    res.json({ school, student, receipt: { number: pay.receiptNo, date: pay.receivedAt, method: pay.method, reference: pay.reference, amount: pay.amount, refunded: pay.refunded, allocations: pay.allocations.filter((a) => a.amount > 0), credit: F.unallocated(pay), cashier: pay.confirmedByName } });
  } catch (e) { fail(res, e); }
};

/* ───────── adjustments (maker-checker) ───────── */
const REASONS = ['hardship', 'scholarship', 'staff-child', 'billing-error', 'duplicate', 'withdrawal', 'overpayment', 'other'];
exports.requestAdjustment = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {};
    if (!['credit-note', 'write-off', 'refund', 'concession'].includes(b.type)) return res.status(400).json({ message: 'Choose the kind of adjustment.' });
    if (!REASONS.includes(b.reasonCode)) return res.status(400).json({ message: 'Choose a reason code.' });
    const amount = whole(b.amount); if (!(amount >= 1)) return res.status(400).json({ message: 'Enter the amount in whole rupees.' });
    if (str(b.note).length < 5) return res.status(400).json({ message: 'Explain the request in a sentence.' });
    let student; let inv = null; let pay = null;
    if (b.type === 'refund') {
      pay = isId(b.paymentId) ? await Payment.findOne({ _id: b.paymentId, schoolId: sid }) : null; if (!pay) return res.status(404).json({ message: 'Payment not found' });
      if (pay.status !== 'Confirmed') return res.status(422).json({ message: 'Only a confirmed payment can be refunded.' });
      const asked = (await Adjustment.find({ schoolId: sid, paymentId: pay._id, type: 'refund', status: 'Requested' })).reduce((t, x) => t + x.amount, 0);
      const room = pay.amount - pay.refunded - asked;
      if (amount > room) return res.status(422).json({ message: `At most Rs ${Math.max(0, room).toLocaleString('en-PK')} can still be refunded from this payment${asked ? ' (other refund requests are waiting)' : ''}.` });
      student = await studentIn(sid, pay.studentId);
    } else {
      inv = isId(b.invoiceId) ? await Invoice.findOne({ _id: b.invoiceId, schoolId: sid }) : null; if (!inv) return res.status(404).json({ message: 'Invoice not found' });
      if (!['Open', 'PartiallyPaid'].includes(inv.status)) return res.status(422).json({ message: `A ${inv.status.toLowerCase()} invoice cannot be adjusted.` });
      if (amount > F.balanceOf(inv)) return res.status(422).json({ message: `The invoice has only Rs ${F.balanceOf(inv).toLocaleString('en-PK')} left to pay.` });
      student = await studentIn(sid, inv.studentId);
    }
    const a = await Adjustment.create({ schoolId: sid, type: b.type, studentId: student._id, invoiceId: inv?._id || null, paymentId: pay?._id || null, amount, reasonCode: b.reasonCode, note: str(b.note, 300), requestedBy: req.user.userId, requestedByName: req.actorName || '' });
    await audit(req, { action: 'finance.adjustment.request', entityType: 'FeeAdjustment', entityId: a._id, schoolId: sid, detail: { type: b.type, amount, reasonCode: b.reasonCode } });
    await N.notify({ schoolId: sid, recipients: (await N.admins(sid)).filter((x) => String(x.id) !== String(req.user.userId)), title: `Approval needed: ${b.type}`, body: `Rs ${amount.toLocaleString('en-PK')} for ${student.name}`, link: '/admin/dashboard#/finance', type: 'general' });
    res.status(201).json({ adjustment: a });
  } catch (e) { fail(res, e); }
};

exports.decideAdjustment = async (req, res) => {
  try {
    const sid = req.user.schoolId; const a = isId(req.params.id) ? await Adjustment.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!a) return res.status(404).json({ message: 'Adjustment not found' });
    if (String(a.requestedBy) === String(req.user.userId)) return res.status(403).json({ message: 'The person who asked cannot approve it. Another admin must decide.' });
    if (a.status !== 'Requested') return res.status(422).json({ message: `This request was already ${a.status.toLowerCase()}.` });
    const approve = req.body?.decision === 'approve'; if (!approve && req.body?.decision !== 'reject') return res.status(400).json({ message: 'Choose approve or reject.' });
    if (!approve && str(req.body?.note).length < 3) return res.status(400).json({ message: 'Write why it is rejected.' });
    if (approve) {
      if (a.type === 'refund') {
        const pay = await Payment.findOne({ _id: a.paymentId, schoolId: sid });
        if (!pay || a.amount > pay.amount - pay.refunded) return res.status(422).json({ message: 'The payment no longer has that much to refund.' });
        const free = F.unallocated(pay); const fromInvoices = Math.max(0, a.amount - free);
        if (fromInvoices > 0) await F.reverseAllocations(pay, fromInvoices);
        a.voucherNo = await F.withNumber(Adjustment, sid, 'voucherNo', (n) => `V-${String(n).padStart(6, '0')}`, async (no) => no);
        pay.refunded += a.amount; pay.refunds.push({ adjustmentId: String(a._id), voucherNo: a.voucherNo, amount: a.amount, at: new Date() }); pay.markModified('refunds'); await pay.save();
      } else {
        const inv = await Invoice.findOne({ _id: a.invoiceId, schoolId: sid });
        if (!inv || !['Open', 'PartiallyPaid'].includes(inv.status) || a.amount > F.balanceOf(inv)) return res.status(422).json({ message: 'The invoice no longer has that much left to pay.' });
        inv.adjusted += a.amount; if (a.type === 'write-off') inv.writtenOff += a.amount; F.recalc(inv); await inv.save(); await F.syncLegacy(inv);
      }
    }
    a.status = approve ? 'Approved' : 'Rejected'; a.decidedBy = req.user.userId; a.decidedByName = req.actorName || ''; a.decidedAt = new Date(); a.decisionNote = str(req.body?.note, 200); await a.save();
    await audit(req, { action: `finance.adjustment.${approve ? 'approve' : 'reject'}`, entityType: 'FeeAdjustment', entityId: a._id, schoolId: sid, detail: { type: a.type, amount: a.amount, requestedBy: a.requestedByName } });
    res.json({ adjustment: a });
  } catch (e) { fail(res, e); }
};

exports.listAdjustments = async (req, res) => { try { const { p, l } = pg(req.query); const q = { schoolId: req.user.schoolId }; if (req.query.status) q.status = String(req.query.status); const [rows, total] = await Promise.all([Adjustment.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), Adjustment.countDocuments(q)]);
  const names = new Map((await Student.find({ schoolId: req.user.schoolId, _id: { $in: rows.map((r) => r.studentId) } }).select('name')).map((s) => [String(s._id), s.name])); res.json({ adjustments: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), studentName: names.get(String(r.studentId)) || '' })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } }); } catch (e) { fail(res, e); } };

/* ───────── rules (effective-dated, approved by a second person) ───────── */
exports.createRule = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {};
    if (str(b.name).length < 2) return res.status(400).json({ message: 'Name the rule.' });
    if (!['concession', 'scholarship', 'sibling'].includes(b.kind)) return res.status(400).json({ message: 'Choose the kind of rule.' });
    if (!['percent', 'fixed'].includes(b.valueType)) return res.status(400).json({ message: 'Choose percent or a fixed amount.' });
    const value = whole(b.value); if (!(value >= 1) || (b.valueType === 'percent' && value > 100)) return res.status(400).json({ message: b.valueType === 'percent' ? 'A percentage must be from 1 to 100.' : 'Enter the amount in whole rupees.' });
    if (str(b.reason).length < 5) return res.status(400).json({ message: 'Write why this rule exists.' });
    const from = day(b.validFrom) || new Date(); const to = b.validTo ? day(b.validTo) : null; if (b.validTo && !to) return res.status(400).json({ message: 'Enter a valid end date.' }); if (to && to <= from) return res.status(400).json({ message: 'The end must be after the start.' });
    let student = null; if (b.kind === 'scholarship') { student = await studentIn(sid, b.studentId); if (!student) return res.status(400).json({ message: 'Choose the student who holds the scholarship.' }); }
    const r = await Rule.create({ schoolId: sid, name: str(b.name, 80), kind: b.kind, valueType: b.valueType, value, appliesTo: b.appliesTo === 'all' ? 'all' : 'tuition', studentId: student?._id || null, siblingFrom: b.kind === 'sibling' ? Math.max(2, whole(b.siblingFrom) || 2) : 2, validFrom: from, validTo: to, reason: str(b.reason, 200), createdBy: req.user.userId, createdByName: req.actorName || '' });
    await audit(req, { action: 'finance.rule.create', entityType: 'FeeRule', entityId: r._id, schoolId: sid, detail: { kind: r.kind, value, valueType: r.valueType } });
    await N.notify({ schoolId: sid, recipients: (await N.admins(sid)).filter((x) => String(x.id) !== String(req.user.userId)), title: 'Fee rule needs approval', body: r.name, link: '/admin/dashboard#/finance', type: 'general' });
    res.status(201).json({ rule: r });
  } catch (e) { fail(res, e); }
};
exports.decideRule = async (req, res) => {
  try {
    const sid = req.user.schoolId; const r = isId(req.params.id) ? await Rule.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!r) return res.status(404).json({ message: 'Rule not found' });
    const d = req.body?.decision;
    if (d === 'end') { if (r.status !== 'Active') return res.status(422).json({ message: 'Only an active rule can be ended.' }); r.status = 'Ended'; r.validTo = new Date(); await r.save(); await audit(req, { action: 'finance.rule.end', entityType: 'FeeRule', entityId: r._id, schoolId: sid, detail: {} }); return res.json({ rule: r }); }
    if (String(r.createdBy) === String(req.user.userId)) return res.status(403).json({ message: 'The person who created a rule cannot approve it. Another admin must decide.' });
    if (r.status !== 'Pending') return res.status(422).json({ message: `This rule is already ${r.status.toLowerCase()}.` });
    if (!['approve', 'reject'].includes(d)) return res.status(400).json({ message: 'Choose approve or reject.' });
    r.status = d === 'approve' ? 'Active' : 'Rejected'; r.decidedBy = req.user.userId; r.decidedByName = req.actorName || ''; r.decidedAt = new Date(); r.decisionNote = str(req.body?.note, 200); await r.save();
    await audit(req, { action: `finance.rule.${d}`, entityType: 'FeeRule', entityId: r._id, schoolId: sid, detail: { name: r.name } });
    res.json({ rule: r });
  } catch (e) { fail(res, e); }
};
exports.listRules = async (req, res) => { try { res.json({ rules: await Rule.find({ schoolId: req.user.schoolId }).sort({ createdAt: -1 }).limit(200) }); } catch (e) { fail(res, e); } };

/* ───────── bank statements ───────── */
exports.importStatement = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const csv = String(b.csv || '');
    if (csv.length > 2_000_000) return res.status(413).json({ message: 'The file is too large. Split it by month.' });
    const parsed = F.parseStatement(csv); if (parsed.error) return res.status(400).json({ message: parsed.error });
    const checksum = crypto.createHash('sha256').update(csv).digest('hex');
    const names = new Map((await Student.find({ schoolId: sid }).select('name')).map((s) => [String(s._id), s.name]));
    const open = await Invoice.find({ schoolId: sid, status: { $in: ['Open', 'PartiallyPaid'] } });
    const existing = new Set((await Line.find({ schoolId: sid, fingerprint: { $in: parsed.lines.map((x) => x.fingerprint) } }).select('fingerprint')).map((x) => x.fingerprint));
    const fresh = parsed.lines.filter((x) => !existing.has(x.fingerprint)); const preview = fresh.map((x) => ({ ...x, suggestion: F.suggest(x, open, names) || undefined }));
    if (b.dryRun) return res.json({ dryRun: true, rows: parsed.lines.length, willImport: fresh.length, duplicates: parsed.lines.length - fresh.length, errors: parsed.errors, preview: preview.slice(0, 200) });
    if (await Batch.findOne({ schoolId: sid, checksum })) return res.status(200).json({ duplicate: true, message: 'This exact file was already imported.', imported: 0 });
    if (!fresh.length && parsed.errors.length) return res.status(422).json({ message: 'Nothing could be imported. Fix the rows listed.', errors: parsed.errors });
    const batch = await Batch.create({ schoolId: sid, fileName: str(b.fileName, 100), checksum, rows: parsed.lines.length, imported: fresh.length, duplicates: parsed.lines.length - fresh.length, errors: parsed.errors.length, importedByName: req.actorName || '' });
    for (const x of preview) await Line.create({ schoolId: sid, batchId: batch._id, fileName: batch.fileName, date: x.date, description: x.description, reference: x.reference, amount: x.amount, fingerprint: x.fingerprint, suggestion: x.suggestion });
    await audit(req, { action: 'finance.bank.import', entityType: 'BankStatementBatch', entityId: batch._id, schoolId: sid, detail: { imported: fresh.length, duplicates: batch.duplicates, errors: batch.errors } });
    res.status(201).json({ imported: fresh.length, duplicates: batch.duplicates, errors: parsed.errors, suggested: preview.filter((x) => x.suggestion).length });
  } catch (e) { fail(res, e); }
};

exports.listLines = async (req, res) => { try { const { p, l } = pg(req.query); const q = { schoolId: req.user.schoolId }; if (req.query.status) q.status = String(req.query.status); const [rows, total] = await Promise.all([Line.find(q).sort({ date: -1 }).skip((p - 1) * l).limit(l), Line.countDocuments(q)]); res.json({ lines: rows, pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } }); } catch (e) { fail(res, e); } };

exports.matchLine = async (req, res) => {
  try {
    const sid = req.user.schoolId; const line = isId(req.params.id) ? await Line.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!line) return res.status(404).json({ message: 'Bank line not found' });
    if (line.status !== 'Unmatched') return res.status(422).json({ message: `This line is already ${line.status.toLowerCase()}.` });
    const inv = isId(req.body?.invoiceId) ? await Invoice.findOne({ _id: req.body.invoiceId, schoolId: sid }) : null; if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    if (!['Open', 'PartiallyPaid'].includes(inv.status)) return res.status(422).json({ message: `That invoice is ${inv.status.toLowerCase()}.` });
    const pay = new Payment({ schoolId: sid, studentId: inv.studentId, amount: line.amount, method: 'bank', reference: line.reference || line.description.slice(0, 60) || 'bank statement', receivedAt: line.date, createdByName: req.actorName || '' });
    await confirm(req, pay, { kind: 'bank-line', refId: String(line._id) });
    await pay.save(); line.status = 'Matched'; line.paymentId = pay._id; await line.save();
    const r = await F.allocate(pay, [inv, ...(await openInvoicesFor(sid, inv.studentId)).filter((x) => String(x._id) !== String(inv._id))]); await pay.save();
    await audit(req, { action: 'finance.bank.match', entityType: 'BankStatementLine', entityId: line._id, schoolId: sid, detail: { invoice: inv.number, amount: line.amount, credit: r.left } });
    require('../utils/integrations/webhook').emit(sid, 'payment.received', { payment: pay }, { eventId: `pay_${pay._id}` });
    res.json({ payment: payView(pay) });
  } catch (e) { fail(res, e); }
};
exports.ignoreLine = async (req, res) => {
  try {
    const line = isId(req.params.id) ? await Line.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null; if (!line) return res.status(404).json({ message: 'Bank line not found' });
    if (line.status !== 'Unmatched') return res.status(422).json({ message: `This line is already ${line.status.toLowerCase()}.` });
    if (str(req.body?.reason).length < 3) return res.status(400).json({ message: 'Write why this credit is not a fee payment.' });
    line.status = 'Ignored'; line.ignoredReason = str(req.body.reason, 200); await line.save();
    await audit(req, { action: 'finance.bank.ignore', entityType: 'BankStatementLine', entityId: line._id, schoolId: req.user.schoolId, detail: { reason: line.ignoredReason } });
    res.json({ line });
  } catch (e) { fail(res, e); }
};

/* ───────── statements, overview, reconcile ───────── */
const statementFor = async (sid, students) => {
  const ids = students.map((s) => s._id); const [invs, pays] = await Promise.all([Invoice.find({ schoolId: sid, studentId: { $in: ids }, status: { $ne: 'Void' } }).sort({ dueDate: 1 }), Payment.find({ schoolId: sid, studentId: { $in: ids }, status: 'Confirmed' }).sort({ receivedAt: -1 })]);
  const rows = students.map((s) => { const mi = invs.filter((i) => String(i.studentId) === String(s._id)); const mp = pays.filter((p) => String(p.studentId) === String(s._id));
    return { student: { _id: s._id, name: s.name }, invoices: mi.map(invView), payments: mp.map(payView), billed: mi.reduce((t, i) => t + i.total, 0), paid: mi.reduce((t, i) => t + i.paid, 0), outstanding: mi.reduce((t, i) => t + F.balanceOf(i), 0), credit: mp.reduce((t, p) => t + F.unallocated(p), 0) }; });
  return { students: rows, totals: { billed: rows.reduce((t, r) => t + r.billed, 0), paid: rows.reduce((t, r) => t + r.paid, 0), outstanding: rows.reduce((t, r) => t + r.outstanding, 0), credit: rows.reduce((t, r) => t + r.credit, 0) } };
};
exports.studentStatement = async (req, res) => { try { const s = await studentIn(req.user.schoolId, req.params.studentId); if (!s) return res.status(404).json({ message: 'Student not found' }); res.json(await statementFor(req.user.schoolId, [s])); } catch (e) { fail(res, e); } };
exports.familyStatement = async (req, res) => {
  try {
    const sid = req.user.schoolId; const parent = isId(req.params.parentId) ? await Parent.findOne({ _id: req.params.parentId, schoolId: sid }) : null; if (!parent) return res.status(404).json({ message: 'Parent not found' });
    const kids = await Student.find({ schoolId: sid, _id: { $in: parent.children } }); res.json({ parent: { _id: parent._id, name: parent.name }, ...(await statementFor(sid, kids)) });
  } catch (e) { fail(res, e); }
};
// Parent: one statement across all children they may see fees for
exports.myFamily = async (req, res) => {
  try {
    const sid = req.user.schoolId; const parent = await Parent.findOne({ _id: req.user.userId, schoolId: sid, isActive: true }); if (!parent) return res.status(404).json({ message: 'Parent account not found' });
    const rights = await G.resolveForParent(sid, parent, parent.children); const ok = parent.children.filter((c) => rights.get(String(c))?.rights.viewFees);
    const kids = await Student.find({ schoolId: sid, _id: { $in: ok } }); res.json({ parent: { _id: parent._id, name: parent.name }, ...(await statementFor(sid, kids)) });
  } catch (e) { fail(res, e); }
};

exports.overview = async (req, res) => {
  try {
    const sid = req.user.schoolId; const [invs, pays, lines, pend, sess] = await Promise.all([Invoice.find({ schoolId: sid, status: { $ne: 'Void' } }).select('total adjusted paid status dueDate'), Payment.find({ schoolId: sid, status: 'Confirmed' }).select('amount refunded allocations'), Line.find({ schoolId: sid, status: 'Unmatched' }).select('amount'), Adjustment.countDocuments({ schoolId: sid, status: 'Requested' }), Session.find({ schoolId: sid, status: 'Open' })]);
    const now = new Date(); const open = invs.filter((i) => ['Open', 'PartiallyPaid'].includes(i.status));
    res.json({ invoiced: invs.reduce((t, i) => t + i.total, 0), collected: pays.reduce((t, p) => t + p.amount - p.refunded, 0), outstanding: open.reduce((t, i) => t + F.balanceOf(i), 0), overdue: open.filter((i) => new Date(i.dueDate) < now).reduce((t, i) => t + F.balanceOf(i), 0), unmatchedCredits: lines.length, unmatchedAmount: lines.reduce((t, x) => t + x.amount, 0), pendingApprovals: pend, openTills: sess.length, unallocatedCredit: pays.reduce((t, p) => t + p.amount - p.refunded - p.allocations.reduce((s, a) => s + a.amount, 0), 0) });
  } catch (e) { fail(res, e); }
};

// Every invoice must equal what its payments allocated, and no payment may be over-allocated
exports.reconcile = async (req, res) => {
  try {
    const sid = req.user.schoolId; const [invs, pays] = await Promise.all([Invoice.find({ schoolId: sid }), Payment.find({ schoolId: sid, status: 'Confirmed' })]); const problems = [];
    const byInv = new Map(); pays.forEach((p) => p.allocations.forEach((a) => byInv.set(a.invoiceId, (byInv.get(a.invoiceId) || 0) + a.amount)));
    invs.forEach((i) => { if ((byInv.get(String(i._id)) || 0) !== i.paid) problems.push({ kind: 'invoice', id: i._id, message: `${i.number}: paid shows ${i.paid} but payments allocated ${byInv.get(String(i._id)) || 0}` }); if (i.status !== 'Void' && i.paid + i.adjusted > i.total) problems.push({ kind: 'invoice', id: i._id, message: `${i.number}: paid and adjusted exceed the total` }); });
    pays.forEach((p) => { if (p.allocations.reduce((s, a) => s + a.amount, 0) + p.refunded > p.amount) problems.push({ kind: 'payment', id: p._id, message: `${p.receiptNo}: allocated and refunded exceed the amount received` }); if (!p.evidence?.kind) problems.push({ kind: 'payment', id: p._id, message: `${p.receiptNo}: confirmed without a source` }); });
    res.json({ ok: problems.length === 0, checked: { invoices: invs.length, payments: pays.length }, problems });
  } catch (e) { fail(res, e); }
};
