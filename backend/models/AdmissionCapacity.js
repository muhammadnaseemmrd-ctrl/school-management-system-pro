const mongoose = require('../lib/pgdoc');

// Seats for one grade in one year. No row means "not limited".
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  academicYear: { type: String, required: true },
  gradeSought: { type: String, required: true, trim: true },
  seats: { type: Number, required: true, min: 0 },
}, { timestamps: true });
schema.index({ schoolId: 1, academicYear: 1, gradeSought: 1 }, { unique: true });

module.exports = mongoose.model('AdmissionCapacity', schema);
