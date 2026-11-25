const User = require('../models/User');
const School = require('../models/School');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Parent = require('../models/Parent');
const SuperAdmin = require('../models/SuperAdmin');
const mongoose = require('../lib/pgdoc');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');

// Password Validation Helper: 6+ chars, 1 capital, 1 number, 1 special character
const validatePasswordStrength = (password) => {
  const minLength = password.length >= 6;
  const hasCapital = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);
  return minLength && hasCapital && hasNumber && hasSpecial;
};


// Helper to resolve the correct Mongoose model by role
const getUserModelByRole = (role) => {
  if (role === 'admin') return User;
  if (role === 'teacher') return Teacher;
  if (role === 'student') return Student;
  if (role === 'parent') return Parent;
  if (role === 'superadmin') return SuperAdmin;
  if (role === 'agent') return require('../models/Agent');
  if (role === 'director') return require('../models/Director');
  return User;
};

// Helper to find a user by ID and role, with a fallback lookup if role is missing
const findUserByIdAndRole = async (id, role) => {
  if (role) {
    const Model = getUserModelByRole(role);
    const user = await Model.findById(id);
    if (user) return user;
  }
  let user = await User.findById(id);
  if (!user) user = await Teacher.findById(id);
  if (!user) user = await Student.findById(id);
  if (!user) user = await Parent.findById(id);
  if (!user) user = await SuperAdmin.findById(id);
  if (!user) user = await require('../models/Agent').findById(id);
  return user;
};

// Register User
exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      role,
      schoolId,
      schoolCode,
      schoolName,
      rollNumber,
      registrationNumber,
      classId,
      division,
      employeeId,
      qualification,
      experience,
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required' });
    }

    if (role !== 'admin') {
      return res.status(403).json({ message: 'Self-registration is only allowed for Admin/School accounts. Student and Teacher accounts must be created by the Administrator.' });
    }

    let resolvedSchoolId = schoolId;
    let school;

    if (role === 'admin') {
      if (!schoolName || !schoolCode) {
        return res.status(400).json({ message: 'School name and school code are required for admin registration' });
      }

      school = await School.findOne({ code: schoolCode });
      if (school) {
        return res.status(400).json({ message: 'School with this code already exists' });
      }
    } else {
      if (!schoolCode) {
        return res.status(400).json({ message: 'School code is required for teacher and student registration' });
      }

      school = await School.findOne({ code: schoolCode });
      if (!school) {
        return res.status(404).json({ message: 'School not found' });
      }

      resolvedSchoolId = school._id;
    }

    // Check if user exists in the appropriate collection
    let user = null;
    if (role === 'admin') {
      user = await User.findOne({ email });
    } else if (role === 'teacher') {
      user = await Teacher.findOne({ email, schoolId: resolvedSchoolId });
    } else if (role === 'student') {
      user = await Student.findOne({ email, schoolId: resolvedSchoolId });
    }

    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate password strength
    if (!validatePasswordStrength(password)) {
      return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user based on role
    if (role === 'student') {
      user = await Student.create({
        name,
        email,
        password: hashedPassword,
        phone,
        role: 'student',
        schoolId: resolvedSchoolId,
      });
    } else if (role === 'teacher') {
      user = await Teacher.create({
        name,
        email,
        password: hashedPassword,
        phone,
        role: 'teacher',
        schoolId: resolvedSchoolId,
      });
    } else {
      const adminId = new mongoose.Types.ObjectId();
      const schoolIdObject = new mongoose.Types.ObjectId();

      user = await User.create({
        _id: adminId,
        name,
        email,
        password: hashedPassword,
        phone,
        role: 'admin',
        schoolId: schoolIdObject,
      });

      school = await School.create({
        _id: schoolIdObject,
        name: schoolName,
        code: schoolCode,
        adminId,
        email,
        phone,
        address: req.body.address,
        principalName: req.body.adminName || name,
        principalEmail: email,
        isActive: true,
      });

      user.schoolId = school._id;
      await user.save();
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.schoolId, user.role);
    const refreshToken = generateRefreshToken(user._id, user.schoolId, user.role);

    // Save refresh token
    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    // Remove password from response
    user.password = undefined;

    res.status(201).json({
      message: 'User registered successfully',
      user,
      school,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Login User
// A school can be used for sign-in when it is active and its subscription has not lapsed.
const schoolBlock = (school) => {
  if (!school.isActive) return { status: 423, message: school.suspendedReason || 'This school account has been suspended. Please contact support.' };
  if (school.subscriptionExpiresAt && school.subscriptionExpiresAt < new Date()) return { status: 423, message: 'This school subscription has expired. Please contact the platform owner to renew.' };
  return null;
};

// Every school-scoped account (admin, teacher, student, parent) that uses this e-mail.
const accountsByEmail = async (email, { schoolId = null, withPassword = false } = {}) => {
  const scope = schoolId ? { schoolId } : {};
  const pw = (q) => (withPassword ? q.select('+password') : q);
  const [admins, teachers, students, parents] = await Promise.all([
    pw(User.find({ email, role: 'admin', ...scope })),
    pw(Teacher.find({ email, ...scope })),
    pw(Student.find({ email, ...scope })),
    pw(Parent.find({ email, ...scope })),
  ]);
  return [...admins, ...teachers, ...students, ...parents].slice(0, 25);
};

// Accounts that may be opened right now (person active, school active and paid up), described for the picker.
const describeAccounts = async (accounts) => {
  const ids = [...new Set(accounts.map((a) => String(a.schoolId)))];
  const schools = await School.find({ _id: { $in: ids } }).select('name code isActive suspendedReason subscriptionExpiresAt organizationId');
  const byId = new Map(schools.map((sc) => [String(sc._id), sc]));
  return accounts
    .filter((a) => a.isActive !== false && byId.has(String(a.schoolId)) && !schoolBlock(byId.get(String(a.schoolId))))
    .map((a) => ({ id: String(a._id), role: a.role, name: a.name, schoolId: String(a.schoolId), schoolName: byId.get(String(a.schoolId)).name }));
};

// Signs the person in: tokens, last-login stamp and the response the app expects.
const startSession = async (res, user) => {
  const accessToken = generateAccessToken(user._id, user.schoolId, user.role);
  const refreshToken = generateRefreshToken(user._id, user.schoolId, user.role);
  user.refreshTokens.push({ token: refreshToken });
  user.lastLogin = new Date();
  await user.save();
  user.password = undefined;
  const schoolData = await School.findById(user.schoolId).populate('adminId', 'name email phone');
  res.json({ message: 'Login successful', user, school: schoolData, accessToken, refreshToken });
};

// Sign in with e-mail and password. The school code is optional: without it the person is found by e-mail in every school.
// When the same e-mail belongs to several accounts (for example a teacher who is also a parent) the reply lists them
// and the app asks which one to open; it then repeats the request with `pick`.
exports.login = async (req, res) => {
  try {
    const { email, password, schoolCode, pick } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    let school = null;
    if (schoolCode && String(schoolCode).trim()) {
      const cleanCode = String(schoolCode).trim();
      school = (await School.findOne({ code: cleanCode })) ||
        (await School.findOne({ code: cleanCode }).collation({ locale: 'en', strength: 2 }));
      if (!school) return res.status(404).json({ message: 'School does not exist' });
      const blocked = schoolBlock(school);
      if (blocked) return res.status(blocked.status).json({ message: blocked.message });
    }

    const found = await accountsByEmail(normalizedEmail, { schoolId: school ? school._id : null, withPassword: true });
    const matched = [];
    for (const c of found) {
      if (c.password && await comparePassword(password, c.password)) matched.push(c);
    }
    const usable = new Set((await describeAccounts(matched)).map((d) => d.id));
    const options = matched.filter((c) => usable.has(String(c._id)));

    if (!options.length) {
      // A right password on a suspended or expired school, or a deactivated account, says so rather than "invalid".
      if (matched.length) {
        const first = await School.findById(matched[0].schoolId);
        const blocked = first && schoolBlock(first);
        if (blocked) return res.status(blocked.status).json({ message: blocked.message });
        return res.status(403).json({ message: 'This account has been deactivated. Please contact your school administrator.' });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    let user = options[0];
    if (options.length > 1) {
      if (pick && pick.id && pick.role) {
        user = options.find((c) => String(c._id) === String(pick.id) && c.role === pick.role);
        if (!user) return res.status(400).json({ message: 'That account is not available. Please sign in again.' });
      } else {
        return res.json({ requiresChoice: true, message: 'Choose which account to open', accounts: await describeAccounts(options) });
      }
    }

    await startSession(res, user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Accounts the signed-in person can switch to without signing in again: same e-mail and the same school,
// or another school in the same organization (linked schools).
const switchTargets = async (current) => {
  const email = String(current.email || '').toLowerCase().trim();
  if (!email) return [];
  const mine = await School.findById(current.schoolId).select('organizationId');
  const all = await accountsByEmail(email);
  const sameOrg = mine && mine.organizationId
    ? new Set((await School.find({ organizationId: mine.organizationId }).select('_id')).map((x) => String(x._id)))
    : new Set();
  return all.filter((a) => String(a.schoolId) === String(current.schoolId) || sameOrg.has(String(a.schoolId)));
};

exports.myAccounts = async (req, res) => {
  try {
    const current = await findUserByIdAndRole(req.user.userId, req.user.role);
    if (!current) return res.status(404).json({ message: 'User not found' });
    res.json({ current: { id: String(current._id), role: current.role }, accounts: await describeAccounts(await switchTargets(current)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.switchAccount = async (req, res) => {
  try {
    const { id, role } = req.body || {};
    if (!id || !role) return res.status(400).json({ message: 'Choose an account to switch to' });
    const current = await findUserByIdAndRole(req.user.userId, req.user.role);
    if (!current) return res.status(404).json({ message: 'User not found' });
    const target = (await switchTargets(current)).find((a) => String(a._id) === String(id) && a.role === role);
    if (!target) return res.status(403).json({ message: 'You cannot switch to that account' });
    if ((await describeAccounts([target])).length === 0) return res.status(403).json({ message: 'That account is not available right now' });
    await startSession(res, target);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
    if (!decoded) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const user = await findUserByIdAndRole(decoded.userId, decoded.role);
    if (!user || !user.refreshTokens.find(t => t.token === refreshToken)) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(user._id, user.schoolId, user.role);
    const newRefreshToken = generateRefreshToken(user._id, user.schoolId, user.role);

    user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
    user.refreshTokens.push({ token: newRefreshToken });
    await user.save();

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Logout
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const user = await findUserByIdAndRole(req.user.userId, req.user.role);

    if (refreshToken && user) {
      user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
      await user.save();
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get User Profile
exports.getProfile = async (req, res) => {
  try {
    const Model = getUserModelByRole(req.user.role);
    let query = Model.findById(req.user.userId);
    if (req.user.role !== 'superadmin' && req.user.role !== 'agent' && req.user.role !== 'director') query = query.populate('schoolId');

    if (req.user.role === 'parent') {
      query = query.populate({
        path: 'children',
        select: 'name rollNumber classId photo studentId',
        populate: { path: 'classId', select: 'standard division' },
      });
    } else if (req.user.role === 'student') {
      query = query.populate('classId').populate('subjectsEnrolled');
    } else if (req.user.role === 'teacher') {
      query = query
        .populate('classTeacherOf')
        .populate('subjectIds')
        .populate({
          path: 'subjectClassAssignments.subjectId',
          select: 'name code standard'
        })
        .populate({
          path: 'subjectClassAssignments.classId',
          select: 'standard division'
        });
    }

    const user = await query.select('-password -refreshTokens');

    res.json({
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    const Model = getUserModelByRole(req.user.role);

    const user = await Model.findByIdAndUpdate(
      req.user.userId,
      { name, phone, avatar },
      { new: true, runValidators: true }
    ).select('-password -refreshTokens');

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const Model = getUserModelByRole(req.user.role);

    const user = await Model.findById(req.user.userId).select('+password');

    const isPasswordValid = await comparePassword(oldPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Old password is incorrect' });
    }

    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    }

    user.password = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Forgot Password - Send OTP Code
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user across collections
    let user = await User.findOne({ email });
    if (!user) user = await Teacher.findOne({ email });
    if (!user) user = await Student.findOne({ email });
    if (!user) user = await Parent.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User doesn't exist" });
    }

    // Generate unique 5-char code containing letters, numbers, and special characters
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const specials = '!@#$%&*';
    
    // Guarantee at least one of each class
    const codeArray = [
      letters.charAt(Math.floor(Math.random() * letters.length)),
      numbers.charAt(Math.floor(Math.random() * numbers.length)),
      specials.charAt(Math.floor(Math.random() * specials.length))
    ];
    
    // Fill the remaining 2 characters
    const pool = letters + numbers + specials;
    for (let i = 0; i < 2; i++) {
      codeArray.push(pool.charAt(Math.floor(Math.random() * pool.length)));
    }
    
    // Shuffle the array to randomize positions
    for (let i = codeArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [codeArray[i], codeArray[j]] = [codeArray[j], codeArray[i]];
    }
    
    const code = codeArray.join('');

    // Code valid for 1 minute
    user.passwordResetToken = code;
    user.passwordResetExpires = new Date(Date.now() + 60 * 1000); // 1 minute
    await user.save();

    // Send reset email via SMTP (or fallback log)
    const { sendResetEmail } = require('../utils/email');
    await sendResetEmail(email, code);

    res.json({ message: 'A 5-letter verification code has been sent to your email.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Verify Reset Code
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    let user = await User.findOne({ email });
    if (!user) user = await Teacher.findOne({ email });
    if (!user) user = await Student.findOne({ email });
    if (!user) user = await Parent.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User doesn't exist" });
    }

    if (!user.passwordResetToken || user.passwordResetToken !== code || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      return res.status(400).json({ message: 'wrong code' });
    }

    res.json({ message: 'Code verified successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code, and new password are required' });
    }

    let user = await User.findOne({ email });
    if (!user) user = await Teacher.findOne({ email });
    if (!user) user = await Student.findOne({ email });
    if (!user) user = await Parent.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User doesn't exist" });
    }

    // Verify code again to prevent direct route hit
    if (!user.passwordResetToken || user.passwordResetToken !== code || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      return res.status(400).json({ message: 'wrong code' });
    }

    // Validate new password strength
    if (!validatePasswordStrength(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 6 characters, contain 1 capital letter, 1 number, and 1 special character' });
    }

    // Update password
    user.password = await hashPassword(newPassword);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
