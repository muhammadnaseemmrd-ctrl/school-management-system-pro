// A rule of the school with a value for the whole group of campuses and, where the group allows it, a value for one campus
// (PRD E26 CampusPolicy). One document per school, key and scope; every change is a new version that someone else publishes.
const mongoose = require('../lib/pgdoc');

const version = new mongoose.Schema({
  version: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'published', 'superseded', 'rejected'], default: 'pending' },
  value: { type: Number, default: null },                  // null on a campus = no override, use the group value
  locked: { type: Boolean, default: false },               // group only: campuses may not override this rule
  lo: { type: Number, default: null }, hi: { type: Number, default: null },   // group only: the range a campus value must stay inside
  reason: { type: String, default: '' },
  madeById: mongoose.Schema.Types.ObjectId, madeByName: { type: String, default: '' }, madeByCampus: { type: Boolean, default: false }, madeAt: { type: Date, default: Date.now },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, decisionNote: { type: String, default: '' },
  soleAdmin: { type: Boolean, default: false },            // decided by the only school-wide administrator (recorded as such)
  publishedAt: Date,
}, { _id: false });

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  key: { type: String, required: true },
  scope: { type: String, enum: ['group', 'campus'], required: true },
  campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },
  scopeKey: { type: String, required: true },              // 'group' or the campus id
  published: { type: Number, default: 0 },
  counter: { type: Number, default: 0 },
  versions: { type: [version], default: [] },
}, { timestamps: true });

schema.index({ schoolId: 1, key: 1, scopeKey: 1 }, { unique: true });
schema.index({ schoolId: 1, scope: 1, campusId: 1 });

module.exports = mongoose.model('CampusPolicy', schema);
