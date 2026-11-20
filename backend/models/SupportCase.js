const mongoose = require('../lib/pgdoc');
// A school asking Aulensia for help (PRD E28). Not the same thing as a student-care case.
const msg = new mongoose.Schema({
  from: { type: String, enum: ['school', 'owner'], required: true }, byName: { type: String, default: '' }, text: { type: String, required: true, maxlength: 4000 },
  internal: { type: Boolean, default: false }, at: { type: Date, default: Date.now },
}, { _id: false });
const schema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  schoolName: { type: String, default: '' }, schoolCode: { type: String, default: '' }, planSlug: { type: String, default: '' },
  openedBy: { type: mongoose.Schema.Types.ObjectId }, openedByName: { type: String, default: '' }, openedByEmail: { type: String, default: '' },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, enum: ['billing', 'technical', 'how-to', 'data', 'security', 'feature', 'other'], default: 'other' },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  status: { type: String, enum: ['Open', 'WaitingOnSchool', 'Resolved', 'Closed'], default: 'Open' },
  messages: { type: [msg], default: [] },
  assigneeName: { type: String, default: '' },
  firstResponseDueAt: Date, firstRespondedAt: Date, resolveDueAt: Date, resolvedAt: Date, closedAt: Date,
  firstResponseBreached: { type: Boolean, default: false }, resolveBreached: { type: Boolean, default: false },
  waitingSince: Date, pausedMs: { type: Number, default: 0 },
  reopened: { type: Number, default: 0 }, rating: { type: Number, min: 1, max: 5 }, ratingNote: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now }, lastFrom: { type: String, default: 'school' },
  clientKey: { type: String, default: undefined },
}, { timestamps: true });
schema.index({ schoolId: 1, lastMessageAt: -1 });
schema.index({ status: 1, priority: 1, lastMessageAt: -1 });
schema.index({ status: 1, firstResponseDueAt: 1 });
schema.index({ schoolId: 1, clientKey: 1 }, { unique: true });
module.exports = mongoose.model('SupportCase', schema);
