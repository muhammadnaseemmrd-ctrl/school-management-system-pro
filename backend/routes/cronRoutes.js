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
  try {
    const backups = await backup.runWeekly();
    // after backing up, prove a couple of the least-recently-proven backups can really be restored
    const drillsRun = await require('../utils/restoreDrill').runDueDrills({ max: 2 }).catch((e) => [{ error: e.message }]);
    res.json({ ...backups, drills: drillsRun });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Daily: send any verified attendance alert whose wait has passed, and look for missing registers and silent readers (PRD E08)
router.get('/attendance', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const A = require('../utils/attendanceOps'); const School = require('../models/School');
    const schools = await School.find({ isActive: { $ne: false } }).select('_id').limit(500); let sent = 0; let raised = 0;
    for (const s of schools) {
      sent += await A.dispatchDue(s._id);
      raised += (await require('../utils/attendanceAnomalies').scan(s._id, (await A.clock(s._id)).dateKey)).raised;
    }
    res.json({ schools: schools.length, alertsSent: sent, anomaliesRaised: raised });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Daily: escalate unseen concerns and leaderless cases, flag case reviews, record medicine nobody recorded, chase overdue privacy requests (PRD E21)
router.get('/care', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const School = require('../models/School'); const sweep = require('../utils/care/sweep');
    const schools = await School.find({ isActive: { $ne: false } }).select('_id').limit(500); const total = {};
    for (const s of schools) { const r = await sweep.run(s._id); for (const [k, v] of Object.entries(r)) total[k] = (total[k] || 0) + v; }
    res.json({ schools: schools.length, ...total });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Every few minutes or daily: release pushes held for quiet hours, raise late replies and SLA breaches, remind families of meetings (PRD E20)
router.get('/comms', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const School = require('../models/School'); const sweep = require('../utils/comms/sweep');
    const schools = await School.find({ isActive: { $ne: false } }).select('_id').limit(500); const total = { sent: 0, overdueThreads: 0, breaches: 0, closed: 0, reminded: 0 };
    for (const s of schools) { const r = await sweep.run(s._id); total.sent += r.pushes.sent; for (const k of ['overdueThreads', 'breaches', 'closed', 'reminded']) total[k] += r[k]; }
    res.json({ schools: schools.length, ...total });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Daily: expire old invitations and one-day pickup codes, flag visitors who stayed too long, wipe ID details past retention (PRD E09)
router.get('/safety', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const School = require('../models/School'); const gate = require('../controllers/safetyGateController');
    const schools = await School.find({ isActive: { $ne: false } }).select('_id').limit(500); const total = { expired: 0, flagged: 0, redacted: 0 };
    for (const s of schools) { const r = await gate.housekeeping(s._id); for (const k of Object.keys(total)) total[k] += r[k]; }
    res.json({ schools: schools.length, ...total });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Daily: look again at the web addresses schools have set up (PRD E27)
router.get('/theme', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const School = require('../models/School'); const K = require('../controllers/themeController'); const total = { checked: 0, failed: 0 };
    for (const sc of await School.find({ isActive: { $ne: false } }).select('_id').limit(500)) { const r = await K.sweep(sc._id); total.checked += r.checked; total.failed += r.failed; }
    res.json(total);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
