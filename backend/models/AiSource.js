// A piece of approved teaching material the assistant may quote and cite (PRD E31, CAP-0503). Nothing is cited that is not here.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  title: { type: String, required: true, maxlength: 120 },
  text: { type: String, required: true, maxlength: 20000 },
  subject: { type: String, default: '', maxlength: 60 },
  grade: { type: String, default: '', maxlength: 30 },
  license: { kind: { type: String, enum: ['original', 'open', 'licensed'], default: 'original' }, source: { type: String, default: '' }, holder: { type: String, default: '' } },
  state: { type: String, enum: ['Pending', 'Approved', 'Retired'], default: 'Pending' },
  hash: { type: String, default: '' },
  addedById: mongoose.Schema.Types.ObjectId, addedByName: { type: String, default: '' }, addedByRole: { type: String, default: '' },
  decidedById: mongoose.Schema.Types.ObjectId, decidedByName: { type: String, default: '' }, decidedAt: Date, soleAdmin: { type: Boolean, default: false },
  decisionNote: { type: String, default: '' },
  uses: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, state: 1, createdAt: -1 });
schema.index({ schoolId: 1, addedById: 1 });

module.exports = mongoose.model('AiSource', schema);
