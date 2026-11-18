const mongoose = require('../lib/pgdoc');

// One record per student per school day, marked once by the class head master.
// Present / Absent / Late / HalfDay (left before closing) / Leave
const STATUSES = ['Present', 'Absent', 'Late', 'HalfDay', 'Leave'];

const dailyAttendanceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: Date, required: true }, // school-local calendar day stored as UTC midnight
    status: { type: String, enum: STATUSES, required: true },
    leftAt: { type: String, default: null }, // HH:MM, only for HalfDay
    remarks: { type: String, default: '' },
    markedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'markedByModel' },
    markedByModel: { type: String, enum: ['User', 'Teacher'], default: 'Teacher' },
  },
  { timestamps: true }
);

dailyAttendanceSchema.index({ studentId: 1, date: 1 }, { unique: true });
dailyAttendanceSchema.index({ schoolId: 1, classId: 1, date: 1 });

module.exports = mongoose.model('DailyAttendance', dailyAttendanceSchema);
// Query paths (indexing is part of the schema, so every environment gets it)
dailyAttendanceSchema.index({ schoolId: 1, date: 1 });

module.exports.STATUSES = STATUSES;
