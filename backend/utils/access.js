// Per-student access control shared by every "by student id" endpoint.
//  admin           : any student of their own school, or only those of their campuses for a campus admin (E01)
//  teacher         : any student of their own school (queries are school-scoped)
//  student         : only themselves
//  parent          : only children they are linked to today, and only for the rights they hold (see guardianRights)
const canAccessStudent = async (user, studentId, right = 'viewInfo') => {
  if (!user || !studentId) return false;
  if (user.role === 'teacher') return true;
  if (user.role === 'admin') return require('./campus').canAccessStudentRecord(user, studentId);   // school-wide admins: true; campus admins: only their campuses (E01)
  if (user.role === 'student') return String(user.userId) === String(studentId);
  if (user.role === 'parent') {
    // effective-dated guardian rights and restrictions decide, not just the old children list (PRD E05)
    const r = await require('./guardianRights').resolve(user.schoolId, user.userId, studentId);
    return r.linked && r.rights[right] === true;
  }
  return false;
};

module.exports = { canAccessStudent };
