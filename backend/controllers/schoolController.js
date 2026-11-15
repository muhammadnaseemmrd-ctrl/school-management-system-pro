const School = require('../models/School');
const User = require('../models/User');
const mongoose = require('mongoose');
const { hashPassword, validatePasswordStrength } = require('../utils/password');

// Public self-service school sign-up (always starts on the Free plan).
// Platform owners create schools on any plan via /api/superadmin/schools.
exports.createSchool = async (req, res) => {
  try {
    const { name, email, phone, address, principalName, principalEmail, adminName, adminEmail, adminPassword } = req.body;
    const code = String(req.body.code || '').trim().toUpperCase();

    if (!name || !code || !email || !phone || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({ message: 'School name, code, email, phone, admin name, admin email and password are required' });
    }
    if (!validatePasswordStrength(adminPassword)) {
      return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    }

    // Check if school exists
    const schoolExists = await School.findOne({ code });
    if (schoolExists) {
      return res.status(400).json({ message: 'School with this code already exists' });
    }
    if (await School.findOne({ email: String(email).toLowerCase() })) {
      return res.status(400).json({ message: 'A school with this email already exists' });
    }

    const adminId = new mongoose.Types.ObjectId();
    const schoolId = new mongoose.Types.ObjectId();
    const hashedPassword = await hashPassword(adminPassword);

    const school = await School.create({
      _id: schoolId,
      name,
      code,
      adminId,
      email,
      phone,
      address,
      principalName,
      principalEmail,
      isActive: true,
      plan: 'free',
      studentLimit: 100,
      teacherLimit: 10,
      createdVia: 'self-signup',
    });

    const admin = await User.create({
      _id: adminId,
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      phone,
      role: 'admin',
      schoolId: school._id,
    });

    res.status(201).json({
      message: 'School created successfully',
      school,
      admin: {
        id: admin._id,
        email: admin.email,
        name: admin.name,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get All Schools (Super Admin Only)
exports.getAllSchools = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;

    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const schools = await School.find(query)
      .populate('adminId', 'name email')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await School.countDocuments(query);

    res.json({
      schools,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get School by ID
exports.getSchoolById = async (req, res) => {
  try {
    if (req.params.id !== req.user.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const school = await School.findById(req.params.id)
      .populate('adminId', 'name email phone');

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    res.json({ school });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get My School (For Admin)
exports.getMySchool = async (req, res) => {
  try {
    const school = await School.findById(req.user.schoolId)
      .populate('adminId', 'name email phone');

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    res.json({ school });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update School
exports.updateSchool = async (req, res) => {
  try {
    if (req.params.id !== req.user.schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Admins may only edit profile fields – never plan, limits, status or ownership
    const allowed = ['name', 'phone', 'address', 'logo', 'website', 'principalName', 'principalEmail'];
    const patch = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });

    const school = await School.findByIdAndUpdate(
      req.params.id,
      patch,
      { new: true, runValidators: true }
    ).populate('adminId', 'name email');

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    res.json({
      message: 'School updated successfully',
      school,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get School Statistics
exports.getSchoolStats = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;

    const Student = require('../models/Student');
    const Teacher = require('../models/Teacher');
    const Class = require('../models/Class');
    const Subject = require('../models/Subject');
    const Attendance = require('../models/Attendance');
    const Complaint = require('../models/Complaint');

    const totalStudents = await Student.countDocuments({ schoolId });
    const totalTeachers = await Teacher.countDocuments({ schoolId });
    const totalClasses = await Class.countDocuments({ schoolId });
    const totalSubjects = await Subject.countDocuments({ schoolId });
    const totalAttendance = await Attendance.countDocuments({ schoolId });
    const pendingComplaints = await Complaint.countDocuments({
      schoolId,
      status: 'Pending',
    });

    // Today's attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayAttendance = await Attendance.countDocuments({
      schoolId,
      date: { $gte: today },
    });

    res.json({
      stats: {
        totalStudents,
        totalTeachers,
        totalClasses,
        totalSubjects,
        totalAttendance,
        pendingComplaints,
        todayAttendance,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
