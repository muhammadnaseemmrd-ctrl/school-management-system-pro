const mongoose = require('../lib/pgdoc');

// Someone taking training courses (PRD E17). A learner signs in with a private link whose hash is stored, or through a linked student account.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  keyHash: { type: String },                                       // never an empty string: the unique index ignores only a missing value
  keySetAt: { type: Date, default: null },
  minor: { type: Boolean, default: false },
  consentAt: { type: Date, default: null },
  source: { type: String, default: 'office' },                     // storefront | office | student | sponsor
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  lastSeenAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, email: 1 });
schema.index({ keyHash: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1 });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model('TrLearner', schema);
