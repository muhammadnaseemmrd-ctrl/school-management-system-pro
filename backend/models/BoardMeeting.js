// A board meeting with its agenda, resolutions and minutes (PRD E32, CAP-0493).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  title: { type: String, required: true, maxlength: 140 },
  date: { type: String, required: true },
  status: { type: String, enum: ['Planned', 'Held', 'Cancelled'], default: 'Planned' },
  agenda: { type: [Mixed], default: [] },         // [{ id, title, text, restricted }]
  resolutions: { type: [Mixed], default: [] },    // [{ id, text, outcome, at }]
  minutes: { type: Mixed, default: { status: 'None', text: '', rev: 0 } },   // { status: None|Draft|Approved, text, draftedByName, approvals: [{ byName, byId, at }] }
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, date: -1 });
module.exports = mongoose.model('BoardMeeting', schema);
