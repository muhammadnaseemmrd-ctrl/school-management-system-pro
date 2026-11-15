/**
 * Demo data seeder – creates a fully populated demo school so every role
 * (Super Admin, School Admin, Teacher, Student, Parent) can be tried at once.
 *
 *   node scripts/seedDemo.js            -> create DEMO01 if missing
 *   node scripts/seedDemo.js --reset    -> wipe DEMO01 and rebuild it
 */
require('dotenv').config();
const mongoose = require('mongoose');
const School = require('../models/School');
const User = require('../models/User');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Timetable = require('../models/Timetable');
const TimetableConfig = require('../models/TimetableConfig');
const DailyAttendance = require('../models/DailyAttendance');
const Notice = require('../models/Notice');
const { hashPassword } = require('../utils/password');

const CODE = 'DEMO01';
const PASSWORDS = { admin: 'Demo@1234', teacher: 'Teacher@123', student: 'Student@123', parent: 'Parent@123' };

// deterministic PRNG so the demo looks identical every time
let seed = 20261115;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

const STUDENTS = [
  // [name, std, roll, attendanceRate, fatherName, motherName]
  ['Ayesha Khan', '8', '01', 0.97, 'Imran Khan', 'Sadia Khan'],
  ['Bilal Ahmed', '8', '02', 0.91, 'Waqar Ahmed', 'Nazia Ahmed'],
  ['Hira Malik', '8', '03', 0.84, 'Tariq Malik', 'Rubina Malik'],
  ['Usman Ali', '8', '04', 0.68, 'Shahid Ali', 'Farzana Ali'],
  ['Zainab Noor', '8', '05', 0.95, 'Noor Muhammad', 'Amna Noor'],
  ['Hamza Raza', '8', '06', 0.88, 'Raza Hussain', 'Kausar Raza'],
  ['Fatima Sheikh', '9', '01', 0.98, 'Adnan Sheikh', 'Mehwish Sheikh'],
  ['Ali Hassan', '9', '02', 0.9, 'Hassan Raza', 'Saima Hassan'],
  ['Maryam Iqbal', '9', '03', 0.93, 'Iqbal Hussain', 'Shazia Iqbal'],
  ['Omar Farooq', '9', '04', 0.79, 'Farooq Ahmed', 'Nasreen Farooq'],
  ['Sana Javed', '9', '05', 0.86, 'Javed Iqbal', 'Rabia Javed'],
  ['Daniyal Khan', '9', '06', 0.72, 'Imran Khan', 'Sadia Khan'],
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const reset = process.argv.includes('--reset');

  let existing = await School.findOne({ code: CODE });
  if (existing && !reset) {
    console.log(`Demo school ${CODE} already exists. Use --reset to rebuild it.`);
    return;
  }
  if (existing) {
    for (const name of mongoose.modelNames()) {
      const M = mongoose.model(name);
      if (name !== 'School' && M.schema.path('schoolId')) await M.deleteMany({ schoolId: existing._id });
    }
    await School.deleteOne({ _id: existing._id });
  }

  const schoolId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const hash = {};
  for (const k of Object.keys(PASSWORDS)) hash[k] = await hashPassword(PASSWORDS[k]);

  await School.create({
    _id: schoolId, name: 'Demo Public School', code: CODE, adminId, email: 'info@demo.school',
    phone: '+92-300-0000000', address: { street: '12 Education Road', city: 'Islamabad', state: 'ICT', country: 'Pakistan' },
    principalName: 'Dr. Demo Principal', principalEmail: 'admin@demo.school', isActive: true,
    plan: 'standard', studentLimit: 500, teacherLimit: 50, createdVia: 'seed', timezone: 'Asia/Karachi',
  });
  await User.create({ _id: adminId, schoolId, name: 'Demo Admin', email: 'admin@demo.school', password: hash.admin, phone: '+92-300-1111111', role: 'admin' });

  // Classes
  const classes = {};
  for (const std of ['8', '9']) {
    classes[std] = await Class.create({ schoolId, standard: std, division: 'A', capacity: 40, room: `Room ${std}0${1}`, academicYear: '2026-2027' });
  }

  // Subjects
  const subjDefs = [['Mathematics', 'MATH'], ['English', 'ENG'], ['Science', 'SCI'], ['Computer Science', 'CS'], ['Social Studies', 'SST']];
  const subjects = [];
  for (const [name, code] of subjDefs) {
    subjects.push(await Subject.create({
      schoolId, name, code, defaultWeeklyLectures: 5,
      lecturesPerStandard: ['8', '9'].map((standard) => ({ standard, weeklyLectures: 5, lectureDuration: '45', totalPortionLectures: 120, weightage: 1 })),
    }));
  }

  // Teachers (one per subject; first is class teacher of 8-A, second of 9-A)
  const tNames = [['Sara Khan', 'sara.khan'], ['Imran Siddiqui', 'imran.siddiqui'], ['Nadia Aslam', 'nadia.aslam'], ['Kamran Butt', 'kamran.butt'], ['Rabia Zafar', 'rabia.zafar']];
  const teachers = [];
  for (let i = 0; i < subjects.length; i++) {
    const isCT = i < 2;
    const ctClass = i === 0 ? classes['8']._id : classes['9']._id;
    const t = await Teacher.create({
      schoolId, schoolCode: CODE, schoolName: 'Demo Public School', name: tNames[i][0], email: `${tNames[i][1]}@demo.school`,
      password: hash.teacher, phone: `+92-301-00000${i}0`, subjectIds: [subjects[i]._id], classIds: [classes['8']._id, classes['9']._id],
      subjectClassAssignments: [
        { subjectId: subjects[i]._id, classId: classes['8']._id },
        { subjectId: subjects[i]._id, classId: classes['9']._id },
      ],
      isClassTeacher: isCT, classTeacherOf: isCT ? ctClass : undefined, designation: 'Teacher',
    });
    teachers.push(t);
    await Subject.updateOne({ _id: subjects[i]._id }, { $set: { assignedTeachers: [t._id] } });
  }
  await Class.updateOne({ _id: classes['8']._id }, { classTeacherId: teachers[0]._id });
  await Class.updateOne({ _id: classes['9']._id }, { classTeacherId: teachers[1]._id });

  // Students
  const students = [];
  for (const [name, std, roll, rate, father, mother] of STUDENTS) {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
    const s = await Student.create({
      schoolId, schoolCode: CODE, schoolName: 'Demo Public School', name, email: `${slug}@demo.school`, password: hash.student,
      rollNumber: roll, classId: classes[std]._id, division: 'A', academicYear: '2026-2027', gender: ['Ayesha Khan','Hira Malik','Zainab Noor','Fatima Sheikh','Maryam Iqbal','Sana Javed'].includes(name) ? 'Female' : 'Male',
      father: { name: father, mobileNumber: '+92-302-1000000', email: `${father.toLowerCase().replace(/[^a-z]+/g, '.')}@demo.school` },
      mother: { name: mother, mobileNumber: '+92-302-2000000' },
      country: 'Pakistan', nationality: 'Pakistani',
    });
    s._rate = rate;
    students.push(s);
  }
  for (const std of ['8', '9']) {
    await Class.updateOne({ _id: classes[std]._id }, { studentCount: students.filter((s) => String(s.classId) === String(classes[std]._id)).length });
  }

  // Parents – one per family; first parent has TWO children (siblings in different classes)
  const parentDefs = [
    ['Imran Khan', 'parent@demo.school', 'Father', [0, 11]],     // Ayesha (8-A, 97%) + Daniyal (9-A, low 72%) -> demo login
    ['Waqar Ahmed', 'waqar.ahmed@demo.school', 'Father', [1]],
    ['Rubina Malik', 'rubina.malik@demo.school', 'Mother', [2]],
    ['Shahid Ali', 'shahid.ali@demo.school', 'Father', [3]],      // low attendance child
    ['Amna Noor', 'amna.noor@demo.school', 'Mother', [4]],
    ['Raza Hussain', 'raza.hussain@demo.school', 'Father', [5]],
    ['Hassan Raza', 'hassan.raza@demo.school', 'Father', [7]],
    ['Shazia Iqbal', 'shazia.iqbal@demo.school', 'Mother', [8]],
    ['Farooq Ahmed', 'farooq.ahmed@demo.school', 'Father', [9]],
    ['Javed Iqbal', 'javed.iqbal@demo.school', 'Father', [10]],
    ['Adnan Sheikh', 'adnan.sheikh@demo.school', 'Father', [6]],
  ];
  for (const [name, email, relationship, kids] of parentDefs) {
    await Parent.create({ schoolId, name, email, password: hash.parent, phone: '+92-302-3000000', relationship, children: kids.map((i) => students[i]._id) });
  }

  // Timetable: 5 periods Mon–Fri, 08:00-13:00 with a short break
  const slotsDef = [['08:00', '08:45'], ['08:45', '09:30'], ['09:30', '10:15'], ['10:15', '10:35', 'BREAK'], ['10:35', '11:20'], ['11:20', '12:05']];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  await TimetableConfig.create({
    schoolId, schoolStartTime: '08:00', schoolEndTime: '12:05', lectureDurationMinutes: 45, workingDays: days,
    breaks: [{ name: 'Short Break', startTime: '10:15', endTime: '10:35' }], academicYear: '2026-2027',
  });
  const subjOrder = (dayIdx, slotIdx, std) => (dayIdx + slotIdx + (std === '9' ? 2 : 0)) % subjects.length;
  const periodsByDay = {}; // std -> dayName -> [{start,end,subject,teacher}]
  for (const std of ['8', '9']) {
    periodsByDay[std] = {};
    for (let d = 0; d < days.length; d++) {
      const slots = []; const periods = []; let pi = 0;
      for (const [start, end, brk] of slotsDef) {
        if (brk) { slots.push({ startTime: start, endTime: end, isBreak: true, breakName: 'Short Break' }); continue; }
        const si = subjOrder(d, pi, std); pi++;
        slots.push({ startTime: start, endTime: end, subjectId: subjects[si]._id, teacherId: teachers[si]._id });
        periods.push({ start, end, subject: subjects[si], teacher: teachers[si] });
      }
      await Timetable.create({ schoolId, classId: classes[std]._id, dayOfWeek: days[d], slots, academicYear: '2026-2027' });
      periodsByDay[std][days[d]] = periods;
    }
  }

  // Attendance: once a day, last 45 days (weekdays only), marked by each class head master.
  // Today is left unmarked for class 8-A so the "take attendance" flow can be demonstrated live.
  const records = [];
  const { nowInTz } = require('../utils/time');
  const today = nowInTz('Asia/Karachi').dateUTC;
  const headOf = { '8': teachers[0], '9': teachers[1] };
  for (let back = 45; back >= 0; back--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back));
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const s of students) {
      const std = s.classId.equals(classes['8']._id) ? '8' : '9';
      if (back === 0 && std === '8') continue;
      const fullAbsent = rnd() > s._rate;
      const onLeave = fullAbsent && rnd() < 0.25;
      const halfDay = !fullAbsent && rnd() < (1 - s._rate) * 0.5;
      const late = !fullAbsent && !halfDay && rnd() < 0.05;
      let status = 'Present'; let leftAt = null; let remarks = '';
      if (fullAbsent) { status = onLeave ? 'Leave' : 'Absent'; if (onLeave) remarks = 'Approved leave'; }
      else if (halfDay) { status = 'HalfDay'; leftAt = rnd() < 0.5 ? '10:30' : '11:20'; remarks = 'Left early'; }
      else if (late) status = 'Late';
      records.push({ schoolId, studentId: s._id, classId: s.classId, date: d, status, leftAt, remarks, markedBy: headOf[std]._id, markedByModel: 'Teacher' });
    }
  }
  await DailyAttendance.insertMany(records, { ordered: false });

  // Notices
  await Notice.insertMany([
    { schoolId, title: 'Welcome to the new academic year', category: 'General', content: 'We wish all students and parents a successful 2026-2027 academic year. School timings are 8:00 AM – 12:05 PM.', createdBy: adminId, createdByModel: 'User', targetAudience: 'All', isPinned: true, priority: 'High' },
    { schoolId, title: 'Parent-Teacher Meeting', category: 'Event', content: 'The parent-teacher meeting will be held on the last Saturday of this month. Please check your child\'s attendance record beforehand.', createdBy: adminId, createdByModel: 'User', targetAudience: 'All', priority: 'Medium' },
    { schoolId, title: 'Attendance policy reminder', category: 'General', content: 'Students must maintain at least 75% attendance to be eligible for final examinations. Parents are notified from the parent dashboard when attendance drops below this level.', createdBy: adminId, createdByModel: 'User', targetAudience: 'Students', priority: 'High' },
  ]);

  console.log('\n✅ Demo school ready');
  console.log(`   School code : ${CODE}`);
  console.log(`   Admin       : admin@demo.school / ${PASSWORDS.admin}`);
  console.log(`   Teacher     : sara.khan@demo.school / ${PASSWORDS.teacher}`);
  console.log(`   Student     : ayesha.khan@demo.school / ${PASSWORDS.student}`);
  console.log(`   Parent      : parent@demo.school / ${PASSWORDS.parent}  (2 children)`);
  console.log(`   Attendance rows created: ${records.length}\n`);
})()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
