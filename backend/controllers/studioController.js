// Document, ID, card and certificate studio: templates, versions, assets, proofs (PRD E12, CAP-0421..0438).
const crypto = require('crypto');
const mongoose = require('../lib/pgdoc');
const DocTemplate = require('../models/DocTemplate');
const Version = require('../models/DocTemplateVersion');
const Asset = require('../models/StudioAsset');
const Issuance = require('../models/DocIssuance');
const Batch = require('../models/PrintBatch');
const StoredFile = require('../models/StoredFile');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const VisitorVisit = require('../models/VisitorVisit');
const FeeInvoice = require('../models/FeeInvoice');
const FeePayment = require('../models/FeePayment');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const S = require('../utils/studio/service');
const { can } = require('../utils/permissions');
const F = require('../utils/studio/fields');
const Col = require('../utils/studio/color');
const { validate, paperOf } = require('../utils/studio/validate');
const { renderPdf } = require('../utils/studio/render');

const oid = S.oid;
const sid = (req) => oid(req.user.schoolId);
const who = (req) => ({ id: oid(req.user.userId), name: req.actorName || '' });
const bad = (res, code, message, extra = {}) => res.status(code).json({ message, ...extra });
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error('studio:', e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'template';
const soleAdmin = async (schoolId) => (await User.countDocuments({ schoolId, role: 'admin', isActive: { $ne: false } })) <= 1;

// ── keeping a layout to a known shape ──
const NUM = ['x', 'y', 'w', 'h', 'rotate', 'size', 'lineHeight', 'charSpace', 'strokeW', 'radius', 'opacity', 'dash', 'rowH'];
const STR = ['id', 'type', 'name', 'text', 'textUr', 'font', 'align', 'valign', 'color', 'fit', 'fill', 'stroke', 'source', 'field', 'assetId', 'alt', 'value', 'header'];
const BOOL = ['hidden', 'locked', 'bleed', 'bold', 'italic', 'upper', 'decorative', 'decorativeBehindText'];
function cleanLayout(layout) {
  if (!layout || typeof layout !== 'object') return null;
  const p = layout.paper || {}; if (!F.PAPERS[p.key]) return null;
  const sides = (Array.isArray(layout.sides) ? layout.sides : []).slice(0, 2).map((s, i) => ({
    key: i === 0 ? 'front' : 'back', background: typeof s.background === 'string' ? s.background.slice(0, 20) : 'theme.paper',
    layers: (Array.isArray(s.layers) ? s.layers : []).slice(0, 160).map((l) => {
      const o = {};
      for (const k of NUM) if (l[k] !== undefined && l[k] !== null && l[k] !== '') { const n = Number(l[k]); if (Number.isFinite(n)) o[k] = Math.round(n * 1000) / 1000; }
      for (const k of STR) if (typeof l[k] === 'string') o[k] = l[k].slice(0, 2000);
      for (const k of BOOL) if (typeof l[k] === 'boolean') o[k] = l[k];
      if (l.rtl === true || l.rtl === false) o.rtl = l.rtl;
      if (Array.isArray(l.columns)) o.columns = l.columns.slice(0, 8).map((c) => ({ title: String(c.title || '').slice(0, 40), w: Math.max(1, Number(c.w) || 1), align: ['left', 'right', 'center'].includes(c.align) ? c.align : 'left' }));
      return o;
    }),
  }));
  if (!sides.length) return null;
  return { paper: { key: p.key, orientation: p.orientation === 'landscape' ? 'landscape' : 'portrait', bleedMm: Math.min(6, Math.max(0, Number(p.bleedMm) || 0)), safeMm: Math.min(15, Math.max(0, Number(p.safeMm) || 0)) }, sides };
}
const cleanTheme = (t) => { const o = {}; for (const k of ['primary', 'accent', 'ink', 'paper', 'soft']) if (t && Col.HEX.test(t[k] || '')) o[k] = t[k].toUpperCase(); return o; };
const assetMap = async (schoolId) => new Map((await Asset.find({ schoolId })).map((a) => [String(a._id), a]));
const reportFor = async (schoolId, family, layout, theme) => { const r = validate(layout, { family, assets: await assetMap(schoolId), theme }); return { ...r, checkedAt: new Date() }; };

const tplView = (t) => ({ _id: t._id, key: t.key, name: t.name, family: t.family, familyLabel: F.FAMILY_LABEL[t.family], kind: t.kind, paper: t.paper, description: t.description, isBase: t.isBase, provenance: t.provenance, liveVersion: t.liveVersion, latestVersion: t.latestVersion, archived: t.archived, basedOnKey: t.basedOnKey, updatedAt: t.updatedAt, createdByName: t.createdByName });
const verView = (v, full) => ({ _id: v._id, templateId: v.templateId, version: v.version, state: v.state, note: v.note, locales: v.locales, theme: v.theme, report: v.report, hash: v.hash, createdByName: v.createdByName, submittedByName: v.submittedByName, submittedAt: v.submittedAt, decidedByName: v.decidedByName, decidedAt: v.decidedAt, decisionNote: v.decisionNote, publishedAt: v.publishedAt, archivedAt: v.archivedAt, updatedAt: v.updatedAt, ...(full ? { layout: v.layout } : {}) });

// ── catalog and overview ──
exports.catalog = wrap(async (req, res) => {
  const families = Object.keys(F.FAMILY_LABEL).map((k) => ({ key: k, label: F.FAMILY_LABEL[k], subject: F.SUBJECT[k], singleton: F.SINGLETON.has(k), groups: F.FAMILY_GROUPS[k], fields: Object.fromEntries(Object.entries(F.catalog(k)).map(([f, d]) => [f, { label: d.label, type: d.type || (d.multiline ? 'multiline' : 'text'), sample: d.sample ?? null, qrOnly: !!d.qrOnly, personal: !!d.personal }])) }));
  res.json({ families, papers: F.PAPERS, certificateKinds: F.CERT_KINDS, defaultTheme: Col.DEFAULT_THEME, urduSample: F.URDU_SAMPLE });
});

exports.overview = wrap(async (req, res) => {
  const schoolId = sid(req); await S.ensureBase(schoolId);
  const since = new Date(Date.now() - 30 * 86400000);
  const [templates, review, drafts, issued, revoked, batches, assets] = await Promise.all([
    DocTemplate.countDocuments({ schoolId, archived: false }), Version.countDocuments({ schoolId, state: 'Review' }), Version.countDocuments({ schoolId, state: 'Draft' }),
    Issuance.countDocuments({ schoolId, issuedAt: { $gte: since } }), Issuance.countDocuments({ schoolId, status: 'Revoked', revokedAt: { $gte: since } }),
    Batch.find({ schoolId, status: { $in: ['Printing', 'NeedsAttention'] } }).select('name status items updatedAt'), Asset.countDocuments({ schoolId, retired: false, verified: false, origin: { $ne: 'base' } }),
  ]);
  const allowed = { manage: (await can(req.user, 'documents.template.manage')).allowed, issue: (await can(req.user, 'documents.issue')).allowed, print: (await can(req.user, 'documents.print')).allowed };
  res.json({ can: allowed, templates, inReview: review, drafts, issuedLast30: issued, revokedLast30: revoked, assetsToClear: assets,
    batchesOpen: batches.map((b) => ({ _id: b._id, name: b.name, status: b.status, failed: b.items.filter((i) => i.status === 'Failed').length, queued: b.items.filter((i) => i.status === 'Queued').length, updatedAt: b.updatedAt })) });
});

// ── templates ──
exports.listTemplates = wrap(async (req, res) => {
  const schoolId = sid(req); await S.ensureBase(schoolId);
  const q = { schoolId }; if (req.query.family) q.family = String(req.query.family); if (req.query.archived !== 'true') q.archived = false;
  const list = await DocTemplate.find(q).sort({ isBase: -1, family: 1, name: 1 });
  const open = await Version.find({ schoolId, state: { $in: ['Draft', 'Review'] } }).select('templateId state version');
  const by = new Map(); open.forEach((v) => by.set(String(v.templateId), v));
  // preview=1 adds the live front side of each design so the gallery can draw thumbnails in one request
  let previews = new Map();
  if (req.query.preview === '1') { const ids = list.map((t) => t.liveVersionId).filter(Boolean); (await Version.find({ schoolId, _id: { $in: ids } })).forEach((v) => previews.set(String(v._id), v)); }
  res.json({ templates: list.map((t) => ({ ...tplView(t), open: by.get(String(t._id)) ? { state: by.get(String(t._id)).state, version: by.get(String(t._id)).version, _id: by.get(String(t._id))._id } : null, ...(previews.get(String(t.liveVersionId)) ? { preview: { paper: previews.get(String(t.liveVersionId)).layout.paper, side: previews.get(String(t.liveVersionId)).layout.sides[0], theme: previews.get(String(t.liveVersionId)).theme || {} } } : {}) })) });
});

const loadTpl = async (req, id) => { const t = await DocTemplate.findOne({ _id: oid(id), schoolId: sid(req) }); return t; };

exports.getTemplate = wrap(async (req, res) => {
  const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const versions = await Version.find({ schoolId: sid(req), templateId: t._id }).select('-layout').sort({ version: -1 });
  const used = await Issuance.countDocuments({ schoolId: sid(req), templateId: t._id });
  res.json({ template: tplView(t), versions: versions.map((v) => verView(v)), issuedCount: used });
});

exports.getVersion = wrap(async (req, res) => {
  const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const v = await Version.findOne({ _id: oid(req.params.vid), schoolId: sid(req), templateId: t._id }); if (!v) return bad(res, 404, 'Version not found.');
  const assets = await Asset.find({ schoolId: sid(req), retired: false }).select('name kind fileId fileKey verified license origin');
  res.json({ template: tplView(t), version: verView(v, true), assets: assets.map((a) => ({ _id: a._id, name: a.name, kind: a.kind, url: `/api/files/stored/${a.fileId}/${a.fileKey}`, verified: a.verified, license: a.license, origin: a.origin })) });
});

async function startTemplate(req, res, { name, family, kind, from, source }) {
  const schoolId = sid(req); const w = who(req);
  const srcVer = from && from.liveVersionId ? await Version.findOne({ _id: from.liveVersionId, schoolId }) : null;
  if (!srcVer) return bad(res, 422, 'That template has no live version to copy yet.');
  const layout = JSON.parse(JSON.stringify(srcVer.layout)); const theme = srcVer.theme || {};
  let key = `${slug(name)}-${crypto.randomBytes(2).toString('hex')}`;
  const t = await DocTemplate.create({ schoolId, key, name, family, kind: kind || '', paper: layout.paper.key, description: `Copy of ${from.name}`, isBase: false, basedOnKey: from.isBase ? from.key : from.basedOnKey, provenance: { source: source || 'school', author: req.actorName || '', license: from.isBase ? `Based on ${from.name} (${from.provenance?.license || 'Aulensia original'})` : '', importedFrom: '' }, createdByName: w.name, latestVersion: 1 });
  const v = await Version.create({ schoolId, templateId: t._id, version: 1, state: 'Draft', layout, theme, locales: srcVer.locales || ['en'], note: `Copied from ${from.name}`, createdById: w.id, createdByName: w.name, report: await reportFor(schoolId, family, layout, theme) });
  await audit(req, { action: 'studio.template.create', entityType: 'DocTemplate', entityId: t._id, schoolId, detail: { name, from: from.key } });
  return res.status(201).json({ template: tplView(t), version: verView(v) });
}
exports.createTemplate = wrap(async (req, res) => {
  const { name, family, basedOnId } = req.body || {}; const schoolId = sid(req); await S.ensureBase(schoolId);
  if (!String(name || '').trim() || String(name).length > 80) return bad(res, 400, 'Give the template a name of up to 80 characters.');
  let from = null;
  if (basedOnId) from = await DocTemplate.findOne({ _id: oid(basedOnId), schoolId });
  else if (F.FAMILY_LABEL[family]) from = (await DocTemplate.find({ schoolId, family, isBase: true }).sort({ key: 1 }))[0];
  if (!from) return bad(res, 400, 'Choose a document type or a template to start from.');
  return startTemplate(req, res, { name: String(name).trim(), family: from.family, kind: from.kind, from });
});
exports.duplicate = wrap(async (req, res) => {
  const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  if (!t.liveVersionId) return bad(res, 422, 'Only a template with a live version can be copied.');
  return startTemplate(req, res, { name: String(req.body?.name || `${t.name} copy`).trim().slice(0, 80), family: t.family, kind: t.kind, from: t });
});

exports.newDraft = wrap(async (req, res) => {
  const schoolId = sid(req); const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  if (t.isBase) return bad(res, 403, 'An Aulensia original cannot be changed. Make a copy and change that.');
  if (await Version.findOne({ schoolId, templateId: t._id, state: { $in: ['Draft', 'Review'] } })) return bad(res, 409, 'This template already has a draft or a version in review.');
  const live = await Version.findOne({ schoolId, templateId: t._id, version: t.liveVersion || t.latestVersion }); const w = who(req);
  const n = t.latestVersion + 1;
  const v = await Version.create({ schoolId, templateId: t._id, version: n, state: 'Draft', layout: JSON.parse(JSON.stringify(live.layout)), theme: live.theme || {}, locales: live.locales, note: '', createdById: w.id, createdByName: w.name, report: live.report || {} });
  t.latestVersion = n; await t.save();
  await audit(req, { action: 'studio.version.create', entityType: 'DocTemplateVersion', entityId: v._id, schoolId, detail: { template: t.name, version: n } });
  res.status(201).json({ version: verView(v) });
});

exports.saveDraft = wrap(async (req, res) => {
  const schoolId = sid(req); const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const v = await Version.findOne({ _id: oid(req.params.vid), schoolId, templateId: t._id }); if (!v) return bad(res, 404, 'Version not found.');
  if (t.isBase) return bad(res, 403, 'An Aulensia original cannot be changed. Make a copy and change that.');
  if (v.state !== 'Draft') return bad(res, 422, `This version is ${v.state.toLowerCase()} and can no longer be changed.`);
  const layout = cleanLayout(req.body?.layout); if (!layout) return bad(res, 400, 'The design is not valid: it needs a paper size and at least one side.');
  if (JSON.stringify(layout).length > 95000) return bad(res, 413, 'This design is too large. Remove some layers.');
  const theme = req.body?.theme !== undefined ? cleanTheme(req.body.theme) : (v.theme || {});
  const upd = { layout, theme, report: await reportFor(schoolId, t.family, layout, theme) };
  if (Array.isArray(req.body?.locales)) upd.locales = req.body.locales.filter((l) => ['en', 'ur'].includes(l)).slice(0, 2).length ? req.body.locales.filter((l) => ['en', 'ur'].includes(l)) : ['en'];
  if (typeof req.body?.note === 'string') upd.note = req.body.note.slice(0, 300);
  Object.assign(v, upd); v.markModified && v.markModified('layout'); await v.save();
  if (req.body?.name && !t.isBase) { t.name = String(req.body.name).trim().slice(0, 80) || t.name; await t.save(); }
  res.json({ version: verView(v, true) });
});

exports.check = wrap(async (req, res) => {          // validate a design that is not saved yet, e.g. while a colour is being tried
  const family = String(req.body?.family || ''); if (!F.FAMILY_LABEL[family]) return bad(res, 400, 'Unknown document type.');
  const layout = cleanLayout(req.body?.layout); if (!layout) return bad(res, 400, 'The design is not valid.');
  res.json({ report: await reportFor(sid(req), family, layout, cleanTheme(req.body?.theme)) });
});

exports.submit = wrap(async (req, res) => {
  const schoolId = sid(req); const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const v = await Version.findOne({ _id: oid(req.params.vid), schoolId, templateId: t._id }); if (!v) return bad(res, 404, 'Version not found.');
  if (v.state !== 'Draft') return bad(res, 422, 'Only a draft can be sent for review.');
  const report = await reportFor(schoolId, t.family, v.layout, v.theme); v.report = report;
  if (report.errors.length) { await v.save(); return bad(res, 422, `Fix ${report.errors.length} problem${report.errors.length > 1 ? 's' : ''} before sending for review.`, { report }); }
  const w = who(req); Object.assign(v, { state: 'Review', submittedById: w.id, submittedByName: w.name, submittedAt: new Date(), hash: S.sha({ layout: v.layout, theme: v.theme }) }); await v.save();
  await audit(req, { action: 'studio.version.submit', entityType: 'DocTemplateVersion', entityId: v._id, schoolId, detail: { template: t.name, version: v.version } });
  try { const admins = (await N.admins(schoolId)).filter((a) => String(a.id) !== String(w.id)); if (admins.length) await N.notify({ schoolId, recipients: admins, title: 'Template waiting for approval', body: `${t.name} version ${v.version} was sent for review by ${w.name}.`, link: '/admin/studio', type: 'documents', key: `studio-review-${v._id}` }); } catch (e) { /* best effort */ }
  res.json({ version: verView(v) });
});

exports.approve = wrap(async (req, res) => {
  const schoolId = sid(req); const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const v = await Version.findOne({ _id: oid(req.params.vid), schoolId, templateId: t._id }); if (!v) return bad(res, 404, 'Version not found.');
  if (v.state !== 'Review') return bad(res, 422, 'Only a version in review can be approved.');
  const w = who(req); const own = String(v.submittedById) === String(w.id); const sole = own ? await soleAdmin(schoolId) : false;
  if (own && !sole) return bad(res, 403, 'A different administrator must approve what you sent for review.');
  const report = await reportFor(schoolId, t.family, v.layout, v.theme); if (report.errors.length) return bad(res, 422, 'The design no longer passes its checks (a picture may have been withdrawn).', { report });
  const upd = await Version.updateOne({ _id: v._id, state: 'Review' }, { $set: { state: 'Published', publishedAt: new Date(), decidedById: w.id, decidedByName: w.name, decidedAt: new Date(), decisionNote: String(req.body?.note || '').slice(0, 300), report } });
  if (!upd.modifiedCount) return bad(res, 409, 'Someone else already decided this version.');
  if (t.liveVersionId) await Version.updateOne({ _id: t.liveVersionId, schoolId }, { $set: { state: 'Archived', archivedAt: new Date() } });
  t.liveVersionId = v._id; t.liveVersion = v.version; await t.save();
  await audit(req, { action: 'studio.version.publish', entityType: 'DocTemplateVersion', entityId: v._id, schoolId, detail: { template: t.name, version: v.version, soleAdmin: sole } });
  res.json({ version: verView(await Version.findById(v._id)), template: tplView(t) });
});

exports.reject = wrap(async (req, res) => {
  const schoolId = sid(req); const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const v = await Version.findOne({ _id: oid(req.params.vid), schoolId, templateId: t._id }); if (!v) return bad(res, 404, 'Version not found.');
  if (v.state !== 'Review') return bad(res, 422, 'Only a version in review can be sent back.');
  const note = String(req.body?.note || '').trim(); if (!note) return bad(res, 400, 'Say what needs to change.');
  const w = who(req); if (String(v.submittedById) === String(w.id) && !(await soleAdmin(schoolId))) return bad(res, 403, 'A different administrator must review this.');
  Object.assign(v, { state: 'Draft', decidedById: w.id, decidedByName: w.name, decidedAt: new Date(), decisionNote: note.slice(0, 300) }); await v.save();
  await audit(req, { action: 'studio.version.reject', entityType: 'DocTemplateVersion', entityId: v._id, schoolId, detail: { template: t.name, version: v.version, note } });
  res.json({ version: verView(v) });
});

exports.discardDraft = wrap(async (req, res) => {
  const schoolId = sid(req); const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const v = await Version.findOne({ _id: oid(req.params.vid), schoolId, templateId: t._id }); if (!v) return bad(res, 404, 'Version not found.');
  if (v.state !== 'Draft') return bad(res, 422, 'Only a draft can be discarded.');
  if (!t.liveVersionId) return bad(res, 422, 'A template with no live version cannot lose its only draft. Archive the template instead.');
  await Version.deleteOne({ _id: v._id }); t.latestVersion = t.liveVersion; await t.save();
  await audit(req, { action: 'studio.version.discard', entityType: 'DocTemplateVersion', entityId: v._id, schoolId, detail: { template: t.name, version: v.version } });
  res.json({ ok: true });
});

exports.archive = wrap(async (req, res) => {
  const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  t.archived = req.body?.archived !== false; await t.save();
  await audit(req, { action: t.archived ? 'studio.template.archive' : 'studio.template.restore', entityType: 'DocTemplate', entityId: t._id, schoolId: sid(req), detail: { name: t.name } });
  res.json({ template: tplView(t) });
});

// ── proofs and export ──
function sampleFor(family, locale) {
  const v = { ...F.sampleValues(family), 'doc.serial': 'PROOF-000000', 'doc.issueDate': S.fmtDate(new Date()), 'doc.verifyUrl': 'https://example.invalid/verify/PROOF000000000000000000' };
  if (locale === 'ur') Object.assign(v, F.URDU_SAMPLE);
  return v;
}
exports.proof = wrap(async (req, res) => {
  const schoolId = sid(req); const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const v = await Version.findOne({ _id: oid(req.params.vid), schoolId, templateId: t._id }); if (!v) return bad(res, 404, 'Version not found.');
  const locale = req.query.locale === 'ur' ? 'ur' : 'en'; let values = sampleFor(t.family, locale);
  const school = await S.resolveValues({ schoolId, family: 'letterhead', subjectType: 'custom', freeze: false });
  if (school.values) for (const k of Object.keys(school.values)) if (k.startsWith('school.') && school.values[k] && locale !== 'ur') values[k] = school.values[k];
  if (req.query.subjectId && F.SUBJECT[t.family] !== 'custom') {
    const r = await S.resolveValues({ schoolId, family: t.family, subjectType: F.SUBJECT[t.family], subjectId: req.query.subjectId, freeze: false, term: req.query.term, custom: {} });
    if (r.error) return bad(res, 422, r.error);
    values = { ...values, ...Object.fromEntries(Object.entries(r.values).filter(([, x]) => x !== '' && x !== undefined)) };
  }
  const layout = v.layout; const theme = v.theme;
  const out = await renderPdf({ docs: [{ layout, theme, values, locale }], mode: 'proof', title: `${t.name} v${v.version}`, author: 'Aulensia Studio', loadImage: S.makeLoader(schoolId), watermark: v.state === 'Published' ? 'PROOF' : v.state.toUpperCase() });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="proof-${slug(t.name)}-v${v.version}.pdf"`, 'Cache-Control': 'no-store', 'X-Studio-Notes': encodeURIComponent(out.notes.join('; ')).slice(0, 400) });
  res.send(out.buffer);
});

exports.exportPackage = wrap(async (req, res) => {
  const schoolId = sid(req); const t = await loadTpl(req, req.params.id); if (!t) return bad(res, 404, 'Template not found.');
  const v = await Version.findOne({ _id: oid(req.params.vid), schoolId, templateId: t._id }); if (!v) return bad(res, 404, 'Version not found.');
  const ids = new Set(); v.layout.sides.forEach((s) => s.layers.forEach((l) => { if (l.type === 'image' && l.source === 'asset') ids.add(String(l.assetId)); }));
  const assets = [];
  for (const id of ids) { const a = await Asset.findOne({ _id: oid(id), schoolId }); const f = a ? await StoredFile.findById(a.fileId) : null; if (a && f) assets.push({ ref: id, name: a.name, kind: a.kind, mime: a.mime, license: a.license, dataBase64: f.data.toString('base64') }); }
  const pkg = { format: 'aulensia-template@1', name: t.name, family: t.family, kind: t.kind, version: v.version, layout: v.layout, theme: v.theme || {}, locales: v.locales, provenance: { source: t.provenance?.source || 'school', author: t.provenance?.author || '', license: t.provenance?.license || '' }, assets, exportedAt: new Date().toISOString() };
  await audit(req, { action: 'studio.template.export', entityType: 'DocTemplate', entityId: t._id, schoolId, detail: { name: t.name, version: v.version } });
  res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${slug(t.name)}.aulensia-template.json"` });
  res.send(JSON.stringify(pkg, null, 1));
});

exports.importPackage = wrap(async (req, res) => {
  const schoolId = sid(req); const w = who(req);
  if (!req.file) return bad(res, 400, 'Choose a template file (.json) to import.');
  let pkg; try { pkg = JSON.parse(req.file.buffer.toString('utf8')); } catch (e) { return bad(res, 400, 'That file is not a valid template package.'); }
  if (pkg.format !== 'aulensia-template@1') return bad(res, 400, 'This package format is not supported.');
  if (!F.FAMILY_LABEL[pkg.family]) return bad(res, 400, 'The package has an unknown document type.');
  const lic = String(pkg.provenance?.license || '').trim();
  if (!lic) return bad(res, 422, 'The package does not say under what licence it may be used, so it cannot be imported.');
  const layout = cleanLayout(pkg.layout); if (!layout) return bad(res, 400, 'The design in the package is not valid.');
  const map = new Map();
  for (const a of (Array.isArray(pkg.assets) ? pkg.assets : []).slice(0, 12)) {
    const buf = Buffer.from(String(a.dataBase64 || ''), 'base64'); const png = buf[0] === 0x89 && buf[1] === 0x50; const jpg = buf[0] === 0xff && buf[1] === 0xd8;
    if (!(png || jpg) || buf.length > 1.5 * 1024 * 1024) continue;
    const f = await StoredFile.create({ schoolId, key: crypto.randomBytes(12).toString('hex'), originalName: String(a.name || 'asset').slice(0, 80), mimeType: png ? 'image/png' : 'image/jpeg', size: buf.length, data: buf });
    const kinds = ['owned', 'licensed', 'cc', 'public-domain', 'unknown']; const lk = kinds.includes(a.license?.kind) ? a.license.kind : 'unknown';
    const asset = await Asset.create({ schoolId, name: String(a.name || 'Imported picture').slice(0, 80), kind: ['logo', 'background', 'signature', 'seal', 'pattern'].includes(a.kind) ? a.kind : 'other', fileId: f._id, fileKey: f.key, mime: f.mimeType, size: buf.length, license: { kind: lk, source: String(a.license?.source || '').slice(0, 200), attribution: String(a.license?.attribution || '').slice(0, 200), reference: '' }, verified: false, origin: 'import', createdByName: w.name });
    map.set(String(a.ref), String(asset._id));
  }
  layout.sides.forEach((s) => s.layers.forEach((l) => { if (l.type === 'image' && l.source === 'asset') l.assetId = map.get(String(l.assetId)) || ''; }));
  const name = String(pkg.name || 'Imported template').trim().slice(0, 80);
  const t = await DocTemplate.create({ schoolId, key: `${slug(name)}-${crypto.randomBytes(2).toString('hex')}`, name, family: pkg.family, kind: F.CERT_KINDS.includes(pkg.kind) ? pkg.kind : '', paper: layout.paper.key, description: 'Imported template', isBase: false, provenance: { source: 'imported', author: String(pkg.provenance?.author || '').slice(0, 120), license: lic.slice(0, 300), importedFrom: String(pkg.provenance?.source || '').slice(0, 120) }, createdByName: w.name, latestVersion: 1 });
  const theme = cleanTheme(pkg.theme);
  const v = await Version.create({ schoolId, templateId: t._id, version: 1, state: 'Draft', layout, theme, locales: Array.isArray(pkg.locales) ? pkg.locales.filter((l) => ['en', 'ur'].includes(l)) : ['en'], note: 'Imported', createdById: w.id, createdByName: w.name, report: await reportFor(schoolId, pkg.family, layout, theme) });
  await audit(req, { action: 'studio.template.import', entityType: 'DocTemplate', entityId: t._id, schoolId, detail: { name, license: lic, assets: map.size } });
  res.status(201).json({ template: tplView(t), version: verView(v), assetsToClear: map.size });
});

// ── assets ──
const assetView = (a) => ({ _id: a._id, name: a.name, kind: a.kind, url: `/api/files/stored/${a.fileId}/${a.fileKey}`, mime: a.mime, size: a.size, license: a.license, verified: a.verified, verifiedByName: a.verifiedByName, verifiedAt: a.verifiedAt, origin: a.origin, retired: a.retired, createdByName: a.createdByName, createdAt: a.createdAt });
exports.listAssets = wrap(async (req, res) => { res.json({ assets: (await Asset.find({ schoolId: sid(req), retired: req.query.retired === 'true' }).sort({ createdAt: -1 })).map(assetView) }); });
exports.addAsset = wrap(async (req, res) => {
  const schoolId = sid(req); const w = who(req); const f = req.file; const b = req.body || {};
  if (!f) return bad(res, 400, 'Choose a PNG or JPEG picture.');
  const png = f.buffer[0] === 0x89 && f.buffer[1] === 0x50; const jpg = f.buffer[0] === 0xff && f.buffer[1] === 0xd8;
  if (!(png || jpg)) return bad(res, 400, 'Only PNG and JPEG pictures can be printed.');
  if (!String(b.name || '').trim()) return bad(res, 400, 'Give the picture a name.');
  const kinds = ['owned', 'licensed', 'cc', 'public-domain', 'unknown']; const lk = kinds.includes(b.licenseKind) ? b.licenseKind : 'unknown';
  if (lk !== 'unknown' && lk !== 'owned' && !String(b.licenseSource || '').trim()) return bad(res, 400, 'Say where the picture came from.');
  const file = await StoredFile.create({ schoolId, uploadedBy: w.id, key: crypto.randomBytes(12).toString('hex'), originalName: f.originalname, mimeType: png ? 'image/png' : 'image/jpeg', size: f.size, data: f.buffer });
  const a = await Asset.create({ schoolId, name: String(b.name).trim().slice(0, 80), kind: ['logo', 'background', 'signature', 'seal', 'pattern'].includes(b.kind) ? b.kind : 'other', fileId: file._id, fileKey: file.key, mime: file.mimeType, size: f.size, license: { kind: lk, source: String(b.licenseSource || '').slice(0, 200), attribution: String(b.attribution || '').slice(0, 200), reference: String(b.reference || '').slice(0, 200) }, verified: false, origin: 'upload', createdByName: w.name });
  await audit(req, { action: 'studio.asset.add', entityType: 'StudioAsset', entityId: a._id, schoolId, detail: { name: a.name, license: lk } });
  res.status(201).json({ asset: assetView(a) });
});
exports.verifyAsset = wrap(async (req, res) => {
  const schoolId = sid(req); const a = await Asset.findOne({ _id: oid(req.params.id), schoolId }); if (!a) return bad(res, 404, 'Picture not found.');
  if (a.license.kind === 'unknown') return bad(res, 422, 'Record how the picture may be used before clearing it.');
  const w = who(req); if (String(a.createdByName) === w.name && a.origin === 'upload' && !(await soleAdmin(schoolId)) && a.license.kind !== 'owned') return bad(res, 403, 'A different administrator must clear a picture that is not owned by the school.');
  a.verified = true; a.verifiedByName = w.name; a.verifiedAt = new Date(); await a.save();
  await audit(req, { action: 'studio.asset.verify', entityType: 'StudioAsset', entityId: a._id, schoolId, detail: { name: a.name, license: a.license.kind } });
  res.json({ asset: assetView(a) });
});
exports.updateAssetLicense = wrap(async (req, res) => {
  const schoolId = sid(req); const a = await Asset.findOne({ _id: oid(req.params.id), schoolId }); if (!a) return bad(res, 404, 'Picture not found.');
  const b = req.body || {}; const kinds = ['owned', 'licensed', 'cc', 'public-domain', 'unknown']; if (!kinds.includes(b.licenseKind)) return bad(res, 400, 'Choose how the picture may be used.');
  a.license = { kind: b.licenseKind, source: String(b.licenseSource || '').slice(0, 200), attribution: String(b.attribution || '').slice(0, 200), reference: String(b.reference || '').slice(0, 200) }; a.verified = false; a.verifiedByName = ''; a.verifiedAt = null; await a.save();
  await audit(req, { action: 'studio.asset.license', entityType: 'StudioAsset', entityId: a._id, schoolId, detail: { license: b.licenseKind } });
  res.json({ asset: assetView(a) });
});
exports.retireAsset = wrap(async (req, res) => {
  const schoolId = sid(req); const a = await Asset.findOne({ _id: oid(req.params.id), schoolId }); if (!a) return bad(res, 404, 'Picture not found.');
  a.retired = true; await a.save(); await audit(req, { action: 'studio.asset.retire', entityType: 'StudioAsset', entityId: a._id, schoolId, detail: { name: a.name } });
  res.json({ asset: assetView(a) });
});

// ── who a document can be made for ──
exports.subjects = wrap(async (req, res) => {
  const schoolId = sid(req); const family = String(req.query.family || ''); const type = F.SUBJECT[family]; const q = String(req.query.q || '').trim().slice(0, 40);
  if (!type) return bad(res, 400, 'Unknown document type.');
  const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null; let out = [];
  if (type === 'student') {
    const f = { schoolId, isActive: { $ne: false } }; if (req.query.classId && oid(req.query.classId)) f.classId = oid(req.query.classId);
    if (rx) f.$or = [{ name: rx }, { fullName: rx }, { admissionNumber: rx }, { rollNumber: rx }];
    const list = await Student.find(f).sort({ name: 1 }).limit(200).select('name fullName admissionNumber rollNumber classId');
    const cls = new Map((await Class.find({ schoolId })).map((c) => [String(c._id), `${c.standard}-${c.division}`]));
    out = list.map((s) => ({ id: s._id, label: s.fullName || s.name, sub: `${cls.get(String(s.classId)) || ''}${s.admissionNumber ? ' · ' + s.admissionNumber : ''}` }));
  } else if (type === 'teacher') {
    const f = { schoolId, isActive: { $ne: false } }; if (rx) f.$or = [{ name: rx }, { employeeId: rx }];
    out = (await Teacher.find(f).sort({ name: 1 }).limit(200).select('name employeeId designation')).map((t) => ({ id: t._id, label: t.name, sub: `${t.designation || 'Teacher'}${t.employeeId ? ' · ' + t.employeeId : ''}` }));
  } else if (type === 'visitor') {
    const f = { schoolId, status: { $in: ['Approved', 'CheckedIn'] } }; if (rx) f.visitorName = rx;
    out = (await VisitorVisit.find(f).sort({ expectedFrom: -1 }).limit(100)).map((v) => ({ id: v._id, label: v.visitorName, sub: `${v.purpose} · ${v.status}` }));
  } else if (type === 'invoice') {
    const f = { schoolId }; if (rx) f.$or = [{ number: rx }, { challanCode: rx }];
    const list = await FeeInvoice.find(f).sort({ issueDate: -1 }).limit(100); const st = new Map((await Student.find({ schoolId, _id: { $in: list.map((i) => i.studentId) } }).select('name')).map((s) => [String(s._id), s.name]));
    out = list.map((i) => ({ id: i._id, label: `${i.number} · ${st.get(String(i.studentId)) || ''}`, sub: `${i.period || ''} · ${i.status}` }));
  } else if (type === 'payment') {
    const f = { schoolId, status: 'Confirmed' }; if (rx) f.receiptNo = rx;
    const list = await FeePayment.find(f).sort({ receivedAt: -1 }).limit(100); const st = new Map((await Student.find({ schoolId, _id: { $in: list.map((i) => i.studentId) } }).select('name')).map((s) => [String(s._id), s.name]));
    out = list.map((p) => ({ id: p._id, label: `${p.receiptNo || 'Payment'} · ${st.get(String(p.studentId)) || ''}`, sub: `Rs ${p.amount.toLocaleString('en-PK')}` }));
  }
  const terms = (family === 'reportCard' || family === 'transcript') ? [...new Set((await Exam.find({ schoolId }).select('name')).map((e) => e.name))].sort() : [];
  res.json({ type, subjects: out, terms });
});
