const mongoose = require('../lib/pgdoc');

const classSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    standard: {
      type: String,
      required: [true, 'Standard is required'],
    },
    division: {
      type: String,
      required: true,
    },
    classTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
    },
    capacity: {
      type: Number,
      default: 40,
    },
    studentCount: {
      type: Number,
      default: 0,
    },
    room: String,
    academicYear: String,
    campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', default: null },   // null = the default campus (E01)
    importJobId: { type: String, default: '' },
    rolloverRunId: { type: String, default: '' },
  },
  { timestamps: true }
);

classSchema.index({ schoolId: 1, standard: 1, division: 1 }, { unique: true });

// Query paths (indexing is part of the schema, so every environment gets it)
classSchema.index({ schoolId: 1, classTeacherId: 1 });
classSchema.index({ schoolId: 1, campusId: 1 });

module.exports = mongoose.model('Class', classSchema);
