const mongoose = require('mongoose');

// One amount a student owes: uniform, transport month, books, admission, exam fee...
// (Tuition installments live in StudentFee / FeeStructure.)
const feeChargeSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    type: { type: String, enum: ['Transport', 'Uniform', 'Books', 'Admission', 'Exam', 'Trip', 'Other'], default: 'Other' },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date },
    period: { type: String, default: '' }, // e.g. "2026-11" for monthly transport
    status: { type: String, enum: ['Unpaid', 'Paid'], default: 'Unpaid' },
    paidAt: Date,
    paidVia: { type: String, enum: ['proof', 'admin', ''], default: '' },
    proofId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentProof' },
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

// A student gets one transport charge per month
feeChargeSchema.index(
  { schoolId: 1, studentId: 1, type: 1, period: 1 },
  { unique: true, partialFilterExpression: { type: 'Transport' } }
);

module.exports = mongoose.model('FeeCharge', feeChargeSchema);
