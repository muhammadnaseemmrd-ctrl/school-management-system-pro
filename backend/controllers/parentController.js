const mongoose = require('../lib/pgdoc');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const DailyAttendance = require('../models/DailyAttendance');
const { LOW_ATTENDANCE_THRESHOLD, tallyDaily, buildDailyReport } = require('../utils/attendanceReport');
const School = require('../models/School');
const { nowInTz } = require('../utils/time');
const { hashPassword, validatePasswordStrength } = require('../utils/password');

const PWD_MSG = 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character';
const isId = (v) => mongoose.Types.ObjectId.isValid(v);

/* ─────────────── helpers ─────────────── */
const dayKey = (d) => new Date(d).toISOString().split('T')[0];

// School-local "today" (honours the school's time zone, not the server's)
const schoolToday = async (schoolId) => {
  const school = await School.findById(schoolId).select('timezone');
  return nowInTz(school?.timezone || process.env.DEFAULT_TIMEZONE || 'UTC');
};

const parseRange = (startDate, endDate, base = new Date()) => {
  const end = endDate ? new Date(endDate) : new Date(base);
  end.setUTCHours(23, 59, 59, 999);
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - 29 * 24 * 3600 * 1000);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
};

const childCard = (s) => ({
  _id: s._id,
  name: s.name,
  rollNumber: s.rollNumber || '',
  studentId: s.studentId || '',
  photo: s.photo || null,
  class: s.classId ? { _id: s.classId._id, standard: s.classId.standard, division: s.classId.division } : null,
});

// Loads the logged-in parent and verifies the requested child is linked to them
const getParent = async (req) => Parent.findOne({ _id: req.user.userId, schoolId: req.user.schoolId, isActive: true });

/* ═══════════════ ADMIN: manage parents ═══════════════ */
exports.adminList = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const query = { schoolId: req.user.schoolId };
    if (search) {
      const rx = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const lim = Math.min(parseInt(limit) || 50, 200);
    const parents = await Parent.find(query)
      .populate({ path: 'children', select: 'name rollNumber classId', populate: { path: 'classId', select: 'standard division' } })
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * lim)
      .limit(lim);
    const total = await Parent.countDocuments(query);
    res.json({ parents, pagination: { total, pages: Math.ceil(total / lim), currentPage: parseInt(page) } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const validateChildren = async (schoolId, childIds) => {
  const ids = [...new Set((childIds || []).map(String))];
  if (ids.some((i) => !isId(i))) return { error: 'Invalid student id supplied' };
  const count = await Student.countDocuments({ _id: { $in: ids }, schoolId });
  if (count !== ids.length) return { error: 'One or more students do not belong to this school' };
  return { ids };
};

exports.adminCreate = async (req, res) => {
  try {
    const { name, email, password, phone, relationship = 'Guardian', childIds = [] } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    if (!validatePasswordStrength(password)) return res.status(400).json({ message: PWD_MSG });

    const v = await validateChildren(req.user.schoolId, childIds);
    if (v.error) return res.status(400).json({ message: v.error });

    const exists = await Parent.findOne({ email: String(email).toLowerCase().trim(), schoolId: req.user.schoolId });
    if (exists) return res.status(400).json({ message: 'A parent with this email already exists' });

    const parent = await Parent.create({
      schoolId: req.user.schoolId, name, email, phone, relationship,
      password: await hashPassword(password), children: v.ids,
    });
    const populated = await Parent.findById(parent._id).populate({ path: 'children', select: 'name rollNumber classId', populate: { path: 'classId', select: 'standard division' } });
    res.status(201).json({ message: 'Parent account created', parent: populated });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'A parent with this email already exists' });
    res.status(500).json({ message: e.message });
  }
};

exports.adminUpdate = async (req, res) => {
  try {
    const parent = await Parent.findOne({ _id: req.params.id, schoolId: req.user.schoolId }).select('+password');
    if (!parent) return res.status(404).json({ message: 'Parent not found' });

    const { name, phone, relationship, isActive, childIds, newPassword } = req.body;
    if (name !== undefined) parent.name = name;
    if (phone !== undefined) parent.phone = phone;
    if (relationship !== undefined) parent.relationship = relationship;
    if (isActive !== undefined) parent.isActive = !!isActive;
    if (childIds !== undefined) {
      const v = await validateChildren(req.user.schoolId, childIds);
      if (v.error) return res.status(400).json({ message: v.error });
      parent.children = v.ids;
    }
    if (newPassword) {
      if (!validatePasswordStrength(newPassword)) return res.status(400).json({ message: PWD_MSG });
      parent.password = await hashPassword(newPassword);
      parent.refreshTokens = [];
      parent.passwordChangedAt = new Date();
    }
    await parent.save();
    const populated = await Parent.findById(parent._id).populate({ path: 'children', select: 'name rollNumber classId', populate: { path: 'classId', select: 'standard division' } });
    res.json({ message: 'Parent updated', parent: populated });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.adminDelete = async (req, res) => {
  try {
    const r = await Parent.findOneAndDelete({ _id: req.params.id, schoolId: req.user.schoolId });
    if (!r) return res.status(404).json({ message: 'Parent not found' });
    res.json({ message: 'Parent deleted' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/* ═══════════════ PARENT PORTAL ═══════════════ */

// All linked children with attendance summary + today's status
exports.getMyChildren = async (req, res) => {
  try {
    const parent = await getParent(req);
    if (!parent) return res.status(404).json({ message: 'Parent account not found or deactivated' });

    const students = await Student.find({ _id: { $in: parent.children }, schoolId: req.user.schoolId })
      .populate('classId', 'standard division')
      .select('name rollNumber studentId photo classId');

    const sn = await schoolToday(req.user.schoolId);
    const { start } = parseRange(undefined, undefined, sn.dateUTC);

    const children = await Promise.all(students.map(async (s) => {
      const records = await DailyAttendance.find({ schoolId: req.user.schoolId, studentId: s._id }).select('status date leftAt remarks');
      const overall = tallyDaily(records);
      const last30 = tallyDaily(records.filter((r) => r.date >= start));
      const byDay = new Map(records.map((r) => [dayKey(r.date), r]));
      const todayRec = byDay.get(sn.dateKey);

      // last 7 calendar days mini-strip
      const strip = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(sn.dateUTC); d.setUTCDate(d.getUTCDate() - i);
        const k = dayKey(d);
        const r = byDay.get(k);
        strip.push({ date: k, status: r ? r.status : 'None', leftAt: r?.leftAt || null });
      }

      return {
        ...childCard(s),
        overall,
        last30,
        lowAttendance: overall.total > 0 && overall.percentage < LOW_ATTENDANCE_THRESHOLD,
        today: { status: todayRec ? todayRec.status : 'None', leftAt: todayRec?.leftAt || null, remarks: todayRec?.remarks || '' },
        strip,
      };
    }));

    res.json({ parent: { _id: parent._id, name: parent.name, email: parent.email, phone: parent.phone, relationship: parent.relationship }, children, threshold: LOW_ATTENDANCE_THRESHOLD, today: sn.dateKey });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Detailed attendance of one child (date-range filterable)
exports.getChildAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!isId(studentId)) return res.status(400).json({ message: 'Invalid student id' });

    const parent = await getParent(req);
    if (!parent) return res.status(404).json({ message: 'Parent account not found or deactivated' });
    if (!parent.children.map(String).includes(studentId)) {
      return res.status(403).json({ message: 'You can only view attendance of your own children' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId: req.user.schoolId })
      .populate('classId', 'standard division').select('name rollNumber studentId photo classId');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const sn = await schoolToday(req.user.schoolId);
    const { start, end } = parseRange(req.query.startDate, req.query.endDate, sn.dateUTC);
    const records = await DailyAttendance.find({
      schoolId: req.user.schoolId, studentId: student._id, date: { $gte: start, $lte: end },
    }).sort({ date: -1 });

    res.json({
      student: childCard(student),
      range: { startDate: dayKey(start), endDate: dayKey(end) },
      ...buildDailyReport(records),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports._internals = { tallyDaily, buildDailyReport };
