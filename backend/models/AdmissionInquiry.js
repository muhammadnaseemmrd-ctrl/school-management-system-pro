const mongoose = require('../lib/pgdoc');

// First contact from a family. One inquiry can lead to several applications (siblings). The source is kept for good.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  source: { type: String, enum: ['walk-in', 'phone', 'website', 'referral', 'social', 'event', 'other'], default: 'walk-in' },
  sourceDetail: { type: String, default: '', trim: true },
  contactName: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  email: { type: String, default: '', lowercase: true, trim: true },
  note: { type: String, default: '' },
  status: { type: String, enum: ['Open', 'Applied', 'Closed'], default: 'Open' },
  nextFollowUpOn: { type: Date, default: null },
  closedReason: { type: String, default: '' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, createdAt: -1 });
schema.index({ schoolId: 1, phone: 1 });
schema.index({ schoolId: 1, status: 1, nextFollowUpOn: 1 });

module.exports = mongoose.model('AdmissionInquiry', schema);
