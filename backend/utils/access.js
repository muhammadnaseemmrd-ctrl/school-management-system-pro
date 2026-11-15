// Per-student access control shared by every "by student id" endpoint.
//  admin / teacher : any student of their own school (queries are school-scoped)
//  student         : only themselves
//  parent          : only children linked to their account
const canAccessStudent = async (user, studentId) => {
  if (!user || !studentId) return false;
  if (user.role === 'admin' || user.role === 'teacher') return true;
  if (user.role === 'student') return String(user.userId) === String(studentId);
  if (user.role === 'parent') {
    const Parent = require('../models/Parent');
    const p = await Parent.findOne({ _id: user.userId, schoolId: user.schoolId, isActive: true, children: studentId }).select('_id');
    return !!p;
  }
  return false;
};

module.exports = { canAccessStudent };
