const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { authenticate } = require('../middleware/auth');
const { featureGate } = require('../utils/plans');
const StoredFile = require('../models/StoredFile');

// Vercel functions accept ~4.5 MB bodies, so keep uploads under 4 MB
// (the web app shrinks photos before uploading).
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error('This file type is not allowed. Use an image, PDF or Office document.'));
  },
});

const cloudinaryOn = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const toCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    cloudinary.uploader
      .upload_stream({ resource_type: 'auto', folder: 'school_management' }, (err, result) => (err ? reject(err) : resolve(result)))
      .end(buffer);
  });

// Payment screenshots, profile files and school logos are allowed on every plan; other uploads follow the "fileUploads" feature.
const gate = (req, res, next) => (['payment', 'profile', 'branding'].includes(req.query.purpose) ? next() : featureGate('fileUploads')(req, res, next));

router.post('/', authenticate, gate, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 4 MB).' : err.message;
      return res.status(400).json({ message });
    }
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      if (cloudinaryOn()) {
        try {
          const result = await toCloudinary(req.file.buffer);
          return res.json({ url: result.secure_url, storage: 'cloudinary' });
        } catch (e) {
          console.error('Cloudinary upload failed, storing in the database instead:', e.message);
        }
      }

      const key = crypto.randomBytes(16).toString('hex');
      const doc = await StoredFile.create({
        schoolId: req.user.schoolId,
        uploadedBy: req.user.userId,
        key,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer,
      });
      // Relative-to-host URL so it works on any domain
      const url = `${req.protocol}://${req.get('host')}/api/files/stored/${doc._id}/${key}`;
      return res.json({ url, storage: 'database' });
    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({ message: 'Server error during file upload' });
    }
  });
});

module.exports = router;
