// Issuing, revoking and reprinting documents, print batches, family access and the public check page (PRD E12, CAP-0424..0436).
const mongoose = require('../lib/pgdoc');
const DocTemplate = require('../models/DocTemplate');
const Version = require('../models/DocTemplateVersion');
const Issuance = require('../models/DocIssuance');
const Batch = require('../models/PrintBatch');
const StoredFile = require('../models/StoredFile');
const School = require('../models/School');
const Parent = require('../models/Parent');
const VisitorVisit = require('../models/VisitorVisit');
const { audit } = require('../utils/audit');
const G = require('../utils/guardianRights');
const S = require('../utils/studio/service');
const F = require('../utils/studio/fields');
const { renderPdf } = require('../utils/studio/render');
const { paperOf } = require('../utils/studio/validate');

const oid = S.oid;
const sid = (req) => oid(req.user.schoolId);
const who = (req) => ({ id: oid(req.user.userId), name: req.actorName || '' });
const bad = (res, code, message, extra = {}) => res.status(code).json({ message, ...extra });
const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error('studio issue:', e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const baseUrl = (req) => {
  const env = String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/$/, '');
  if (/^https?:\/\//.test(env)) return env;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0]; return `${proto}://${req.headers['x-forwarded-host'] || req.get('host')}`;
};
const view = (i) => ({ _id: i._id, serial: i.serial, family: i.family, familyLabel: F.FAMILY_LABEL[i.family], kind: i.kind, title: i.title, templateId: i.templateId, versionNo: i.versionNo, subjectType: i.subjectType, subjectId: i.subjectId, subjectName: i.subjectName, studentId: i.studentId, status: i.status, issuedAt: i.issuedAt, validUntil: i.validUntil, issuedByName: i.issuedByName, revokedAt: i.revokedAt, revokedByName: i.revokedByName, revokeReason: i.revokeReason, replacedById: i.replacedById, replacesId: i.replacesId, replaceReason: i.replaceReason, printCount: i.printCount, lastPrintedAt: i.lastPrintedAt, contentHash: i.contentHash });
const pdfHeaders = (res, name, inline = true) => res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}.pdf"`, 'Cache-Control': 'private, no-store' });

// ── issue ──
// Also used by Fee management, so a fee voucher or receipt printed from the fee screens is the
// same document, with the same serial and the same trail, as one issued from the documents studio.
async function issueOne(req, { tpl, ver, subjectId, custom, term, validUntil, locale, replace, replaceReason }) {
  const schoolId = sid(req); const w = who(req); const type = F.SUBJECT[tpl.family];
  let existing = null;
  if (type !== 'custom' && F.SINGLETON.has(tpl.family)) {
    existing = await Issuance.findOne({ schoolId, family: tpl.family, subjectId: oid(subjectId), status: 'Issued' });
    if (existing && !replace) return { skipped: `Already has a current ${F.FAMILY_LABEL[tpl.family].toLowerCase()} (${existing.serial}). Replace it with a reason instead.` };
  }
  if (tpl.family === 'certificate' && type === 'student') {
    const dup = await Issuance.findOne({ schoolId, family: 'certificate', kind: tpl.kind, subjectId: oid(subjectId), status: 'Issued', 'snapshot.custom.citation': String(custom?.citation || '') });
    if (dup && !replace) return { skipped: `The same certificate was already issued (${dup.serial}).` };
  }
  const r = await S.resolveValues({ schoolId, family: tpl.family, subjectType: type, subjectId, custom, freeze: true, term });
  if (r.error) return { skipped: r.error };
  let until = validUntil ? new Date(validUntil) : null;
  if (until && Number.isNaN(until.getTime())) return { skipped: 'The valid-until date is not a date.' };
  if (type === 'visitor') { const v = await VisitorVisit.findOne({ _id: oid(subjectId), schoolId }); if (v) until = v.expectedTo; }
  if (!until && ['idCard', 'staffBadge', 'libraryCard'].includes(tpl.family)) { until = new Date(); until.setFullYear(until.getFullYear() + 1); }
  const issuedAt = new Date();
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = S.newToken(); const serial = await S.nextSerial(schoolId, tpl.family, issuedAt); const verifyUrl = `${baseUrl(req)}/verify/${token}`;
    const values = { ...r.values, 'doc.serial': serial, 'doc.issueDate': S.fmtDate(issuedAt), 'doc.validUntil': until ? S.fmtDate(until) : '', 'doc.verifyUrl': verifyUrl, 'doc.title': r.title || custom?.title || tpl.name };
    const docTheme = { ...(await require('../utils/theme/service').docTheme(schoolId)), ...(ver.theme || {}) }; // the school's published colours unless the design sets its own
    const snapshot = { values, layout: ver.layout, theme: docTheme, locale: locale === 'ur' ? 'ur' : 'en', verifyUrl, custom: custom || {}, term: term || '', templateName: tpl.name };
    try {
      const doc = await Issuance.create({ schoolId, serial, token, family: tpl.family, kind: tpl.kind || '', title: values['doc.title'], templateId: tpl._id, versionId: ver._id, versionNo: ver.version, subjectType: r.subjectType, subjectId: oid(subjectId) || undefined, subjectName: r.subjectName, studentId: r.studentId || null, holderPublic: S.maskName(r.subjectName), paper: (() => { const pp = paperOf(ver.layout); return { key: pp.key, orientation: pp.orientation, w: pp.w, h: pp.h }; })(), snapshot, contentHash: S.sha({ values, layout: ver.layout, theme: ver.theme || {}, v: ver.hash }), status: 'Issued', issuedAt, validUntil: until || undefined, issuedById: w.id, issuedByName: w.name, issuedByRole: req.user.role, replacesId: existing ? existing._id : undefined, replaceReason: existing ? replaceReason : '' });
      if (existing) await Issuance.updateOne({ _id: existing._id, status: 'Issued' }, { $set: { status: 'Superseded', replacedById: doc._id, revokedAt: issuedAt, revokedByName: w.name, revokeReason: `Replaced: ${replaceReason}` } });
      await audit(req, { action: existing ? 'studio.replace' : 'studio.issue', entityType: 'DocIssuance', entityId: doc._id, schoolId, detail: { serial, family: tpl.family, holder: r.subjectName, template: tpl.name, version: ver.version, replaced: existing ? existing.serial : undefined } });
      return { doc };
    } catch (e) { if (e.code !== 11000 || attempt === 2) throw e; }
  }
  return { skipped: 'Could not allocate a serial number.' };
}

exports._issueOne = issueOne;
exports._view = view;

exports.issue = wrap(async (req, res) => {
  const schoolId = sid(req); const b = req.body || {};
  const tpl = await DocTemplate.findOne({ _id: oid(b.templateId), schoolId }); if (!tpl) return bad(res, 404, 'Template not found.');
  if (tpl.archived) return bad(res, 422, 'This template is archived. Restore it or choose another.');
  const ver = tpl.liveVersionId ? await Version.findOne({ _id: tpl.liveVersionId, schoolId }) : null; if (!ver || ver.state !== 'Published') return bad(res, 422, 'This template has no approved version yet.');
  const type = F.SUBJECT[tpl.family]; let ids = Array.isArray(b.subjectIds) ? b.subjectIds.map(String).filter((x) => oid(x)) : [];
  ids = [...new Set(ids)];
  if (type !== 'custom' && !ids.length) return bad(res, 400, 'Choose at least one person or record.');
  if (ids.length > 200) return bad(res, 400, 'Issue at most 200 documents at a time.');
  if (b.replace && !String(b.replaceReason || '').trim()) return bad(res, 400, 'Say why the old document is being replaced.');
  if ((tpl.family === 'reportCard' || tpl.family === 'transcript') && !String(b.term || '').trim()) return bad(res, 400, 'Choose which exam the results are for.');
  const custom = b.custom && typeof b.custom === 'object' ? Object.fromEntries(Object.entries(b.custom).slice(0, 20).map(([k, v]) => [k, String(v ?? '').slice(0, 3000)])) : {};
  if (tpl.family === 'certificate' && ['completion', 'merit', 'appreciation', 'character', 'conduct'].includes(tpl.kind) && !custom.citation && tpl.kind !== 'character' && tpl.kind !== 'conduct') return bad(res, 400, 'Write what the certificate is for (the citation).');
  const issued = []; const skipped = [];
  for (const id of (type === 'custom' ? [null] : ids)) {
    const r = await issueOne(req, { tpl, ver, subjectId: id, custom, term: b.term, validUntil: b.validUntil, locale: b.locale, replace: !!b.replace, replaceReason: String(b.replaceReason || '').trim() });
    if (r.doc) issued.push({ _id: r.doc._id, serial: r.doc.serial, subjectName: r.doc.subjectName }); else skipped.push({ subjectId: id, reason: r.skipped });
  }
  res.status(issued.length ? 201 : 422).json({ issued, skipped, message: issued.length ? undefined : (skipped[0]?.reason || 'Nothing was issued.') });
});

exports.list = wrap(async (req, res) => {
  const schoolId = sid(req); const q = { schoolId }; const p = req.query;
  if (p.family && F.FAMILY_LABEL[p.family]) q.family = p.family; if (['Issued', 'Revoked', 'Superseded'].includes(p.status)) q.status = p.status;
  if (p.subjectId && oid(p.subjectId)) q.subjectId = oid(p.subjectId); if (p.studentId && oid(p.studentId)) q.studentId = oid(p.studentId);
  if (p.q) { const rx = new RegExp(String(p.q).slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); q.$or = [{ serial: rx }, { subjectName: rx }, { title: rx }]; }
  const page = Math.max(1, Number(p.page) || 1); const per = Math.min(100, Math.max(5, Number(p.per) || 30));
  const [total, rows] = await Promise.all([Issuance.countDocuments(q), Issuance.find(q).select('-snapshot').sort({ issuedAt: -1 }).skip((page - 1) * per).limit(per)]);
  res.json({ total, page, per, issuances: rows.map(view) });
});

exports.get = wrap(async (req, res) => {
  const schoolId = sid(req); const d = await Issuance.findOne({ _id: oid(req.params.id), schoolId }).select('-snapshot'); if (!d) return bad(res, 404, 'Document not found.');
  const chain = []; let cur = d; for (let i = 0; i < 8 && cur.replacesId; i++) { cur = await Issuance.findOne({ _id: cur.replacesId, schoolId }).select('-snapshot'); if (!cur) break; chain.push(view(cur)); }
  const next = d.replacedById ? await Issuance.findOne({ _id: d.replacedById, schoolId }).select('-snapshot') : null;
  res.json({ issuance: view(d), earlier: chain, replacedBy: next ? view(next) : null, verifyPath: `/verify/${d.token}` });
});

const docOf = (d, locale) => ({ layout: d.snapshot.layout, theme: d.snapshot.theme, values: d.snapshot.values, locale: locale || d.snapshot.locale || 'en', label: d.serial });
async function renderIssued(d, schoolId, locale) {
  const school = await School.findById(schoolId);
  return renderPdf({ docs: [docOf(d, locale)], mode: 'single', title: `${d.title || d.snapshot.templateName} ${d.serial}`, author: school?.name || '', subject: F.FAMILY_LABEL[d.family], createdAt: d.issuedAt, loadImage: S.makeLoader(schoolId), lang: locale });
}
exports.pdf = wrap(async (req, res) => {
  const schoolId = sid(req); const d = await Issuance.findOne({ _id: oid(req.params.id), schoolId }); if (!d) return bad(res, 404, 'Document not found.');
  const out = await renderIssued(d, schoolId, req.query.locale === 'ur' ? 'ur' : undefined);
  if (d.status !== 'Issued') { /* still viewable by staff, but the page says so */ }
  await audit(req, { action: 'studio.view', entityType: 'DocIssuance', entityId: d._id, schoolId, detail: { serial: d.serial } });
  pdfHeaders(res, d.serial, req.query.download !== '1'); res.send(out.buffer);
});

exports.snapshot = wrap(async (req, res) => {       // what the browser needs to draw the same page as an image
  const schoolId = sid(req); const d = await Issuance.findOne({ _id: oid(req.params.id), schoolId }); if (!d) return bad(res, 404, 'Document not found.');
  const images = {};
  for (const ref of Object.values(d.snapshot.values).filter((v) => typeof v === 'string' && v.startsWith('stored:'))) { const f = await StoredFile.findById(ref.slice(7)); if (f) images[ref] = `/api/files/stored/${f._id}/${f.key}`; }
  const assets = await require('../models/StudioAsset').find({ schoolId }); const am = {}; assets.forEach((a) => { am[`asset:${a._id}`] = `/api/files/stored/${a.fileId}/${a.fileKey}`; });
  res.json({ issuance: view(d), layout: d.snapshot.layout, theme: d.snapshot.theme, values: d.snapshot.values, locale: d.snapshot.locale, images: { ...images, ...am } });
});

exports.revoke = wrap(async (req, res) => {
  const schoolId = sid(req); const d = await Issuance.findOne({ _id: oid(req.params.id), schoolId }).select('-snapshot'); if (!d) return bad(res, 404, 'Document not found.');
  const reason = String(req.body?.reason || '').trim(); if (reason.length < 5) return bad(res, 400, 'Say why this document is being withdrawn (at least 5 characters).');
  const w = who(req);
  const r = await Issuance.updateOne({ _id: d._id, status: 'Issued' }, { $set: { status: 'Revoked', revokedAt: new Date(), revokedById: w.id, revokedByName: w.name, revokeReason: reason.slice(0, 300) } });
  if (!r.modifiedCount) return bad(res, 409, `This document is already ${d.status.toLowerCase()}.`);
  await audit(req, { action: 'studio.revoke', entityType: 'DocIssuance', entityId: d._id, schoolId, detail: { serial: d.serial, reason } });
  res.json({ issuance: view(await Issuance.findById(d._id).select('-snapshot')) });
});

exports.replace = wrap(async (req, res) => {
  const schoolId = sid(req); const old = await Issuance.findOne({ _id: oid(req.params.id), schoolId }); if (!old) return bad(res, 404, 'Document not found.');
  const reason = String(req.body?.reason || '').trim(); if (reason.length < 5) return bad(res, 400, 'Say why the document is being replaced (at least 5 characters).');
  if (old.status !== 'Issued') return bad(res, 409, `This document is already ${old.status.toLowerCase()}.`);
  const tpl = await DocTemplate.findOne({ _id: old.templateId, schoolId }); const ver = tpl && tpl.liveVersionId ? await Version.findOne({ _id: tpl.liveVersionId, schoolId }) : null;
  if (!tpl || tpl.archived || !ver) return bad(res, 422, 'The template is archived or has no approved version. Revoke this document and issue a new one from another template.');
  const type = F.SUBJECT[tpl.family];
  if (!F.SINGLETON.has(tpl.family)) {            // other documents: revoke, then issue again, so both stay on the record
    const r = await issueOne(req, { tpl, ver, subjectId: old.subjectId, custom: old.snapshot.custom, term: old.snapshot.term, validUntil: old.validUntil, locale: old.snapshot.locale, replace: false });
    if (!r.doc) return bad(res, 422, r.skipped);
    const w = who(req); await Issuance.updateOne({ _id: old._id, status: 'Issued' }, { $set: { status: 'Superseded', replacedById: r.doc._id, revokedAt: new Date(), revokedById: w.id, revokedByName: w.name, revokeReason: `Replaced: ${reason}` } });
    await Issuance.updateOne({ _id: r.doc._id }, { $set: { replacesId: old._id, replaceReason: reason } });
    return res.status(201).json({ issuance: view(await Issuance.findById(r.doc._id).select('-snapshot')) });
  }
  const r = await issueOne(req, { tpl, ver, subjectId: old.subjectId, custom: old.snapshot.custom, term: old.snapshot.term, validUntil: null, locale: old.snapshot.locale, replace: true, replaceReason: reason });
  if (!r.doc) return bad(res, 422, r.skipped);
  res.status(201).json({ issuance: view(await Issuance.findById(r.doc._id).select('-snapshot')) });
});

// ── family and student access ──
const FEES = new Set(['invoice', 'challan', 'receipt']); const MARKS = new Set(['reportCard', 'transcript']);
const mineFamilies = ['idCard', 'libraryCard', 'reportCard', 'transcript', 'certificate', 'challan', 'invoice', 'receipt', 'letter'];
async function allowedStudents(req) {
  const schoolId = sid(req); const u = req.user;
  if (u.role === 'student') return new Map([[String(u.userId), { viewInfo: true, viewMarks: true, viewFees: true }]]);
  const parent = await Parent.findOne({ _id: oid(u.userId), schoolId }); if (!parent) return new Map();
  const ids = (parent.children || []).map(String); const rights = await G.resolveForParent(schoolId, parent, ids); return new Map([...rights].map(([k, v]) => [k, v.rights]));   // each entry is {linked, rights, restricted}: use the rights
}
exports.mine = wrap(async (req, res) => {
  const schoolId = sid(req); const rights = await allowedStudents(req); const ids = [...rights.keys()].filter((k) => rights.get(k).viewInfo !== false);
  if (!ids.length) return res.json({ documents: [] });
  const rows = await Issuance.find({ schoolId, studentId: { $in: ids.map(oid) }, status: 'Issued', family: { $in: mineFamilies } }).select('-snapshot').sort({ issuedAt: -1 }).limit(200);
  const ok = rows.filter((d) => { const r = rights.get(String(d.studentId)) || {}; return (!FEES.has(d.family) || r.viewFees !== false) && (!MARKS.has(d.family) || r.viewMarks !== false); });
  res.json({ documents: ok.map((d) => ({ _id: d._id, serial: d.serial, title: d.title || d.snapshot?.templateName || F.FAMILY_LABEL[d.family], familyLabel: F.FAMILY_LABEL[d.family], family: d.family, studentId: d.studentId, studentName: d.subjectName, issuedAt: d.issuedAt })) });
});
exports.minePdf = wrap(async (req, res) => {
  const schoolId = sid(req); const d = await Issuance.findOne({ _id: oid(req.params.id), schoolId, status: 'Issued' });
  const rights = await allowedStudents(req); const r = d && d.studentId ? rights.get(String(d.studentId)) : null;
  if (!d || !r || r.viewInfo === false || !mineFamilies.includes(d.family) || (FEES.has(d.family) && r.viewFees === false) || (MARKS.has(d.family) && r.viewMarks === false)) return bad(res, 404, 'Document not found.');
  const out = await renderIssued(d, schoolId);
  pdfHeaders(res, d.serial, req.query.download !== '1'); res.send(out.buffer);
});

// ── print batches ──
const bView = (b) => ({ _id: b._id, name: b.name, family: b.family, mode: b.mode, sheet: b.sheet, status: b.status, round: b.round, createdByName: b.createdByName, createdAt: b.createdAt, startedAt: b.startedAt, finishedAt: b.finishedAt, log: (b.log || []).slice(-40),
  counts: { total: b.items.length, queued: b.items.filter((i) => i.status === 'Queued').length, printed: b.items.filter((i) => i.status === 'Printed').length, failed: b.items.filter((i) => i.status === 'Failed').length, cancelled: b.items.filter((i) => i.status === 'Cancelled').length },
  items: b.items.map((i) => ({ _id: i._id, issuanceId: i.issuanceId, serial: i.serial, name: i.name, status: i.status, attempts: i.attempts, errorCode: i.errorCode, error: i.error, doneAt: i.doneAt })) });
const ERR = ['paper-jam', 'out-of-ink', 'offline', 'misprint', 'other'];
const logIt = (b, req, kind, text) => { b.log = [...(b.log || []), { at: new Date(), byName: req.actorName || '', kind, text }]; };
const settle = (b) => { if (b.status !== 'Printing') return; if (b.items.some((i) => i.status === 'Queued')) return; b.status = b.items.some((i) => i.status === 'Failed') ? 'NeedsAttention' : 'Done'; b.finishedAt = new Date(); };

exports.createBatch = wrap(async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const w = who(req);
  const ids = [...new Set((Array.isArray(b.issuanceIds) ? b.issuanceIds : []).map(String).filter((x) => oid(x)))];
  if (!String(b.name || '').trim()) return bad(res, 400, 'Name the print batch.');
  if (!ids.length) return bad(res, 400, 'Choose at least one issued document.'); if (ids.length > 500) return bad(res, 400, 'A batch can hold at most 500 documents.');
  const docs = await Issuance.find({ schoolId, _id: { $in: ids.map(oid) } }).select('-snapshot');
  if (docs.length !== ids.length) return bad(res, 404, 'One of the documents was not found.');
  const notIssued = docs.filter((d) => d.status !== 'Issued'); if (notIssued.length) return bad(res, 422, `${notIssued[0].serial} is ${notIssued[0].status.toLowerCase()} and cannot be printed.`);
  const dims = new Set(docs.map((d) => `${d.paper.key}:${d.paper.orientation}`));
  if (dims.size > 1) return bad(res, 422, 'A batch can only hold documents of the same paper size and direction. Make one batch per size.');
  const paper = { w: docs[0].paper.w, h: docs[0].paper.h }; const mode = b.mode === 'single' ? 'single' : 'sheet';
  const s = b.sheet || {}; const sheet = { page: s.page === 'A3' ? 'A3' : 'A4', marginMm: Math.min(30, Math.max(0, Number(s.marginMm ?? 8))), gapMm: Math.min(20, Math.max(0, Number(s.gapMm ?? 4))), cutMarks: s.cutMarks !== false, duplex: s.duplex !== false };
  if (s.cols) sheet.cols = Math.min(12, Math.max(1, Math.floor(Number(s.cols)))); if (s.rows) sheet.rows = Math.min(12, Math.max(1, Math.floor(Number(s.rows))));
  if (mode === 'sheet') {
    const pw = sheet.page === 'A3' ? 297 : 210; const ph = sheet.page === 'A3' ? 420 : 297;
    const cols = sheet.cols || Math.floor((pw - 2 * sheet.marginMm + sheet.gapMm) / (paper.w + sheet.gapMm)); const rows = sheet.rows || Math.floor((ph - 2 * sheet.marginMm + sheet.gapMm) / (paper.h + sheet.gapMm));
    if (cols < 1 || rows < 1 || cols * paper.w + (cols - 1) * sheet.gapMm > pw - 2 * sheet.marginMm + 0.01 || rows * paper.h + (rows - 1) * sheet.gapMm > ph - 2 * sheet.marginMm + 0.01) return bad(res, 422, 'That many documents do not fit on one sheet with these margins. Use fewer columns or rows, or choose single pages.');
    sheet.perSheet = cols * rows;
  }
  const batch = await Batch.create({ schoolId, name: String(b.name).trim().slice(0, 80), family: docs[0].family, mode, sheet, items: docs.map((d) => ({ issuanceId: d._id, serial: d.serial, name: d.subjectName, status: 'Queued' })), status: 'Draft', createdById: w.id, createdByName: w.name });
  await Issuance.updateMany({ schoolId, _id: { $in: docs.map((d) => d._id) } }, { $set: { batchId: batch._id } });
  logIt(batch, req, 'created', `${docs.length} documents queued`); await batch.save();
  await audit(req, { action: 'studio.batch.create', entityType: 'PrintBatch', entityId: batch._id, schoolId, detail: { name: batch.name, count: docs.length, mode } });
  res.status(201).json({ batch: bView(batch) });
});
exports.listBatches = wrap(async (req, res) => { const q = { schoolId: sid(req) }; if (req.query.status) q.status = String(req.query.status); res.json({ batches: (await Batch.find(q).sort({ createdAt: -1 }).limit(60)).map((b) => ({ ...bView(b), items: undefined })) }); });
const loadBatch = (req) => Batch.findOne({ _id: oid(req.params.id), schoolId: sid(req) });
exports.getBatch = wrap(async (req, res) => { const b = await loadBatch(req); if (!b) return bad(res, 404, 'Print batch not found.'); res.json({ batch: bView(b) }); });

exports.batchPdf = wrap(async (req, res) => {
  const schoolId = sid(req); const b = await loadBatch(req); if (!b) return bad(res, 404, 'Print batch not found.');
  const scope = req.query.scope === 'all' ? 'all' : 'pending'; const wanted = b.items.filter((i) => (scope === 'all' ? i.status !== 'Cancelled' : ['Queued', 'Failed'].includes(i.status)));
  const rows = await Issuance.find({ schoolId, _id: { $in: wanted.map((i) => i.issuanceId) } }); const by = new Map(rows.map((d) => [String(d._id), d]));
  const docs = []; let changed = false;
  for (const it of wanted) {
    const d = by.get(String(it.issuanceId));
    if (!d || d.status !== 'Issued') { if (it.status !== 'Cancelled') { it.status = 'Cancelled'; it.error = d ? `${d.status} before printing` : 'Document missing'; changed = true; } continue; }
    docs.push(docOf(d));
  }
  if (changed) { settle(b); await b.save(); }
  if (!docs.length) return bad(res, 422, 'Nothing is left to print in this batch.');
  const out = await renderPdf({ docs, mode: b.mode, sheet: b.sheet, title: b.name, author: 'Aulensia Studio', subject: `Print batch ${b.name}`, createdAt: b.createdAt, loadImage: S.makeLoader(schoolId) });
  pdfHeaders(res, `batch-${String(b._id).slice(-6)}-r${b.round || 0}`, req.query.download !== '1'); res.send(out.buffer);
});
exports.startBatch = wrap(async (req, res) => {
  const b = await loadBatch(req); if (!b) return bad(res, 404, 'Print batch not found.');
  if (b.status !== 'Draft') return bad(res, 409, `This batch is ${b.status}.`);
  const r = await Batch.updateOne({ _id: b._id, status: 'Draft' }, { $set: { status: 'Printing', round: 1, startedAt: new Date() } });
  if (!r.modifiedCount) return bad(res, 409, 'Someone else already started this batch.');
  const fresh = await Batch.findById(b._id); logIt(fresh, req, 'start', 'Sent to the printer (round 1)'); await fresh.save();
  await audit(req, { action: 'studio.batch.start', entityType: 'PrintBatch', entityId: b._id, schoolId: sid(req), detail: { name: b.name } });
  res.json({ batch: bView(fresh) });
});
exports.batchResults = wrap(async (req, res) => {
  const schoolId = sid(req); const b = await loadBatch(req); if (!b) return bad(res, 404, 'Print batch not found.');
  if (b.status !== 'Printing') return bad(res, 409, 'Start the batch before reporting results.');
  const ok = []; const failed = [];
  const list = req.body?.allOk ? b.items.filter((i) => i.status === 'Queued').map((i) => ({ itemId: String(i._id), ok: true })) : (Array.isArray(req.body?.results) ? req.body.results : []);
  if (!list.length) return bad(res, 400, 'Report at least one result.');
  for (const r of list) {
    const it = b.items.find((i) => String(i._id) === String(r.itemId)); if (!it) return bad(res, 404, 'That item is not in this batch.');
    if (it.status !== 'Queued') return bad(res, 409, `${it.serial} was already reported (${it.status}).`);
    if (r.ok) { it.status = 'Printed'; it.doneAt = new Date(); it.error = ''; it.errorCode = ''; ok.push(it.issuanceId); }
    else { if (!ERR.includes(r.errorCode)) return bad(res, 400, `Say what went wrong: ${ERR.join(', ')}.`); it.status = 'Failed'; it.attempts += 1; it.errorCode = r.errorCode; it.error = String(r.error || '').slice(0, 200); failed.push(it.serial); }
  }
  if (ok.length) await Issuance.updateMany({ schoolId, _id: { $in: ok } }, { $inc: { printCount: 1 }, $set: { lastPrintedAt: new Date() } });
  logIt(b, req, 'results', `${ok.length} printed${failed.length ? `, ${failed.length} failed (${failed.slice(0, 5).join(', ')})` : ''}`); settle(b); await b.save();
  await audit(req, { action: 'studio.batch.results', entityType: 'PrintBatch', entityId: b._id, schoolId, detail: { printed: ok.length, failed: failed.length, status: b.status } });
  res.json({ batch: bView(b) });
});
exports.retryBatch = wrap(async (req, res) => {
  const b = await loadBatch(req); if (!b) return bad(res, 404, 'Print batch not found.');
  if (b.status !== 'NeedsAttention') return bad(res, 409, 'Only a batch with failed items can be retried.');
  const only = Array.isArray(req.body?.itemIds) ? new Set(req.body.itemIds.map(String)) : null; let n = 0;
  b.items.forEach((i) => { if (i.status === 'Failed' && (!only || only.has(String(i._id)))) { i.status = 'Queued'; n += 1; } });
  if (!n) return bad(res, 400, 'No failed items were chosen.');
  b.status = 'Printing'; b.round += 1; b.finishedAt = null; logIt(b, req, 'retry', `${n} items sent again (round ${b.round})`); await b.save();
  await audit(req, { action: 'studio.batch.retry', entityType: 'PrintBatch', entityId: b._id, schoolId: sid(req), detail: { count: n, round: b.round } });
  res.json({ batch: bView(b) });
});
exports.cancelItem = wrap(async (req, res) => {
  const b = await loadBatch(req); if (!b) return bad(res, 404, 'Print batch not found.');
  const it = b.items.find((i) => String(i._id) === String(req.params.itemId)); if (!it) return bad(res, 404, 'That item is not in this batch.');
  if (!['Queued', 'Failed'].includes(it.status)) return bad(res, 409, `${it.serial} is already ${it.status.toLowerCase()}.`);
  const reason = String(req.body?.reason || '').trim(); if (reason.length < 3) return bad(res, 400, 'Say why this item is being dropped.');
  it.status = 'Cancelled'; it.error = reason.slice(0, 200); logIt(b, req, 'cancel-item', `${it.serial} dropped: ${reason}`); settle(b); await b.save();
  await audit(req, { action: 'studio.batch.cancelItem', entityType: 'PrintBatch', entityId: b._id, schoolId: sid(req), detail: { serial: it.serial, reason } });
  res.json({ batch: bView(b) });
});
exports.cancelBatch = wrap(async (req, res) => {
  const b = await loadBatch(req); if (!b) return bad(res, 404, 'Print batch not found.');
  if (!['Draft', 'NeedsAttention'].includes(b.status)) return bad(res, 409, 'A batch that is printing or finished cannot be cancelled.');
  const reason = String(req.body?.reason || '').trim(); if (reason.length < 3) return bad(res, 400, 'Say why the batch is being cancelled.');
  b.items.forEach((i) => { if (['Queued', 'Failed'].includes(i.status)) i.status = 'Cancelled'; }); b.status = 'Cancelled'; b.finishedAt = new Date(); logIt(b, req, 'cancel', reason); await b.save();
  await audit(req, { action: 'studio.batch.cancel', entityType: 'PrintBatch', entityId: b._id, schoolId: sid(req), detail: { reason } });
  res.json({ batch: bView(b) });
});

// ── the public check page: no sign-in, says only what a person holding the document could already read from it ──
exports.verify = async (req, res) => {
  try {
    const token = String(req.params.token || '').toUpperCase();
    const miss = () => res.status(404).json({ valid: false, message: 'We could not find a document with this reference.' });
    if (!S.TOKEN_RE.test(token)) return miss();
    const d = await Issuance.findOne({ token }).select('-snapshot'); if (!d) return miss();
    const school = await School.findById(d.schoolId).select('name');
    const expired = !!(d.validUntil && new Date(d.validUntil) < new Date());
    Issuance.updateOne({ _id: d._id }, { $set: { lastCheckedAt: new Date() } }).catch(() => {});
    res.set('Cache-Control', 'no-store');
    res.json({ valid: d.status === 'Issued' && !expired, status: d.status === 'Issued' ? (expired ? 'Expired' : 'Valid') : d.status === 'Superseded' ? 'Replaced' : 'Withdrawn', document: F.FAMILY_LABEL[d.family], title: d.title, school: school?.name || '', holder: d.holderPublic, serial: d.serial, issuedOn: d.issuedAt, validUntil: d.validUntil || null, expired });
  } catch (e) { console.error('verify:', e); res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};
