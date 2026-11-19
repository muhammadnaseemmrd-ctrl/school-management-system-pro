const mongoose = require('../lib/pgdoc');
// SyncRevision (PRD E11): the server's version number of one thing a device can edit offline.
const { ObjectId } = mongoose.Schema.Types;
const s = new mongoose.Schema({
  schoolId: { type: ObjectId, required: true }, entityKey: { type: String, required: true }, revision: { type: Number, default: 1 },
  lastById: { type: ObjectId }, lastByName: { type: String, default: '' }, lastMutationId: { type: String, default: '' },
}, { timestamps: true });
s.index({ schoolId: 1, entityKey: 1 }, { unique: true });
module.exports = mongoose.model('SyncRevision', s);
