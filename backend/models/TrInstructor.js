const mongoose = require('../lib/pgdoc');

// A person who teaches training courses (PRD E17). Courses can be published only with a verified instructor.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },   // set when the instructor is one of the school's teachers and so can sign in
  name: { type: String, required: true },
  email: { type: String, default: '' },
  bio: { type: String, default: '' },
  credentials: { type: String, default: '' },     // what makes this person fit to teach it
  evidence: { type: String, default: '' },        // what the administrator looked at
  status: { type: String, enum: ['pending', 'verified', 'suspended'], default: 'pending' },
  verifiedBy: { type: String, default: '' }, verifiedAt: { type: Date, default: null }, note: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1 });
schema.index({ schoolId: 1, teacherId: 1 });
module.exports = mongoose.model('TrInstructor', schema);
