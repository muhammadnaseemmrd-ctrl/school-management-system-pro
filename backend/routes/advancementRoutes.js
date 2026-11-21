const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const A = require('../controllers/advancementController');
const Q = require('../controllers/qualityController');
const V = require('../utils/advancement/service');

// A student records their own service hours; a supervisor confirms them through a private link.
router.get('/service/mine', authenticate, authorize('student'), Q.myLogs);
router.post('/service/mine', authenticate, authorize('student'), Q.addMyLog);
router.post('/service/:id/link', authenticate, authorize('student', 'admin', 'teacher'), Q.newLogLink);

router.use(authenticate, authorize('admin', 'teacher'));
const alumni = V.guard('alumni.lead'); const giving = V.guard('giving.officer'); const quality = V.guard('quality.lead'); const wide = V.adminWide;

// the board: membership is managed by a school-wide administrator; the papers are only for members
router.get('/me', Q.me);
router.get('/people', Q.people);
router.get('/board/me', Q.boardMe);
router.get('/board/members', wide, Q.members); router.post('/board/members', wide, Q.addMember); router.delete('/board/members/:id', wide, Q.removeMember);
router.get('/board/meetings', Q.boardOnly, Q.meetings); router.post('/board/meetings', Q.boardOnly, Q.addMeeting);
router.get('/board/meetings/:id', Q.boardOnly, Q.meeting); router.put('/board/meetings/:id', Q.boardOnly, Q.editMeeting);
router.post('/board/meetings/:id/resolutions', Q.boardOnly, Q.resolve);
router.put('/board/meetings/:id/minutes', Q.boardOnly, Q.draftMinutes); router.post('/board/meetings/:id/minutes/approve', Q.boardOnly, Q.approveMinutes);

// alumni
router.get('/alumni', alumni, A.alumni); router.post('/alumni', alumni, A.addAlumnus); router.post('/alumni/bulk', alumni, A.addMany);
router.get('/alumni/directory', alumni, A.directory); router.get('/alumni/audience', alumni, A.audience); router.get('/alumni/employment', alumni, A.employment);
router.post('/alumni/:id/link', alumni, A.newLink); router.put('/alumni/:id/consent', alumni, A.recordConsent); router.post('/alumni/:id/erase', alumni, A.erase);
router.get('/events', alumni, A.events); router.post('/events', alumni, A.addEvent); router.put('/events/:id', alumni, A.editEvent); router.post('/events/:id/status', alumni, A.eventStatus); router.get('/events/:id/rsvps', alumni, A.rsvps);

// giving
router.get('/giving/overview', giving, A.overview);
router.get('/giving/funds', giving, A.funds); router.post('/giving/funds', giving, A.addFund); router.put('/giving/funds/:id', giving, A.editFund);
router.get('/giving/pledges', giving, A.pledges); router.post('/giving/pledges', giving, A.addPledge); router.post('/giving/pledges/:id/status', giving, A.pledgeStatus);
router.get('/giving/gifts', giving, A.gifts); router.post('/giving/gifts', giving, A.addGift); router.post('/giving/gifts/:id/acknowledge', giving, A.acknowledge); router.post('/giving/gifts/:id/reverse', giving, A.reverse);
router.get('/giving/spends', giving, A.spends); router.post('/giving/spends', giving, A.addSpend); router.post('/giving/spends/:id/decide', giving, A.decideSpend);
router.get('/giving/campaigns', giving, A.campaigns); router.post('/giving/campaigns', giving, A.addCampaign); router.put('/giving/campaigns/:id', giving, A.editCampaign);
router.post('/giving/campaigns/:id/ask', giving, A.campaignAsk); router.post('/giving/campaigns/:id/decide', wide, A.campaignDecide); router.post('/giving/campaigns/:id/close', giving, A.campaignClose);

// quality
router.get('/quality/overview', quality, Q.overview); router.get('/quality/coverage', quality, Q.coverage);
router.get('/quality/standards', quality, Q.standards); router.post('/quality/standards', quality, Q.addStandard); router.put('/quality/standards/:id', quality, Q.editStandard);
router.get('/quality/evidence', quality, Q.evidence); router.post('/quality/evidence', quality, Q.addEvidence); router.post('/quality/evidence/:id/review', quality, Q.reviewEvidence);
router.get('/quality/cycles', quality, Q.cycles); router.post('/quality/cycles', quality, Q.addCycle); router.post('/quality/cycles/:id/complete', quality, Q.completeCycle);
router.get('/quality/findings', quality, Q.findings); router.post('/quality/findings', quality, Q.addFinding); router.post('/quality/findings/:id/plan', Q.planFinding); router.post('/quality/findings/:id/close', quality, Q.closeFinding);

// service hours (staff) and the annual report
router.get('/service', quality, Q.logs); router.post('/service', quality, Q.addLog); router.post('/service/:id/reject', quality, Q.rejectLog); router.get('/service/summary', quality, Q.summary);
router.get('/reports', wide, Q.reports); router.post('/reports', wide, Q.addReport); router.get('/reports/:id', wide, Q.report); router.post('/reports/:id/refresh', wide, Q.refresh);
router.post('/reports/:id/stories', wide, Q.addStory); router.delete('/reports/:id/stories/:storyId', wide, Q.removeStory);
router.post('/reports/:id/approve', wide, Q.approveReport); router.post('/reports/:id/publish', wide, Q.publishReport); router.get('/reports/:id/pdf', wide, Q.reportPdf);

module.exports = router;
