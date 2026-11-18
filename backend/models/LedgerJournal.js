const mongoose = require('../lib/pgdoc');

// Platform double-entry journal (E02). Lines hold whole PKR; total debits must equal total credits.
// (sourceType, sourceId) is unique, so posting the same business event twice is a no-op.
const ledgerJournalSchema = new mongoose.Schema(
  {
    sourceType: { type: String, required: true }, // payment, payment_refund, commission, commission_void, payout
    sourceId: { type: String, required: true },
    memo: { type: String, default: '' },
    status: { type: String, enum: ['posted', 'reversed'], default: 'posted' },
    postedAt: { type: Date, default: Date.now },
    lines: [
      {
        account: { type: String, required: true }, // account code, see utils/ledger.js
        debit: { type: Number, default: 0, min: 0 },
        credit: { type: Number, default: 0, min: 0 },
      },
    ],
  },
  { versionKey: false }
);
ledgerJournalSchema.index({ sourceType: 1, sourceId: 1 }, { unique: true });
ledgerJournalSchema.index({ postedAt: -1 });

module.exports = mongoose.model('LedgerJournal', ledgerJournalSchema);
