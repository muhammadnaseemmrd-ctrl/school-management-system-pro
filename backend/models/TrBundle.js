const mongoose = require('../lib/pgdoc');

// Several courses sold together, or a learning path done in order (PRD E17).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  slug: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  courseIds: [{ type: mongoose.Schema.Types.ObjectId }],
  ordered: { type: Boolean, default: false },                       // each course opens when the one before is complete
  price: { type: Number, default: 0, min: 0 },
  accessDays: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
}, { timestamps: true });
schema.index({ schoolId: 1, slug: 1 }, { unique: true });
module.exports = mongoose.model('TrBundle', schema);
