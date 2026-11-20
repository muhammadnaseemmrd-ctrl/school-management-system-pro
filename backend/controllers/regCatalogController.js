// Registrar catalogue (PRD E16): grade scale and policy, courses, programmes with versioned rules, terms and sections.
const S = require('../utils/registrar/service');
const { E, oid, sid, who, bad, wrap, clean } = S;
const RegCourse = require('../models/RegCourse');
const RegProgram = require('../models/RegProgram');
const RegProgramVersion = require('../models/RegProgramVersion');
const RegTerm = require('../models/RegTerm');
const RegSection = require('../models/RegSection');
const RegEnrollment = require('../models/RegEnrollment');
const RegStudentProgram = require('../models/RegStudentProgram');
const Teacher = require('../models/Teacher');
const { tenantGuard } = { tenantGuard: require('../utils/tenantGuard') };
const { audit } = require('../utils/audit');

const code = (v, n = 20) => clean(v, n).toUpperCase().replace(/[^A-Z0-9-]/g, '');
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// ---------- settings ----------
exports.settings = wrap('reg.settings', async (req, res) => { const s = await S.getSettings(sid(req)); res.json({ ...s, defaults: { scale: E.DEFAULT_SCALE, policy: E.DEFAULT_POLICY }, special: { W: 'Withdrew', I: 'Incomplete', AU: 'Audit', P: 'Pass (no points)', NP: 'No pass' } }); });
exports.saveSettings = wrap('reg.saveSettings', async (req, res) => {
  const schoolId = sid(req); const cur = await S.getSettings(schoolId); const b = req.body || {};
  let scale = cur.scale;
  if (b.scale !== undefined) {
    if (!Array.isArray(b.scale) || b.scale.length < 2 || b.scale.length > 20) return bad(res, 400, 'The grade scale needs between 2 and 20 grades.');
    const seen = new Set(); const next = [];
    for (const x of b.scale) {
      const grade = clean(x.grade, 3).toUpperCase(); const points = num(x.points, NaN);
      if (!/^[A-Z][+-]?$/.test(grade) || E.SPECIAL[grade]) return bad(res, 400, `"${x.grade}" cannot be a grade. Use a letter with an optional + or -; W, I, AU, P and NP are reserved.`);
      if (seen.has(grade)) return bad(res, 400, `${grade} appears twice.`); seen.add(grade);
      if (!(points >= 0 && points <= 10)) return bad(res, 400, `Points for ${grade} must be between 0 and 10.`);
      next.push({ grade, points, pass: x.pass === undefined ? points > 0 : !!x.pass });
    }
    // grades already published keep their meaning: a grade in use cannot change its points or be removed
    const used = await RegEnrollment.find({ schoolId, gradeState: 'final' }).select('grade');
    const inUse = new Set(used.map((u) => u.grade));
    for (const old of cur.scale) if (inUse.has(old.grade)) { const n = next.find((y) => y.grade === old.grade); if (!n || n.points !== old.points || n.pass !== old.pass) return bad(res, 409, `${old.grade} is on published transcripts, so its points cannot change or be removed.`); }
    scale = next;
  }
  const p = { ...cur.policy };
  if (b.policy) {
    const q = b.policy;
    if (q.repeat !== undefined) { if (!['latest', 'best', 'average'].includes(q.repeat)) return bad(res, 400, 'Repeat rule must be latest, best or average.'); p.repeat = q.repeat; }
    for (const k of ['repeatBelow', 'minPassGrade']) if (q[k] !== undefined) { if (!scale.some((g) => g.grade === q[k])) return bad(res, 400, `${q[k]} is not on the grade scale.`); p[k] = q[k]; }
    if (q.maxAttempts !== undefined) { const v = num(q.maxAttempts, 0); if (v < 1 || v > 10) return bad(res, 400, 'Attempts must be 1 to 10.'); p.maxAttempts = v; }
    if (q.maxCreditsPerTerm !== undefined) { const v = num(q.maxCreditsPerTerm, 0); if (v < 1 || v > 60) return bad(res, 400, 'Credits per term must be 1 to 60.'); p.maxCreditsPerTerm = v; }
    if (q.appealDays !== undefined) { const v = num(q.appealDays, -1); if (v < 1 || v > 120) return bad(res, 400, 'Appeal days must be 1 to 120.'); p.appealDays = v; }
    if (q.selfRegistration !== undefined) p.selfRegistration = !!q.selfRegistration;
  }
  await S.putSettings(schoolId, { scale, policy: p });
  await audit(req, { action: 'registrar.settings', entityType: 'RegSettings', entityId: String(schoolId), schoolId, detail: { repeat: p.repeat, maxAttempts: p.maxAttempts, grades: scale.length } });
  res.json({ scale, policy: p });
});

// ---------- courses ----------
const courseShape = (c) => ({ _id: c._id, code: c.code, title: c.title, credits: c.credits, department: c.department, level: c.level, description: c.description, prerequisites: c.prerequisites || [], corequisites: c.corequisites || [], status: c.status, revision: c.revision, history: (c.history || []).slice(-10) });
// a prerequisite chain that leads back to itself can never be satisfied
const hasCycle = (map, startCode) => { const seen = new Set(); const walk = (c) => { if (c === startCode && seen.size) return true; if (seen.has(c)) return false; seen.add(c); return (map.get(c)?.prerequisites || []).some((p) => walk(p.code)); }; return (map.get(startCode)?.prerequisites || []).some((p) => walk(p.code)); };
async function checkCourseBody(schoolId, b, selfCode) {
  const catalog = await S.catalogMap(schoolId); const out = {};
  const pre = [];
  for (const p of b.prerequisites || []) { const c = code(p.code); if (!c) continue; if (c === selfCode) return { error: 'A course cannot be its own prerequisite.' }; if (!catalog.has(c)) return { error: `Prerequisite ${c} is not in the catalogue yet.` }; const mg = clean(p.minGrade || 'D', 3).toUpperCase(); pre.push({ code: c, minGrade: mg }); }
  const co = []; for (const p of b.corequisites || []) { const c = code(p.code || p); if (!c) continue; if (c === selfCode) return { error: 'A course cannot be its own corequisite.' }; if (!catalog.has(c)) return { error: `Corequisite ${c} is not in the catalogue yet.` }; co.push({ code: c }); }
  const { scale } = await S.getSettings(schoolId);
  for (const p of pre) if (!scale.some((g) => g.grade === p.minGrade)) return { error: `${p.minGrade} is not on the grade scale.` };
  out.prerequisites = pre; out.corequisites = co; out.catalog = catalog; return out;
}
exports.courses = wrap('reg.courses', async (req, res) => {
  const schoolId = sid(req); const q = clean(req.query.q, 40); const { p, l } = S.pg(req.query);
  const rows = await RegCourse.find({ schoolId, ...(req.query.status ? { status: req.query.status } : {}) }).sort({ code: 1 });
  const f = q ? rows.filter((c) => `${c.code} ${c.title} ${c.department}`.toLowerCase().includes(q.toLowerCase())) : rows;
  res.json({ total: f.length, page: p, courses: f.slice((p - 1) * l, p * l).map(courseShape) });
});
exports.createCourse = wrap('reg.createCourse', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const c = code(b.code); const title = clean(b.title, 120); const credits = num(b.credits, NaN);
  if (c.length < 2) return bad(res, 400, 'Give the course a code such as CS101.');
  if (title.length < 2) return bad(res, 400, 'Give the course a title.');
  if (!(credits >= 0 && credits <= 30)) return bad(res, 400, 'Credits must be between 0 and 30.');
  const chk = await checkCourseBody(schoolId, b, c); if (chk.error) return bad(res, 422, chk.error);
  try {
    const doc = await RegCourse.create({ schoolId, code: c, title, credits, department: clean(b.department, 60), level: num(b.level, 100), description: clean(b.description, 600), prerequisites: chk.prerequisites, corequisites: chk.corequisites, history: [{ at: new Date(), byName: req.actorName || '', change: 'Created' }] });
    await audit(req, { action: 'registrar.course.create', entityType: 'RegCourse', entityId: String(doc._id), schoolId, detail: { code: c } });
    res.status(201).json(courseShape(doc));
  } catch (e) { if (S.isDup(e)) return bad(res, 409, `${c} is already in the catalogue.`); throw e; }
});
exports.updateCourse = wrap('reg.updateCourse', async (req, res) => {
  const schoolId = sid(req); const c = await RegCourse.findOne({ _id: oid(req.params.id), schoolId }); if (!c) return bad(res, 404, 'Course not found.');
  const b = tenantGuard.safeBody(req.body || {}, ['code', 'revision', 'history']); const set = {}; const notes = [];
  if (b.title !== undefined) { const t = clean(b.title, 120); if (t.length < 2) return bad(res, 400, 'Give the course a title.'); if (t !== c.title) { set.title = t; notes.push('title'); } }
  if (b.credits !== undefined) { const v = num(b.credits, NaN); if (!(v >= 0 && v <= 30)) return bad(res, 400, 'Credits must be between 0 and 30.'); if (v !== c.credits) { set.credits = v; notes.push(`credits ${c.credits} to ${v}`); } }
  for (const k of ['department', 'description']) if (b[k] !== undefined) set[k] = clean(b[k], k === 'description' ? 600 : 60);
  if (b.level !== undefined) set.level = num(b.level, 100);
  if (b.prerequisites !== undefined || b.corequisites !== undefined) {
    const chk = await checkCourseBody(schoolId, { prerequisites: b.prerequisites ?? c.prerequisites, corequisites: b.corequisites ?? c.corequisites }, c.code); if (chk.error) return bad(res, 422, chk.error);
    chk.catalog.set(c.code, { ...S.plain(c), prerequisites: chk.prerequisites });
    if (hasCycle(chk.catalog, c.code)) return bad(res, 422, 'These prerequisites lead back to this course, so no one could ever take it.');
    set.prerequisites = chk.prerequisites; set.corequisites = chk.corequisites; notes.push('prerequisites');
  }
  if (!Object.keys(set).length) return res.json(courseShape(c));
  await RegCourse.updateOne({ _id: c._id, schoolId }, { $set: set, $inc: { revision: 1 }, $push: { history: { at: new Date(), byName: req.actorName || '', change: notes.join(', ') || 'Edited' } } });
  await audit(req, { action: 'registrar.course.update', entityType: 'RegCourse', entityId: String(c._id), schoolId, detail: { code: c.code, notes } });
  res.json(courseShape(await RegCourse.findOne({ _id: c._id, schoolId })));
});
exports.setCourseStatus = wrap('reg.courseStatus', async (req, res) => {
  const schoolId = sid(req); const c = await RegCourse.findOne({ _id: oid(req.params.id), schoolId }); if (!c) return bad(res, 404, 'Course not found.');
  const to = req.body?.status === 'retired' ? 'retired' : 'active';
  if (to === 'retired') {
    const vs = await RegProgramVersion.find({ schoolId, status: { $in: ['draft', 'review', 'published'] } }).select('catalogYear programId requirements');
    const used = vs.filter((v) => (v.requirements || []).some((g) => (g.courses || []).includes(c.code)));
    if (used.length) return bad(res, 409, `${c.code} is still in the rules for ${used.length} programme version${used.length === 1 ? '' : 's'}. Make a new version without it first.`);
    const open = await RegSection.countDocuments({ schoolId, courseId: c._id, status: 'open' }); if (open) return bad(res, 409, `${c.code} is offered in ${open} open section${open === 1 ? '' : 's'}. Cancel them first.`);
  }
  await RegCourse.updateOne({ _id: c._id, schoolId }, { $set: { status: to }, $push: { history: { at: new Date(), byName: req.actorName || '', change: to === 'retired' ? 'Retired' : 'Brought back' } } });
  await audit(req, { action: `registrar.course.${to}`, entityType: 'RegCourse', entityId: String(c._id), schoolId, detail: { code: c.code } });
  res.json({ ok: true, status: to });
});

// ---------- programmes and versioned rules ----------
const versionShape = (v) => ({ _id: v._id, programId: v.programId, catalogYear: v.catalogYear, status: v.status, totalCredits: v.totalCredits, minCgpa: v.minCgpa, minGrade: v.minGrade, requirements: v.requirements || [], note: v.note, createdByName: v.createdByName, submittedByName: v.submittedByName, approval: v.approval || null, contentHash: v.contentHash, updatedAt: v.updatedAt });
exports.programs = wrap('reg.programs', async (req, res) => {
  const schoolId = sid(req); const [ps, vs, studs] = await Promise.all([RegProgram.find({ schoolId }).sort({ name: 1 }), RegProgramVersion.find({ schoolId }).sort({ catalogYear: -1 }), RegStudentProgram.find({ schoolId, isCurrent: true }).select('programId versionId status')]);
  res.json({ programs: ps.map((p) => ({ _id: p._id, code: p.code, name: p.name, level: p.level, department: p.department, status: p.status, students: studs.filter((s) => String(s.programId) === String(p._id) && s.status === 'active').length,
    versions: vs.filter((v) => String(v.programId) === String(p._id)).map((v) => ({ ...versionShape(v), students: studs.filter((s) => String(s.versionId) === String(v._id) && s.status === 'active').length })) })) });
});
exports.createProgram = wrap('reg.createProgram', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const c = code(b.code); const name = clean(b.name, 120);
  if (c.length < 2 || name.length < 2) return bad(res, 400, 'A programme needs a code and a name.');
  const level = ['certificate', 'diploma', 'bachelor', 'master', 'doctorate', 'other'].includes(b.level) ? b.level : 'bachelor';
  try { const p = await RegProgram.create({ schoolId, code: c, name, level, department: clean(b.department, 60) }); await audit(req, { action: 'registrar.program.create', entityType: 'RegProgram', entityId: String(p._id), schoolId, detail: { code: c } }); res.status(201).json(p); }
  catch (e) { if (S.isDup(e)) return bad(res, 409, `${c} is already a programme.`); throw e; }
});
exports.updateProgram = wrap('reg.updateProgram', async (req, res) => {
  const schoolId = sid(req); const p = await RegProgram.findOne({ _id: oid(req.params.id), schoolId }); if (!p) return bad(res, 404, 'Programme not found.');
  const b = req.body || {}; const set = {};
  if (b.name !== undefined) { const n = clean(b.name, 120); if (n.length < 2) return bad(res, 400, 'A programme needs a name.'); set.name = n; }
  if (b.department !== undefined) set.department = clean(b.department, 60);
  if (b.status !== undefined) { if (!['active', 'retired'].includes(b.status)) return bad(res, 400, 'Status must be active or retired.'); set.status = b.status; }
  if (Object.keys(set).length) await RegProgram.updateOne({ _id: p._id, schoolId }, { $set: set });
  if (set.name) await RegStudentProgram.updateMany({ schoolId, programId: p._id }, { $set: { programName: set.name } });
  res.json(await RegProgram.findOne({ _id: p._id, schoolId }));
});
function cleanReqs(list, scaleGrades) {
  const out = []; const keys = new Set();
  for (const g of Array.isArray(list) ? list : []) {
    const key = clean(g.key || g.title, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); const title = clean(g.title, 80);
    if (!key || !title) return { error: 'Every requirement group needs a title.' }; if (keys.has(key)) return { error: `Two groups are called "${title}".` }; keys.add(key);
    const rule = ['all', 'credits', 'count'].includes(g.rule) ? g.rule : 'all';
    const courses = [...new Set((g.courses || []).map((c) => code(c)).filter(Boolean))]; const prefixes = [...new Set((g.prefixes || []).map((c) => code(c, 10)).filter(Boolean))];
    out.push({ key, title, rule, courses, prefixes, ...(rule === 'credits' ? { minCredits: num(g.minCredits, 0) } : {}), ...(rule === 'count' ? { minCount: num(g.minCount, 0) } : {}) });
  }
  return { reqs: out };
}
exports.createVersion = wrap('reg.createVersion', async (req, res) => {
  const schoolId = sid(req); const p = await RegProgram.findOne({ _id: oid(req.params.id), schoolId }); if (!p) return bad(res, 404, 'Programme not found.');
  const b = req.body || {}; const year = clean(b.catalogYear, 20); if (!year) return bad(res, 400, 'Give the catalogue year, for example 2026.');
  let src = null; if (b.copyFrom) { src = await RegProgramVersion.findOne({ _id: oid(b.copyFrom), schoolId, programId: p._id }); if (!src) return bad(res, 404, 'The version to copy was not found.'); }
  try {
    const v = await RegProgramVersion.create({ schoolId, programId: p._id, catalogYear: year, createdByName: req.actorName || '', totalCredits: src ? src.totalCredits : num(b.totalCredits, 120), minCgpa: src ? src.minCgpa : num(b.minCgpa, 2), minGrade: src ? src.minGrade : 'D', requirements: src ? src.requirements : [], note: src ? `Copied from ${src.catalogYear}` : '' });
    await audit(req, { action: 'registrar.version.create', entityType: 'RegProgramVersion', entityId: String(v._id), schoolId, detail: { program: p.code, year } }); res.status(201).json(versionShape(v));
  } catch (e) { if (S.isDup(e)) return bad(res, 409, `${p.code} already has a ${year} version.`); throw e; }
});
exports.updateVersion = wrap('reg.updateVersion', async (req, res) => {
  const schoolId = sid(req); const v = await RegProgramVersion.findOne({ _id: oid(req.params.id), schoolId }); if (!v) return bad(res, 404, 'Version not found.');
  if (v.status !== 'draft') return bad(res, 409, v.status === 'published' ? 'A published version never changes. Make a new version from it instead.' : 'Only a draft can be edited. Send it back to draft first.');
  const b = req.body || {}; const set = {}; const { scale } = await S.getSettings(schoolId);
  if (b.totalCredits !== undefined) { const t = num(b.totalCredits, NaN); if (!(t > 0 && t <= 600)) return bad(res, 400, 'Total credits must be between 1 and 600.'); set.totalCredits = t; }
  if (b.minCgpa !== undefined) { const m = num(b.minCgpa, NaN); const top = Math.max(...scale.map((g) => g.points)); if (!(m >= 0 && m <= top)) return bad(res, 400, `Minimum average must be between 0 and ${top}.`); set.minCgpa = m; }
  if (b.minGrade !== undefined) { if (!scale.some((g) => g.grade === b.minGrade)) return bad(res, 400, `${b.minGrade} is not on the grade scale.`); set.minGrade = b.minGrade; }
  if (b.note !== undefined) set.note = clean(b.note, 300);
  if (b.requirements !== undefined) { const r = cleanReqs(b.requirements); if (r.error) return bad(res, 400, r.error); set.requirements = r.reqs; }
  if (Object.keys(set).length) await RegProgramVersion.updateOne({ _id: v._id, schoolId, status: 'draft' }, { $set: set });
  res.json(versionShape(await RegProgramVersion.findOne({ _id: v._id, schoolId })));
});
// everything that must be true before rules can go live
async function validateVersion(schoolId, v) {
  const problems = []; const catalog = await S.catalogMap(schoolId); const reqs = v.requirements || [];
  if (!reqs.length) problems.push('Add at least one requirement group.');
  let fixed = 0;
  for (const g of reqs) {
    for (const c of g.courses || []) { const k = catalog.get(c); if (!k) problems.push(`${g.title}: ${c} is not in the catalogue.`); else if (k.status === 'retired') problems.push(`${g.title}: ${c} is retired.`); }
    if (g.rule === 'all') { if (!(g.courses || []).length) problems.push(`${g.title}: list the required courses.`); fixed += (g.courses || []).reduce((s, c) => s + (catalog.get(c)?.credits || 0), 0); }
    if (g.rule === 'credits') { if (!(g.minCredits > 0)) problems.push(`${g.title}: say how many credits are needed.`); if (!(g.courses || []).length && !(g.prefixes || []).length) problems.push(`${g.title}: say which courses can count.`); fixed += g.minCredits || 0; }
    if (g.rule === 'count') { if (!(g.minCount > 0)) problems.push(`${g.title}: say how many courses are needed.`); if (!(g.courses || []).length && !(g.prefixes || []).length) problems.push(`${g.title}: say which courses can count.`); }
  }
  if (fixed > v.totalCredits) problems.push(`The groups ask for at least ${fixed} credits but the programme needs only ${v.totalCredits}.`);
  return problems;
}
exports.versionChecks = wrap('reg.versionChecks', async (req, res) => { const v = await RegProgramVersion.findOne({ _id: oid(req.params.id), schoolId: sid(req) }); if (!v) return bad(res, 404, 'Version not found.'); res.json({ problems: await validateVersion(sid(req), v) }); });
exports.submitVersion = wrap('reg.submitVersion', async (req, res) => {
  const schoolId = sid(req); const v = await RegProgramVersion.findOne({ _id: oid(req.params.id), schoolId }); if (!v) return bad(res, 404, 'Version not found.');
  if (v.status !== 'draft') return bad(res, 409, 'Only a draft can be sent for review.');
  const problems = await validateVersion(schoolId, v); if (problems.length) return bad(res, 422, 'The rules are not ready yet.', { problems });
  const r = await RegProgramVersion.updateOne({ _id: v._id, schoolId, status: 'draft' }, { $set: { status: 'review', submittedByName: req.actorName || '', submittedById: oid(req.user.userId) } });
  if (!r.matchedCount) return bad(res, 409, 'Someone else just changed this version.');
  await S.notifyAdmins(schoolId, 'Programme rules to review', `${req.actorName || 'An administrator'} sent the ${v.catalogYear} rules for review.`, oid(req.user.userId)); res.json({ ok: true, status: 'review' });
});
exports.decideVersion = wrap('reg.decideVersion', async (req, res) => {
  const schoolId = sid(req); const v = await RegProgramVersion.findOne({ _id: oid(req.params.id), schoolId }); if (!v) return bad(res, 404, 'Version not found.');
  if (v.status !== 'review') return bad(res, 409, 'This version is not waiting for review.');
  const me = who(req); const sole = await S.soleAdmin(schoolId);
  if (req.body?.approve === false) { const note = clean(req.body.note, 300); if (!note) return bad(res, 400, 'Say what needs to change.'); await RegProgramVersion.updateOne({ _id: v._id, schoolId, status: 'review' }, { $set: { status: 'draft', note: `Sent back: ${note}` } }); return res.json({ ok: true, status: 'draft' }); }
  if (v.submittedById && String(v.submittedById) === String(me.id) && !sole) return bad(res, 403, 'A different administrator has to approve rules you sent for review.');
  const problems = await validateVersion(schoolId, v); if (problems.length) return bad(res, 422, 'The rules are not ready yet.', { problems });
  const hash = E.sha({ t: v.totalCredits, m: v.minCgpa, g: v.minGrade, r: v.requirements });
  const r = await RegProgramVersion.updateOne({ _id: v._id, schoolId, status: 'review' }, { $set: { status: 'published', contentHash: hash, approval: { byName: me.name, byId: me.id, at: new Date(), sole, hash: E.sign({ versionId: String(v._id), hash }) } } });
  if (!r.matchedCount) return bad(res, 409, 'Someone else just decided this version.');
  await audit(req, { action: 'registrar.version.publish', entityType: 'RegProgramVersion', entityId: String(v._id), schoolId, detail: { year: v.catalogYear, sole } }); res.json({ ok: true, status: 'published' });
});
exports.retireVersion = wrap('reg.retireVersion', async (req, res) => {
  const schoolId = sid(req); const v = await RegProgramVersion.findOne({ _id: oid(req.params.id), schoolId }); if (!v) return bad(res, 404, 'Version not found.');
  if (v.status === 'draft' || v.status === 'review') { const n = await RegStudentProgram.countDocuments({ schoolId, versionId: v._id }); if (n) return bad(res, 409, 'Students are bound to this version.'); await RegProgramVersion.deleteOne({ _id: v._id, schoolId, status: v.status }); return res.json({ ok: true, deleted: true }); }
  await RegProgramVersion.updateOne({ _id: v._id, schoolId }, { $set: { status: 'retired' } }); res.json({ ok: true, status: 'retired', note: 'Students already on this version keep it. New students can no longer be placed on it.' });
});

// ---------- terms ----------
const termShape = (t, extra = {}) => ({ _id: t._id, code: t.code, name: t.name, startDate: t.startDate, endDate: t.endDate, addDropUntil: t.addDropUntil, status: t.status, publishedAt: t.publishedAt || null, ...extra });
exports.terms = wrap('reg.terms', async (req, res) => {
  const schoolId = sid(req); const [ts, secs, ens] = await Promise.all([RegTerm.find({ schoolId }).sort({ startDate: -1 }), RegSection.find({ schoolId }).select('termId status'), RegEnrollment.find({ schoolId, status: 'enrolled' }).select('termId')]);
  res.json({ terms: ts.map((t) => termShape(t, { sections: secs.filter((s) => String(s.termId) === String(t._id) && s.status !== 'cancelled').length, enrolments: ens.filter((e) => String(e.termId) === String(t._id)).length })) });
});
exports.createTerm = wrap('reg.createTerm', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const c = code(b.code); const name = clean(b.name, 60);
  if (c.length < 2 || name.length < 2) return bad(res, 400, 'A term needs a code and a name.');
  if (!isDay(b.startDate) || !isDay(b.endDate) || b.endDate <= b.startDate) return bad(res, 400, 'Give a start date and a later end date.');
  if (b.addDropUntil && (!isDay(b.addDropUntil) || b.addDropUntil < b.startDate || b.addDropUntil > b.endDate)) return bad(res, 400, 'The add and drop deadline must fall inside the term.');
  try { const t = await RegTerm.create({ schoolId, code: c, name, startDate: b.startDate, endDate: b.endDate, addDropUntil: b.addDropUntil || '' }); res.status(201).json(termShape(t)); } catch (e) { if (S.isDup(e)) return bad(res, 409, `${c} is already a term.`); throw e; }
});
exports.updateTerm = wrap('reg.updateTerm', async (req, res) => {
  const schoolId = sid(req); const t = await RegTerm.findOne({ _id: oid(req.params.id), schoolId }); if (!t) return bad(res, 404, 'Term not found.');
  if (['published', 'closed'].includes(t.status)) return bad(res, 409, 'A term whose grades are out can no longer be edited.');
  const b = req.body || {}; const set = {}; const start = b.startDate || t.startDate; const end = b.endDate || t.endDate; const ad = b.addDropUntil !== undefined ? b.addDropUntil : t.addDropUntil;
  if (b.name !== undefined) { const n = clean(b.name, 60); if (n.length < 2) return bad(res, 400, 'A term needs a name.'); set.name = n; }
  if (b.startDate !== undefined || b.endDate !== undefined || b.addDropUntil !== undefined) {
    if (!isDay(start) || !isDay(end) || end <= start) return bad(res, 400, 'Give a start date and a later end date.');
    if (ad && (!isDay(ad) || ad < start || ad > end)) return bad(res, 400, 'The add and drop deadline must fall inside the term.');
    Object.assign(set, { startDate: start, endDate: end, addDropUntil: ad || '' });
  }
  if (Object.keys(set).length) await RegTerm.updateOne({ _id: t._id, schoolId }, { $set: set }); res.json(termShape(await RegTerm.findOne({ _id: t._id, schoolId })));
});
const ORDER = ['planned', 'open', 'grading', 'published', 'closed'];
exports.termStep = wrap('reg.termStep', async (req, res) => {
  const schoolId = sid(req); const t = await RegTerm.findOne({ _id: oid(req.params.id), schoolId }); if (!t) return bad(res, 404, 'Term not found.');
  const step = req.params.step; const want = { open: 'open', grading: 'grading', publish: 'published', close: 'closed' }[step]; if (!want) return bad(res, 400, 'Unknown step.');
  if (ORDER.indexOf(want) !== ORDER.indexOf(t.status) + 1) return bad(res, 409, `This term is ${t.status}; it cannot go to ${want} from there.`);
  if (want === 'open') { const others = await RegTerm.countDocuments({ schoolId, status: 'open', _id: { $ne: t._id } }); if (others && !req.body?.allowParallel) return bad(res, 409, 'Another term is already open. Pass allowParallel to run two at once.'); }
  if (want === 'published') return require('./regGradeController').publishTerm(req, res, t);
  const r = await RegTerm.updateOne({ _id: t._id, schoolId, status: t.status }, { $set: { status: want } }); if (!r.matchedCount) return bad(res, 409, 'Someone else just moved this term.');
  if (want === 'open') await S.notifyAdmins(schoolId, 'Term open', `${t.name} is open for registration.`, oid(req.user.userId));
  await audit(req, { action: `registrar.term.${step}`, entityType: 'RegTerm', entityId: String(t._id), schoolId, detail: { code: t.code } }); res.json({ ok: true, status: want });
});

// ---------- sections ----------
const secShape = (s) => ({ _id: s._id, termId: s.termId, courseId: s.courseId, courseCode: s.courseCode, courseTitle: s.courseTitle, credits: s.credits, section: s.section, teacherId: s.teacherId || null, teacherName: s.teacherName, capacity: s.capacity, enrolled: s.enrolled, seatsLeft: Math.max(0, s.capacity - s.enrolled), schedule: s.schedule, room: s.room, status: s.status, gradesSubmittedAt: s.gradesSubmittedAt || null });
exports.sections = wrap('reg.sections', async (req, res) => {
  const schoolId = sid(req); const f = { schoolId }; if (req.query.termId) f.termId = oid(req.query.termId); if (req.query.courseId) f.courseId = oid(req.query.courseId);
  const rows = await RegSection.find(f).sort({ courseCode: 1, section: 1 }); res.json({ sections: rows.map(secShape) });
});
exports.createSection = wrap('reg.createSection', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {};
  const [term, course] = await Promise.all([RegTerm.findOne({ _id: oid(b.termId), schoolId }), RegCourse.findOne({ _id: oid(b.courseId), schoolId })]);
  if (!term) return bad(res, 404, 'Term not found.'); if (!course) return bad(res, 404, 'Course not found.');
  if (!['planned', 'open'].includes(term.status)) return bad(res, 409, 'Sections can only be added before grading starts.');
  if (course.status === 'retired') return bad(res, 409, `${course.code} is retired.`);
  const cap = num(b.capacity, 40); if (!(cap >= 1 && cap <= 1000)) return bad(res, 400, 'Capacity must be between 1 and 1000.');
  let t = null; if (b.teacherId) { t = await Teacher.findOne({ _id: oid(b.teacherId), schoolId }).select('name'); if (!t) return bad(res, 404, 'Instructor not found in this school.'); }
  try {
    const s = await RegSection.create({ schoolId, termId: term._id, courseId: course._id, courseCode: course.code, courseTitle: course.title, credits: course.credits, section: code(b.section || 'A', 6) || 'A', teacherId: t?._id, teacherName: t?.name || '', capacity: cap, schedule: clean(b.schedule, 80), room: clean(b.room, 40) });
    await audit(req, { action: 'registrar.section.create', entityType: 'RegSection', entityId: String(s._id), schoolId, detail: { course: course.code, term: term.code } }); res.status(201).json(secShape(s));
  } catch (e) { if (S.isDup(e)) return bad(res, 409, `${course.code} section ${b.section || 'A'} already exists in ${term.code}.`); throw e; }
});
exports.updateSection = wrap('reg.updateSection', async (req, res) => {
  const schoolId = sid(req); const s = await RegSection.findOne({ _id: oid(req.params.id), schoolId }); if (!s) return bad(res, 404, 'Section not found.');
  const term = await RegTerm.findOne({ _id: s.termId, schoolId }); if (['published', 'closed'].includes(term?.status)) return bad(res, 409, 'This term is finished.');
  const b = req.body || {}; const set = {};
  if (b.capacity !== undefined) { const c = num(b.capacity, NaN); if (!(c >= 1 && c <= 1000)) return bad(res, 400, 'Capacity must be between 1 and 1000.'); if (c < s.enrolled) return bad(res, 409, `${s.enrolled} students are already in; capacity cannot go below that.`); set.capacity = c; }
  if (b.teacherId !== undefined) { if (b.teacherId) { const t = await Teacher.findOne({ _id: oid(b.teacherId), schoolId }).select('name'); if (!t) return bad(res, 404, 'Instructor not found in this school.'); set.teacherId = t._id; set.teacherName = t.name; } else { set.teacherName = ''; await RegSection.updateOne({ _id: s._id, schoolId }, { $unset: { teacherId: 1 } }); } }
  for (const k of ['schedule', 'room']) if (b[k] !== undefined) set[k] = clean(b[k], 80);
  if (Object.keys(set).length) await RegSection.updateOne({ _id: s._id, schoolId }, { $set: set }); res.json(secShape(await RegSection.findOne({ _id: s._id, schoolId })));
});
exports.cancelSection = wrap('reg.cancelSection', async (req, res) => {
  const schoolId = sid(req); const s = await RegSection.findOne({ _id: oid(req.params.id), schoolId }); if (!s) return bad(res, 404, 'Section not found.');
  const term = await RegTerm.findOne({ _id: s.termId, schoolId }); if (!['planned', 'open'].includes(term?.status)) return bad(res, 409, 'A section can only be cancelled before grading starts.');
  if (s.status === 'cancelled') return res.json({ ok: true });
  const reason = clean(req.body?.reason, 200); if (!reason) return bad(res, 400, 'Say why the section is cancelled.');
  await RegSection.updateOne({ _id: s._id, schoolId }, { $set: { status: 'cancelled', enrolled: 0 } });
  const live = await RegEnrollment.find({ schoolId, sectionId: s._id, status: 'enrolled' }).select('studentId');
  await RegEnrollment.updateMany({ schoolId, sectionId: s._id, status: 'enrolled' }, { $set: { status: 'dropped', droppedAt: new Date() }, $unset: { activeKey: 1 } });
  for (const e of live) S.notifyStudent(schoolId, e.studentId, 'Section cancelled', `${s.courseCode} section ${s.section} was cancelled: ${reason}. Please register for another section.`, '/student#/record');
  await audit(req, { action: 'registrar.section.cancel', entityType: 'RegSection', entityId: String(s._id), schoolId, detail: { course: s.courseCode, dropped: live.length, reason } }); res.json({ ok: true, dropped: live.length });
});
exports.teachers = wrap('reg.teachers', async (req, res) => { const rows = await Teacher.find({ schoolId: sid(req) }).select('name email').sort({ name: 1 }); res.json({ teachers: rows.map((t) => ({ _id: t._id, name: t.name })) }); });
