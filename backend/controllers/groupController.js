// Multi-campus group operations (PRD E26): the group view, and rules set for the group with campus overrides, versioned.
const S = require('../utils/analytics/service');
const P = require('../utils/group/policy');
const R = require('../utils/group/rollup');
const { KEYS, BY_KEY, view } = require('../utils/group/catalog');
const CS = require('../utils/campus');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const CampusPolicy = require('../models/CampusPolicy');
const Campus = require('../models/Campus');

const { Fail, sid, wrap, ctxOf, oid } = S;
const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'campus-policy', entityId: String(id), schoolId: req.user.schoolId, detail }).catch(() => {});
const body = (req) => req.body || {};
const tell = (schoolId, recipients, title, text, key) => N.notify({ schoolId, recipients, title, body: text, link: '/admin#/group', type: 'group', key }).catch((e) => console.error('group notify:', e.message));

// the whole group is for administrators of the whole school; a campus administrator works inside their own campuses
exports.wideOnly = async (req, res, next) => {
  try { if (!(await CS.scopeOf(req.user))) return next(); return res.status(403).json({ message: 'This is set for the whole group. Ask a school-wide administrator.' }); }
  catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); }
};

const period = async (req) => {
  const today = await S.today(sid(req)); const to = req.query.to || S.addDays(today, -1); const from = req.query.from || S.addDays(to, -29);
  return S.period(sid(req), { from, to });
};
// every look across campuses is written down, once in ten minutes per person
const seen = new Map();
const watch = (req, what, n) => { const k = `${req.user.schoolId}:${req.user.userId}:${what}`; const t = seen.get(k) || 0; if (Date.now() - t < 600000) return; seen.set(k, Date.now()); A(req, 'group.view', what, `${n} campus(es)`); };

exports.access = wrap('access', async (req, res) => {
  const v = await R.vision(req.user);
  res.json({ wide: v.wide, campuses: v.campuses.map((c) => ({ campusId: String(c._id), name: c.name, code: c.code, isDefault: !!c.isDefault, status: c.status })), today: await S.today(sid(req)), canDecide: v.wide });
});

exports.rollup = wrap('rollup', async (req, res) => {
  const p = await period(req); const out = await R.rollup(req.user, p); watch(req, 'rollup', out.campuses.length); res.json(out);
});
exports.campusDetail = wrap('campusDetail', async (req, res) => {
  const p = await period(req); const out = await R.detail(req.user, req.params.campusId, p); watch(req, `campus:${req.params.campusId}`, 1); res.json(out);
});

/* ───────── rules ───────── */
exports.catalog = wrap('catalog', async (req, res) => res.json({ rules: KEYS.map(view) }));

const rowFor = (spec, t) => ({ ...view(spec), ...t });
exports.policies = wrap('policies', async (req, res) => {
  const v = await R.vision(req.user); let campus = v.campuses.find((c) => String(c._id) === String(req.query.campusId));
  if (!campus && !req.query.campusId) campus = v.campuses.find((c) => c.isDefault) || v.campuses[0];
  if (!campus) throw new Fail(404, 'Campus not found.');
  const asOf = req.query.asOf ? new Date(`${String(req.query.asOf).slice(0, 10)}T23:59:59Z`) : null; if (asOf && Number.isNaN(asOf.getTime())) throw new Fail(422, 'Choose a valid date.');
  const t = await P.table(sid(req), String(campus._id), { asOf });
  res.json({ campus: { campusId: String(campus._id), name: campus.name }, asOf: req.query.asOf || null, rules: t.map((r) => rowFor(BY_KEY.get(r.key), r)) });
});
exports.groupRules = wrap('groupRules', async (req, res) => {
  const v = await R.vision(req.user); const docs = await P.load(sid(req), { fresh: true }); const rules = [];
  for (const spec of KEYS) {
    if (spec.campusOnly) continue; const doc = docs.find((d) => d.key === spec.key && d.scope === 'group'); const gv = P.inForce(doc); const fb = await P.fallback(sid(req), spec.key); const b = P.bounds(spec, gv);
    const overrides = docs.filter((d) => d.key === spec.key && d.scope === 'campus' && P.inForce(d) && P.inForce(d).value !== null && (v.wide || v.campuses.some((c) => String(c._id) === String(d.campusId)))).length;
    rules.push({ ...view(spec), value: gv && gv.value !== null ? gv.value : null, locked: !!(gv && gv.locked), lo: b.lo, hi: b.hi, version: gv ? gv.version : 0, fallbackValue: fb.value, fallbackFrom: fb.from, overrides, pending: v.wide ? P.pendingView(P.pending(doc)) : null, docId: v.wide && doc ? String(doc._id) : null });
  }
  res.json({ rules });
});

const histOf = (doc) => (doc ? doc.versions.map((x) => ({ version: x.version, status: x.status, value: x.value, locked: x.locked, lo: x.lo, hi: x.hi, reason: x.reason, madeByName: x.madeByName, madeAt: x.madeAt, decidedByName: x.decidedByName, decidedAt: x.decidedAt, decisionNote: x.decisionNote, soleAdmin: x.soleAdmin, publishedAt: x.publishedAt })).sort((a, b) => b.version - a.version) : []);
exports.history = wrap('history', async (req, res) => {
  const key = String(req.query.key || ''); const spec = BY_KEY.get(key); if (!spec) throw new Fail(404, 'This rule does not exist.');
  const v = await R.vision(req.user); const cid = req.query.campusId ? String(req.query.campusId) : '';
  if (cid && !v.campuses.some((c) => String(c._id) === cid)) throw new Fail(404, 'Campus not found.');
  const doc = cid ? await CampusPolicy.findOne({ schoolId: oid(sid(req)), key, scope: 'campus', campusId: oid(cid) }).lean() : await CampusPolicy.findOne({ schoolId: oid(sid(req)), key, scope: 'group' }).lean();
  res.json({ key, label: spec.label, scope: cid ? 'campus' : 'group', campusId: cid || null, versions: histOf(doc) });
});
exports.pending = wrap('pending', async (req, res) => {
  const v = await R.vision(req.user); const docs = await CampusPolicy.find({ schoolId: oid(sid(req)) }).lean(); const names = new Map(v.campuses.map((c) => [String(c._id), c.name])); const out = [];
  for (const d of docs) {
    const p = P.pending(d); if (!p) continue;
    if (d.scope === 'campus' && !names.has(String(d.campusId))) continue;
    if (d.scope === 'group' && !v.wide) continue;
    out.push({ docId: String(d._id), key: d.key, label: (BY_KEY.get(d.key) || {}).label || d.key, unit: (BY_KEY.get(d.key) || {}).unit, scope: d.scope, campusId: d.campusId ? String(d.campusId) : null, campusName: d.campusId ? names.get(String(d.campusId)) : null, ...P.pendingView(p), madeByCampus: !!p.madeByCampus });
  }
  res.json({ pending: out.sort((a, b) => new Date(a.madeAt) - new Date(b.madeAt)) });
});

exports.proposeGroup = wrap('proposeGroup', async (req, res) => {
  const ctx = ctxOf(req); const ver = await P.proposeGroup(ctx, req.params.key, body(req)); await A(req, 'group.policy.propose', `group:${req.params.key}`, body(req).reason);
  const others = (await P.wideAdmins(sid(req))).filter((a) => String(a._id) !== String(ctx.actor.id)).map((a) => ({ id: a._id, role: 'admin' }));
  await tell(sid(req), others, 'A group rule is waiting for approval', `${BY_KEY.get(req.params.key).label}: made by ${ctx.actor.name}.`, `grp:${req.params.key}:${ver.version}`);
  res.status(201).json({ key: req.params.key, version: ver.version, status: 'pending' });
});
exports.proposeCampus = wrap('proposeCampus', async (req, res) => {
  const ctx = ctxOf(req); const limited = !!(await CS.scopeOf(req.user));
  if (!(await CS.canAccessCampus(req.user, req.params.campusId))) throw new Fail(404, 'Campus not found.');
  const ver = await P.proposeCampus(ctx, req.params.campusId, req.params.key, body(req), { limited }); await A(req, 'group.policy.propose', `${req.params.campusId}:${req.params.key}`, body(req).reason);
  const others = (await P.wideAdmins(sid(req))).filter((a) => String(a._id) !== String(ctx.actor.id)).map((a) => ({ id: a._id, role: 'admin' }));
  const camp = await Campus.findOne({ _id: oid(req.params.campusId), schoolId: oid(sid(req)) }).select('name').lean();
  await tell(sid(req), others, 'A campus rule is waiting for approval', `${camp ? camp.name : 'A campus'}: ${BY_KEY.get(req.params.key).label}, by ${ctx.actor.name}.`, `grp:${req.params.campusId}:${req.params.key}:${ver.version}`);
  res.status(201).json({ key: req.params.key, campusId: req.params.campusId, version: ver.version, status: 'pending' });
});
exports.decide = wrap('decide', async (req, res) => {
  const doc = oid(req.params.id) ? await CampusPolicy.findOne({ _id: oid(req.params.id), schoolId: oid(sid(req)) }) : null; if (!doc) throw new Fail(404, 'Nothing is waiting for approval.');
  const approve = body(req).approve === true; const note = S.text(body(req).note, 'The note', { min: approve ? 0 : 5, max: 300 });
  const { pend, sole } = await P.decide(ctxOf(req), doc, approve, note);
  await A(req, `group.policy.${approve ? 'publish' : 'reject'}`, `${doc.scopeKey}:${doc.key}`, note);
  await tell(sid(req), [{ id: String(pend.madeById), role: 'admin' }], approve ? 'Rule approved' : 'Rule turned down', `${(BY_KEY.get(doc.key) || {}).label}${note ? `: ${note}` : ''}`, `grp:dec:${doc._id}:${pend.version}`);
  res.json({ key: doc.key, scope: doc.scope, version: pend.version, status: approve ? 'published' : 'rejected', soleAdmin: sole });
});

// what applies to a campus (for other tools and for audit): GET /effective?campusId&asOf
exports.effective = wrap('effective', async (req, res) => {
  const v = await R.vision(req.user); const c = v.campuses.find((x) => String(x._id) === String(req.query.campusId)); if (!c) throw new Fail(404, 'Campus not found.');
  const t = await P.table(sid(req), String(c._id)); res.json({ campusId: String(c._id), values: Object.fromEntries(t.map((r) => [r.key, { value: r.value, source: r.source.kind }])) });
});
