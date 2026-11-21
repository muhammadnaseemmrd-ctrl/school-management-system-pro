// Who may open the board papers (PRD E32, CAP-0493). Membership, not job title, decides.
const mongoose = require('../lib/pgdoc');
const { ObjectId, Mixed } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  schoolId: { type: ObjectId, ref: 'School', required: true },
  userId: { type: ObjectId, required: true }, userName: { type: String, default: '' }, userRole: { type: String, default: 'admin' },
  role: { type: String, enum: ['chair', 'secretary', 'member', 'observer'], default: 'member' },
  active: { type: Boolean, default: true },
  from: { type: String, default: '' }, to: { type: String, default: '' },
  activeKey: { type: String, default: null },
}, { timestamps: true });
schema.index({ schoolId: 1, active: 1 });
schema.index({ activeKey: 1 }, { unique: true });
module.exports = mongoose.model('BoardMember', schema);
