const mongoose = require('../lib/pgdoc');

// Limits an administrator to one or more campuses (PRD E01 CampusMembership). An admin with no active membership is
// school-wide; the first membership turns them into a campus admin who sees nothing outside their campuses.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, default: '' },
  campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', required: true },
  campusName: { type: String, default: '' },
  // set while the membership is active, removed when it is taken away: one active row per person and campus
  activeKey: { type: String },
  addedByName: { type: String, default: '' },
  revokedAt: Date,
  revokedByName: { type: String, default: '' },
}, { timestamps: true });

schema.index({ activeKey: 1 }, { unique: true });
schema.index({ schoolId: 1, userId: 1, revokedAt: 1 });
schema.index({ schoolId: 1, campusId: 1, revokedAt: 1 });

module.exports = mongoose.model('CampusMembership', schema);
