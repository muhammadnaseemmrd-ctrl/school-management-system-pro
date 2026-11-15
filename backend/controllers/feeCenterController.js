// Fee payments, other fees (uniform, books...) and transport.
// Rule: students/parents can only SUBMIT a payment screenshot. Only the school
// admin can turn a fee into "Paid" (approve) or reject the screenshot.
const mongoose = require('mongoose');
const FeeStructure = require('../models/FeeStructure');
const StudentFee = require('../models/StudentFee');
const FeeCharge = require('../models/FeeCharge');
const PaymentProof = require('../models/PaymentProof');
const TransportRoute = require('../models/TransportRoute');
const TransportAssignment = require('../models/TransportAssignment');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Parent = require('../models/Parent');
const N = require('../utils/notify');

const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null);
const fail = (res, e) => res.status(500).json({ message: e.message });

/* ─────────────── helpers ─────────────── */
// Returns the Student document this user may look at, or null.
const studentFor = async (req, studentId) => {
  const sid = studentId || (req.user.role === 'student' ? req.user.userId : null);
  if (!oid(sid)) return null;
  const student = await Student.findOne({ _id: sid, schoolId: req.user.schoolId }).populate('classId', 'standard division');
  if (!student) return null;
  if (req.user.role === 'admin') return student;
  if (req.user.role === 'student') return String(student._id) === String(req.user.userId) ? student : null;
  if (req.user.role === 'parent') {
    const parent = await Parent.findOne({ _id: req.user.userId, schoolId: req.user.schoolId, children: student._id });
    return parent ? student : null;
  }
  return null;
};

const installmentAmount = (structure, n) => {
  if (!structure) return 0;
  const named = structure[`q${n}Amount`];
  if (n <= 4 && typeof named === 'number') return named;
  const count = structure.totalInstallments || 4;
  return Math.round((structure.totalAmount / count) * 100) / 100;
};

const ensureStudentFee = async (schoolId, student, structure) => {
  let sf = await StudentFee.findOne({ schoolId, studentId: student._id });
  if (!sf && structure && student.classId) {
    sf = await StudentFee.create({ schoolId, studentId: student._id, classId: student.classId._id || student.classId });
  }
  return sf;
};

const setInstallmentPaid = (fee, n) => {
  if (!fee.paidInstallments) fee.paidInstallments = [];
  if (!fee.paidInstallments.includes(n)) fee.paidInstallments.push(n);
  if (!fee.paidDates) fee.paidDates = new Map();
  if (fee.paidDates instanceof Map) fee.paidDates.set(String(n), new Date());
  else fee.paidDates = { ...fee.paidDates, [String(n)]: new Date() };
  if (n <= 4) { fee[`q${n}Status`] = 'Paid'; fee[`q${n}PaidDate`] = new Date(); }
  fee.markModified('paidInstallments');
  fee.markModified('paidDates');
};

const monthLabel = (period) => {
  const [y, m] = String(period).split('-').map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// Everything a student/parent needs on the Fees screen
const buildSummary = async (schoolId, student) => {
  const cls = student.classId && student.classId.standard ? student.classId : await Class.findById(student.classId);
  const structure = cls ? await FeeStructure.findOne({ schoolId, standard: cls.standard }) : null;
  const sf = await ensureStudentFee(schoolId, student, structure);
  const charges = await FeeCharge.find({ schoolId, studentId: student._id }).sort({ dueDate: 1, createdAt: -1 });
  const proofs = await PaymentProof.find({ schoolId, studentId: student._id }).sort({ createdAt: -1 }).limit(60);

  const pending = new Set();
  const rejected = new Map(); // key -> note (most recent rejection)
  const keyOf = (it) => (it.kind === 'installment' ? `i:${it.installment}` : `c:${it.chargeId}`);
  proofs.forEach((p) => p.items.forEach((it) => {
    const k = keyOf(it);
    if (p.status === 'Pending') pending.add(k);
    if (p.status === 'Rejected' && !rejected.has(k)) rejected.set(k, p.reviewNote || 'Rejected by the school');
  }));
  // a rejection only counts if no newer proof exists for the same item
  proofs.forEach((p) => {
    if (p.status === 'Approved') p.items.forEach((it) => rejected.delete(keyOf(it)));
  });

  const items = [];
  if (structure) {
    const total = structure.totalInstallments || 4;
    for (let n = 1; n <= total; n++) {
      const key = `i:${n}`;
      const paid = !!sf && (sf.paidInstallments || []).includes(n);
      const paidDate = sf && sf.paidDates ? (sf.paidDates instanceof Map ? sf.paidDates.get(String(n)) : sf.paidDates[String(n)]) : null;
      items.push({
        key, kind: 'installment', installment: n, type: 'Tuition',
        title: `Tuition fee - Installment ${n} of ${total}`, amount: installmentAmount(structure, n),
        status: paid ? 'Paid' : pending.has(key) ? 'Under review' : rejected.has(key) ? 'Rejected' : 'Unpaid',
        paidAt: paid ? paidDate || null : null, reviewNote: !paid && rejected.has(key) ? rejected.get(key) : '',
      });
    }
  }
  charges.forEach((c) => {
    const key = `c:${c._id}`;
    const paid = c.status === 'Paid';
    items.push({
      key, kind: 'charge', chargeId: c._id, type: c.type, title: c.title, amount: c.amount, dueDate: c.dueDate,
      status: paid ? 'Paid' : pending.has(key) ? 'Under review' : rejected.has(key) ? 'Rejected' : 'Unpaid',
      paidAt: c.paidAt || null, reviewNote: !paid && rejected.has(key) ? rejected.get(key) : '',
    });
  });

  const sum = (st) => items.filter((i) => st.includes(i.status)).reduce((s, i) => s + (i.amount || 0), 0);
  return {
    student: { _id: student._id, name: student.name, rollNumber: student.rollNumber, class: cls ? `${cls.standard}${cls.division ? '-' + cls.division : ''}` : '' },
    items,
    totals: { due: sum(['Unpaid', 'Rejected']), underReview: sum(['Under review']), paid: sum(['Paid']) },
    proofs: proofs.map((p) => ({
      _id: p._id, status: p.status, totalAmount: p.totalAmount, method: p.method, reference: p.reference,
      screenshotUrl: p.screenshotUrl, note: p.note, reviewNote: p.reviewNote, createdAt: p.createdAt, reviewedAt: p.reviewedAt,
      items: p.items.map((i) => ({ label: i.label, amount: i.amount })),
    })),
    hasStructure: !!structure,
  };
};

/* ─────────────── student / parent / admin: summary & proofs ─────────────── */
exports.getSummary = async (req, res) => {
  try {
    const student = await studentFor(req, req.params.studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(await buildSummary(req.user.schoolId, student));
  } catch (e) { fail(res, e); }
};

const trustedFile = (url) => {
  if (typeof url !== 'string') return false;
  if (/^\/api\/files\/stored\/[a-f0-9]{24}\/[a-f0-9]+$/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:'
      ? u.pathname.startsWith('/api/files/stored/') || u.hostname === 'res.cloudinary.com'
      : false;
  } catch { return false; }
};

exports.submitProof = async (req, res) => {
  try {
    const student = await studentFor(req, req.body.studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const { itemKeys, method, reference = '', screenshotUrl, note = '' } = req.body;
    if (!Array.isArray(itemKeys) || itemKeys.length === 0) return res.status(400).json({ message: 'Choose which fees you paid.' });
    if (!trustedFile(screenshotUrl)) return res.status(400).json({ message: 'Please upload a screenshot or photo of the payment.' });

    const summary = await buildSummary(req.user.schoolId, student);
    const picked = [];
    for (const k of new Set(itemKeys)) {
      const it = summary.items.find((x) => x.key === k);
      if (!it) return res.status(400).json({ message: 'One of the selected fees was not found.' });
      if (it.status === 'Paid') return res.status(400).json({ message: `"${it.title}" is already paid.` });
      if (it.status === 'Under review') return res.status(400).json({ message: `"${it.title}" is already waiting for review.` });
      picked.push(it);
    }
    const proof = await PaymentProof.create({
      schoolId: req.user.schoolId,
      studentId: student._id,
      submittedByRole: req.user.role,
      submittedById: req.user.userId,
      items: picked.map((it) => ({ kind: it.kind, installment: it.installment, chargeId: it.chargeId, label: it.title, amount: it.amount })),
      totalAmount: picked.reduce((s, i) => s + (i.amount || 0), 0),
      method: ['Bank transfer', 'JazzCash', 'Easypaisa', 'Cash deposit', 'Other'].includes(method) ? method : 'Other',
      reference: String(reference).slice(0, 80),
      screenshotUrl,
      note: String(note).slice(0, 500),
    });
    await N.notify({ schoolId: req.user.schoolId, recipients: await N.admins(req.user.schoolId), title: `Payment screenshot from ${student.name}`, body: `Rs ${proof.totalAmount.toLocaleString('en-PK')} - waiting for your review`, link: '/admin/dashboard#/feesCenter', type: 'fee' });
    res.status(201).json({ message: 'Payment proof sent. The school will check it and mark the fee as paid.', proof });
  } catch (e) { fail(res, e); }
};

/* ─────────────── admin: review queue ─────────────── */
exports.listProofs = async (req, res) => {
  try {
    const { status = 'Pending', studentId } = req.query;
    const q = { schoolId: req.user.schoolId };
    if (['Pending', 'Approved', 'Rejected'].includes(status)) q.status = status;
    if (oid(studentId)) q.studentId = oid(studentId);
    const [proofs, counts] = await Promise.all([
      PaymentProof.find(q).sort({ createdAt: status === 'Pending' ? 1 : -1 }).limit(200)
        .populate({ path: 'studentId', select: 'name rollNumber classId', populate: { path: 'classId', select: 'standard division' } }),
      PaymentProof.aggregate([{ $match: { schoolId: new mongoose.Types.ObjectId(req.user.schoolId) } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const c = { Pending: 0, Approved: 0, Rejected: 0 };
    counts.forEach((x) => { c[x._id] = x.n; });
    res.json({ proofs, counts: c });
  } catch (e) { fail(res, e); }
};

exports.reviewProof = async (req, res) => {
  try {
    const { action, note = '' } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'action must be approve or reject' });
    const proof = await PaymentProof.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
    if (!proof) return res.status(404).json({ message: 'Payment proof not found' });
    if (proof.status !== 'Pending') return res.status(400).json({ message: `This payment was already ${proof.status.toLowerCase()}.` });
    if (action === 'reject' && !String(note).trim()) return res.status(400).json({ message: 'Please write a short reason so the parent knows what to fix.' });

    if (action === 'approve') {
      const student = await Student.findById(proof.studentId).populate('classId', 'standard division');
      const instItems = proof.items.filter((i) => i.kind === 'installment');
      if (instItems.length) {
        const structure = student?.classId ? await FeeStructure.findOne({ schoolId: req.user.schoolId, standard: student.classId.standard }) : null;
        const sf = student ? await ensureStudentFee(req.user.schoolId, student, structure) : null;
        if (sf) { instItems.forEach((i) => setInstallmentPaid(sf, i.installment)); await sf.save(); }
      }
      const chargeIds = proof.items.filter((i) => i.kind === 'charge').map((i) => i.chargeId);
      if (chargeIds.length) {
        await FeeCharge.updateMany(
          { _id: { $in: chargeIds }, schoolId: req.user.schoolId, status: 'Unpaid' },
          { status: 'Paid', paidAt: new Date(), paidVia: 'proof', proofId: proof._id }
        );
      }
    }
    proof.status = action === 'approve' ? 'Approved' : 'Rejected';
    proof.reviewedBy = req.user.userId;
    proof.reviewedAt = new Date();
    proof.reviewNote = String(note).slice(0, 500);
    await proof.save();
    const ok = action === 'approve';
    await N.notify({
      schoolId: req.user.schoolId, recipients: await N.studentAndParents(req.user.schoolId, [proof.studentId]),
      title: ok ? 'Payment confirmed - marked as paid' : 'Payment screenshot was rejected',
      body: ok ? `Rs ${proof.totalAmount.toLocaleString('en-PK')} received. Thank you!` : proof.reviewNote, link: { parent: '/parent/dashboard#/fees', student: '/student/dashboard#/fees' }, type: 'fee',
    });
    res.json({ message: ok ? 'Marked as paid' : 'Payment rejected', proof });
  } catch (e) { fail(res, e); }
};

/* ─────────────── admin: other fees (charges) ─────────────── */
const resolveStudents = async (schoolId, target = {}) => {
  const q = { schoolId };
  if (target.mode === 'students') {
    const ids = (target.studentIds || []).map(oid).filter(Boolean);
    if (!ids.length) return [];
    q._id = { $in: ids };
  } else if (target.mode === 'class') {
    if (!oid(target.classId)) return [];
    q.classId = oid(target.classId);
  } else if (target.mode === 'standard') {
    const classes = await Class.find({ schoolId, standard: target.standard }).select('_id');
    q.classId = { $in: classes.map((c) => c._id) };
  } else if (target.mode !== 'all') {
    return [];
  }
  return Student.find(q).select('_id classId').limit(3000);
};

exports.createCharges = async (req, res) => {
  try {
    const { title, type = 'Other', amount, dueDate, note = '', target } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ message: 'Fee name is required' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: 'Enter a valid amount in PKR' });
    if (!FeeCharge.schema.path('type').enumValues.includes(type)) return res.status(400).json({ message: 'Invalid fee type' });
    const students = await resolveStudents(req.user.schoolId, target);
    if (!students.length) return res.status(400).json({ message: 'No students matched. Choose a class, standard or students.' });
    const docs = students.map((s) => ({
      schoolId: req.user.schoolId, studentId: s._id, classId: s.classId, type, title: String(title).trim(), amount: amt,
      dueDate: dueDate || undefined, note, createdBy: req.user.userId,
    }));
    await FeeCharge.insertMany(docs);
    await N.notify({ schoolId: req.user.schoolId, recipients: await N.studentAndParents(req.user.schoolId, students.map((s) => s._id)), title: `New fee: ${String(title).trim()}`, body: `Rs ${amt.toLocaleString('en-PK')}${dueDate ? ` - due ${new Date(dueDate).toLocaleDateString('en-GB')}` : ''}`, link: { parent: '/parent/dashboard#/fees', student: '/student/dashboard#/fees' }, type: 'fee' });
    res.status(201).json({ message: `Fee added for ${docs.length} student${docs.length === 1 ? '' : 's'}`, count: docs.length });
  } catch (e) { fail(res, e); }
};

exports.listCharges = async (req, res) => {
  try {
    const { type, status, classId, studentId, q } = req.query;
    const match = { schoolId: new mongoose.Types.ObjectId(req.user.schoolId) };
    if (type) match.type = type;
    if (status) match.status = status;
    if (oid(classId)) match.classId = oid(classId);
    if (oid(studentId)) match.studentId = oid(studentId);
    let charges = await FeeCharge.find(match).sort({ createdAt: -1 }).limit(500)
      .populate({ path: 'studentId', select: 'name rollNumber' }).populate('classId', 'standard division');
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      charges = charges.filter((c) => rx.test(c.studentId?.name || '') || rx.test(c.title));
    }
    const pendingIds = new Set(
      (await PaymentProof.find({ schoolId: req.user.schoolId, status: 'Pending' }).select('items')).flatMap((p) => p.items.filter((i) => i.kind === 'charge').map((i) => String(i.chargeId)))
    );
    const rows = charges.map((c) => ({ ...c.toObject(), underReview: pendingIds.has(String(c._id)) }));
    const totals = rows.reduce((t, c) => { t[c.status === 'Paid' ? 'paid' : 'unpaid'] += c.amount; return t; }, { paid: 0, unpaid: 0 });
    res.json({ charges: rows, totals });
  } catch (e) { fail(res, e); }
};

exports.markCharge = async (req, res) => {
  try {
    const { status } = req.body; // Admin can also record cash received at school
    if (!['Paid', 'Unpaid'].includes(status)) return res.status(400).json({ message: 'status must be Paid or Unpaid' });
    const c = await FeeCharge.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
    if (!c) return res.status(404).json({ message: 'Fee not found' });
    c.status = status;
    c.paidAt = status === 'Paid' ? new Date() : undefined;
    c.paidVia = status === 'Paid' ? 'admin' : '';
    await c.save();
    res.json({ message: status === 'Paid' ? 'Marked as paid' : 'Marked as unpaid', charge: c });
  } catch (e) { fail(res, e); }
};

exports.deleteCharge = async (req, res) => {
  try {
    const c = await FeeCharge.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
    if (!c) return res.status(404).json({ message: 'Fee not found' });
    if (c.status === 'Paid') return res.status(400).json({ message: 'A paid fee cannot be deleted. Mark it unpaid first if it was a mistake.' });
    const waiting = await PaymentProof.exists({ schoolId: req.user.schoolId, status: 'Pending', 'items.chargeId': c._id });
    if (waiting) return res.status(400).json({ message: 'A payment screenshot is waiting for this fee. Review it first.' });
    await c.deleteOne();
    res.json({ message: 'Fee deleted' });
  } catch (e) { fail(res, e); }
};

/* ─────────────── admin: transport ─────────────── */
exports.listRoutes = async (req, res) => {
  try {
    const routes = await TransportRoute.find({ schoolId: req.user.schoolId }).sort({ name: 1 });
    const counts = await TransportAssignment.aggregate([{ $match: { schoolId: new mongoose.Types.ObjectId(req.user.schoolId) } }, { $group: { _id: '$routeId', n: { $sum: 1 } } }]);
    const map = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json({ routes: routes.map((r) => ({ ...r.toObject(), students: map.get(String(r._id)) || 0 })) });
  } catch (e) { fail(res, e); }
};

exports.saveRoute = async (req, res) => {
  try {
    const { name, monthlyFee, vehicle = '', driverName = '', driverPhone = '', notes = '', isActive = true } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'Route name is required' });
    const fee = Number(monthlyFee);
    if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ message: 'Enter the monthly transport fee in PKR' });
    const data = { name: String(name).trim(), monthlyFee: fee, vehicle, driverName, driverPhone, notes, isActive: !!isActive };
    let route;
    if (req.params.id) {
      route = await TransportRoute.findOneAndUpdate({ _id: req.params.id, schoolId: req.user.schoolId }, data, { new: true });
      if (!route) return res.status(404).json({ message: 'Route not found' });
    } else {
      route = await TransportRoute.create({ ...data, schoolId: req.user.schoolId });
    }
    res.status(req.params.id ? 200 : 201).json({ message: 'Route saved', route });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'A route with this name already exists' });
    fail(res, e);
  }
};

exports.deleteRoute = async (req, res) => {
  try {
    const used = await TransportAssignment.countDocuments({ schoolId: req.user.schoolId, routeId: req.params.id });
    if (used) return res.status(400).json({ message: `${used} student(s) use this route. Move them first, or mark the route inactive.` });
    await TransportRoute.deleteOne({ _id: req.params.id, schoolId: req.user.schoolId });
    res.json({ message: 'Route deleted' });
  } catch (e) { fail(res, e); }
};

exports.listAssignments = async (req, res) => {
  try {
    const list = await TransportAssignment.find({ schoolId: req.user.schoolId })
      .populate({ path: 'studentId', select: 'name rollNumber classId', populate: { path: 'classId', select: 'standard division' } })
      .populate('routeId', 'name monthlyFee');
    res.json({ assignments: list.filter((a) => a.studentId && a.routeId) });
  } catch (e) { fail(res, e); }
};

exports.assignTransport = async (req, res) => {
  try {
    const { studentIds, studentId, routeId, pickupPoint = '' } = req.body;
    const ids = (Array.isArray(studentIds) ? studentIds : [studentId]).map(oid).filter(Boolean);
    if (!ids.length) return res.status(400).json({ message: 'Choose at least one student' });
    const valid = await Student.find({ _id: { $in: ids }, schoolId: req.user.schoolId }).select('_id');
    if (!routeId) { // remove from transport
      await TransportAssignment.deleteMany({ schoolId: req.user.schoolId, studentId: { $in: valid.map((s) => s._id) } });
      return res.json({ message: 'Removed from transport' });
    }
    const route = await TransportRoute.findOne({ _id: routeId, schoolId: req.user.schoolId });
    if (!route) return res.status(404).json({ message: 'Route not found' });
    await Promise.all(valid.map((s) => TransportAssignment.findOneAndUpdate(
      { schoolId: req.user.schoolId, studentId: s._id }, { routeId: route._id, pickupPoint }, { upsert: true, new: true }
    )));
    res.json({ message: `${valid.length} student(s) assigned to ${route.name}` });
  } catch (e) { fail(res, e); }
};

// Create this month's transport fee for every student on a route
exports.generateTransport = async (req, res) => {
  try {
    const { month, dueDate } = req.body; // "2026-11"
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return res.status(400).json({ message: 'Choose a month' });
    const assignments = await TransportAssignment.find({ schoolId: req.user.schoolId }).populate('routeId');
    const due = dueDate ? new Date(dueDate) : new Date(`${month}-10T00:00:00Z`);
    const students = await Student.find({ _id: { $in: assignments.map((a) => a.studentId) }, schoolId: req.user.schoolId }).select('classId');
    const classOf = new Map(students.map((s) => [String(s._id), s.classId]));
    const docs = assignments
      .filter((a) => a.routeId && a.routeId.isActive && classOf.has(String(a.studentId)))
      .map((a) => ({
        schoolId: req.user.schoolId, studentId: a.studentId, classId: classOf.get(String(a.studentId)), type: 'Transport',
        title: `Transport fee - ${monthLabel(month)} (${a.routeId.name})`, amount: a.routeId.monthlyFee, dueDate: due, period: month, createdBy: req.user.userId,
      }));
    let created = 0;
    try {
      const r = await FeeCharge.insertMany(docs, { ordered: false });
      created = r.length;
    } catch (e) {
      // duplicates (already generated) are skipped
      created = e.insertedDocs ? e.insertedDocs.length : (e.result?.insertedCount ?? 0);
      if (!e.writeErrors && !e.insertedDocs) throw e;
    }
    res.json({ message: created ? `Transport fee created for ${created} student(s)` : 'Nothing new to create (already generated for this month)', created });
  } catch (e) { fail(res, e); }
};

exports.overview = async (req, res) => {
  try {
    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    const [pending, agg] = await Promise.all([
      PaymentProof.countDocuments({ schoolId, status: 'Pending' }),
      FeeCharge.aggregate([{ $match: { schoolId } }, { $group: { _id: { type: '$type', status: '$status' }, total: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    ]);
    res.json({ pendingProofs: pending, charges: agg });
  } catch (e) { fail(res, e); }
};
