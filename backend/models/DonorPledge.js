// A promise to give (PRD E32, CAP-0487). Gifts received against it are separate, append-only rows.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  no: { type: String, required: true },
  donorName: { type: String, required: true, maxlength: 120 },
  donorKind: { type: String, enum: ['individual', 'family', 'company', 'organisation', 'alumni'], default: 'individual' },
  alumniId: { type: ObjectId, default: null },
  recognition: { type: String, enum: ['named', 'anonymous'], default: 'anonymous' },    // named only if the donor said so
  contactConsent: { type: Boolean, default: false },
  contact: { type: Mixed, default: {} },          // { email, phone } kept only while contactConsent is true
  campaignId: { type: ObjectId, default: null },
  fundId: { type: ObjectId, required: true },
  amount: { type: Number, required: true, min: 1 },
  schedule: { type: [Mixed], default: [] },       // [{ dueOn, amount }]
  status: { type: String, enum: ['Open', 'Fulfilled', 'Cancelled', 'WrittenOff'], default: 'Open' },
  note: { type: String, default: '', maxlength: 400 },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, no: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, fundId: 1 });
module.exports = mongoose.model('DonorPledge', schema);
