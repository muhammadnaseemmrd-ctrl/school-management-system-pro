// School-owned API keys (PRD CAP-0110): scoped, limited per hour, rotatable with a grace period, revocable, and only ever readable once.
const Connector = require('../../models/Connector');
const V = require('./vault');
const { SCOPES } = require('./catalog');

const PREFIX_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const prefix = () => Array.from({ length: 8 }, () => PREFIX_CHARS[Math.floor(Math.random() * PREFIX_CHARS.length)]).join('');
// aul_<prefix>_<secret>: the prefix finds the connector, the secret is checked against a hash
function mint() { const p = prefix(); const secret = V.token(24); return { prefix: p, secret, key: `aul_${p}_${secret}`, hash: V.sha(secret) }; }
const parse = (raw) => { const m = String(raw || '').trim().match(/^aul_([a-z0-9]{8})_([A-Za-z0-9_-]{20,})$/); return m ? { prefix: m[1], secret: m[2] } : null; };
const bearer = (req) => { const h = String(req.headers.authorization || ''); const m = h.match(/^Bearer\s+(.+)$/i); return m ? m[1] : req.headers['x-api-key']; };

const hourOf = (d = new Date()) => d.toISOString().slice(0, 13);
const toNextHour = () => Math.max(1, 3600 - Math.floor((Date.now() % 3600000) / 1000));

// counts one call; false when the hour's limit is used up
async function spend(c) {
  const hour = hourOf(); const limit = c.quotaPerHour || 1000;
  const fresh = await Connector.updateOne({ _id: c._id, usageHour: { $ne: hour } }, { $set: { usageHour: hour, usageCount: 1 } });
  if (fresh.matchedCount === 1) return { ok: true, left: limit - 1, limit };
  const more = await Connector.updateOne({ _id: c._id, usageHour: hour, usageCount: { $lt: limit } }, { $inc: { usageCount: 1 } });
  if (more.matchedCount === 1) { const now = await Connector.findById(c._id).select('usageCount'); return { ok: true, left: Math.max(0, limit - (now ? now.usageCount : limit)), limit }; }
  return { ok: false, left: 0, limit };
}

const clientIp = (req) => String((req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')).split(',')[0].trim().replace(/^::ffff:/, '');

// the same answer for every bad key, so nobody can tell a wrong prefix from a wrong secret
async function identify(req) {
  const p = parse(bearer(req)); if (!p) return { error: [401, 'Unauthorized'] };
  const c = await Connector.findOne({ kind: 'api_key', $or: [{ keyPrefix: p.prefix }, { previousPrefix: p.prefix }] });
  if (!c) return { error: [401, 'Unauthorized'] };
  const h = V.sha(p.secret); const now = Date.now();
  const current = V.same(h, c.keyHash || ''); const previous = !current && c.previousHash && c.previousUntil && new Date(c.previousUntil).getTime() > now && V.same(h, c.previousHash);
  if (!current && !previous) return { error: [401, 'Unauthorized'] };
  if (c.status !== 'active') return { error: [401, 'Unauthorized'] };
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= now) return { error: [401, 'Unauthorized'] };
  const ips = (c.config && c.config.allowedIps) || []; const ip = clientIp(req);
  if (ips.length && !ips.includes(ip)) return { error: [403, 'This key may not be used from this address.'] };
  return { c, ip, rotatedKey: !!previous };
}

// middleware: needs a scope, optionally answers in the format of a standard
const authApi = (scope, { format = 'plain' } = {}) => async (req, res, next) => {
  const fail = (status, message, extra = {}) => (format === 'oneroster'
    ? res.status(status).json({ imsx_codeMajor: 'failure', imsx_severity: 'error', imsx_description: message, imsx_CodeMinor: { imsx_codeMinorField: [{ imsx_codeMinorFieldName: 'TargetEndSystem', imsx_codeMinorFieldValue: status === 401 ? 'unauthorisedrequest' : status === 403 ? 'forbidden' : status === 429 ? 'server_busy' : 'unknownobject' }] }, ...extra })
    : res.status(status).json({ message, ...extra }));
  try {
    const r = await identify(req); if (r.error) { if (r.error[0] === 401) res.set('WWW-Authenticate', 'Bearer realm="aulensia"'); return fail(r.error[0], r.error[1]); }
    const c = r.c; if (scope && !c.scopes.includes(scope)) return fail(403, 'This key does not have access to this information.');
    const sp = await spend(c); res.set('X-RateLimit-Limit', String(sp.limit)); res.set('X-RateLimit-Remaining', String(sp.left));
    if (!sp.ok) { res.set('Retry-After', String(toNextHour())); return fail(429, 'This key has used its calls for this hour.'); }
    if (!c.lastUsedAt || Date.now() - new Date(c.lastUsedAt).getTime() > 60000) Connector.updateOne({ _id: c._id }, { $set: { lastUsedAt: new Date(), lastUsedIp: r.ip } }).catch(() => {});
    if (r.rotatedKey) res.set('Warning', '299 - "This key has been replaced and will stop working soon."');
    req.api = { connector: c, schoolId: String(c.schoolId), scopes: c.scopes, campusIds: (c.config && c.config.campusIds) || [] }; return next();
  } catch (e) { console.error('api key:', e.message); return fail(500, 'Something went wrong. Please try again.'); }
};

const scopesFor = (kind) => Object.entries(SCOPES).filter(([, s]) => s.kinds.includes(kind)).map(([k]) => k);
module.exports = { mint, parse, authApi, spend, hourOf, scopesFor, clientIp };
