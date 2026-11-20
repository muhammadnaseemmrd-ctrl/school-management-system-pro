// Training catalogue (PRD E17): settings and policy versions, instructors, courses with an approved publish, cohorts with live sessions,
// bundles and coupons. Learners never see a draft: they see the frozen `live` copy that a second administrator approved.
const S = require('../utils/training/service');
const { E, oid, sid, who, bad, wrap, clean, plain } = S;
const { audit } = require('../utils/audit');
const TrBundle = require('../models/TrBundle');
const TrOrder = S.TrOrder; const TrEntitlement = S.TrEntitlement; const TrLearner = S.TrLearner;
const TrSubmission = require('../models/TrSubmission');
const TrPost = require('../models/TrPost');
const TrCredential = require('../models/TrCredential');
const TrSponsorship = require('../models/TrSponsorship');
const TrSlot = require('../models/TrSlot');

const A = (req, action, id, detail = '', type = 'training') => audit(req, { action, entityType: type, entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const money = (n) => Math.max(0, E.int(n));

/* ───────── overview ───────── */
exports.overview = wrap('tr.overview', async (req, res) => {
  const schoolId = sid(req); const st = await S.getSettings(schoolId); await S.sweep(schoolId).catch(() => {});
  const c = (M, q) => M.countDocuments({ schoolId, ...q });
  const [courses, published, openCohorts, learners, activeEnt, pendingOrders, subs, ready, held, reported, unpaidSp, creds] = await Promise.all([
    c(S.TrCourse, {}), c(S.TrCourse, { status: 'published' }), c(S.TrCohort, { status: { $in: ['open', 'running'] } }), c(TrLearner, {}), c(TrEntitlement, { status: 'active' }),
    c(TrOrder, { status: { $in: ['pending', 'part_paid'] } }), c(TrSubmission, { status: 'submitted' }), c(TrEntitlement, { completion: 'ready' }), c(TrPost, { status: 'held' }), c(TrPost, { status: 'visible', reportCount: { $gt: 0 } }), c(TrSponsorship, { status: 'invoiced' }), c(TrCredential, { status: 'valid' }),
  ]);
  const orders = await TrOrder.find({ schoolId, status: { $in: ['pending', 'part_paid'] } }).select('installments orderNo learnerId title createdAt').limit(500);
  const proofs = []; let overdue = 0; const now = Date.now();
  for (const o of orders) for (const i of o.installments || []) { if (i.status === 'proof') proofs.push({ orderId: o._id, orderNo: o.orderNo, title: o.title, no: i.no, amount: i.amount, at: i.proof?.at || o.createdAt }); if (i.status === 'due' && new Date(i.due).getTime() + st.graceDays * E.DAY < now) overdue += 1; }
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const paidRows = await TrOrder.find({ schoolId, 'installments.status': 'paid' }).select('installments refunded net total').limit(5000);
  let collected = 0; for (const o of paidRows) for (const i of o.installments) if (i.status === 'paid' && i.paidAt >= monthStart) collected += i.amount;
  res.json({ soleAdmin: await S.soleAdmin(schoolId), settings: { currency: st.currency, storefront: st.storefront }, counts: { courses, published, openCohorts, learners, activeEnt, pendingOrders, submissionsWaiting: subs, completionsReady: ready, postsHeld: held, postsReported: reported, sponsorshipsUnpaid: unpaidSp, credentials: creds, proofsWaiting: proofs.length, instalmentsOverdue: overdue }, proofs: proofs.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 10), collectedThisMonth: collected });
});

/* ───────── settings and policy ───────── */
exports.settings = wrap('tr.settings', async (req, res) => { res.json(await S.getSettings(sid(req))); });
exports.saveSettings = wrap('tr.saveSettings', async (req, res) => {
  const schoolId = sid(req); const cur = await S.getSettings(schoolId); const b = req.body || {}; const next = { ...cur };
  if (b.currency !== undefined) next.currency = clean(b.currency, 5).toUpperCase() || 'PKR';
  if (b.paymentInstructions !== undefined) next.paymentInstructions = clean(b.paymentInstructions, 1000);
  if (b.graceDays !== undefined) next.graceDays = Math.min(60, Math.max(0, E.int(b.graceDays, 7)));
  if (b.holdDays !== undefined) next.holdDays = Math.min(60, Math.max(1, E.int(b.holdDays, 7)));
  if (b.storefront) {
    const sf = { ...cur.storefront, headline: clean(b.storefront.headline ?? cur.storefront.headline, 140), about: clean(b.storefront.about ?? cur.storefront.about, 1500) };
    if (b.storefront.enabled !== undefined) { sf.enabled = !!b.storefront.enabled; if (sf.enabled && !(await S.TrCourse.countDocuments({ schoolId, status: 'published' }))) return bad(res, 422, 'Publish at least one course before opening the public page.'); }
    next.storefront = sf;
  }
  // tax and refund terms are policy: each change is a new numbered version with a reason, and orders keep the version they were made under
  const pol = { taxPercent: b.taxPercent !== undefined ? Math.min(100, Math.max(0, Number(b.taxPercent) || 0)) : cur.taxPercent, taxLabel: b.taxLabel !== undefined ? clean(b.taxLabel, 40) : cur.taxLabel, refundDays: b.refundDays !== undefined ? Math.min(365, Math.max(0, E.int(b.refundDays, 14))) : cur.refundDays, jurisdiction: b.jurisdiction !== undefined ? clean(b.jurisdiction, 300) : cur.jurisdiction };
  const changed = ['taxPercent', 'taxLabel', 'refundDays', 'jurisdiction'].some((k) => pol[k] !== cur[k]);
  if (changed) {
    const reason = clean(b.reason, 300); if (reason.length < 10) return bad(res, 422, 'Say why the tax or refund terms are changing (at least 10 characters). It is kept with the new version.');
    const version = Math.max(0, ...cur.policies.map((p) => p.version)) + 1;
    next.policies = [...cur.policies, { version, ...pol, effectiveFrom: new Date(), byName: req.actorName || '', note: reason }]; next.policyVersion = version; Object.assign(next, pol);
  }
  await S.putSettings(schoolId, next); await A(req, 'training.settings', '', changed ? `policy version ${next.policyVersion}` : 'settings');
  res.json(next);
});

/* ───────── instructors ───────── */
exports.instructors = wrap('tr.instructors', async (req, res) => {
  const schoolId = sid(req); const rows = await S.TrInstructor.find({ schoolId }).sort({ name: 1 });
  const used = await S.TrCourse.find({ schoolId, instructorIds: { $in: rows.map((r) => r._id) } }).select('title instructorIds');
  res.json({ instructors: rows.map((r) => ({ ...plain(r), courses: used.filter((c) => c.instructorIds.map(String).includes(String(r._id))).map((c) => c.title) })) });
});
exports.createInstructor = wrap('tr.createInstructor', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; let name = clean(b.name, 120);
  let teacher = null; if (b.teacherId) { teacher = await S.Teacher.findOne({ _id: oid(b.teacherId), schoolId }).select('name email'); if (!teacher) return bad(res, 404, 'That teacher is not in your school.'); if (await S.TrInstructor.findOne({ schoolId, teacherId: teacher._id })) return bad(res, 409, 'That teacher is already an instructor.'); }
  name = name || teacher?.name || ''; if (!name) return bad(res, 400, 'Give the instructor a name.');
  const row = await S.TrInstructor.create({ schoolId, teacherId: teacher?._id || null, name, email: clean(b.email || teacher?.email, 160), bio: clean(b.bio, 800), credentials: clean(b.credentials, 800) });
  await A(req, 'training.instructor.create', row._id, row.name); res.status(201).json(row);
});
exports.updateInstructor = wrap('tr.updateInstructor', async (req, res) => {
  const schoolId = sid(req); const row = await S.TrInstructor.findOne({ _id: oid(req.params.id), schoolId }); if (!row) return bad(res, 404, 'Instructor not found.');
  const b = req.body || {}; const set = {};
  for (const [k, n] of [['name', 120], ['email', 160], ['bio', 800], ['credentials', 800]]) if (b[k] !== undefined) set[k] = clean(b[k], n);
  // changing what they claim to be qualified in means looking again
  if ((set.credentials !== undefined && set.credentials !== row.credentials) && row.status === 'verified') { set.status = 'pending'; set.verifiedAt = null; set.verifiedBy = ''; }
  await S.TrInstructor.updateOne({ _id: row._id }, { $set: set }); res.json({ ok: true, reverify: set.status === 'pending' });
});
exports.verifyInstructor = wrap('tr.verifyInstructor', async (req, res) => {
  const schoolId = sid(req); const row = await S.TrInstructor.findOne({ _id: oid(req.params.id), schoolId }); if (!row) return bad(res, 404, 'Instructor not found.');
  const decision = String(req.body?.decision || ''); const evidence = clean(req.body?.evidence, 500); const note = clean(req.body?.note, 300);
  if (!['verify', 'suspend', 'reset'].includes(decision)) return bad(res, 400, 'Choose verify, suspend or reset.');
  if (decision === 'verify') { if (evidence.length < 10) return bad(res, 422, 'Write what you checked (certificates, experience, references) before verifying.'); if (!row.credentials) return bad(res, 422, 'This instructor has not listed any credentials yet.'); }
  if (decision === 'suspend' && note.length < 10) return bad(res, 422, 'Give a reason for suspending (at least 10 characters).');
  const set = decision === 'verify' ? { status: 'verified', verifiedBy: req.actorName || '', verifiedAt: new Date(), evidence, note } : decision === 'suspend' ? { status: 'suspended', note } : { status: 'pending', verifiedAt: null, verifiedBy: '' };
  await S.TrInstructor.updateOne({ _id: row._id }, { $set: set }); await A(req, `training.instructor.${decision}`, row._id, row.name); res.json({ ok: true, status: set.status });
});
exports.teachers = wrap('tr.teachers', async (req, res) => { res.json({ teachers: (await S.Teacher.find({ schoolId: sid(req) }).select('name email').sort({ name: 1 }).limit(300)).map((t) => ({ _id: t._id, name: t.name, email: t.email })) }); });

/* ───────── courses ───────── */
const slugFree = async (schoolId, base) => { let s = base || 'course'; for (let i = 0; i < 40; i += 1) { const cand = i ? `${s}-${i + 1}` : s; if (!(await S.TrCourse.findOne({ schoolId, slug: cand }).select('_id')) && !(await TrBundle.findOne({ schoolId, slug: cand }).select('_id'))) return cand; } return `${s}-${Date.now().toString(36)}`; };
const brief = (c, scope) => ({ _id: c._id, slug: c.slug, title: c.title, status: c.status, price: c.price, version: c.version, instructorIds: c.instructorIds, lessons: E.flat(c.draft?.modules || []).length, pendingReview: c.decision?.state === 'submitted', rejected: c.decision?.state === 'rejected', unpublished: !!c.live && E.sha(E.canon(c.draft?.modules || [])) !== c.live.hash, updatedAt: c.updatedAt, mine: scope ? scope.admin || scope.courses.has(String(c._id)) : true });
exports.courses = wrap('tr.courses', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId };
  if (req.query.status) q.status = String(req.query.status);
  if (!scope.admin) q._id = { $in: [...scope.courses].map(oid) };
  const rows = await S.TrCourse.find(q).select('slug title status price version instructorIds draft live decision updatedAt').sort({ updatedAt: -1 }).limit(300);
  const ids = rows.map((r) => r._id);
  const [ents, cohorts] = await Promise.all([TrEntitlement.find({ schoolId, courseId: { $in: ids }, status: 'active' }).select('courseId'), S.TrCohort.find({ schoolId, courseId: { $in: ids }, status: { $in: ['open', 'running'] } }).select('courseId')]);
  const cnt = (list, id) => list.filter((x) => String(x.courseId) === String(id)).length;
  res.json({ courses: rows.map((c) => ({ ...brief(c, scope), learners: cnt(ents, c._id), openCohorts: cnt(cohorts, c._id) })) });
});
async function courseFor(req, res, { write = false, content = false } = {}) {
  const schoolId = sid(req); const c = await S.TrCourse.findOne({ _id: oid(req.params.id), schoolId }); if (!c) { bad(res, 404, 'Course not found.'); return null; }
  const scope = await S.scopeOf(req);
  if (!scope.admin && !scope.courses.has(String(c._id))) { bad(res, 403, 'You are not an instructor on this course.'); return null; }
  if (write && !scope.admin && !content) { bad(res, 403, 'Only an administrator can change this.'); return null; }
  return { c, scope };
}
const detailSet = async (schoolId, b, res) => {
  const set = {};
  if (b.title !== undefined) { set.title = clean(b.title, 140); if (!set.title) { bad(res, 400, 'The course needs a title.'); return null; } }
  for (const [k, n] of [['summary', 500], ['level', 30], ['language', 10]]) if (b[k] !== undefined) set[k] = clean(b[k], n);
  if (b.price !== undefined) set.price = money(b.price);
  if (b.access) set.access = { days: Math.min(3650, money(b.access.days)) };
  if (b.refundDays !== undefined) set.refundDays = b.refundDays === null || b.refundDays === '' ? null : Math.min(365, money(b.refundDays));
  if (b.installments) set.installments = { max: Math.min(12, Math.max(1, E.int(b.installments.max, 1))), accessAfter: ['first', 'full'].includes(b.installments.accessAfter) ? b.installments.accessAfter : 'first' };
  if (b.discussion !== undefined) { if (!['open', 'moderated', 'off'].includes(b.discussion)) { bad(res, 400, 'Discussion must be open, moderated or off.'); return null; } set.discussion = b.discussion; }
  if (b.landing) set.landing = { headline: clean(b.landing.headline, 140), outcomes: (b.landing.outcomes || []).slice(0, 12).map((x) => clean(x, 200)).filter(Boolean), requirements: (b.landing.requirements || []).slice(0, 12).map((x) => clean(x, 200)).filter(Boolean), audience: clean(b.landing.audience, 300), faq: (b.landing.faq || []).slice(0, 10).map((f) => ({ q: clean(f.q, 200), a: clean(f.a, 600) })).filter((f) => f.q && f.a) };
  if (b.skills) set.skills = (b.skills || []).slice(0, 12).map((s) => ({ code: clean(s.code, 30).toUpperCase(), name: clean(s.name, 80), level: clean(s.level, 20) })).filter((s) => s.code || s.name);
  if (b.instructorIds) { const ids = [...new Set((b.instructorIds || []).map(String))].map(oid).filter(Boolean); const ok = await S.TrInstructor.find({ schoolId, _id: { $in: ids } }).select('_id'); if (ok.length !== ids.length) { bad(res, 404, 'One of those instructors is not in your school.'); return null; } set.instructorIds = ids; }
  return set;
};
exports.createCourse = wrap('tr.createCourse', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const title = clean(b.title, 140); if (!title) return bad(res, 400, 'Give the course a title.');
  const set = await detailSet(schoolId, b, res); if (!set) return;
  const c = await S.TrCourse.create({ ...set, schoolId, title, slug: await slugFree(schoolId, E.slugOf(b.slug || title)), authorName: req.actorName || '', authorId: oid(req.user.userId), draft: { modules: [] }, history: [{ at: new Date(), byName: req.actorName || '', change: 'Created' }] });
  await A(req, 'training.course.create', c._id, c.title); res.status(201).json(c);
});
exports.course = wrap('tr.course', async (req, res) => {
  const r = await courseFor(req, res); if (!r) return; const { c } = r; const schoolId = sid(req);
  const ins = await S.TrInstructor.find({ schoolId, _id: { $in: c.instructorIds } });
  res.json({ course: plain(c), instructors: ins, checks: E.courseChecks(c, ins), unpublished: !!c.live && E.sha(E.canon(c.draft?.modules || [])) !== c.live.hash });
});
exports.updateCourse = wrap('tr.updateCourse', async (req, res) => {
  const b = req.body || {}; const wantsContent = b.modules !== undefined; const wantsDetail = Object.keys(b).some((k) => k !== 'modules');
  const r = await courseFor(req, res, { write: wantsDetail, content: wantsContent }); if (!r) return; const { c } = r; const schoolId = sid(req);
  if (c.status === 'archived') return bad(res, 409, 'This course is archived. Restore it before editing.');
  const set = wantsDetail ? await detailSet(schoolId, b, res) : {}; if (!set) return;
  if (wantsContent) { const n = E.normalizeContent(b.modules, c.draft?.modules); if (n.errors.length) return bad(res, 422, n.errors[0], { errors: n.errors }); set.draft = { modules: n.modules }; }
  if (c.status === 'review') { set.status = 'draft'; set.decision = null; }       // an edit while waiting for review withdraws it
  else if (c.decision?.state === 'submitted') set.decision = null;
  set.history = [...(c.history || []).slice(-40), { at: new Date(), byName: req.actorName || '', change: wantsContent && wantsDetail ? 'Edited details and content' : wantsContent ? 'Edited content' : 'Edited details' }];
  await S.TrCourse.updateOne({ _id: c._id }, { $set: set }); res.json({ ok: true, ...(set.draft ? { lessons: E.flat(set.draft.modules).length } : {}) });
});
exports.courseChecks = wrap('tr.courseChecks', async (req, res) => { const r = await courseFor(req, res); if (!r) return; const ins = await S.TrInstructor.find({ schoolId: sid(req), _id: { $in: r.c.instructorIds } }); res.json({ checks: E.courseChecks(r.c, ins) }); });
exports.submitCourse = wrap('tr.submitCourse', async (req, res) => {
  const r = await courseFor(req, res, { write: true, content: true }); if (!r) return; const { c } = r; const schoolId = sid(req);
  if (c.status === 'archived') return bad(res, 409, 'This course is archived.');
  const ins = await S.TrInstructor.find({ schoolId, _id: { $in: c.instructorIds } }); const blocks = E.courseChecks(c, ins).filter((x) => x.level === 'block');
  if (blocks.length) return bad(res, 422, blocks[0].text, { blocks: blocks.map((x) => x.text) });
  if (c.live && E.sha(E.canon(c.draft?.modules || [])) === c.live.hash && !req.body?.detailsOnly) return bad(res, 409, 'Nothing has changed since the live version.');
  const set = { decision: { state: 'submitted', byId: oid(req.user.userId), byName: req.actorName || '', at: new Date(), note: clean(req.body?.note, 300) }, submittedBy: oid(req.user.userId) }; if (c.status !== 'published') set.status = 'review';
  await S.TrCourse.updateOne({ _id: c._id }, { $set: set }); await S.notifyAdmins(schoolId, 'Course waiting for review', `"${c.title}" was sent for approval.`); await A(req, 'training.course.submit', c._id, c.title); res.json({ ok: true });
});
exports.decideCourse = wrap('tr.decideCourse', async (req, res) => {
  const r = await courseFor(req, res, { write: true }); if (!r) return; const { c } = r; const schoolId = sid(req);
  if (c.decision?.state !== 'submitted') return bad(res, 409, 'This course is not waiting for a decision.');
  const approve = req.body?.decision === 'approve'; const note = clean(req.body?.note, 400);
  const sole = await S.soleAdmin(schoolId);
  if (String(c.decision.byId) === String(req.user.userId) && !sole) return bad(res, 403, 'A different administrator must approve what you sent for review.');
  if (!approve) { if (note.length < 10) return bad(res, 422, 'Say what needs fixing (at least 10 characters).'); await S.TrCourse.updateOne({ _id: c._id }, { $set: { status: c.live ? 'published' : 'draft', decision: { state: 'rejected', byName: req.actorName || '', at: new Date(), note } } }); await A(req, 'training.course.reject', c._id, note); return res.json({ ok: true, status: 'rejected' }); }
  const ins = await S.TrInstructor.find({ schoolId, _id: { $in: c.instructorIds } }); const blocks = E.courseChecks(c, ins).filter((x) => x.level === 'block'); if (blocks.length) return bad(res, 422, blocks[0].text);
  const version = (c.version || 0) + 1; const modules = c.draft.modules; const hash = E.sha(E.canon(modules));
  const live = { version, modules, skills: c.skills || [], title: c.title, publishedAt: new Date(), hash, approvedBy: req.actorName || '', sole };
  const done = await S.TrCourse.updateOne({ _id: c._id, 'decision.state': 'submitted' }, { $set: { live, version, status: 'published', decision: null, history: [...(c.history || []).slice(-40), { at: new Date(), byName: req.actorName || '', change: `Published version ${version}${sole ? ' (sole administrator)' : ''}` }] } });
  if (!done.matchedCount) return bad(res, 409, 'This course was already decided.');
  await A(req, 'training.course.publish', c._id, `v${version}`); res.json({ ok: true, version, sole });
});
exports.archiveCourse = wrap('tr.archiveCourse', async (req, res) => {
  const r = await courseFor(req, res, { write: true }); if (!r) return; const { c } = r; const schoolId = sid(req);
  const restore = req.body?.restore === true;
  if (restore) { await S.TrCourse.updateOne({ _id: c._id }, { $set: { status: c.live ? 'published' : 'draft' } }); return res.json({ ok: true }); }
  const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Say why you are archiving it (at least 10 characters). Learners who already have access keep it.');
  await S.TrCourse.updateOne({ _id: c._id }, { $set: { status: 'archived' } }); await S.TrCohort.updateMany({ schoolId, courseId: c._id, status: 'open' }, { $set: { status: 'closed' } });
  await A(req, 'training.course.archive', c._id, reason); res.json({ ok: true });
});

/* ───────── cohorts ───────── */
const cohortSet = async (schoolId, b, course, res) => {
  const set = {}; const d = (v) => (v ? new Date(v) : null);
  if (b.name !== undefined) { set.name = clean(b.name, 100); if (!set.name) { bad(res, 400, 'Give the cohort a name.'); return null; } }
  if (b.mode !== undefined) set.mode = b.mode === 'self' ? 'self' : 'led';
  for (const k of ['startsAt', 'endsAt', 'enrolUntil']) if (b[k] !== undefined) { const v = d(b[k]); if (v && Number.isNaN(v.getTime())) { bad(res, 400, `${k} is not a valid date.`); return null; } set[k] = v; }
  if (b.capacity !== undefined) set.capacity = Math.min(5000, money(b.capacity));
  if (b.timezone !== undefined) set.timezone = clean(b.timezone, 40) || 'Asia/Karachi';
  if (b.minAttendance !== undefined) set.minAttendance = Math.min(100, money(b.minAttendance));
  if (b.instructorId !== undefined) { if (b.instructorId) { if (!(course.instructorIds || []).map(String).includes(String(b.instructorId))) { bad(res, 422, 'Pick one of the instructors named on the course.'); return null; } set.instructorId = oid(b.instructorId); } else set.instructorId = null; }
  return set;
};
exports.cohorts = wrap('tr.cohorts', async (req, res) => {
  const schoolId = sid(req); const scope = await S.scopeOf(req); const q = { schoolId };
  if (req.query.courseId) q.courseId = oid(req.query.courseId); if (req.query.status) q.status = String(req.query.status);
  if (!scope.admin) q.courseId = { $in: [...scope.courses].map(oid) };
  const rows = await S.TrCohort.find(q).sort({ startsAt: -1 }).limit(300); const cs = await S.TrCourse.find({ schoolId, _id: { $in: rows.map((r) => r.courseId) } }).select('title'); const cm = new Map(cs.map((c) => [String(c._id), c.title]));
  res.json({ cohorts: rows.map((c) => ({ ...plain(c), courseTitle: cm.get(String(c.courseId)) || '', sessions: (c.sessions || []).length, sessionList: undefined })) });
});
exports.cohort = wrap('tr.cohort', async (req, res) => {
  const schoolId = sid(req); const co = await S.TrCohort.findOne({ _id: oid(req.params.id), schoolId }); if (!co) return bad(res, 404, 'Cohort not found.');
  const scope = await S.scopeOf(req); if (!S.inScope(scope, co.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  const ents = await TrEntitlement.find({ schoolId, cohortId: co._id, status: { $in: ['active', 'paused'] } }); const ls = await TrLearner.find({ schoolId, _id: { $in: ents.map((e) => e.learnerId) } }).select('name email');
  const lm = new Map(ls.map((l) => [String(l._id), l]));
  res.json({ cohort: plain(co), roster: ents.map((e) => ({ learnerId: e.learnerId, name: lm.get(String(e.learnerId))?.name || '', email: lm.get(String(e.learnerId))?.email || '', status: e.status, completion: e.completion })).sort((a, b) => a.name.localeCompare(b.name)) });
});
exports.createCohort = wrap('tr.createCohort', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const course = await S.TrCourse.findOne({ _id: oid(b.courseId), schoolId }); if (!course) return bad(res, 404, 'Course not found.');
  if (course.status !== 'published') return bad(res, 422, 'A cohort can run only for a published course.');
  const set = await cohortSet(schoolId, b, course, res); if (!set) return; if (!set.name) return bad(res, 400, 'Give the cohort a name.');
  if (set.startsAt && set.endsAt && set.endsAt <= set.startsAt) return bad(res, 422, 'The end must be after the start.');
  const co = await S.TrCohort.create({ ...set, schoolId, courseId: course._id, status: b.planned ? 'planned' : 'open', sessions: [] }); await A(req, 'training.cohort.create', co._id, co.name); res.status(201).json(co);
});
exports.updateCohort = wrap('tr.updateCohort', async (req, res) => {
  const schoolId = sid(req); const co = await S.TrCohort.findOne({ _id: oid(req.params.id), schoolId }); if (!co) return bad(res, 404, 'Cohort not found.');
  const course = await S.TrCourse.findOne({ _id: co.courseId, schoolId }); const set = await cohortSet(schoolId, req.body || {}, course, res); if (!set) return;
  if (set.capacity !== undefined && set.capacity > 0 && set.capacity < co.seatsTaken) return bad(res, 422, `${co.seatsTaken} seats are already taken. Choose a capacity of at least that.`);
  const s = set.startsAt !== undefined ? set.startsAt : co.startsAt; const e = set.endsAt !== undefined ? set.endsAt : co.endsAt; if (s && e && e <= s) return bad(res, 422, 'The end must be after the start.');
  await S.TrCohort.updateOne({ _id: co._id }, { $set: set }); res.json({ ok: true });
});
exports.cohortStatus = wrap('tr.cohortStatus', async (req, res) => {
  const schoolId = sid(req); const co = await S.TrCohort.findOne({ _id: oid(req.params.id), schoolId }); if (!co) return bad(res, 404, 'Cohort not found.');
  const to = String(req.body?.status || ''); if (!['open', 'running', 'closed', 'cancelled'].includes(to)) return bad(res, 400, 'Choose open, running, closed or cancelled.');
  if (to === 'cancelled') { const reason = clean(req.body?.reason, 300); if (reason.length < 10) return bad(res, 422, 'Say why you are cancelling (at least 10 characters).'); const paid = await TrEntitlement.countDocuments({ schoolId, cohortId: co._id, status: { $in: ['active', 'paused'] } }); if (paid) return bad(res, 409, `${paid} learner(s) have a seat. Move or refund them first.`); }
  await S.TrCohort.updateOne({ _id: co._id }, { $set: { status: to } }); await A(req, 'training.cohort.status', co._id, to); res.json({ ok: true });
});
const sessionOf = (b, old = {}) => ({ id: old.id || E.id(), title: clean(b.title ?? old.title, 120), startsAt: b.startsAt !== undefined ? new Date(b.startsAt) : old.startsAt, minutes: Math.min(600, Math.max(5, E.int(b.minutes ?? old.minutes, 60))), mode: (b.mode ?? old.mode) === 'venue' ? 'venue' : 'online', link: b.link !== undefined ? clean(b.link, 400) : old.link || '', venue: clean(b.venue ?? old.venue, 200), attendance: old.attendance || {}, marked: !!old.marked, reminded: !!old.reminded });
exports.saveSession = wrap('tr.saveSession', async (req, res) => {
  const schoolId = sid(req); const co = await S.TrCohort.findOne({ _id: oid(req.params.id), schoolId }); if (!co) return bad(res, 404, 'Cohort not found.');
  const scope = await S.scopeOf(req); if (!S.inScope(scope, co.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  if (co.mode !== 'led') return bad(res, 422, 'Self-paced cohorts have no live sessions.');
  const b = req.body || {}; const sess = [...(co.sessions || [])]; const at = req.params.sid ? sess.findIndex((s) => s.id === req.params.sid) : -1;
  if (req.params.sid && at < 0) return bad(res, 404, 'Session not found.');
  const row = sessionOf(b, at >= 0 ? sess[at] : {}); if (!row.title) return bad(res, 400, 'Give the session a title.');
  if (!row.startsAt || Number.isNaN(new Date(row.startsAt).getTime())) return bad(res, 400, 'Give the session a start time.');
  if (at >= 0 && sess[at].marked && String(new Date(sess[at].startsAt)) !== String(new Date(row.startsAt))) return bad(res, 409, 'Attendance is already recorded for this session, so its time cannot move.');
  if (b.link) { const u = E.httpsUrl(b.link); if (u === null) return bad(res, 422, 'The meeting link must start with https://'); row.link = u; }
  if (row.mode === 'online' && !row.link) return bad(res, 422, 'An online session needs a meeting link.'); if (row.mode === 'venue' && !row.venue) return bad(res, 422, 'A session at a venue needs the venue.');
  const clash = sess.find((s, i) => i !== at && Math.abs(new Date(s.startsAt) - new Date(row.startsAt)) < Math.max(s.minutes, row.minutes) * 60000); if (clash) return bad(res, 409, `This overlaps "${clash.title}".`);
  if (at >= 0) sess[at] = { ...row, reminded: String(new Date(sess[at].startsAt)) === String(new Date(row.startsAt)) ? sess[at].reminded : false }; else sess.push(row);
  sess.sort((a, b2) => new Date(a.startsAt) - new Date(b2.startsAt));
  await S.TrCohort.updateOne({ _id: co._id }, { $set: { sessions: sess } }); res.status(at >= 0 ? 200 : 201).json({ ok: true, id: row.id });
});
exports.removeSession = wrap('tr.removeSession', async (req, res) => {
  const schoolId = sid(req); const co = await S.TrCohort.findOne({ _id: oid(req.params.id), schoolId }); if (!co) return bad(res, 404, 'Cohort not found.');
  const scope = await S.scopeOf(req); if (!S.inScope(scope, co.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  const s = (co.sessions || []).find((x) => x.id === req.params.sid); if (!s) return bad(res, 404, 'Session not found.'); if (s.marked) return bad(res, 409, 'Attendance is already recorded, so this session stays on the record.');
  await S.TrCohort.updateOne({ _id: co._id }, { $set: { sessions: co.sessions.filter((x) => x.id !== s.id) } }); res.json({ ok: true });
});
exports.attendance = wrap('tr.attendance', async (req, res) => {
  const schoolId = sid(req); const co = await S.TrCohort.findOne({ _id: oid(req.params.id), schoolId }); if (!co) return bad(res, 404, 'Cohort not found.');
  const scope = await S.scopeOf(req); if (!S.inScope(scope, co.courseId)) return bad(res, 403, 'You are not an instructor on this course.');
  const at = (co.sessions || []).findIndex((s) => s.id === req.params.sid); if (at < 0) return bad(res, 404, 'Session not found.');
  if (new Date(co.sessions[at].startsAt) > new Date()) return bad(res, 409, 'This session has not started yet.');
  const ents = await TrEntitlement.find({ schoolId, cohortId: co._id, status: { $in: ['active', 'paused'] } }).select('learnerId'); const ok = new Set(ents.map((e) => String(e.learnerId)));
  const marks = {}; for (const [lid, v] of Object.entries(req.body?.marks || {})) { if (!ok.has(String(lid))) return bad(res, 422, 'One of those learners is not in this cohort.'); if (!['present', 'late', 'absent', 'excused'].includes(v)) return bad(res, 400, 'Each mark must be present, late, absent or excused.'); marks[lid] = v; }
  for (const l of ok) if (!marks[l]) marks[l] = 'absent';
  const sess = [...co.sessions]; sess[at] = { ...sess[at], attendance: marks, marked: true }; await S.TrCohort.updateOne({ _id: co._id }, { $set: { sessions: sess } });
  const L = require('../utils/training/learning'); for (const e of await TrEntitlement.find({ schoolId, cohortId: co._id, status: 'active' })) await L.refreshReadiness(schoolId, e).catch(() => {});
  await A(req, 'training.attendance', co._id, sess[at].title); res.json({ ok: true, marked: Object.keys(marks).length });
});

/* ───────── bundles ───────── */
exports.bundles = wrap('tr.bundles', async (req, res) => { const schoolId = sid(req); const rows = await TrBundle.find({ schoolId }).sort({ createdAt: -1 }).limit(200); const cs = await S.TrCourse.find({ schoolId, _id: { $in: rows.flatMap((r) => r.courseIds) } }).select('title status price'); const cm = new Map(cs.map((c) => [String(c._id), c])); res.json({ bundles: rows.map((b) => ({ ...plain(b), courses: b.courseIds.map((id) => ({ _id: id, title: cm.get(String(id))?.title || '', status: cm.get(String(id))?.status || '', price: cm.get(String(id))?.price || 0 })) })) }); });
const bundleSet = async (schoolId, b, res) => {
  const set = {}; if (b.title !== undefined) { set.title = clean(b.title, 140); if (!set.title) { bad(res, 400, 'Give the bundle a title.'); return null; } }
  if (b.summary !== undefined) set.summary = clean(b.summary, 400); if (b.ordered !== undefined) set.ordered = !!b.ordered; if (b.price !== undefined) set.price = money(b.price); if (b.accessDays !== undefined) set.accessDays = Math.min(3650, money(b.accessDays));
  if (b.courseIds) { const ids = [...new Set(b.courseIds.map(String))].map(oid).filter(Boolean).slice(0, 12); const ok = await S.TrCourse.find({ schoolId, _id: { $in: ids } }).select('_id'); if (ok.length !== ids.length) { bad(res, 404, 'One of those courses is not in your school.'); return null; } set.courseIds = ids; }
  return set;
};
exports.createBundle = wrap('tr.createBundle', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const set = await bundleSet(schoolId, b, res); if (!set) return; if (!set.title) return bad(res, 400, 'Give the bundle a title.');
  const row = await TrBundle.create({ ...set, schoolId, slug: await slugFree(schoolId, E.slugOf(set.title)) }); res.status(201).json(row);
});
exports.updateBundle = wrap('tr.updateBundle', async (req, res) => {
  const schoolId = sid(req); const row = await TrBundle.findOne({ _id: oid(req.params.id), schoolId }); if (!row) return bad(res, 404, 'Bundle not found.'); const set = await bundleSet(schoolId, req.body || {}, res); if (!set) return;
  if (req.body?.status) { const to = String(req.body.status); if (!['draft', 'published', 'archived'].includes(to)) return bad(res, 400, 'Choose draft, published or archived.');
    if (to === 'published') { const ids = set.courseIds || row.courseIds; if (ids.length < 2) return bad(res, 422, 'A bundle needs at least two courses.'); const cs = await S.TrCourse.find({ schoolId, _id: { $in: ids } }).select('status'); if (cs.some((c) => c.status !== 'published')) return bad(res, 422, 'Every course in the bundle must be published.'); }
    set.status = to; }
  await TrBundle.updateOne({ _id: row._id }, { $set: set }); res.json({ ok: true });
});

/* ───────── coupons ───────── */
exports.coupons = wrap('tr.coupons', async (req, res) => { res.json({ coupons: await S.TrCoupon.find({ schoolId: sid(req) }).sort({ createdAt: -1 }).limit(300) }); });
exports.createCoupon = wrap('tr.createCoupon', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const code = clean(b.code, 24).toUpperCase(); if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return bad(res, 400, 'A code is 3 to 24 letters, numbers, - or _.');
  const kind = b.kind === 'amount' ? 'amount' : 'percent'; const value = E.int(b.value); if (value < 1 || (kind === 'percent' && value > 100)) return bad(res, 400, kind === 'percent' ? 'A percentage is 1 to 100.' : 'An amount must be at least 1.');
  const ids = (b.courseIds || []).map(oid).filter(Boolean); if (ids.length) { const ok = await S.TrCourse.countDocuments({ schoolId, _id: { $in: ids } }); if (ok !== ids.length) return bad(res, 404, 'One of those courses is not in your school.'); }
  try { const row = await S.TrCoupon.create({ schoolId, code, kind, value, courseIds: ids, validFrom: b.validFrom ? new Date(b.validFrom) : null, validTo: b.validTo ? new Date(b.validTo) : null, maxUses: money(b.maxUses), oncePerLearner: b.oncePerLearner !== false, attribution: clean(b.attribution, 80), createdByName: req.actorName || '' }); await A(req, 'training.coupon.create', row._id, code); res.status(201).json(row); }
  catch (e) { if (S.isDup(e)) return bad(res, 409, 'That code already exists.'); throw e; }
});
exports.updateCoupon = wrap('tr.updateCoupon', async (req, res) => {
  const schoolId = sid(req); const row = await S.TrCoupon.findOne({ _id: oid(req.params.id), schoolId }); if (!row) return bad(res, 404, 'Coupon not found.'); const b = req.body || {}; const set = {};
  if (b.active !== undefined) set.active = !!b.active; if (b.validTo !== undefined) set.validTo = b.validTo ? new Date(b.validTo) : null; if (b.maxUses !== undefined) set.maxUses = Math.max(row.used, money(b.maxUses)) || 0; if (b.attribution !== undefined) set.attribution = clean(b.attribution, 80);
  await S.TrCoupon.updateOne({ _id: row._id }, { $set: set }); res.json({ ok: true });
});
