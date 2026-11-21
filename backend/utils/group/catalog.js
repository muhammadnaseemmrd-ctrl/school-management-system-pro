// The rules a group of campuses can set once and let a campus change inside limits (PRD E26).
// Each rule says what it is, its units, the widest range it can ever take, where its value comes from when nobody has set it,
// and which part of Aulensia reads it.
const KEYS = [
  { key: 'attendance.alertGraceMinutes', group: 'Attendance', label: 'Wait before an absence alert goes to a family', unit: 'minutes', min: 0, max: 120, consumer: 'Absence, late and early-exit alerts (attendance operations)', help: 'A correction made inside this time cancels the alert before the family sees it.' },
  { key: 'fees.lateGraceDays', group: 'Fees', label: 'Days after the due date before a late fee', unit: 'days', min: 0, max: 90, consumer: 'The late-fee run (fee collection)', help: 'Applies to families of children in this campus.' },
  { key: 'fees.lateFeeAmount', group: 'Fees', label: 'Late fee', unit: 'rupees', min: 0, max: 1000000, consumer: 'The late-fee run (fee collection)', help: 'Zero means no late fee.' },
  { key: 'target.attendanceRate', group: 'Targets', label: 'Attendance target', unit: 'percent', min: 50, max: 100, consumer: 'The group view', help: 'A campus under its target is listed as needing attention.', step: 0.1 },
  { key: 'target.feeCollection', group: 'Targets', label: 'Fee collection target', unit: 'percent', min: 0, max: 100, consumer: 'The group view', help: 'Share of fees invoiced in the period that is collected.', step: 0.1 },
  { key: 'target.learningAverage', group: 'Targets', label: 'Average mark target', unit: 'percent', min: 0, max: 100, consumer: 'The group view', help: 'Average of marks obtained against marks available.', step: 0.1 },
  { key: 'capacity.students', group: 'Capacity', label: 'Places for children', unit: 'children', min: 0, max: 100000, campusOnly: true, consumer: 'The group view', help: 'Set for each campus. Zero means no limit has been set.' },
];
const BY_KEY = new Map(KEYS.map((k) => [k.key, k]));
const view = (k) => ({ key: k.key, group: k.group, label: k.label, unit: k.unit, min: k.min, max: k.max, step: k.step || 1, campusOnly: !!k.campusOnly, consumer: k.consumer, help: k.help });
module.exports = { KEYS, BY_KEY, view };
