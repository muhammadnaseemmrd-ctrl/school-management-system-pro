// People side of HR (PRD E07): positions, employees, contracts, documents/training/appraisals. 403 not allowed · 404 not in this school · 422 not possible in this state.
const mongoose = require('../lib/pgdoc');
const Position = require('../models/Position'); const Employee = require('../models/Employee'); const Contract = require('../models/EmployeeContract'); const Record = require('../models/EmployeeRecord');
const Teacher = require('../models/Teacher'); const LeaveRequest = require('../models/LeaveRequest'); const StaffAdvance = require('../models/StaffAdvance'); const StaffAttendance = require('../models/StaffAttendance'); const PayrollRule = require('../models/PayrollRule'); const Overtime = require('../models/OvertimeEntry');
const H = require('../utils/hr'); const { audit } = require('../utils/audit'); const { leaveBalances } = require('./hrOpsController');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const whole = (v) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
const pg = (q) => ({ p: Math.max(1, parseInt(q.page, 10) || 1), l: Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)) });
const dateOrNull = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d; };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const KINDS = ['teacher', 'admin', 'clerk', 'guard', 'cleaner', 'driver', 'technician', 'librarian', 'counselor', 'visiting', 'vendor'];

/* ───────── positions ───────── */
const posBody = (b) => {
  const title = str(b.title, 80); if (title.length < 2) return { error: 'Name the position.' };
  const min = b.salaryMin === undefined ? 0 : whole(b.salaryMin); const max = b.salaryMax === undefined ? 0 : whole(b.salaryMax);
  if (!(min >= 0) || !(max >= 0)) return { error: 'Salary limits must be whole rupees, 0 or more.' }; if (max && max < min) return { error: 'The top of the band cannot be below the bottom.' };
  return { v: { title, department: str(b.department, 60), grade: str(b.grade, 20), salaryMin: min, salaryMax: max } };
};
exports.createPosition = async (req, res) => {
  try {
    const sid = req.user.schoolId; const x = posBody(req.body || {}); if (x.error) return res.status(400).json({ message: x.error });
    let reports = null; if (req.body.reportsToPositionId) { reports = isId(req.body.reportsToPositionId) ? await Position.findOne({ _id: req.body.reportsToPositionId, schoolId: sid }) : null; if (!reports) return res.status(404).json({ message: 'The position it reports to was not found.' }); }
    const p = await Position.create({ schoolId: sid, ...x.v, reportsToPositionId: reports?._id || null, history: [{ at: new Date(), byName: req.actorName || '', ...x.v }] });
    await audit(req, { action: 'hr.position.create', entityType: 'Position', entityId: p._id, schoolId: sid, detail: x.v }); res.status(201).json({ position: p });
  } catch (e) { fail(res, e); }
};
exports.updatePosition = async (req, res) => {
  try {
    const sid = req.user.schoolId; const p = isId(req.params.id) ? await Position.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!p) return res.status(404).json({ message: 'Position not found' });
    if (req.body.retire) { if (await Employee.countDocuments({ schoolId: sid, positionId: p._id, status: { $ne: 'Separated' } })) return res.status(422).json({ message: 'People still hold this position. Move them first.' }); p.status = 'Retired'; await p.save(); await audit(req, { action: 'hr.position.retire', entityType: 'Position', entityId: p._id, schoolId: sid }); return res.json({ position: p }); }
    const x = posBody({ ...p.toObject(), ...req.body }); if (x.error) return res.status(400).json({ message: x.error });
    Object.assign(p, x.v); p.history.push({ at: new Date(), byName: req.actorName || '', ...x.v }); await p.save();
    await audit(req, { action: 'hr.position.update', entityType: 'Position', entityId: p._id, schoolId: sid, detail: x.v }); res.json({ position: p });
  } catch (e) { fail(res, e); }
};
exports.listPositions = async (req, res) => { try { const rows = await Position.find({ schoolId: req.user.schoolId }).sort({ title: 1 }); const counts = {}; (await Employee.find({ schoolId: req.user.schoolId, status: { $ne: 'Separated' } }).select('positionId')).forEach((e) => { if (e.positionId) counts[e.positionId] = (counts[e.positionId] || 0) + 1; }); res.json({ positions: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), holders: counts[r._id] || 0 })) }); } catch (e) { fail(res, e); } };

/* ───────── employees ───────── */
const nextCode = async (sid) => { for (let i = 0; i < 6; i++) { const n = (await Employee.countDocuments({ schoolId: sid })) + 1 + i; const code = `E-${String(n).padStart(4, '0')}`; if (!(await Employee.findOne({ schoolId: sid, code }))) return code; } throw new Error('Could not assign an employee number.'); };
const checkSalary = (pos, basic) => (pos && pos.salaryMax && (basic < pos.salaryMin || basic > pos.salaryMax) ? `The salary must be within the ${pos.title} band: Rs ${pos.salaryMin.toLocaleString('en-PK')} to Rs ${pos.salaryMax.toLocaleString('en-PK')}.` : null);
const allowOk = (a) => Array.isArray(a) && a.every((x) => str(x.name).length >= 2 && Number.isInteger(Number(x.amount)) && Number(x.amount) >= 0);
exports.createEmployee = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {};
    if (str(b.name).length < 2) return res.status(400).json({ message: 'Enter the name.' }); if (!KINDS.includes(b.kind)) return res.status(400).json({ message: 'Choose what kind of staff member this is.' });
    if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    const basic = b.basicSalary === undefined ? 0 : whole(b.basicSalary); if (!(basic >= 0)) return res.status(400).json({ message: 'The basic salary must be whole rupees.' });
    if (b.allowances && !allowOk(b.allowances)) return res.status(400).json({ message: 'Each allowance needs a name and a whole-rupee amount.' });
    const join = b.joinDate ? dateOrNull(b.joinDate) : new Date(); if (join === undefined) return res.status(400).json({ message: 'Enter a valid joining date.' });
    let teacher = null; if (b.kind === 'teacher') { teacher = isId(b.teacherId) ? await Teacher.findOne({ _id: b.teacherId, schoolId: sid }) : null; if (!teacher) return res.status(400).json({ message: 'Choose the teacher account this record belongs to.' }); if (await Employee.findOne({ schoolId: sid, teacherId: teacher._id })) return res.status(409).json({ message: 'This teacher already has an employee record.' }); }
    let pos = null; if (b.positionId) { pos = isId(b.positionId) ? await Position.findOne({ _id: b.positionId, schoolId: sid, status: 'Active' }) : null; if (!pos) return res.status(404).json({ message: 'Position not found' }); const bad = checkSalary(pos, basic); if (bad) return res.status(422).json({ message: bad }); }
    let mgr = null; if (b.managerId) { mgr = isId(b.managerId) ? await Employee.findOne({ _id: b.managerId, schoolId: sid, status: { $ne: 'Separated' } }) : null; if (!mgr) return res.status(404).json({ message: 'Manager not found' }); }
    const items = [...H.CHECKLIST.base, ...(['teacher', 'counselor', 'visiting'].includes(b.kind) ? H.CHECKLIST.teacher : [])].map(([key, label]) => ({ key, label, done: false }));
    const e = await Employee.create({ schoolId: sid, code: await nextCode(sid), name: str(b.name, 80), kind: b.kind, teacherId: teacher?._id || null, positionId: pos?._id || null, department: str(b.department || pos?.department, 60), managerId: mgr?._id || null, phone: str(b.phone, 30), email: str(b.email, 100), joinDate: join, basicSalary: basic, allowances: (b.allowances || []).map((a) => ({ name: str(a.name, 40), amount: Number(a.amount), taxable: a.taxable !== false })), checklist: items });
    await audit(req, { action: 'hr.employee.create', entityType: 'Employee', entityId: e._id, schoolId: sid, detail: { code: e.code, kind: e.kind } }); res.status(201).json({ employee: e });
  } catch (e) { if (e.code === 11000) return res.status(409).json({ message: 'That employee number was taken. Please try again.' }); fail(res, e); }
};
exports.updateEmployee = async (req, res) => {
  try {
    const sid = req.user.schoolId; const e = isId(req.params.id) ? await Employee.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!e) return res.status(404).json({ message: 'Employee not found' });
    if (e.status === 'Separated') return res.status(422).json({ message: 'A separated employee cannot be edited.' }); const b = req.body || {};
    if (b.version && new Date(b.version).getTime() !== new Date(e.updatedAt).getTime()) return res.status(409).json({ message: 'Someone else changed this record. Reload and try again.' });
    if (b.name !== undefined) { if (str(b.name).length < 2) return res.status(400).json({ message: 'Enter the name.' }); e.name = str(b.name, 80); }
    if (b.phone !== undefined) e.phone = str(b.phone, 30); if (b.department !== undefined) e.department = str(b.department, 60);
    if (b.email !== undefined) { if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return res.status(400).json({ message: 'Enter a valid email address.' }); e.email = str(b.email, 100); }
    if (b.allowances !== undefined) { if (!allowOk(b.allowances)) return res.status(400).json({ message: 'Each allowance needs a name and a whole-rupee amount.' }); e.allowances = b.allowances.map((a) => ({ name: str(a.name, 40), amount: Number(a.amount), taxable: a.taxable !== false })); }
    if (b.managerId !== undefined) { if (b.managerId && String(b.managerId) === String(e._id)) return res.status(422).json({ message: 'Nobody can be their own manager.' }); if (b.managerId) { const m = isId(b.managerId) ? await Employee.findOne({ _id: b.managerId, schoolId: sid, status: { $ne: 'Separated' } }) : null; if (!m) return res.status(404).json({ message: 'Manager not found' }); } e.managerId = b.managerId || null; }
    if (b.positionId !== undefined || b.basicSalary !== undefined) {
      const posId = b.positionId !== undefined ? b.positionId : e.positionId; const basic = b.basicSalary !== undefined ? whole(b.basicSalary) : e.basicSalary; if (!(basic >= 0)) return res.status(400).json({ message: 'The basic salary must be whole rupees.' });
      let pos = null; if (posId) { pos = isId(posId) ? await Position.findOne({ _id: posId, schoolId: sid, status: 'Active' }) : null; if (!pos) return res.status(404).json({ message: 'Position not found' }); const bad = checkSalary(pos, basic); if (bad) return res.status(422).json({ message: bad }); }
      if (basic !== e.basicSalary) await audit(req, { action: 'hr.employee.salary', entityType: 'Employee', entityId: e._id, schoolId: sid, detail: { from: e.basicSalary, to: basic } });
      e.positionId = pos?._id || null; e.basicSalary = basic;
    }
    await e.save(); await audit(req, { action: 'hr.employee.update', entityType: 'Employee', entityId: e._id, schoolId: sid }); res.json({ employee: e });
  } catch (e) { fail(res, e); }
};
exports.checklistItem = async (req, res) => {
  try {
    const sid = req.user.schoolId; const e = isId(req.params.id) ? await Employee.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!e) return res.status(404).json({ message: 'Employee not found' });
    const it = e.checklist.find((x) => x.key === req.params.key); if (!it) return res.status(404).json({ message: 'Checklist item not found' });
    it.done = req.body?.done !== false; it.doneAt = it.done ? new Date() : undefined; it.doneByName = it.done ? req.actorName || '' : ''; e.markModified('checklist'); await e.save();
    await audit(req, { action: 'hr.onboarding.item', entityType: 'Employee', entityId: e._id, schoolId: sid, detail: { key: it.key, done: it.done } }); res.json({ employee: e });
  } catch (e) { fail(res, e); }
};
exports.activate = async (req, res) => {
  try {
    const sid = req.user.schoolId; const e = isId(req.params.id) ? await Employee.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!e) return res.status(404).json({ message: 'Employee not found' });
    if (e.status !== 'Onboarding') return res.status(422).json({ message: `This employee is already ${e.status.toLowerCase()}.` });
    const open = e.checklist.filter((x) => !x.done); if (open.length) return res.status(422).json({ message: `Finish the onboarding checklist first: ${open.map((x) => x.label).join('; ')}.` });
    if (!(await Contract.findOne({ schoolId: sid, employeeId: e._id, status: 'Signed' }))) return res.status(422).json({ message: 'A signed contract is needed before this person starts.' });
    e.status = 'Active'; await e.save(); await audit(req, { action: 'hr.employee.activate', entityType: 'Employee', entityId: e._id, schoolId: sid }); res.json({ employee: e });
  } catch (e) { fail(res, e); }
};
exports.listEmployees = async (req, res) => {
  try {
    const sid = req.user.schoolId; const { p, l } = pg(req.query); const q = { schoolId: sid };
    if (req.query.status) q.status = String(req.query.status); if (req.query.kind) q.kind = String(req.query.kind); if (req.query.department) q.department = String(req.query.department);
    if (req.query.search) q.name = { $regex: esc(req.query.search), $options: 'i' };
    const [rows, total] = await Promise.all([Employee.find(q).sort({ name: 1 }).skip((p - 1) * l).limit(l), Employee.countDocuments(q)]);
    res.json({ employees: rows, pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
  } catch (e) { fail(res, e); }
};
exports.getEmployee = async (req, res) => {
  try {
    const sid = req.user.schoolId; const e = isId(req.params.id) ? await Employee.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!e) return res.status(404).json({ message: 'Employee not found' });
    const [contracts, records, advances, pos, bal] = await Promise.all([Contract.find({ schoolId: sid, employeeId: e._id }).sort({ startDate: -1 }), Record.find({ schoolId: sid, employeeId: e._id }).sort({ createdAt: -1 }), StaffAdvance.find({ schoolId: sid, employeeId: e._id }).sort({ createdAt: -1 }), e.positionId ? Position.findOne({ _id: e.positionId, schoolId: sid }) : null, leaveBalances(sid, e)]);
    await audit(req, { action: 'hr.employee.read', entityType: 'Employee', entityId: e._id, schoolId: sid });
    res.json({ employee: e, position: pos, contracts: contracts.map((c) => ({ ...JSON.parse(JSON.stringify(c)), noticeBy: c.endDate ? H.addDays(new Date(c.endDate).toISOString().slice(0, 10), -c.noticeDays) : null })), records, advances, leave: bal });
  } catch (e) { fail(res, e); }
};

/* ───────── contracts ───────── */
exports.createContract = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const e = isId(b.employeeId) ? await Employee.findOne({ _id: b.employeeId, schoolId: sid }) : null; if (!e) return res.status(404).json({ message: 'Employee not found' });
    if (e.status === 'Separated') return res.status(422).json({ message: 'A separated employee cannot get a contract.' });
    if (!['permanent', 'fixed-term', 'visiting', 'vendor'].includes(b.type)) return res.status(400).json({ message: 'Choose the contract type.' });
    const start = dateOrNull(b.startDate); if (!start) return res.status(400).json({ message: 'Enter the start date.' }); const end = dateOrNull(b.endDate);
    if (end === undefined) return res.status(400).json({ message: 'Enter a valid end date.' }); if (b.type !== 'permanent' && !end) return res.status(400).json({ message: 'A fixed-term, visiting or vendor contract needs an end date.' }); if (end && end <= start) return res.status(400).json({ message: 'The end date must be after the start date.' });
    const notice = b.noticeDays === undefined ? 30 : whole(b.noticeDays); if (!(notice >= 0 && notice <= 365)) return res.status(400).json({ message: 'Notice days must be 0 to 365.' });
    const c = await Contract.create({ schoolId: sid, employeeId: e._id, type: b.type, startDate: start, endDate: end, noticeDays: notice, basicSalary: e.basicSalary, renewsId: isId(b.renewsId) ? b.renewsId : null });
    await audit(req, { action: 'hr.contract.create', entityType: 'EmployeeContract', entityId: c._id, schoolId: sid, detail: { employee: e.code, type: c.type } }); res.status(201).json({ contract: c });
  } catch (e) { fail(res, e); }
};
exports.signContract = async (req, res) => {
  try {
    const sid = req.user.schoolId; const c = isId(req.params.id) ? await Contract.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!c) return res.status(404).json({ message: 'Contract not found' });
    if (c.status !== 'Draft') return res.status(422).json({ message: `This contract is already ${c.status.toLowerCase()}.` });
    const live = await Contract.findOne({ schoolId: sid, employeeId: c.employeeId, status: 'Signed' });
    if (live && !c.renewsId) return res.status(422).json({ message: 'This person already has a signed contract. End it or renew it instead.' });
    if (live) { live.status = 'Ended'; live.endedAt = new Date(); live.endReason = 'Renewed'; await live.save(); }
    c.status = 'Signed'; c.signedAt = new Date(); c.signedByName = req.actorName || ''; await c.save();
    await audit(req, { action: 'hr.contract.sign', entityType: 'EmployeeContract', entityId: c._id, schoolId: sid }); res.json({ contract: c });
  } catch (e) { fail(res, e); }
};
exports.endContract = async (req, res) => {
  try {
    const sid = req.user.schoolId; const c = isId(req.params.id) ? await Contract.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!c) return res.status(404).json({ message: 'Contract not found' });
    if (c.status !== 'Signed') return res.status(422).json({ message: 'Only a signed contract can be ended.' }); if (str(req.body?.reason).length < 3) return res.status(400).json({ message: 'Write why the contract ends.' });
    c.status = 'Ended'; c.endedAt = new Date(); c.endReason = str(req.body.reason, 200); await c.save(); await audit(req, { action: 'hr.contract.end', entityType: 'EmployeeContract', entityId: c._id, schoolId: sid, detail: { reason: c.endReason } }); res.json({ contract: c });
  } catch (e) { fail(res, e); }
};

/* ───────── documents, training, appraisals ───────── */
exports.addRecord = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const e = isId(req.params.id) ? await Employee.findOne({ _id: req.params.id, schoolId: sid }) : null; if (!e) return res.status(404).json({ message: 'Employee not found' });
    if (!['document', 'training', 'appraisal'].includes(b.kind)) return res.status(400).json({ message: 'Choose document, training or appraisal.' }); if (str(b.title).length < 2) return res.status(400).json({ message: 'Give it a title.' });
    const issued = dateOrNull(b.issuedOn); const exp = dateOrNull(b.expiresOn); if (issued === undefined || exp === undefined) return res.status(400).json({ message: 'Enter valid dates.' }); if (issued && exp && exp <= issued) return res.status(400).json({ message: 'It must expire after it was issued.' });
    const r = { schoolId: sid, employeeId: e._id, kind: b.kind, title: str(b.title, 120), issuedOn: issued || undefined, expiresOn: exp || undefined, mandatory: !!b.mandatory };
    if (b.kind === 'appraisal') {
      const goals = (b.goals || []).map((g) => str(g?.text ?? g, 200)).filter(Boolean); if (goals.length && b.goalsConsented !== true) return res.status(422).json({ message: 'Goals are recorded only after the employee has agreed to them.' });
      const rating = b.rating === undefined ? undefined : whole(b.rating); if (rating !== undefined && !(rating >= 1 && rating <= 5)) return res.status(400).json({ message: 'The rating is 1 to 5.' });
      if (str(b.reviewerNotes).length < 5) return res.status(400).json({ message: 'A person must write the review. Add the reviewer notes.' });
      Object.assign(r, { goals: goals.map((text) => ({ text })), goalsConsented: goals.length ? true : false, rating, reviewerNotes: str(b.reviewerNotes, 1000), reviewedByName: req.actorName || '' });
    }
    const rec = await Record.create(r); await audit(req, { action: `hr.${b.kind}.add`, entityType: 'EmployeeRecord', entityId: rec._id, schoolId: sid, detail: { employee: e.code, title: rec.title } }); res.status(201).json({ record: rec });
  } catch (e) { fail(res, e); }
};
exports.respond = async (req, res) => {         // employee (or HR on their behalf) answers an appraisal
  try {
    const sid = req.user.schoolId; const r = isId(req.params.id) ? await Record.findOne({ _id: req.params.id, schoolId: sid, kind: 'appraisal' }) : null; if (!r) return res.status(404).json({ message: 'Appraisal not found' });
    if (req.user.role === 'teacher') { const me = await Employee.findOne({ schoolId: sid, teacherId: req.user.userId }); if (!me || String(me._id) !== String(r.employeeId)) return res.status(404).json({ message: 'Appraisal not found' }); }
    if (str(req.body?.response).length < 3) return res.status(400).json({ message: 'Write your response.' });
    r.employeeResponse = str(req.body.response, 1000); r.employeeRespondedAt = new Date(); await r.save(); await audit(req, { action: 'hr.appraisal.respond', entityType: 'EmployeeRecord', entityId: r._id, schoolId: sid }); res.json({ record: r });
  } catch (e) { fail(res, e); }
};
const eligibility = async (sid, employeeId) => { const bad = await Record.find({ schoolId: sid, employeeId, kind: 'training', mandatory: true, expiresOn: { $lt: new Date() } }); return { eligible: bad.length === 0, reasons: bad.map((b) => `${b.title} expired`) }; };
exports.eligibility = eligibility;
exports.expiring = async (req, res) => {
  try {
    const sid = req.user.schoolId; const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 60)); const until = new Date(Date.now() + days * 864e5);
    const recs = await Record.find({ schoolId: sid, expiresOn: { $lte: until }, kind: { $in: ['document', 'training'] } }).sort({ expiresOn: 1 }); const cons = await Contract.find({ schoolId: sid, status: 'Signed', endDate: { $ne: null, $lte: until } }).sort({ endDate: 1 });
    const names = new Map((await Employee.find({ schoolId: sid }).select('name code')).map((e) => [String(e._id), e])); const now = new Date();
    res.json({ items: [...recs.map((r) => ({ type: r.kind, title: r.title, employeeId: r.employeeId, employee: names.get(String(r.employeeId))?.name, on: r.expiresOn, expired: new Date(r.expiresOn) < now })), ...cons.map((c) => ({ type: 'contract', title: `${c.type} contract`, employeeId: c.employeeId, employee: names.get(String(c.employeeId))?.name, on: c.endDate, expired: new Date(c.endDate) < now }))].sort((a, b) => new Date(a.on) - new Date(b.on)) });
  } catch (e) { fail(res, e); }
};

exports.overview = async (req, res) => {
  try {
    const sid = req.user.schoolId; const today = H.todayStr(); const until = new Date(Date.now() + 60 * 864e5);
    const [emps, pendLeave, pendOt, pendAdv, drafts, att, expR, expC] = await Promise.all([Employee.find({ schoolId: sid }).select('status kind'), LeaveRequest.countDocuments({ schoolId: sid, status: 'Requested' }), Overtime.countDocuments({ schoolId: sid, status: 'Requested' }), StaffAdvance.countDocuments({ schoolId: sid, status: 'Requested' }), PayrollRule.countDocuments({ schoolId: sid, status: 'Draft' }), StaffAttendance.find({ schoolId: sid, date: today }).select('status'), Record.countDocuments({ schoolId: sid, kind: { $in: ['document', 'training'] }, expiresOn: { $lte: until } }), Contract.countDocuments({ schoolId: sid, status: 'Signed', endDate: { $ne: null, $lte: until } })]);
    const by = (k) => emps.reduce((o, e) => { o[e[k]] = (o[e[k]] || 0) + 1; return o; }, {});
    res.json({ headcount: { total: emps.filter((e) => e.status !== 'Separated').length, byStatus: by('status'), byKind: by('kind') }, pending: { leave: pendLeave, overtime: pendOt, advances: pendAdv, payrollRules: drafts }, expiring: expR + expC, today: att.reduce((o, a) => { o[a.status] = (o[a.status] || 0) + 1; return o; }, {}) });
  } catch (e) { fail(res, e); }
};
