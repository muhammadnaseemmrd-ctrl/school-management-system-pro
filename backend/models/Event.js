const mongoose = require('../lib/pgdoc');

const eventSchema = new mongoose.Schema(
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
    description: String,
    eventType: {
      type: String,
      enum: ['Academic', 'Sports', 'Cultural', 'Holiday', 'Exam', 'Other'],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: Date,
    location: String,
    isHoliday: {
      type: Boolean,
      default: false,
    },
    attachments: [String],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'createdByModel',
    },
    createdByModel: {
      type: String,
      enum: ['User', 'Teacher'],
      default: 'User',
    },
  },
  { timestamps: true }
);

// Query paths (indexing is part of the schema, so every environment gets it)
eventSchema.index({ schoolId: 1, startDate: 1 });

module.exports = mongoose.model('Event', eventSchema);
