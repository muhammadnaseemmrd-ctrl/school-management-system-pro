const mongoose = require('../lib/pgdoc');
// A support case about one student (PRD E21: SupportCase). Confidential cases (safeguarding, bullying) are visible only to their circle and the safeguarding leads.
const ev = new mongoose.Schema({
  at: { type: Date, default: Date.now }, kind: { type: String, default: 'note' }, byId: mongoose.Schema.Types.ObjectId, byName: { type: String, default: '' }, text: { type: String, default: '' },
}, { _id: true });
const act = new mongoose.Schema({
  text: { type: String, required: true }, ownerId: mongoose.Schema.Types.ObjectId, ownerName: { type: String, default: '' }, dueAt: Date,
  status: { type: String, enum: ['Open', 'Done', 'Dropped'], default: 'Open' }, doneAt: Date, outcome: { type: String, default: '' }, at: { type: Date, default: Date.now },
}, { _id: true });
const ref = new mongoose.Schema({
  to: { type: String, required: true }, reason: { type: String, default: '' }, reference: { type: String, default: '' },
  status: { type: String, enum: ['Made', 'Accepted', 'Closed', 'Declined'], default: 'Made' }, at: { type: Date, default: Date.now }, byName: { type: String, default: '' }, byId: mongoose.Schema.Types.ObjectId,
}, { _id: true });
const person = new mongoose.Schema({ id: mongoose.Schema.Types.ObjectId, model: { type: String, enum: ['User', 'Teacher'], default: 'Teacher' }, name: { type: String, default: '' } }, { _id: false });
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, number: { type: String, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true }, studentName: { type: String, default: '' }, classId: { type: mongoose.Schema.Types.ObjectId, default: null },
  category: { type: String, enum: ['learning', 'behaviour', 'wellbeing', 'attendance', 'health', 'family', 'bullying', 'safeguarding', 'other'], required: true },
  level: { type: String, enum: ['watch', 'support', 'intensive'], default: 'support' },
  status: { type: String, enum: ['Open', 'Active', 'Review', 'Closed'], default: 'Open' },
  confidential: { type: Boolean, default: false },
  title: { type: String, required: true }, summary: { type: String, default: '' },
  leadId: { type: mongoose.Schema.Types.ObjectId, default: null }, leadModel: { type: String, default: 'Teacher' }, leadName: { type: String, default: '' },
  circle: [person], openedById: mongoose.Schema.Types.ObjectId, openedByName: { type: String, default: '' }, openedByRole: { type: String, default: '' }, fromReportId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reviewOn: { type: String, default: '' }, // YYYY-MM-DD in the school's calendar
  actions: [act], referrals: [ref], events: [ev],
  closeRequest: { by: mongoose.Schema.Types.ObjectId, byName: String, outcome: String, at: Date },
  closedAt: { type: Date, default: null }, closedByName: { type: String, default: '' }, outcome: { type: String, default: '' }, closeApprovedBy: { type: String, default: '' },
  escalatedAt: { type: Date, default: null }, lastAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ schoolId: 1, number: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, status: 1 });
schema.index({ schoolId: 1, status: 1, lastAt: -1 });
schema.index({ schoolId: 1, leadId: 1, status: 1 });
schema.index({ schoolId: 1, 'circle.id': 1, status: 1 });
schema.index({ schoolId: 1, status: 1, reviewOn: 1 });
module.exports = mongoose.model('CareCase', schema);
