const mongoose = require('../lib/pgdoc');
// A school's own wording for a label (PRD E27 localization manager). The English text is the key.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, lang: { type: String, enum: ['ur'], default: 'ur' },
  source: { type: String, required: true }, text: { type: String, required: true }, note: { type: String, default: '' }, updatedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, lang: 1, source: 1 }, { unique: true });
module.exports = mongoose.model('TranslationOverride', schema);
