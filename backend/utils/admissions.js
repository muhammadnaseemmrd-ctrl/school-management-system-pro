// Admissions rules shared by the controller and the tests (PRD E04).
const mongoose = require('../lib/pgdoc');
const AdmissionApplication = require('../models/AdmissionApplication');
const AdmissionCapacity = require('../models/AdmissionCapacity');
const Student = require('../models/Student');

const STAGES = ['New', 'Documents', 'Interview', 'Waitlisted', 'Offered', 'Accepted', 'Enrolled', 'Rejected', 'Withdrawn'];
const OPEN = ['New', 'Documents', 'Interview', 'Waitlisted', 'Offered', 'Accepted'];
const TRANSITIONS = {
  New: ['Documents', 'Interview', 'Waitlisted', 'Rejected', 'Withdrawn'],
  Documents: ['Interview', 'Waitlisted', 'Rejected', 'Withdrawn'],
  Interview: ['Offered', 'Waitlisted', 'Rejected', 'Withdrawn'],
  Waitlisted: ['Offered', 'Rejected', 'Withdrawn'],
  Offered: ['Accepted', 'Rejected', 'Withdrawn'],
  Accepted: ['Enrolled', 'Withdrawn'],
  Enrolled: [], Rejected: [], Withdrawn: [],
};
const SEAT_STAGES = ['Offered', 'Accepted', 'Enrolled'];
const DEFAULT_CHECKLIST = [
  { key: 'birth-cert', label: 'Birth certificate or B-Form', required: true },
  { key: 'guardian-cnic', label: 'Guardian CNIC copy', required: true },
  { key: 'photos', label: 'Passport photographs', required: true },
  { key: 'leaving-cert', label: 'Previous school leaving certificate', required: false },
  { key: 'report-card', label: 'Last report card', required: false },
];

const digits = (s) => String(s || '').replace(/\D/g, '').replace(/^(0092|92)/, '0');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ ]/g, ' ').replace(/\s+/g, ' ').trim();
const sameDay = (a, b) => a && b && new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

// Possible duplicates of a child, from other applications and from students already enrolled.
// Matching is deliberately cautious: a human decides.
async function findDuplicates(schoolId, { childName, dateOfBirth, phone, email, excludeId }) {
  const sid = new mongoose.Types.ObjectId(String(schoolId));
  const name = norm(childName); const ph = digits(phone); const em = String(email || '').toLowerCase();
  const out = [];
  const apps = await AdmissionApplication.find({ schoolId: sid });
  for (const a of apps) {
    if (excludeId && String(a._id) === String(excludeId)) continue;
    if (['Withdrawn', 'Rejected'].includes(a.stage) && a.mergedIntoId) continue;
    const sameName = norm(a.child.name) === name;
    const sameContact = (ph && digits(a.guardian.phone) === ph) || (em && a.guardian.email === em);
    if (sameName && sameDay(a.child.dateOfBirth, dateOfBirth)) out.push({ kind: 'application', refId: String(a._id), refName: a.child.name, reason: 'Same name and date of birth as another application' });
    else if (sameName && sameContact) out.push({ kind: 'application', refId: String(a._id), refName: a.child.name, reason: 'Same child name and the same guardian phone or email' });
  }
  const students = await Student.find({ schoolId: sid }).select('name dateOfBirth guardian father mother phone');
  for (const s of students) {
    const sameName = norm(s.name) === name;
    if (sameName && sameDay(s.dateOfBirth, dateOfBirth)) out.push({ kind: 'student', refId: String(s._id), refName: s.name, reason: 'A current student has the same name and date of birth' });
    else if (sameName && ph && [s.phone, s.father?.mobileNumber, s.mother?.mobileNumber, s.guardian?.mobileNumber].some((x) => digits(x) === ph)) out.push({ kind: 'student', refId: String(s._id), refName: s.name, reason: 'A current student has the same name and a matching guardian phone' });
  }
  const seen = new Set();
  return out.filter((d) => (seen.has(d.kind + d.refId) ? false : seen.add(d.kind + d.refId)));
}

async function seatsFor(schoolId, year, grade) {
  const sid = new mongoose.Types.ObjectId(String(schoolId));
  const cap = await AdmissionCapacity.findOne({ schoolId: sid, academicYear: year, gradeSought: grade });
  const apps = await AdmissionApplication.find({ schoolId: sid, academicYear: year, gradeSought: grade });
  const used = apps.filter((a) => a.seatReserved).length;
  const waiting = apps.filter((a) => a.stage === 'Waitlisted').sort((a, b) => new Date(a.waitlistedAt) - new Date(b.waitlistedAt));
  return { limited: !!cap, seats: cap ? cap.seats : null, used, available: cap ? Math.max(0, cap.seats - used) : null, waiting };
}

module.exports = { STAGES, OPEN, TRANSITIONS, SEAT_STAGES, DEFAULT_CHECKLIST, findDuplicates, seatsFor, digits, norm };
