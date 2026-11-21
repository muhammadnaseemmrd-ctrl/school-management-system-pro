// A standard the school is reviewed against (PRD E32, CAP-0490).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  framework: { type: String, required: true, maxlength: 80 },
  code: { type: String, required: true, maxlength: 30 },
  title: { type: String, required: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 600 },
  ownerName: { type: String, default: '' }, ownerId: ObjectId,
  retired: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, framework: 1, code: 1 }, { unique: true });
module.exports = mongoose.model('AccStandard', schema);
