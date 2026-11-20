const mongoose = require('../lib/pgdoc');
// A learning plan goal, a personal goal or an achievement (PRD E21: Goal, Achievement).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' },
  kind: { type: String, enum: ['iep', 'personal', 'achievement'], default: 'personal' }, title: { type: String, required: true }, target: { type: String, default: '' }, dueOn: { type: String, default: '' },
  progress: { type: Number, default: 0 }, status: { type: String, enum: ['Active', 'Met', 'Dropped'], default: 'Active' }, shared: { type: Boolean, default: true },
  ownerId: mongoose.Schema.Types.ObjectId, ownerRole: { type: String, default: '' }, ownerName: { type: String, default: '' },
  reviews: [{ at: { type: Date, default: Date.now }, progress: Number, note: String, byName: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
module.exports = mongoose.model('CareGoal', schema);
