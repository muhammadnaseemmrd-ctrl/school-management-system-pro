const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const backup = require('../utils/backup');

// Called by Vercel Cron (it sends `Authorization: Bearer $CRON_SECRET`). Runs daily; each school is only backed up
// when its last automatic copy is about a week old, so every school gets a weekly backup.
router.get('/backup', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try { res.json(await backup.runWeekly()); } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
