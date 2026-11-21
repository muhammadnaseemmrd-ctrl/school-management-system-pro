const mongoose = require('../lib/pgdoc');

// One physical copy with its own barcode (PRD E18). The loan id is set by a conditional write, so a copy can only be lent once at a time.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  titleId: { type: mongoose.Schema.Types.ObjectId, ref: 'LbTitle', required: true },
  barcode: { type: String, required: true },
  status: { type: String, enum: ['available', 'on_loan', 'reserved', 'lost', 'damaged', 'repair', 'withdrawn'], default: 'available' },
  condition: { type: String, enum: ['new', 'good', 'fair', 'poor'], default: 'good' },
  shelf: { type: String, default: '' }, acquiredOn: { type: Date, default: Date.now }, price: { type: Number, default: 0 }, note: { type: String, default: '' },
  loanId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reservedFor: { type: mongoose.Schema.Types.ObjectId, default: null },      // the reservation that holds it
  history: [{ at: Date, status: String, byName: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, barcode: 1 }, { unique: true });
schema.index({ schoolId: 1, titleId: 1, status: 1 });
module.exports = mongoose.model('LbCopy', schema);
