const mongoose = require('../lib/pgdoc');

// A degree programme (PRD E16). The rules live in versions so a student keeps the catalogue year they started under.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: String, required: true },
  name: { type: String, required: true },
  level: { type: String, enum: ['certificate', 'diploma', 'bachelor', 'master', 'doctorate', 'other'], default: 'bachelor' },
  department: { type: String, default: '' },
  status: { type: String, enum: ['active', 'retired'], default: 'active' },
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('RegProgram', schema);
