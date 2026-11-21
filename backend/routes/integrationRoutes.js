// Admin screens for connections (/api/integrations), plus the outside-facing doors: OneRoster, the open read-only API, LTI and single sign-on.
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { ssoLimiter } = require('../middleware/rateLimit');
const C = require('../controllers/integrationController');

const admin = express.Router();
admin.use(authenticate, authorize('admin'), C.wide);
admin.get('/catalog', C.catalog);
admin.get('/overview', C.overview);
admin.get('/disclosures', C.disclosures);
admin.get('/connectors', C.list);
admin.post('/connectors', C.create);
admin.get('/connectors/:id', C.one);
admin.get('/connectors/:id/setup', C.setup);
admin.put('/connectors/:id', C.update);
admin.post('/connectors/:id/activate', C.activate);
admin.post('/connectors/:id/decide', C.decide);
admin.post('/connectors/:id/pause', C.pause);
admin.post('/connectors/:id/resume', C.resume);
admin.post('/connectors/:id/rotate', C.rotate);
admin.post('/connectors/:id/revoke', C.revoke);
admin.post('/connectors/:id/test', C.test);
admin.get('/connectors/:id/deliveries', C.deliveries);
admin.post('/deliveries/:id/replay', C.replay);
module.exports = admin;
