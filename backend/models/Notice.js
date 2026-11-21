const mongoose = require('../lib/pgdoc');

const noticeSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['General', 'Event', 'Achievement', 'Exam', 'Result'],
      default: 'General',
    },
    content: {
      type: String,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'createdByModel',
      required: true,
    },
    createdByModel: {
      type: String,
      required: true,
      enum: ['User', 'Teacher'],
      default: 'User',
    },
    attachments: [String],
    targetAudience: {
      type: String,
      enum: ['All', 'Students', 'Teachers', 'Class Specific', 'Individual'],
      required: true,
    },
    targetClassId: mongoose.Schema.Types.ObjectId,
    targetUserId: mongoose.Schema.Types.ObjectId,
    isPinned: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    viewedBy: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        viewedDate: Date,
      },
    ],
    expiresAt: {
      type: Date,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      default: null,
    },
    // written with the assistant and approved by a person (E31): families can see that, and who checked it
    aiAssisted: { type: Boolean, default: false },
    aiDraftNo: { type: String, default: '' },
    aiReviewedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

// Query paths (indexing is part of the schema, so every environment gets it)
noticeSchema.index({ schoolId: 1, isPinned: -1, createdAt: -1 });
noticeSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Notice', noticeSchema);
