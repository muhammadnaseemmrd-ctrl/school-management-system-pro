const mongoose = require('../lib/pgdoc');

// Every change to stock, forever (PRD E18). Nothing here is edited or removed: a mistake is corrected by another movement.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  skuId: { type: mongoose.Schema.Types.ObjectId, required: true }, sku: { type: String, default: '' },
  qty: { type: Number, required: true },                      // plus for stock in, minus for stock out; counts the shelf (onHand)
  kind: { type: String, enum: ['receive', 'sale', 'return', 'writeoff', 'count', 'adjust', 'pickup'], required: true },
  reserveChange: { type: Number, default: 0 },                // change to reserved stock, when a pickup is held or released
  refType: { type: String, default: '' }, refId: { type: mongoose.Schema.Types.ObjectId, default: null }, refNo: { type: String, default: '' },
  unitCost: { type: Number, default: 0 }, supplier: { type: String, default: '' }, reason: { type: String, default: '' },
  balanceAfter: { type: Number, default: 0 }, byId: { type: mongoose.Schema.Types.ObjectId, default: null }, byName: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ schoolId: 1, skuId: 1, createdAt: -1 });
schema.index({ schoolId: 1, kind: 1, createdAt: -1 });
module.exports = mongoose.model('StMovement', schema);
