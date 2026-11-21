// Group policies and campus overrides (PRD E26 CampusPolicy): who may change what, the value that applies to a campus, and the history.
//   value for a campus = the campus's own value (if the group allows it and it is inside the group's limits)
//                      > the group's value > what the module already used before E26 (its own setting)
const S = require('../analytics/service');
const CS = require('../campus');
const CampusPolicy = require('../../models/CampusPolicy');
const Campus = require('../../models/Campus');
const CampusMembership = require('../../models/CampusMembership');
const User = require('../../models/User');
const { KEYS, BY_KEY } = require('./catalog');

const { Fail, oid } = S;
const TTL = 5000; const cache = new Map();
const bust = (schoolId) => cache.delete(String(schoolId));
async function load(schoolId, { fresh = false } = {}) {
  const k = String(schoolId); const hit = cache.get(k); if (!fresh && hit && Date.now() - hit.at < TTL) return hit.docs;
  const docs = (await CampusPolicy.find({ schoolId: oid(schoolId) }).lean()); cache.set(k, { at: Date.now(), docs }); return docs;
}

// the version in force now, or the one that was in force at a past moment
function inForce(doc, asOf = null) {
  if (!doc) return null;
  if (!asOf) return doc.versions.find((v) => v.version === doc.published && v.status === 'published') || null;
  const t = new Date(asOf).getTime(); let best = null;
  for (const v of doc.versions) if ((v.status === 'published' || v.status === 'superseded') && v.publishedAt && new Date(v.publishedAt).getTime() <= t && (!best || new Date(v.publishedAt) > new Date(best.publishedAt))) best = v;
  return best;
}
const pending = (doc) => (doc ? doc.versions.find((v) => v.status === 'pending') || null : null);

// what a module used before the group could set it
async function fallback(schoolId, key) {
  if (key === 'attendance.alertGraceMinutes') { const st = await require('../attendanceOps').getSettings(schoolId); return { value: Number(st.graceMinutes) || 0, from: 'the attendance settings' }; }
  if (key === 'fees.lateGraceDays' || key === 'fees.lateFeeAmount') {
    const AppSetting = require('../../models/AppSetting'); const s = await AppSetting.findOne({ key: `finance:${schoolId}` }).lean(); const v = s?.value || {};
    return { value: Number(key === 'fees.lateGraceDays' ? v.graceDays : v.lateFeeAmount) || 0, from: 'the fee settings' };
  }
  if (key.startsWith('target.')) {
    const Cat = require('../analytics/catalog'); const defs = await Cat.definitions(schoolId);
    const d = defs.get({ 'target.attendanceRate': 'attendance.rate', 'target.feeCollection': 'fees.collection', 'target.learningAverage': 'learning.average' }[key]);
    return { value: d && d.target !== null && d.target !== undefined ? Number(d.target) : null, from: 'the measure definition' };
  }
  return { value: key === 'capacity.students' ? 0 : null, from: 'nothing set' };
}

const bounds = (spec, gv) => ({ lo: gv && gv.lo !== null && gv.lo !== undefined ? gv.lo : spec.min, hi: gv && gv.hi !== null && gv.hi !== undefined ? gv.hi : spec.max });

// one rule for one campus, with where the value came from
function solve(docs, spec, campusId, fb, asOf = null) {
  const g = docs.find((d) => d.key === spec.key && d.scope === 'group'); const gv = inForce(g, asOf);
  const c = campusId ? docs.find((d) => d.key === spec.key && d.scope === 'campus' && String(d.campusId) === String(campusId)) : null; const cv = inForce(c, asOf);
  const b = bounds(spec, gv); const locked = !!(gv && gv.locked) && !spec.campusOnly;
  let ignored = null;
  if (cv && cv.value !== null && cv.value !== undefined) {
    if (locked) ignored = 'locked'; else if (cv.value < b.lo || cv.value > b.hi) ignored = 'limits';
    else return { value: cv.value, source: { kind: 'campus', version: cv.version, campusId: String(campusId) }, locked, ...b, groupValue: gv ? gv.value : null, override: cv.value, ignored: null, group: gv, campusVersion: cv };
  }
  if (gv && gv.value !== null && gv.value !== undefined) return { value: gv.value, source: { kind: 'group', version: gv.version }, locked, ...b, groupValue: gv.value, override: cv && cv.value !== null ? cv.value : null, ignored, group: gv, campusVersion: cv };
  return { value: fb.value, source: { kind: spec.campusOnly ? 'default' : 'setting', from: fb.from }, locked, ...b, groupValue: gv ? gv.value : null, override: cv && cv.value !== null ? cv.value : null, ignored, group: gv, campusVersion: cv };
}

// the value one module asks for; falls back to the module's own setting, so nothing changes until a policy is published
async function effective(schoolId, campusId, key, { asOf = null } = {}) {
  const spec = BY_KEY.get(key); if (!spec) throw new Error(`unknown policy ${key}`);
  const docs = await load(schoolId); return solve(docs, spec, campusId, await fallback(schoolId, key), asOf);
}
// every rule for one campus
async function table(schoolId, campusId, { asOf = null } = {}) {
  const docs = await load(schoolId); const out = [];
  for (const spec of KEYS) {
    const r = solve(docs, spec, campusId, await fallback(schoolId, spec.key), asOf);
    const gdoc = docs.find((d) => d.key === spec.key && d.scope === 'group'); const cdoc = campusId ? docs.find((d) => d.key === spec.key && d.scope === 'campus' && String(d.campusId) === String(campusId)) : null;
    out.push({ key: spec.key, value: r.value, source: r.source, locked: r.locked, lo: r.lo, hi: r.hi, groupValue: r.groupValue, override: r.override, ignored: r.ignored, canOverride: spec.campusOnly || !r.locked,
      pendingGroup: pendingView(pending(gdoc)), pendingCampus: pendingView(pending(cdoc)) });
  }
  return out;
}
const pendingView = (v) => (v ? { version: v.version, value: v.value, locked: v.locked, lo: v.lo, hi: v.hi, reason: v.reason, madeByName: v.madeByName, madeAt: v.madeAt } : null);

/* ───────── who decides ───────── */
// administrators of the whole school: no active campus membership
async function wideAdmins(schoolId) {
  const sid = oid(schoolId); const admins = await User.find({ schoolId: sid, role: 'admin', isActive: { $ne: false } }).select('_id name').lean();
  const limited = new Set((await CampusMembership.find({ schoolId: sid }).select('userId revokedAt').lean()).filter((m) => !m.revokedAt).map((m) => String(m.userId)));
  return admins.filter((a) => !limited.has(String(a._id)));
}
// a school-wide administrator other than the maker must decide; with only one such person, they may, and it is recorded
async function separateWide(ctx, version, what) {
  if (version.madeByCampus || String(version.madeById) !== String(ctx.actor.id)) return false;
  if ((await wideAdmins(ctx.schoolId)).length <= 1) return true;
  throw new Fail(403, `${what} must be decided by another administrator of the whole school.`, { reason: 'maker_checker' });
}

/* ───────── proposing ───────── */
const num = (v, name) => { const n = Number(v); if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw new Fail(422, `${name} must be a number.`); return n; };
const step = (spec, n, name) => { const st = spec.step || 1; if (st >= 1 && !Number.isInteger(n)) throw new Fail(422, `${name} must be a whole number.`); return Math.round(n * 10) / 10; };

async function groupDoc(schoolId, key) {
  let doc = await CampusPolicy.findOne({ schoolId: oid(schoolId), key, scope: 'group' });
  if (!doc) { try { doc = await CampusPolicy.create({ schoolId: oid(schoolId), key, scope: 'group', campusId: null, scopeKey: 'group', counter: 0, versions: [] }); } catch (e) { if (!(e.code === 11000 || /duplicate key|E11000/.test(e.message || ''))) throw e; doc = await CampusPolicy.findOne({ schoolId: oid(schoolId), key, scope: 'group' }); } }
  return doc;
}
async function campusDoc(schoolId, campusId, key) {
  let doc = await CampusPolicy.findOne({ schoolId: oid(schoolId), key, scope: 'campus', campusId: oid(campusId) });
  if (!doc) { try { doc = await CampusPolicy.create({ schoolId: oid(schoolId), key, scope: 'campus', campusId: oid(campusId), scopeKey: String(campusId), counter: 0, versions: [] }); } catch (e) { if (!(e.code === 11000 || /duplicate key|E11000/.test(e.message || ''))) throw e; doc = await CampusPolicy.findOne({ schoolId: oid(schoolId), key, scope: 'campus', campusId: oid(campusId) }); } }
  return doc;
}
async function push(doc, v) {
  if (doc.versions.some((x) => x.status === 'pending')) throw new Fail(409, 'A change is already waiting for approval. Decide it first.', { reason: 'pending' });
  const next = (doc.counter || 0) + 1; const ver = { ...v, version: next, status: 'pending', madeAt: new Date() };
  const r = await CampusPolicy.updateOne({ _id: doc._id, counter: doc.counter || 0 }, { $set: { counter: next }, $push: { versions: ver } });
  if (!r.matchedCount) throw new Fail(409, 'Someone else just changed this. Reload and try again.');
  bust(doc.schoolId); return ver;
}

async function proposeGroup(ctx, key, b) {
  const spec = BY_KEY.get(key); if (!spec) throw new Fail(404, 'This rule does not exist.');
  if (spec.campusOnly) throw new Fail(422, 'This rule is set for each campus, not for the group.');
  const reason = S.text(b.reason, 'The reason', { min: 5, max: 300 });
  const value = b.value === null || b.value === undefined || b.value === '' ? null : step(spec, num(b.value, 'The value'), 'The value');
  const lo = b.lo === null || b.lo === undefined || b.lo === '' ? null : step(spec, num(b.lo, 'The lowest value'), 'The lowest value'); const hi = b.hi === null || b.hi === undefined || b.hi === '' ? null : step(spec, num(b.hi, 'The highest value'), 'The highest value');
  const from = lo === null ? spec.min : lo; const to = hi === null ? spec.max : hi;
  if (from < spec.min || to > spec.max || from > to) throw new Fail(422, `The limits must lie between ${spec.min} and ${spec.max}, lowest first.`);
  if (value !== null && (value < from || value > to)) throw new Fail(422, `The value must be between ${from} and ${to}.`);
  const doc = await groupDoc(ctx.schoolId, key);
  return push(doc, { value, locked: b.locked === true, lo, hi, reason, madeById: ctx.actor.id, madeByName: ctx.actor.name, madeByCampus: false });
}

async function proposeCampus(ctx, campusId, key, b, { limited }) {
  const spec = BY_KEY.get(key); if (!spec) throw new Fail(404, 'This rule does not exist.');
  const campus = oid(campusId) ? await Campus.findOne({ _id: oid(campusId), schoolId: oid(ctx.schoolId) }).lean() : null; if (!campus || campus.status === 'closed') throw new Fail(404, 'Campus not found.');
  const reason = S.text(b.reason, 'The reason', { min: 5, max: 300 });
  const value = b.value === null || b.value === undefined || b.value === '' ? null : step(spec, num(b.value, 'The value'), 'The value');
  if (value !== null) {
    const gv = inForce((await load(ctx.schoolId, { fresh: true })).find((x) => x.key === key && x.scope === 'group'));
    if (!spec.campusOnly && gv && gv.locked) throw new Fail(409, 'The group has locked this rule. A campus cannot change it.', { reason: 'locked' });
    const b2 = bounds(spec, spec.campusOnly ? null : gv); if (value < b2.lo || value > b2.hi) throw new Fail(422, `A campus value must be between ${b2.lo} and ${b2.hi}.`, { reason: 'limits', lo: b2.lo, hi: b2.hi });
  }
  const doc = await campusDoc(ctx.schoolId, campusId, key);
  return push(doc, { value, reason, madeById: ctx.actor.id, madeByName: ctx.actor.name, madeByCampus: !!limited });
}

/* ───────── deciding ───────── */
async function decide(ctx, doc, approve, note) {
  const pend = pending(doc); if (!pend) throw new Fail(404, 'Nothing is waiting for approval.');
  const spec = BY_KEY.get(doc.key); const sole = await separateWide(ctx, pend, 'A change to a policy');
  if (approve && doc.scope === 'campus' && pend.value !== null) { // the group may have changed since it was asked
    const gv = inForce((await load(ctx.schoolId, { fresh: true })).find((x) => x.key === doc.key && x.scope === 'group')); const b = bounds(spec, spec.campusOnly ? null : gv);
    if (!spec.campusOnly && gv && gv.locked) throw new Fail(409, 'The group has locked this rule since it was asked. Turn it down.', { reason: 'locked' });
    if (pend.value < b.lo || pend.value > b.hi) throw new Fail(409, `The group's limits are now ${b.lo} to ${b.hi}. Turn it down.`, { reason: 'limits' });
  }
  const now = new Date();
  const versions = doc.versions.map((v) => { const o = v.toObject ? v.toObject() : v; if (o.version === pend.version) return { ...o, status: approve ? 'published' : 'rejected', decidedById: ctx.actor.id, decidedByName: ctx.actor.name, decidedAt: now, decisionNote: note, soleAdmin: sole, publishedAt: approve ? now : undefined }; return approve && o.status === 'published' ? { ...o, status: 'superseded' } : o; });
  const r = await CampusPolicy.updateOne({ _id: doc._id, 'versions.version': pend.version }, { $set: { versions, published: approve ? pend.version : doc.published } });
  if (!r.matchedCount) throw new Fail(409, 'Someone else just decided this. Reload.');
  bust(doc.schoolId); return { pend, sole };
}

module.exports = { load, inForce, pending, effective, table, solve, bounds, fallback, wideAdmins, separateWide, proposeGroup, proposeCampus, decide, bust, pendingView, groupDoc, campusDoc };
