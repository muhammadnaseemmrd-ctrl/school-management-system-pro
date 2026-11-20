const mongoose = require('../lib/pgdoc');
// A photo from the room. It reaches a family only through a reviewed diary or portfolio entry, only for children whose family has agreed to photos.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, roomId: { type: mongoose.Schema.Types.ObjectId, required: true },
  childIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }], day: { type: String, required: true },
  alt: { type: String, required: true }, caption: { type: String, default: '' },
  mime: { type: String, default: 'image/jpeg' }, size: { type: Number, default: 0 }, sha: { type: String, default: '' }, image: { type: Buffer },
  state: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  byId: mongoose.Schema.Types.ObjectId, byName: { type: String, default: '' }, reviewedByName: { type: String, default: '' }, reviewedAt: Date, reviewNote: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, roomId: 1, day: 1 });
schema.index({ schoolId: 1, childIds: 1, state: 1 });
module.exports = mongoose.model('EyMedia', schema);
