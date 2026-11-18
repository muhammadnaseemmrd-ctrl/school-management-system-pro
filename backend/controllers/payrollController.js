// Payroll (PRD E07): reviewed rules, monthly batches with maker-checker, payslips, final settlement, employee self-service.
const mongoose = require('../lib/pgdoc');
const Employee = require('../models/Employee'); const Rule = require('../models/PayrollRule'); const Batch = require('../models/PayrollBatch'); const Leave = require('../models/LeaveRequest'); const SAtt = require('../models/StaffAttendance');
const Overtime = require('../models/OvertimeEntry'); const Advance = require('../models/StaffAdvance'); const Settlement = require('../models/FinalSettlement'); const Contract = require('../models/EmployeeContract'); const Roster = require('../models/RosterEntry');
const Cover = require('../models/CoverAssignment'); const Record = require('../models/EmployeeRecord'); const School = require('../models/School');
const H = require('../utils/hr'); const N = require('../utils/notify'); const { audit } = require('../utils/audit'); const { settings, leaveBalances } = require('./hrOpsController');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const whole = (v) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };

/* ───────── rules ───────── */
exports.createRule = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; if (str(b.name).length < 2) return res.status(400).json({ message: 'Name the rule.' });
    if (!['percent-of-gross', 'percent-of-basic', 'fixed', 'tax-slabs'].includes(b.kind)) return res.status(400).json({ message: 'Choose the kind of rule.' });
    const r = { schoolId: sid, name: str(b.name, 60), kind: b.kind, createdBy: req.user.userId, createdByName: req.actorName || '' };
    if (b.kind === 'tax-slabs') {
      const slabs = Array.isArray(b.slabs) ? b.slabs : []; if (!slabs.length) return res.status(400).json({ message: 'Add at least one tax band.' });
      let prev = 0; for (let i = 0; i < slabs.length; i++) { const s = slabs[i]; const last = i === slabs.length - 1; const up = s.upTo === undefined || s.upTo === null || s.upTo === '' ? null : Number(s.upTo);
        if ((last && up !== null) || (!last && (up === null || !(up > prev)))) return res.status(400).json({ message: last ? 'The last band must have no upper limit.' : 'Each band must end above the one before it.' });
        if (!(Number(s.ratePercent) >= 0 && Number(s.ratePercent) <= 100) || !(Number(s.fixed || 0) >= 0)) return res.status(400).json({ message: 'Rates are 0 to 100 and fixed amounts are 0 or more.' }); if (up !== null) prev = up; }
      r.slabs = slabs.map((s) => ({ upTo: s.upTo === undefined || s.upTo === null || s.upTo === '' ? undefined : Number(s.upTo), ratePercent: Number(s.ratePercent), fixed: Number(s.fixed || 0) }));
    } else { const v = Number(b.value); if (!(v > 0) || (b.kind.startsWith('percent') && v > 100) || (b.kind === 'fixed' && !Number.isInteger(v))) return res.status(400).json({ message: b.kind === 'fixed' ? 'Enter the amount in whole rupees.' : 'A percentage is above 0 and up to 100.' }); r.value = v; }
    const rule = await Rule.create(r); await audit(req, { action: 'payroll.rule.create', entityType: 'PayrollRule', entityId: rule._id, schoolId: sid, detail: { name: rule.name, kind: rule.kind } }); res.status(201).json({ rule });
  } catch (e) { fail(res, e); }
};
exports.reviewRule = async (req, res) => {
  try {
    const sid = req.user.schoolId; const r = isId(req.params.id) ? await Rule.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!r) return res.status(404).json({ message: 'Rule not found' });
    if (req.body?.retire) { r.status = 'Retired'; await r.save(); await audit(req, { action: 'payroll.rule.retire', entityType: 'PayrollRule', entityId: r._id, schoolId: sid }); return res.json({ rule: r }); }
    if (String(r.createdBy) === String(req.user.userId)) return res.status(403).json({ message: 'The person who entered a rule cannot review it. Another admin or the school accountant must review it.' });
    if (r.status !== 'Draft') return res.status(422).json({ message: `This rule is already ${r.status.toLowerCase()}.` }); if (str(req.body?.note).length < 5) return res.status(400).json({ message: 'Write what you checked it against, for example the current tax schedule.' });
    r.status = 'Reviewed'; r.reviewedBy = req.user.userId; r.reviewedByName = req.actorName || ''; r.reviewedAt = new Date(); r.reviewNote = str(req.body.note, 300); await r.save(); await audit(req, { action: 'payroll.rule.review', entityType: 'PayrollRule', entityId: r._id, schoolId: sid, detail: { name: r.name } }); res.json({ rule: r });
  } catch (e) { fail(res, e); }
};
exports.listRules = async (req, res) => { try { res.json({ rules: await Rule.find({ schoolId: req.user.schoolId }).sort({ createdAt: -1 }).limit(100) }); } catch (e) { fail(res, e); } };

/* ───────── compute ───────── */
async function compute(sid, period, st) {
  const { from, to } = H.monthBounds(period); const wd = H.workDays(from, to).length; const rules = await Rule.find({ schoolId: sid }); const live = rules.filter((r) => r.status === 'Reviewed' && new Date(r.effectiveFrom) <= new Date(`${to}T23:59:59Z`));
  const drafts = rules.filter((r) => r.status === 'Draft'); const emps = (await Employee.find({ schoolId: sid, status: 'Active' }).sort({ name: 1 })).filter((e) => new Date(e.joinDate) <= new Date(`${to}T23:59:59Z`));
  const leaves = await Leave.find({ schoolId: sid, status: 'Approved', fromDate: { $lte: to }, toDate: { $gte: from } }); const att = await SAtt.find({ schoolId: sid, date: { $gte: from, $lte: to } });
  const ots = await Overtime.find({ schoolId: sid, period }); const advs = await Advance.find({ schoolId: sid, status: 'Active' }); const lines = [];
  for (const e of emps) {
    const ex = []; const id = String(e._id);
    if (!e.basicSalary) { lines.push({ employeeId: id, code: e.code, name: e.name, basic: 0, allowances: 0, overtime: 0, gross: 0, taxable: 0, deductions: [], absenceDeduction: 0, unpaidDays: 0, advance: 0, tax: 0, net: 0, exceptions: ['No basic salary set, so no pay was calculated.'], advanceIds: [] }); continue; }
    const allow = (e.allowances || []).reduce((t, a) => t + a.amount, 0); const allowTax = (e.allowances || []).filter((a) => a.taxable).reduce((t, a) => t + a.amount, 0);
    const myOt = ots.filter((o) => String(o.employeeId) === id); const apprOt = myOt.filter((o) => o.status === 'Approved'); const pendOt = myOt.filter((o) => o.status === 'Requested');
    if (pendOt.length) ex.push(`${pendOt.length} overtime entr${pendOt.length > 1 ? 'ies are' : 'y is'} not approved yet, so not paid.`);
    const otPay = Math.round(apprOt.reduce((t, o) => t + o.hours, 0) * (e.basicSalary / (wd * 8)) * st.overtimeMultiplier);
    const unpaidLeave = leaves.filter((l) => String(l.employeeId) === id && l.type === 'unpaid').reduce((t, l) => t + H.workDays(l.fromDate < from ? from : l.fromDate, l.toDate > to ? to : l.toDate).length, 0);
    const leaveDays = new Set(leaves.filter((l) => String(l.employeeId) === id).flatMap((l) => H.workDays(l.fromDate < from ? from : l.fromDate, l.toDate > to ? to : l.toDate)));
    const absent = att.filter((a) => String(a.employeeId) === id && a.status === 'Absent' && !leaveDays.has(a.date)).length + att.filter((a) => String(a.employeeId) === id && a.status === 'HalfDay').length * 0.5;
    const unpaid = unpaidLeave + absent; const abs = Math.round((e.basicSalary / wd) * unpaid); if (unpaid) ex.push(`${unpaid} unpaid day${unpaid === 1 ? '' : 's'} (${unpaidLeave} leave, ${absent} absent).`);
    if (!att.some((a) => String(a.employeeId) === id)) ex.push('No attendance recorded this month.');
    const gross = e.basicSalary + allow + otPay; const taxable = e.basicSalary + allowTax + otPay; const ded = [];
    for (const r of live) { if (r.kind === 'tax-slabs') continue; const a = r.kind === 'fixed' ? r.value : Math.round(((r.kind === 'percent-of-gross' ? gross : e.basicSalary) * r.value) / 100); if (a > 0) ded.push({ name: r.name, amount: a }); }
    let tax = 0; const slab = live.find((r) => r.kind === 'tax-slabs'); if (slab) tax = Math.round(H.slabTax(taxable * 12, slab.slabs) / 12);
    const before = gross - abs - ded.reduce((t, d) => t + d.amount, 0) - tax; let adv = 0; const advanceIds = [];
    for (const a of advs.filter((x) => String(x.employeeId) === id)) { const want = Math.min(a.monthlyRecovery, a.amount - a.recovered); const can = Math.max(0, before - adv); const take = Math.min(want, can); if (take > 0) { adv += take; advanceIds.push(`${a._id}:${take}`); } if (take < want) ex.push(`Advance recovery cut from Rs ${want.toLocaleString('en-PK')} to Rs ${take.toLocaleString('en-PK')} so net pay does not go below zero.`); }
    if (before < 0) ex.push('Deductions are larger than pay. Net pay is zero; check this person.');
    lines.push({ employeeId: id, code: e.code, name: e.name, basic: e.basicSalary, allowances: allow, overtime: otPay, gross, taxable, deductions: ded, absenceDeduction: abs, unpaidDays: unpaid, advance: adv, tax, net: Math.max(0, before - adv), exceptions: ex, advanceIds });
  }
  const sum = (f) => lines.reduce((t, l) => t + f(l), 0);
  return { lines, rulesUsed: live.map((r) => ({ ruleId: String(r._id), name: r.name, reviewedByName: r.reviewedByName })), totals: { gross: sum((l) => l.gross), deductions: sum((l) => l.absenceDeduction + l.advance + l.tax + l.deductions.reduce((t, d) => t + d.amount, 0)), net: sum((l) => l.net), employees: lines.length }, drafts: drafts.length };
}
exports.createBatch = async (req, res) => {
  try {
    const sid = req.user.schoolId; const period = str(req.body?.period, 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return res.status(400).json({ message: 'Choose the month, for example 2026-11.' });
    if (period > new Date().toISOString().slice(0, 7)) return res.status(422).json({ message: 'Payroll cannot be prepared for a future month.' });
    if (await Batch.findOne({ schoolId: sid, period, status: 'Finalized' })) return res.status(422).json({ message: 'This month is already finalized. Record corrections in next month’s run.' });
    const c = await compute(sid, period, await settings(sid)); if (!c.lines.length) return res.status(422).json({ message: 'There are no active employees to pay.' });
    let b = await Batch.findOne({ schoolId: sid, period, status: 'Draft' }); const data = { lines: c.lines, totals: c.totals, rulesUsed: c.rulesUsed, preparedBy: req.user.userId, preparedByName: req.actorName || '' };
    if (b) { Object.assign(b, data); await b.save(); } else b = await Batch.create({ schoolId: sid, period, ...data });
    await audit(req, { action: 'payroll.batch.prepare', entityType: 'PayrollBatch', entityId: b._id, schoolId: sid, detail: { period, employees: c.totals.employees, net: c.totals.net } }); res.status(201).json({ batch: b, unreviewedRules: c.drafts });
  } catch (e) { fail(res, e); }
};
exports.finalize = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = isId(req.params.id) ? await Batch.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!b) return res.status(404).json({ message: 'Payroll run not found' });
    if (b.status !== 'Draft') return res.status(422).json({ message: `This run is already ${b.status.toLowerCase()}.` });
    if (String(b.preparedBy) === String(req.user.userId)) return res.status(403).json({ message: 'The person who prepared this payroll cannot finalize it. Another admin must.' });
    const draft = await Rule.countDocuments({ schoolId: sid, status: 'Draft' }); if (draft) return res.status(422).json({ message: `${draft} deduction rule${draft > 1 ? 's are' : ' is'} waiting for review. Review them and prepare the run again.` });
    const fresh = await compute(sid, b.period, await settings(sid)); const key = (l) => [l.employeeId, l.basic, l.allowances, l.overtime, l.gross, l.tax, l.net, l.advance, l.absenceDeduction, l.unpaidDays, (l.deductions || []).map((d) => `${d.name}:${d.amount}`).join(','), (l.exceptions || []).join('|')].join('~');
    const same = fresh.lines.map(key).join('\n') === b.lines.map(key).join('\n');
    if (!same) return res.status(409).json({ message: 'Attendance, leave, overtime or salaries changed since this run was prepared. Prepare it again, then finalize.' });
    for (const l of b.lines) for (const a of l.advanceIds || []) { const [aid, amt] = a.split(':'); const adv = await Advance.findOne({ _id: aid, schoolId: sid }); if (adv) { adv.recovered += Number(amt); if (adv.recovered >= adv.amount) adv.status = 'Cleared'; await adv.save(); } }
    await Overtime.updateMany({ schoolId: sid, period: b.period, status: 'Approved' }, { $set: { paidInBatchId: b._id } });
    b.status = 'Finalized'; b.finalizedBy = req.user.userId; b.finalizedByName = req.actorName || ''; b.finalizedAt = new Date(); await b.save();
    await audit(req, { action: 'payroll.batch.finalize', entityType: 'PayrollBatch', entityId: b._id, schoolId: sid, detail: { period: b.period, net: b.totals.net, preparedBy: b.preparedByName } });
    const emps = await Employee.find({ schoolId: sid, _id: { $in: b.lines.map((l) => l.employeeId) }, teacherId: { $ne: null } }).select('teacherId'); if (emps.length) await N.notify({ schoolId: sid, recipients: emps.map((e) => ({ id: e.teacherId, role: 'teacher' })), title: 'Payslip ready', body: b.period, type: 'general' });
    res.json({ batch: b });
  } catch (e) { fail(res, e); }
};
exports.deleteDraft = async (req, res) => { try { const b = isId(req.params.id) ? await Batch.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null; if (!b) return res.status(404).json({ message: 'Payroll run not found' }); if (b.status !== 'Draft') return res.status(422).json({ message: 'A finalized run cannot be removed.' }); await Batch.deleteOne({ _id: b._id }); await audit(req, { action: 'payroll.batch.discard', entityType: 'PayrollBatch', entityId: b._id, schoolId: req.user.schoolId, detail: { period: b.period } }); res.json({ removed: true }); } catch (e) { fail(res, e); } };
exports.listBatches = async (req, res) => { try { const rows = await Batch.find({ schoolId: req.user.schoolId }).sort({ period: -1, createdAt: -1 }).limit(60); res.json({ batches: rows.map((b) => ({ _id: b._id, period: b.period, status: b.status, totals: b.totals, preparedByName: b.preparedByName, finalizedByName: b.finalizedByName, finalizedAt: b.finalizedAt })) }); } catch (e) { fail(res, e); } };
exports.getBatch = async (req, res) => { try { const b = isId(req.params.id) ? await Batch.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null; if (!b) return res.status(404).json({ message: 'Payroll run not found' }); res.json({ batch: b, canFinalize: b.status === 'Draft' && String(b.preparedBy) !== String(req.user.userId) }); } catch (e) { fail(res, e); } };

/* ───────── payslips ───────── */
const payslipOf = async (sid, b, line) => { const [school, e] = await Promise.all([School.findById(sid).select('name address phone'), Employee.findOne({ _id: line.employeeId, schoolId: sid }).select('name code kind department joinDate')]); return { school, employee: e, period: b.period, finalizedAt: b.finalizedAt, line, preparedBy: b.preparedByName, finalizedBy: b.finalizedByName }; };
exports.payslips = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = isId(req.params.id) ? await Batch.findOne({ _id: req.params.id, schoolId: sid, status: 'Finalized' }) : null; if (!b) return res.status(404).json({ message: 'Finalized payroll run not found' });
    const line = b.lines.find((l) => l.employeeId === String(req.params.employeeId)); if (!line) return res.status(404).json({ message: 'That employee is not in this run.' });
    await audit(req, { action: 'payroll.payslip.view', entityType: 'PayrollBatch', entityId: b._id, schoolId: sid, detail: { employeeId: line.employeeId } }); res.json({ payslip: await payslipOf(sid, b, line) });
  } catch (e) { fail(res, e); }
};

/* ───────── final settlement ───────── */
exports.startSettlement = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const e = isId(b.employeeId) ? await Employee.findOne({ _id: b.employeeId, schoolId: sid }) : null; if (!e) return res.status(404).json({ message: 'Employee not found' }); if (e.status === 'Separated') return res.status(422).json({ message: 'This person has already left.' });
    if (!H.isDate(b.lastDay)) return res.status(400).json({ message: 'Choose the last working day.' }); if (str(b.reason).length < 3) return res.status(400).json({ message: 'Write the reason for leaving.' });
    if (await Settlement.findOne({ schoolId: sid, employeeId: e._id, status: 'Open' })) return res.status(409).json({ message: 'A settlement is already open for this person.' });
    const period = b.lastDay.slice(0, 7); const { from, to } = H.monthBounds(period); const paid = await Batch.findOne({ schoolId: sid, period, status: 'Finalized' });
    const worked = H.workDays(from, b.lastDay).length; const wd = H.workDays(from, to).length; const salaryDue = paid && paid.lines.some((l) => l.employeeId === String(e._id)) ? 0 : Math.round((e.basicSalary / wd) * worked);
    const bal = await leaveBalances(sid, e); const encash = Math.round(bal.annual.left * (e.basicSalary / 30)); const adv = (await Advance.find({ schoolId: sid, employeeId: e._id, status: 'Active' })).reduce((t, a) => t + a.amount - a.recovered, 0);
    const s = await Settlement.create({ schoolId: sid, employeeId: e._id, lastDay: b.lastDay, reason: str(b.reason, 200), salaryDue, leaveEncashment: encash, advanceRecovery: adv, net: salaryDue + encash - adv, clearance: H.CLEARANCE.map(([key, label]) => ({ key, label })), preparedBy: req.user.userId });
    await audit(req, { action: 'hr.settlement.start', entityType: 'FinalSettlement', entityId: s._id, schoolId: sid, detail: { employee: e.code, net: s.net } }); res.status(201).json({ settlement: s });
  } catch (e) { fail(res, e); }
};
exports.clearItem = async (req, res) => {
  try {
    const sid = req.user.schoolId; const s = isId(req.params.id) ? await Settlement.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!s) return res.status(404).json({ message: 'Settlement not found' }); if (s.status !== 'Open') return res.status(422).json({ message: 'This settlement is closed.' });
    const it = s.clearance.find((c) => c.key === req.params.key); if (!it) return res.status(404).json({ message: 'Clearance item not found' }); it.cleared = req.body?.cleared !== false; it.clearedByName = it.cleared ? req.actorName || '' : ''; it.clearedAt = it.cleared ? new Date() : undefined; s.markModified('clearance'); await s.save();
    await audit(req, { action: 'hr.settlement.clear', entityType: 'FinalSettlement', entityId: s._id, schoolId: sid, detail: { key: it.key, cleared: it.cleared } }); res.json({ settlement: s });
  } catch (e) { fail(res, e); }
};
exports.settle = async (req, res) => {
  try {
    const sid = req.user.schoolId; const s = isId(req.params.id) ? await Settlement.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!s) return res.status(404).json({ message: 'Settlement not found' }); if (s.status !== 'Open') return res.status(422).json({ message: 'This settlement is already closed.' });
    if (String(s.preparedBy) === String(req.user.userId)) return res.status(403).json({ message: 'The person who prepared the settlement cannot close it. Another admin must.' });
    const open = s.clearance.filter((c) => !c.cleared); if (open.length) return res.status(422).json({ message: `Clearance is not complete: ${open.map((c) => c.label).join('; ')}.` });
    const e = await Employee.findOne({ _id: s.employeeId, schoolId: sid }); e.status = 'Separated'; e.separatedOn = new Date(`${s.lastDay}T00:00:00Z`); e.separationReason = s.reason; await e.save();
    await Contract.updateMany({ schoolId: sid, employeeId: e._id, status: 'Signed' }, { $set: { status: 'Ended', endedAt: new Date(), endReason: 'Final settlement' } });
    await Advance.updateMany({ schoolId: sid, employeeId: e._id, status: { $in: ['Active', 'Requested'] } }, { $set: { status: 'Cleared' } }); await Roster.deleteMany({ schoolId: sid, employeeId: e._id, date: { $gt: s.lastDay } });
    await Leave.updateMany({ schoolId: sid, employeeId: e._id, status: { $in: ['Requested', 'Approved'] }, fromDate: { $gt: s.lastDay } }, { $set: { status: 'Cancelled' } });
    s.status = 'Settled'; s.settledByName = req.actorName || ''; s.settledAt = new Date(); await s.save(); await audit(req, { action: 'hr.settlement.settle', entityType: 'FinalSettlement', entityId: s._id, schoolId: sid, detail: { employee: e.code, net: s.net } }); res.json({ settlement: s, employee: e });
  } catch (e) { fail(res, e); }
};
exports.listSettlements = async (req, res) => { try { const sid = req.user.schoolId; const rows = await Settlement.find({ schoolId: sid }).sort({ createdAt: -1 }).limit(100); const names = new Map((await Employee.find({ schoolId: sid, _id: { $in: rows.map((r) => r.employeeId) } }).select('name code')).map((x) => [String(x._id), x.name])); res.json({ settlements: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), employeeName: names.get(String(r.employeeId)) })) }); } catch (e) { fail(res, e); } };

/* ───────── employee self-service (teacher login) ───────── */
const mine = (req) => Employee.findOne({ schoolId: req.user.schoolId, teacherId: req.user.userId });
exports.me = async (req, res) => {
  try {
    const sid = req.user.schoolId; const e = await mine(req); if (!e) return res.json({ employee: null }); const today = H.todayStr();
    const [roster, leave, recs, cover, batches, bal] = await Promise.all([Roster.find({ schoolId: sid, employeeId: e._id, date: { $gte: today, $lte: H.addDays(today, 28) }, status: 'Published' }).sort({ date: 1 }), Leave.find({ schoolId: sid, employeeId: e._id }).sort({ createdAt: -1 }).limit(20), Record.find({ schoolId: sid, employeeId: e._id, kind: 'appraisal' }).sort({ createdAt: -1 }), Cover.find({ schoolId: sid, coverTeacherId: req.user.userId, status: 'Assigned', date: { $gte: today } }).sort({ date: 1 }), Batch.find({ schoolId: sid, status: 'Finalized' }).sort({ period: -1 }).limit(36), leaveBalances(sid, e)]);
    res.json({ employee: { _id: e._id, code: e.code, name: e.name, department: e.department, status: e.status }, roster, leave, appraisals: recs, cover, payslips: batches.filter((b) => b.lines.some((l) => l.employeeId === String(e._id))).slice(0, 12).map((b) => ({ batchId: b._id, period: b.period })), balances: bal });
  } catch (e) { fail(res, e); }
};
exports.myPayslip = async (req, res) => {
  try {
    const sid = req.user.schoolId; const e = await mine(req); if (!e) return res.status(404).json({ message: 'Payslip not found' }); const b = isId(req.params.id) ? await Batch.findOne({ _id: req.params.id, schoolId: sid, status: 'Finalized' }) : null; const line = b?.lines.find((l) => l.employeeId === String(e._id));
    if (!line) return res.status(404).json({ message: 'Payslip not found' }); res.json({ payslip: await payslipOf(sid, b, line) });
  } catch (e) { fail(res, e); }
};
