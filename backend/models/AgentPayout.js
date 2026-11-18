const mongoose = require('../lib/pgdoc');

const agentPayoutSchema = new mongoose.Schema(
  {
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
    agentName: { type: String, default: '' },
    amountPKR: { type: Number, required: true, min: 1 }, // net of any reversal rows it settles
    method: { type: String, enum: ['bank', 'jazzcash', 'easypaisa', 'cash', 'other'], required: true },
    reference: { type: String, default: '', trim: true },
    paidAt: { type: Date, required: true },
    commissionIds: [{ type: mongoose.Schema.Types.ObjectId }],
    note: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId },
    recordedByName: { type: String, default: '' },
  },
  { timestamps: true }
);
agentPayoutSchema.index({ agentId: 1, paidAt: -1 });

module.exports = mongoose.model('AgentPayout', agentPayoutSchema);
