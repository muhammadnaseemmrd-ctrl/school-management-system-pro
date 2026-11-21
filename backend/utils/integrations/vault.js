// Secrets for connectors. A key is kept as a hash (it can only be checked, never read back); other secrets are encrypted so the server can use them.
const crypto = require('crypto');

const master = () => crypto.createHash('sha256').update(`aulensia-integrations|${process.env.INTEGRATIONS_SECRET || process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev-only'}`).digest();
const b64u = (b) => Buffer.from(b).toString('base64url');

function seal(text) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', master(), iv); const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(enc)}`;
}
function open(sealed) {
  const [v, iv, tag, enc] = String(sealed || '').split('.'); if (v !== 'v1' || !enc) throw new Error('This secret cannot be read.');
  const d = crypto.createDecipheriv('aes-256-gcm', master(), Buffer.from(iv, 'base64url')); d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}
const token = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');

module.exports = { seal, open, token, sha, same, hmac, b64u };
