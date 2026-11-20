const mongoose = require('../lib/pgdoc');
// A nursery room (PRD E15, CAP-0271/0272). Children are placed in one room at a time; the room decides who may see their care records.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  name: { type: String, required: true, trim: true }, nameKey: { type: String, required: true },
  ageBand: { type: String, enum: ['baby', 'toddler', 'twos', 'preschool', 'mixed'], default: 'preschool' },
  capacity: { type: Number, default: 12 },
  ratio: { type: Number, default: 0 },                        // children per adult for this room; 0 means the school's value for the age band
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  staffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }],
  active: { type: Boolean, default: true }, notes: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, nameKey: 1 }, { unique: true });
schema.index({ schoolId: 1, active: 1 });
schema.index({ schoolId: 1, staffIds: 1 });
module.exports = mongoose.model('EyRoom', schema);
