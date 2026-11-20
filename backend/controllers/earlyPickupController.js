// A family asks to add, pause or remove someone who may collect their child (PRD E15: CAP-0287).
//   Nothing changes until staff have confirmed the request with the family by a second route. Only then does a named collector link
//   (pickup right and nothing else) start or end. Every other guardian is told when it is applied.
const E = require('../utils/early/service');
const G = require('../utils/guardianRights');
const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const GuardianLink = require('../models/GuardianLink');
const EyPickupChange = require('../models/EyPickupChange');
const EyRoom = require('../models/EyRoom');
const EyPlacement = require('../models/EyPlacement');
const { oid, sid, bad, wrap, clean } = E;
const live = (l, at = new Date()) => new Date(l.validFrom) <= at && (!l.validTo || new Date(l.validTo) > at);
const nkey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const ONLY_PICKUP = () => ({ ...Object.fromEntries(G.KEYS.map((k) => [k, false])), pickup: true });
const METHODS = ['call-back', 'in-person', 'signed-form'];
const view = (r, extra = {}) => ({ _id: r._id, childId: r.childId, action: r.action, personName: r.personName, relationship: r.relationship, phone: r.phone, validFrom: r.validFrom, validTo: r.validTo, note: r.note, state: r.state, requestedByName: r.requestedByName, onBehalf: r.onBehalf, verifiedByName: r.verifiedByName, verifiedAt: r.verifiedAt, verifiedMethod: r.verifiedMethod, verifiedWith: r.verifiedWith, verifiedNote: r.verifiedNote, appliedByName: r.appliedByName, appliedAt: r.appliedAt, decidedNote: r.decidedNote, createdAt: r.createdAt, ...extra });
const dateOrNull = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d; };

// The named collectors currently on a child's list. Parents with pickup rights are shown as read-only: only the school changes those.
async function peopleOf(schoolId, childId) {
  const links = await GuardianLink.find({ schoolId: oid(schoolId), studentId: oid(childId) }); const now = new Date(); const out = [];
  // a person paused until a return date has a link that has not started yet: she stays on the list, marked as paused
  for (const l of links.filter((x) => !x.parentId && x.personName && x.rights?.pickup && new Date(x.validFrom) > now && (!x.validTo || new Date(x.validTo) > now))) out.push({ linkId: l._id, kind: 'named', name: l.personName, relationship: l.relationship, phone: l.phone, validTo: l.validTo, paused: true, resumesOn: l.validFrom, canChange: true });
  for (const l of links.filter((x) => live(x, now))) { if (!l.parentId && l.personName && l.rights?.pickup) out.push({ linkId: l._id, kind: 'named', name: l.personName, relationship: l.relationship, phone: l.phone, validTo: l.validTo, canChange: true }); else if (l.parentId && l.rights?.pickup) out.push({ kind: 'guardian', name: '', relationship: l.relationship, canChange: false, parentId: l.parentId }); }
  const ps = await Parent.find({ _id: { $in: out.filter((o) => o.parentId).map((o) => o.parentId) } }).select('name'); const nm = new Map(ps.map((p) => [String(p._id), p.name])); return out.map((o) => (o.parentId ? { ...o, name: nm.get(String(o.parentId)) || 'Guardian' } : o));
}
function cleanRequest(b, people) {
  const action = ['add', 'remove', 'pause'].includes(b.action) ? b.action : ''; if (!action) return { error: 'Choose add, pause or remove.' }; const out = { action, note: clean(b.note, 300) };
  if (action === 'add') {
    out.personName = clean(b.personName, 80); out.phone = clean(b.phone, 30); out.relationship = clean(b.relationship, 40) || 'Family friend'; if (out.personName.length < 3 || !/\s/.test(out.personName)) return { error: 'Give the person\'s full name, first and last.' }; if (out.phone.replace(/\D/g, '').length < 10) return { error: 'Give a phone number the school can call to check, with the area or mobile code.' };
    const f = dateOrNull(b.validFrom); const t = dateOrNull(b.validTo); if (f === undefined || t === undefined) return { error: 'Check the dates.' }; if (t && f && t <= f) return { error: 'The end date must be after the start date.' }; if (t && t <= new Date()) return { error: 'The end date must be in the future.' }; out.validFrom = f || undefined; out.validTo = t || undefined;
    if (people.some((p) => nkey(p.name) === nkey(out.personName))) return { error: 'This person is already on the list.' };
  } else {
    const p = people.find((x) => String(x.linkId) === String(b.linkId) && x.canChange); if (!p) return { error: 'Choose a person on the list. Changes to a parent are made by the school.' }; out.linkId = p.linkId; out.personName = p.name; out.relationship = p.relationship; out.phone = p.phone;
    if (action === 'pause') { if (p.paused) return { error: 'This person is already paused.' }; const t = dateOrNull(b.validTo); if (!t || t <= new Date()) return { error: 'Say the date the person may collect again, in the future.' }; out.validTo = t; }
  }
  return { out };
}
async function openDuplicate(req, childId, o) { return EyPickupChange.countDocuments({ schoolId: sid(req), childId: oid(childId), state: { $in: ['Requested', 'Verified'] }, ...(o.linkId ? { linkId: o.linkId } : { personName: o.personName }) }); }

/* family */
exports.familyPeople = wrap('familyPeople', async (req, res) => {
  const f = await require('./earlyCareController')._internals.familyChild(req, req.params.id); if (f.error) return bad(res, ...f.error);
  const [people, reqs] = await Promise.all([peopleOf(req.user.schoolId, f.child._id), EyPickupChange.find({ schoolId: sid(req), childId: f.child._id }).sort({ createdAt: -1 }).limit(20)]);
  res.json({ child: { _id: f.child._id, name: f.child.name }, people: people.map(({ parentId, ...p }) => p), requests: reqs.map((r) => view(r)), note: 'A change takes effect only after the nursery has confirmed it with you by phone or in person.' });
});
exports.familyRequest = wrap('familyRequest', async (req, res) => {
  const f = await require('./earlyCareController')._internals.familyChild(req, req.params.id); if (f.error) return bad(res, ...f.error); const people = await peopleOf(req.user.schoolId, f.child._id); const c = cleanRequest(req.body || {}, people); if (c.error) return bad(res, 400, c.error);
  if (await openDuplicate(req, f.child._id, c.out)) return bad(res, 409, 'There is already a request waiting for this person.'); const parent = await Parent.findOne({ _id: oid(req.user.userId), schoolId: sid(req) }).select('name');
  const r = await EyPickupChange.create({ schoolId: sid(req), childId: f.child._id, ...c.out, requestedByParentId: oid(req.user.userId), requestedByName: parent?.name || '' });
  const room = await EyRoom.findOne({ _id: f.placement.roomId }).select('leadId name'); await N.notify({ schoolId: req.user.schoolId, recipients: [...(await N.admins(req.user.schoolId)), ...(room?.leadId ? [{ id: room.leadId, role: 'teacher' }] : [])], title: `Pickup change for ${f.child.name}`, body: `${parent?.name || 'A guardian'} asked to ${c.out.action} ${c.out.personName}. Confirm it with the family first.`, link: '#/earlyYears', type: 'general', key: `ey-pc:${r._id}` });
  res.status(201).json({ request: view(r), message: 'Thank you. The nursery will contact you to confirm before anything changes.' });
});
exports.familyCancel = wrap('familyCancel', async (req, res) => {
  const r = oid(req.params.id) ? await EyPickupChange.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!r || String(r.requestedByParentId) !== String(req.user.userId)) return bad(res, 404, 'That request is not on your account.');
  if (!['Requested', 'Verified'].includes(r.state)) return bad(res, 409, 'It has already been dealt with.'); r.state = 'Cancelled'; await r.save(); res.json({ request: view(r) });
});

/* staff */
async function reqFor(req, id) {
  const r = oid(id) ? await EyPickupChange.findOne({ _id: id, schoolId: sid(req) }) : null; if (!r) return { error: [404, 'That request is not in your school.'] };
  const c = await E.childIn(req, r.childId); if (c.error) return c; if (!E.isLead(c.scope, c.room)) return { error: [403, 'Only the room lead or an administrator can deal with pickup changes.'] }; return { r, ...c };
}
exports.list = wrap('list', async (req, res) => {
  const q = { schoolId: sid(req) }; const scope = await E.scopeOf(req);
  if (['Requested', 'Verified', 'Applied', 'Declined', 'Cancelled'].includes(req.query.state)) q.state = req.query.state; else q.state = { $in: ['Requested', 'Verified'] }; if (oid(req.query.childId)) q.childId = oid(req.query.childId);
  let rows = await EyPickupChange.find(q).sort({ createdAt: -1 }).limit(100);
  if (!scope.admin) { const pl = await EyPlacement.find({ schoolId: sid(req), roomId: { $in: [...scope.rooms].map(oid) }, to: null }).select('childId'); const mine = new Set(pl.map((p) => String(p.childId))); rows = rows.filter((r) => mine.has(String(r.childId))); }
  const kids = new Map((await Student.find({ _id: { $in: rows.map((r) => r.childId) } }).select('name')).map((s) => [String(s._id), s.name])); res.json({ requests: rows.map((r) => view(r, { childName: kids.get(String(r.childId)) || '' })) });
});
exports.staffRequest = wrap('staffRequest', async (req, res) => {
  const c = await E.childIn(req, req.body?.childId); if (c.error) return bad(res, ...c.error); const people = await peopleOf(req.user.schoolId, c.child._id); const q = cleanRequest(req.body || {}, people); if (q.error) return bad(res, 400, q.error);
  if (await openDuplicate(req, c.child._id, q.out)) return bad(res, 409, 'There is already a request waiting for this person.'); const r = await EyPickupChange.create({ schoolId: sid(req), childId: c.child._id, ...q.out, onBehalf: true, requestedByName: req.actorName || '' }); res.status(201).json({ request: view(r) });
});
exports.verify = wrap('verify', async (req, res) => {
  const f = await reqFor(req, req.params.id); if (f.error) return bad(res, ...f.error); const { r } = f; if (r.state !== 'Requested') return bad(res, 409, 'This request is not waiting to be checked.');
  const method = req.body?.method; if (!METHODS.includes(method)) return bad(res, 400, 'Say how you confirmed it: a call back, in person, or a signed form.'); const w = clean(req.body?.with, 80); if (w.length < 3) return bad(res, 400, 'Say who in the family you confirmed it with.');
  r.state = 'Verified'; r.verifiedById = oid(req.user.userId); r.verifiedByName = req.actorName || ''; r.verifiedAt = new Date(); r.verifiedMethod = method; r.verifiedWith = w; r.verifiedNote = clean(req.body?.note, 300); await r.save();
  await audit(req, { action: 'early.pickup.verify', entityType: 'EyPickupChange', entityId: r._id, schoolId: sid(req), detail: { method, with: w, action: r.action } }); res.json({ request: view(r) });
});
exports.apply = wrap('apply', async (req, res) => {
  const f = await reqFor(req, req.params.id); if (f.error) return bad(res, ...f.error); const { r } = f; if (r.state !== 'Verified') return bad(res, 422, r.state === 'Requested' ? 'Confirm it with the family first.' : 'This request is already closed.');
  const now = new Date(); let linkId = r.linkId;
  if (r.action === 'add') {
    const same = (await GuardianLink.find({ schoolId: sid(req), studentId: r.childId, parentId: null })).filter((l) => (!l.validTo || new Date(l.validTo) > now) && nkey(l.personName) === nkey(r.personName)); if (same.length) return bad(res, 409, 'This person is already on the list.');
    const l = await GuardianLink.create({ schoolId: sid(req), studentId: r.childId, personName: r.personName, phone: r.phone, relationship: r.relationship || 'Family friend', rights: ONLY_PICKUP(), validFrom: r.validFrom && r.validFrom > now ? r.validFrom : now, validTo: r.validTo || null, note: `Added at the family's request. Confirmed by ${r.verifiedByName} (${r.verifiedMethod}) with ${r.verifiedWith}.`.slice(0, 300), createdBy: oid(req.user.userId), createdByName: req.actorName || '' }); linkId = l._id;
  } else {
    const l = oid(r.linkId) ? await GuardianLink.findOne({ _id: r.linkId, schoolId: sid(req) }) : null; if (!l || (l.validTo && new Date(l.validTo) <= now)) return bad(res, 422, 'That person is no longer on the list. Decline this request.');
    const notStarted = new Date(l.validFrom) > now; if (notStarted && r.action === 'pause') return bad(res, 422, 'That person is already paused. Decline this request.');
    const origTo = l.validTo; l.validTo = notStarted ? l.validFrom : now; l.endedReason = r.action === 'pause' ? `Paused until ${r.validTo.toISOString().slice(0, 10)} at the family's request` : 'Removed at the family\'s request'; await l.save();
    if (r.action === 'pause') await GuardianLink.create({ schoolId: sid(req), studentId: r.childId, personName: l.personName, phone: l.phone, relationship: l.relationship, rights: ONLY_PICKUP(), validFrom: r.validTo, validTo: origTo && origTo > r.validTo ? origTo : null, note: `Resumes after a pause. Confirmed by ${r.verifiedByName}.`.slice(0, 300), createdBy: oid(req.user.userId), createdByName: req.actorName || '' });
  }
  r.state = 'Applied'; r.appliedByName = req.actorName || ''; r.appliedAt = now; r.linkId = linkId; await r.save();
  await audit(req, { action: `early.pickup.${r.action}`, entityType: 'GuardianLink', entityId: linkId, schoolId: sid(req), detail: { person: r.personName, childId: r.childId, request: r._id } });
  const guardians = await N.parentsOf(req.user.schoolId, [r.childId], 'receiveNotices'); await N.notify({ schoolId: req.user.schoolId, recipients: guardians, title: `Who may collect ${f.child.name} has changed`, body: r.action === 'add' ? `${r.personName} was added.` : r.action === 'pause' ? `${r.personName} is paused until ${r.validTo.toISOString().slice(0, 10)}.` : `${r.personName} was removed.`, link: '#/earlyYears', type: 'general', key: `ey-pc-done:${r._id}` });
  res.json({ request: view(r) });
});
exports.decline = wrap('decline', async (req, res) => {
  const f = await reqFor(req, req.params.id); if (f.error) return bad(res, ...f.error); const { r } = f; if (!['Requested', 'Verified'].includes(r.state)) return bad(res, 409, 'This request is already closed.'); const note = clean(req.body?.note, 300); if (note.length < 3) return bad(res, 400, 'Say why, so the family can be told.');
  r.state = 'Declined'; r.decidedNote = note; r.appliedByName = req.actorName || ''; r.appliedAt = new Date(); await r.save();
  if (r.requestedByParentId) await N.notify({ schoolId: req.user.schoolId, recipients: [{ id: r.requestedByParentId, role: 'parent' }], title: 'Your pickup request was not applied', body: note, link: '#/earlyYears', type: 'general', key: `ey-pc-no:${r._id}` }); res.json({ request: view(r) });
});
exports.peopleOf = peopleOf;
