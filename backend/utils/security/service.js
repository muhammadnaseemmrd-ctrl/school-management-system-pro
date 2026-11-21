// Shared pieces of security pilots, devices and evidence (PRD E34).
const crypto = require('crypto');
const V = require('../advancement/service');
const { can } = require('../permissions');

const { S, Fail, oid, sid } = V;
const PERM = { lead: 'security.lead', dpo: 'security.dpo', operate: 'security.operate' };
const KINDS = {
  badge_attendance: { label: 'Badge scans as extra attendance evidence', consent: true, events: ['badge_scan', 'door', 'tamper'] },
  qr_attendance: { label: 'QR scans as extra attendance evidence', consent: true, events: ['qr_scan', 'door', 'tamper'] },
  entry_counter: { label: 'A count of people through a door, with no identity', consent: false, events: ['count', 'tamper'] },
  incident_camera: { label: 'A camera that only reports motion, tamper or being offline', consent: false, events: ['motion', 'tamper'] },
  access_reader: { label: 'A reader on a door for staff', consent: false, events: ['door', 'tamper'] },
};
const DEVICE_KINDS = ['camera', 'reader', 'counter', 'gateway'];
const LIMITS = { offlineMinutes: 30, incidentRetentionDays: 180, maxIncidentRetention: 730, minIncidentRetention: 30, exportExpiryDays: 7, maxReviewDays: 180, clockDriftSeconds: 300, maxBatch: 200 };
// fields a device must never send. Faces, images and templates do not enter the system, whatever the device claims to do.
const BIO = /(image|photo|picture|face|facial|embedding|template|biometric|landmark|descriptor|vector|frame|snapshot|video|clip|fingerprint|iris|voice|selfie|thumbnail|base64)/i;
const ALLOWED = ['kind', 'at', 'ref', 'badgeId', 'direction', 'confidence', 'count', 'zone', 'door', 'battery', 'note'];
const biometric = (v, depth = 0) => {
  if (depth > 4) return true;
  if (typeof v === 'string') return v.length > 300 || /^data:/i.test(v);
  if (Array.isArray(v)) return v.length > 20 || v.some((x) => biometric(x, depth + 1));
  if (v && typeof v === 'object') return Object.entries(v).some(([k, x]) => BIO.test(k) || biometric(x, depth + 1));
  return false;
};

const wide = async (user) => !(await S.CS.scopeOf(user));
const holds = async (user, perm) => { if (user.role === 'admin') return wide(user); if (user.role === 'teacher') return (await can(user, perm)).allowed; return false; };
const guard = (...which) => async (req, res, next) => {
  try { for (const w of which) if (await holds(req.user, PERM[w])) return next(); return S.bad(res, 403, 'You cannot use this.'); }
  catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};
const secretOf = () => `sk_${crypto.randomBytes(24).toString('base64url')}`;
const hashKey = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');
const sameHash = (a, b) => V.same(a, b);
const hex64 = (v) => /^[a-f0-9]{64}$/i.test(String(v || ''));
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
module.exports = { ...V, PERM, KINDS, DEVICE_KINDS, LIMITS, BIO, ALLOWED, biometric, holds, guard, secretOf, hashKey, sameHash, hex64, sha, wide };
