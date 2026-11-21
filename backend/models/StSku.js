const mongoose = require('../lib/pgdoc');

// One thing the school store sells: a size of a shirt is its own item (PRD E18). `onHand` is what is on the shelf, `reserved` is held for a pickup,
// `available` is the difference. All three are changed only by conditional writes that also write an append-only StMovement.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  sku: { type: String, required: true, uppercase: true, trim: true }, name: { type: String, required: true, trim: true },
  group: { type: String, default: '' }, variant: { type: String, default: '' },            // "Boys shirt" + "Size 32"
  category: { type: String, enum: ['uniform', 'book', 'stationery', 'other'], default: 'other' },
  titleId: { type: mongoose.Schema.Types.ObjectId, default: null },
  price: { type: Number, required: true, min: 0 }, cost: { type: Number, default: 0 },
  onHand: { type: Number, default: 0 }, reserved: { type: Number, default: 0 }, available: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 0 }, lowNotedAt: { type: Date, default: null },
  active: { type: Boolean, default: true }, barcode: { type: String },
}, { timestamps: true });
schema.index({ schoolId: 1, sku: 1 }, { unique: true });
schema.index({ schoolId: 1, barcode: 1 }, { unique: true });
schema.index({ schoolId: 1, active: 1, category: 1, name: 1 });
module.exports = mongoose.model('StSku', schema);
