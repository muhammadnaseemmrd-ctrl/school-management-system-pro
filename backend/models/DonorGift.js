// Money received (PRD E32). Never edited: a mistake is reversed by a second row.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  pledgeId: { type: ObjectId, default: null },
  donorName: { type: String, default: '' }, recognition: { type: String, default: 'anonymous' },
  fundId: { type: ObjectId, required: true },
  campaignId: { type: ObjectId, default: null },
  amount: { type: Number, required: true },       // negative on a reversal
  receivedOn: { type: String, required: true },
  method: { type: String, enum: ['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque', 'other'], default: 'bank' },
  reference: { type: String, default: '', maxlength: 80 },
  receiptNo: { type: String, default: '' },
  reversalOf: { type: ObjectId, default: null }, reversalReason: { type: String, default: '' },
  idempotencyKey: { type: String, default: '' },
  recordedByName: { type: String, default: '' }, recordedById: ObjectId,
  acknowledgedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, fundId: 1, receivedOn: -1 });
schema.index({ schoolId: 1, pledgeId: 1 });
schema.index({ schoolId: 1, receiptNo: 1 });
schema.index({ schoolId: 1, idempotencyKey: 1 });
module.exports = mongoose.model('DonorGift', schema);
