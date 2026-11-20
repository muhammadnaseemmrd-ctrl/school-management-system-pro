// Themes, domains and localization for a school (PRD E27).
const dns = require('dns').promises; const crypto = require('crypto');
const ThemeVersion = require('../../models/ThemeVersion'); const SchoolDomain = require('../../models/SchoolDomain');
const C = require('./color'); const E = require('../early/service');
const { oid, sid, bad, wrap, clean, pg } = E;

// ── theme ──
const cache = new Map();
async function live(schoolId) {
  const k = String(schoolId); const hit = cache.get(k); if (hit && Date.now() - hit.at < 15000) return hit.v;
  const v = await ThemeVersion.findOne({ schoolId: oid(schoolId), state: 'Published' }); const out = v ? { version: v.version, tokens: C.clean(v.tokens), publishedAt: v.publishedAt, note: v.note } : { version: 0, tokens: C.clean({}), publishedAt: null, note: '' };
  cache.set(k, { v: out, at: Date.now() }); return out;
}
const forget = (schoolId) => cache.delete(String(schoolId));
// Document colours follow the school theme unless a design sets its own
async function docTheme(schoolId) { try { const t = (await live(schoolId)).tokens; return t.primary === C.DEFAULTS.primary && t.accent === C.DEFAULTS.accent ? {} : { primary: t.primary, accent: t.accent }; } catch (e) { return {}; } }

// ── domains ──
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'mail', 'ftp', 'cname', 'status', 'support', 'help', 'static', 'cdn', 'assets', 'owner', 'agent', 'agents', 'login', 'demo', 'test', 'staging', 'billing', 'docs', 'blog']);
const rootDomain = () => String(process.env.ROOT_DOMAIN || '').trim().toLowerCase();
const cnameTarget = () => String(process.env.CNAME_TARGET || (rootDomain() ? `cname.${rootDomain()}` : '')).trim().toLowerCase();
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
function parseHost(raw) {
  let h = String(raw || '').trim().toLowerCase(); h = h.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (!h || h.length > 253 || /\s/.test(h)) return { error: 'Enter a web address such as portal.myschool.edu.pk.' };
  const labels = h.split('.'); if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return { error: 'That is not a valid web address.' };
  if (/^\d+(\.\d+){3}$/.test(h) || h.includes(':')) return { error: 'Use a name, not an IP address.' };
  const tld = labels[labels.length - 1]; if (/^\d+$/.test(tld)) return { error: 'That is not a valid web address.' };
  if (['localhost', 'local', 'internal', 'test', 'invalid', 'example'].includes(tld)) return { error: 'That address cannot be used on the internet.' };
  if (/(^|\.)vercel\.app$|(^|\.)onrender\.com$|(^|\.)herokuapp\.com$|(^|\.)netlify\.app$/.test(h)) return { error: 'Use an address you own.' };
  const root = rootDomain();
  if (root && (h === root || h === `www.${root}`)) return { error: 'That is the platform address.' };
  if (root && h.endsWith(`.${root}`)) { const sub = h.slice(0, -(root.length + 1)); if (sub.includes('.') || RESERVED.has(sub)) return { error: 'That name is not available.' }; return { host: h, kind: 'subdomain' }; }
  return { host: h, kind: 'custom' };
}
// DNS is injectable so tests run without a network
let resolver = { txt: (n) => dns.resolveTxt(n), cname: (n) => dns.resolveCname(n) };
const setResolver = (r) => { resolver = r || { txt: (n) => dns.resolveTxt(n), cname: (n) => dns.resolveCname(n) }; };
async function checkTxt(d) {
  try { const rows = (await resolver.txt(`_aulensia.${d.host}`)).map((r) => (Array.isArray(r) ? r.join('') : String(r))); return rows.includes(d.token) ? { ok: true } : { ok: false, error: 'We found the TXT record name but not the right value yet. DNS can take a while to update.' }; }
  catch (e) { return { ok: false, error: e.code === 'ENODATA' || e.code === 'ENOTFOUND' ? 'We could not find the TXT record yet. DNS can take a while to update.' : 'The address could not be checked just now. Try again in a few minutes.' }; }
}
async function checkRouting(d) {
  const want = cnameTarget(); if (!want) return { ok: false, error: 'The platform has not set its routing target yet. Ask the platform owner.' };
  try { const rows = (await resolver.cname(d.host)).map((x) => String(x).toLowerCase().replace(/\.$/, '')); return rows.includes(want) ? { ok: true } : { ok: false, error: `The address points to ${rows[0] || 'nothing'}, not ${want}.` }; }
  catch (e) { return { ok: false, error: `We could not find a CNAME for this address. Point it at ${want}.` }; }
}
const newToken = () => `aulensia-verify=${crypto.randomBytes(16).toString('hex')}`;
async function hostSchool(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, ''); if (!h) return null;
  const d = await SchoolDomain.findOne({ host: h, status: { $in: ['Active', 'Verified'] } }); if (!d) return null;
  if (d.kind === 'custom' && d.status !== 'Active') return null; return d;
}
module.exports = { C, live, forget, docTheme, parseHost, rootDomain, cnameTarget, checkTxt, checkRouting, newToken, hostSchool, setResolver, RESERVED, oid, sid, bad, wrap, clean, pg };
