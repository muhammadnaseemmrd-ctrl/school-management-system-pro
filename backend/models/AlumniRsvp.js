// One graduate's answer to an event invitation.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  eventId: { type: ObjectId, required: true }, alumniId: { type: ObjectId, required: true },
  status: { type: String, enum: ['going', 'maybe', 'no'], required: true },
}, { timestamps: true });
schema.index({ eventId: 1, alumniId: 1 }, { unique: true });
schema.index({ schoolId: 1, eventId: 1 });
module.exports = mongoose.model('AlumniRsvp', schema);
