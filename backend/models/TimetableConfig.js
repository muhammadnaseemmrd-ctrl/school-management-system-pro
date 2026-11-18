const mongoose = require('../lib/pgdoc');

// Represents a single break slot in the school day
const breakSlotSchema = new mongoose.Schema({
  name: { type: String, default: 'Break' }, // e.g. "Lunch Break", "Short Break"
  startTime: { type: String, required: true }, // HH:MM
  endTime: { type: String, required: true },   // HH:MM
});

const timetableConfigSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      unique: true,
    },
    schoolStartTime: { type: String, default: '08:00' }, // HH:MM
    schoolEndTime:   { type: String, default: '14:00' }, // HH:MM
    lectureDurationMinutes: { type: Number, default: 45 },
    workingDays: {
      type: [String],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    },
    breaks: [breakSlotSchema],
    maxPeriodsPerDay: { type: Number, default: 7 }, maxPeriodsPerWeek: { type: Number, default: 32 }, maxConsecutive: { type: Number, default: 4 },
    academicYear: { type: String, default: () => {
      const y = new Date().getFullYear();
      return `${y}-${y + 1}`;
    }},
  },
  { timestamps: true }
);

module.exports = mongoose.model('TimetableConfig', timetableConfigSchema);
