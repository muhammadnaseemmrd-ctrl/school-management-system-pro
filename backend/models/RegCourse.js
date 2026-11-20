const mongoose = require('../lib/pgdoc');

// A course in the school's catalogue (PRD E16 AcademicCatalog). Prerequisites are by course code with a minimum grade; changes keep a revision count.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: String, required: true },
  title: { type: String, required: true },
  credits: { type: Number, required: true, min: 0, max: 30 },
  department: { type: String, default: '' },
  level: { type: Number, default: 100 },
  description: { type: String, default: '' },
  prerequisites: [{ _id: false, code: String, minGrade: { type: String, default: 'D' } }],
  corequisites: [{ _id: false, code: String }],
  status: { type: String, enum: ['active', 'retired'], default: 'active' },
  revision: { type: Number, default: 1 },
  history: [{ _id: false, at: Date, byName: String, change: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, department: 1 });
module.exports = mongoose.model('RegCourse', schema);
