const mongoose = require('../lib/pgdoc');

// A place in the queue for a title (PRD E18). When a copy comes back it is held for the first person waiting.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  titleId: { type: mongoose.Schema.Types.ObjectId, required: true }, titleName: { type: String, default: '' },
  cardId: { type: mongoose.Schema.Types.ObjectId, required: true }, holderName: { type: String, default: '' },
  status: { type: String, enum: ['waiting', 'ready', 'fulfilled', 'cancelled', 'expired'], default: 'waiting' },
  copyId: { type: mongoose.Schema.Types.ObjectId, default: null }, readyAt: { type: Date, default: null }, holdUntil: { type: Date, default: null },
  activeKey: { type: String },          // card + title while waiting or ready: one place per person per title
  endedReason: { type: String, default: '' },
}, { timestamps: true });
schema.index({ activeKey: 1 }, { unique: true });
schema.index({ schoolId: 1, titleId: 1, status: 1, createdAt: 1 });
schema.index({ schoolId: 1, cardId: 1, status: 1 });
module.exports = mongoose.model('LbReservation', schema);
