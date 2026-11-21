const mongoose = require('../lib/pgdoc');

// A facility project, such as a renovation (PRD E19). It cannot spend more than it has been authorised to, unless a change order is approved.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  code: { type: String }, title: { type: String, required: true, trim: true }, description: { type: String, default: '' }, location: { type: String, default: '' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, default: null }, ownerName: { type: String, default: '' },
  phase: { type: String, enum: ['proposed', 'approved', 'building', 'handover', 'completed', 'cancelled'], default: 'proposed' },
  budgetLineId: { type: mongoose.Schema.Types.ObjectId, default: null }, fundId: { type: mongoose.Schema.Types.ObjectId, default: null },
  proposed: { type: Number, default: 0 }, authorized: { type: Number, default: 0 }, committed: { type: Number, default: 0 }, spent: { type: Number, default: 0 }, available: { type: Number, default: 0 },
  startOn: { type: String, default: '' }, endOn: { type: String, default: '' },
  milestones: [{ key: String, title: String, dueOn: String, amount: Number, done: Boolean, doneAt: Date, note: String }],
  approvedById: { type: mongoose.Schema.Types.ObjectId, default: null }, approvedByName: { type: String, default: '' }, approvedAt: { type: Date, default: null }, sole: { type: Boolean, default: false },
  createdById: { type: mongoose.Schema.Types.ObjectId, default: null }, createdByName: { type: String, default: '' }, closedNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, code: 1 }, { unique: true });
schema.index({ schoolId: 1, phase: 1, createdAt: -1 });
module.exports = mongoose.model('PcProject', schema);
