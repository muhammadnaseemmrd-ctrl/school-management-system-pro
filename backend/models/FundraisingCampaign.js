// A fundraising drive with a goal and a public page that shows the goal, the total and where the money goes (PRD E32, CAP-0488).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  code: { type: String, required: true },
  title: { type: String, required: true, maxlength: 120 },
  story: { type: String, default: '', maxlength: 2000 },
  goal: { type: Number, default: 0 },
  startsOn: { type: String, default: '' }, endsOn: { type: String, default: '' },
  fundId: { type: ObjectId, required: true },
  uses: { type: [Mixed], default: [] },           // [{ label, percent }] where the money goes
  status: { type: String, enum: ['Draft', 'Review', 'Live', 'Closed'], default: 'Draft' },
  askedByName: String, askedById: ObjectId, decidedByName: String, decidedById: ObjectId, decidedAt: Date, soleAdmin: { type: Boolean, default: false },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ code: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('FundraisingCampaign', schema);
