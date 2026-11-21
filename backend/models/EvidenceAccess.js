// Who opened or changed incident evidence. Append-only (PRD E34).
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  incidentId: { type: ObjectId, required: true },
  action: { type: String, required: true },
  byId: ObjectId, byName: { type: String, default: '' }, byRole: { type: String, default: '' },
  detail: { type: Mixed, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, incidentId: 1, createdAt: -1 });
module.exports = mongoose.model('EvidenceAccess', schema);
