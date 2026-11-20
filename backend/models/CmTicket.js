const mongoose = require('../lib/pgdoc');
// A help request from a family (PRD E20: Ticket). Clocks run in the school's working hours and stop while the school waits for the family.
const ev = new mongoose.Schema({
  at: { type: Date, default: Date.now }, byRole: String, byId: mongoose.Schema.Types.ObjectId, byName: { type: String, default: '' },
  kind: { type: String, enum: ['comment', 'note', 'status', 'assign', 'priority', 'sla', 'rating'], required: true },
  en: { type: String, default: '' }, ur: { type: String, default: '' }, data: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: true });
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, number: { type: String, required: true },
  category: { type: String, enum: ['fees', 'academics', 'attendance', 'transport', 'documents', 'admission', 'health', 'complaint', 'safety', 'other'], required: true },
  priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
  status: { type: String, enum: ['Open', 'In progress', 'Waiting on family', 'Resolved', 'Closed'], default: 'Open' },
  subject: { type: String, required: true }, body: { type: String, default: '' }, wrote: { type: String, enum: ['en', 'ur'], default: 'en' },
  parentId: { type: mongoose.Schema.Types.ObjectId, required: true }, parentName: { type: String, default: '' },
  studentId: { type: mongoose.Schema.Types.ObjectId, default: null }, studentName: { type: String, default: '' },
  assigneeId: { type: mongoose.Schema.Types.ObjectId, default: null }, assigneeName: { type: String, default: '' },
  restricted: { type: Boolean, default: false }, // safety tickets: administrators only
  firstResponseDueAt: Date, resolveDueAt: Date, firstResponseAt: { type: Date, default: null }, resolvedAt: { type: Date, default: null }, closedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null }, breach: { type: String, enum: ['', 'first', 'resolve'], default: '' }, breachedAt: { type: Date, default: null }, reopened: { type: Number, default: 0 },
  rating: { type: Number, default: 0 }, ratingNote: { type: String, default: '' },
  lastAt: { type: Date, default: Date.now }, lastFrom: { type: String, default: '' }, parentReadAt: { type: Date, default: null },
  events: [ev],
}, { timestamps: true });
schema.index({ schoolId: 1, number: 1 }, { unique: true });
schema.index({ schoolId: 1, parentId: 1, lastAt: -1 });
schema.index({ schoolId: 1, status: 1, lastAt: -1 });
schema.index({ schoolId: 1, status: 1, firstResponseDueAt: 1 });
schema.index({ schoolId: 1, status: 1, resolveDueAt: 1 });
schema.index({ schoolId: 1, assigneeId: 1, status: 1 });
module.exports = mongoose.model('CmTicket', schema);
