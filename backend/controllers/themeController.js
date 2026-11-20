// School theme, web addresses and wording (PRD E27). The theme is a list of safe tokens (colours as hex, a few named choices): never free CSS.
const T = require('../utils/theme/service');
const ThemeVersion = require('../models/ThemeVersion'); const SchoolDomain = require('../models/SchoolDomain'); const School = require('../models/School');
const { audit } = require('../utils/audit'); const N = require('../utils/notify');
const { C, oid, sid, bad, wrap } = T;

const who = (req) => ({ name: req.actorName || '' });
const view = (v) => ({ _id: v._id, version: v.version, state: v.state, tokens: C.clean(v.tokens), report: v.report, note: v.note, basedOn: v.basedOn, rollbackOf: v.rollbackOf, createdByName: v.createdByName, publishedByName: v.publishedByName, publishedAt: v.publishedAt, archivedAt: v.archivedAt, updatedAt: v.updatedAt });
const domView = (d) => ({ _id: d._id, host: d.host, kind: d.kind, status: d.status, lastError: d.lastError, verifiedAt: d.verifiedAt, activatedAt: d.activatedAt, lastCheckedAt: d.lastCheckedAt, createdAt: d.createdAt,
  ...(d.status === 'Pending' && d.kind === 'custom' ? { dns: { txtName: `_aulensia.${d.host}`, txtValue: d.token } } : {}), ...(d.status === 'Verified' && d.kind === 'custom' ? { dns: { cname: d.host, cnameTarget: T.cnameTarget() } } : {}) });

// What every signed-in person needs to paint the app
exports.current = wrap('themeCurrent', async (req, res) => { const l = await T.live(sid(req)); res.set('Cache-Control', 'private, no-cache'); res.json(l); });

exports.overview = wrap('themeOverview', async (req, res) => {
  const s = sid(req); const rows = await ThemeVersion.find({ schoolId: s }).sort({ version: -1 }).limit(40);
  res.json({ live: rows.find((r) => r.state === 'Published') ? view(rows.find((r) => r.state === 'Published')) : null, draft: rows.find((r) => r.state === 'Draft') ? view(rows.find((r) => r.state === 'Draft')) : null, versions: rows.filter((r) => r.state !== 'Draft').map(view), defaults: C.DEFAULTS });
});
exports.check = wrap('themeCheck', async (req, res) => { const t = sanitize(req.body && req.body.tokens, res); if (t === null) return; res.json(C.check(t)); });

// reject a colour that is not a six-digit hex instead of quietly replacing it
function sanitize(t, res) {
  if (t !== undefined && (typeof t !== 'object' || t === null || Array.isArray(t))) { bad(res, 422, 'Send the theme as an object.'); return null; }
  const x = t || {};
  for (const k of ['primary', 'accent']) if (x[k] !== undefined && !C.HEX.test(String(x[k]).trim())) { bad(res, 422, `${k === 'primary' ? 'The primary' : 'The accent'} colour must look like #2A5CAC.`); return null; }
  if (x.mode !== undefined && !C.MODES.includes(x.mode)) { bad(res, 422, 'Choose light, dark or follow the device.'); return null; }
  if (x.radius !== undefined && !C.RADII.includes(x.radius)) { bad(res, 422, 'Choose square, soft or round corners.'); return null; }
  if (x.font !== undefined && !C.FONTS.includes(x.font)) { bad(res, 422, 'Choose one of the listed fonts.'); return null; }
  return x;
}
async function draftOf(s) { return ThemeVersion.findOne({ schoolId: s, state: 'Draft' }); }
const nextVersion = async (s) => { const last = await ThemeVersion.find({ schoolId: s }).sort({ version: -1 }).limit(1); return (last[0] ? last[0].version : 0) + 1; };

exports.createDraft = wrap('themeDraft', async (req, res) => {
  const s = sid(req); if (await draftOf(s)) return bad(res, 409, 'There is already a draft. Finish or discard it first.');
  let base = null; if (req.body && req.body.fromVersion) { base = await ThemeVersion.findOne({ _id: oid(req.body.fromVersion), schoolId: s }); if (!base) return bad(res, 404, 'Version not found.'); }
  const tokens = base ? C.clean(base.tokens) : (await T.live(s)).tokens; const n = await nextVersion(s);
  try { const v = await ThemeVersion.create({ schoolId: s, version: n, state: 'Draft', tokens, basedOn: base ? base.version : (await T.live(s)).version, report: C.check(tokens), createdByName: who(req).name }); res.status(201).json({ draft: view(v) }); }
  catch (e) { if (e.code === 11000) return bad(res, 409, 'Someone else just started a draft. Reload.'); throw e; }
});
exports.saveDraft = wrap('themeSave', async (req, res) => {
  const s = sid(req); const d = await draftOf(s); if (!d) return bad(res, 404, 'There is no draft. Start one first.');
  const t = sanitize(req.body && req.body.tokens, res); if (t === null) return; const tokens = C.clean({ ...C.clean(d.tokens), ...(t || {}) });
  await ThemeVersion.updateOne({ _id: d._id, schoolId: s, state: 'Draft' }, { $set: { tokens, report: C.check(tokens), note: String((req.body && req.body.note) || d.note || '').slice(0, 200) } });
  res.json({ draft: view(await ThemeVersion.findOne({ _id: d._id })) });
});
exports.discardDraft = wrap('themeDiscard', async (req, res) => { const s = sid(req); const r = await ThemeVersion.deleteMany({ schoolId: s, state: 'Draft' }); res.json({ ok: true, removed: r.deletedCount || 0 }); });

async function makeLive(req, s, doc, extra = {}) {
  const prev = await ThemeVersion.find({ schoolId: s, state: 'Published' });
  await ThemeVersion.updateMany({ schoolId: s, state: 'Published' }, { $set: { state: 'Archived', archivedAt: new Date() } });
  const w = who(req); const out = await ThemeVersion.updateOne({ _id: doc._id, schoolId: s }, { $set: { state: 'Published', publishedAt: new Date(), publishedByName: w.name, ...extra } }); T.forget(s);
  return { prev: prev[0] || null, matched: out.matchedCount };
}
exports.publish = wrap('themePublish', async (req, res) => {
  const s = sid(req); const d = await draftOf(s); if (!d) return bad(res, 404, 'There is no draft to publish.');
  const report = C.check(d.tokens); if (!report.ok) return bad(res, 422, 'This theme does not pass the checks yet.', { report });
  await makeLive(req, s, d, { report, note: String((req.body && req.body.note) || d.note || '').slice(0, 200) });
  await audit(req, { action: 'theme.publish', entityType: 'ThemeVersion', entityId: d._id, schoolId: s, detail: { version: d.version, primary: C.clean(d.tokens).primary } });
  res.json({ ok: true, live: view(await ThemeVersion.findOne({ _id: d._id })) });
});
exports.rollback = wrap('themeRollback', async (req, res) => {
  const s = sid(req); const src = await ThemeVersion.findOne({ _id: oid(req.params.id), schoolId: s }); if (!src || src.state === 'Draft') return bad(res, 404, 'Version not found.');
  if (src.state === 'Published') return bad(res, 409, 'That version is already live.'); const reason = String((req.body && req.body.reason) || '').trim(); if (reason.length < 5) return bad(res, 422, 'Say why you are going back (at least 5 characters).');
  const tokens = C.clean(src.tokens); const report = C.check(tokens); if (!report.ok) return bad(res, 422, 'That version no longer passes the checks, so it cannot go live again.', { report });
  const n = await nextVersion(s); const w = who(req);
  let doc; try { doc = await ThemeVersion.create({ schoolId: s, version: n, state: 'Draft', tokens, report, rollbackOf: src.version, basedOn: src.version, note: `Rolled back to version ${src.version}: ${reason}`.slice(0, 200), createdByName: w.name }); } catch (e) { if (e.code === 11000) return bad(res, 409, 'Try again.'); throw e; }
  await makeLive(req, s, doc); await audit(req, { action: 'theme.rollback', entityType: 'ThemeVersion', entityId: doc._id, schoolId: s, detail: { to: src.version, reason } });
  res.json({ ok: true, live: view(await ThemeVersion.findOne({ _id: doc._id })) });
});

/* ───── web addresses ───── */
exports.domains = wrap('domains', async (req, res) => { const rows = await SchoolDomain.find({ schoolId: sid(req), status: { $ne: 'Removed' } }).sort({ createdAt: 1 }); res.json({ domains: rows.map(domView), rootDomain: T.rootDomain(), cnameTarget: T.cnameTarget() }); });
exports.addDomain = wrap('addDomain', async (req, res) => {
  const s = sid(req); const p = T.parseHost(req.body && req.body.host); if (p.error) return bad(res, 422, p.error);
  if ((await SchoolDomain.countDocuments({ schoolId: s, status: { $ne: 'Removed' } })) >= 5) return bad(res, 409, 'A school can have up to five addresses.');
  if (await SchoolDomain.findOne({ host: p.host, status: { $ne: 'Removed' } })) return bad(res, 409, 'That address is already in use.');
  const sub = p.kind === 'subdomain'; const d = await SchoolDomain.create({ schoolId: s, host: p.host, kind: p.kind, status: sub ? 'Active' : 'Pending', token: sub ? '' : T.newToken(), activatedAt: sub ? new Date() : undefined, verifiedAt: sub ? new Date() : undefined, addedByName: who(req).name });
  await audit(req, { action: 'domain.add', entityType: 'SchoolDomain', entityId: d._id, schoolId: s, detail: { host: p.host, kind: p.kind } }); res.status(201).json({ domain: domView(d) });
});
async function mine(req, res) { const d = await SchoolDomain.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!d || d.status === 'Removed') { bad(res, 404, 'Address not found.'); return null; } return d; }
// at most 10 checks an hour for one address, so DNS is not hammered
async function throttle(d, res) {
  const now = Date.now(); const fresh = d.windowStart && now - new Date(d.windowStart).getTime() < 3600000;
  if (fresh && d.windowCount >= 10) { bad(res, 429, 'You have checked this address several times. Try again in an hour.'); return false; }
  await SchoolDomain.updateOne({ _id: d._id }, { $set: { windowStart: fresh ? d.windowStart : new Date(), windowCount: fresh ? d.windowCount + 1 : 1 }, $inc: { checks: 1 } }); return true;
}
exports.verifyDomain = wrap('verifyDomain', async (req, res) => {
  const d = await mine(req, res); if (!d) return; if (d.kind === 'subdomain' || ['Verified', 'Active'].includes(d.status)) return bad(res, 409, 'This address is already verified.');
  if (!(await throttle(d, res))) return; const r = await T.checkTxt(d);
  await SchoolDomain.updateOne({ _id: d._id }, { $set: r.ok ? { status: 'Verified', verifiedAt: new Date(), lastCheckedAt: new Date(), lastError: '' } : { lastCheckedAt: new Date(), lastError: r.error } });
  if (r.ok) await audit(req, { action: 'domain.verify', entityType: 'SchoolDomain', entityId: d._id, schoolId: sid(req), detail: { host: d.host } });
  res.json({ ok: r.ok, message: r.ok ? 'Ownership confirmed. Now point the address at the platform.' : r.error, domain: domView(await SchoolDomain.findOne({ _id: d._id })) });
});
exports.activateDomain = wrap('activateDomain', async (req, res) => {
  const d = await mine(req, res); if (!d) return; if (d.status === 'Active') return bad(res, 409, 'This address is already live.'); if (d.status !== 'Verified' && d.status !== 'Failed') return bad(res, 422, 'Verify the address first.');
  if (d.status === 'Failed' && !d.verifiedAt) return bad(res, 422, 'Verify the address first.'); if (!(await throttle(d, res))) return; const r = await T.checkRouting(d);
  await SchoolDomain.updateOne({ _id: d._id }, { $set: r.ok ? { status: 'Active', activatedAt: new Date(), lastCheckedAt: new Date(), lastError: '' } : { lastCheckedAt: new Date(), lastError: r.error } });
  if (r.ok) await audit(req, { action: 'domain.activate', entityType: 'SchoolDomain', entityId: d._id, schoolId: sid(req), detail: { host: d.host } });
  res.json({ ok: r.ok, message: r.ok ? 'The address is live. People can sign in there.' : r.error, domain: domView(await SchoolDomain.findOne({ _id: d._id })) });
});
exports.removeDomain = wrap('removeDomain', async (req, res) => { const d = await mine(req, res); if (!d) return; await SchoolDomain.updateOne({ _id: d._id }, { $set: { status: 'Removed' } }); await audit(req, { action: 'domain.remove', entityType: 'SchoolDomain', entityId: d._id, schoolId: sid(req), detail: { host: d.host } }); res.json({ ok: true }); });

// The sign-in page asks who owns the address it was opened on. Nothing private: name, code, logo and colours.
exports.publicBrand = wrap('publicBrand', async (req, res) => {
  const d = await T.hostSchool(req.query.host); if (!d) return res.status(404).json({ message: 'Unknown address' });
  const sc = await School.findOne({ _id: d.schoolId }).select('name code logo motto isActive'); if (!sc || sc.isActive === false) return res.status(404).json({ message: 'Unknown address' });
  res.set('Cache-Control', 'public, max-age=60'); res.json({ school: { name: sc.name, code: sc.code, logo: sc.logo || null, motto: sc.motto || '' }, theme: (await T.live(d.schoolId)).tokens, host: d.host });
});

// Daily: look again at live addresses; if the records are gone tell the administrators once
exports.sweep = async (schoolId) => {
  const rows = await SchoolDomain.find({ schoolId: oid(schoolId), status: 'Active', kind: 'custom' }); let failed = 0;
  for (const d of rows) { const t = await T.checkTxt(d); const r = await T.checkRouting(d); if (!t.ok || !r.ok) { failed += 1; await SchoolDomain.updateOne({ _id: d._id }, { $set: { status: 'Failed', lastError: !t.ok ? t.error : r.error, lastCheckedAt: new Date() } }); await N.notify({ schoolId, recipients: await N.admins(schoolId), title: 'A web address stopped working', body: `${d.host}: ${!t.ok ? t.error : r.error}`, type: 'system', link: '#/brand', key: `domain-failed:${d._id}:${new Date().toISOString().slice(0, 10)}` }); } else await SchoolDomain.updateOne({ _id: d._id }, { $set: { lastCheckedAt: new Date() } }); }
  return { checked: rows.length, failed };
};
