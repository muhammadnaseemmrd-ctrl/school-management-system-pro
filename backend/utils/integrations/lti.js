// LTI 1.3 with Aulensia as the platform (PRD CAP-0109): a teacher or student opens an outside learning tool without signing in again.
// Platform-initiated launch: we hand the person to the tool's login address; the tool sends the browser back to our authorization endpoint;
// we check the tool, its registered redirect address and the single-use hint, then post a signed id_token to that address.
// Nothing identifying is sent by default: the person is a pseudonym that is different for every tool, and name or email need their own scope.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('../../lib/pgdoc');
const AppSetting = require('../../models/AppSetting');
const Connector = require('../../models/Connector');
const IntState = require('../../models/IntState');
const DisclosureLog = require('../../models/DisclosureLog');
const School = require('../../models/School');
const Class = require('../../models/Class');
const Student = require('../../models/Student');
const Teacher = require('../../models/Teacher');
const V = require('./vault');
const NET = require('./net');

const oid = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const NS = 'https://purl.imsglobal.org/spec/lti/claim/';
const ROLE = { teacher: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor', student: 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner', admin: 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator' };
class LtiError extends Error { constructor(status, code, desc) { super(desc); this.status = status; this.code = code; } }

const origin = (req) => `${String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0]}://${req.get('host')}`;
const issuerOf = (req, school) => `${origin(req)}/api/lti/${encodeURIComponent(school.code)}`;

// one signing key per school, created the first time it is needed
const keyCache = new Map();
async function platformKey(schoolId) {
  const sid = String(schoolId); if (keyCache.has(sid)) return keyCache.get(sid);
  const k = `lti-key:${sid}`; let doc = await AppSetting.findOne({ key: k });
  if (!doc) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const value = { kid: `aul-${V.token(6)}`, privateEnc: V.seal(privateKey.export({ type: 'pkcs8', format: 'pem' })), publicJwk: publicKey.export({ format: 'jwk' }) };
    await AppSetting.updateOne({ key: k }, { $setOnInsert: { value } }, { upsert: true }); doc = await AppSetting.findOne({ key: k });
  }
  const v = doc.value; const out = { kid: v.kid, privatePem: V.open(v.privateEnc), jwk: { ...v.publicJwk, kid: v.kid, use: 'sig', alg: 'RS256' } };
  keyCache.set(sid, out); return out;
}
const jwks = async (schoolId) => ({ keys: [(await platformKey(schoolId)).jwk] });

// the person as this tool sees them: stable for this tool, different for every other tool, and not reversible
const pseudonym = (connector, userId) => V.hmac(V.open(connector.secretEnc), `sub|${userId}`).slice(0, 40);

// may this person open this class in a tool?
async function canOpenClass(user, classId) {
  const cls = oid(classId) ? await Class.findOne({ _id: oid(classId), schoolId: oid(user.schoolId) }).lean() : null; if (!cls) return null;
  if (user.role === 'admin') { const CS = require('../campus'); return (await CS.canAccessClass(user, cls._id)) ? cls : null; }
  if (user.role === 'teacher') { const t = await Teacher.findOne({ _id: oid(user.userId), schoolId: oid(user.schoolId) }).select('classIds subjectClassAssignments').lean(); const mine = String(cls.classTeacherId || '') === String(user.userId) || (t && ((t.classIds || []).map(String).includes(String(cls._id)) || (t.subjectClassAssignments || []).some((a) => String(a.classId) === String(cls._id)))); return mine ? cls : null; }
  if (user.role === 'student') { const s = await Student.findOne({ _id: oid(user.userId), schoolId: oid(user.schoolId) }).select('classId').lean(); return s && String(s.classId) === String(cls._id) ? cls : null; }
  return null;
}

async function tools(user) {
  const list = await Connector.find({ schoolId: oid(user.schoolId), kind: 'lti_tool', status: 'active' }).sort({ name: 1 }).lean();
  return list.filter((c) => (c.config.roles || []).includes(user.role)).map((c) => ({ id: String(c._id), name: c.name, purpose: c.purpose, shares: [...(c.scopes.includes('lti.name') ? ['your name'] : []), ...(c.scopes.includes('lti.email') ? ['your email address'] : [])], opens: c.config.target || 'window' }));
}

// step 1: the browser is sent to the tool's login address with a single-use hint
async function startLaunch(req, user, connectorId, { classId } = {}) {
  const c = oid(connectorId) ? await Connector.findOne({ _id: oid(connectorId), schoolId: oid(user.schoolId), kind: 'lti_tool' }) : null;
  if (!c || c.status !== 'active' || !(c.config.roles || []).includes(user.role)) throw new LtiError(404, 'not_found', 'This tool is not available.');
  const school = await School.findById(user.schoolId).select('code name').lean(); let cls = null;
  if (classId) { cls = await canOpenClass(user, classId); if (!cls) throw new LtiError(403, 'forbidden', 'You cannot open this tool for that class.'); }
  const hint = V.token(18); const issuer = issuerOf(req, school);
  const fields = { iss: issuer, login_hint: hint, target_link_uri: c.config.targetLinkUri, lti_message_hint: V.token(8), client_id: c.config.clientId, lti_deployment_id: c.config.deploymentId };
  await IntState.create({ schoolId: oid(user.schoolId), kind: 'lti_launch', key: hint, data: { connectorId: String(c._id), userId: String(user.userId), role: user.role, classId: cls ? String(cls._id) : null, fields }, expiresAt: new Date(Date.now() + 5 * 60000) });
  return { method: 'POST', action: c.config.loginUrl, fields, begin: `${issuer}/begin/${hint}` };
}

// step 2: the tool sends the browser back; we answer with the signed token or a clear refusal
async function authorize(req, school, q) {
  const bad = (d) => new LtiError(400, 'invalid_request', d);
  for (const [k, v] of [['scope', 'openid'], ['response_type', 'id_token'], ['response_mode', 'form_post'], ['prompt', 'none']]) if (q[k] !== v) throw bad(`${k} must be ${v}.`);
  for (const k of ['client_id', 'redirect_uri', 'login_hint', 'state', 'nonce']) if (!q[k] || String(q[k]).length > 512) throw bad(`${k} is missing.`);
  if (String(q.nonce).length < 8) throw bad('nonce is too short.');
  const c = await Connector.findOne({ schoolId: school._id, kind: 'lti_tool', 'config.clientId': String(q.client_id) });
  if (!c || c.status !== 'active') throw new LtiError(401, 'unauthorized_client', 'This tool is not registered.');
  if (!(c.config.redirectUris || []).includes(String(q.redirect_uri))) throw new LtiError(400, 'invalid_request', 'This redirect address is not registered for the tool.');
  if (q.lti_deployment_id && q.lti_deployment_id !== c.config.deploymentId) throw bad('The deployment does not match.');
  const used = await IntState.updateOne({ kind: 'lti_launch', key: String(q.login_hint), usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
  if (used.matchedCount !== 1) throw new LtiError(400, 'invalid_request', 'This launch has expired or was already used. Open the tool again.');
  const st = await IntState.findOne({ kind: 'lti_launch', key: String(q.login_hint) });
  if (!st || String(st.data.connectorId) !== String(c._id) || String(st.schoolId) !== String(school._id)) throw bad('The launch does not belong to this tool.');
  // the person is looked up again: someone deactivated since the click is refused
  const Model = { teacher: Teacher, student: Student, admin: require('../../models/User') }[st.data.role]; const person = Model ? await Model.findOne({ _id: oid(st.data.userId), schoolId: school._id }).select('name email isActive').lean() : null;
  if (!person || person.isActive === false) throw new LtiError(403, 'access_denied', 'This account cannot open the tool.');
  const key = await platformKey(school._id); const now = Math.floor(Date.now() / 1000); const cls = st.data.classId ? await Class.findOne({ _id: oid(st.data.classId), schoolId: school._id }).select('standard division').lean() : null;
  const claims = {
    iss: issuerOf(req, school), aud: c.config.clientId, azp: c.config.clientId, sub: pseudonym(c, st.data.userId), iat: now, exp: now + 300, nonce: String(q.nonce), jti: V.token(12),
    [`${NS}message_type`]: 'LtiResourceLinkRequest', [`${NS}version`]: '1.3.0', [`${NS}deployment_id`]: c.config.deploymentId, [`${NS}target_link_uri`]: c.config.targetLinkUri,
    [`${NS}roles`]: [ROLE[st.data.role]], [`${NS}resource_link`]: { id: `rl-${c._id}`, title: c.name },
    ...(cls ? { [`${NS}context`]: { id: String(st.data.classId), label: `${cls.standard}-${cls.division}`, title: `Class ${cls.standard}-${cls.division}`, type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseSection'] } } : {}),
    [`${NS}launch_presentation`]: { document_target: c.config.target === 'iframe' ? 'iframe' : 'window' },
    ...(c.config.custom && Object.keys(c.config.custom).length ? { [`${NS}custom`]: c.config.custom } : {}),
    ...(c.scopes.includes('lti.name') ? { name: person.name } : {}), ...(c.scopes.includes('lti.email') ? { email: person.email } : {}),
  };
  const idToken = jwt.sign(claims, key.privatePem, { algorithm: 'RS256', keyid: key.kid });
  await DisclosureLog.create({ schoolId: school._id, connectorId: c._id, connectorName: c.name, kind: 'lti_tool', channel: 'lti', what: 'launch', categories: ['pseudonymous id', 'role', ...(cls ? ['class'] : []), ...require('./catalog').categoriesOf(c.scopes)], records: 1 });
  await Connector.updateOne({ _id: c._id }, { $set: { lastUsedAt: new Date() } });
  return { redirectUri: String(q.redirect_uri), idToken, state: String(q.state) };
}

// a page that posts a form to the tool and nothing else: its one script is allowed by hash, and the form may only go to the tool's own address
function formPage(action, fields, { title, detach = false, back = false } = {}) {
  const esc = (v) => String(v).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const script = `${detach ? 'try{window.opener=null}catch(e){}' : ''}document.getElementById('f').submit();`;
  const inputs = Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title || 'Opening the tool')}</title></head><body><form id="f" method="post" action="${esc(action)}">${inputs}<noscript><p>Press the button to open the tool.</p><button type="submit">Open the tool</button></noscript></form><script>${script}</script></body></html>`;
  const hash = crypto.createHash('sha256').update(script).digest('base64'); const u = new URL(action);
  // the login address usually sends the browser straight back to this platform, and a browser checks that hop against the same rule, so the platform itself is allowed too
  return { html, csp: `default-src 'none'; script-src 'sha256-${hash}'; form-action ${back ? "'self' " : ''}${u.origin}; base-uri 'none'` };
}
// step 2 answer: the signed token goes back to the tool
const postForm = ({ redirectUri, idToken, state }) => formPage(redirectUri, { id_token: idToken, state });
// step 1 page: the browser is sent to the tool's login address. It is served from here, so the app's own rules about where forms may go are not loosened, and it cuts the link to the window that opened it.
async function beginPage(hint, schoolId) {
  const st = await IntState.findOne({ kind: 'lti_launch', key: String(hint || ''), usedAt: null, expiresAt: { $gt: new Date() } }); if (!st || String(st.schoolId) !== String(schoolId)) throw new LtiError(400, 'invalid_request', 'This launch has expired. Open the tool again.');
  const c = await Connector.findOne({ _id: oid(st.data.connectorId), schoolId: st.schoolId, kind: 'lti_tool' }); if (!c || c.status !== 'active') throw new LtiError(404, 'not_found', 'This tool is not available.');
  return formPage(c.config.loginUrl, st.data.fields, { detach: true, back: true });
}

module.exports = { platformKey, jwks, startLaunch, authorize, postForm, beginPage, tools, canOpenClass, issuerOf, LtiError, pseudonym };
