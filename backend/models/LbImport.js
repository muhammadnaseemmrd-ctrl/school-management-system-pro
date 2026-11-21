const mongoose = require('../lib/pgdoc');

// One committed catalogue import. The key is a hash of the rows and decisions, so committing the same file twice does nothing the second time.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  ckey: { type: String, required: true }, rows: { type: Number, default: 0 },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} }, byName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ ckey: 1 }, { unique: true });
module.exports = mongoose.model('LbImport', schema);
