const mongoose = require('../lib/pgdoc');
// One observation against a milestone. The words are descriptive (Exploring, Practising, Confident); nothing here is a score and nothing ranks children.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, required: true }, frameworkId: { type: mongoose.Schema.Types.ObjectId, required: true }, frameworkVersion: { type: Number, default: 1 },
  areaKey: { type: String, required: true }, itemKey: { type: String, required: true },
  level: { type: String, enum: ['Exploring', 'Practising', 'Confident'], required: true }, note: { type: String, default: '' },
  mediaIds: [mongoose.Schema.Types.ObjectId], at: { type: Date, default: Date.now }, day: { type: String, required: true },
  byId: mongoose.Schema.Types.ObjectId, byName: { type: String, default: '' }, planId: mongoose.Schema.Types.ObjectId,
  state: { type: String, enum: ['Active', 'Voided'], default: 'Active' }, voidReason: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, childId: 1, state: 1, at: -1 });
schema.index({ schoolId: 1, roomId: 1, itemKey: 1, state: 1 });
module.exports = mongoose.model('EyObs', schema);
