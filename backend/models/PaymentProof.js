const mongoose = require('../lib/pgdoc');

// A payment screenshot submitted by a student/parent. Only the school admin can
// turn it into "Paid" (approve) or reject it.
const itemSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['installment', 'charge'], required: true },
    installment: Number,
    chargeId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCharge' },
    label: String,
    amount: Number,
  },
  { _id: false }
);

const paymentProofSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    submittedByRole: { type: String, enum: ['student', 'parent'], required: true },
    submittedById: { type: mongoose.Schema.Types.ObjectId },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    totalAmount: { type: Number, required: true }, // sum of the fee items (server computed)
    method: { type: String, enum: ['Bank transfer', 'JazzCash', 'Easypaisa', 'Cash deposit', 'Other'], default: 'Bank transfer' },
    reference: { type: String, default: '', trim: true }, // transaction / slip number
    screenshotUrl: { type: String, required: true },
    note: { type: String, default: '' },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending', index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId },
    reviewedAt: Date,
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
);

// Query paths (indexing is part of the schema, so every environment gets it)
paymentProofSchema.index({ schoolId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentProof', paymentProofSchema);
