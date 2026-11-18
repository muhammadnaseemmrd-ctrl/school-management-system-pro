const mongoose = require('../lib/pgdoc');

// A cashier's till for one shift. Cash can only be taken while it is open. Closing records any shortfall or surplus.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  cashierId: { type: mongoose.Schema.Types.ObjectId, required: true }, cashierName: { type: String, default: '' },
  openedAt: { type: Date, default: Date.now }, openingFloat: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
  closedAt: Date, cashIn: { type: Number, default: 0 }, cashOut: { type: Number, default: 0 },
  expectedCash: { type: Number, default: 0 }, countedCash: { type: Number, default: 0 }, variance: { type: Number, default: 0 },
  varianceNote: { type: String, default: '' }, depositSlip: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, cashierId: 1, status: 1 });
schema.index({ schoolId: 1, openedAt: -1 });

module.exports = mongoose.model('CashierSession', schema);
