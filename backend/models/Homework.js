const mongoose = require('../lib/pgdoc');

const homeworkSchema = new mongoose.Schema(
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
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    fileUrl: String,
    dueDate: {
      type: Date,
      required: true,
    },
    totalStudents: Number,
    submittedCount: {
      type: Number,
      default: 0,
    },
    submissions: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Student',
        },
        fileUrl: String,
        submittedDate: Date,
        status: {
          type: String,
          enum: ['Submitted', 'Late', 'Not Submitted'],
          default: 'Not Submitted',
        },
        reasonForMissing: {
          type: String,
          default: '',
        },
        marks: Number,
        feedback: String,
      },
    ],
  },
  { timestamps: true }
);

// Query paths (indexing is part of the schema, so every environment gets it)
homeworkSchema.index({ schoolId: 1, classId: 1, dueDate: -1 });
homeworkSchema.index({ schoolId: 1, teacherId: 1, createdAt: -1 });

module.exports = mongoose.model('Homework', homeworkSchema);
