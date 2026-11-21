const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const S = require('../utils/library/service');
const T = require('../controllers/storeController');
const CS = require('../utils/campus');

const admin = authorize('admin');
const staff = authorize('admin', 'teacher');
const wide = async (req, res, next) => { try { if (req.user.role === 'admin' && await CS.scopeOf(req.user)) return res.status(403).json({ message: 'The store is school-wide. Ask a school-wide administrator.' }); next(); } catch (e) { next(e); } };

/* ── families ── */
const me = express.Router();
me.use(authenticate, authorize('student', 'parent'), wide);
me.get('/items', T.meItems); me.get('/orders', T.meOrders); me.post('/orders', T.meOrder); me.post('/orders/:id/cancel', T.meCancel);
router.use('/me', me);

/* ── the till and the office ── */
router.use(authenticate, staff, wide);
const till = S.onTill;
router.get('/overview', till, T.overview); router.get('/settings', till, T.settings); router.put('/settings', admin, T.saveSettings);
router.get('/skus', till, T.skus); router.post('/skus', admin, T.createSku); router.patch('/skus/:id', admin, T.updateSku);
router.post('/receive', admin, T.receive); router.get('/movements', admin, T.movements); router.get('/low-stock', till, T.lowStock); router.get('/reconcile', admin, T.reconcile);
router.post('/sales', till, T.sell); router.get('/sales', till, T.sales); router.get('/sales/:id', till, T.sale);
router.get('/orders', till, T.orders); router.post('/orders', till, T.order); router.post('/orders/:id/pay', till, T.payOrder); router.post('/orders/:id/cancel', till, T.cancelOrder);
router.post('/refunds', till, T.requestRefund); router.get('/refunds', till, T.refunds); router.post('/refunds/:id/decide', admin, T.decideRefund);
router.get('/tills', till, T.tills); router.post('/tills', admin, T.createTill); router.patch('/tills/:id', admin, T.updateTill); router.get('/people', admin, T.people);
router.get('/shift', till, T.myShift); router.post('/shifts/open', till, T.openShift); router.post('/shifts/:id/close', till, T.closeShift); router.get('/shifts', admin, T.shifts);
router.get('/counts', till, T.counts); router.post('/counts', till, T.startCount); router.get('/counts/:id', till, T.count); router.put('/counts/:id', till, T.saveCount); router.post('/counts/:id/submit', till, T.submitCount); router.post('/counts/:id/decide', admin, T.decideCount);
router.get('/reports/day', till, T.dayReport);

module.exports = router;
