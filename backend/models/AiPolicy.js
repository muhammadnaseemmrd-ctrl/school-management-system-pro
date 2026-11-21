// The school's rules for the writing assistant (PRD E31): off until a school-wide administrator turns it on and a second one approves.
// `active` is what is in force; `pending` is a proposed change waiting for a different administrator. Nothing here is a model setting
// that could let student data be used to train a model: that is fixed as "excluded".
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  version: { type: Number, default: 0 },
  active: { type: mongoose.Schema.Types.Mixed, default: null },
  pending: { type: mongoose.Schema.Types.Mixed, default: null },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  glossary: { type: [mongoose.Schema.Types.Mixed], default: [] },       // [{ en, ur }] kept by an administrator, used by the translation aid
  glossaryAt: Date, glossaryByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1 }, { unique: true });

module.exports = mongoose.model('AiPolicy', schema);
