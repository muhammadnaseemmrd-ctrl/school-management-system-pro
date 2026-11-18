const mongoose = require('../lib/pgdoc');

const examSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: false,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: String,
    endTime: String,
    totalMarks: {
      type: Number,
      default: 100,
    },
    passingMarks: {
      type: Number,
      default: 35,
    },
    duration: String,
  },
  { timestamps: true }
);

// Query paths (indexing is part of the schema, so every environment gets it)
examSchema.index({ schoolId: 1, classId: 1, date: 1 });
examSchema.index({ schoolId: 1, date: -1 });

module.exports = mongoose.model('Exam', examSchema);
