const mongoose = require('../lib/pgdoc');

// A group of schools under one owner (PRD E01 "organization"). It is a record the platform owner manages.
// Being in the same organization never lets one school see another school's data.
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  contactName: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

schema.index({ slug: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Organization', schema);
