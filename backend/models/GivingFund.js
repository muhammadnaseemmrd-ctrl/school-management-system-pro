// A fund that gifts are kept in (PRD E32, CAP-0414/0487). A restricted fund can only be spent on what its donors allowed.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, maxlength: 100 },
  purpose: { type: String, default: '', maxlength: 300 },
  restricted: { type: Boolean, default: true },
  allowedCategories: { type: [String], default: [] },
  restrictionNote: { type: String, default: '', maxlength: 400 },
  state: { type: String, enum: ['Active', 'Closed'], default: 'Active' },
  version: { type: Number, default: 0 },          // taken with compare-and-set so two spends cannot both use the last rupee
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('GivingFund', schema);
