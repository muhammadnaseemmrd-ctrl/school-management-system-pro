// Reaching other systems safely. The school gives us an address; we must never be talked into calling something inside our own network.
// The address is checked after it is looked up and the connection is made to the address we checked, so it cannot change in between.
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');

const allowLocal = () => process.env.INTEGRATIONS_ALLOW_LOCAL === 'true';

function privateV4(ip) {
  const [a, b, c] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0 && c === 0) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function privateIp(ip) {
  if (net.isIPv4(ip)) return privateV4(ip);
  const x = ip.toLowerCase(); if (x === '::1' || x === '::') return true;
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (mapped) return privateV4(mapped[1]);
  const hex = x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/); if (hex) { const hi = parseInt(hex[1], 16); const lo = parseInt(hex[2], 16); return privateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`); }
  if (x.startsWith('64:ff9b:')) return true;
  return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
}
const loopback = (ip) => ip === '::1' || /^127\./.test(ip);

// refuses anything that is not a plain public https address
function checkUrl(raw, { label = 'The address' } = {}) {
  let u; try { u = new URL(String(raw || '').trim()); } catch (e) { return { ok: false, why: `${label} is not a web address.` }; }
  if (u.username || u.password) return { ok: false, why: `${label} must not contain a user name or password.` };
  const local = allowLocal() && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return { ok: false, why: `${label} must start with https://.` };
  if (u.hash) return { ok: false, why: `${label} must not contain a #.` };
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && privateIp(u.hostname.replace(/^\[|\]$/g, '')) && !local) return { ok: false, why: `${label} points inside a private network, which is not allowed.` };
  if (!local && (u.hostname === 'localhost' || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal'))) return { ok: false, why: `${label} points inside a private network, which is not allowed.` };
  return { ok: true, url: u };
}

// the lookup the connection uses: every address must be public
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, list) => {
    if (err) return cb(err);
    const bad = list.find((a) => privateIp(a.address) && !(allowLocal() && loopback(a.address)));
    if (bad) return cb(Object.assign(new Error('That address points inside a private network.'), { code: 'EPRIVATE' }));
    const first = list[0]; if (options && options.all) return cb(null, list); return cb(null, first.address, first.family);
  });
}

// One request. Never follows a redirect (a redirect is a failure), never reads more than maxBytes, always stops after the time limit.
function request(raw, { method = 'GET', headers = {}, body = null, timeoutMs = 5000, maxBytes = 262144 } = {}) {
  const chk = checkUrl(raw); if (!chk.ok) return Promise.reject(Object.assign(new Error(chk.why), { code: 'EBADURL' }));
  const u = chk.url; const mod = u.protocol === 'https:' ? https : http; const started = Date.now();
  return new Promise((resolve, reject) => {
    const data = body === null || body === undefined ? null : Buffer.from(body);
    const req = mod.request({ protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined, path: `${u.pathname}${u.search}`, method, lookup: safeLookup, timeout: timeoutMs, headers: { 'user-agent': 'Aulensia-Connector/1.0', ...(data ? { 'content-length': data.length } : {}), ...headers } }, (res) => {
      const chunks = []; let size = 0; let over = false;
      res.on('data', (c) => { size += c.length; if (size > maxBytes) { over = true; res.destroy(); } else chunks.push(c); });
      res.on('close', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - started, truncated: over }));
      res.on('error', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - started, truncated: over }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('The other system did not answer in time.'), { code: 'ETIMEDOUT' })));
    req.on('error', (e) => reject(e));
    if (data) req.write(data); req.end();
  });
}
const json = async (raw, opts) => { const r = await request(raw, opts); let body = null; try { body = JSON.parse(r.text); } catch (e) { /* not json */ } return { ...r, body }; };

module.exports = { checkUrl, request, json, privateIp, allowLocal };
