// A policy or area that is reviewed on a schedule (PRD E32, CAP-0491).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  title: { type: String, required: true, maxlength: 120 },
  area: { type: String, default: '', maxlength: 80 },
  ownerName: { type: String, default: '' }, ownerId: ObjectId,
  intervalMonths: { type: Number, default: 12 },
  nextDueOn: { type: String, required: true }, lastReviewedOn: { type: String, default: '' },
  history: { type: [Mixed], default: [] },       // [{ on, byName, outcome, note }]
  remindedOn: { type: String, default: '' },
  retired: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, retired: 1, nextDueOn: 1 });
module.exports = mongoose.model('QaCycle', schema);
