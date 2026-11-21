// A graduate of the school (PRD E32, CAP-0485/0486). Contact details exist only while the person has agreed; the person controls what others see through a private link.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, maxlength: 120 },
  gradYear: { type: Number, required: true },
  classLabel: { type: String, default: '', maxlength: 60 },
  studentId: { type: ObjectId, default: null },
  state: { type: String, enum: ['Invited', 'Active', 'Withdrawn', 'Erased'], default: 'Invited' },
  linkHash: { type: String, default: '' }, linkPrefix: { type: String, default: '' },
  consent: { type: Mixed, default: {} },       // { contact, channels[], directory: hidden|visible, events, updatedAt, source: self|staff, note }
  contact: { type: Mixed, default: {} },       // { email, phone } kept only while consent.contact is true
  profile: { type: Mixed, default: {} },       // { headline, city, employer, field }
  employment: { type: Mixed, default: {} },    // { status, sector, year, answeredAt } given voluntarily
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, state: 1, gradYear: -1 });
schema.index({ linkPrefix: 1 });
schema.index({ schoolId: 1, studentId: 1 });
module.exports = mongoose.model('AlumniProfile', schema);
