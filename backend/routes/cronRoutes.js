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

// Daily: expire old quotes, remind overdue invoices, flag missed support deadlines (PRD E28)
router.get('/sales', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try { res.json({ sales: await require('../controllers/salesController').sweep(), support: await require('../controllers/supportController').sweep() }); } catch (e) { res.status(500).json({ message: e.message }); }
});

// Daily: pause access for instalments overdue past the grace period, free seats held by unpaid orders, move cohorts on, remind of live sessions (PRD E17)
router.get('/training', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const School = require('../models/School'); const sweep = require('../utils/training/service').sweep; const total = {};
    for (const sc of await School.find({ isActive: { $ne: false } }).select('_id').limit(500)) { const r = await sweep(sc._id); for (const [k, v] of Object.entries(r)) total[k] = (total[k] || 0) + v; }
    res.json(total);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Daily: release reservations nobody collected, remind borrowers of due and overdue books, release unclaimed store pickups, flag low stock (PRD E18)
router.get('/library', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const School = require('../models/School'); const D = require('../utils/library/desk'); const T = require('../utils/library/store');
    const schools = await School.find({ isActive: { $ne: false } }).select('_id').limit(500); const total = { expired: 0, reminded: 0, overdue: 0, orders: 0 };
    for (const s of schools) { const r = await D.sweep(s._id); for (const k of Object.keys(r)) total[k] += r[k]; total.orders += await T.sweepOrders(s._id); await T.lowStock(s._id, { notify: true }); }
    res.json({ schools: schools.length, ...total });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Daily: open preventive maintenance jobs, watch contracts that are ending and tell the office about late bills and project milestones (PRD E19)
router.get('/procure', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const School = require('../models/School'); const X = require('../utils/procure/assets');
    const schools = await School.find({ isActive: { $ne: false } }).select('_id').limit(500); const total = { tickets: 0, ended: 0, noticed: 0 };
    for (const s of schools) { const r = await X.sweep(s._id); for (const k of Object.keys(total)) total[k] += r[k]; }
    res.json({ schools: schools.length, ...total });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Daily: make today's and tomorrow's trips, close trips that never ran or were left open, drop old positions and remind the office about documents and inspections (PRD E22)
router.get('/transport', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ message: 'CRON_SECRET is not configured' });
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given); const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const School = require('../models/School'); const V = require('../utils/transport/views');
    const schools = await School.find({ isActive: { $ne: false } }).select('_id').limit(500); const total = { made: 0, missed: 0, closedStale: 0, purged: 0, warned: 0 };
    for (const s of schools) { const r = await V.sweep(s._id); for (const k of Object.keys(total)) total[k] += r[k]; }
    res.json({ schools: schools.length, ...total });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
