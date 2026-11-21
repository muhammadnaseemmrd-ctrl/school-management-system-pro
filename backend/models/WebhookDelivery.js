// One event on its way to one webhook (PRD E30 WebhookDelivery). It is written first and sent after, so an event is never lost and a replay is a new delivery of the same event.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  connectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Connector', required: true },
  eventId: { type: String, required: true },                          // one per event; the receiver uses it to ignore repeats
  type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['pending', 'delivered', 'failed', 'dead'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now },
  lastStatus: { type: Number, default: 0 }, lastError: { type: String, default: '' }, lastMs: { type: Number, default: 0 },
  history: { type: [{ at: Date, status: Number, ms: Number, error: String }], default: [] },
  deliveredAt: Date,
  replayOf: { type: mongoose.Schema.Types.ObjectId, default: null },
  replayKey: { type: String, default: '' },                            // empty for the first delivery of an event, unique for each replay
  claimUntil: { type: Date, default: null },                           // a sender that took this delivery holds it for a short while
}, { timestamps: true });

schema.index({ connectorId: 1, eventId: 1, replayKey: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, nextAttemptAt: 1 });
schema.index({ connectorId: 1, createdAt: -1 });

module.exports = mongoose.model('WebhookDelivery', schema);
