const mongoose = require('../lib/pgdoc');

// A maintenance job (PRD E19): a fault someone reported, or a preventive visit that came due.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, ticketNo: { type: String }, title: { type: String, required: true, trim: true }, description: { type: String, default: '' }, location: { type: String, default: '' },
  assetId: { type: mongoose.Schema.Types.ObjectId, default: null }, assetTag: { type: String, default: '' }, planKey: { type: String },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  status: { type: String, enum: ['open', 'assigned', 'in_progress', 'done', 'closed', 'cancelled'], default: 'open' },
  reportedById: { type: mongoose.Schema.Types.ObjectId, default: null }, reportedByName: { type: String, default: '' }, reportedByRole: { type: String, default: '' },
  assignedName: { type: String, default: '' }, vendorId: { type: mongoose.Schema.Types.ObjectId }, dueOn: { type: String, default: '' }, cost: { type: Number, default: 0 }, doneNote: { type: String, default: '' }, doneAt: { type: Date, default: null },
  trail: [{ at: Date, byId: mongoose.Schema.Types.ObjectId, byName: String, action: String, note: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, ticketNo: 1 }, { unique: true });
schema.index({ schoolId: 1, planKey: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, priority: 1, createdAt: -1 });
schema.index({ schoolId: 1, reportedById: 1, createdAt: -1 });
module.exports = mongoose.model('PcTicket', schema);
