// Milestones and observations, the activity library, small-group plans, visual routines, practice and printable sheets (PRD E15: CAP-0273, 0275–0284).
//   Descriptive words only. Nothing here is a score, a rank or a public leaderboard.
const E = require('../utils/early/service');
const C = require('../utils/early/content');
const W = require('../utils/early/worksheets');
const { audit } = require('../utils/audit');
const Student = require('../models/Student');
const School = require('../models/School');
const EyRoom = require('../models/EyRoom');
const EyPlacement = require('../models/EyPlacement');
const EyDay = require('../models/EyDay');
const EyCare = require('../models/EyCare');
const EyFramework = require('../models/EyFramework');
const EyObs = require('../models/EyObs');
const EyActivity = require('../models/EyActivity');
const EyPlan = require('../models/EyPlan');
const EyRoutine = require('../models/EyRoutine');
const EyPractice = require('../models/EyPractice');
const { oid, sid, bad, wrap, clean } = E;
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'framework';

/* ───────── milestones ───────── */
async function ensureBuiltin(schoolId) {
  let f = await EyFramework.findOne({ schoolId: oid(schoolId), key: C.FRAMEWORK.key, origin: 'aulensia' });
  if (!f) { try { f = await EyFramework.create({ schoolId: oid(schoolId), key: C.FRAMEWORK.key, version: 1, name: C.FRAMEWORK.name, origin: 'aulensia', license: C.FRAMEWORK.license, areas: C.AREAS, status: 'Published', byName: 'Aulensia', publishedAt: new Date() }); } catch (e) { f = await EyFramework.findOne({ schoolId: oid(schoolId), key: C.FRAMEWORK.key, origin: 'aulensia' }); } }
  return f;
}
const fwView = (f, full = true) => ({ _id: f._id, key: f.key, version: f.version, name: f.name, origin: f.origin, license: f.license, status: f.status, areas: full ? f.areas : undefined, byName: f.byName, publishedAt: f.publishedAt, items: f.areas.reduce((n, a) => n + a.items.length, 0) });
exports.listFrameworks = wrap('frameworks', async (req, res) => { await ensureBuiltin(req.user.schoolId); const rows = await EyFramework.find({ schoolId: sid(req), status: { $ne: 'Archived' } }).sort({ origin: 1, name: 1 }); res.json({ frameworks: rows.map((f) => fwView(f, req.query.full === '1')) }); });
exports.getFramework = wrap('framework', async (req, res) => { const f = oid(req.params.id) ? await EyFramework.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!f) return bad(res, 404, 'That framework is not in your school.'); res.json({ framework: fwView(f) }); });
exports.copyFramework = wrap('copyFramework', async (req, res) => {
  const f = oid(req.params.id) ? await EyFramework.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!f) return bad(res, 404, 'That framework is not in your school.'); const name = clean(req.body?.name, 80) || `${f.name} (our copy)`;
  const c = await EyFramework.create({ schoolId: sid(req), key: `school-${slug(name)}-${Date.now().toString(36)}`, version: 1, name, origin: 'school', license: `Adapted from ${f.name}. ${f.license}`.slice(0, 300), areas: JSON.parse(JSON.stringify(f.areas)), status: 'Draft', byName: req.actorName || '' }); res.status(201).json({ framework: fwView(c) });
});
function cleanAreas(areas) {
  if (!Array.isArray(areas) || !areas.length || areas.length > 10) return { error: 'Give between 1 and 10 areas.' }; const keys = new Set(); const out = [];
  for (const a of areas) { const label = clean(a.label, 60); if (!label) return { error: 'Every area needs a name.' }; const key = clean(a.key, 20).replace(/[^a-z0-9]/gi, '') || slug(label).replace(/-/g, '').slice(0, 12); if (keys.has(key)) return { error: `Two areas share the key ${key}.` }; keys.add(key);
    if (!Array.isArray(a.items) || !a.items.length || a.items.length > 30) return { error: `${label}: give between 1 and 30 milestones.` }; const ik = new Set(); const items = [];
    for (const i of a.items) { const il = clean(i.label, 120); const f = Number(i.fromMonths); const t = Number(i.toMonths); if (!il) return { error: `${label}: every milestone needs words.` }; if (!Number.isFinite(f) || !Number.isFinite(t) || f < 0 || t > 96 || f >= t) return { error: `${il}: the age window must start before it ends, between 0 and 96 months.` }; const k = clean(i.key, 20).replace(/[^a-z0-9]/gi, '') || slug(il).replace(/-/g, '').slice(0, 14); if (ik.has(k)) return { error: `${label}: two milestones share the key ${k}.` }; ik.add(k); items.push({ key: k, label: il, labelUr: clean(i.labelUr, 120), fromMonths: Math.round(f), toMonths: Math.round(t) }); }
    out.push({ key, label, labelUr: clean(a.labelUr, 60), items }); }
  return { areas: out };
}
exports.updateFramework = wrap('updateFramework', async (req, res) => {
  const f = oid(req.params.id) ? await EyFramework.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!f) return bad(res, 404, 'That framework is not in your school.'); if (f.status !== 'Draft') return bad(res, 409, 'A published framework never changes. Make a copy to change it.');
  if (req.body?.name !== undefined) { const n = clean(req.body.name, 80); if (!n) return bad(res, 400, 'Give it a name.'); f.name = n; } if (req.body?.areas !== undefined) { const c = cleanAreas(req.body.areas); if (c.error) return bad(res, 400, c.error); f.areas = c.areas; } await f.save(); res.json({ framework: fwView(f) });
});
exports.publishFramework = wrap('publishFramework', async (req, res) => {
  const f = oid(req.params.id) ? await EyFramework.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!f) return bad(res, 404, 'That framework is not in your school.'); if (f.status !== 'Draft') return bad(res, 409, 'It is already published.');
  const c = cleanAreas(JSON.parse(JSON.stringify(f.areas))); if (c.error) return bad(res, 422, c.error); f.status = 'Published'; f.publishedAt = new Date(); await f.save(); await audit(req, { action: 'early.framework.publish', entityType: 'EyFramework', entityId: f._id, schoolId: sid(req) }); res.json({ framework: fwView(f) });
});
exports.archiveFramework = wrap('archiveFramework', async (req, res) => { const f = oid(req.params.id) ? await EyFramework.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!f) return bad(res, 404, 'That framework is not in your school.'); if (f.origin === 'aulensia') return bad(res, 409, 'Aulensia\'s own framework stays available. Make a copy instead.'); f.status = 'Archived'; await f.save(); res.json({ ok: true }); });

const itemOf = (f, itemKey) => { for (const a of f.areas) { const i = a.items.find((x) => x.key === itemKey); if (i) return { area: a, item: i }; } return null; };
exports.observe = wrap('observe', async (req, res) => {
  const b = req.body || {}; const c = await E.childIn(req, b.childId); if (c.error) return bad(res, ...c.error);
  if ('score' in b || 'points' in b || 'rank' in b) return bad(res, 400, 'Observations are described in words. Scores and points are not kept.');
  const f = b.frameworkId ? (oid(b.frameworkId) ? await EyFramework.findOne({ _id: b.frameworkId, schoolId: sid(req), status: 'Published' }) : null) : await ensureBuiltin(req.user.schoolId); if (!f) return bad(res, 404, 'That framework is not available.');
  const hit = itemOf(f, b.itemKey); if (!hit) return bad(res, 400, 'Choose a milestone from the framework.'); if (!['Exploring', 'Practising', 'Confident'].includes(b.level)) return bad(res, 400, 'Choose exploring, practising or confident.');
  const o = await require('../models/EyObs').create({ schoolId: sid(req), childId: c.child._id, roomId: c.room._id, frameworkId: f._id, frameworkVersion: f.version, areaKey: hit.area.key, itemKey: hit.item.key, level: b.level, note: clean(b.note, 500), day: await E.today(req.user.schoolId), byId: oid(req.user.userId), byName: req.actorName || '', planId: oid(b.planId) || undefined });
  res.status(201).json({ observation: { _id: o._id, areaKey: o.areaKey, itemKey: o.itemKey, level: o.level, note: o.note, day: o.day } });
});
exports.voidObs = wrap('voidObs', async (req, res) => {
  const o = oid(req.params.id) ? await EyObs.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!o) return bad(res, 404, 'That observation is not in your school.'); const r = await E.roomFor(req, o.roomId); if (r.error) return bad(res, ...r.error);
  if (!r.scope.admin && String(o.byId) !== String(req.user.userId) && !E.isLead(r.scope, r.room)) return bad(res, 403, 'Only who wrote it, the room lead or an administrator can remove it.'); const reason = clean(req.body?.reason, 200); if (reason.length < 3) return bad(res, 400, 'Write why.'); if (o.state === 'Voided') return bad(res, 409, 'Already removed.'); o.state = 'Voided'; o.voidReason = reason; await o.save(); res.json({ ok: true });
});
exports.progress = wrap('progress', async (req, res) => {
  const c = await E.childIn(req, req.params.id); if (c.error) return bad(res, ...c.error);
  const f = req.query.frameworkId ? (oid(req.query.frameworkId) ? await EyFramework.findOne({ _id: req.query.frameworkId, schoolId: sid(req) }) : null) : await ensureBuiltin(req.user.schoolId); if (!f) return bad(res, 404, 'That framework is not available.');
  const months = E.ageMonths(c.child.dateOfBirth); const obs = await EyObs.find({ schoolId: sid(req), childId: c.child._id, frameworkId: f._id, state: 'Active' }).sort({ at: -1 }).limit(500); const latest = new Map(); for (const o of obs) if (!latest.has(o.itemKey)) latest.set(o.itemKey, o);
  const acts = await activityPool(req, { publishedOnly: true }); const areas = f.areas.map((a) => ({ key: a.key, label: a.label, labelUr: a.labelUr, items: a.items.map((i) => { const o = latest.get(i.key); const inWindow = months != null && months >= i.fromMonths && months <= i.toMonths; return { key: i.key, label: i.label, labelUr: i.labelUr, fromMonths: i.fromMonths, toMonths: i.toMonths, seen: !!o, level: o?.level || '', note: o?.note || '', at: o?.at, observationId: o?._id, window: months == null ? '' : months < i.fromMonths ? 'ahead' : months > i.toMonths ? 'past' : 'now', ideas: !o && inWindow ? acts.filter((x) => x.areaKey === a.key && months >= x.ageFromMonths && months <= x.ageToMonths).slice(0, 3).map((x) => ({ ref: x.ref, title: x.title })) : [] }; }) }));
  res.json({ child: { _id: c.child._id, name: c.child.name, ageMonths: months, age: E.ageLabel(months) }, framework: fwView(f, false), areas, note: 'The age windows are typical ranges, not targets. A milestone that has not been seen yet is simply something to look for.' });
});
exports.coverage = wrap('coverage', async (req, res) => {
  const r = await E.roomFor(req, req.params.id); if (r.error) return bad(res, ...r.error); const f = req.query.frameworkId ? (oid(req.query.frameworkId) ? await EyFramework.findOne({ _id: req.query.frameworkId, schoolId: sid(req) }) : null) : await ensureBuiltin(req.user.schoolId); if (!f) return bad(res, 404, 'That framework is not available.');
  const pl = await EyPlacement.find({ schoolId: sid(req), roomId: r.room._id, to: null }); const kids = await Student.find({ _id: { $in: pl.map((p) => p.childId) } }).select('dateOfBirth'); const obs = await EyObs.find({ schoolId: sid(req), roomId: r.room._id, frameworkId: f._id, state: 'Active' }).select('childId itemKey');
  const seen = new Map(); for (const o of obs) { if (!seen.has(o.itemKey)) seen.set(o.itemKey, new Set()); seen.get(o.itemKey).add(String(o.childId)); }
  res.json({ room: { _id: r.room._id, name: r.room.name }, children: kids.length, areas: f.areas.map((a) => ({ key: a.key, label: a.label, items: a.items.map((i) => { const inWin = kids.filter((k) => { const m = E.ageMonths(k.dateOfBirth); return m != null && m >= i.fromMonths && m <= i.toMonths; }).length; return { key: i.key, label: i.label, inWindow: inWin, seenCount: (seen.get(i.key) || new Set()).size }; }) })) });
});

/* ───────── activities ───────── */
const actView = (a, builtin = false) => ({ ref: builtin ? a.ref : String(a._id), _id: builtin ? undefined : a._id, origin: builtin ? 'aulensia' : 'school', kind: a.kind, title: a.title, lang: a.lang, ageFromMonths: a.ageFromMonths, ageToMonths: a.ageToMonths, areaKey: a.areaKey, summary: a.summary, materials: a.materials, steps: a.steps, body: a.body, transcript: a.transcript, safety: a.safety, durationMin: a.durationMin, groupMin: a.groupMin, groupMax: a.groupMax, adultFacilitated: a.adultFacilitated, hasAudio: !!(a.audioSize || a.audio), license: a.license, state: a.state, authorName: a.authorName, copiedFrom: a.copiedFrom, publishedAt: a.publishedAt });
async function activityPool(req, { publishedOnly = false } = {}) {
  const q = { schoolId: sid(req) }; if (publishedOnly) q.state = 'Published'; else q.state = { $ne: 'Archived' }; const rows = await EyActivity.find(q).select('-audio').sort({ title: 1 }).limit(300);
  return [...C.ACTIVITIES.map((a) => actView(a, true)), ...rows.filter((r) => publishedOnly || r.state !== 'Archived').map((r) => actView(r))];
}
exports.listActivities = wrap('activities', async (req, res) => {
  let list = await activityPool(req); const scope = await E.scopeOf(req);
  if (!scope.admin) list = list.filter((a) => a.state === 'Published' || String(a.authorId) === String(req.user.userId) || a.origin === 'aulensia');
  const { kind, areaKey, q, state } = req.query; if (kind) list = list.filter((a) => a.kind === kind); if (areaKey) list = list.filter((a) => a.areaKey === areaKey); if (state) list = list.filter((a) => a.state === state);
  const age = Number(req.query.ageMonths); if (Number.isFinite(age) && req.query.ageMonths !== '') list = list.filter((a) => age >= a.ageFromMonths && age <= a.ageToMonths); if (q) { const t = String(q).toLowerCase(); list = list.filter((a) => `${a.title} ${a.summary}`.toLowerCase().includes(t)); }
  if (req.query.mine === '1') list = list.filter((a) => a.origin === 'school' && a.authorName === (req.actorName || ''));
  res.json({ activities: list, total: list.length, kinds: ['phonics', 'tracing', 'matching', 'story', 'audio', 'worksheet', 'motor', 'sensory', 'routine', 'game', 'other'] });
});
exports.getActivity = wrap('activity', async (req, res) => {
  const ref = String(req.params.ref); if (ref.startsWith('aul:')) { const a = C.ACTIVITIES.find((x) => x.ref === ref); return a ? res.json({ activity: actView(a, true) }) : bad(res, 404, 'That activity is not here.'); }
  const a = oid(ref) ? await EyActivity.findOne({ _id: ref, schoolId: sid(req) }).select('-audio') : null; if (!a) return bad(res, 404, 'That activity is not here.'); res.json({ activity: actView(a) });
});
function cleanActivity(b, base = {}) {
  const o = {}; const t = clean(b.title !== undefined ? b.title : base.title, 100); if (t.length < 3) return { error: 'Give the activity a title.' }; o.title = t;
  o.kind = pick(b.kind !== undefined ? b.kind : base.kind, ['phonics', 'tracing', 'matching', 'story', 'audio', 'worksheet', 'motor', 'sensory', 'routine', 'game', 'other'], 'other'); o.lang = pick(b.lang !== undefined ? b.lang : base.lang, ['en', 'ur', 'both'], 'en');
  const f = Number(b.ageFromMonths !== undefined ? b.ageFromMonths : base.ageFromMonths ?? 24); const to = Number(b.ageToMonths !== undefined ? b.ageToMonths : base.ageToMonths ?? 60); if (!Number.isFinite(f) || !Number.isFinite(to) || f < 0 || to > 96 || f >= to) return { error: 'The age range must start before it ends, between 0 and 96 months.' }; o.ageFromMonths = Math.round(f); o.ageToMonths = Math.round(to);
  o.areaKey = clean(b.areaKey !== undefined ? b.areaKey : base.areaKey, 20); o.summary = clean(b.summary !== undefined ? b.summary : base.summary, 300); o.body = clean(b.body !== undefined ? b.body : base.body, 4000); o.transcript = clean(b.transcript !== undefined ? b.transcript : base.transcript, 6000);
  const list = (v, n, m) => (Array.isArray(v) ? v : []).map((x) => clean(x, m)).filter(Boolean).slice(0, n); o.materials = list(b.materials !== undefined ? b.materials : base.materials, 15, 80); o.steps = list(b.steps !== undefined ? b.steps : base.steps, 12, 240);
  const sf = { ...(base.safety || {}), ...(b.safety || {}) }; o.safety = { supervision: pick(sf.supervision, ['adult-close', 'adult-near', 'adult-present'], 'adult-near'), smallParts: !!sf.smallParts, allergens: !!sf.allergens, notes: clean(sf.notes, 300) };
  const num = (v, d, lo, hi) => { const n = Number(v ?? d); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; }; o.durationMin = num(b.durationMin !== undefined ? b.durationMin : base.durationMin, 15, 1, 120); o.groupMin = num(b.groupMin !== undefined ? b.groupMin : base.groupMin, 1, 1, 30); o.groupMax = num(b.groupMax !== undefined ? b.groupMax : base.groupMax, 6, 1, 30); if (o.groupMax < o.groupMin) return { error: 'The largest group cannot be smaller than the smallest.' };
  o.adultFacilitated = b.adultFacilitated !== undefined ? !!b.adultFacilitated : base.adultFacilitated !== false; const lic = { ...(base.license || {}), ...(b.license || {}) }; o.license = { kind: pick(lic.kind, ['own', 'open', 'licensed', 'unknown'], 'unknown'), statement: clean(lic.statement, 300), holder: clean(lic.holder, 100) }; return { o };
}
exports.createActivity = wrap('createActivity', async (req, res) => { const c = cleanActivity(req.body || {}); if (c.error) return bad(res, 400, c.error); const a = await EyActivity.create({ schoolId: sid(req), ...c.o, authorId: oid(req.user.userId), authorName: req.actorName || '' }); res.status(201).json({ activity: actView(a) }); });
exports.copyActivity = wrap('copyActivity', async (req, res) => {
  const ref = String(req.body?.ref || ''); let src; if (ref.startsWith('aul:')) src = C.ACTIVITIES.find((x) => x.ref === ref); else src = oid(ref) ? await EyActivity.findOne({ _id: ref, schoolId: sid(req) }).select('-audio') : null; if (!src) return bad(res, 404, 'That activity is not here.');
  const base = JSON.parse(JSON.stringify(src)); const c = cleanActivity({ title: `${src.title} (our copy)` }, base); if (c.error) return bad(res, 400, c.error); const a = await EyActivity.create({ schoolId: sid(req), ...c.o, copiedFrom: ref, authorId: oid(req.user.userId), authorName: req.actorName || '' }); res.status(201).json({ activity: actView(a) });
});
async function mineOrAdmin(req, id) { const a = oid(id) ? await EyActivity.findOne({ _id: id, schoolId: sid(req) }) : null; if (!a) return { error: [404, 'That activity is not in your school.'] }; if (req.user.role !== 'admin' && String(a.authorId) !== String(req.user.userId)) return { error: [403, 'Only the author or an administrator can change this activity.'] }; return { a }; }
exports.updateActivity = wrap('updateActivity', async (req, res) => { const f = await mineOrAdmin(req, req.params.id); if (f.error) return bad(res, ...f.error); if (f.a.state !== 'Draft') return bad(res, 409, 'A published activity never changes. Copy it to make a new version.'); const c = cleanActivity(req.body || {}, JSON.parse(JSON.stringify(f.a))); if (c.error) return bad(res, 400, c.error); Object.assign(f.a, c.o); await f.a.save(); res.json({ activity: actView(f.a) }); });
exports.publishActivity = wrap('publishActivity', async (req, res) => {
  const f = await mineOrAdmin(req, req.params.id); if (f.error) return bad(res, ...f.error); const a = f.a; if (a.state !== 'Draft') return bad(res, 409, 'It is already published.'); const issues = [];
  if (a.license.kind === 'unknown') issues.push('Say where this came from: your own work, an open licence, or content you hold a licence for.'); if (['licensed', 'open'].includes(a.license.kind) && a.license.statement.length < 5) issues.push('Add the licence statement or where the content comes from.');
  if ((a.kind === 'audio' || a.audioSize) && !a.transcript) issues.push('Audio needs a written transcript so every family can follow it.'); if (a.kind === 'story' && !a.body && !a.audioSize) issues.push('A story needs its text or a recording.');
  if (!a.steps.length && !a.body) issues.push('Add the steps, or the text of the story.'); if (a.safety.smallParts && a.ageFromMonths < 36 && a.safety.supervision !== 'adult-close') issues.push('Small parts for children under three need an adult close beside the child.');
  if (issues.length) return bad(res, 422, 'This cannot be published yet.', { issues }); if (req.user.role !== 'admin' && a.license.kind !== 'own') return bad(res, 403, 'Only an administrator can publish content that is not your own work.');
  a.state = 'Published'; a.publishedByName = req.actorName || ''; a.publishedAt = new Date(); await a.save(); await audit(req, { action: 'early.activity.publish', entityType: 'EyActivity', entityId: a._id, schoolId: sid(req), detail: { license: a.license.kind } }); res.json({ activity: actView(a) });
});
exports.archiveActivity = wrap('archiveActivity', async (req, res) => { const f = await mineOrAdmin(req, req.params.id); if (f.error) return bad(res, ...f.error); f.a.state = 'Archived'; await f.a.save(); res.json({ ok: true }); });
exports.putAudio = wrap('putAudio', async (req, res) => {
  const f = await mineOrAdmin(req, req.params.id); if (f.error) return bad(res, ...f.error); if (f.a.state !== 'Draft') return bad(res, 409, 'Copy the activity to change its recording.');
  const m = /^data:(audio\/(?:webm|ogg|mpeg|mp4|wav|x-wav|aac))(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.audio || '')); if (!m) return bad(res, 400, 'Send the recording as webm, ogg, mp3, mp4, wav or aac audio.');
  const buf = Buffer.from(m[2], 'base64'); if (buf.length < 500) return bad(res, 400, 'That recording is empty.'); if (buf.length > 1024 * 1024) return bad(res, 400, 'The recording is too long. The limit is 1 MB, about two minutes.');
  f.a.audio = buf; f.a.audioMime = m[1]; f.a.audioSize = buf.length; f.a.audioSha = E.sha(buf); await f.a.save(); res.json({ activity: actView(f.a) });
});
exports.getAudio = wrap('getAudio', async (req, res) => { const a = oid(req.params.id) ? await EyActivity.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!a || !a.audio) return bad(res, 404, 'There is no recording.'); res.set('Content-Type', a.audioMime || 'audio/webm'); res.set('Cache-Control', 'private, max-age=300'); res.set('X-Content-Type-Options', 'nosniff'); res.send(Buffer.from(a.audio)); });

/* ───────── plans ───────── */
const planView = (p) => ({ _id: p._id, roomId: p.roomId, day: p.day, slot: p.slot, groupName: p.groupName, childIds: p.childIds, activityRef: p.activityRef, activityTitle: p.activityTitle, areaKey: p.areaKey, staffName: p.staffName, note: p.note, status: p.status, outcome: p.outcome, doneAt: p.doneAt });
async function findActivity(req, ref) { if (String(ref).startsWith('aul:')) return C.ACTIVITIES.find((x) => x.ref === ref) || null; const a = oid(ref) ? await EyActivity.findOne({ _id: ref, schoolId: sid(req), state: 'Published' }).select('-audio') : null; return a; }
exports.listPlans = wrap('plans', async (req, res) => { const r = await E.roomFor(req, req.query.roomId); if (r.error) return bad(res, ...r.error); const day = E.isDay(req.query.day) ? req.query.day : await E.today(req.user.schoolId); const SLOT = { Morning: 0, Midday: 1, Afternoon: 2 }; const rows = (await EyPlan.find({ schoolId: sid(req), roomId: r.room._id, day }).sort({ createdAt: 1 })).sort((a, b) => (SLOT[a.slot] ?? 9) - (SLOT[b.slot] ?? 9)); const names = new Map((await Student.find({ _id: { $in: rows.flatMap((p) => p.childIds) } }).select('name')).map((s) => [String(s._id), s.name])); res.json({ day, plans: rows.map((p) => ({ ...planView(p), children: p.childIds.map((i) => ({ _id: i, name: names.get(String(i)) || '' })) })) }); });
async function savePlan(req, res, plan) {
  const b = req.body || {}; const r = await E.roomFor(req, plan ? plan.roomId : b.roomId); if (r.error) return bad(res, ...r.error);
  const ref = b.activityRef !== undefined ? b.activityRef : plan?.activityRef; const act = await findActivity(req, ref); if (!act) return bad(res, 404, 'Choose a published activity.');
  const ids = b.childIds !== undefined ? [...new Set((b.childIds || []).map(String))].filter(oid) : (plan?.childIds || []).map(String); if (!ids.length || ids.length > 12) return bad(res, 400, 'Choose between 1 and 12 children for the group.');
  if ((await EyPlacement.countDocuments({ schoolId: sid(req), roomId: r.room._id, childId: { $in: ids.map(oid) }, to: null })) !== ids.length) return bad(res, 422, 'Every child in the group must be in this room.');
  const day = b.day !== undefined ? b.day : plan?.day || await E.today(req.user.schoolId); if (!E.isDay(day)) return bad(res, 400, 'Choose a date.'); const t = act.groupMax && ids.length > act.groupMax ? `This activity works best with up to ${act.groupMax} children.` : '';
  const vals = { roomId: r.room._id, day, slot: pick(b.slot !== undefined ? b.slot : plan?.slot, ['Morning', 'Midday', 'Afternoon'], 'Morning'), groupName: clean(b.groupName !== undefined ? b.groupName : plan?.groupName, 60), childIds: ids.map(oid), activityRef: String(ref), activityTitle: act.title, areaKey: act.areaKey || '', staffId: oid(req.user.userId), staffName: req.actorName || '', note: clean(b.note !== undefined ? b.note : plan?.note, 300) };
  let p; if (plan) { if (plan.status !== 'Planned') return bad(res, 409, 'Only a planned activity can change.'); Object.assign(plan, vals); p = await plan.save(); } else p = await EyPlan.create({ schoolId: sid(req), ...vals });
  res.status(plan ? 200 : 201).json({ plan: planView(p), warning: t });
}
exports.createPlan = wrap('createPlan', (req, res) => savePlan(req, res, null));
exports.updatePlan = wrap('updatePlan', async (req, res) => { const p = oid(req.params.id) ? await EyPlan.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!p) return bad(res, 404, 'That plan is not in your school.'); return savePlan(req, res, p); });
exports.donePlan = wrap('donePlan', async (req, res) => {
  const p = oid(req.params.id) ? await EyPlan.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!p) return bad(res, 404, 'That plan is not in your school.'); const r = await E.roomFor(req, p.roomId); if (r.error) return bad(res, ...r.error);
  if (p.status !== 'Planned') return bad(res, 409, 'This activity is already closed.'); const day = await E.today(req.user.schoolId); const here = new Set((await EyDay.find({ schoolId: sid(req), roomId: p.roomId, day, status: 'In', childId: { $in: p.childIds } })).map((d) => String(d.childId)));
  const f = await ensureBuiltin(req.user.schoolId); const made = []; for (const o of Array.isArray(req.body?.observations) ? req.body.observations.slice(0, 40) : []) { if (!p.childIds.map(String).includes(String(o.childId))) return bad(res, 400, 'An observation is for a child who was not in the group.'); const hit = itemOf(f, o.itemKey); if (!hit || !['Exploring', 'Practising', 'Confident'].includes(o.level)) return bad(res, 400, 'Each observation needs a milestone and a level.'); made.push({ schoolId: sid(req), childId: oid(o.childId), roomId: p.roomId, frameworkId: f._id, frameworkVersion: f.version, areaKey: hit.area.key, itemKey: hit.item.key, level: o.level, note: clean(o.note, 400), day, byId: oid(req.user.userId), byName: req.actorName || '', planId: p._id }); }
  for (const m of made) await EyObs.create(m); let logged = 0; for (const id of p.childIds) if (here.has(String(id))) { try { await EyCare.create({ schoolId: sid(req), childId: id, roomId: p.roomId, day, at: new Date(), careType: 'activity', data: { title: p.activityTitle, ref: p.activityRef }, text: '', authorId: oid(req.user.userId), authorName: req.actorName || '', key: `plan:${p._id}:${id}` }); logged += 1; } catch (e) { /* already logged */ } }
  p.status = 'Done'; p.outcome = clean(req.body?.outcome, 500); p.doneAt = new Date(); await p.save(); res.json({ plan: planView(p), observations: made.length, loggedInDiary: logged });
});
exports.skipPlan = wrap('skipPlan', async (req, res) => { const p = oid(req.params.id) ? await EyPlan.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!p) return bad(res, 404, 'That plan is not in your school.'); const r = await E.roomFor(req, p.roomId); if (r.error) return bad(res, ...r.error); if (p.status !== 'Planned') return bad(res, 409, 'This activity is already closed.'); p.status = 'Skipped'; p.outcome = clean(req.body?.outcome, 300); await p.save(); res.json({ plan: planView(p) }); });

/* ───────── routines ───────── */
function cleanSteps(steps) {
  if (!Array.isArray(steps) || !steps.length || steps.length > 16) return { error: 'Give between 1 and 16 steps.' }; const out = []; let prev = '';
  for (const s of steps) { if (!HM.test(String(s.at || ''))) return { error: 'Every step needs a time as HH:MM.' }; if (prev && s.at < prev) return { error: 'Put the steps in time order.' }; prev = s.at; if (!C.ICONS.includes(s.icon)) return { error: 'Choose a picture from the list for each step.' }; const label = clean(s.label, 40) || C.ICON_LABEL[s.icon]; const mn = Number(s.minutes ?? 15); if (!Number.isFinite(mn) || mn < 1 || mn > 240) return { error: 'Minutes must be between 1 and 240.' }; out.push({ at: s.at, icon: s.icon, label, labelUr: clean(s.labelUr, 40), minutes: Math.round(mn) }); }
  return { steps: out };
}
const routineView = (r) => ({ _id: r._id, roomId: r.roomId, name: r.name, active: r.active, shareWithFamilies: r.shareWithFamilies, steps: r.steps, byName: r.byName });
exports.icons = wrap('icons', async (req, res) => res.json({ icons: C.ICONS.map((k) => ({ key: k, label: C.ICON_LABEL[k] })) }));
exports.listRoutines = wrap('routines', async (req, res) => { const r = await E.roomFor(req, req.query.roomId); if (r.error) return bad(res, ...r.error); const rows = await EyRoutine.find({ schoolId: sid(req), roomId: r.room._id, active: true }).sort({ name: 1 }); res.json({ routines: rows.map(routineView) }); });
exports.saveRoutine = wrap('saveRoutine', async (req, res) => {
  const b = req.body || {}; let row = null; if (req.params.id) { row = oid(req.params.id) ? await EyRoutine.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!row) return bad(res, 404, 'That routine is not in your school.'); }
  const r = await E.roomFor(req, row ? row.roomId : b.roomId); if (r.error) return bad(res, ...r.error); const name = clean(b.name !== undefined ? b.name : row?.name, 60); if (name.length < 2) return bad(res, 400, 'Name the routine.'); const cs = cleanSteps(b.steps !== undefined ? b.steps : row?.steps); if (cs.error) return bad(res, 400, cs.error);
  const vals = { name, steps: cs.steps, shareWithFamilies: b.shareWithFamilies !== undefined ? !!b.shareWithFamilies : row ? row.shareWithFamilies : true, byName: req.actorName || '' }; if (row) { Object.assign(row, vals); await row.save(); } else row = await EyRoutine.create({ schoolId: sid(req), roomId: r.room._id, ...vals }); res.status(req.params.id ? 200 : 201).json({ routine: routineView(row) });
});
exports.deleteRoutine = wrap('deleteRoutine', async (req, res) => { const row = oid(req.params.id) ? await EyRoutine.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!row) return bad(res, 404, 'That routine is not in your school.'); const r = await E.roomFor(req, row.roomId); if (r.error) return bad(res, ...r.error); row.active = false; await row.save(); res.json({ ok: true }); });

/* ───────── practice ───────── */
exports.addPractice = wrap('practice', async (req, res) => {
  const b = req.body || {}; if (['score', 'points', 'marks', 'rank', 'grade', 'percent'].some((k) => k in b)) return bad(res, 400, 'No scores are kept for early years practice. Describe what you saw instead.');
  const c = await E.childIn(req, b.childId); if (c.error) return bad(res, ...c.error); const kind = pick(b.kind, ['tracing', 'matching', 'phonics', 'counting'], ''); if (!kind) return bad(res, 400, 'Choose tracing, matching, phonics or counting.');
  const p = await EyPractice.create({ schoolId: sid(req), childId: c.child._id, roomId: c.room._id, kind, item: clean(b.item, 40), effort: pick(b.effort, ['Exploring', 'Following', 'Steady'], 'Exploring'), note: clean(b.note, 300), day: await E.today(req.user.schoolId), byId: oid(req.user.userId), byName: req.actorName || '' }); res.status(201).json({ practice: { _id: p._id, kind: p.kind, item: p.item, effort: p.effort, note: p.note, day: p.day } });
});
exports.listPractice = wrap('listPractice', async (req, res) => { const c = await E.childIn(req, req.params.id); if (c.error) return bad(res, ...c.error); const rows = await EyPractice.find({ schoolId: sid(req), childId: c.child._id }).sort({ createdAt: -1 }).limit(60); res.json({ practice: rows.map((p) => ({ _id: p._id, kind: p.kind, item: p.item, effort: p.effort, note: p.note, day: p.day, byName: p.byName })) }); });

/* ───────── printable sheets ───────── */
const sendPdf = (res, buf, name) => { res.set('Content-Type', 'application/pdf'); res.set('Content-Disposition', `inline; filename="${name}"`); res.set('Cache-Control', 'private, no-store'); res.send(buf); };
exports.tracingSheet = wrap('tracingSheet', async (req, res) => {
  const text = clean(req.query.text, 12); const pat = clean(req.query.pattern, 12); if (!pat && !W.GLYPHS.test(text)) return bad(res, 400, 'Give 1 to 12 letters or numbers, or choose a pattern.'); if (pat && !W.PATTERNS.includes(pat)) return bad(res, 400, 'Choose a pattern from the list.');
  const sc = await School.findById(sid(req)).select('name'); sendPdf(res, await W.tracing({ text, pattern: pat || undefined, rows: req.query.rows, school: sc?.name || '' }), 'tracing.pdf');
});
exports.observationSheet = wrap('observationSheet', async (req, res) => {
  const r = await E.roomFor(req, req.query.roomId); if (r.error) return bad(res, ...r.error); let title = 'Observation sheet'; let items = []; let ids = null; const day = E.isDay(req.query.day) ? req.query.day : await E.today(req.user.schoolId);
  if (req.query.planId) { const p = oid(req.query.planId) ? await EyPlan.findOne({ _id: req.query.planId, schoolId: sid(req), roomId: r.room._id }) : null; if (!p) return bad(res, 404, 'That plan is not here.'); title = p.activityTitle; ids = p.childIds; const f = await ensureBuiltin(req.user.schoolId); items = f.areas.filter((a) => a.key === p.areaKey).flatMap((a) => a.items.map((i) => i.label)).slice(0, 8); }
  if (req.query.itemKeys) { const f = await ensureBuiltin(req.user.schoolId); const keys = String(req.query.itemKeys).split(',').slice(0, 8); items = keys.map((k) => itemOf(f, k)?.item.label).filter(Boolean); } if (!items.length) items = ['Joined in', 'Used words', 'Took a turn'];
  const pl = await EyPlacement.find({ schoolId: sid(req), roomId: r.room._id, to: null }); const kids = (await Student.find({ _id: { $in: (ids || pl.map((x) => x.childId)).map(oid) } }).select('name')).map((s) => s.name).sort(); const sc = await School.findById(sid(req)).select('name');
  sendPdf(res, await W.observation({ title, room: r.room.name, day, kids, items, school: sc?.name || '' }), 'observation.pdf');
});

exports._internals = { ensureBuiltin, activityPool, cleanAreas };
