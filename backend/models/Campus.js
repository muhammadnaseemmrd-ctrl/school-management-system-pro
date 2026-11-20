const mongoose = require('../lib/pgdoc');

// One site of a school (PRD E01 "campus"). Every school has a default campus; classes without a campus belong to it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  isDefault: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'closed'], default: 'active' },
  closedAt: Date,
  createdByName: { type: String, default: '' },
}, { timestamps: true });

schema.index({ schoolId: 1, code: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
schema.index({ schoolId: 1, isDefault: 1 });

module.exports = mongoose.model('Campus', schema);
