// Connections to outside systems (PRD E30): school-owned API keys, webhooks, learning tools (LTI) and single sign-on.
// Everything here is for administrators of the whole school. A connector that shares anything sensitive goes live only after a second administrator has looked at it.
const S = require('../utils/analytics/service');
const P = require('../utils/group/policy');
const CS = require('../utils/campus');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const Connector = require('../models/Connector');
const WebhookDelivery = require('../models/WebhookDelivery');
const DisclosureLog = require('../models/DisclosureLog');
const Campus = require('../models/Campus');
const V = require('../utils/integrations/vault');
const K = require('../utils/integrations/keys');
const NET = require('../utils/integrations/net');
const W = require('../utils/integrations/webhook');
const SSO = require('../utils/integrations/sso');
const CAT = require('../utils/integrations/catalog');

const { Fail, wrap, ctxOf, oid, sid } = S;
const body = (req) => req.body || {};
const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'connector', entityId: String(id), schoolId: req.user.schoolId, detail }).catch(() => {});
const tell = (schoolId, recipients, title, text, key) => N.notify({ schoolId, recipients, title, body: text, link: '/admin#/integrations', type: 'integration', key }).catch((e) => console.error('integration notify:', e.message));
const lines = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/)).map((x) => String(x).trim()).filter(Boolean);

exports.wide = async (req, res, next) => {
  try { if (!(await CS.scopeOf(req.user))) return next(); return res.status(403).json({ message: 'Connections are managed by an administrator of the whole school.' }); }
  catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};

/* ───────── what a connector looks like to the screen: never a secret ───────── */
const hourNow = K.hourOf();
const publicConfig = (c) => {
  const cfg = { ...(c.config || {}) };
  if (c.kind === 'api_key') return { allowedIps: cfg.allowedIps || [], campusIds: cfg.campusIds || [] };
  return cfg;
};
const view = (c) => ({
  id: String(c._id), kind: c.kind, name: c.name, purpose: c.purpose, status: c.status, scopes: c.scopes, config: publicConfig(c),
  keyHint: c.keyPrefix ? `aul_${c.keyPrefix}_…` : null, expiresAt: c.expiresAt, quotaPerHour: c.quotaPerHour, usedThisHour: c.usageHour === hourNow ? c.usageCount : 0,
  rotatedAt: c.rotatedAt, graceUntil: c.previousUntil && new Date(c.previousUntil) > new Date() ? c.previousUntil : null, lastUsedAt: c.lastUsedAt, lastUsedIp: c.lastUsedIp || '',
  review: { required: !!c.review.required, status: c.review.status, why: c.review.why, askedByName: c.review.askedByName, askedAt: c.review.askedAt, decidedByName: c.review.decidedByName, decidedAt: c.review.decidedAt, note: c.review.note, soleAdmin: !!c.review.soleAdmin },
  failures: c.failures, pausedReason: c.pausedReason, revokedAt: c.revokedAt, revokedReason: c.revokedReason, createdByName: c.createdByName, createdAt: c.createdAt, updatedAt: c.updatedAt,
  shares: CAT.categoriesOf(c.scopes), history: (c.history || []).slice(-30).reverse(),
});
const log = (c, by, what, note = '') => ({ $push: { history: { at: new Date(), by, what, note } } });
const find = async (req, id) => { const c = oid(id) ? await Connector.findOne({ _id: oid(id), schoolId: oid(sid(req)) }) : null; if (!c) throw new Fail(404, 'This connection was not found.'); return c; };

/* ───────── checking what the school typed ───────── */
const text = (v, name, min, max) => S.text(v, name, { min, max });
// kept exactly as typed (only trimmed): an issuer or a redirect address is compared character for character, so it must not be rewritten
const url = (v, name) => { const r = NET.checkUrl(v, { label: name }); if (!r.ok) throw new Fail(422, r.why); return String(v).trim(); };
const isDomain = (d) => /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d);

async function clean(req, kind, b, current) {
  const scopesIn = lines(b.scopes); const scopes = [...new Set(scopesIn)];
  for (const s of scopes) if (!CAT.SCOPES[s] || !CAT.SCOPES[s].kinds.includes(kind)) throw new Fail(422, `${s} cannot be given to this kind of connection.`);
  const cfgIn = b.config && typeof b.config === 'object' ? b.config : {}; const config = {}; let extra = {};
  if (kind === 'api_key') {
    if (!scopes.length) throw new Fail(422, 'Choose what this key may read.');
    const ips = lines(cfgIn.allowedIps); if (ips.length > 10 || ips.some((i) => !require('net').isIP(i))) throw new Fail(422, 'Allowed addresses must be valid IP addresses, at most ten.'); config.allowedIps = ips;
    const camps = lines(cfgIn.campusIds); if (camps.length) { const found = await Campus.find({ schoolId: oid(sid(req)), _id: { $in: camps.map(oid).filter(Boolean) } }).select('_id').lean(); if (found.length !== camps.length) throw new Fail(422, 'One of the campuses was not found.'); config.campusIds = camps; } else config.campusIds = [];
    const q = b.quotaPerHour === undefined || b.quotaPerHour === '' ? (current ? current.quotaPerHour : 1000) : Number(b.quotaPerHour); if (!Number.isInteger(q) || q < 10 || q > 20000) throw new Fail(422, 'Calls per hour must be a whole number from 10 to 20,000.'); extra.quotaPerHour = q;
    if (b.expiresInDays !== undefined && b.expiresInDays !== '' && b.expiresInDays !== null) { const d = Number(b.expiresInDays); if (!Number.isInteger(d) || d < 1 || d > 365) throw new Fail(422, 'A key can last from 1 to 365 days.'); extra.expiresAt = new Date(Date.now() + d * 864e5); }
  } else if (kind === 'webhook') {
    config.url = url(cfgIn.url, 'The webhook address'); const events = [...new Set(lines(cfgIn.events))]; if (!events.length) throw new Fail(422, 'Choose at least one event.');
    for (const e of events) { if (!CAT.EVENTS[e]) throw new Fail(422, `${e} is not an event.`); if (!scopes.includes(CAT.EVENTS[e].scope)) throw new Fail(422, `${CAT.EVENTS[e].label} needs the scope ${CAT.EVENTS[e].scope}.`); }
    config.events = events;
  } else if (kind === 'lti_tool') {
    config.loginUrl = url(cfgIn.loginUrl, 'The tool login address'); config.targetLinkUri = url(cfgIn.targetLinkUri, 'The tool launch address');
    const reds = lines(cfgIn.redirectUris); if (!reds.length || reds.length > 5) throw new Fail(422, 'Give one to five redirect addresses.'); config.redirectUris = reds.map((r) => url(r, 'A redirect address'));
    const roles = [...new Set(lines(cfgIn.roles))]; if (!roles.length || roles.some((r) => !['teacher', 'student', 'admin'].includes(r))) throw new Fail(422, 'Choose who may open the tool: teachers, students or administrators.'); config.roles = roles;
    config.target = cfgIn.target === 'iframe' ? 'iframe' : 'window';
    const custom = cfgIn.custom && typeof cfgIn.custom === 'object' && !Array.isArray(cfgIn.custom) ? cfgIn.custom : {}; if (Object.keys(custom).length > 10 || Object.entries(custom).some(([k, v]) => !/^[a-z][a-z0-9_]{0,40}$/.test(k) || typeof v !== 'string' || v.length > 120)) throw new Fail(422, 'Custom values are at most ten, with lower-case names and short text.'); config.custom = custom;
    config.clientId = current ? current.config.clientId : `aul_lti_${V.token(10)}`; config.deploymentId = current ? current.config.deploymentId : `dep_${V.token(6)}`;
  } else if (kind === 'sso') {
    for (const [k, l] of [['issuer', 'The issuer'], ['authorizationEndpoint', 'The sign-in address'], ['tokenEndpoint', 'The token address'], ['jwksUri', 'The keys address']]) config[k] = url(cfgIn[k], l);
    config.clientId = text(cfgIn.clientId, 'The client id', 3, 200); const doms = [...new Set(lines(cfgIn.allowedDomains).map((d) => d.toLowerCase()))]; if (!doms.length || doms.length > 10 || doms.some((d) => !isDomain(d))) throw new Fail(422, 'Give one to ten allowed email domains, such as school.edu.pk.'); config.allowedDomains = doms;
    const roles = [...new Set(lines(cfgIn.roles))]; if (!roles.length || roles.some((r) => !['teacher', 'admin'].includes(r))) throw new Fail(422, 'Choose who may sign in this way: teachers, administrators or both.'); config.roles = roles;
    if (scopes.length) throw new Fail(422, 'Single sign-on shares nothing, so it has no scopes.');
  }
  return { scopes, config, extra };
}

/* ───────── reading ───────── */
exports.catalog = wrap('int.catalog', async (req, res) => res.json({
  kinds: Object.entries(CAT.KINDS).map(([k, v]) => ({ kind: k, ...v })),
  scopes: Object.entries(CAT.SCOPES).map(([k, v]) => ({ scope: k, label: v.label, risk: v.risk, kinds: v.kinds, categories: v.categories })),
  events: Object.entries(CAT.EVENTS).map(([k, v]) => ({ event: k, label: v.label, scope: v.scope })),
  retry: { minutes: CAT.RETRY_MINUTES, attempts: CAT.MAX_ATTEMPTS, pauseAfter: CAT.PAUSE_AFTER },
}));

exports.list = wrap('int.list', async (req, res) => {
  const f = { schoolId: oid(sid(req)) }; if (req.query.kind) f.kind = String(req.query.kind); if (req.query.status) f.status = String(req.query.status);
  res.json({ connectors: (await Connector.find(f).sort({ createdAt: -1 }).limit(200)).map(view) });
});
exports.one = wrap('int.one', async (req, res) => res.json({ connector: view(await find(req, req.params.id)) }));

exports.setup = wrap('int.setup', async (req, res) => {
  const c = await find(req, req.params.id); const school = await require('../models/School').findById(sid(req)).select('code name').lean();
  const origin = `${String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0]}://${req.get('host')}`;
  if (c.kind === 'lti_tool') { const iss = `${origin}/api/lti/${encodeURIComponent(school.code)}`; return res.json({ kind: c.kind, platform: { issuer: iss, authorizationEndpoint: `${iss}/auth`, jwksUrl: `${iss}/jwks.json`, clientId: c.config.clientId, deploymentId: c.config.deploymentId, launchMethod: 'Platform-initiated, LTI 1.3 resource link request' } }); }
  if (c.kind === 'sso') return res.json({ kind: c.kind, redirectUri: `${origin}/api/sso/callback`, startAddress: `${origin}/api/sso/${encodeURIComponent(school.code)}/start`, note: 'Register the redirect address with your provider. The provider must sign tokens with RS256 and send a verified email address.' });
  if (c.kind === 'api_key') return res.json({ kind: c.kind, rosterBase: `${origin}/api/oneroster/v1p1`, openApiBase: `${origin}/api/open/v1`, header: 'Authorization: Bearer <key>', note: 'OneRoster 1.1 rostering, read-only. Pagination uses limit and offset; most calls need roster.read.' });
  return res.json({ kind: c.kind, signature: 'Aulensia-Signature: t=<unix time>,v1=<HMAC-SHA256 of "<t>.<body>" with the secret>', headers: ['Aulensia-Event-Id', 'Aulensia-Event-Type', 'Aulensia-Delivery'], note: 'Answer with a 2xx within five seconds. Ignore an event id you have already handled.' });
});

exports.overview = wrap('int.overview', async (req, res) => {
  const schoolId = oid(sid(req)); await W.sweep(sid(req), { limit: 20 });    // a throttled catch-up so the screen is never behind
  const all = await Connector.find({ schoolId }).lean(); const live = all.filter((c) => c.status !== 'revoked');
  const day = new Date(Date.now() - 864e5); const del = await WebhookDelivery.find({ schoolId, createdAt: { $gte: day } }).select('status').lean();
  const count = (s) => del.filter((d) => d.status === s).length; const dead = await WebhookDelivery.countDocuments({ schoolId, status: 'dead' });
  res.json({
    byKind: Object.fromEntries(Object.keys(CAT.KINDS).map((k) => [k, live.filter((c) => c.kind === k).length])),
    byStatus: Object.fromEntries(['draft', 'pending_review', 'active', 'paused'].map((s) => [s, live.filter((c) => c.status === s).length])),
    waitingForReview: live.filter((c) => c.status === 'pending_review').map(view),
    needAttention: live.filter((c) => c.kind === 'webhook' && (c.failures > 0 || c.status === 'paused')).map((c) => ({ id: String(c._id), name: c.name, status: c.status, failures: c.failures, pausedReason: c.pausedReason })),
    deliveries24h: { total: del.length, delivered: count('delivered'), pending: count('pending'), failed: count('failed'), dead: count('dead') }, deadTotal: dead,
    disclosures24h: await DisclosureLog.countDocuments({ schoolId, at: { $gte: day } }),
    expiring: live.filter((c) => c.kind === 'api_key' && c.expiresAt && new Date(c.expiresAt) < new Date(Date.now() + 14 * 864e5)).map((c) => ({ id: String(c._id), name: c.name, expiresAt: c.expiresAt })),
  });
});

/* ───────── making and changing ───────── */
exports.create = wrap('int.create', async (req, res) => {
  const ctx = ctxOf(req); const b = body(req); const kind = String(b.kind || ''); if (!CAT.KINDS[kind]) throw new Fail(422, 'Choose what kind of connection this is.');
  const name = text(b.name, 'The name', 2, 80); const purpose = text(b.purpose, 'The purpose', 10, 300); const { scopes, config, extra } = await clean(req, kind, b, null);
  if (await Connector.countDocuments({ schoolId: oid(ctx.schoolId), status: { $ne: 'revoked' } }) >= 50) throw new Fail(422, 'A school can have at most 50 connections.');
  if (await Connector.findOne({ schoolId: oid(ctx.schoolId), name, status: { $ne: 'revoked' } })) throw new Fail(409, 'Another connection already has this name.');
  const doc = { schoolId: oid(ctx.schoolId), kind, name, purpose, scopes, config, ...extra, createdById: oid(ctx.actor.id), createdByName: ctx.actor.name, history: [{ at: new Date(), by: ctx.actor.name, what: 'created', note: '' }] };
  const why = CAT.reviewWhy(kind, scopes); doc.review = { required: why.length > 0, status: 'none', why };
  let shown = null;
  if (kind === 'api_key') { const m = K.mint(); doc.keyPrefix = m.prefix; doc.keyHash = m.hash; shown = { key: m.key }; }
  else if (kind === 'webhook') { const sec = `whsec_${V.token(24)}`; doc.secretEnc = V.seal(sec); doc.secretHint = `…${sec.slice(-4)}`; shown = { secret: sec }; }
  else if (kind === 'lti_tool') doc.secretEnc = V.seal(V.token(32));
  else if (kind === 'sso' && b.clientSecret) doc.secretEnc = V.seal(text(b.clientSecret, 'The client secret', 3, 500));
  const c = await Connector.create(doc); await A(req, 'integration.create', c._id, `${kind}: ${name}`);
  res.status(201).json({ connector: view(c), ...(shown || {}), shownOnce: !!shown });
});

exports.update = wrap('int.update', async (req, res) => {
  const ctx = ctxOf(req); const c = await find(req, req.params.id); const b = body(req);
  if (!['draft', 'paused'].includes(c.status)) throw new Fail(409, 'Pause this connection before changing it.', { reason: 'not_paused' });
  const set = {};
  if (b.name !== undefined) { set.name = text(b.name, 'The name', 2, 80); if (set.name !== c.name && await Connector.findOne({ schoolId: c.schoolId, name: set.name, status: { $ne: 'revoked' } })) throw new Fail(409, 'Another connection already has this name.'); }
  if (b.purpose !== undefined) set.purpose = text(b.purpose, 'The purpose', 10, 300);
  if (b.scopes !== undefined || b.config !== undefined || b.quotaPerHour !== undefined || b.expiresInDays !== undefined) {
    const merged = { scopes: b.scopes !== undefined ? b.scopes : c.scopes, config: b.config !== undefined ? { ...(c.kind === 'api_key' ? publicConfig(c) : c.config), ...b.config } : (c.kind === 'api_key' ? publicConfig(c) : c.config), quotaPerHour: b.quotaPerHour, expiresInDays: b.expiresInDays };
    const out = await clean(req, c.kind, merged, c); set.scopes = out.scopes; set.config = c.kind === 'api_key' ? { ...c.config, ...out.config } : out.config; Object.assign(set, out.extra);
    const why = CAT.reviewWhy(c.kind, out.scopes); set.review = { ...c.review.toObject?.() ?? c.review, required: why.length > 0, why, status: 'none' };
  }
  if (c.kind === 'sso' && b.clientSecret) set.secretEnc = V.seal(text(b.clientSecret, 'The client secret', 3, 500));
  if (!Object.keys(set).length) throw new Fail(422, 'Nothing to change.');
  await Connector.updateOne({ _id: c._id }, { $set: set, ...log(c, ctx.actor.name, 'changed', Object.keys(set).join(', ')) }); await A(req, 'integration.update', c._id, Object.keys(set).join(', '));
  res.json({ connector: view(await Connector.findById(c._id)) });
});

const wideOthers = async (schoolId, exceptId) => (await P.wideAdmins(schoolId)).filter((a) => String(a._id) !== String(exceptId)).map((a) => ({ id: a._id, role: 'admin' }));

exports.activate = wrap('int.activate', async (req, res) => {
  const ctx = ctxOf(req); const c = await find(req, req.params.id);
  if (c.status !== 'draft' && c.status !== 'paused') throw new Fail(409, 'This connection cannot be turned on from here.');
  if (c.kind === 'sso') {
    if (await Connector.findOne({ schoolId: c.schoolId, kind: 'sso', status: { $in: ['active', 'pending_review'] }, _id: { $ne: c._id } })) throw new Fail(409, 'This school already has a sign-in provider turned on or waiting.');
    const p = await SSO.probe(c.config); if (!p.ok) throw new Fail(422, `The provider does not look ready: ${p.problems.join(' ')}`, { problems: p.problems });
  }
  if (c.review.required && c.review.status !== 'approved') {
    await Connector.updateOne({ _id: c._id }, { $set: { status: 'pending_review', 'review.status': 'pending', 'review.askedById': oid(ctx.actor.id), 'review.askedByName': ctx.actor.name, 'review.askedAt': new Date() }, ...log(c, ctx.actor.name, 'asked for review', c.review.why.join('; ')) });
    await A(req, 'integration.review.ask', c._id, c.review.why.join('; '));
    await tell(c.schoolId, await wideOthers(c.schoolId, ctx.actor.id), 'A connection is waiting for review', `${c.name}: ${c.review.why[0] || 'sensitive information'}`, `int:ask:${c._id}:${Date.now() >> 12}`);
    return res.json({ connector: view(await Connector.findById(c._id)), waiting: true });
  }
  await Connector.updateOne({ _id: c._id }, { $set: { status: 'active', failures: 0, pausedReason: '' }, ...log(c, ctx.actor.name, 'turned on', '') }); await A(req, 'integration.activate', c._id, c.name);
  res.json({ connector: view(await Connector.findById(c._id)), waiting: false });
});

exports.decide = wrap('int.decide', async (req, res) => {
  const ctx = ctxOf(req); const c = await find(req, req.params.id); const approve = body(req).approve === true; const note = S.text(body(req).note, 'The note', { min: approve ? 0 : 5, max: 300 });
  if (c.status !== 'pending_review') throw new Fail(409, 'Nothing is waiting for review.');
  const sole = await P.separateWide(ctx, { madeById: c.review.askedById, madeByCampus: false }, 'A connection');
  const fresh = await Connector.updateOne({ _id: c._id, status: 'pending_review' }, { $set: approve ? { status: 'active', failures: 0, pausedReason: '', 'review.status': 'approved', 'review.decidedById': oid(ctx.actor.id), 'review.decidedByName': ctx.actor.name, 'review.decidedAt': new Date(), 'review.note': note, 'review.soleAdmin': !!sole } : { status: 'draft', 'review.status': 'rejected', 'review.decidedById': oid(ctx.actor.id), 'review.decidedByName': ctx.actor.name, 'review.decidedAt': new Date(), 'review.note': note, 'review.soleAdmin': !!sole }, ...log(c, ctx.actor.name, approve ? 'approved' : 'turned down', note) });
  if (fresh.matchedCount !== 1) throw new Fail(409, 'Someone else already decided this.');
  await A(req, approve ? 'integration.review.approve' : 'integration.review.reject', c._id, note);
  await tell(c.schoolId, [{ id: String(c.review.askedById), role: 'admin' }], approve ? 'Connection approved' : 'Connection turned down', `${c.name}${note ? `: ${note}` : ''}`, `int:dec:${c._id}:${Date.now() >> 12}`);
  res.json({ connector: view(await Connector.findById(c._id)), soleAdmin: !!sole });
});

exports.pause = wrap('int.pause', async (req, res) => {
  const ctx = ctxOf(req); const c = await find(req, req.params.id); const reason = text(body(req).reason, 'The reason', 5, 200);
  if (!['active', 'pending_review'].includes(c.status)) throw new Fail(409, 'Only a connection that is on can be paused.');
  await Connector.updateOne({ _id: c._id }, { $set: { status: 'paused', pausedReason: reason, 'review.status': c.review.status === 'pending' ? 'none' : c.review.status }, ...log(c, ctx.actor.name, 'paused', reason) }); await A(req, 'integration.pause', c._id, reason);
  res.json({ connector: view(await Connector.findById(c._id)) });
});
exports.resume = wrap('int.resume', async (req, res) => {
  const ctx = ctxOf(req); const c = await find(req, req.params.id); if (c.status !== 'paused') throw new Fail(409, 'This connection is not paused.');
  if (c.review.required && c.review.status !== 'approved') throw new Fail(409, 'This connection changed since it was approved. Ask for review again.', { reason: 'review' });
  await Connector.updateOne({ _id: c._id }, { $set: { status: 'active', failures: 0, pausedReason: '' }, ...log(c, ctx.actor.name, 'resumed', '') }); await A(req, 'integration.resume', c._id, c.name); W.kick(c.schoolId);
  res.json({ connector: view(await Connector.findById(c._id)) });
});

exports.rotate = wrap('int.rotate', async (req, res) => {
  const ctx = ctxOf(req); const c = await find(req, req.params.id); const g = body(req).graceHours === undefined || body(req).graceHours === '' ? 24 : Number(body(req).graceHours);
  if (!Number.isInteger(g) || g < 0 || g > 72) throw new Fail(422, 'The old key can keep working for 0 to 72 hours.');
  if (!['api_key', 'webhook'].includes(c.kind) || c.status === 'revoked') throw new Fail(409, 'Only a key or a webhook secret can be replaced.');
  const until = g ? new Date(Date.now() + g * 3600000) : null; let shown;
  if (c.kind === 'api_key') { const m = K.mint(); await Connector.updateOne({ _id: c._id }, { $set: { keyPrefix: m.prefix, keyHash: m.hash, previousHash: until ? c.keyHash : null, previousPrefix: until ? c.keyPrefix : '', previousUntil: until, rotatedAt: new Date() }, ...log(c, ctx.actor.name, 'replaced the key', `old key valid ${g} hours`) }); shown = { key: m.key }; }
  else { const sec = `whsec_${V.token(24)}`; await Connector.updateOne({ _id: c._id }, { $set: { secretEnc: V.seal(sec), secretHint: `…${sec.slice(-4)}`, rotatedAt: new Date(), previousSecretEnc: until ? c.secretEnc : null, previousUntil: until }, ...log(c, ctx.actor.name, 'replaced the secret', `old secret valid ${g} hours`) }); shown = { secret: sec }; }
  await A(req, 'integration.rotate', c._id, `grace ${g}h`); res.json({ connector: view(await Connector.findById(c._id)), ...shown, shownOnce: true, graceHours: g });
});

exports.revoke = wrap('int.revoke', async (req, res) => {
  const ctx = ctxOf(req); const c = await find(req, req.params.id); const reason = text(body(req).reason, 'The reason', 5, 200); if (c.status === 'revoked') throw new Fail(409, 'This connection was already removed.');
  await Connector.updateOne({ _id: c._id }, { $set: { status: 'revoked', revokedAt: new Date(), revokedByName: ctx.actor.name, revokedReason: reason, keyHash: null, previousHash: null, previousUntil: null }, ...log(c, ctx.actor.name, 'removed', reason) });
  await WebhookDelivery.updateMany({ connectorId: c._id, status: { $in: ['pending', 'failed'] } }, { $set: { status: 'dead', lastError: 'The webhook was removed.' } }); await A(req, 'integration.revoke', c._id, reason);
  res.json({ connector: view(await Connector.findById(c._id)) });
});

exports.test = wrap('int.test', async (req, res) => {
  const c = await find(req, req.params.id); if (c.status === 'revoked') throw new Fail(409, 'This connection was removed.');
  if (c.kind === 'webhook') { const r = await W.testEvent(c); await A(req, 'integration.test', c._id, String(r.result)); return res.json({ result: r.result, delivery: dview(r.delivery) }); }
  if (c.kind === 'sso') { const p = await SSO.probe(c.config); await A(req, 'integration.test', c._id, p.ok ? 'ok' : 'problems'); return res.json({ result: p.ok ? 'ok' : 'problems', ...p }); }
  throw new Fail(422, 'There is nothing to test for this kind of connection.');
});

/* ───────── deliveries and disclosures ───────── */
const dview = (d) => ({ id: String(d._id), connectorId: String(d.connectorId), eventId: d.eventId, type: d.type, status: d.status, attempts: d.attempts, lastStatus: d.lastStatus, lastError: d.lastError, lastMs: d.lastMs, nextAttemptAt: d.nextAttemptAt, deliveredAt: d.deliveredAt, createdAt: d.createdAt, replayOf: d.replayOf ? String(d.replayOf) : null, payload: d.payload, history: (d.history || []).slice(-10) });
exports.deliveries = wrap('int.deliveries', async (req, res) => {
  const c = await find(req, req.params.id); const f = { schoolId: c.schoolId, connectorId: c._id }; if (req.query.status) f.status = String(req.query.status);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30)); const page = Math.max(1, Number(req.query.page) || 1);
  const [rows, total] = await Promise.all([WebhookDelivery.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), WebhookDelivery.countDocuments(f)]);
  res.json({ deliveries: rows.map(dview), total, page, limit });
});
exports.replay = wrap('int.replay', async (req, res) => {
  const d = oid(req.params.id) ? await WebhookDelivery.findOne({ _id: oid(req.params.id), schoolId: oid(sid(req)) }) : null; if (!d) throw new Fail(404, 'This delivery was not found.');
  if (d.type === 'connector.test') throw new Fail(422, 'A test event does not need to be sent again. Send a new test.');
  let nd; try { nd = await W.replay(d, ctxOf(req).actor.name); } catch (e) { if (e.code === 409) throw new Fail(409, e.message); throw e; }
  await A(req, 'integration.replay', d.connectorId, d.type); W.kick(sid(req)); res.status(201).json({ delivery: dview(nd) });
});

const guard = (v) => (/^[=+\-@\t\r]/.test(String(v)) ? `'${v}` : String(v));
exports.disclosures = wrap('int.disclosures', async (req, res) => {
  const f = { schoolId: oid(sid(req)) }; if (req.query.connectorId) { if (!oid(req.query.connectorId)) throw new Fail(422, 'Choose a connection from the list.'); f.connectorId = oid(req.query.connectorId); }
  const at = {}; if (req.query.from) { if (!S.isDay(req.query.from)) throw new Fail(422, 'Choose a valid first date.'); at.$gte = new Date(`${req.query.from}T00:00:00Z`); } if (req.query.to) { if (!S.isDay(req.query.to)) throw new Fail(422, 'Choose a valid last date.'); at.$lte = new Date(`${req.query.to}T23:59:59Z`); } if (Object.keys(at).length) f.at = at;
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50)); const page = Math.max(1, Number(req.query.page) || 1);
  const [rows, total] = await Promise.all([DisclosureLog.find(f).sort({ at: -1 }).skip((page - 1) * limit).limit(limit), DisclosureLog.countDocuments(f)]);
  const out = rows.map((r) => ({ id: String(r._id), at: r.at, connectorId: String(r.connectorId), connector: r.connectorName, kind: r.kind, channel: r.channel, what: r.what, categories: r.categories, records: r.records }));
  if (req.query.format === 'csv') { res.set('Content-Type', 'text/csv; charset=utf-8'); res.set('Content-Disposition', 'attachment; filename="disclosures.csv"'); return res.send(['When,Connection,Channel,What,Kinds of information,Records', ...out.map((r) => [new Date(r.at).toISOString(), r.connector, r.channel, r.what, r.categories.join('; '), r.records].map((v) => `"${guard(v).replace(/"/g, '""')}"`).join(','))].join('\n')); }
  res.json({ disclosures: out, total, page, limit });
});

// from the daily timer: send what is due and tidy short-lived records
exports.sweepAll = async () => {
  const IntState = require('../models/IntState'); const out = await W.sweep(null, { limit: 200 });
  const gone = await IntState.deleteMany({ expiresAt: { $lt: new Date(Date.now() - 3600000) } }); return { ...out, tidied: gone.deletedCount || 0 };
};
