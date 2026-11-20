const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, title: { type: String, required: true }, category: { type: String, default: '' },
  en: { type: String, default: '' }, ur: { type: String, default: '' }, active: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ schoolId: 1, active: 1, title: 1 });
module.exports = mongoose.model('CmCanned', schema);
