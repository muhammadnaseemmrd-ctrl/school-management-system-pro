// Sign-in through the school's own account provider (OpenID Connect, authorization code with PKCE). For teachers and administrators only.
// The provider says who the person is; Aulensia still decides whether that person has an account here. Nobody is created by signing in.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('../../lib/pgdoc');
const Connector = require('../../models/Connector');
const IntState = require('../../models/IntState');
const School = require('../../models/School');
const User = require('../../models/User');
const Teacher = require('../../models/Teacher');
const V = require('./vault');
const NET = require('./net');
const { generateAccessToken, generateRefreshToken } = require('../jwt');

const oid = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
class SsoError extends Error { constructor(code, desc) { super(desc); this.code = code; } }
const origin = (req) => `${String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0]}://${req.get('host')}`;
const redirectUri = (req) => `${origin(req)}/api/sso/callback`;

const active = (schoolId) => Connector.findOne({ schoolId: oid(schoolId), kind: 'sso', status: 'active' });
async function info(schoolCode) {
  const school = await School.findOne({ code: String(schoolCode || '').trim() }).select('_id name isActive').lean(); if (!school || school.isActive === false) return { enabled: false };
  const c = await active(school._id); return c ? { enabled: true, name: c.name } : { enabled: false };
}

// step 1: where to send the browser
async function start(req, schoolCode) {
  const school = await School.findOne({ code: String(schoolCode || '').trim() }).select('_id isActive').lean(); if (!school || school.isActive === false) throw new SsoError('failed', 'This school does not exist.');
  const c = await active(school._id); if (!c) throw new SsoError('failed', 'Single sign-on is not turned on for this school.');
  const state = V.token(18); const nonce = V.token(18); const verifier = V.token(32); const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  await IntState.create({ schoolId: school._id, kind: 'sso_login', key: state, data: { connectorId: String(c._id), nonce, verifier }, expiresAt: new Date(Date.now() + 10 * 60000) });
  const u = new URL(c.config.authorizationEndpoint);
  for (const [k, v] of Object.entries({ response_type: 'code', client_id: c.config.clientId, redirect_uri: redirectUri(req), scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })) u.searchParams.set(k, v);
  return u.toString();
}

// the provider's public keys, kept for five minutes
const jwksCache = new Map();
async function keyFor(c, kid) {
  const hit = jwksCache.get(String(c._id)); let set = hit && Date.now() - hit.at < 300000 ? hit.keys : null;
  const find = (keys) => (keys || []).find((k) => k.kty === 'RSA' && (!kid || k.kid === kid) && (!k.use || k.use === 'sig'));
  let jwk = find(set);
  if (!jwk) { const r = await NET.json(c.config.jwksUri, { timeoutMs: 5000, maxBytes: 65536 }); if (r.status !== 200 || !r.body || !Array.isArray(r.body.keys)) throw new SsoError('failed', 'The provider keys could not be read.'); set = r.body.keys; jwksCache.set(String(c._id), { at: Date.now(), keys: set }); jwk = find(set); }
  if (!jwk) throw new SsoError('failed', 'The provider key was not found.');
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

// step 2: the provider sent the person back with a code
async function callback(req, { code, state, error }) {
  if (error) throw new SsoError('denied', 'The provider did not sign you in.');
  if (!code || !state) throw new SsoError('failed', 'The sign-in answer was incomplete.');
  const used = await IntState.updateOne({ kind: 'sso_login', key: String(state), usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
  if (used.matchedCount !== 1) throw new SsoError('failed', 'This sign-in has expired. Try again.');
  const st = await IntState.findOne({ kind: 'sso_login', key: String(state) }); const c = await Connector.findOne({ _id: oid(st.data.connectorId), schoolId: st.schoolId, kind: 'sso' });
  if (!c || c.status !== 'active') throw new SsoError('failed', 'Single sign-on is not turned on for this school.');
  let tok;
  try {
    const form = new URLSearchParams({ grant_type: 'authorization_code', code: String(code), redirect_uri: redirectUri(req), client_id: c.config.clientId, code_verifier: st.data.verifier }); if (c.secretEnc) form.set('client_secret', V.open(c.secretEnc));
    tok = await NET.json(c.config.tokenEndpoint, { method: 'POST', body: form.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, timeoutMs: 8000, maxBytes: 65536 });
  } catch (e) { throw new SsoError('failed', 'The provider could not be reached.'); }
  if (tok.status !== 200 || !tok.body || !tok.body.id_token) throw new SsoError('failed', 'The provider did not give a sign-in token.');
  let claims;
  try {
    const head = jwt.decode(tok.body.id_token, { complete: true }); if (!head || head.header.alg !== 'RS256') throw new Error('alg');
    claims = jwt.verify(tok.body.id_token, await keyFor(c, head.header.kid), { algorithms: ['RS256'], issuer: c.config.issuer, audience: c.config.clientId, clockTolerance: 60 });
  } catch (e) { if (e instanceof SsoError) throw e; throw new SsoError('failed', 'The sign-in token could not be trusted.'); }
  if (!V.same(String(claims.nonce || ''), st.data.nonce)) throw new SsoError('failed', 'The sign-in token was not made for this sign-in.');
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== c.config.clientId) throw new SsoError('failed', 'The sign-in token was made for someone else.');
  const email = String(claims.email || '').trim().toLowerCase();
  if (!email || claims.email_verified !== true) throw new SsoError('unverified', 'The provider has not verified this email address.');
  const domain = email.split('@')[1]; if (!(c.config.allowedDomains || []).includes(domain)) throw new SsoError('domain', 'This email address is not from an allowed domain.');
  const roles = c.config.roles || ['admin', 'teacher']; let person = null; let role = null;
  if (roles.includes('admin')) { person = await User.findOne({ email, schoolId: c.schoolId, role: 'admin' }); if (person) role = 'admin'; }
  if (!person && roles.includes('teacher')) { person = await Teacher.findOne({ email, schoolId: c.schoolId }); if (person) role = 'teacher'; }
  if (!person) throw new SsoError('no_account', 'There is no account for this email address.');
  if (person.isActive === false) throw new SsoError('inactive', 'This account has been deactivated.');
  const out = V.token(24); await IntState.create({ schoolId: c.schoolId, kind: 'sso_code', key: out, data: { userId: String(person._id), role, connectorId: String(c._id) }, expiresAt: new Date(Date.now() + 60000) });
  await Connector.updateOne({ _id: c._id }, { $set: { lastUsedAt: new Date() } });
  return { code: out, schoolId: String(c.schoolId), userId: String(person._id), role, connector: c };
}

// step 3: the app trades the one-time code for its own tokens, the same as a password sign-in gives
async function exchange(code) {
  const used = await IntState.updateOne({ kind: 'sso_code', key: String(code || ''), usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
  if (used.matchedCount !== 1) throw new SsoError('failed', 'This sign-in code has expired.');
  const st = await IntState.findOne({ kind: 'sso_code', key: String(code) }); const Model = st.data.role === 'admin' ? User : Teacher;
  const user = await Model.findOne({ _id: oid(st.data.userId), schoolId: st.schoolId }).select('+password'); if (!user || user.isActive === false) throw new SsoError('inactive', 'This account has been deactivated.');
  const accessToken = generateAccessToken(user._id, user.schoolId, user.role || st.data.role); const refreshToken = generateRefreshToken(user._id, user.schoolId, user.role || st.data.role);
  user.refreshTokens.push({ token: refreshToken }); user.lastLogin = new Date(); await user.save(); user.password = undefined;
  const school = await School.findById(user.schoolId).populate('adminId', 'name email phone');
  return { message: 'Login successful', user, school, accessToken, refreshToken };
}

// does what the school typed look like a working provider?
async function probe(config) {
  const problems = [];
  for (const [k, label] of [['authorizationEndpoint', 'The sign-in address'], ['tokenEndpoint', 'The token address'], ['jwksUri', 'The keys address']]) { const r = NET.checkUrl(config[k], { label }); if (!r.ok) problems.push(r.why); }
  if (problems.length) return { ok: false, problems };
  try { const r = await NET.json(config.jwksUri, { timeoutMs: 5000, maxBytes: 65536 }); const rsa = r.body && Array.isArray(r.body.keys) ? r.body.keys.filter((k) => k.kty === 'RSA').length : 0; if (r.status !== 200 || !rsa) problems.push('The keys address did not return any RSA signing keys.'); return { ok: !problems.length, problems, keys: rsa }; }
  catch (e) { return { ok: false, problems: [`The keys address could not be reached (${e.code || 'error'}).`] }; }
}

module.exports = { info, start, callback, exchange, probe, SsoError, redirectUri };
