// Scanning, review, grading, moderation and publishing of paper exams (PRD E14: CAP-0321, CAP-0322, CAP-0323; flow 5.8).
const Form = require('../models/OmrForm');
const Key = require('../models/OmrKey');
const Batch = require('../models/OmrBatch');
const Scan = require('../models/OmrScan');
const Review = require('../models/OmrReview');
const Exam = require('../models/Exam');
const Marks = require('../models/Marks');
const { audit } = require('../utils/audit');
const N = require('../utils/notify');
const E = require('../utils/omr/engine');
const SC = require('../utils/omr/scan');
const O = require('../utils/omr/service');

const { oid, sid, who, bad, wrap, S } = O;
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const date = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const BUSY = new Set(['Scanning', 'Graded', 'Moderation']); // review and late scans are allowed here; once approved the batch must be reopened first
const ACCEPTABLE = new Set(['blur', 'dark', 'contrast', 'mostly-blank']);
const sum = (b) => ({ _id: b._id, formId: b.formId, title: b.title, status: b.status, sittingDate: b.sittingDate, keyVersion: b.keyVersion, gradedAt: b.gradedAt, gradedByName: b.gradedByName, submittedByName: b.submittedByName, approval: b.approval, publish: b.publish, notes: b.notes, history: b.history, resultsHash: b.resultsHash, createdByName: b.createdByName, createdAt: b.createdAt });

async function loadBatch(req, id) {
  const schoolId = sid(req); const batch = await Batch.findOne({ _id: oid(id), schoolId }); if (!batch) return { err: [404, 'Batch not found.'] };
  const { f, scope, err } = await O.loadForm(req, batch.formId); if (err) return { err: [404, 'Batch not found.'] }; return { batch, f, scope };
}
async function loadScan(req, id, { withFills = false } = {}) {
  const schoolId = sid(req); const scan = await Scan.findOne({ _id: oid(id), schoolId }).select(withFills ? '-image -rect' : '-image -rect -fills'); if (!scan) return { err: [404, 'Sheet not found.'] };
  const r = await loadBatch(req, scan.batchId); if (r.err) return { err: [404, 'Sheet not found.'] }; return { scan, ...r };
}
const history = (batch, w, action, detail) => { batch.history = [...(batch.history || []), { at: new Date(), byName: w.name, action, detail }]; };
const flagsOf = (scan) => (scan.flags || []).map((f) => (f.toObject ? f.toObject() : f));
const effective = (a) => (a.by === 'review' ? a.final : a.det);
function scanView(s, names, form) {
  const st = names?.get(String(s.candidate?.studentId));
  return { _id: s._id, status: s.status, capturedAt: s.capturedAt, capturedByName: s.capturedByName, source: s.source, rescanOf: s.rescanOf, flags: flagsOf(s), measure: s.measure, candidate: { read: s.candidate?.read, no: s.candidate?.no, state: s.candidate?.state, by: s.candidate?.by, studentId: s.candidate?.studentId, name: st?.name || '', admissionNumber: st?.admissionNumber || '' }, formRead: s.formRead, reviewCount: s.reviewCount, grade: s.grade,
    toReview: (s.answers || []).filter((a) => E.NEEDS_REVIEW.has(a.state) && a.by !== 'review').length, blocks: flagsOf(s).filter((f) => f.level === 'block' && !f.resolved).length, answerCount: (s.answers || []).length, letters: form ? 'ABCDE'.slice(0, form.choices) : '' };
}

// ── batches ──
exports.createBatch = wrap('batch create', async (req, res) => {
  const { f, err } = await O.loadForm(req, req.params.formId); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req); const b = req.body || {};
  if (f.status === 'Archived') return bad(res, 422, 'This sheet is archived.'); const title = str(b.title, 80) || `${f.title} sitting`; const sittingDate = b.sittingDate ? date(b.sittingDate) : new Date(); if (!sittingDate) return bad(res, 400, 'That date is not valid.');
  const batch = await Batch.create({ schoolId, formId: f._id, title, sittingDate, createdById: w.id, createdByName: w.name, history: [{ at: new Date(), byName: w.name, action: 'created', detail: '' }] });
  await audit(req, { action: 'omr.batch.create', entityType: 'OmrBatch', entityId: batch._id, schoolId, detail: { formId: f._id } }); res.status(201).json({ batch: sum(batch) });
});

exports.batches = wrap('batches', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId }; if (oid(req.query.formId)) q.formId = oid(req.query.formId); if (req.query.status) q.status = String(req.query.status);
  const rows = await Batch.find(q).sort({ createdAt: -1 }).limit(200); const forms = new Map((await Form.find({ schoolId, _id: { $in: [...new Set(rows.map((b) => String(b.formId)))].map(oid) } })).map((f) => [String(f._id), f]));
  const out = []; for (const b of rows) { const f = forms.get(String(b.formId)); if (f && O.canSeeForm(scope, f)) out.push({ ...sum(b), formTitle: f.title, formCode: f.code }); } res.json({ batches: out });
});

exports.batch = wrap('batch', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req);
  const rows = await Scan.find({ schoolId, batchId: batch._id }).select('status candidate flags answers grade'); const by = {}; for (const s of rows) by[s.status] = (by[s.status] || 0) + 1;
  const counted = rows.filter((s) => ['Ready', 'Graded'].includes(s.status)); const scanned = new Set(rows.filter((s) => !['Rescan', 'Superseded'].includes(s.status) && s.candidate?.studentId).map((s) => String(s.candidate.studentId)));
  const names = await O.namesOf(schoolId, f.candidates.map((c) => c.studentId)); const absent = f.candidates.filter((c) => !scanned.has(String(c.studentId))).map((c) => ({ no: c.no, name: names.get(String(c.studentId))?.name || '' }));
  res.json({ batch: sum(batch), form: { _id: f._id, title: f.title, code: f.code, questions: f.questions, choices: f.choices, keyVersion: f.keyVersion, status: f.status }, counts: { total: rows.length, byStatus: by, counted: counted.length, ungraded: counted.filter((s) => !s.grade || s.grade.keyVersion !== batch.keyVersion).length, needsReview: by['Needs review'] || 0, rescan: by.Rescan || 0 }, absent, keyStale: batch.status === 'Published' && batch.keyVersion < f.keyVersion });
});

exports.scans = wrap('scans', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const q = { schoolId, batchId: batch._id }; if (req.query.status) q.status = String(req.query.status);
  const rows = await Scan.find(q).select('-image -rect -fills').sort({ createdAt: -1 }).limit(Math.min(500, Number(req.query.limit) || 300)); const names = await O.namesOf(schoolId, rows.map((s) => s.candidate?.studentId));
  res.json({ scans: rows.map((s) => scanView(s, names, f)) });
});

// ── photographs ──
exports.upload = wrap('upload', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req); const b = req.body || {};
  if (!BUSY.has(batch.status)) return bad(res, 422, 'This batch is already approved. Reopen it to add or change sheets.'); if (f.status === 'Archived') return bad(res, 422, 'This sheet is archived.');
  const up = SC.decodeUpload(b.image); if (up.error) return bad(res, 415, up.error);
  const dup = await Scan.findOne({ schoolId, batchId: batch._id, imageHash: up.hash }).select('_id status'); if (dup) return bad(res, 409, 'This exact photo is already in the batch.', { scanId: dup._id });
  let old = null; if (b.rescanOf) { old = await Scan.findOne({ _id: oid(b.rescanOf), schoolId, batchId: batch._id }).select('-image -rect -fills'); if (!old) return bad(res, 404, 'The sheet you are replacing was not found.'); if (old.status === 'Superseded') return bad(res, 409, 'That sheet was already replaced.'); }
  const th = E.thresholds(f); const layout = O.layoutOf(f); const read = SC.readSheet(up.buf, layout, th);
  const base = { schoolId, batchId: batch._id, formId: f._id, imageHash: up.hash, image: up.buf, imageBytes: up.buf.length, source: b.source === 'camera' ? 'camera' : 'upload', capturedAt: date(b.capturedAt) || new Date(), capturedById: w.id, capturedByName: w.name, rescanOf: old ? old._id : undefined };
  let scan;
  if (!read.ok) {
    scan = await Scan.create({ ...base, status: 'Rescan', flags: [{ code: 'corners', level: 'block', msg: read.reason === 'decode' ? 'The photo could not be opened.' : 'The four corner marks were not all found. Retake the photo with the whole sheet in view, flat, in good light.', resolved: false }], measure: { widthPx: read.widthPx, heightPx: read.heightPx } });
  } else {
    const formNo = read.form.ok ? Number(read.form.text) : null; const formState = formNo === null ? 'unreadable' : (formNo === f.code ? 'ok' : 'wrong');
    const flags = E.qualityFlags(read.measure, read.answers, th, { formState });
    const idNo = read.id.ok ? Number(read.id.text) : null; const cand = idNo === null ? null : f.candidates.find((c) => c.no === idNo); const candidate = { read: read.id.text, no: idNo ?? undefined, studentId: cand?.studentId, state: idNo === null ? 'unclear' : (cand ? 'ok' : 'unknown'), by: 'auto' };
    if (candidate.state === 'unclear') flags.push({ code: 'candidate', level: 'block', msg: 'The candidate number is not clear on the sheet. Choose the candidate.', resolved: false }); else if (candidate.state === 'unknown') flags.push({ code: 'candidate', level: 'block', msg: `Candidate number ${read.id.text} is not on this sheet's list. Choose the candidate.`, resolved: false });
    const doc = { ...base, rect: read.rect, flags, measure: read.measure, fills: read.fills, answers: read.answers, candidate, formRead: read.form.text };
    doc.status = E.statusOf(doc); if (formState === 'wrong') doc.status = 'Needs review';
    scan = await Scan.create(doc);
  }
  if (old) { await Scan.updateOne({ _id: old._id }, { $set: { status: 'Superseded' } }); await Review.create({ schoolId, batchId: batch._id, scanId: old._id, kind: 'reject', reason: `Replaced by a new photo`, detectedMark: '', reviewerMark: String(scan._id), reviewerId: w.id, reviewerName: w.name }); }
  const dups = await O.refreshDuplicates(schoolId, batch._id); const fresh = await Scan.findOne({ _id: scan._id }).select('-image -rect -fills'); const names = await O.namesOf(schoolId, [fresh.candidate?.studentId]);
  if (batch.status !== 'Scanning') { history(batch, w, 'late sheet', `A sheet was added after grading. Grade the batch again.`); await batch.save(); }
  await audit(req, { action: 'omr.scan.upload', entityType: 'OmrScan', entityId: scan._id, schoolId, detail: { batchId: batch._id, status: fresh.status, rescan: !!old, duplicatesTouched: dups } });
  res.status(201).json({ scan: scanView(fresh, names, f) });
});

exports.scan = wrap('scan', async (req, res) => {
  const { scan, f, err } = await loadScan(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req);
  const [names, reviews] = await Promise.all([O.namesOf(schoolId, [scan.candidate?.studentId]), Review.find({ schoolId, scanId: scan._id }).sort({ createdAt: 1 })]);
  const th = E.thresholds(f); const full = await Scan.findOne({ _id: scan._id, schoolId }).select('fills'); const fills = full?.fills;
  res.json({ scan: scanView(scan, names, f), answers: (scan.answers || []).map((a, i) => ({ q: a.q, det: a.det, state: a.state, conf: a.conf, final: a.by === 'review' ? a.final : (a.state === 'ok' ? a.det : (a.state === 'blank' ? '' : null)), by: a.by, byName: a.byName, fills: fills?.q?.[i] || [] })),
    candidateFills: fills?.id || [], thresholds: th, reviews: reviews.map((r) => ({ kind: r.kind, questionNo: r.questionNo, detectedMark: r.detectedMark, reviewerMark: r.reviewerMark, reason: r.reason, by: r.reviewerName, at: r.createdAt })), hasRect: scan.status !== 'Rescan' || !!scan.measure?.edgeMm });
});

exports.image = wrap('image', async (req, res) => {
  const { scan, err } = await loadScan(req, req.params.id); if (err) return bad(res, ...err); const kind = req.query.kind === 'photo' ? 'image' : 'rect';
  const row = await Scan.findOne({ _id: scan._id, schoolId: sid(req) }).select(kind); const buf = row?.[kind]; if (!buf || !buf.length) return bad(res, 404, kind === 'rect' ? 'The straightened page is not available for this sheet.' : 'The photo is not available.');
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'Content-Length': String(buf.length) }); res.send(buf);
});

// ── review (CAP-0322) ──
exports.review = wrap('review', async (req, res) => {
  const { scan, batch, f, err } = await loadScan(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req); const b = req.body || {};
  if (!BUSY.has(batch.status)) return bad(res, 422, 'This batch is already approved. Reopen it to change a sheet.'); if (['Rescan', 'Superseded'].includes(scan.status)) return bad(res, 422, scan.status === 'Rescan' ? 'This sheet needs a new photo, not a review.' : 'This sheet was replaced by a newer photo.');
  const reason = str(b.reason, 200); const answers = Array.isArray(b.answers) ? b.answers : []; const accept = Array.isArray(b.accept) ? b.accept.map(String) : []; if (!answers.length && !accept.length && !b.candidate) return bad(res, 400, 'Nothing to review.');
  if (reason.length < 3) return bad(res, 400, 'Say why (at least 3 letters), for example "clear mark, light pencil".'); const letters = 'ABCDE'.slice(0, f.choices); const log = [];
  const list = scan.answers.map((a) => (a.toObject ? a.toObject() : a));
  for (const x of answers) { const q = Number(x.q); const m = String(x.mark ?? '').toUpperCase(); if (!Number.isInteger(q) || q < 1 || q > list.length) return bad(res, 400, `Question ${x.q} is not on this sheet.`); if (m !== '' && m !== 'X' && !(m.length === 1 && letters.includes(m))) return bad(res, 400, `Question ${q}: choose ${letters.split('').join(', ')}, blank, or X for two marks.`);
    const a = list[q - 1]; const before = effective(a); if (before === m && a.by === 'review') continue; if (a.state === 'ok' && a.by !== 'review' && m === a.det) continue; log.push({ kind: 'answer', questionNo: q, detectedMark: before || '', reviewerMark: m || '(blank)' }); a.final = m; a.by = 'review'; a.byName = w.name; }
  if (b.candidate) { const no = b.candidate.no !== undefined ? Number(b.candidate.no) : null; const c = no !== null ? f.candidates.find((k) => k.no === no) : f.candidates.find((k) => String(k.studentId) === String(b.candidate.studentId)); if (!c) return bad(res, 404, 'That candidate is not on this sheet\'s list.');
    log.push({ kind: 'candidate', questionNo: 0, detectedMark: scan.candidate?.read || '', reviewerMark: String(c.no) }); scan.candidate = { read: scan.candidate?.read, no: c.no, studentId: c.studentId, state: 'ok', by: 'review' }; scan.flags = flagsOf(scan).map((fl) => (fl.code === 'candidate' ? { ...fl, resolved: true, resolvedByName: w.name, resolvedAt: new Date() } : fl)); }
  for (const code of accept) { const fl = flagsOf(scan).find((x) => x.code === code && !x.resolved); if (!fl) continue; if (!ACCEPTABLE.has(code)) return bad(res, 422, code === 'wrong-form' ? 'This is another sheet. Reject it and use the right one.' : 'That problem cannot be accepted; fix it instead.'); log.push({ kind: 'scan', questionNo: 0, detectedMark: code, reviewerMark: 'accepted' }); scan.flags = flagsOf(scan).map((x) => (x.code === code ? { ...x, resolved: true, resolvedByName: w.name, resolvedAt: new Date() } : x)); }
  if (!log.length) return bad(res, 409, 'That changes nothing.');
  scan.answers = list; const next = { ...scan.toObject(), answers: list, flags: flagsOf(scan) }; scan.status = (scan.status === 'Graded' && E.statusOf(next) === 'Ready') ? 'Graded' : E.statusOf(next); scan.reviewCount = (scan.reviewCount || 0) + log.length;
  await scan.save(); await Review.create(log.map((l) => ({ schoolId, batchId: batch._id, scanId: scan._id, ...l, reason, reviewerId: w.id, reviewerName: w.name })));
  await O.refreshDuplicates(schoolId, batch._id);
  // After grading, a correction regrades just this sheet at once (same key, same rules) and is noted for the moderators.
  if (batch.status !== 'Scanning' && batch.keyVersion) { const key = await Key.findOne({ formId: f._id, version: batch.keyVersion }); const cur = await Scan.findOne({ _id: scan._id }).select('-image -rect -fills'); if (key && ['Ready', 'Graded'].includes(cur.status)) { const g = E.gradeAnswers(cur.answers.map((a) => E.finalOf(a) ?? ''), { answers: key.answers, weights: key.weights }, f); await Scan.updateOne({ _id: scan._id }, { $set: { grade: { ...g, keyVersion: key.version }, status: 'Graded' } }); history(batch, w, 'sheet corrected', `${log.length} change(s) on a graded sheet: ${reason}`); batch.status = 'Moderation'; batch.approval = undefined; await batch.save(); } }
  await audit(req, { action: 'omr.scan.review', entityType: 'OmrScan', entityId: scan._id, schoolId, detail: { changes: log.length, reason } });
  const fresh = await Scan.findOne({ _id: scan._id }).select('-image -rect -fills'); res.json({ scan: scanView(fresh, await O.namesOf(schoolId, [fresh.candidate?.studentId]), f), changes: log.length });
});

exports.reject = wrap('reject', async (req, res) => {
  const { scan, batch, f, err } = await loadScan(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req); const reason = str(req.body?.reason, 200);
  if (!BUSY.has(batch.status)) return bad(res, 422, 'This batch is already approved. Reopen it first.'); if (['Rescan', 'Superseded'].includes(scan.status)) return bad(res, 409, 'Already set aside.'); if (reason.length < 3) return bad(res, 400, 'Say why this sheet is being set aside.');
  await Scan.updateOne({ _id: scan._id }, { $set: { status: 'Rescan' } }); await Review.create({ schoolId, batchId: batch._id, scanId: scan._id, kind: 'reject', detectedMark: scan.status, reviewerMark: 'rescan needed', reason, reviewerId: w.id, reviewerName: w.name });
  await O.refreshDuplicates(schoolId, batch._id); if (batch.status !== 'Scanning') { history(batch, w, 'sheet set aside', reason); await batch.save(); }
  await audit(req, { action: 'omr.scan.reject', entityType: 'OmrScan', entityId: scan._id, schoolId, detail: { reason } }); const fresh = await Scan.findOne({ _id: scan._id }).select('-image -rect -fills'); res.json({ scan: scanView(fresh, await O.namesOf(schoolId, [fresh.candidate?.studentId]), f) });
});

// ── grading and moderation ──
exports.grade = wrap('grade', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req);
  if (!BUSY.has(batch.status)) return bad(res, 422, 'This batch is already approved or published.'); const key = await O.currentKey(f); if (!key) return bad(res, 422, 'Enter the answer key first.');
  const pending = await Scan.countDocuments({ schoolId, batchId: batch._id, status: 'Needs review' }); if (pending) return bad(res, 422, `${pending} sheet${pending > 1 ? 's still need' : ' still needs'} a person to look at uncertain marks before grading.`, { needsReview: pending });
  const r = await O.gradeBatch(batch, f, key); if (!r.count) return bad(res, 422, 'There are no readable sheets to grade.');
  batch.status = 'Graded'; batch.keyVersion = key.version; batch.resultsHash = r.hash; batch.gradedAt = new Date(); batch.gradedById = w.id; batch.gradedByName = w.name; batch.approval = undefined; history(batch, w, 'graded', `${r.count} sheet(s) on key ${key.version}.`); await batch.save();
  await audit(req, { action: 'omr.batch.grade', entityType: 'OmrBatch', entityId: batch._id, schoolId, detail: { sheets: r.count, keyVersion: key.version, hash: r.hash } }); res.json({ batch: sum(batch), graded: r.count, hash: r.hash });
});

exports.submit = wrap('submit', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req);
  if (batch.status !== 'Graded') return bad(res, 422, batch.status === 'Moderation' ? 'Already waiting for moderation.' : 'Grade the batch first.');
  const stale = await Scan.countDocuments({ schoolId, batchId: batch._id, status: { $in: ['Needs review', 'Ready'] } }); if (stale) return bad(res, 422, `${stale} sheet${stale > 1 ? 's were' : ' was'} added or changed since grading. Grade the batch again.`);
  batch.status = 'Moderation'; batch.submittedById = w.id; batch.submittedByName = w.name; batch.submittedAt = new Date(); history(batch, w, 'sent for moderation', ''); await batch.save();
  await N.notify({ schoolId, recipients: await N.admins(schoolId), title: `Paper exam waiting for moderation: ${f.title}`, body: `${batch.title} was graded by ${batch.gradedByName} and sent by ${w.name}.`, link: '/admin/dashboard#/omr', type: 'general', key: `omr-mod-${batch._id}-${batch.history.length}` });
  await audit(req, { action: 'omr.batch.submit', entityType: 'OmrBatch', entityId: batch._id, schoolId }); res.json({ batch: sum(batch) });
});

const stat = (xs) => { const a = [...xs].sort((x, y) => x - y); const n = a.length; if (!n) return { n: 0 }; const mean = a.reduce((s, v) => s + v, 0) / n; const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) / n); const r = (v) => Math.round(v * 10) / 10; return { n, mean: r(mean), median: r(n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2), sd: r(sd), min: r(a[0]), max: r(a[n - 1]), mean0: mean, sd0: sd }; };
exports.moderation = wrap('moderation', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req);
  const key = batch.keyVersion ? await Key.findOne({ formId: f._id, version: batch.keyVersion }) : null; if (!key) return bad(res, 422, 'Grade the batch first.');
  const scans = await Scan.find({ schoolId, batchId: batch._id, status: 'Graded' }).select('-image -rect -fills'); const names = await O.namesOf(schoolId, scans.map((s) => s.candidate?.studentId)); const pcts = scans.map((s) => s.grade.pct); const st = stat(pcts);
  const bins = Array(10).fill(0); for (const p of pcts) bins[Math.min(9, Math.floor(p / 10))]++;
  const outliers = st.sd0 ? scans.filter((s) => Math.abs(s.grade.pct - st.mean0) / st.sd0 > 2.5).map((s) => ({ scanId: s._id, name: names.get(String(s.candidate.studentId))?.name || '', pct: s.grade.pct })) : [];
  const letters = 'ABCDE'.slice(0, f.choices); const items = key.answers.map((k, i) => { const counts = Object.fromEntries([...letters.split(''), '', 'X'].map((l) => [l, 0])); let right = 0, n = 0; for (const s of scans) { const a = s.answers[i]; const v = E.finalOf(a) ?? ''; counts[v in counts ? v : 'X']++; n++; if (s.grade.marks[i] === 'R') right++; }
    const top = Object.entries(counts).filter(([l]) => l && l !== 'X').sort((a, b) => b[1] - a[1])[0]; const facility = n ? Math.round(right / n * 1000) / 10 : 0; const keyed = k.split('|'); const suspect = k !== '*' && k !== '-' && n >= 5 && ((facility < 15 && top && !keyed.includes(top[0]) && top[1] / n > 0.4) || facility < 5);
    return { q: i + 1, key: k, facility, counts, suspect, top: top ? top[0] : '' }; });
  const reviewRows = await Review.find({ schoolId, batchId: batch._id, kind: { $in: ['answer', 'candidate', 'scan', 'reject'] } }).select('kind reviewerName'); const byWho = {}; for (const r of reviewRows) byWho[r.reviewerName] = (byWho[r.reviewerName] || 0) + 1;
  res.json({ stats: { n: st.n, mean: st.mean, median: st.median, sd: st.sd, min: st.min, max: st.max, zero: scans.filter((s) => s.grade.raw === 0).length, perfect: scans.filter((s) => s.grade.raw === s.grade.max).length }, histogram: bins, outliers, items, suspectItems: items.filter((x) => x.suspect).map((x) => x.q), overrides: { total: reviewRows.length, byReviewer: byWho }, keyVersion: batch.keyVersion, max: scans[0]?.grade.max || 0 });
});

exports.note = wrap('note', async (req, res) => {
  const { batch, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const w = who(req); const note = str(req.body?.note, 400); if (note.length < 3) return bad(res, 400, 'Write the note.');
  batch.notes = [...(batch.notes || []), { at: new Date(), byId: w.id, byName: w.name, note }]; await batch.save(); res.json({ notes: batch.notes });
});

exports.approve = wrap('approve', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req);
  if (batch.status !== 'Moderation') return bad(res, 422, batch.status === 'Approved' || batch.status === 'Published' ? 'Already approved.' : 'Send the batch for moderation first.');
  const stale = await Scan.countDocuments({ schoolId, batchId: batch._id, status: { $in: ['Needs review', 'Ready'] } }); if (stale) return bad(res, 422, `${stale} sheet${stale > 1 ? 's were' : ' was'} added or changed since grading. Grade the batch again.`);
  const involved = [batch.gradedById, batch.submittedById, batch.createdById].filter(Boolean).map(String).includes(String(w.id)); const reviewers = (await Review.find({ schoolId, batchId: batch._id }).select('reviewerId')).map((r) => String(r.reviewerId)); const mine = involved || reviewers.includes(String(w.id)); let sole = false;
  if (mine) { sole = await S.soleAdmin(schoolId); if (!sole) return bad(res, 403, 'A different administrator must approve a batch that you graded, sent or corrected.'); }
  batch.status = 'Approved'; batch.approval = { byId: w.id, byName: w.name, at: new Date(), sole, note: str(req.body?.note, 200) || (sole ? 'Approved by the only administrator' : 'Approved') }; history(batch, w, 'approved', batch.approval.note); await batch.save();
  await audit(req, { action: 'omr.batch.approve', entityType: 'OmrBatch', entityId: batch._id, schoolId, detail: { sole } }); res.json({ batch: sum(batch) });
});

exports.reopen = wrap('reopen', async (req, res) => {
  const { batch, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req); const reason = str(req.body?.reason, 300);
  if (!['Graded', 'Moderation', 'Approved'].includes(batch.status)) return bad(res, 422, batch.status === 'Published' ? 'A published batch cannot be reopened. Use "Regrade published marks".' : 'Nothing to reopen.'); if (reason.length < 5) return bad(res, 400, 'Say why (at least 5 letters).');
  batch.status = 'Scanning'; batch.approval = undefined; history(batch, w, 'reopened', reason); await batch.save(); await audit(req, { action: 'omr.batch.reopen', entityType: 'OmrBatch', entityId: batch._id, schoolId, detail: { reason } }); res.json({ batch: sum(batch) });
});

// ── publishing (writes ordinary exam marks) ──
async function writeMarks(req, batch, f, exam, subjectId, only) {
  const schoolId = sid(req); const w = who(req); const scans = await Scan.find({ schoolId, batchId: batch._id, status: 'Graded' }).select('-image -rect -fills'); let written = 0; const changed = [];
  for (const s of scans) { const g = s.grade; const sid2 = s.candidate?.studentId; if (!g || !sid2) continue; if (only && !only.has(String(sid2))) continue; const marks = g.max ? Math.round(g.raw / g.max * exam.totalMarks * 100) / 100 : 0; const pct = exam.totalMarks ? Math.round(marks / exam.totalMarks * 10000) / 100 : 0;
    const row = await Marks.findOne({ schoolId, examId: exam._id, studentId: sid2, subjectId }); const rec = { marks, outOfMarks: exam.totalMarks, percentage: pct, passStatus: marks >= exam.passingMarks ? 'Pass' : 'Fail', remarks: `Paper exam ${f.title} (OMR, key ${batch.keyVersion})` };
    if (row) { if (row.marks === marks) continue; Object.assign(row, rec, { enteredBy: w.id, enteredByModel: 'User' }); await row.save(); changed.push(String(sid2)); } else { await Marks.create({ schoolId, examId: exam._id, studentId: sid2, subjectId, ...rec, enteredBy: w.id, enteredByModel: 'User' }); changed.push(String(sid2)); } written++; }
  return { written, changed, total: scans.length };
}
async function notifyMarks(schoolId, ids, f, batch, revised) { if (!ids.length) return; const rec = [...ids.map((id) => ({ id: oid(id), role: 'student' })), ...(await N.parentsOf(schoolId, ids.map(oid), 'viewMarks'))]; await N.notify({ schoolId, recipients: rec, title: revised ? `Marks revised: ${f.title}` : `Marks published: ${f.title}`, body: revised ? 'Your mark was corrected after a change to the answer key.' : 'Your paper exam mark is ready.', link: { student: '/student/dashboard', parent: '/parent/dashboard' }, type: 'marks', key: `omr-pub-${batch._id}-${revised ? batch.publish?.version : 1}` }); }
async function examFor(req, f, b) {
  const schoolId = sid(req); const examId = oid(b.examId) || f.examId; if (!examId) return { error: 'Choose the exam these marks belong to.' }; const exam = await Exam.findOne({ _id: examId, schoolId }); if (!exam) return { error: 'That exam was not found.' }; if (String(exam.classId) !== String(f.classId)) return { error: 'That exam is for a different class.' };
  const subjectId = f.subjectId || exam.subjectId || oid(b.subjectId); if (!subjectId) return { error: 'Choose the subject these marks belong to.' }; return { exam, subjectId };
}
exports.publish = wrap('publish', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req);
  if (batch.status !== 'Approved') return bad(res, 422, batch.status === 'Published' ? 'Already published.' : 'The batch must be approved by a moderator first.');
  const ex = await examFor(req, f, req.body || {}); if (ex.error) return bad(res, 400, ex.error); const r = await writeMarks(req, batch, f, ex.exam, ex.subjectId);
  batch.status = 'Published'; batch.publish = { at: new Date(), byId: w.id, byName: w.name, examId: ex.exam._id, subjectId: ex.subjectId, count: r.total, outOf: ex.exam.totalMarks, version: 1 }; history(batch, w, 'published', `${r.written} mark(s) written to ${ex.exam.name}.`); await batch.save();
  if (!f.examId) { f.examId = ex.exam._id; await f.save(); }
  await notifyMarks(schoolId, r.changed, f, batch, false); await audit(req, { action: 'omr.batch.publish', entityType: 'OmrBatch', entityId: batch._id, schoolId, detail: { examId: ex.exam._id, written: r.written } }); res.json({ batch: sum(batch), written: r.written });
});

// After publishing, a revised key does not change published marks by itself. An administrator can choose to apply it, with a reason.
exports.regradePublished = wrap('regrade published', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req); const reason = str(req.body?.reason, 300);
  if (batch.status !== 'Published') return bad(res, 422, 'Only published batches are regraded this way.'); if (reason.length < 5) return bad(res, 400, 'Say why the published marks are being changed (at least 5 letters).');
  const key = await O.currentKey(f); if (!key || key.version === batch.keyVersion) return bad(res, 409, 'The answer key has not changed since these marks were published.');
  const r = await O.gradeBatch(batch, f, key); const exam = await Exam.findOne({ _id: batch.publish.examId, schoolId }); if (!exam) return bad(res, 404, 'The exam was removed.');
  const wr = await writeMarks(req, batch, f, exam, batch.publish.subjectId); batch.keyVersion = key.version; batch.resultsHash = r.hash; batch.publish.version = (batch.publish.version || 1) + 1; history(batch, w, 'published marks regraded', `Key ${key.version}: ${r.changed.length} sheet(s) changed. ${reason}`); await batch.save();
  await notifyMarks(schoolId, wr.changed, f, batch, true); await N.notify({ schoolId, recipients: await N.admins(schoolId), title: `Published marks revised: ${f.title}`, body: `${r.changed.length} mark(s) changed after key ${key.version}. ${reason}`, link: '/admin/dashboard#/omr', type: 'general', key: `omr-regrade-${batch._id}-${batch.publish.version}` });
  await audit(req, { action: 'omr.batch.regrade', entityType: 'OmrBatch', entityId: batch._id, schoolId, detail: { keyVersion: key.version, changed: r.changed.length, reason } }); res.json({ batch: sum(batch), changed: r.changed.length });
});

exports.exportCsv = wrap('export', async (req, res) => {
  const { batch, f, err } = await loadBatch(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req);
  if (!['Approved', 'Published'].includes(batch.status)) return bad(res, 422, 'Grades can be exported after a moderator has approved the batch.');
  const scans = await Scan.find({ schoolId, batchId: batch._id, status: 'Graded' }).select('-image -rect -fills'); const names = await O.namesOf(schoolId, scans.map((s) => s.candidate?.studentId));
  const esc = (v) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) || /[",\n]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"` : s; };
  const rows = [['Candidate no', 'Admission no', 'Name', 'Marks', 'Out of', 'Percent', 'Right', 'Wrong', 'Blank', 'Key version', 'Corrected by a person']]; scans.sort((a, b) => (a.candidate?.no || 0) - (b.candidate?.no || 0));
  for (const s of scans) { const n = names.get(String(s.candidate.studentId)); rows.push([s.candidate.no, n?.admissionNumber || '', n?.name || '', s.grade.raw, s.grade.max, s.grade.pct, s.grade.right, s.grade.wrong, s.grade.blank, s.grade.keyVersion, s.reviewCount ? 'yes' : 'no']); }
  await audit(req, { action: 'omr.batch.export', entityType: 'OmrBatch', entityId: batch._id, schoolId, detail: { rows: scans.length } });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="omr-${String(f.code).padStart(4, '0')}.csv"`, 'Cache-Control': 'no-store' }); res.send('﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n'));
});
