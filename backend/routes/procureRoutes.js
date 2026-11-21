const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const S = require('../utils/procure/service');
const C = require('../controllers/procureController');
const CS = require('../utils/campus');

const admin = authorize('admin');
const wide = async (req, res, next) => { try { if (req.user.role === 'admin' && await CS.scopeOf(req.user)) return res.status(403).json({ message: 'Purchasing is school-wide. Ask a school-wide administrator.' }); next(); } catch (e) { res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };

router.use(authenticate, authorize('admin', 'teacher'), wide);

/* ── anyone on staff ── */
router.get('/access', C.access);
router.get('/tickets', C.tickets); router.post('/tickets', C.reportTicket);

/* ── people who may raise requests ── */
router.get('/options', S.onRequest, C.options);
router.get('/requisitions', S.onRequest, C.reqs); router.post('/requisitions', S.onRequest, C.createReq);
router.get('/requisitions/:id', S.onRequest, C.req); router.patch('/requisitions/:id', S.onRequest, C.updateReq);
router.post('/requisitions/:id/submit', S.onRequest, C.submitReq); router.post('/requisitions/:id/cancel', S.onRequest, C.cancelReq);

/* ── the purchasing office ── */
const office = S.onOffice;
router.get('/overview', office, C.overview); router.get('/settings', office, C.settings); router.put('/settings', admin, C.saveSettings);
router.get('/vendors', office, C.vendors); router.post('/vendors', office, C.createVendor); router.get('/vendors/:id', office, C.vendor); router.patch('/vendors/:id', office, C.updateVendor);
router.post('/vendors/:id/bank', office, C.requestBank); router.post('/vendors/:id/bank/decide', admin, C.decideBank);
router.post('/requisitions/:id/quotes', office, C.addQuote); router.delete('/requisitions/:id/quotes/:key', office, C.removeQuote); router.post('/requisitions/:id/choose-quote', office, C.chooseQuote);
router.post('/requisitions/:id/decide', admin, C.decideReq); router.post('/requisitions/:id/order', office, C.issueOrder);
router.get('/orders', office, C.orders); router.get('/orders/:id', office, C.order); router.post('/orders/:id/receive', office, C.receive); router.post('/orders/:id/bills', office, C.enterInvoice);
router.post('/orders/:id/cancel', admin, C.cancelOrder); router.post('/orders/:id/close', admin, C.closeOrder);
router.get('/bills', office, C.invoices); router.post('/bills/:id/decide', admin, C.decideInvoice); router.post('/bills/:id/pay', admin, C.payInvoice); router.post('/bills/:id/void', office, C.voidInvoice); router.post('/bills/:id/credit', admin, C.creditNote);

router.get('/funds', admin, C.funds); router.post('/funds', admin, C.createFund); router.get('/funds/:id', admin, C.fund); router.post('/funds/:id/money', admin, C.fundMoney); router.post('/funds/:id/close', admin, C.closeFund); router.get('/reconcile', admin, C.reconcile);
router.get('/budgets', office, C.budgets); router.post('/budgets', admin, C.createBudget); router.put('/budgets/:id', admin, C.updateBudget); router.post('/budgets/:id/approve', admin, C.approveBudget); router.post('/budgets/:id/close', admin, C.closeBudget);
router.get('/variations', office, C.variations); router.post('/variations', admin, C.requestVariation); router.post('/variations/:id/decide', admin, C.decideVariation);

router.get('/projects', office, C.projects); router.post('/projects', office, C.createProject); router.get('/projects/:id', office, C.project); router.post('/projects/:id/approve', admin, C.approveProject);
router.post('/projects/:id/phase', admin, C.setPhase); router.post('/projects/:id/milestones/:key', office, C.milestone); router.post('/projects/:id/changes', office, C.requestChange); router.post('/changes/:id/decide', admin, C.decideChange);

router.get('/assets', office, C.assets); router.post('/assets', office, C.createAsset); router.post('/assets/from-order', office, C.tagFromOrder); router.get('/assets/by-tag', office, C.assetByTag); router.post('/assets/labels', office, C.assetLabels);
router.get('/assets/:id', office, C.asset); router.patch('/assets/:id', office, C.updateAsset); router.post('/assets/:id/transfer', office, C.transfer);
router.post('/assets/:id/dispose', office, C.requestDisposal); router.post('/assets/:id/dispose/decide', admin, C.decideDisposal);

router.patch('/tickets/:id', office, C.updateTicket);
router.get('/plans', office, C.plans); router.post('/plans', office, C.createPlan); router.patch('/plans/:id', office, C.updatePlan);
router.get('/contracts', office, C.contracts); router.post('/contracts', admin, C.saveContract); router.patch('/contracts/:id', admin, C.saveContract); router.get('/forecast', office, C.forecast);
router.get('/reports/:name', admin, C.report); router.post('/sweep', admin, C.sweepNow);

module.exports = router;
