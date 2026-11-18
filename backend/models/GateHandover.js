const mongoose = require('../lib/pgdoc');
// A shift handed from one person to the next. The handover only counts once a different person accepts it (PRD E09, CAP-0348).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  gate: { type: String, default: 'Main gate' },
  fromId: mongoose.Schema.Types.ObjectId, fromRole: { type: String, default: '' }, fromName: { type: String, default: '' },
  toId: mongoose.Schema.Types.ObjectId, toRole: { type: String, default: '' }, toName: { type: String, default: '' },
  witnessName: { type: String, default: '' },
  note: { type: String, default: '' },
  openItems: [{ type: mongoose.Schema.Types.ObjectId }],
  keysAndEquipment: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Accepted', 'Disputed'], default: 'Pending' },
  decidedAt: Date, decisionNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
schema.index({ schoolId: 1, toId: 1, status: 1 });
module.exports = mongoose.model('GateHandover', schema);
