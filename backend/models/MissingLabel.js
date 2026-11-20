const mongoose = require('../lib/pgdoc');
// A label seen on screen in Urdu that has no Urdu text yet (counted, never the person who saw it).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, lang: { type: String, enum: ['ur'], default: 'ur' },
  source: { type: String, required: true }, count: { type: Number, default: 0 }, lastSeenAt: { type: Date, default: Date.now }, status: { type: String, enum: ['Open', 'Dismissed'], default: 'Open' },
}, { timestamps: true });
schema.index({ schoolId: 1, lang: 1, source: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, count: -1 });
module.exports = mongoose.model('MissingLabel', schema);
