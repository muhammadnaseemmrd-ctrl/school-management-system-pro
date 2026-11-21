const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const S = require('../utils/library/service');
const L = require('../controllers/libraryController');
const CS = require('../utils/campus');

const admin = authorize('admin');
const staff = authorize('admin', 'teacher');
// The library is school-wide, so an administrator limited to one campus is kept out (PRD E01 scope).
const wide = async (req, res, next) => { try { if (req.user.role === 'admin' && await CS.scopeOf(req.user)) return res.status(403).json({ message: 'The library is school-wide. Ask a school-wide administrator.' }); next(); } catch (e) { next(e); } };

/* ── students, teachers and parents ── */
const me = express.Router();
me.use(authenticate, authorize('student', 'teacher', 'parent'), wide);
me.get('/', L.me); me.get('/titles', L.meTitles); me.post('/reserve', L.meReserve); me.post('/reservations/:id/cancel', L.meCancel); me.post('/loans/:id/renew', L.meRenew);
router.use('/me', me);

/* ── the desk and the office ── */
router.use(authenticate, staff, wide);
router.get('/access', L.access);
const desk = S.onDesk;
router.get('/overview', desk, L.overview);
router.get('/policy', desk, L.policy); router.put('/policy', admin, L.savePolicy);
router.get('/titles', desk, L.titles); router.post('/titles', admin, L.createTitle); router.get('/titles/:id', desk, L.title); router.patch('/titles/:id', admin, L.updateTitle); router.post('/titles/:id/copies', admin, L.addCopies);
router.get('/copies/lookup', desk, L.lookupCopy); router.patch('/copies/:id', admin, L.setCopy);
router.get('/people', desk, L.people); router.get('/cards', desk, L.cards); router.get('/cards/lookup', desk, L.cardLookup); router.patch('/cards/:id', admin, L.cardStatus);
router.post('/issue', desk, L.issue); router.post('/return', desk, L.giveBack); router.post('/loans/:id/lost', desk, L.lost); router.post('/loans/:id/renew', desk, L.renew);
router.get('/loans', desk, L.loans); router.get('/loans.csv', desk, L.exportLoans);
router.get('/reservations', desk, L.reservations); router.post('/reservations', desk, L.reserve); router.post('/reservations/:id/cancel', desk, L.cancelReservation);
router.get('/fines', desk, L.fines); router.post('/fines/:id/pay', desk, L.payFine); router.post('/fines/:id/waive', admin, L.waiveFine);
router.post('/sync', desk, L.sync);
router.post('/import/preview', admin, L.importPreview); router.post('/import/commit', admin, L.importCommit);
router.get('/textbooks/needs', admin, L.textbookNeeds); router.post('/textbooks/class-set', admin, L.classSet); router.get('/textbooks/recoveries', desk, L.recoveries);
router.post('/labels/copies', desk, L.copyLabels); router.post('/labels/cards', desk, L.cardLabels);
router.get('/reports/usage', desk, L.usage);
router.post('/sweep', admin, L.sweepNow);

module.exports = router;
