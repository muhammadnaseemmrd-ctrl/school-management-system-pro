const express = require('express');
const router = express.Router();
const c = require('../controllers/superAdminController');
const bk = require('../controllers/backupController');
const pb = require('../controllers/platformBillingController');
const ops = require('../controllers/opsController');
const { authenticate, authorize } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

// Public (rate-limited) login for the platform owner
router.post('/login', loginLimiter, c.login);

// Everything below requires a Super Admin token
router.use(authenticate, authorize('superadmin'));

router.get('/stats', c.getStats);
router.get('/plans', c.getPlans);
router.post('/plans', c.createPlan);
router.put('/plans/:slug', c.updatePlan);
router.delete('/plans/:slug', c.deletePlan);
router.get('/offers', c.listOffers);
router.post('/offers', c.createOffer);
router.put('/offers/:id', c.updateOffer);
router.delete('/offers/:id', c.deleteOffer);
router.get('/schools', c.listSchools);
router.post('/schools', c.createSchool);
router.get('/schools/:id', c.getSchool);
router.put('/schools/:id', c.updateSchool);
router.patch('/schools/:id/status', c.setSchoolStatus);
router.post('/schools/:id/reset-admin-password', c.resetAdminPassword);
router.delete('/schools/:id', c.deleteSchool);

// Partner agents (E24), what schools paid (E02), commissions and payouts
router.get('/agents', pb.listAgents);
router.post('/agents', pb.createAgent);
router.get('/agents/:id', pb.getAgent);
router.put('/agents/:id', pb.updateAgent);
router.post('/agents/:id/reset-password', pb.resetAgentPassword);
router.post('/agents/:id/payouts', pb.recordPayout);
router.put('/schools/:id/agent', pb.setSchoolAgent);
router.get('/payments', pb.listPayments);
router.post('/payments', pb.recordPayment);
router.post('/payments/:id/refund', pb.refundPayment);
router.get('/commissions', pb.listCommissions);
router.post('/commissions/approve', pb.approveCommissions);
router.post('/commissions/:id/void', pb.voidCommission);
router.get('/payouts', pb.listPayouts);
router.get('/commission-policy', pb.getPolicy);
router.put('/commission-policy', pb.setPolicy);
router.get('/ledger', pb.ledger);
router.post('/ledger/reconcile', pb.reconcile);
router.get('/audit', pb.auditLog);

// Backups (any school) + weekly run for all schools
router.get('/schools/:id/backups', bk.forOwner.list);
router.post('/schools/:id/backups', bk.forOwner.create);
router.get('/schools/:id/backups/download', bk.forOwner.download);
router.get('/schools/:id/backups/:bid/download', bk.forOwner.downloadSnapshot);
router.delete('/schools/:id/backups/:bid', bk.forOwner.remove);
router.post('/backups/run-weekly', bk.runWeekly);
router.get('/ops/health', ops.health);
router.get('/ops/backup-runs', ops.backupRuns);
router.get('/ops/restore-drills', ops.listDrills);
router.post('/schools/:id/restore-drill', ops.runDrill);

// Sales, quotes, invoices, support inbox and proof (PRD E28)
const sales = require('../controllers/salesController'); const sup = require('../controllers/supportController');
router.get('/sales/pipeline', sales.pipeline);
router.get('/sales/leads', sales.listLeads); router.get('/sales/leads/:id', sales.getLead); router.patch('/sales/leads/:id', sales.updateLead); router.post('/sales/leads/:id/convert', sales.convertLead);
router.get('/sales/quotes', sales.listQuotes); router.post('/sales/quotes', sales.createQuote); router.get('/sales/quotes/:id', sales.getQuote); router.patch('/sales/quotes/:id', sales.updateQuote);
router.post('/sales/quotes/:id/send', sales.sendQuote); router.post('/sales/quotes/:id/withdraw', sales.withdrawQuote);
router.get('/sales/invoices', sales.listInvoices); router.post('/sales/invoices/:id/pay', sales.payInvoice); router.post('/sales/invoices/:id/void', sales.voidInvoice);
router.get('/sales/settings', sales.getSettings); router.put('/sales/settings', sales.putSettings);
router.get('/sales/proof', sales.listProof); router.post('/sales/proof', sales.createProof); router.put('/sales/proof/:id', sales.updateProof);
router.post('/sales/proof/:id/publish', sales.publishProof); router.post('/sales/proof/:id/withdraw', sales.withdrawProof); router.delete('/sales/proof/:id', sales.deleteProof);
router.get('/support/stats', sup.ownerStats); router.get('/support', sup.ownerList); router.get('/support/:id', sup.ownerGet); router.post('/support/:id/reply', sup.ownerReply); router.patch('/support/:id', sup.ownerUpdate);

module.exports = router;
