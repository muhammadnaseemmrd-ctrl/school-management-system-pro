const mongoose = require('../lib/pgdoc');

// Who may do what for one child, and for how long. The link is effective-dated: ending a link keeps the row,
// so it is always possible to see who had which rights on a given day. A link points at a parent account,
// or names an adult who has no account (a driver, a grandparent) who may be authorised for pickup only.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent' },
  personName: { type: String, default: '', trim: true },
  phone: { type: String, default: '' },
  relationship: { type: String, default: 'Guardian', trim: true },
  isPrimary: { type: Boolean, default: false },
  rights: {
    viewInfo: { type: Boolean, default: true },
    viewAttendance: { type: Boolean, default: true },
    viewMarks: { type: Boolean, default: true },
    viewFees: { type: Boolean, default: true },
    payFees: { type: Boolean, default: true },
    receiveNotices: { type: Boolean, default: true },
    receiveMessages: { type: Boolean, default: true },
    pickup: { type: Boolean, default: false },
  },
  validFrom: { type: Date, default: Date.now },
  validTo: { type: Date, default: null },
  note: { type: String, default: '' },
  endedReason: { type: String, default: '' },
  createdBy: mongoose.Schema.Types.ObjectId,
  createdByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, studentId: 1, validFrom: -1 });
schema.index({ schoolId: 1, parentId: 1, studentId: 1 });
schema.index({ schoolId: 1, validTo: 1 });

module.exports = mongoose.model('GuardianLink', schema);
