const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { authenticate } = require('../middleware/auth');
const StoredFile = require('../models/StoredFile');

/**
 * GET /api/files/stored/:id/:key  – files kept in MongoDB. The random key is the secret.
 */
router.get('/stored/:id/:key', async (req, res) => {
  try {
    const f = await StoredFile.findById(req.params.id);
    if (!f || f.key !== req.params.key) return res.status(404).json({ message: 'File not found' });
    const inline = f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf';
    res.set({
      'Content-Type': f.mimeType,
      'Content-Length': f.data.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(f.originalName || 'file')}"`,
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(f.data);
  } catch (e) {
    res.status(404).json({ message: 'File not found' });
  }
});

/**
 * GET /api/files/view
 * Proxies a file from Cloudinary (or any other URL stored internally)
 * so the actual storage provider URL is never exposed to the client.
 * Query param: url  (the stored file URL, URL-encoded)
 */
router.get('/view', authenticate, (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ message: 'No file URL provided' });
  }

  // Only allow URLs from known trusted domains to prevent open-redirect / SSRF
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ message: 'Invalid URL' });
  }

  // Files stored in our own database are already served by this app
  if (parsedUrl.host === req.get('host') && parsedUrl.pathname.startsWith('/api/files/stored/')) {
    return res.redirect(parsedUrl.pathname);
  }

  const allowedHosts = [
    'res.cloudinary.com',
    'localhost',
    '127.0.0.1',
  ];

  const hostOk = allowedHosts.some(
    (h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h)
  );

  if (!hostOk) {
    return res.status(403).json({ message: 'File host not allowed' });
  }

  const lib = parsedUrl.protocol === 'https:' ? https : http;

  lib.get(url, (fileRes) => {
    // Determine a friendly content-type
    const ct = fileRes.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', ct);

    // Forward cache / content-length headers if present
    if (fileRes.headers['content-length']) {
      res.setHeader('Content-Length', fileRes.headers['content-length']);
    }

    // Inline display (browser opens it in-tab), not download
    res.setHeader('Content-Disposition', 'inline');

    fileRes.pipe(res);
  }).on('error', (err) => {
    console.error('File proxy error:', err.message);
    res.status(502).json({ message: 'Failed to fetch file' });
  });
});

module.exports = router;
