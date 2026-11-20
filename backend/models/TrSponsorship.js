const mongoose = require('../lib/pgdoc');

// A sponsor's invoice for seats on a course or cohort (PRD E17). Access is granted only when the payment is confirmed.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  invoiceNo: { type: String, required: true },
  sponsorId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrSponsor', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrCourse', required: true },
  cohortId: { type: mongoose.Schema.Types.ObjectId, default: null },
  courseTitle: { type: String, default: '' },
  learnerIds: [{ type: mongoose.Schema.Types.ObjectId }],
  seats: { type: Number, default: 0 },
  pricePerSeat: { type: Number, default: 0 }, discountNote: { type: String, default: '' },
  net: { type: Number, default: 0 }, tax: { type: Number, default: 0 }, total: { type: Number, default: 0 },
  policyVersion: { type: Number, default: 0 },
  status: { type: String, enum: ['invoiced', 'paid', 'cancelled'], default: 'invoiced' },
  paidAt: { type: Date, default: null }, reference: { type: String, default: '' }, confirmedBy: { type: String, default: '' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, invoiceNo: 1 }, { unique: true });
schema.index({ schoolId: 1, sponsorId: 1, status: 1 });
module.exports = mongoose.model('TrSponsorship', schema);
