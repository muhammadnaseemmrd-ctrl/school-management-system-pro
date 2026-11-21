// Question bank and rubrics (PRD E13, CAP-0308..0311, 0317, 0327).
const crypto = require('crypto');
const Item = require('../models/QuestionItem');
const Rubric = require('../models/Rubric');
const Subject = require('../models/Subject');
const { audit } = require('../utils/audit');
const Notation = require('../utils/assess/notation');
const S = require('../utils/assess/service');

const { oid, sid, who, bad, wrap } = S;
const KINDS = ['mcq', 'multi', 'tf', 'short', 'essay', 'match', 'order', 'numeric'];
const KIND_LABEL = { mcq: 'Multiple choice', multi: 'Several correct answers', tf: 'True or false', short: 'Short answer', essay: 'Essay or open answer', match: 'Matching', order: 'Put in order', numeric: 'Number' };
const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create']; const LICENSES = ['original', 'adapted', 'licensed', 'open'];
const nid = () => crypto.randomBytes(4).toString('hex'); const str = (v, n) => String(v ?? '').trim().slice(0, n);

// Check and clean what the author typed. Returns {item} or {error}.
function clean(b, school) {
  const kind = KINDS.includes(b.kind) ? b.kind : null; if (!kind) return { error: 'Choose a question type.' };
  const stem = str(b.stem, 4000); if (!stem) return { error: 'Write the question.' };
  const o = { kind, stem, stemUr: str(b.stemUr, 4000), language: ['en', 'ur', 'both'].includes(b.language) ? b.language : (b.stemUr ? 'both' : 'en'), marks: Number(b.marks), explanation: str(b.explanation, 2000), topic: str(b.topic, 80), standard: str(b.standard, 20), competency: str(b.competency, 120), tags: (Array.isArray(b.tags) ? b.tags : []).map((t) => str(t, 30)).filter(Boolean).slice(0, 10), difficulty: ['Easy', 'Medium', 'Hard'].includes(b.difficulty) ? b.difficulty : 'Medium', bloom: BLOOM.includes(b.bloom) ? b.bloom : '', partialCredit: !!b.partialCredit, negativeMarks: Math.max(0, Number(b.negativeMarks) || 0), unit: str(b.unit, 20), caseSensitive: !!b.caseSensitive };
  if (!(o.marks > 0 && o.marks <= 100)) return { error: 'Marks must be more than 0 and at most 100.' };
  if (o.negativeMarks > o.marks) return { error: 'Negative marking cannot be more than the marks for the question.' };
  const lic = b.license || {}; o.license = { kind: LICENSES.includes(lic.kind) ? lic.kind : 'original', source: str(lic.source, 200), holder: str(lic.holder, 120) };
  if (o.license.kind !== 'original' && !o.license.source) return { error: 'Say where this question came from (source or book) and who holds the copyright.' };
  if (['mcq', 'multi', 'tf'].includes(kind)) {
    let opts = (Array.isArray(b.options) ? b.options : []).map((x) => ({ id: str(x.id, 12) || nid(), text: str(x.text, 500), textUr: str(x.textUr, 500), correct: !!x.correct })).filter((x) => x.text || x.textUr);
    if (kind === 'tf') { const right = opts.find((x) => x.correct)?.text || b.answerTrue; const t = String(right).toLowerCase() === 'true' || b.answerTrue === true; opts = [{ id: 'true', text: 'True', textUr: 'درست', correct: t }, { id: 'false', text: 'False', textUr: 'غلط', correct: !t }]; }
    if (opts.length < 2 || opts.length > 8) return { error: 'Give between 2 and 8 answer choices.' };
    if (new Set(opts.map((x) => x.text.toLowerCase())).size !== opts.length) return { error: 'Two choices say the same thing.' };
    const nc = opts.filter((x) => x.correct).length; if (kind !== 'multi' && nc !== 1) return { error: 'Mark exactly one choice as correct.' }; if (kind === 'multi' && (nc < 1 || nc === opts.length)) return { error: 'Mark at least one, but not every, choice as correct.' };
    o.options = opts;
  } else if (kind === 'short') { o.accepted = (Array.isArray(b.accepted) ? b.accepted : String(b.accepted || '').split('\n')).map((x) => str(x, 200)).filter(Boolean).slice(0, 20); if (!o.accepted.length) return { error: 'Give at least one accepted answer.' }; }
  else if (kind === 'numeric') { const n = Number(b.numAnswer); if (!Number.isFinite(n) || b.numAnswer === '' || b.numAnswer === null) return { error: 'Give the correct number.' }; o.numAnswer = n; o.numTolerance = Math.max(0, Number(b.numTolerance) || 0); }
  else if (kind === 'match') { const pairs = (Array.isArray(b.pairs) ? b.pairs : []).map((x) => ({ id: str(x.id, 12) || nid(), left: str(x.left, 300), right: str(x.right, 300) })).filter((x) => x.left && x.right); if (pairs.length < 2 || pairs.length > 10) return { error: 'Give between 2 and 10 matching pairs.' }; if (new Set(pairs.map((p) => p.right.toLowerCase())).size !== pairs.length) return { error: 'Two answers on the right are the same.' }; o.pairs = pairs; }
  else if (kind === 'order') { const seq = (Array.isArray(b.sequence) ? b.sequence : []).map((x) => ({ id: str(x.id, 12) || nid(), text: str(x.text, 300) })).filter((x) => x.text); if (seq.length < 2 || seq.length > 10) return { error: 'Give between 2 and 10 steps, in the correct order.' }; o.sequence = seq; }
  if (kind === 'essay' && b.rubricId) o.rubricId = oid(b.rubricId);
  o.stemSpeech = Notation.hasNotation(`${stem} ${(o.options || []).map((x) => x.text).join(' ')}`) ? Notation.speak(stem) : '';
  return { item: o };
}
const view = (i, full = true) => ({ _id: i._id, itemKey: i.itemKey, version: i.version, current: i.current, state: i.state, kind: i.kind, kindLabel: KIND_LABEL[i.kind], stem: i.stem, stemUr: i.stemUr, stemSpeech: i.stemSpeech, plain: Notation.plain(i.stem), language: i.language,
  marks: i.marks, topic: i.topic, standard: i.standard, subjectId: i.subjectId, bloom: i.bloom, competency: i.competency, difficulty: i.difficulty, tags: i.tags, sharing: i.sharing, license: i.license, locked: i.locked, rubricId: i.rubricId, authorId: i.authorId, authorName: i.authorName,
  usage: { ...(i.usage?.toObject ? i.usage.toObject() : i.usage), facility: i.usage?.attempts ? Math.round((i.usage.correct / i.usage.attempts) * 100) / 100 : null }, changeNote: i.changeNote, createdAt: i.createdAt, updatedAt: i.updatedAt,
  ...(full ? { options: i.options, pairs: i.pairs, sequence: i.sequence, accepted: i.accepted, caseSensitive: i.caseSensitive, numAnswer: i.numAnswer, numTolerance: i.numTolerance, unit: i.unit, explanation: i.explanation, partialCredit: i.partialCredit, negativeMarks: i.negativeMarks } : {}) });

// what a person may open: administrators everything; teachers their own and what colleagues have shared with the school
const visible = (scope, i) => scope.admin || String(i.authorId) === scope.teacherId || (i.sharing === 'school' && i.state === 'Active');
const load = async (req, id) => { const i = await Item.findOne({ _id: oid(id), schoolId: sid(req) }); return i; };

exports.meta = wrap('meta', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req);
  const [topics, subjects, rubrics] = await Promise.all([Item.find({ schoolId, current: true }).select('topic').then((r) => [...new Set(r.map((x) => x.topic).filter(Boolean))].sort()), Subject.find({ schoolId }).select('name code'), Rubric.find({ schoolId, archived: false }).sort({ name: 1 })]);
  res.json({ kinds: KINDS.map((k) => ({ key: k, label: KIND_LABEL[k] })), bloom: BLOOM, licenses: LICENSES, topics, subjects: subjects.map((s) => ({ _id: s._id, name: s.name })), rubrics: rubrics.map(rubView), admin: !!scope.admin });
});

exports.list = wrap('list', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const p = req.query; const q = { schoolId, current: true };
  if (!scope.admin) q.$or = [{ authorId: oid(req.user.userId) }, { sharing: 'school', state: 'Active' }];
  if (KINDS.includes(p.kind)) q.kind = p.kind; if (oid(p.subjectId)) q.subjectId = oid(p.subjectId); if (p.topic) q.topic = String(p.topic); if (['Easy', 'Medium', 'Hard'].includes(p.difficulty)) q.difficulty = p.difficulty; if (BLOOM.includes(p.bloom)) q.bloom = p.bloom;
  if (['Draft', 'Active', 'Retired'].includes(p.state)) q.state = p.state; if (p.mine === '1') q.authorId = oid(req.user.userId);
  if (p.q) { const rx = new RegExp(String(p.q).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); q.$and = [{ $or: [{ stem: rx }, { topic: rx }, { tags: rx }] }]; }
  const page = Math.max(1, Number(p.page) || 1); const per = Math.min(100, Math.max(5, Number(p.per) || 25));
  const [total, rows] = await Promise.all([Item.countDocuments(q), Item.find(q).sort({ updatedAt: -1 }).skip((page - 1) * per).limit(per)]);
  res.json({ total, page, per, pagination: { page, pages: Math.max(1, Math.ceil(total / per)) }, items: rows.map((r) => view(r, false)) });
});

exports.get = wrap('get', async (req, res) => {
  const scope = await S.scopeOf(req); const i = await load(req, req.params.id); if (!i || !visible(scope, i)) return bad(res, 404, 'Question not found.');
  const chain = await Item.find({ schoolId: sid(req), itemKey: i.itemKey }).sort({ version: -1 }).select('version state current locked changeNote authorName createdAt');
  res.json({ item: view(i), versions: chain.map((v) => ({ _id: v._id, version: v.version, current: v.current, state: v.state, locked: v.locked, changeNote: v.changeNote, authorName: v.authorName, createdAt: v.createdAt })) });
});

exports.create = wrap('create', async (req, res) => {
  const schoolId = sid(req); const w = who(req); const r = clean(req.body || {}); if (r.error) return bad(res, 400, r.error);
  const sub = oid(req.body.subjectId); if (sub && !(await Subject.exists({ _id: sub, schoolId }))) return bad(res, 404, 'Subject not found.');
  const doc = await Item.create({ ...r.item, schoolId, itemKey: crypto.randomBytes(8).toString('hex'), version: 1, current: true, state: 'Draft', subjectId: sub || undefined, authorId: w.id, authorRole: w.role, authorName: w.name, sharing: 'private' });
  await audit(req, { action: 'assess.item.create', entityType: 'QuestionItem', entityId: doc._id, schoolId, detail: { kind: doc.kind } });
  res.status(201).json({ item: view(doc) });
});

exports.update = wrap('update', async (req, res) => {
  const schoolId = sid(req); const w = who(req); const scope = await S.scopeOf(req); const i = await load(req, req.params.id); if (!i || !visible(scope, i)) return bad(res, 404, 'Question not found.');
  if (!scope.admin && String(i.authorId) !== scope.teacherId) return bad(res, 403, 'Only the author or an administrator can change this question.');
  if (!i.current) return bad(res, 422, 'This is an older version. Open the latest version to change it.');
  const r = clean({ ...view(i), options: i.options, pairs: i.pairs, sequence: i.sequence, accepted: i.accepted, ...(req.body || {}) }); if (r.error) return bad(res, 400, r.error);
  const sub = req.body.subjectId !== undefined ? oid(req.body.subjectId) : i.subjectId;
  if (!i.locked) { Object.assign(i, r.item, { subjectId: sub || undefined }); await i.save(); await audit(req, { action: 'assess.item.update', entityType: 'QuestionItem', entityId: i._id, schoolId, detail: { version: i.version } }); return res.json({ item: view(i) }); }
  // used in a published paper: keep that version exactly as it was and make a new one
  const note = str(req.body?.changeNote, 300); if (note.length < 3) return bad(res, 400, 'This question is already used in a published quiz. Say what you are changing and why, and a new version will be made.');
  const next = await Item.create({ ...r.item, schoolId, itemKey: i.itemKey, version: i.version + 1, current: true, state: i.state === 'Retired' ? 'Draft' : 'Active', subjectId: sub || undefined, authorId: i.authorId, authorRole: i.authorRole, authorName: i.authorName, sharing: i.sharing, supersedesId: i._id, changeNote: note, locked: false });
  await Item.updateOne({ _id: i._id }, { $set: { current: false } });
  await audit(req, { action: 'assess.item.version', entityType: 'QuestionItem', entityId: next._id, schoolId, detail: { from: i.version, to: next.version, note } });
  res.status(201).json({ item: view(next), newVersion: true });
});

const setState = (action, to) => wrap(action, async (req, res) => {
  const scope = await S.scopeOf(req); const i = await load(req, req.params.id); if (!i || !visible(scope, i)) return bad(res, 404, 'Question not found.');
  if (!scope.admin && String(i.authorId) !== scope.teacherId) return bad(res, 403, 'Only the author or an administrator can do this.'); if (!i.current) return bad(res, 422, 'Only the latest version can change state.');
  if (i.state === to) return bad(res, 409, `This question is already ${to.toLowerCase()}.`);
  i.state = to; if (to === 'Retired') i.sharing = 'private'; await i.save(); await audit(req, { action: `assess.item.${action}`, entityType: 'QuestionItem', entityId: i._id, schoolId: sid(req), detail: { version: i.version } }); res.json({ item: view(i) });
});
exports.activate = setState('activate', 'Active'); exports.retire = setState('retire', 'Retired');

exports.share = wrap('share', async (req, res) => {
  const scope = await S.scopeOf(req); const i = await load(req, req.params.id); if (!i || !visible(scope, i)) return bad(res, 404, 'Question not found.');
  if (!scope.admin && String(i.authorId) !== scope.teacherId) return bad(res, 403, 'Only the author can change who sees this question.');
  const to = req.body?.sharing === 'school' ? 'school' : 'private'; if (to === 'school' && i.state !== 'Active') return bad(res, 422, 'Make the question active before sharing it with colleagues.');
  if (to === 'school' && i.license.kind === 'licensed') return bad(res, 422, 'A question that is used under a licence cannot be shared with other teachers unless the licence allows it. Change the licence details first.');
  i.sharing = to; await i.save(); await audit(req, { action: 'assess.item.share', entityType: 'QuestionItem', entityId: i._id, schoolId: sid(req), detail: { sharing: to } }); res.json({ item: view(i) });
});

exports.duplicate = wrap('duplicate', async (req, res) => {
  const schoolId = sid(req); const w = who(req); const scope = await S.scopeOf(req); const i = await load(req, req.params.id); if (!i || !visible(scope, i)) return bad(res, 404, 'Question not found.');
  const copy = i.toObject(); delete copy._id; delete copy.createdAt; delete copy.updatedAt;
  const doc = await Item.create({ ...copy, schoolId, itemKey: crypto.randomBytes(8).toString('hex'), version: 1, current: true, state: 'Draft', locked: false, sharing: 'private', authorId: w.id, authorRole: w.role, authorName: w.name, usage: { quizzes: 0, attempts: 0, correct: 0 }, supersedesId: undefined, changeNote: `Copy of a question by ${i.authorName || 'a colleague'}`,
    license: i.authorId && String(i.authorId) !== String(w.id) ? { kind: 'adapted', source: `Colleague's question (${i.authorName || ''})`, holder: i.license?.holder || i.authorName || '' } : i.license });
  res.status(201).json({ item: view(doc) });
});

exports.remove = wrap('remove', async (req, res) => {
  const scope = await S.scopeOf(req); const i = await load(req, req.params.id); if (!i || !visible(scope, i)) return bad(res, 404, 'Question not found.');
  if (!scope.admin && String(i.authorId) !== scope.teacherId) return bad(res, 403, 'Only the author or an administrator can delete this.');
  if (i.locked || i.version > 1 || i.state !== 'Draft') return bad(res, 422, 'Only a draft that was never used can be deleted. Retire the question instead.');
  await Item.deleteOne({ _id: i._id }); res.json({ ok: true });
});

exports.notationPreview = wrap('notation', async (req, res) => { const t = str(req.body?.text, 2000); res.json({ tokens: Notation.parse(t), speech: Notation.speak(t), plain: Notation.plain(t) }); });

// Only what the school wrote itself, or what is open, may leave the school (CAP-0327)
exports.exportItems = wrap('export', async (req, res) => {
  const scope = await S.scopeOf(req); const ids = String(req.query.ids || '').split(',').map(oid).filter(Boolean); if (!ids.length) return bad(res, 400, 'Choose the questions to export.');
  const rows = (await Item.find({ schoolId: sid(req), _id: { $in: ids } })).filter((i) => visible(scope, i)); const blocked = []; const out = [];
  for (const i of rows) { if (!['original', 'open'].includes(i.license.kind)) { blocked.push({ _id: i._id, why: 'Adapted or licensed material cannot leave the school.' }); continue; } if (!scope.admin && String(i.authorId) !== scope.teacherId) { blocked.push({ _id: i._id, why: 'Only the author can export this question.' }); continue; } out.push(view(i)); }
  if (!out.length) return bad(res, 422, blocked[0]?.why || 'Nothing can be exported.', { blocked });
  await audit(req, { action: 'assess.item.export', entityType: 'QuestionItem', schoolId: sid(req), detail: { count: out.length } });
  res.set({ 'Content-Disposition': 'attachment; filename="aulensia-questions.json"', 'Content-Type': 'application/json' });
  res.send(JSON.stringify({ format: 'aulensia-questions@1', license: out[0].license.kind === 'open' ? 'open' : 'author-owned', exportedAt: new Date().toISOString(), blocked, items: out.map((x) => ({ kind: x.kind, stem: x.stem, stemUr: x.stemUr, marks: x.marks, topic: x.topic, standard: x.standard, difficulty: x.difficulty, bloom: x.bloom, competency: x.competency, options: x.options, pairs: x.pairs, sequence: x.sequence, accepted: x.accepted, numAnswer: x.numAnswer, numTolerance: x.numTolerance, explanation: x.explanation, license: x.license })) }));
});
exports.importItems = wrap('import', async (req, res) => {
  const schoolId = sid(req); const w = who(req); const b = req.body || {}; if (b.format !== 'aulensia-questions@1') return bad(res, 400, 'This file is not a question package.');
  if (!str(b.licenseStatement, 200)) return bad(res, 422, 'Say under what licence these questions may be used (for example: written by me, or open licence).');
  const list = (Array.isArray(b.items) ? b.items : []).slice(0, 200); let made = 0; const errors = [];
  for (const [n, raw] of list.entries()) { const r = clean({ ...raw, license: { kind: 'adapted', source: str(b.licenseStatement, 200), holder: str(b.holder, 120) } }); if (r.error) { errors.push({ row: n + 1, message: r.error }); continue; }
    await Item.create({ ...r.item, schoolId, itemKey: crypto.randomBytes(8).toString('hex'), version: 1, current: true, state: 'Draft', authorId: w.id, authorRole: w.role, authorName: w.name, sharing: 'private', changeNote: 'Imported' }); made += 1; }
  await audit(req, { action: 'assess.item.import', entityType: 'QuestionItem', schoolId, detail: { made, errors: errors.length } });
  res.status(made ? 201 : 422).json({ made, errors, message: made ? undefined : 'No question could be imported.' });
});

// ── rubrics ──
const rubView = (r) => ({ _id: r._id, name: r.name, criteria: r.criteria, max: r.max, comments: r.comments, authorName: r.authorName, archived: r.archived });
function cleanRubric(b) {
  const name = str(b.name, 80); if (!name) return { error: 'Name the rubric.' };
  const criteria = (Array.isArray(b.criteria) ? b.criteria : []).slice(0, 10).map((c) => ({ id: str(c.id, 12) || nid(), name: str(c.name, 80), levels: (Array.isArray(c.levels) ? c.levels : []).slice(0, 8).map((l) => ({ points: Number(l.points), descriptor: str(l.descriptor, 300) })).filter((l) => Number.isFinite(l.points) && l.points >= 0).sort((a, c2) => a.points - c2.points) })).filter((c) => c.name);
  if (!criteria.length) return { error: 'Add at least one criterion.' }; if (criteria.some((c) => c.levels.length < 2)) return { error: 'Each criterion needs at least two levels.' };
  const max = criteria.reduce((s, c) => s + Math.max(...c.levels.map((l) => l.points)), 0); if (max <= 0) return { error: 'The levels must add up to more than 0 points.' };
  return { rubric: { name, criteria, max, comments: (Array.isArray(b.comments) ? b.comments : []).map((c) => str(c, 200)).filter(Boolean).slice(0, 40) } };
}
exports.rubrics = wrap('rubrics', async (req, res) => res.json({ rubrics: (await Rubric.find({ schoolId: sid(req), archived: req.query.archived === '1' }).sort({ name: 1 })).map(rubView) }));
exports.createRubric = wrap('createRubric', async (req, res) => { const r = cleanRubric(req.body || {}); if (r.error) return bad(res, 400, r.error); const w = who(req); const doc = await Rubric.create({ ...r.rubric, schoolId: sid(req), authorId: w.id, authorName: w.name }); res.status(201).json({ rubric: rubView(doc) }); });
exports.updateRubric = wrap('updateRubric', async (req, res) => {
  const doc = await Rubric.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!doc) return bad(res, 404, 'Rubric not found.'); const r = cleanRubric({ ...rubView(doc), ...(req.body || {}) }); if (r.error) return bad(res, 400, r.error);
  const scope = await S.scopeOf(req); if (!scope.admin && String(doc.authorId) !== scope.teacherId) return bad(res, 403, 'Only the author or an administrator can change this rubric.');
  Object.assign(doc, r.rubric); await doc.save(); res.json({ rubric: rubView(doc) });
});
exports.archiveRubric = wrap('archiveRubric', async (req, res) => { const doc = await Rubric.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!doc) return bad(res, 404, 'Rubric not found.'); doc.archived = req.body?.archived !== false; await doc.save(); res.json({ rubric: rubView(doc) }); });
exports.KINDS = KINDS; exports.view = view; exports.visible = visible; exports.cleanItem = clean;
