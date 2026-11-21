const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const S = require('../utils/accounts/service');
const C = require('../controllers/accountsController');
const CS = require('../utils/campus');

const admin = authorize('admin');
const wide = async (req, res, next) => { try { if (req.user.role === 'admin' && await CS.scopeOf(req.user)) return res.status(403).json({ message: 'The school ledger is school-wide. Ask a school-wide administrator.' }); return next(); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
router.use(authenticate, authorize('admin', 'teacher'), wide);

const read = S.onRead; const prep = S.onPrepare; const appr = S.onApprove;
router.get('/access', C.access);
router.post('/setup', admin, C.setup);
router.get('/settings', read, C.settings); router.put('/settings', admin, C.saveSettings); router.get('/opening-suggestion', prep, C.openingSuggestion);
router.get('/overview', read, C.overview);
router.get('/feeds', read, C.feedStatus); router.post('/feeds/run', appr, C.runFeeds); router.post('/sweep', admin, C.sweepNow); router.get('/check', read, C.check); router.get('/trace/:type/:id', read, C.trace);

router.get('/accounts', read, C.accounts); router.post('/accounts', prep, C.createAccount); router.patch('/accounts/:id', prep, C.updateAccount);

router.get('/journals', read, C.journals); router.post('/journals/preview', prep, C.previewJournal); router.post('/journals', prep, C.createJournal);
router.get('/journals/:id', read, C.journal); router.patch('/journals/:id', prep, C.updateJournal); router.delete('/journals/:id', prep, C.deleteJournal);
router.post('/journals/:id/submit', prep, C.submitJournal); router.post('/journals/:id/decide', appr, C.decideJournal); router.post('/journals/:id/reverse', prep, C.reverseJournal);

router.get('/ledger', read, C.ledger); router.get('/statements/:name', read, C.statement);

router.get('/funds', read, C.funds); router.post('/funds', appr, C.createFund); router.get('/funds/:id/lines', read, C.fundLines); router.patch('/funds/:id', appr, C.updateFund);
router.post('/funds/:id/close', appr, C.closeFund); router.post('/funds/:id/reopen', appr, C.reopenFund);

router.get('/budgets', read, C.budgets); router.post('/budgets', prep, C.createBudget); router.get('/budgets/:id', read, C.budget); router.put('/budgets/:id', prep, C.updateBudget);
router.delete('/budgets/:id', prep, C.deleteBudget); router.post('/budgets/:id/approve', appr, C.approveBudget);

router.get('/recons', read, C.recons); router.post('/recons', prep, C.saveRecon); router.post('/recons/:id/sign', appr, C.signRecon); router.post('/recons/:id/reopen', admin, C.reopenRecon);

router.get('/periods', read, C.periods); router.get('/periods/:ym/checklist', read, C.checklist); router.get('/periods/:ym/verify', read, C.verifyPeriod);
router.post('/periods/:ym/close', prep, C.requestClose); router.post('/periods/:ym/approve', appr, C.approveClose); router.post('/periods/:ym/cancel', prep, C.cancelClose); router.post('/periods/:ym/reopen', admin, C.reopenPeriod);

module.exports = router;
