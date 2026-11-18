const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  fileName: { type: String, default: '' }, checksum: { type: String, required: true },
  rows: { type: Number, default: 0 }, imported: { type: Number, default: 0 }, duplicates: { type: Number, default: 0 }, errors: { type: Number, default: 0 },
  importedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, checksum: 1 }, { unique: true });
schema.index({ schoolId: 1, createdAt: -1 });

module.exports = mongoose.model('BankStatementBatch', schema);
