const mongoose = require('../lib/pgdoc');

// A training course (PRD E17). `draft` is what is being written; `live` is the frozen copy learners see, replaced only by an approved publish.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  slug: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  level: { type: String, default: 'beginner' },
  language: { type: String, default: 'en' },
  instructorIds: [{ type: mongoose.Schema.Types.ObjectId }],
  price: { type: Number, default: 0, min: 0 },
  access: { days: { type: Number, default: 0 } },                 // 0 means no end date
  refundDays: { type: Number, default: null },                    // null = the school policy
  installments: { max: { type: Number, default: 1 }, accessAfter: { type: String, default: 'first' } },
  discussion: { type: String, default: 'moderated' },             // open | moderated | off
  landing: { headline: String, outcomes: [String], requirements: [String], audience: String, faq: [{ _id: false, q: String, a: String }] },
  skills: [{ _id: false, code: String, name: String, level: String }],
  draft: { type: mongoose.Schema.Types.Mixed, default: () => ({ modules: [] }) },
  live: { type: mongoose.Schema.Types.Mixed, default: null },     // { version, modules, publishedAt, hash, skills }
  status: { type: String, enum: ['draft', 'review', 'published', 'archived'], default: 'draft' },
  version: { type: Number, default: 0 },
  authorName: { type: String, default: '' }, authorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, default: null }, decision: { type: mongoose.Schema.Types.Mixed, default: null },
  history: [{ _id: false, at: Date, byName: String, change: String }],
}, { timestamps: true });
schema.index({ schoolId: 1, slug: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });
module.exports = mongoose.model('TrCourse', schema);
