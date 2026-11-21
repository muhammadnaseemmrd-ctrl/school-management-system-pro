// What went in and what came out, minus anything sensitive (PRD E31, CAP-0496). Append-only. The words a person typed are kept only
// after personal details are removed, and only for a limited time; the fingerprint stays.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  at: { type: Date, default: Date.now },
  action: { type: String, required: true },                                // generate | refused | edit | submit | approve | reject | return | publish | withdraw | policy | source | glossary | test | fee_check
  actorId: mongoose.Schema.Types.ObjectId, actorName: { type: String, default: '' }, actorRole: { type: String, default: '' },
  draftId: { type: String, default: '' }, draftNo: { type: String, default: '' }, kind: { type: String, default: '' },
  provider: { type: String, default: '' }, model: { type: String, default: '' }, version: { type: String, default: '' },
  prompt: { type: String, default: '' },                                   // redacted words sent to the provider; cleared after the retention period
  promptHash: { type: String, default: '' }, outputHash: { type: String, default: '' },
  removed: { type: mongoose.Schema.Types.Mixed, default: {} },             // { email: 1, phone: 2 } what was taken out before sending
  flags: { type: Number, default: 0 },
  ok: { type: Boolean, default: true }, reason: { type: String, default: '' },
  ms: { type: Number, default: 0 },
  approverName: { type: String, default: '' },
}, { timestamps: false });
schema.index({ schoolId: 1, at: -1 });
schema.index({ schoolId: 1, draftId: 1, at: 1 });
schema.index({ schoolId: 1, actorId: 1, action: 1, at: -1 });

module.exports = mongoose.model('AiAudit', schema);
