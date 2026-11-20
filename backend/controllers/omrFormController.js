// Paper exam answer sheets, keys and printing (PRD E14: CAP-0320, CAP-0323).
const Form = require('../models/OmrForm');
const Key = require('../models/OmrKey');
const Batch = require('../models/OmrBatch');
const Scan = require('../models/OmrScan');
const DocCounter = require('../models/DocCounter');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const School = require('../models/School');
const { audit } = require('../utils/audit');
const N = require('../utils/notify');
const E = require('../utils/omr/engine');
const { buildLayout, MAX_Q } = require('../utils/omr/layout');
const { renderSheetPdf } = require('../utils/omr/sheet');
const O = require('../utils/omr/service');

const { oid, sid, who, bad, wrap, S } = O;
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

async function nextCode(schoolId) {
  const key = 'omr-form';
  let row = await DocCounter.findOne({ schoolId, key }); if (!row) { try { row = await DocCounter.create({ schoolId, key, n: 0 }); } catch (e) { if (e.code !== 11000) throw e; row = await DocCounter.findOne({ schoolId, key }); } }
  for (let i = 0; i < 8; i++) { const r = await DocCounter.updateOne({ _id: row._id, n: row.n }, { $set: { n: row.n + 1 } }); if (r.modifiedCount || r.matchedCount) return row.n + 1; row = await DocCounter.findOne({ _id: row._id }); }
  throw new Error('Could not take the next sheet code.');
}
const LIMITS = { mark: [0.3, 0.8], faint: [0.1, 0.45], gap: [0.1, 0.6], blurMm: [0.5, 2], minContrast: [30, 150], minPaper: [40, 200], blankPct: [30, 100], alignMm: [0.5, 3] };
function readThresholds(t) {
  if (!t || typeof t !== 'object') return { value: undefined };
  const out = {}; for (const [k, [lo, hi]] of Object.entries(LIMITS)) { if (t[k] === undefined || t[k] === '' || t[k] === null) continue; const v = Number(t[k]); if (!Number.isFinite(v) || v < lo || v > hi) return { error: `${k}: use a value from ${lo} to ${hi}.` }; out[k] = v; }
  const eff = { ...E.DEFAULTS, ...out }; if (eff.faint >= eff.mark) return { error: 'The "faint" level must be lower than the "marked" level.' }; return { value: out };
}
async function rosterOf(schoolId, classId, existing = []) {
  const taken = new Set(existing.map((c) => String(c.studentId))); let next = existing.reduce((m, c) => Math.max(m, c.no), 0);
  const students = await Student.find({ schoolId, classId, isActive: { $ne: false } }).select('name rollNumber admissionNumber'); students.sort((a, b) => (Number(a.rollNumber) || 1e9) - (Number(b.rollNumber) || 1e9) || String(a.name).localeCompare(String(b.name)));
  const add = []; for (const s of students) if (!taken.has(String(s._id))) add.push({ studentId: s._id, no: ++next }); return add;
}
const view = (f, extra = {}) => ({ _id: f._id, code: f.code, title: f.title, classId: f.classId, subjectId: f.subjectId, examId: f.examId, questions: f.questions, choices: f.choices, idDigits: f.idDigits, marksPerQuestion: f.marksPerQuestion, negative: f.negative, thresholds: { ...E.thresholds(f) }, instructions: f.instructions, status: f.status, keyVersion: f.keyVersion, candidateCount: (f.candidates || []).length, createdByName: f.createdByName, createdAt: f.createdAt, ...extra });

exports.list = wrap('forms', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId }; if (req.query.status) q.status = String(req.query.status);
  const rows = (await Form.find(q).sort({ createdAt: -1 }).limit(300)).filter((f) => O.canSeeForm(scope, f)); const ids = rows.map((f) => f._id);
  const [classes, subjects, batches] = await Promise.all([Class.find({ schoolId }).select('name section'), Subject.find({ schoolId }).select('name'), Batch.find({ schoolId, formId: { $in: ids } }).select('formId status')]);
  const cn = new Map(classes.map((c) => [String(c._id), `${c.name}${c.section ? ' ' + c.section : ''}`])); const sn = new Map(subjects.map((s) => [String(s._id), s.name]));
  const pending = ids.length ? await Scan.countDocuments({ schoolId, formId: { $in: ids }, status: 'Needs review' }) : 0;
  res.json({ forms: rows.map((f) => view(f, { className: cn.get(String(f.classId)) || '', subjectName: sn.get(String(f.subjectId)) || '', batches: batches.filter((b) => String(b.formId) === String(f._id)).length })), needsReview: pending, defaults: E.DEFAULTS, limits: LIMITS, maxQuestions: MAX_Q });
});

exports.create = wrap('form create', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const w = who(req); const scope = await S.scopeOf(req);
  const title = str(b.title, 80); if (title.length < 3) return bad(res, 400, 'Give the sheet a title of at least 3 letters.');
  const classId = oid(b.classId); if (!classId || !(await Class.findOne({ _id: classId, schoolId }))) return bad(res, 400, 'Choose the class that sits this paper.');
  const subjectId = oid(b.subjectId); if (b.subjectId && (!subjectId || !(await Subject.findOne({ _id: subjectId, schoolId })))) return bad(res, 400, 'That subject was not found.');
  if (!scope.admin && !S.covers(scope, classId, subjectId)) return bad(res, 403, 'You can only make sheets for the classes and subjects you teach.');
  const questions = num(b.questions); if (!Number.isInteger(questions) || questions < 1 || questions > MAX_Q) return bad(res, 400, `Questions must be a whole number from 1 to ${MAX_Q}.`);
  const choices = b.choices === undefined ? 4 : num(b.choices); if (!Number.isInteger(choices) || choices < 2 || choices > 5) return bad(res, 400, 'Choices per question must be 2 to 5.');
  const idDigits = b.idDigits === undefined ? 6 : num(b.idDigits); if (!Number.isInteger(idDigits) || idDigits < 3 || idDigits > 8) return bad(res, 400, 'Candidate number length must be 3 to 8 digits.');
  const marks = b.marksPerQuestion === undefined ? 1 : num(b.marksPerQuestion); if (!(marks > 0 && marks <= 100)) return bad(res, 400, 'Marks per question must be more than 0.');
  const negative = b.negative === undefined || b.negative === '' ? 0 : num(b.negative); if (!(negative >= 0 && negative <= marks)) return bad(res, 400, 'Marks taken off a wrong answer cannot be more than the marks for a right one.');
  const th = readThresholds(b.thresholds); if (th.error) return bad(res, 400, th.error);
  let examId = oid(b.examId); if (b.examId) { const ex = await Exam.findOne({ _id: examId, schoolId }); if (!ex) return bad(res, 400, 'That exam was not found.'); if (String(ex.classId) !== String(classId)) return bad(res, 400, 'That exam is for a different class.'); } else examId = undefined;
  const candidates = await rosterOf(schoolId, classId); if (candidates.length && candidates[candidates.length - 1].no >= 10 ** idDigits) return bad(res, 400, 'The candidate number is too short for this many students.');
  let f; for (let i = 0; i < 5 && !f; i++) { const code = await nextCode(schoolId); try { f = await Form.create({ schoolId, code, title, classId, subjectId: subjectId || undefined, examId, questions, choices, idDigits, marksPerQuestion: marks, negative, thresholds: th.value, instructions: str(b.instructions, 400), candidates, createdById: w.id, createdByName: w.name, createdByRole: w.role }); } catch (e) { if (e.code !== 11000) throw e; } }
  if (!f) return bad(res, 409, 'Could not take a sheet code. Try again.');
  await audit(req, { action: 'omr.form.create', entityType: 'OmrForm', entityId: f._id, schoolId, detail: { title, code: f.code, questions, choices } }); res.status(201).json({ form: view(f) });
});

exports.get = wrap('form get', async (req, res) => {
  const { f, err } = await O.loadForm(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req);
  const [keys, batches, hasScans] = await Promise.all([Key.find({ formId: f._id }).sort({ version: -1 }).select('-answers -weights').limit(30), Batch.find({ schoolId, formId: f._id }).sort({ createdAt: -1 }).limit(50), Scan.countDocuments({ schoolId, formId: f._id })]);
  const key = f.keyVersion ? await Key.findOne({ formId: f._id, version: f.keyVersion }) : null;
  const names = await O.namesOf(schoolId, f.candidates.map((c) => c.studentId));
  res.json({ form: view(f, { locked: hasScans > 0 }), key: key ? { version: key.version, answers: key.answers, weights: key.weights, reason: key.reason, byName: key.byName, at: key.createdAt } : null, keys, batches: batches.map((x) => ({ _id: x._id, title: x.title, status: x.status, sittingDate: x.sittingDate, keyVersion: x.keyVersion, createdAt: x.createdAt })),
    candidates: f.candidates.map((c) => ({ no: c.no, studentId: c.studentId, name: names.get(String(c.studentId))?.name || '', admissionNumber: names.get(String(c.studentId))?.admissionNumber || '' })) });
});

exports.update = wrap('form update', async (req, res) => {
  const { f, err } = await O.loadForm(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const b = req.body || {};
  if (f.status === 'Archived') return bad(res, 422, 'This sheet is archived.'); const locked = (await Scan.countDocuments({ schoolId, formId: f._id })) > 0;
  for (const k of ['questions', 'choices', 'idDigits']) if (b[k] !== undefined && Number(b[k]) !== f[k]) { if (locked) return bad(res, 409, 'Photos have already been taken of this sheet, so its layout cannot change. Make a new sheet instead.'); const v = Number(b[k]); const lim = { questions: [1, MAX_Q], choices: [2, 5], idDigits: [3, 8] }[k]; if (!Number.isInteger(v) || v < lim[0] || v > lim[1]) return bad(res, 400, `${k}: use a whole number from ${lim[0]} to ${lim[1]}.`); f[k] = v; if (k === 'questions' && f.keyVersion) return bad(res, 409, 'The answer key was made for the old number of questions. Make a new sheet instead.'); if (k === 'choices' && f.keyVersion) return bad(res, 409, 'The answer key was made for the old number of choices. Make a new sheet instead.'); }
  if (b.title !== undefined) { const t = str(b.title, 80); if (t.length < 3) return bad(res, 400, 'Give the sheet a title of at least 3 letters.'); f.title = t; }
  if (b.marksPerQuestion !== undefined) { const v = num(b.marksPerQuestion); if (!(v > 0 && v <= 100)) return bad(res, 400, 'Marks per question must be more than 0.'); f.marksPerQuestion = v; }
  if (b.negative !== undefined) { const v = b.negative === '' ? 0 : num(b.negative); if (!(v >= 0 && v <= f.marksPerQuestion)) return bad(res, 400, 'Marks taken off a wrong answer cannot be more than the marks for a right one.'); f.negative = v; }
  if (b.thresholds !== undefined) { const th = readThresholds(b.thresholds); if (th.error) return bad(res, 400, th.error); f.thresholds = th.value || {}; }
  if (b.instructions !== undefined) f.instructions = str(b.instructions, 400);
  if (b.examId !== undefined) { if (!b.examId) f.examId = undefined; else { const ex = await Exam.findOne({ _id: oid(b.examId), schoolId }); if (!ex) return bad(res, 400, 'That exam was not found.'); if (String(ex.classId) !== String(f.classId)) return bad(res, 400, 'That exam is for a different class.'); f.examId = ex._id; } }
  if (b.subjectId !== undefined) { if (!b.subjectId) f.subjectId = undefined; else { const sj = await Subject.findOne({ _id: oid(b.subjectId), schoolId }); if (!sj) return bad(res, 400, 'That subject was not found.'); f.subjectId = sj._id; } }
  await f.save(); await audit(req, { action: 'omr.form.update', entityType: 'OmrForm', entityId: f._id, schoolId, detail: { fields: Object.keys(b) } }); res.json({ form: view(f) });
});

exports.syncCandidates = wrap('candidates', async (req, res) => {
  const { f, err } = await O.loadForm(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); if (f.status === 'Archived') return bad(res, 422, 'This sheet is archived.');
  const add = await rosterOf(schoolId, f.classId, f.candidates); if (add.length && add[add.length - 1].no >= 10 ** f.idDigits) return bad(res, 400, 'The candidate number is too short for this many students.');
  f.candidates = [...f.candidates, ...add]; await f.save(); await audit(req, { action: 'omr.form.candidates', entityType: 'OmrForm', entityId: f._id, schoolId, detail: { added: add.length } }); res.json({ added: add.length, total: f.candidates.length });
});

exports.archive = wrap('form archive', async (req, res) => {
  const { f, err } = await O.loadForm(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req);
  if (await Batch.countDocuments({ schoolId, formId: f._id, status: { $in: ['Scanning', 'Graded', 'Moderation', 'Approved'] } })) return bad(res, 422, 'Finish or publish the open batches first.');
  f.status = 'Archived'; await f.save(); await audit(req, { action: 'omr.form.archive', entityType: 'OmrForm', entityId: f._id, schoolId }); res.json({ form: view(f) });
});

// ── printing ──
exports.sheet = wrap('sheet', async (req, res) => {
  const { f, err } = await O.loadForm(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); if (f.status === 'Archived') return bad(res, 422, 'This sheet is archived.');
  const [school, cls, subj] = await Promise.all([School.findOne({ _id: schoolId }).select('name'), Class.findOne({ _id: f.classId, schoolId }).select('name section'), f.subjectId ? Subject.findOne({ _id: f.subjectId, schoolId }).select('name') : null]);
  let people = null; const mode = String(req.query.mode || 'blank');
  if (mode === 'personal') { const names = await O.namesOf(schoolId, f.candidates.map((c) => c.studentId)); const only = req.query.no ? new Set(String(req.query.no).split(',').map(Number)) : null; people = f.candidates.filter((c) => !only || only.has(c.no)).sort((a, b) => a.no - b.no).map((c) => ({ no: c.no, name: names.get(String(c.studentId))?.name || 'Candidate', admission: names.get(String(c.studentId))?.admissionNumber || '' })); if (!people.length) return bad(res, 404, 'No candidates to print for.'); }
  const copies = Math.max(1, Math.min(200, Number(req.query.copies) || 1));
  const pdf = await renderSheetPdf({ layout: O.layoutOf(f), form: f, school: school?.name, className: cls ? `${cls.name}${cls.section ? ' ' + cls.section : ''}` : '', subjectName: subj?.name, people, copies });
  await audit(req, { action: 'omr.sheet.print', entityType: 'OmrForm', entityId: f._id, schoolId, detail: { mode, pages: people ? people.length : copies } });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="sheet-${String(f.code).padStart(4, '0')}.pdf"`, 'Cache-Control': 'no-store' }); res.send(pdf);
});
exports.layout = wrap('layout', async (req, res) => { const { f, err } = await O.loadForm(req, req.params.id); if (err) return bad(res, ...err); const l = O.layoutOf(f); res.json({ layout: { questions: l.questions, choices: l.choices, idDigits: l.idDigits, letters: l.letters }, code: f.code }); });

// ── the answer key ──
exports.setKey = wrap('key', async (req, res) => {
  const { f, err } = await O.loadForm(req, req.params.id); if (err) return bad(res, ...err); const schoolId = sid(req); const w = who(req); const b = req.body || {};
  if (f.status === 'Archived') return bad(res, 422, 'This sheet is archived.');
  const p = E.parseKey(b.answers, f.questions, f.choices); if (p.error) return bad(res, 400, p.error);
  let weights = []; if (Array.isArray(b.weights) && b.weights.length) { if (b.weights.length !== f.questions) return bad(res, 400, 'Give one mark value for each question, or none.'); weights = b.weights.map(Number); if (weights.some((x) => !Number.isFinite(x) || x < 0 || x > 100)) return bad(res, 400, 'Marks for a question must be between 0 and 100.'); }
  const prev = f.keyVersion ? await Key.findOne({ formId: f._id, version: f.keyVersion }) : null; const reason = str(b.reason, 300);
  if (prev && reason.length < 5) return bad(res, 400, 'Say why the key is changing (at least 5 letters). Everyone who marks, moderates or checks this paper will be told.');
  const changed = prev ? p.answers.map((a, i) => (a !== prev.answers[i] || (weights[i] ?? null) !== (prev.weights?.[i] ?? null) ? i + 1 : 0)).filter(Boolean) : [];
  if (prev && !changed.length) return bad(res, 409, 'That is the same key as the current one.');
  const version = f.keyVersion + 1; const cur = await Form.updateOne({ _id: f._id, keyVersion: f.keyVersion }, { $set: { keyVersion: version, status: 'Ready' } }); if (!cur.matchedCount) return bad(res, 409, 'Someone else just changed the key. Reload and try again.');
  const key = await Key.create({ schoolId, formId: f._id, version, answers: p.answers, weights, reason, hash: E.keyHash(p.answers, weights), byId: w.id, byName: w.name, changed });
  await audit(req, { action: 'omr.key.set', entityType: 'OmrForm', entityId: f._id, schoolId, detail: { version, changed, reason } });
  // A revised key regrades every batch that has not been published, in exactly the same way each time, and tells the moderators.
  const regraded = []; const fresh = await Form.findOne({ _id: f._id });
  if (prev) {
    const admins = await N.admins(schoolId);
    for (const batch of await Batch.find({ schoolId, formId: f._id, status: { $in: ['Graded', 'Moderation', 'Approved'] } })) {
      const r = await O.gradeBatch(batch, fresh, key); const was = batch.status; batch.keyVersion = version; batch.resultsHash = r.hash; batch.status = 'Moderation'; batch.approval = undefined; batch.gradedAt = new Date(); batch.gradedByName = w.name; batch.gradedById = w.id;
      batch.history = [...(batch.history || []), { at: new Date(), byName: w.name, action: 'regraded', detail: `Answer key revised to version ${version} (${reason}). ${r.changed.length} sheet(s) changed.${was === 'Approved' ? ' Approval withdrawn.' : ''}` }]; await batch.save(); regraded.push({ batchId: batch._id, title: batch.title, changed: r.changed.length, was });
      await N.notify({ schoolId, recipients: admins, title: `Answer key revised: ${f.title}`, body: `${batch.title} was regraded with key ${version}; ${r.changed.length} sheet(s) changed. Moderation is needed again. Reason: ${reason}`, link: '/admin/dashboard#/omr', type: 'general', key: `omr-key-${key._id}-${batch._id}` });
    }
    const pub = await Batch.countDocuments({ schoolId, formId: f._id, status: 'Published' }); if (pub) await N.notify({ schoolId, recipients: admins, title: `Answer key revised after publishing: ${f.title}`, body: `${pub} published batch(es) still use the older key. Open the batch and choose "Regrade published marks" if the new key should apply.`, link: '/admin/dashboard#/omr', type: 'general', key: `omr-key-pub-${key._id}` });
  }
  res.status(201).json({ version, changed, regraded, hash: key.hash });
});
exports.keyHistory = wrap('key history', async (req, res) => {
  const { f, err } = await O.loadForm(req, req.params.id); if (err) return bad(res, ...err); const keys = await Key.find({ formId: f._id }).sort({ version: -1 }).limit(50);
  res.json({ keys: keys.map((k) => ({ version: k.version, answers: k.answers, weights: k.weights, reason: k.reason, byName: k.byName, at: k.createdAt, changed: k.changed, hash: k.hash })) });
});
exports.helpers = { view, nextCode };
