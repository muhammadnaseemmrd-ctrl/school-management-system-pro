// The teacher time pulse (PRD E25, opt-in). 'optin' rows record the choice; 'entry' rows are a teacher's own weekly minutes.
// Nobody but the teacher ever reads an entry on its own: reports are averages over at least five people.
const mongoose = require('../lib/pgdoc');

const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['optin', 'entry'], required: true },
  week: { type: String, default: '' },                               // ISO week, e.g. 2026-W47 (entries)
  category: { type: String, default: '' },
  minutes: { type: Number, default: 0 },
  note: { type: String, default: '' },
  optedInAt: Date, optedOutAt: Date, optedIn: { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ schoolId: 1, teacherId: 1, kind: 1, week: 1, category: 1 }, { unique: true });
schema.index({ schoolId: 1, kind: 1, week: 1, category: 1 });

module.exports = mongoose.model('AnPulse', schema);
