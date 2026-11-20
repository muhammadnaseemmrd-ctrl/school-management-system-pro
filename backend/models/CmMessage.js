const mongoose = require('../lib/pgdoc');
const schema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, required: true }, threadId: { type: mongoose.Schema.Types.ObjectId, required: true },
  fromRole: { type: String, enum: ['parent', 'teacher', 'admin'], required: true }, fromId: { type: mongoose.Schema.Types.ObjectId, required: true }, fromName: { type: String, default: '' },
  en: { type: String, default: '' }, ur: { type: String, default: '' }, wrote: { type: String, enum: ['en', 'ur'], default: 'en' },
  urgent: { type: Boolean, default: false }, urgentReason: { type: String, default: '' }, clientKey: { type: String },
  removedAt: { type: Date, default: null }, removedBy: { type: String, default: '' }, removedWhy: { type: String, default: '' },
}, { timestamps: true });
schema.index({ schoolId: 1, threadId: 1, createdAt: 1 });
schema.index({ schoolId: 1, threadId: 1, clientKey: 1 }, { unique: true });
module.exports = mongoose.model('CmMessage', schema);
