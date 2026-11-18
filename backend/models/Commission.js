const mongoose = require('../lib/pgdoc');

// One row per payment earned by an agent. Amounts never change: a refund voids an unpaid row,
// or adds a negative "reversal" row when the money was already paid out.
const commissionSchema = new mongoose.Schema(
  {
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
    schoolName: { type: String, default: '' },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPayment', required: true },
    kind: { type: String, enum: ['accrual', 'reversal'], default: 'accrual' },
    reversesId: { type: mongoose.Schema.Types.ObjectId, default: null },
    baseAmountPKR: { type: Number, required: true },
    percent: { type: Number, required: true },
    amountPKR: { type: Number, required: true }, // negative for reversals
    status: { type: String, enum: ['Pending', 'Approved', 'Paid', 'Void'], default: 'Pending' },
    eligibleAt: { type: Date, default: null }, // earliest approval (hold period)
    approvedAt: Date,
    approvedByName: { type: String, default: '' },
    payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentPayout', default: null },
    voidReason: { type: String, default: '' },
  },
  { timestamps: true }
);
// One accrual and at most one reversal per payment: recording twice is impossible
commissionSchema.index({ paymentId: 1, kind: 1 }, { unique: true });
commissionSchema.index({ agentId: 1, status: 1, createdAt: -1 });
commissionSchema.index({ agentId: 1, schoolId: 1 });
commissionSchema.index({ status: 1, eligibleAt: 1 });
commissionSchema.index({ payoutId: 1 });

module.exports = mongoose.model('Commission', commissionSchema);
