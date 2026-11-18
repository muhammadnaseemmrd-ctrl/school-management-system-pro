const express = require('express');
const router = express.Router();
const hr = require('../controllers/hrController'); const ops = require('../controllers/hrOpsController'); const pay = require('../controllers/payrollController');
const { authenticate, authorize } = require('../middleware/auth');

// A teacher sees only their own staff record
router.get('/me', authenticate, authorize('teacher'), pay.me);
router.get('/me/payslips/:id', authenticate, authorize('teacher'), pay.myPayslip);
router.post('/me/leave', authenticate, authorize('teacher'), ops.requestLeaveMine);
router.post('/me/leave/:id/cancel', authenticate, authorize('teacher'), ops.cancelLeave);
router.post('/me/appraisals/:id/respond', authenticate, authorize('teacher'), hr.respond);

router.use(authenticate, authorize('admin'));
router.get('/overview', hr.overview); router.get('/expiring', hr.expiring);
router.get('/positions', hr.listPositions); router.post('/positions', hr.createPosition); router.put('/positions/:id', hr.updatePosition);
router.get('/employees', hr.listEmployees); router.post('/employees', hr.createEmployee); router.get('/employees/:id', hr.getEmployee); router.put('/employees/:id', hr.updateEmployee);
router.post('/employees/:id/activate', hr.activate); router.put('/employees/:id/checklist/:key', hr.checklistItem); router.post('/employees/:id/records', hr.addRecord);
router.post('/appraisals/:id/respond', hr.respond);
router.post('/contracts', hr.createContract); router.post('/contracts/:id/sign', hr.signContract); router.post('/contracts/:id/end', hr.endContract);
router.get('/settings', ops.getSettings); router.put('/settings', ops.putSettings);
router.get('/shifts', ops.listShifts); router.post('/shifts', ops.createShift);
router.get('/roster', ops.listRoster); router.post('/roster', ops.assignRoster); router.post('/roster/publish', ops.publishRoster);
router.get('/attendance', ops.listAttendance); router.post('/attendance', ops.markAttendance);
router.get('/leave', ops.listLeave); router.post('/leave', ops.requestLeave); router.post('/leave/:id/decide', ops.decideLeave); router.post('/leave/:id/cancel', ops.cancelLeave);
router.get('/cover', ops.listCover); router.get('/cover/:id/candidates', ops.coverCandidates); router.post('/cover/:id/assign', ops.assignCover);
router.get('/overtime', ops.listOvertime); router.post('/overtime', ops.requestOvertime); router.post('/overtime/:id/decide', ops.decideOvertime);
router.get('/advances', ops.listAdvances); router.post('/advances', ops.requestAdvance); router.post('/advances/:id/decide', ops.decideAdvance);
router.get('/payroll/rules', pay.listRules); router.post('/payroll/rules', pay.createRule); router.post('/payroll/rules/:id/review', pay.reviewRule);
router.get('/payroll/batches', pay.listBatches); router.post('/payroll/batches', pay.createBatch); router.get('/payroll/batches/:id', pay.getBatch); router.post('/payroll/batches/:id/finalize', pay.finalize); router.delete('/payroll/batches/:id', pay.deleteDraft);
router.get('/payroll/batches/:id/payslips/:employeeId', pay.payslips);
router.get('/settlements', pay.listSettlements); router.post('/settlements', pay.startSettlement); router.put('/settlements/:id/clear/:key', pay.clearItem); router.post('/settlements/:id/settle', pay.settle);

module.exports = router;
