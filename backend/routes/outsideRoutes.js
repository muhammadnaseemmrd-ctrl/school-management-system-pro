// The doors that outside systems use: OneRoster 1.1 (read-only), a small open read-only API, LTI 1.3 launches and single sign-on.
const express = require('express');
const mongoose = require('../lib/pgdoc');
const { authenticate } = require('../middleware/auth');
const { ssoLimiter } = require('../middleware/rateLimit');
const K = require('../utils/integrations/keys');
const OR = require('../utils/integrations/oneroster');
const LTI = require('../utils/integrations/lti');
const SSO = require('../utils/integrations/sso');
const DisclosureLog = require('../models/DisclosureLog');
const School = require('../models/School');
const Class = require('../models/Class');
const Student = require('../models/Student');
const DailyAttendance = require('../models/DailyAttendance');
const Notice = require('../models/Notice');
const FeePayment = require('../models/FeePayment');

const oid = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const origin = (req) => `${String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0]}://${req.get('host')}`;
const disclose = (api, channel, what, categories, records) => DisclosureLog.create({ schoolId: oid(api.schoolId), connectorId: api.connector._id, connectorName: api.connector.name, kind: 'api_key', channel, what, categories, records }).catch((e) => console.error('disclosure:', e.message));
// where the browser lands after the provider: the app's own address when it is hosted apart from the API
const appBase = () => String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
const noStore = (res) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); };

/* ───────── OneRoster 1.1 rostering, read-only ───────── */
const oneroster = express.Router();
oneroster.use(authApi());
function authApi() { return K.authApi('roster.read', { format: 'oneroster' }); }
const orFail = (res, e) => {
  if (e instanceof OR.OrError) return res.status(e.status).json({ imsx_codeMajor: 'failure', imsx_severity: 'error', imsx_description: e.message, imsx_CodeMinor: { imsx_codeMinorField: [{ imsx_codeMinorFieldName: 'TargetEndSystem', imsx_codeMinorFieldValue: e.minor || 'invaliddata' }] } });
  console.error('oneroster:', e); return res.status(500).json({ imsx_codeMajor: 'failure', imsx_severity: 'error', imsx_description: 'Something went wrong.', imsx_CodeMinor: { imsx_codeMinorField: [{ imsx_codeMinorFieldName: 'TargetEndSystem', imsx_codeMinorFieldValue: 'internal_server_error' }] } });
};
const serve = (resource, { parent, idParam = 'id' } = {}) => async (req, res) => {
  noStore(res);
  try {
    const base = `${origin(req)}/api/oneroster/v1p1`;
    const spec = parent ? { resource, parent, parentId: req.params.id, q: req.query } : { resource, id: req.params[idParam], q: req.query };
    const r = await OR.answer(req.api, base, spec);
    if (r.list) { res.set('X-Total-Count', String(r.total)); const links = []; if (r.offset + r.limit < r.total) links.push(`<${base}/${req.path.replace(/^\//, '')}?${new URLSearchParams({ ...req.query, offset: String(r.offset + r.limit), limit: String(r.limit) })}>; rel="next"`); if (r.offset > 0) links.push(`<${base}/${req.path.replace(/^\//, '')}?${new URLSearchParams({ ...req.query, offset: String(Math.max(0, r.offset - r.limit)), limit: String(r.limit) })}>; rel="prev"`); if (links.length) res.set('Link', links.join(', ')); }
    await disclose(req.api, 'oneroster', r.what, r.categories, r.count);
    return res.json(r.list || r.single);
  } catch (e) { return orFail(res, e); }
};
for (const r of ['orgs', 'schools', 'academicSessions', 'terms', 'courses', 'classes', 'users', 'students', 'teachers', 'enrollments']) { oneroster.get(`/${r}`, serve(r)); oneroster.get(`/${r}/:id`, serve(r)); }
oneroster.get('/classes/:id/students', serve('students', { parent: 'classes' }));
oneroster.get('/classes/:id/teachers', serve('teachers', { parent: 'classes' }));
oneroster.get('/schools/:id/classes', serve('classes', { parent: 'schools' }));
oneroster.get('/schools/:id/students', serve('students', { parent: 'schools' }));
oneroster.get('/schools/:id/teachers', serve('teachers', { parent: 'schools' }));
oneroster.get('/schools/:id/enrollments', serve('enrollments', { parent: 'schools' }));
oneroster.use((req, res) => res.status(404).json({ imsx_codeMajor: 'failure', imsx_severity: 'error', imsx_description: 'Unknown resource.', imsx_CodeMinor: { imsx_codeMinorField: [{ imsx_codeMinorFieldName: 'TargetEndSystem', imsx_codeMinorFieldValue: 'unknownobject' }] } }));

/* ───────── the open read-only API ───────── */
const open = express.Router();
const page = (q) => ({ limit: Math.min(500, Math.max(1, Number(q.limit) || 100)), offset: Math.max(0, Number(q.offset) || 0) });
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === String(v) ? String(v) : null);
const bad = (res, message) => res.status(422).json({ message });
// the classes this key may see (all, or only those of the campuses it was limited to)
async function classIdsFor(api) {
  if (!api.campusIds.length) return null;
  const cs = await Class.find({ schoolId: oid(api.schoolId), campusId: { $in: api.campusIds.map(oid).filter(Boolean) } }).select('_id').lean(); return cs.map((c) => c._id);
}

open.get('/whoami', K.authApi(null), async (req, res) => {
  noStore(res); const c = req.api.connector; const school = await School.findById(req.api.schoolId).select('name code').lean();
  res.json({ school: { name: school.name, code: school.code }, connection: { name: c.name, scopes: c.scopes, campusLimited: req.api.campusIds.length > 0, expiresAt: c.expiresAt || null, quotaPerHour: c.quotaPerHour } });
});

open.get('/attendance/daily', K.authApi('attendance.read'), async (req, res) => {
  try {
    noStore(res); const date = day(req.query.date); if (!date) return bad(res, 'Give a date as YYYY-MM-DD.');
    const f = { schoolId: oid(req.api.schoolId), date: new Date(`${date}T00:00:00Z`) };
    if (req.query.classId) { if (!oid(req.query.classId)) return bad(res, 'The class id is not valid.'); f.classId = oid(req.query.classId); }
    const ids = await classIdsFor(req.api); if (ids) { if (f.classId) { if (!ids.some((i) => String(i) === String(f.classId))) return res.json({ date, total: 0, records: [] }); } else f.classId = { $in: ids }; }
    const { limit, offset } = page(req.query);
    const [rows, total] = await Promise.all([DailyAttendance.find(f).sort({ classId: 1, studentId: 1 }).skip(offset).limit(limit).select('classId studentId status arrivedAt leftAt').lean(), DailyAttendance.countDocuments(f)]);
    res.set('X-Total-Count', String(total));
    await disclose(req.api, 'open_api', 'attendance', ['attendance'], rows.length);
    res.json({ date, total, limit, offset, records: rows.map((r) => ({ studentId: String(r.studentId), classId: String(r.classId), status: r.status, arrivedAt: r.arrivedAt || null, leftAt: r.leftAt || null })) });
  } catch (e) { console.error('open attendance:', e); res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
});

open.get('/notices', K.authApi('notices.read'), async (req, res) => {
  try {
    noStore(res); const { limit, offset } = page(req.query); const f = { schoolId: oid(req.api.schoolId), targetAudience: 'All', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] };   // only notices meant for everyone
    const [rows, total] = await Promise.all([Notice.find(f).sort({ createdAt: -1 }).skip(offset).limit(limit).select('title category content priority isPinned createdAt expiresAt').lean(), Notice.countDocuments(f)]);
    res.set('X-Total-Count', String(total)); await disclose(req.api, 'open_api', 'notices', ['notices'], rows.length);
    res.json({ total, limit, offset, notices: rows.map((n) => ({ id: String(n._id), title: n.title, category: n.category, content: n.content, priority: n.priority, pinned: !!n.isPinned, publishedAt: n.createdAt, expiresAt: n.expiresAt || null })) });
  } catch (e) { console.error('open notices:', e); res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
});

open.get('/fees/payments', K.authApi('fees.read'), async (req, res) => {
  try {
    noStore(res); const from = day(req.query.from); const to = day(req.query.to); if (!from || !to) return bad(res, 'Give from and to dates as YYYY-MM-DD.');
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > 92 || Date.parse(to) < Date.parse(from)) return bad(res, 'Choose a period of up to 92 days.');
    const f = { schoolId: oid(req.api.schoolId), status: 'Confirmed', receivedAt: { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) } };
    const ids = await classIdsFor(req.api); if (ids) { const sts = await Student.find({ schoolId: oid(req.api.schoolId), classId: { $in: ids } }).select('_id').lean(); f.studentId = { $in: sts.map((s) => s._id) }; }
    const { limit, offset } = page(req.query);
    const [rows, total] = await Promise.all([FeePayment.find(f).sort({ receivedAt: 1, _id: 1 }).skip(offset).limit(limit).select('studentId amount method receiptNo receivedAt refunded').lean(), FeePayment.countDocuments(f)]);
    res.set('X-Total-Count', String(total)); await disclose(req.api, 'open_api', 'fee payments', ['fees'], rows.length);
    res.json({ from, to, total, limit, offset, payments: rows.map((p) => ({ studentId: String(p.studentId), amount: p.amount, refunded: p.refunded || 0, method: p.method, receiptNo: p.receiptNo, receivedAt: p.receivedAt })) });
  } catch (e) { console.error('open fees:', e); res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
});
open.use((req, res) => res.status(404).json({ message: 'Unknown resource.' }));

/* ───────── LTI 1.3 (this school is the platform) ───────── */
const lti = express.Router();
const schoolByCode = async (code) => { const s = await School.findOne({ code: String(code || '').trim() }).select('_id name code isActive').lean(); return s && s.isActive !== false ? s : null; };
const ltiFail = (res, e) => { if (e instanceof LTI.LtiError) return res.status(e.status).json({ error: e.code, error_description: e.message }); console.error('lti:', e); return res.status(500).json({ error: 'server_error', error_description: 'Something went wrong.' }); };
lti.get('/tools', authenticate, async (req, res) => { try { res.json({ tools: await LTI.tools(req.user) }); } catch (e) { ltiFail(res, e); } });
lti.post('/launch/:id', authenticate, async (req, res) => { try { res.json(await LTI.startLaunch(req, req.user, req.params.id, { classId: req.body && req.body.classId })); } catch (e) { ltiFail(res, e); } });
lti.get('/:schoolCode/jwks.json', async (req, res) => { try { const s = await schoolByCode(req.params.schoolCode); if (!s) return res.status(404).json({ error: 'not_found' }); res.set('Cache-Control', 'public, max-age=300'); res.json(await LTI.jwks(s._id)); } catch (e) { ltiFail(res, e); } });
const authorizeHandler = async (req, res) => {
  try {
    const s = await schoolByCode(req.params.schoolCode); if (!s) return res.status(404).json({ error: 'not_found' });
    const q = req.method === 'POST' ? req.body || {} : req.query; const r = await LTI.authorize(req, s, q); const page = LTI.postForm(r);
    res.set('Content-Security-Policy', page.csp); res.set('Cache-Control', 'no-store'); res.type('html').send(page.html);
  } catch (e) { ltiFail(res, e); }
};
lti.get('/:schoolCode/begin/:hint', async (req, res) => {
  try { const s = await schoolByCode(req.params.schoolCode); if (!s) return res.status(404).json({ error: 'not_found' }); const page = await LTI.beginPage(req.params.hint, s._id); res.set('Content-Security-Policy', page.csp); res.set('Cross-Origin-Opener-Policy', 'same-origin'); res.set('Referrer-Policy', 'no-referrer'); res.set('Cache-Control', 'no-store'); res.type('html').send(page.html); }
  catch (e) { ltiFail(res, e); }
});
lti.get('/:schoolCode/auth', authorizeHandler); lti.post('/:schoolCode/auth', express.urlencoded({ extended: false, limit: '20kb' }), authorizeHandler);

/* ───────── single sign-on (this school signs in through its own provider) ───────── */
const sso = express.Router();
sso.get('/callback', ssoLimiter, async (req, res) => {
  const back = (q) => res.redirect(302, `${appBase()}/sso-complete?${new URLSearchParams(q)}`);
  try { const r = await SSO.callback(req, { code: req.query.code, state: req.query.state, error: req.query.error }); return back({ code: r.code }); }
  catch (e) { if (e instanceof SSO.SsoError) return back({ error: e.code, message: e.message }); console.error('sso callback:', e); return back({ error: 'failed', message: 'Something went wrong. Please try again.' }); }
});
sso.post('/exchange', ssoLimiter, async (req, res) => {
  try { noStore(res); res.json(await SSO.exchange(req.body && req.body.code)); }
  catch (e) { if (e instanceof SSO.SsoError) return res.status(401).json({ message: e.message, reason: e.code }); console.error('sso exchange:', e); res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
});
sso.get('/:schoolCode/info', ssoLimiter, async (req, res) => { try { res.json(await SSO.info(req.params.schoolCode)); } catch (e) { res.json({ enabled: false }); } });
sso.get('/:schoolCode/start', ssoLimiter, async (req, res) => {
  try { res.redirect(302, await SSO.start(req, req.params.schoolCode)); }
  catch (e) { if (e instanceof SSO.SsoError) return res.redirect(302, `${appBase()}/sso-complete?${new URLSearchParams({ error: e.code, message: e.message })}`); console.error('sso start:', e); res.redirect(302, `${appBase()}/sso-complete?error=failed`); }
});

module.exports = { oneroster, open, lti, sso };
