const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const { getVapid } = require('../utils/notify');

router.use(authenticate);
const me = (req) => ({ userId: new mongoose.Types.ObjectId(String(req.user.userId)), userRole: req.user.role });

// Latest notifications + unread count (the bell polls this)
router.get('/', async (req, res) => {
  try {
    const q = me(req);
    const limit = Math.min(Number(req.query.limit) || 25, 60);
    const [items, unread] = await Promise.all([
      Notification.find(q).sort({ createdAt: -1 }).limit(limit),
      Notification.countDocuments({ ...q, readAt: null }),
    ]);
    res.json({ items, unread });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/unread-count', async (req, res) => {
  try { res.json({ unread: await Notification.countDocuments({ ...me(req), readAt: null }) }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/read-all', async (req, res) => {
  try { await Notification.updateMany({ ...me(req), readAt: null }, { readAt: new Date() }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/:id/read', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    await Notification.updateOne({ _id: req.params.id, ...me(req) }, { readAt: new Date() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── Web Push ── */
router.get('/push/key', async (req, res) => {
  try { res.json({ publicKey: await getVapid() }); } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/push/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ message: 'Invalid subscription' });
    const { userId, userRole } = me(req);
    await PushSubscription.updateOne({ endpoint }, { userId, userRole, keys, userAgent: String(req.get('user-agent') || '').slice(0, 200) }, { upsert: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/push/unsubscribe', async (req, res) => {
  try { await PushSubscription.deleteOne({ endpoint: req.body?.endpoint, userId: me(req).userId }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
