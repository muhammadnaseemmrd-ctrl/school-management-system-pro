const mongoose = require('../lib/pgdoc');
// EarlyYearsCareEntry (PRD E15, CAP-0271). Restricted child-safety data: only the child's room staff and administrators read it.
// A mistake is voided and replaced (the original stays); a family sees an entry only after a reviewed diary has included it.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, required: true }, day: { type: String, required: true }, at: { type: Date, required: true },
  careType: { type: String, enum: ['meal', 'drink', 'nap', 'toilet', 'mood', 'health', 'medication', 'activity', 'observation', 'behavior', 'note'], required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }, text: { type: String, default: '' },
  authorId: mongoose.Schema.Types.ObjectId, authorName: { type: String, default: '' },
  bulkId: { type: String, default: '' }, key: { type: String, default: '' },
  state: { type: String, enum: ['Active', 'Voided'], default: 'Active' }, voidReason: { type: String, default: '' }, voidedByName: { type: String, default: '' }, voidedAt: Date, correctsId: mongoose.Schema.Types.ObjectId,
  discussedAt: Date, discussedWith: { type: String, default: '' },    // a behaviour note can go in a diary only after staff have talked it over with the family
  sharedAt: Date, sharedPostId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });
schema.index({ schoolId: 1, childId: 1, day: 1, at: 1 });
schema.index({ schoolId: 1, roomId: 1, day: 1, careType: 1 });
schema.index({ schoolId: 1, key: 1 }, { unique: true });
module.exports = mongoose.model('EyCare', schema);
