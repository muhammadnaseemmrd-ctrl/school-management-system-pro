const mongoose = require('../lib/pgdoc');
// What happened when we tried to reach someone (PRD E20: DeliveryAttempt). The in-app copy is always sent at once;
// a push is held while the person's quiet hours apply and is retried a few times if it fails.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  recipientRole: { type: String, required: true }, recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  channel: { type: String, enum: ['inapp', 'push'], required: true },
  state: { type: String, enum: ['sent', 'deferred', 'failed', 'skipped'], required: true }, reason: { type: String, default: '' },
  kind: { type: String, default: 'general' }, refId: { type: mongoose.Schema.Types.ObjectId, default: null },
  lang: { type: String, default: 'en' }, bypassedQuiet: { type: Boolean, default: false },
  deferUntil: { type: Date, default: null }, attempts: { type: Number, default: 0 }, nextTryAt: { type: Date, default: null }, sentAt: { type: Date, default: null },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, state: 1, deferUntil: 1 });
schema.index({ schoolId: 1, recipientId: 1, createdAt: -1 });
schema.index({ schoolId: 1, refId: 1 });
module.exports = mongoose.model('CmDelivery', schema);
