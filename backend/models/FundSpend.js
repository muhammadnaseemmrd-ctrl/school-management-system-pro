// Spending from a restricted fund (PRD E32). It must fit the fund's allowed uses and be approved by a different person.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  fundId: { type: ObjectId, required: true },
  amount: { type: Number, required: true, min: 1 },
  category: { type: String, required: true, maxlength: 60 },
  description: { type: String, required: true, maxlength: 300 },
  status: { type: String, enum: ['Requested', 'Approved', 'Declined'], default: 'Requested' },
  variation: { type: Mixed, default: null },      // { note } when the donor allowed a different use
  requestedById: ObjectId, requestedByName: String, decidedById: ObjectId, decidedByName: String, decidedAt: Date, decisionNote: { type: String, default: '' }, soleAdmin: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ schoolId: 1, fundId: 1, status: 1 });
module.exports = mongoose.model('FundSpend', schema);
