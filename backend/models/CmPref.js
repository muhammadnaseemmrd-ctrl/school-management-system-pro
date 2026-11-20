const mongoose = require('../lib/pgdoc');
// One person's contact preferences (PRD E20): the language they read, quiet hours they add to the school's, and whether to push.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, role: { type: String, required: true }, userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  lang: { type: String, enum: ['en', 'ur'], default: 'en' },
  quietOn: { type: Boolean, default: false }, quietFrom: { type: String, default: '21:00' }, quietTo: { type: String, default: '07:00' },
  push: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ schoolId: 1, role: 1, userId: 1 }, { unique: true });
module.exports = mongoose.model('CmPref', schema);
