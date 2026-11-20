const mongoose = require('../lib/pgdoc');
// A school's own activity (phonics, tracing, story, sensory ...). Aulensia's original activities are built in and copied to change. Content of unknown origin cannot be published.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['phonics', 'tracing', 'matching', 'story', 'audio', 'worksheet', 'motor', 'sensory', 'routine', 'game', 'other'], default: 'other' },
  lang: { type: String, enum: ['en', 'ur', 'both'], default: 'en' }, ageFromMonths: { type: Number, default: 24 }, ageToMonths: { type: Number, default: 60 }, areaKey: { type: String, default: '' },
  summary: { type: String, default: '' }, materials: [String], steps: [String], body: { type: String, default: '' }, transcript: { type: String, default: '' },
  safety: { supervision: { type: String, enum: ['adult-close', 'adult-near', 'adult-present'], default: 'adult-near' }, smallParts: { type: Boolean, default: false }, allergens: { type: Boolean, default: false }, notes: { type: String, default: '' } },
  durationMin: { type: Number, default: 15 }, groupMin: { type: Number, default: 1 }, groupMax: { type: Number, default: 6 }, adultFacilitated: { type: Boolean, default: true },
  audio: { type: Buffer }, audioMime: { type: String, default: '' }, audioSize: { type: Number, default: 0 }, audioSha: { type: String, default: '' },
  license: { kind: { type: String, enum: ['own', 'open', 'licensed', 'unknown'], default: 'unknown' }, statement: { type: String, default: '' }, holder: { type: String, default: '' } },
  state: { type: String, enum: ['Draft', 'Published', 'Archived'], default: 'Draft' }, copiedFrom: { type: String, default: '' },
  authorId: mongoose.Schema.Types.ObjectId, authorName: { type: String, default: '' }, publishedByName: { type: String, default: '' }, publishedAt: Date,
}, { timestamps: true });
schema.index({ schoolId: 1, state: 1, kind: 1 });
schema.index({ schoolId: 1, authorId: 1, createdAt: -1 });
module.exports = mongoose.model('EyActivity', schema);
