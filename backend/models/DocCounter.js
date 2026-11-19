const mongoose = require('../lib/pgdoc');
// Next serial number per school, family and year. Taken with compare-and-set so two people issuing at once never share one.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  key: { type: String, required: true },
  n: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, key: 1 }, { unique: true });
module.exports = mongoose.model('DocCounter', schema);
