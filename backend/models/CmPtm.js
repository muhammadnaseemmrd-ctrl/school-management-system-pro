const mongoose = require('../lib/pgdoc');
// A parent-teacher meeting day (PRD E20). Publishing makes the slots; families book them until the booking window closes.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, title: { type: String, required: true }, note: { type: String, default: '' },
  classIds: [{ type: mongoose.Schema.Types.ObjectId }], teacherIds: [{ type: mongoose.Schema.Types.ObjectId }],
  sessions: [{ day: String, from: String, to: String }], slotMinutes: { type: Number, default: 10 },
  mode: { type: String, enum: ['in-person', 'online', 'phone'], default: 'in-person' }, place: { type: String, default: '' },
  opensAt: { type: Date, required: true }, closesAt: { type: Date, required: true }, maxPerFamily: { type: Number, default: 6 }, cancelHoursBefore: { type: Number, default: 4 },
  status: { type: String, enum: ['Draft', 'Open', 'Closed', 'Cancelled'], default: 'Draft' }, publishedAt: Date, createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, closesAt: -1 });
module.exports = mongoose.model('CmPtm', schema);
