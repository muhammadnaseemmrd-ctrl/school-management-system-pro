const mongoose = require('../lib/pgdoc');
// A family asks to add, pause or remove someone who may collect their child (CAP-0287). Nothing changes until the school has confirmed the request with the family.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  action: { type: String, enum: ['add', 'remove', 'pause'], required: true },
  personName: { type: String, required: true }, relationship: { type: String, default: '' }, phone: { type: String, default: '' }, linkId: mongoose.Schema.Types.ObjectId,
  validFrom: Date, validTo: Date, note: { type: String, default: '' },
  state: { type: String, enum: ['Requested', 'Verified', 'Applied', 'Declined', 'Cancelled'], default: 'Requested' },
  requestedByParentId: mongoose.Schema.Types.ObjectId, requestedByName: { type: String, default: '' }, onBehalf: { type: Boolean, default: false },
  verifiedById: mongoose.Schema.Types.ObjectId, verifiedByName: { type: String, default: '' }, verifiedAt: Date, verifiedMethod: { type: String, default: '' }, verifiedWith: { type: String, default: '' }, verifiedNote: { type: String, default: '' },
  appliedByName: { type: String, default: '' }, appliedAt: Date, decidedNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, state: 1, createdAt: -1 });
schema.index({ schoolId: 1, childId: 1, createdAt: -1 });
module.exports = mongoose.model('EyPickupChange', schema);
