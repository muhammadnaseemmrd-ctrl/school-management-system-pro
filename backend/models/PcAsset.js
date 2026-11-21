const mongoose = require('../lib/pgdoc');

// A thing the school owns and keeps track of (PRD E19). Value falls in a straight line over its useful life.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true }, tag: { type: String }, name: { type: String, required: true, trim: true }, category: { type: String, default: 'other' }, serial: { type: String, default: '' }, notes: { type: String, default: '' },
  location: { type: String, default: '' }, custodianId: { type: mongoose.Schema.Types.ObjectId, default: null }, custodianName: { type: String, default: '' },
  cost: { type: Number, default: 0 }, salvage: { type: Number, default: 0 }, usefulLifeYears: { type: Number, default: 5 }, capitalizedOn: { type: String, default: '' },
  status: { type: String, enum: ['in_service', 'in_repair', 'stored', 'disposal_requested', 'disposed', 'lost'], default: 'in_service' },
  orderId: { type: mongoose.Schema.Types.ObjectId, default: null }, orderLineId: { type: mongoose.Schema.Types.ObjectId, default: null }, projectId: { type: mongoose.Schema.Types.ObjectId, default: null }, fundId: { type: mongoose.Schema.Types.ObjectId, default: null }, poNo: { type: String, default: '' },
  disposal: { prev: String, how: String, reason: String, proceeds: Number, on: String, requestedById: mongoose.Schema.Types.ObjectId, requestedByName: String, decidedById: mongoose.Schema.Types.ObjectId, decidedByName: String, decidedAt: Date, sole: Boolean },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, tag: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, category: 1 });
schema.index({ schoolId: 1, custodianId: 1 });
module.exports = mongoose.model('PcAsset', schema);
