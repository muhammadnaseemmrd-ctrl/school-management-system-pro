const mongoose = require('../lib/pgdoc');

// A group taking a course together, with live sessions and a seat limit (PRD E17). Self-paced cohorts have no sessions.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrCourse', required: true },
  name: { type: String, required: true },
  mode: { type: String, enum: ['self', 'led'], default: 'led' },
  instructorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  startsAt: { type: Date, default: null }, endsAt: { type: Date, default: null },
  enrolUntil: { type: Date, default: null },
  capacity: { type: Number, default: 0 },                          // 0 = no limit
  seatsTaken: { type: Number, default: 0 },
  timezone: { type: String, default: 'Asia/Karachi' },
  minAttendance: { type: Number, default: 0 },                     // percent of sessions needed to finish
  status: { type: String, enum: ['planned', 'open', 'running', 'closed', 'cancelled'], default: 'open' },
  sessions: [{ _id: false, id: String, title: String, startsAt: Date, minutes: Number, mode: String, link: String, venue: String, attendance: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }, marked: Boolean, reminded: Boolean }],
}, { timestamps: true });
schema.index({ schoolId: 1, courseId: 1, status: 1 });
schema.index({ schoolId: 1, startsAt: 1 });
module.exports = mongoose.model('TrCohort', schema);
