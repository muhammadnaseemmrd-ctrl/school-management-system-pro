const mongoose = require('../lib/pgdoc');
// Who opened which sensitive record, and by which right (PRD E21: every read of confidential care data is recorded).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, entity: { type: String, enum: ['case', 'health', 'notes', 'report'], required: true }, entityId: { type: String, default: '' },
  studentId: { type: mongoose.Schema.Types.ObjectId, default: null }, actorId: mongoose.Schema.Types.ObjectId, actorRole: { type: String, default: '' }, actorName: { type: String, default: '' },
  via: { type: String, default: '' }, at: { type: Date, default: Date.now },
});
schema.index({ schoolId: 1, at: -1 });
schema.index({ schoolId: 1, entity: 1, entityId: 1, at: -1 });
schema.index({ schoolId: 1, studentId: 1, at: -1 });
module.exports = mongoose.model('CareAccessLog', schema);
