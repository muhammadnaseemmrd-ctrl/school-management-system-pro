const mongoose = require('../lib/pgdoc');

const timetableSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    dayOfWeek: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      required: true,
    },
    slots: [
      {
        startTime: String, // HH:MM format
        endTime: String,
        subjectId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Subject',
        },
        teacherId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Teacher',
        },
        isBreak: {
          type: Boolean,
          default: false,
        },
        breakName: {
          type: String,
          default: '',
        },
        room: String,
        // a manual edit is kept when the timetable is generated again
        locked: { type: Boolean, default: false },
        editedByName: { type: String, default: '' },
      },
    ],
    academicYear: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

timetableSchema.index({ schoolId: 1, classId: 1, dayOfWeek: 1 }, { unique: true });

module.exports = mongoose.model('Timetable', timetableSchema);
