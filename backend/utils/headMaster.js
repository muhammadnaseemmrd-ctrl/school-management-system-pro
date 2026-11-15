const Class = require('../models/Class');
const Teacher = require('../models/Teacher');

// One head master per class, and a teacher heads at most one class.
// Passing teacherId = null removes the head master of that class.
// Returns { replaced } with the previous head master's name when someone was replaced.
const setHeadMaster = async (schoolId, classId, teacherId) => {
  const cls = await Class.findOne({ _id: classId, schoolId });
  if (!cls) throw Object.assign(new Error('Class not found'), { status: 404 });

  let replaced = null;
  const previousId = cls.classTeacherId ? String(cls.classTeacherId) : null;

  if (!teacherId) {
    await Class.updateOne({ _id: cls._id }, { $unset: { classTeacherId: 1 } });
    if (previousId) await Teacher.updateOne({ _id: previousId, schoolId }, { $set: { isClassTeacher: false }, $unset: { classTeacherOf: 1 } });
    return { replaced: null };
  }

  const teacher = await Teacher.findOne({ _id: teacherId, schoolId });
  if (!teacher) throw Object.assign(new Error('Teacher not found'), { status: 404 });

  if (previousId && previousId !== String(teacher._id)) {
    const prev = await Teacher.findOne({ _id: previousId, schoolId }).select('name');
    replaced = prev ? prev.name : null;
    await Teacher.updateOne({ _id: previousId, schoolId }, { $set: { isClassTeacher: false }, $unset: { classTeacherOf: 1 } });
  }
  // the teacher can head only one class: release the old one
  if (teacher.classTeacherOf && String(teacher.classTeacherOf) !== String(cls._id)) {
    await Class.updateOne({ _id: teacher.classTeacherOf, schoolId, classTeacherId: teacher._id }, { $unset: { classTeacherId: 1 } });
  }
  await Class.updateOne({ _id: cls._id }, { $set: { classTeacherId: teacher._id } });
  await Teacher.updateOne({ _id: teacher._id }, { $set: { isClassTeacher: true, classTeacherOf: cls._id } });
  return { replaced };
};

module.exports = { setHeadMaster };
