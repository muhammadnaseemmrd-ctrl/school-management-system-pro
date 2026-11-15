const mongoose = require('../lib/pgdoc');

// Files kept inside the database (used when Cloudinary keys are not configured).
// Served through /api/files/stored/:id/:key – `key` is a random secret so the
// link works in <img> tags but cannot be guessed.
const storedFileSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId },
    key: { type: String, required: true },
    originalName: String,
    mimeType: { type: String, required: true },
    size: Number,
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StoredFile', storedFileSchema);
