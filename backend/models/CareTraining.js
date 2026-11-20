const mongoose = require('../lib/pgdoc');
// A staff member's safeguarding or first-aid training (PRD E21: CareTraining).
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, staffId: { type: mongoose.Schema.Types.ObjectId, required: true }, staffModel: { type: String, enum: ['User', 'Teacher'], default: 'Teacher' }, staffName: { type: String, default: '' },
  course: { type: String, enum: ['safeguarding', 'first-aid', 'anti-bullying', 'special-needs', 'mental-health'], required: true }, completedOn: { type: String, required: true }, expiresOn: { type: String, default: '' }, note: { type: String, default: '' }, recordedByName: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, staffId: 1, course: 1, completedOn: -1 });
module.exports = mongoose.model('CareTraining', schema);
