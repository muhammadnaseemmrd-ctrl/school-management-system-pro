const mongoose = require('../lib/pgdoc');

// A cash till (PRD E18). A cashier can only sell on a till an administrator has assigned to them.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true }, active: { type: Boolean, default: true },
  assigned: [{ id: mongoose.Schema.Types.ObjectId, name: String }],
  floatAmount: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('StTill', schema);
