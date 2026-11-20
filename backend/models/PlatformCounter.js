const mongoose = require('../lib/pgdoc');
// Next number for platform documents (quotes, invoices, support cases), per prefix and year. Taken with compare-and-set.
const schema = new mongoose.Schema({ key: { type: String, required: true, unique: true }, n: { type: Number, default: 0 } }, { timestamps: true });
module.exports = mongoose.model('PlatformCounter', schema);
