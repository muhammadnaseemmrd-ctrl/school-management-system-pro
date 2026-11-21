// An event for graduates (PRD E32). Only people who agreed to hear about events are told.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  title: { type: String, required: true, maxlength: 120 },
  startsAt: { type: Date, required: true },
  place: { type: String, default: '', maxlength: 160 },
  description: { type: String, default: '', maxlength: 1500 },
  capacity: { type: Number, default: 0 },
  status: { type: String, enum: ['Draft', 'Published', 'Closed', 'Cancelled'], default: 'Draft' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, status: 1, startsAt: 1 });
module.exports = mongoose.model('AlumniEvent', schema);
