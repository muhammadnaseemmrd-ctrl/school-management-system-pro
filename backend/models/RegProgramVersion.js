const mongoose = require('../lib/pgdoc');

// The rules of one programme for one catalogue year. Draft versions can be edited; a published version never changes (PRD E16 DegreeRequirement).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'RegProgram', required: true },
  catalogYear: { type: String, required: true },
  status: { type: String, enum: ['draft', 'review', 'published', 'retired'], default: 'draft' },
  totalCredits: { type: Number, default: 120 },
  minCgpa: { type: Number, default: 2 },
  minGrade: { type: String, default: 'D' },            // lowest grade that counts toward a required course
  // rule: all = every listed course; credits = at least minCredits from the pool; count = at least minCount courses from the pool
  requirements: [{ _id: false, key: String, title: String, rule: { type: String, enum: ['all', 'credits', 'count'], default: 'all' }, courses: [String], prefixes: [String], minCredits: Number, minCount: Number }],
  note: { type: String, default: '' },
  createdByName: { type: String, default: '' },
  submittedByName: { type: String, default: '' },
  submittedById: mongoose.Schema.Types.ObjectId,
  approval: { byName: String, byId: mongoose.Schema.Types.ObjectId, at: Date, sole: Boolean, hash: String },
  contentHash: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, programId: 1, catalogYear: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('RegProgramVersion', schema);
