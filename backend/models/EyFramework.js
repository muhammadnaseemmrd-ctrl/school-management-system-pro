const mongoose = require('../lib/pgdoc');
// A set of milestones, grouped by area and age window (CAP-0273). Aulensia's own framework is built in; a school copies it to change it, and a published version never changes.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, key: { type: String, required: true }, version: { type: Number, default: 1 },
  name: { type: String, required: true }, origin: { type: String, enum: ['aulensia', 'school'], default: 'school' }, license: { type: String, default: '' },
  areas: [{ key: String, label: String, labelUr: String, items: [{ key: String, label: String, labelUr: String, fromMonths: Number, toMonths: Number }] }],
  status: { type: String, enum: ['Draft', 'Published', 'Archived'], default: 'Draft' }, byName: { type: String, default: '' }, publishedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, key: 1, version: -1 });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('EyFramework', schema);
