// A finding from an audit, with an action plan and independent closure (PRD E32, CAP-0492).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  no: { type: String, required: true },
  title: { type: String, required: true, maxlength: 160 },
  detail: { type: String, default: '', maxlength: 1200 },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  standardId: { type: ObjectId, default: null },
  raisedById: ObjectId, raisedByName: { type: String, default: '' },
  ownerId: ObjectId, ownerName: { type: String, default: '' },
  dueOn: { type: String, default: '' },
  status: { type: String, enum: ['Open', 'Planned', 'Closed'], default: 'Open' },
  plan: { type: String, default: '', maxlength: 800 },
  closure: { type: Mixed, default: null },        // { note, evidence, byName, byId, at }
  trail: { type: [Mixed], default: [] },
}, { timestamps: true });
schema.index({ schoolId: 1, no: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1, dueOn: 1 });
module.exports = mongoose.model('AuditFinding', schema);
