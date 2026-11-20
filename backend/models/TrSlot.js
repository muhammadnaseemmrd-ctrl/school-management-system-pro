const mongoose = require('../lib/pgdoc');

// A one-to-one office-hours slot with an instructor (PRD E17). Booking is a conditional write, so two learners cannot take the same slot.
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrCourse', required: true },
  instructorId: { type: mongoose.Schema.Types.ObjectId, required: true }, instructorName: { type: String, default: '' },
  startsAt: { type: Date, required: true }, minutes: { type: Number, default: 20 },
  mode: { type: String, default: 'online' }, link: { type: String, default: '' }, venue: { type: String, default: '' },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, default: null }, bookedName: { type: String, default: '' }, bookedAt: { type: Date, default: null }, topic: { type: String, default: '' },
  status: { type: String, enum: ['open', 'booked', 'attended', 'missed', 'cancelled'], default: 'open' },
  followUp: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, courseId: 1, status: 1, startsAt: 1 });
schema.index({ schoolId: 1, bookedBy: 1 });
module.exports = mongoose.model('TrSlot', schema);
