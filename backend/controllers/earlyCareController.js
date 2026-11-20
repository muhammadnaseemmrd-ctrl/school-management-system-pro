// Care entries, the child's safety profile and consent, photos, and the family diary (PRD E15: CAP-0271, 0274, 0283–0287).
//   A family sees an entry only after a second person has reviewed the diary it is in, only for a child whose family agreed to what is shown.
const E = require('../utils/early/service');
const G = require('../utils/guardianRights');
const N = require('../utils/notify');
const C = require('../utils/early/content');
const { audit } = require('../utils/audit');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const User = require('../models/User');
const EyRoom = require('../models/EyRoom');
const EyPlacement = require('../models/EyPlacement');
const EyDay = require('../models/EyDay');
const EyCare = require('../models/EyCare');
const EyProfile = require('../models/EyProfile');
const EyMedia = require('../models/EyMedia');
const EyPost = require('../models/EyPost');
const EyObs = require('../models/EyObs');
const EyRoutine = require('../models/EyRoutine');
const EyFramework = require('../models/EyFramework');

const { oid, sid, bad, wrap, clean } = E;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);
const mins = (a, b) => { const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); const d = h2 * 60 + m2 - (h1 * 60 + m1); return d >= 0 ? d : d + 1440; };
const hhmm = (d) => `${String(new Date(d).getUTCHours()).padStart(2, '0')}:${String(new Date(d).getUTCMinutes()).padStart(2, '0')}`;
// Words that name a diagnosis. A support note records what helps, not what a child "has"; this only suggests a rewording and never blocks.
const DIAGNOSTIC = /\b(autis\w*|adhd|add|asd|dyslex\w*|dyspraxi\w*|down'?s|cerebral palsy|delay(?:ed)?|disorder|syndrome|retard\w*|spectrum)\b/i;

/* ───────── care entries ───────── */
function cleanData(type, d = {}, text = '') {
  const o = {};
  if (type === 'meal') { o.course = pick(d.course, ['breakfast', 'snack', 'lunch', 'tea', 'other'], 'other'); o.item = clean(d.item, 80); o.amount = pick(d.amount, ['none', 'some', 'half', 'most', 'all'], 'some'); }
  else if (type === 'drink') { o.item = clean(d.item, 60) || 'water'; if (d.ml !== undefined) { const n = Number(d.ml); if (!Number.isFinite(n) || n < 0 || n > 600) return { error: 'Enter the amount of drink in millilitres, up to 600.' }; o.ml = Math.round(n); } }
  else if (type === 'nap') { for (const k of ['start', 'end']) if (d[k]) { if (!HM.test(String(d[k]))) return { error: 'Give nap times as HH:MM.' }; o[k] = d[k]; } if (!o.start && !o.end) return { error: 'Give when the nap started or ended.' }; if (o.start && o.end) o.minutes = mins(o.start, o.end); }
  else if (type === 'toilet') { o.kind = pick(d.kind, ['wet', 'soiled', 'dry', 'potty', 'accident'], 'wet'); }
  else if (type === 'mood') { o.value = pick(d.value, ['happy', 'calm', 'excited', 'tired', 'clingy', 'upset', 'unwell'], 'calm'); }
  else if (type === 'health') { if (clean(text, 400).length < 3) return { error: 'Write what you noticed.' }; if (d.temperatureC !== undefined && d.temperatureC !== '') { const t = Number(d.temperatureC); if (!Number.isFinite(t) || t < 33 || t > 43) return { error: 'Temperature must be between 33 and 43 °C.' }; o.temperatureC = t; } if (d.onArrival) o.onArrival = true; }
  else if (type === 'medication') { o.name = clean(d.name, 60); o.dose = clean(d.dose, 40); if (!o.name || !o.dose) return { error: 'Give the medicine and the dose.' }; if (d.permission !== true) return { error: 'Medicine is given only with written permission from the family. Confirm you have it.' }; o.permission = true; o.givenBy = clean(d.givenBy, 60); }
  else if (type === 'activity') { o.title = clean(d.title, 80); if (!o.title && clean(text, 100).length < 3) return { error: 'Say what the activity was.' }; if (d.ref) o.ref = clean(d.ref, 40); }
  else if (['observation', 'note', 'behavior'].includes(type)) { if (clean(text, 800).length < 3) return { error: 'Write a few words.' }; if (type === 'behavior') o.whatHelped = clean(d.whatHelped, 300); }
  return { data: o };
}
const TYPES = ['meal', 'drink', 'nap', 'toilet', 'mood', 'health', 'medication', 'activity', 'observation', 'behavior', 'note'];
const view = (c) => ({ _id: c._id, childId: c.childId, roomId: c.roomId, day: c.day, at: c.at, time: hhmm(c.at), careType: c.careType, data: c.data, text: c.text, authorName: c.authorName, state: c.state, voidReason: c.voidReason, correctsId: c.correctsId, bulkId: c.bulkId, shared: !!c.sharedAt, discussedAt: c.discussedAt, discussedWith: c.discussedWith });

exports.bulk = wrap('bulk', async (req, res) => {
  const b = req.body || {}; const r = await E.roomFor(req, b.roomId); if (r.error) return bad(res, ...r.error);
  const type = b.careType; if (!TYPES.includes(type)) return bad(res, 400, 'Choose what you are recording.');
  const ids = [...new Set((b.childIds || []).map(String))].filter((x) => oid(x)); if (!ids.length || ids.length > 40) return bad(res, 400, 'Choose between 1 and 40 children.');
  const day = await E.today(req.user.schoolId); const now = new Date(); let at = b.at ? new Date(b.at) : now;
  if (Number.isNaN(at.getTime()) || at > new Date(now.getTime() + 5 * 60000) || at < new Date(now.getTime() - 24 * 3600000)) return bad(res, 400, 'The time must be within the last 24 hours and not in the future.');
  const st = await E.getSettings(sid(req)); const placements = await EyPlacement.find({ schoolId: sid(req), roomId: r.room._id, childId: { $in: ids.map(oid) }, to: null }); const inRoom = new Set(placements.map((p) => String(p.childId)));
  const days = await EyDay.find({ schoolId: sid(req), roomId: r.room._id, day, childId: { $in: ids.map(oid) } }); const here = new Set(days.filter((d) => d.status === 'In').map((d) => String(d.childId)));
  const names = new Map((await Student.find({ _id: { $in: ids.map(oid) } }).select('name')).map((s) => [String(s._id), s.name]));
  const clientKey = clean(b.clientKey, 60) || `srv:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`; const bulkId = clientKey;
  const out = { recorded: [], skipped: [], already: 0, notes: [] };
  for (const id of ids) {
    if (!inRoom.has(id)) { out.skipped.push({ childId: id, name: names.get(id) || '', why: 'Not in this room.' }); continue; }
    if (!here.has(id)) { out.skipped.push({ childId: id, name: names.get(id) || '', why: 'Not checked in today.' }); continue; }
    const per = (b.perChild || {})[id] || {}; const text = clean(per.text !== undefined ? per.text : b.text, 800); const cd = cleanData(type, { ...(b.data || {}), ...(per.data || {}) }, text);
    if (cd.error) return bad(res, 400, cd.error, { childId: id, name: names.get(id) || '' });
    if (type === 'nap' && cd.data.minutes > st.napAlertMinutes) out.notes.push(`${names.get(id) || 'A child'} slept ${cd.data.minutes} minutes, longer than the ${st.napAlertMinutes} minute reminder.`);
    try { const row = await require('../models/EyCare').create({ schoolId: sid(req), childId: oid(id), roomId: r.room._id, day, at, careType: type, data: cd.data, text, authorId: oid(req.user.userId), authorName: req.actorName || '', bulkId, key: `${clientKey}:${id}` }); out.recorded.push(view(row)); }
    catch (e) { if (e && (e.code === 11000 || /duplicate/i.test(e.message))) out.already += 1; else throw e; }
  }
  if (['health', 'medication'].includes(type) && out.recorded.length) {
    for (const row of out.recorded) await N.notify({ schoolId: req.user.schoolId, recipients: await N.parentsOf(req.user.schoolId, [row.childId], 'viewInfo'), title: `A ${type === 'health' ? 'health' : 'medicine'} note was recorded for ${names.get(String(row.childId)) || 'your child'}`, body: 'Please speak to a carer at pickup. The details will be in the diary once it is reviewed.', link: '#/earlyYears', type: 'attendance', key: `ey-care:${row._id}` });
  }
  res.status(out.recorded.length ? 201 : 200).json(out);
});

exports.listCare = wrap('listCare', async (req, res) => {
  const q = { schoolId: sid(req) }; const scope = await E.scopeOf(req);
  if (req.query.roomId) { const r = await E.roomFor(req, req.query.roomId); if (r.error) return bad(res, ...r.error); q.roomId = r.room._id; } else if (!scope.admin) q.roomId = { $in: [...scope.rooms].map(oid) };
  if (req.query.childId) { if (!oid(req.query.childId)) return bad(res, 400, 'Choose a child.'); q.childId = oid(req.query.childId); }
  q.day = E.isDay(req.query.day) ? req.query.day : await E.today(req.user.schoolId); if (TYPES.includes(req.query.type)) q.careType = req.query.type; if (req.query.voided !== '1') q.state = 'Active';
  const rows = await EyCare.find(q).sort({ at: -1 }).limit(300); res.json({ entries: rows.map(view), day: q.day });
});

exports.timeline = wrap('timeline', async (req, res) => {
  const c = await E.childIn(req, req.params.id); if (c.error) return bad(res, ...c.error);
  const day = E.isDay(req.query.day) ? req.query.day : await E.today(req.user.schoolId);
  const [rows, d] = await Promise.all([EyCare.find({ schoolId: sid(req), childId: c.child._id, day }).sort({ at: 1 }), EyDay.findOne({ schoolId: sid(req), childId: c.child._id, day })]);
  const act = rows.filter((x) => x.state === 'Active'); const nap = act.filter((x) => x.careType === 'nap' && x.data?.minutes).reduce((s, x) => s + x.data.minutes, 0);
  res.json({ child: { _id: c.child._id, name: c.child.name, age: E.ageLabel(E.ageMonths(c.child.dateOfBirth)) }, day, status: d ? { status: d.status, inAt: d.inAt, outAt: d.outAt, inFlag: d.inFlag } : { status: 'Expected' }, entries: rows.map(view), summary: { meals: act.filter((x) => x.careType === 'meal').length, napMinutes: nap, toilet: act.filter((x) => x.careType === 'toilet').length } });
});

async function entryFor(req, id) {
  const c = oid(id) ? await EyCare.findOne({ _id: id, schoolId: sid(req) }) : null; if (!c) return { error: [404, 'That entry is not in your school.'] };
  const r = await E.roomFor(req, c.roomId); if (r.error) return r;
  if (!r.scope.admin && String(c.authorId) !== String(req.user.userId) && !E.isLead(r.scope, r.room)) return { error: [403, 'Only the carer who wrote it, the room lead or an administrator can change an entry.'] };
  return { c, ...r };
}
exports.correct = wrap('correct', async (req, res) => {
  const f = await entryFor(req, req.params.id); if (f.error) return bad(res, ...f.error); const reason = clean(req.body?.reason, 200); if (reason.length < 3) return bad(res, 400, 'Write why it is being changed.');
  const { c } = f; if (c.state !== 'Active') return bad(res, 409, 'That entry has already been replaced.');
  const text = req.body?.text !== undefined ? clean(req.body.text, 800) : c.text; const cd = cleanData(c.careType, { ...(c.data || {}), ...(req.body?.data || {}) }, text); if (cd.error) return bad(res, 400, cd.error);
  const n = await EyCare.create({ schoolId: c.schoolId, childId: c.childId, roomId: c.roomId, day: c.day, at: c.at, careType: c.careType, data: cd.data, text, authorId: oid(req.user.userId), authorName: req.actorName || '', bulkId: c.bulkId, key: `fix:${c._id}:${Date.now()}`, correctsId: c._id });
  c.state = 'Voided'; c.voidReason = reason; c.voidedByName = req.actorName || ''; c.voidedAt = new Date(); await c.save();
  if (c.sharedAt) { const p = await EyPost.findOne({ schoolId: sid(req), careIds: c._id, state: 'Published' }); if (p) { p.careIds = p.careIds.map((x) => (String(x) === String(c._id) ? n._id : x)); p.history = [...(p.history || []), { at: new Date(), byName: req.actorName || '', action: 'entry corrected', note: reason }]; await p.save(); n.sharedAt = new Date(); n.sharedPostId = p._id; await n.save(); await N.notify({ schoolId: req.user.schoolId, recipients: await N.parentsOf(req.user.schoolId, [c.childId], 'viewInfo'), title: 'A diary entry was corrected', body: 'The nursery changed an entry in your child\'s diary.', link: '#/earlyYears', type: 'attendance', key: `ey-fix:${n._id}` }); } }
  await audit(req, { action: 'early.care.correct', entityType: 'EyCare', entityId: c._id, schoolId: sid(req), detail: { reason, replacement: n._id } }); res.json({ entry: view(n) });
});
exports.voidEntry = wrap('void', async (req, res) => {
  const f = await entryFor(req, req.params.id); if (f.error) return bad(res, ...f.error); const reason = clean(req.body?.reason, 200); if (reason.length < 3) return bad(res, 400, 'Write why it is being removed.');
  if (f.c.state !== 'Active') return bad(res, 409, 'That entry is already removed.'); if (f.c.sharedAt) return bad(res, 422, 'This entry is in a published diary. Correct it instead, or withdraw the diary first.');
  f.c.state = 'Voided'; f.c.voidReason = reason; f.c.voidedByName = req.actorName || ''; f.c.voidedAt = new Date(); await f.c.save(); await audit(req, { action: 'early.care.void', entityType: 'EyCare', entityId: f.c._id, schoolId: sid(req), detail: { reason } }); res.json({ ok: true });
});
exports.discussed = wrap('discussed', async (req, res) => {
  const f = await entryFor(req, req.params.id); if (f.error) return bad(res, ...f.error); if (f.c.careType !== 'behavior') return bad(res, 422, 'Only a behaviour note needs this.');
  const w = clean(req.body?.with, 80); if (w.length < 2) return bad(res, 400, 'Say who in the family you talked to.'); f.c.discussedAt = new Date(); f.c.discussedWith = w; await f.c.save(); res.json({ entry: view(f.c) });
});

/* ───────── safety profile, consent, safety card ───────── */
const profileView = (p, full = true) => ({ allergies: (p?.allergies || []).map((a) => ({ what: a.what, severity: a.severity, action: a.action, confirmed: !!a.confirmed })), diet: p?.diet || '', medicalAlert: p?.medicalAlert || '', emergencyContacts: (p?.emergencyContacts || []).map((c) => ({ name: c.name, relationship: c.relationship, phone: c.phone })), comfort: p?.comfort || '', supports: full ? (p?.supports || []).map((s) => ({ situation: s.situation, support: s.support, agreedWith: s.agreedWith, agreedAt: s.agreedAt, reviewDue: s.reviewDue })) : [], consent: { journal: p?.consent?.journal !== false, photos: !!p?.consent?.photos, portfolio: !!p?.consent?.portfolio, setByName: p?.consent?.setByName || '', setAt: p?.consent?.setAt, source: p?.consent?.source || '' }, confirmedAt: p?.confirmedAt, confirmedByName: p?.confirmedByName, confirmedWith: p?.confirmedWith, pendingCount: (p?.pending || []).filter((x) => x.state === 'Waiting').length });
function cleanProfile(b) {
  const out = {}; const warnings = [];
  if (b.allergies !== undefined) { if (!Array.isArray(b.allergies) || b.allergies.length > 12) return { error: 'List up to 12 allergies.' }; out.allergies = []; for (const a of b.allergies) { const what = clean(a.what, 80); if (!what) continue; out.allergies.push({ what, severity: pick(a.severity, ['mild', 'moderate', 'severe'], 'moderate'), action: clean(a.action, 200) }); } }
  if (b.diet !== undefined) out.diet = clean(b.diet, 200);
  if (b.medicalAlert !== undefined) { out.medicalAlert = clean(b.medicalAlert, 140); if (DIAGNOSTIC.test(out.medicalAlert)) warnings.push('The alert reads like a diagnosis. Say what carers should do instead, for example "needs inhaler close by".'); }
  if (b.emergencyContacts !== undefined) { if (!Array.isArray(b.emergencyContacts) || b.emergencyContacts.length > 5) return { error: 'List up to 5 emergency contacts.' }; out.emergencyContacts = []; for (const c of b.emergencyContacts) { const name = clean(c.name, 80); const phone = clean(c.phone, 30); if (!name && !phone) continue; if (!name || phone.replace(/\D/g, '').length < 7) return { error: 'Each emergency contact needs a name and a phone number.' }; out.emergencyContacts.push({ name, relationship: clean(c.relationship, 40), phone }); } }
  if (b.comfort !== undefined) out.comfort = clean(b.comfort, 300);
  if (b.supports !== undefined) { if (!Array.isArray(b.supports) || b.supports.length > 8) return { error: 'List up to 8 supports.' }; out.supports = []; for (const s of b.supports) { const situation = clean(s.situation, 160); const support = clean(s.support, 300); if (!situation && !support) continue; if (!situation || !support) return { error: 'Each support needs both when it is needed and what helps.' }; if (DIAGNOSTIC.test(situation + ' ' + support)) warnings.push('A support reads like a diagnosis. Describe what the child needs and what helps, not a label.'); out.supports.push({ situation, support, agreedWith: clean(s.agreedWith, 80), agreedAt: new Date(), reviewDue: HM.test('00:00') && /^\d{4}-\d{2}-\d{2}$/.test(String(s.reviewDue || '')) ? s.reviewDue : '' }); } }
  return { out, warnings };
}
const touchesSafety = (o) => o.allergies !== undefined || o.emergencyContacts !== undefined || o.medicalAlert !== undefined || o.diet !== undefined;
exports.getProfile = wrap('getProfile', async (req, res) => {
  const c = await E.childIn(req, req.params.id); if (c.error) return bad(res, ...c.error);
  const p = await EyProfile.findOne({ schoolId: sid(req), childId: c.child._id }); res.json({ child: { _id: c.child._id, name: c.child.name, age: E.ageLabel(E.ageMonths(c.child.dateOfBirth)) }, profile: profileView(p), pending: (p?.pending || []).filter((x) => x.state === 'Waiting').map((x) => ({ _id: x._id, at: x.at, byName: x.byName, proposal: x.proposal })) });
});
exports.putProfile = wrap('putProfile', async (req, res) => {
  const c = await E.childIn(req, req.params.id); if (c.error) return bad(res, ...c.error); const cp = cleanProfile(req.body || {}); if (cp.error) return bad(res, 400, cp.error);
  const safety = touchesSafety(cp.out); const confirmedWith = clean(req.body?.confirmedWith, 80); if (safety && confirmedWith.length < 2) return bad(res, 400, 'Allergies, diet, alerts and emergency contacts must be confirmed with a named member of the family. Say who you spoke to.');
  const p = (await EyProfile.findOne({ schoolId: sid(req), childId: c.child._id })) || new EyProfile({ schoolId: sid(req), childId: c.child._id });
  if (cp.out.allergies) p.allergies = cp.out.allergies.map((a) => ({ ...a, confirmed: true })); for (const k of ['diet', 'medicalAlert', 'emergencyContacts', 'comfort', 'supports']) if (cp.out[k] !== undefined) p[k] = cp.out[k];
  if (safety) { p.confirmedAt = new Date(); p.confirmedByName = req.actorName || ''; p.confirmedWith = confirmedWith; } p.updatedByName = req.actorName || ''; await p.save();
  await audit(req, { action: 'early.profile.update', entityType: 'Student', entityId: c.child._id, schoolId: sid(req), detail: { fields: Object.keys(cp.out), confirmedWith: safety ? confirmedWith : '' } }); res.json({ profile: profileView(p), warnings: cp.warnings });
});
exports.decidePending = wrap('decidePending', async (req, res) => {
  const c = await E.childIn(req, req.params.id); if (c.error) return bad(res, ...c.error); if (!E.isLead(c.scope, c.room)) return bad(res, 403, 'Only the room lead or an administrator can confirm a change from a family.');
  const p = await EyProfile.findOne({ schoolId: sid(req), childId: c.child._id }); const item = p?.pending?.find((x) => String(x._id) === String(req.params.pid)); if (!item) return bad(res, 404, 'That request is not here.'); if (item.state !== 'Waiting') return bad(res, 409, 'That request was already decided.');
  const decision = req.body?.decision; if (!['apply', 'decline'].includes(decision)) return bad(res, 400, 'Choose apply or decline.');
  if (decision === 'apply') { const confirmedWith = clean(req.body?.confirmedWith, 80); if (confirmedWith.length < 2) return bad(res, 400, 'Confirm the change with the family and say who you spoke to.'); const cp = cleanProfile(item.proposal || {}); if (cp.error) return bad(res, 422, cp.error); for (const k of Object.keys(cp.out)) p[k] = k === 'allergies' ? cp.out[k].map((a) => ({ ...a, confirmed: true })) : cp.out[k]; p.confirmedAt = new Date(); p.confirmedByName = req.actorName || ''; p.confirmedWith = confirmedWith; item.state = 'Applied'; }
  else item.state = 'Declined'; item.decidedByName = req.actorName || ''; item.decidedAt = new Date(); item.note = clean(req.body?.note, 200); p.markModified('pending'); await p.save();
  await N.notify({ schoolId: req.user.schoolId, recipients: await N.parentsOf(req.user.schoolId, [c.child._id], 'viewInfo'), title: decision === 'apply' ? 'Your update was added to your child\'s record' : 'Your update was not added', body: item.note || '', link: '#/earlyYears', type: 'attendance', key: `ey-prof:${item._id}` }); res.json({ profile: profileView(p) });
});
exports.putConsent = wrap('putConsent', async (req, res) => {
  const c = await E.childIn(req, req.params.id); if (c.error) return bad(res, ...c.error); if (!E.isLead(c.scope, c.room)) return bad(res, 403, 'Only the room lead or an administrator can record consent for a family.');
  const w = clean(req.body?.confirmedWith, 80); if (w.length < 2) return bad(res, 400, 'Say which member of the family gave this consent, and how.'); await setConsent(req, c.child._id, req.body, 'office', `${req.actorName || ''} with ${w}`); const p = await EyProfile.findOne({ schoolId: sid(req), childId: c.child._id }); res.json({ consent: profileView(p).consent });
});
async function setConsent(req, childId, b, source, byName) {
  const p = (await EyProfile.findOne({ schoolId: sid(req), childId })) || new EyProfile({ schoolId: sid(req), childId }); const cur = { journal: p.consent?.journal !== false, photos: !!p.consent?.photos, portfolio: !!p.consent?.portfolio };
  const next = { journal: b.journal !== undefined ? !!b.journal : cur.journal, photos: b.photos !== undefined ? !!b.photos : cur.photos, portfolio: b.portfolio !== undefined ? !!b.portfolio : cur.portfolio };
  p.consent = { ...next, setByName: byName, setAt: new Date(), source }; p.consentHistory = [...(p.consentHistory || []), { at: new Date(), byName, source, ...next }]; await p.save();
  await audit(req, { action: 'early.consent', entityType: 'Student', entityId: childId, schoolId: sid(req), detail: { before: cur, after: next, source } }); return p;
}
exports.safetyCard = wrap('safetyCard', async (req, res) => {
  const r = await E.roomFor(req, req.params.id); if (r.error) return bad(res, ...r.error); const day = await E.today(req.user.schoolId);
  const pl = await EyPlacement.find({ schoolId: sid(req), roomId: r.room._id, to: null }); const ids = pl.map((p) => p.childId);
  const [kids, profiles, days] = await Promise.all([Student.find({ _id: { $in: ids } }).select('name dateOfBirth'), EyProfile.find({ schoolId: sid(req), childId: { $in: ids } }), EyDay.find({ schoolId: sid(req), roomId: r.room._id, day, childId: { $in: ids } })]);
  const pm = new Map(profiles.map((p) => [String(p.childId), p])); const dm = new Map(days.map((d) => [String(d.childId), d.status]));
  const pend = new Map(profiles.map((p) => [String(p.childId), (p.pending || []).filter((x) => x.state === 'Waiting' && x.proposal?.allergies).length]));
  const rows = kids.sort((a, b) => a.name.localeCompare(b.name)).map((k) => { const p = pm.get(String(k._id)); return { childId: k._id, name: k.name, age: E.ageLabel(E.ageMonths(k.dateOfBirth)), here: dm.get(String(k._id)) === 'In', allergies: (p?.allergies || []).map((a) => ({ what: a.what, severity: a.severity, action: a.action, confirmed: !!a.confirmed })), unconfirmedFromFamily: pend.get(String(k._id)) || 0, medicalAlert: p?.medicalAlert || '', diet: p?.diet || '', emergency: (p?.emergencyContacts || []).slice(0, 2).map((c) => ({ name: c.name, relationship: c.relationship, phone: c.phone })) }; });
  await audit(req, { action: 'early.safety.view', entityType: 'EyRoom', entityId: r.room._id, schoolId: sid(req), detail: { children: rows.length } }); res.json({ room: { _id: r.room._id, name: r.room.name }, day, children: rows.sort((a, b) => Number(b.here) - Number(a.here)) });
});

/* ───────── photos ───────── */
function decodeImage(url, maxKb) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(url || '')); if (!m) return { error: 'Send the photo as a JPEG.' };
  const buf = Buffer.from(m[1], 'base64'); if (buf.length < 200 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return { error: 'That file is not a JPEG picture.' };
  if (buf.length > maxKb * 1024) return { error: `The photo is too big. The limit is ${maxKb} KB; make it smaller and try again.` }; return { buf };
}
const mediaView = (m) => ({ _id: m._id, roomId: m.roomId, childIds: m.childIds, day: m.day, alt: m.alt, caption: m.caption, size: m.size, state: m.state, byName: m.byName, createdAt: m.createdAt });
exports.uploadMedia = wrap('uploadMedia', async (req, res) => {
  const b = req.body || {}; const r = await E.roomFor(req, b.roomId); if (r.error) return bad(res, ...r.error); const st = await E.getSettings(sid(req));
  const alt = clean(b.alt, 200); if (alt.length < 3) return bad(res, 400, 'Describe the photo in a few words, so everyone can follow it.');
  const ids = [...new Set((b.childIds || []).map(String))].filter((x) => oid(x)); if (!ids.length || ids.length > 6) return bad(res, 400, 'Tag between 1 and 6 children who are in the photo.');
  if ((await EyPlacement.countDocuments({ schoolId: sid(req), roomId: r.room._id, childId: { $in: ids.map(oid) }, to: null })) !== ids.length) return bad(res, 422, 'Every child in the photo must be in this room.');
  const d = decodeImage(b.image, st.photoMaxKb); if (d.error) return bad(res, 400, d.error);
  const m = await EyMedia.create({ schoolId: sid(req), roomId: r.room._id, childIds: ids.map(oid), day: await E.today(req.user.schoolId), alt, caption: clean(b.caption, 200), size: d.buf.length, sha: E.sha(d.buf), image: d.buf, byId: oid(req.user.userId), byName: req.actorName || '' });
  res.status(201).json({ media: mediaView(m) });
});
exports.listMedia = wrap('listMedia', async (req, res) => {
  const q = { schoolId: sid(req) }; const scope = await E.scopeOf(req);
  if (req.query.roomId) { const r = await E.roomFor(req, req.query.roomId); if (r.error) return bad(res, ...r.error); q.roomId = r.room._id; } else if (!scope.admin) q.roomId = { $in: [...scope.rooms].map(oid) };
  if (req.query.childId && oid(req.query.childId)) q.childIds = oid(req.query.childId); if (E.isDay(req.query.day)) q.day = req.query.day; if (['Pending', 'Approved', 'Rejected'].includes(req.query.state)) q.state = req.query.state;
  const rows = await EyMedia.find(q).select('-image').sort({ createdAt: -1 }).limit(100); res.json({ media: rows.map(mediaView) });
});
exports.imageOf = wrap('image', async (req, res) => {
  const m = oid(req.params.id) ? await EyMedia.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!m || !m.image) return bad(res, 404, 'That photo is not here.');
  if (req.user.role === 'parent') {
    const posts = await EyPost.find({ schoolId: sid(req), mediaIds: m._id, state: 'Published' }).select('childId'); let ok = false;
    for (const p of posts) { if (!m.childIds.map(String).includes(String(p.childId))) continue; const rt = await G.resolve(req.user.schoolId, req.user.userId, p.childId); if (!rt.linked || !rt.rights.viewInfo) continue; const cons = await E.consentOf(req.user.schoolId, [p.childId]); if (cons.get(String(p.childId)).photos) { ok = true; break; } }
    if (!ok) return bad(res, 404, 'That photo is not here.');
  } else { const r = await E.roomFor(req, m.roomId); if (r.error) return bad(res, ...r.error); }
  res.set('Content-Type', 'image/jpeg'); res.set('Cache-Control', 'private, max-age=300'); res.set('X-Content-Type-Options', 'nosniff'); res.send(Buffer.from(m.image));
});
exports.deleteMedia = wrap('deleteMedia', async (req, res) => {
  const m = oid(req.params.id) ? await EyMedia.findOne({ _id: req.params.id, schoolId: sid(req) }).select('-image') : null; if (!m) return bad(res, 404, 'That photo is not here.');
  const r = await E.roomFor(req, m.roomId); if (r.error) return bad(res, ...r.error); if (!r.scope.admin && String(m.byId) !== String(req.user.userId) && !E.isLead(r.scope, r.room)) return bad(res, 403, 'Only who took it, the room lead or an administrator can remove a photo.');
  if (await EyPost.countDocuments({ schoolId: sid(req), mediaIds: m._id, state: 'Published' })) return bad(res, 409, 'This photo is in a published entry. Withdraw the entry first.');
  await EyMedia.deleteOne({ _id: m._id }); await EyPost.updateMany({ schoolId: sid(req), mediaIds: m._id }, { $pull: { mediaIds: m._id } }).catch(() => {}); await audit(req, { action: 'early.media.delete', entityType: 'EyMedia', entityId: m._id, schoolId: sid(req) }); res.json({ ok: true });
});

/* ───────── family diary ───────── */
const postView = (p, extra = {}) => ({ _id: p._id, childId: p.childId, roomId: p.roomId, day: p.day, kind: p.kind, lang: p.lang, title: p.title, body: p.body, teacherComment: p.teacherComment, careIds: p.careIds, mediaIds: p.mediaIds, obsIds: p.obsIds, state: p.state, authorName: p.authorName, submittedAt: p.submittedAt, reviewedByName: p.reviewedByName, reviewedAt: p.reviewedAt, reviewNote: p.reviewNote, soleReviewer: p.soleReviewer, publishedAt: p.publishedAt, retractReason: p.retractReason, history: p.history, ...extra });
async function checkRefs(req, childId, roomId, b) {
  const out = { careIds: [], mediaIds: [], obsIds: [] };
  if (b.careIds !== undefined) { const ids = [...new Set((b.careIds || []).map(String))].filter(oid); const rows = await EyCare.find({ schoolId: sid(req), childId, _id: { $in: ids.map(oid) }, state: 'Active' }); if (rows.length !== ids.length) return { error: 'One of the care entries is not for this child or was removed.' }; if (rows.some((c) => E.needsTalk(c) && !c.discussedAt)) return { error: 'A behaviour note can go in a diary only after you have talked it over with the family. Record that first.' }; out.careIds = rows.map((c) => c._id); }
  if (b.mediaIds !== undefined) { const ids = [...new Set((b.mediaIds || []).map(String))].filter(oid); const rows = await EyMedia.find({ schoolId: sid(req), _id: { $in: ids.map(oid) } }).select('-image'); if (rows.length !== ids.length || rows.some((m) => !m.childIds.map(String).includes(String(childId)))) return { error: 'Every photo must be one this child is tagged in.' }; out.mediaIds = rows.map((m) => m._id); }
  if (b.obsIds !== undefined) { const ids = [...new Set((b.obsIds || []).map(String))].filter(oid); const rows = await EyObs.find({ schoolId: sid(req), childId, _id: { $in: ids.map(oid) }, state: 'Active' }); if (rows.length !== ids.length) return { error: 'One of the observations is not for this child.' }; out.obsIds = rows.map((o) => o._id); }
  return { out };
}
async function postFor(req, id, { author = false } = {}) {
  const p = oid(id) ? await EyPost.findOne({ _id: id, schoolId: sid(req) }) : null; if (!p) return { error: [404, 'That entry is not in your school.'] };
  const r = await E.roomFor(req, p.roomId); if (r.error) return r; if (author && !r.scope.admin && String(p.authorId) !== String(req.user.userId) && !E.isLead(r.scope, r.room)) return { error: [403, 'Only the author, the room lead or an administrator can change it.'] }; return { p, ...r };
}
exports.createPost = wrap('createPost', async (req, res) => {
  const b = req.body || {}; const c = await E.childIn(req, b.childId); if (c.error) return bad(res, ...c.error);
  const kind = pick(b.kind, ['diary', 'portfolio', 'note'], 'diary'); const day = E.isDay(b.day) ? b.day : await E.today(req.user.schoolId); const refs = await checkRefs(req, c.child._id, c.room._id, b); if (refs.error) return bad(res, 400, refs.error);
  const body = clean(b.body, 2000); if (!body && !refs.out.careIds.length && !refs.out.mediaIds.length && !refs.out.obsIds.length) return bad(res, 400, 'Write something, or add care entries, a photo or an observation.');
  if (kind === 'diary' && (await EyPost.countDocuments({ schoolId: sid(req), childId: c.child._id, day, kind: 'diary', state: { $in: ['Draft', 'Review', 'Published'] } }))) return bad(res, 409, 'There is already a diary for this child today.');
  const p = await EyPost.create({ schoolId: sid(req), childId: c.child._id, roomId: c.room._id, day, kind, lang: pick(b.lang, ['en', 'ur'], 'en'), title: clean(b.title, 100), body, teacherComment: clean(b.teacherComment, 600), ...refs.out, authorId: oid(req.user.userId), authorName: req.actorName || '', history: [{ at: new Date(), byName: req.actorName || '', action: 'draft', note: '' }] });
  res.status(201).json({ post: postView(p) });
});
exports.generate = wrap('generate', async (req, res) => {
  const r = await E.roomFor(req, req.body?.roomId); if (r.error) return bad(res, ...r.error); const day = E.isDay(req.body?.day) ? req.body.day : await E.today(req.user.schoolId); const lang = pick(req.body?.lang, ['en', 'ur'], 'en');
  const days = await EyDay.find({ schoolId: sid(req), roomId: r.room._id, day, status: { $in: ['In', 'Out'] } }); let ids = days.map((d) => String(d.childId)); if (Array.isArray(req.body?.childIds)) ids = ids.filter((x) => req.body.childIds.map(String).includes(x));
  const made = []; const skipped = []; const names = new Map((await Student.find({ _id: { $in: ids.map(oid) } }).select('name')).map((s) => [String(s._id), s.name]));
  for (const id of ids) {
    if (await EyPost.countDocuments({ schoolId: sid(req), childId: oid(id), day, kind: 'diary', state: { $in: ['Draft', 'Review', 'Published'] } })) { skipped.push({ childId: id, name: names.get(id), why: 'Already has a diary.' }); continue; }
    const entries = (await EyCare.find({ schoolId: sid(req), childId: oid(id), day, state: 'Active' }).sort({ at: 1 })).filter((c) => !E.needsTalk(c) || c.discussedAt); const lines = entries.map((c) => E.line(c, lang));
    const first = (names.get(id) || '').split(' ')[0]; const intro = lang === 'ur' ? `${first} کا آج کا دن:` : `${first}'s day:`; const body = lines.length ? `${intro}\n${lines.map((l) => `${l.time} ${l.text}`).join('\n')}` : intro;
    const p = await EyPost.create({ schoolId: sid(req), childId: oid(id), roomId: r.room._id, day, kind: 'diary', lang, title: '', body, careIds: entries.map((c) => c._id), authorId: oid(req.user.userId), authorName: req.actorName || '', history: [{ at: new Date(), byName: req.actorName || '', action: 'draft from care log', note: `${entries.length} entries` }] }); made.push(p._id);
  }
  res.status(made.length ? 201 : 200).json({ created: made.length, skipped });
});
exports.updatePost = wrap('updatePost', async (req, res) => {
  const f = await postFor(req, req.params.id, { author: true }); if (f.error) return bad(res, ...f.error); const { p } = f; if (!['Draft', 'Withheld'].includes(p.state)) return bad(res, 409, 'Only a draft can be changed. Withdraw a published entry first.');
  const b = req.body || {}; const refs = await checkRefs(req, p.childId, p.roomId, b); if (refs.error) return bad(res, 400, refs.error);
  if (b.body !== undefined) p.body = clean(b.body, 2000); if (b.title !== undefined) p.title = clean(b.title, 100); if (b.teacherComment !== undefined) p.teacherComment = clean(b.teacherComment, 600); if (b.lang !== undefined) p.lang = pick(b.lang, ['en', 'ur'], p.lang);
  for (const k of ['careIds', 'mediaIds', 'obsIds']) if (b[k] !== undefined) p[k] = refs.out[k]; if (p.state === 'Withheld') p.state = 'Draft'; p.history = [...(p.history || []), { at: new Date(), byName: req.actorName || '', action: 'edited', note: '' }]; await p.save(); res.json({ post: postView(p) });
});
exports.submitPost = wrap('submitPost', async (req, res) => {
  const f = await postFor(req, req.params.id, { author: true }); if (f.error) return bad(res, ...f.error); const { p } = f; if (!['Draft', 'Withheld'].includes(p.state)) return bad(res, 409, 'This entry is already with the reviewer or published.');
  if (!p.body && !p.careIds.length && !p.mediaIds.length && !p.obsIds.length) return bad(res, 422, 'There is nothing in this entry yet.');
  p.state = 'Review'; p.submittedAt = new Date(); p.history = [...(p.history || []), { at: new Date(), byName: req.actorName || '', action: 'sent for review', note: '' }]; await p.save();
  const lead = f.room.leadId ? [{ id: f.room.leadId, role: 'teacher' }] : []; await N.notify({ schoolId: req.user.schoolId, recipients: [...lead, ...(await N.admins(req.user.schoolId))], exclude: req.user.userId, title: 'A nursery entry is waiting to be checked', body: `${f.room.name}`, link: '#/earlyYears', type: 'general', key: `ey-review:${p._id}` }); res.json({ post: postView(p) });
});
// Another person looks at it first. A sole administrator who wrote it may check it themselves, and that is recorded.
exports.reviewPost = wrap('reviewPost', async (req, res) => {
  const f = await postFor(req, req.params.id); if (f.error) return bad(res, ...f.error); const { p } = f; if (!E.isLead(f.scope, f.room)) return bad(res, 403, 'Only the room lead or an administrator can review an entry.');
  if (p.state !== 'Review') return bad(res, 409, 'This entry is not waiting for review.'); const decision = req.body?.decision; if (!['publish', 'withhold'].includes(decision)) return bad(res, 400, 'Choose publish or withhold.');
  let sole = false;
  if (String(p.authorId) === String(req.user.userId)) {
    const admins = await User.countDocuments({ schoolId: sid(req), role: 'admin', isActive: { $ne: false }, _id: { $ne: oid(req.user.userId) } }); const leadOther = f.room.leadId && String(f.room.leadId) !== String(req.user.userId);
    if (admins || leadOther) return bad(res, 403, 'You wrote this entry. Someone else must review it.'); sole = true;
  }
  const note = clean(req.body?.note, 300);
  if (decision === 'withhold') { if (note.length < 3) return bad(res, 400, 'Say what needs changing.'); p.state = 'Withheld'; p.reviewNote = note; }
  else {
    const cons = (await E.consentOf(req.user.schoolId, [p.childId])).get(String(p.childId)); const issues = [];
    if (p.kind === 'diary' && cons.journal === false) issues.push('The family has not agreed to a daily diary.'); if (p.kind === 'portfolio' && !cons.portfolio) issues.push('The family has not agreed to a learning portfolio.');
    let media = []; if (p.mediaIds.length) { media = await EyMedia.find({ schoolId: sid(req), _id: { $in: p.mediaIds } }).select('-image'); const kids = [...new Set(media.flatMap((m) => m.childIds.map(String)))]; const all = await E.consentOf(req.user.schoolId, kids); const names = new Map((await Student.find({ _id: { $in: kids.map(oid) } }).select('name')).map((s) => [String(s._id), s.name])); const missing = kids.filter((k) => !all.get(k).photos); if (missing.length) issues.push(`The family of ${missing.map((k) => names.get(k)).join(', ')} has not agreed to photos.`); }
    const care = p.careIds.length ? await EyCare.find({ schoolId: sid(req), _id: { $in: p.careIds } }) : []; if (care.some((c) => c.state !== 'Active')) issues.push('An entry in this diary was removed. Edit the diary.'); if (care.some((c) => E.needsTalk(c) && !c.discussedAt)) issues.push('A behaviour note has not been talked over with the family.');
    if (issues.length) { const photoOnly = issues.every((i) => /photos/.test(i)); if (!(req.body?.dropMedia === true && photoOnly)) return bad(res, 422, 'This cannot be published yet.', { issues }); p.mediaIds = []; p.history = [...(p.history || []), { at: new Date(), byName: req.actorName || '', action: 'photos left out', note: 'no consent' }]; }
    else if (media.length) await EyMedia.updateMany({ schoolId: sid(req), _id: { $in: p.mediaIds } }, { $set: { state: 'Approved', reviewedByName: req.actorName || '', reviewedAt: new Date() } });
    p.state = 'Published'; p.publishedAt = new Date(); p.reviewNote = note; if (p.careIds.length) await EyCare.updateMany({ schoolId: sid(req), _id: { $in: p.careIds } }, { $set: { sharedAt: new Date(), sharedPostId: p._id } });
    await N.notify({ schoolId: req.user.schoolId, recipients: await N.parentsOf(req.user.schoolId, [p.childId], 'viewInfo'), title: p.kind === 'portfolio' ? 'New in your child\'s portfolio' : 'Your child\'s day at nursery', body: 'A new entry is ready to read.', link: '#/earlyYears', type: 'general', key: `ey-post:${p._id}` });
  }
  p.reviewedById = oid(req.user.userId); p.reviewedByName = req.actorName || ''; p.reviewedAt = new Date(); p.soleReviewer = sole; p.history = [...(p.history || []), { at: new Date(), byName: req.actorName || '', action: decision === 'publish' ? 'published' : 'withheld', note: sole ? `${note} (checked by the only available reviewer)`.trim() : note }]; await p.save();
  if (decision === 'withhold' && p.authorId) await N.notify({ schoolId: req.user.schoolId, recipients: [{ id: p.authorId, role: 'teacher' }], title: 'An entry needs changes', body: note, link: '#/earlyYears', type: 'general', key: `ey-withheld:${p._id}` });
  await audit(req, { action: `early.post.${decision}`, entityType: 'EyPost', entityId: p._id, schoolId: sid(req), detail: { sole, kind: p.kind } }); res.json({ post: postView(p) });
});
exports.retractPost = wrap('retractPost', async (req, res) => {
  const f = await postFor(req, req.params.id); if (f.error) return bad(res, ...f.error); if (!E.isLead(f.scope, f.room)) return bad(res, 403, 'Only the room lead or an administrator can withdraw an entry.');
  if (f.p.state !== 'Published') return bad(res, 409, 'Only a published entry can be withdrawn.'); const reason = clean(req.body?.reason, 200); if (reason.length < 3) return bad(res, 400, 'Write why.');
  f.p.state = 'Retracted'; f.p.retractReason = reason; f.p.retractedAt = new Date(); f.p.history = [...(f.p.history || []), { at: new Date(), byName: req.actorName || '', action: 'withdrawn', note: reason }]; await f.p.save();
  await EyCare.updateMany({ schoolId: sid(req), sharedPostId: f.p._id }, { $unset: { sharedAt: 1, sharedPostId: 1 } }).catch(() => {}); await audit(req, { action: 'early.post.retract', entityType: 'EyPost', entityId: f.p._id, schoolId: sid(req), detail: { reason } }); res.json({ post: postView(f.p) });
});
exports.listPosts = wrap('listPosts', async (req, res) => {
  const { p, l } = E.pg(req.query); const q = { schoolId: sid(req) }; const scope = await E.scopeOf(req);
  if (req.query.roomId) { const r = await E.roomFor(req, req.query.roomId); if (r.error) return bad(res, ...r.error); q.roomId = r.room._id; } else if (!scope.admin) q.roomId = { $in: [...scope.rooms].map(oid) };
  if (['Draft', 'Review', 'Published', 'Withheld', 'Retracted'].includes(req.query.state)) q.state = req.query.state; if (['diary', 'portfolio', 'note'].includes(req.query.kind)) q.kind = req.query.kind; if (oid(req.query.childId)) q.childId = oid(req.query.childId); if (E.isDay(req.query.day)) q.day = req.query.day;
  const [rows, total] = await Promise.all([EyPost.find(q).sort({ day: -1, createdAt: -1 }).skip((p - 1) * l).limit(l), EyPost.countDocuments(q)]);
  const names = new Map((await Student.find({ _id: { $in: rows.map((x) => x.childId) } }).select('name')).map((s) => [String(s._id), s.name]));
  res.json({ posts: rows.map((x) => postView(x, { childName: names.get(String(x.childId)) || '', readBy: (x.reads || []).length })), total });
});
exports.getPost = wrap('getPost', async (req, res) => {
  const f = await postFor(req, req.params.id); if (f.error) return bad(res, ...f.error); const { p } = f;
  const [care, media, obs, child] = await Promise.all([EyCare.find({ _id: { $in: p.careIds } }).sort({ at: 1 }), EyMedia.find({ _id: { $in: p.mediaIds } }).select('-image'), EyObs.find({ _id: { $in: p.obsIds } }), Student.findById(p.childId).select('name')]);
  res.json({ post: postView(p, { childName: child?.name || '', readBy: (p.reads || []).length }), care: care.map(view), media: media.map(mediaView), observations: obs.map((o) => ({ _id: o._id, areaKey: o.areaKey, itemKey: o.itemKey, level: o.level, note: o.note, day: o.day })) });
});

/* family */
async function familyChild(req, childId, right = 'viewInfo') {
  const pl = oid(childId) ? await E.placementOf(req.user.schoolId, childId) : null; if (!pl) return { error: [404, 'That child is not in the nursery.'] };
  const rt = await G.resolve(req.user.schoolId, req.user.userId, childId); if (!rt.linked || !rt.rights[right]) return { error: [404, 'That child is not on your account.'] };
  const child = await Student.findOne({ _id: childId, schoolId: sid(req) }).select('name dateOfBirth'); return { child, rights: rt.rights, placement: pl };
}
exports.familyChildren = wrap('familyChildren', async (req, res) => {
  const parent = await Parent.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('children isActive'); const links = await require('../models/GuardianLink').find({ schoolId: sid(req), parentId: oid(req.user.userId) }).select('studentId');
  const ids = [...new Set([...(parent?.children || []).map(String), ...links.map((l) => String(l.studentId))])]; const pls = await EyPlacement.find({ schoolId: sid(req), childId: { $in: ids.map(oid) }, to: null }); if (!pls.length) return res.json({ children: [] });
  const rights = await G.resolveForParent(req.user.schoolId, parent, pls.map((p) => String(p.childId))); const day = await E.today(req.user.schoolId);
  const [kids, rooms, days, posts] = await Promise.all([Student.find({ _id: { $in: pls.map((p) => p.childId) } }).select('name dateOfBirth'), EyRoom.find({ _id: { $in: pls.map((p) => p.roomId) } }).select('name'), EyDay.find({ schoolId: sid(req), childId: { $in: pls.map((p) => p.childId) }, day }), EyPost.find({ schoolId: sid(req), childId: { $in: pls.map((p) => p.childId) }, state: 'Published' }).select('childId reads')]);
  const rm = new Map(rooms.map((r) => [String(r._id), r.name])); const dm = new Map(days.map((d) => [String(d.childId), d])); const cons = await E.consentOf(req.user.schoolId, pls.map((p) => String(p.childId)));
  const out = []; for (const k of kids) { const rt = rights.get(String(k._id)); if (!rt?.linked || !rt.rights.viewInfo) continue; const pl = pls.find((p) => String(p.childId) === String(k._id)); const d = dm.get(String(k._id)); const unread = posts.filter((x) => String(x.childId) === String(k._id) && !(x.reads || []).some((r) => String(r.parentId) === String(req.user.userId))).length;
    out.push({ _id: k._id, name: k.name, age: E.ageLabel(E.ageMonths(k.dateOfBirth)), room: rm.get(String(pl.roomId)) || '', today: rt.rights.viewAttendance ? { status: d?.status || 'Expected', inAt: d?.inAt, outAt: d?.outAt, collector: d?.status === 'Out' ? d.outTo?.name : '' } : null, consent: cons.get(String(k._id)), unread, canPickupAdmin: !!rt.rights.pickup }); }
  res.json({ children: out, day });
});
exports.familyFeed = wrap('familyFeed', async (req, res) => {
  const f = await familyChild(req, req.params.id); if (f.error) return bad(res, ...f.error); const { p, l } = E.pg({ limit: req.query.limit || 20, page: req.query.page });
  const q = { schoolId: sid(req), childId: f.child._id, state: 'Published' }; if (['diary', 'portfolio', 'note'].includes(req.query.kind)) q.kind = req.query.kind;
  const [rows, total] = await Promise.all([EyPost.find(q).sort({ day: -1, publishedAt: -1 }).skip((p - 1) * l).limit(l), EyPost.countDocuments(q)]); const cons = (await E.consentOf(req.user.schoolId, [f.child._id])).get(String(f.child._id));
  const careIds = rows.flatMap((x) => x.careIds); const care = new Map((await EyCare.find({ _id: { $in: careIds }, state: 'Active', sharedAt: { $exists: true } })).map((c) => [String(c._id), c]));
  const media = new Map((await EyMedia.find({ _id: { $in: rows.flatMap((x) => x.mediaIds) }, state: 'Approved' }).select('-image')).map((m) => [String(m._id), m]));
  const obs = new Map((await EyObs.find({ _id: { $in: rows.flatMap((x) => x.obsIds) }, state: 'Active' })).map((o) => [String(o._id), o])); const fw = new Map(); const label = async (o) => { if (!fw.has(String(o.frameworkId))) fw.set(String(o.frameworkId), (await EyFramework.findOne({ _id: o.frameworkId })) || (o.frameworkId && C.FRAMEWORK)); const F = fw.get(String(o.frameworkId)); const item = (F?.areas || C.AREAS).flatMap((a) => a.items).find((i) => i.key === o.itemKey); return item ? item.label : o.itemKey; };
  const posts = []; for (const x of rows) {
    const lines = x.careIds.map((i) => care.get(String(i))).filter((c) => c && (!E.needsTalk(c) || c.discussedAt)).map((c) => E.line(c, x.lang));
    const photos = cons.photos ? x.mediaIds.map((i) => media.get(String(i))).filter((m) => m && m.childIds.map(String).includes(String(f.child._id))).map((m) => ({ _id: m._id, alt: m.alt, caption: m.caption })) : [];
    const ob = []; if (x.kind === 'portfolio' ? cons.portfolio : cons.journal !== false) for (const i of x.obsIds) { const o = obs.get(String(i)); if (o) ob.push({ label: await label(o), level: o.level, note: o.note, day: o.day }); }
    if (x.kind === 'portfolio' && !cons.portfolio) continue; posts.push({ _id: x._id, day: x.day, kind: x.kind, lang: x.lang, title: x.title, body: x.body, teacherComment: x.teacherComment, lines, photos, observations: ob, authorName: x.authorName, publishedAt: x.publishedAt, read: (x.reads || []).some((r) => String(r.parentId) === String(req.user.userId)) });
  }
  res.json({ child: { _id: f.child._id, name: f.child.name }, posts, total });
});
exports.familyRead = wrap('familyRead', async (req, res) => {
  const p = oid(req.params.id) ? await EyPost.findOne({ _id: req.params.id, schoolId: sid(req), state: 'Published' }) : null; if (!p) return bad(res, 404, 'That entry is not here.'); const f = await familyChild(req, p.childId); if (f.error) return bad(res, ...f.error);
  if (!(p.reads || []).some((r) => String(r.parentId) === String(req.user.userId))) { p.reads = [...(p.reads || []), { parentId: oid(req.user.userId), at: new Date() }]; await p.save(); } res.json({ ok: true });
});
exports.familyProfile = wrap('familyProfile', async (req, res) => { const f = await familyChild(req, req.params.id); if (f.error) return bad(res, ...f.error); const p = await EyProfile.findOne({ schoolId: sid(req), childId: f.child._id }); res.json({ child: { _id: f.child._id, name: f.child.name }, profile: profileView(p, true), waiting: (p?.pending || []).filter((x) => x.state === 'Waiting').length, canEdit: true }); });
exports.familyPropose = wrap('familyPropose', async (req, res) => {
  const f = await familyChild(req, req.params.id); if (f.error) return bad(res, ...f.error); const cp = cleanProfile(req.body || {}); if (cp.error) return bad(res, 400, cp.error); if (!Object.keys(cp.out).length) return bad(res, 400, 'Nothing to send.');
  const parent = await Parent.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('name'); const p = (await EyProfile.findOne({ schoolId: sid(req), childId: f.child._id })) || new EyProfile({ schoolId: sid(req), childId: f.child._id });
  p.pending = [...(p.pending || []).map((x) => (x.state === 'Waiting' ? { ...JSON.parse(JSON.stringify(x)), state: 'Replaced' } : x)), { at: new Date(), byParentId: oid(req.user.userId), byName: parent?.name || '', state: 'Waiting', proposal: JSON.parse(JSON.stringify(cp.out)) }]; p.markModified('pending'); await p.save();
  const room = await EyRoom.findOne({ _id: f.placement.roomId }).select('leadId name'); await N.notify({ schoolId: req.user.schoolId, recipients: [...(await N.admins(req.user.schoolId)), ...(room?.leadId ? [{ id: room.leadId, role: 'teacher' }] : [])], title: `${parent?.name || 'A guardian'} sent an update for ${f.child.name}`, body: 'Confirm it with the family before it is added.', link: '#/earlyYears', type: 'general', key: `ey-prop:${p._id}:${Date.now()}` });
  res.status(201).json({ ok: true, message: 'Thank you. The nursery will confirm this with you before it is added to your child\'s record.', warnings: cp.warnings });
});
exports.familyConsent = wrap('familyConsent', async (req, res) => { const f = await familyChild(req, req.params.id); if (f.error) return bad(res, ...f.error); const p = await EyProfile.findOne({ schoolId: sid(req), childId: f.child._id }); res.json({ consent: profileView(p).consent, history: (p?.consentHistory || []).slice(-10) }); });
exports.familySetConsent = wrap('familySetConsent', async (req, res) => { const f = await familyChild(req, req.params.id); if (f.error) return bad(res, ...f.error); const parent = await Parent.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('name'); const p = await setConsent(req, f.child._id, req.body || {}, 'family', parent?.name || 'Guardian'); res.json({ consent: profileView(p).consent }); });
exports.familyRoutine = wrap('familyRoutine', async (req, res) => { const f = await familyChild(req, req.params.id); if (f.error) return bad(res, ...f.error); const rs = await EyRoutine.find({ schoolId: sid(req), roomId: f.placement.roomId, active: true, shareWithFamilies: true }).sort({ name: 1 }); res.json({ routines: rs.map((r) => ({ _id: r._id, name: r.name, steps: r.steps })) }); });

exports._internals = { view, profileView, cleanData, mediaView, familyChild };
