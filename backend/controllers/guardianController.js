// Guardian rights, contact restrictions and pickup checks (PRD E05).
//   403 not allowed · 404 not in this school · 409 changed by someone else · 422 not possible in the current state
const mongoose = require('../lib/pgdoc');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const GuardianLink = require('../models/GuardianLink');
const ContactRestriction = require('../models/ContactRestriction');
const G = require('../utils/guardianRights');
const { audit } = require('../utils/audit');
const { can } = require('../utils/permissions');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const TYPES = ['no-access', 'no-contact', 'no-pickup', 'no-fees'];
const live = (r, at = new Date()) => new Date(r.validFrom) <= at && (!r.validTo || new Date(r.validTo) > at);

const cleanRights = (input, base = {}) => {
  const out = { ...G.DEFAULTS, ...base };
  for (const k of G.KEYS) if (input && typeof input[k] === 'boolean') out[k] = input[k];
  return out;
};
const parseDates = (b, current = {}) => {
  const from = b.validFrom ? new Date(b.validFrom) : (current.validFrom ? new Date(current.validFrom) : new Date());
  const to = b.validTo === null || b.validTo === '' ? null : (b.validTo ? new Date(b.validTo) : (current.validTo ? new Date(current.validTo) : null));
  if (Number.isNaN(from.getTime()) || (to && Number.isNaN(to.getTime()))) return { error: 'Enter valid dates.' };
  if (to && to <= from) return { error: 'The end date must be after the start date.' };
  return { from, to };
};
const studentOf = (req) => (isId(req.params.studentId) ? Student.findOne({ _id: req.params.studentId, schoolId: req.user.schoolId }).select('name rollNumber studentId') : null);
const shapeLink = (l, parents) => ({
  _id: l._id, parentId: l.parentId || null, name: l.parentId ? (parents.get(String(l.parentId))?.name || 'Parent') : l.personName,
  email: l.parentId ? parents.get(String(l.parentId))?.email || '' : '', phone: l.phone || parents.get(String(l.parentId))?.phone || '',
  relationship: l.relationship, isPrimary: !!l.isPrimary, rights: l.rights, validFrom: l.validFrom, validTo: l.validTo, note: l.note,
  endedReason: l.endedReason, active: live(l), version: l.updatedAt,
});

exports.forStudent = async (req, res) => {
  try {
    const student = await studentOf(req);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const sid = req.user.schoolId;
    const [links, restrictions, linkedParents] = await Promise.all([
      GuardianLink.find({ schoolId: sid, studentId: student._id }).sort({ validFrom: -1 }),
      ContactRestriction.find({ schoolId: sid, studentId: student._id }).sort({ validFrom: -1 }),
      Parent.find({ schoolId: sid, children: student._id }).select('name email phone isActive'),
    ]);
    const ids = new Set([...links.map((l) => String(l.parentId || '')), ...linkedParents.map((p) => String(p._id))].filter(Boolean));
    const parents = new Map((await Parent.find({ schoolId: sid, _id: { $in: [...ids] } }).select('name email phone')).map((p) => [String(p._id), p]));
    // parents linked the old way and without a rights row yet are shown as "standard rights"
    const implicit = linkedParents.filter((p) => !links.some((l) => String(l.parentId) === String(p._id)))
      .map((p) => ({ parentId: p._id, name: p.name, email: p.email, phone: p.phone || '', relationship: 'Guardian', rights: { ...G.DEFAULTS }, implicit: true, active: p.isActive !== false }));
    // reasons and court references are restricted: only the person who recorded them, or someone with the permission or an emergency window
    const access = await can(req.user, 'safeguarding.case.read');
    const mayRead = (r) => access.allowed || String(r.createdBy) === String(req.user.userId);
    const revealed = restrictions.filter((r) => (r.reason || r.referenceNo) && mayRead(r) && String(r.createdBy) !== String(req.user.userId));
    if (revealed.length) await audit(req, { action: 'safeguarding.case.read', entityType: 'Student', entityId: student._id, schoolId: sid, detail: { via: access.via, restrictions: revealed.length } });
    res.json({
      student: { _id: student._id, name: student.name, rollNumber: student.rollNumber || '' },
      links: links.map((l) => shapeLink(l, parents)), implicit,
      restrictions: restrictions.map((r) => ({ _id: r._id, parentId: r.parentId || null, name: r.parentId ? parents.get(String(r.parentId))?.name || 'Parent' : r.personName, type: r.type, reason: mayRead(r) ? r.reason : '', referenceNo: mayRead(r) ? r.referenceNo : '', reasonHidden: !mayRead(r), validFrom: r.validFrom, validTo: r.validTo, endedReason: r.endedReason, active: live(r) })),
      rightKeys: G.KEYS,
    });
  } catch (e) { fail(res, e); }
};

exports.createLink = async (req, res) => {
  try {
    const student = await studentOf(req);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const b = req.body || {};
    const sid = req.user.schoolId;
    let parent = null;
    if (b.parentId) {
      parent = isId(b.parentId) ? await Parent.findOne({ _id: b.parentId, schoolId: sid }) : null;
      if (!parent) return res.status(404).json({ message: 'Parent account not found' });
    } else if (!String(b.personName || '').trim()) return res.status(400).json({ message: 'Choose a parent account or enter the person\'s name.' });
    const d = parseDates(b); if (d.error) return res.status(400).json({ message: d.error });

    // a person with no account can only be authorised to collect the child, never to see records
    const rights = parent ? cleanRights(b.rights) : { ...Object.fromEntries(G.KEYS.map((k) => [k, false])), pickup: b.rights?.pickup !== false };
    if (parent) {
      const clash = await GuardianLink.find({ schoolId: sid, studentId: student._id, parentId: parent._id });
      if (clash.some((l) => live(l))) return res.status(422).json({ message: 'This guardian already has a current link for this child. Edit it or end it first.' });
    } else {
      const nm = String(b.personName).trim().toLowerCase();
      const same = await GuardianLink.find({ schoolId: sid, studentId: student._id, parentId: null });
      if (same.some((l) => live(l) && String(l.personName).trim().toLowerCase() === nm)) return res.status(422).json({ message: 'This person is already on the list for this child.' });
    }
    const link = await GuardianLink.create({
      schoolId: sid, studentId: student._id, parentId: parent?._id, personName: parent ? '' : String(b.personName).trim().slice(0, 80),
      phone: String(b.phone || '').slice(0, 30), relationship: String(b.relationship || parent?.relationship || 'Guardian').slice(0, 40),
      isPrimary: !!b.isPrimary, rights, validFrom: d.from, validTo: d.to, note: String(b.note || '').slice(0, 300),
      createdBy: req.user.userId, createdByName: req.actorName || '',
    });
    // keep the old list in step so everything that still reads Parent.children keeps working
    if (parent && !(parent.children || []).map(String).includes(String(student._id))) { parent.children.push(student._id); await parent.save(); }
    await audit(req, { action: 'guardian.link.create', entityType: 'GuardianLink', entityId: link._id, schoolId: sid, detail: { studentId: student._id, parentId: parent?._id || null, person: link.personName, rights } });
    res.status(201).json({ link: shapeLink(link, new Map(parent ? [[String(parent._id), parent]] : [])) });
  } catch (e) { fail(res, e); }
};

exports.updateLink = async (req, res) => {
  try {
    const link = isId(req.params.id) ? await GuardianLink.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null;
    if (!link) return res.status(404).json({ message: 'Guardian link not found' });
    const b = req.body || {};
    if (b.version && new Date(b.version).getTime() !== new Date(link.updatedAt).getTime()) {
      return res.status(409).json({ message: 'Someone else changed this link. Reload and try again.' });
    }
    if (link.validTo && new Date(link.validTo) <= new Date()) return res.status(422).json({ message: 'This link has ended and cannot be edited. Create a new one.' });
    const before = JSON.parse(JSON.stringify(link.rights || {}));
    if (b.rights) link.rights = link.parentId ? cleanRights(b.rights, before) : { ...Object.fromEntries(G.KEYS.map((k) => [k, false])), pickup: b.rights.pickup !== false };
    if (b.relationship !== undefined) link.relationship = String(b.relationship).slice(0, 40);
    if (b.isPrimary !== undefined) link.isPrimary = !!b.isPrimary;
    if (b.note !== undefined) link.note = String(b.note).slice(0, 300);
    if (b.phone !== undefined) link.phone = String(b.phone).slice(0, 30);
    if (b.validTo !== undefined) { const d = parseDates({ validTo: b.validTo }, link); if (d.error) return res.status(400).json({ message: d.error }); link.validTo = d.to; }
    link.markModified('rights');
    await link.save();
    await audit(req, { action: 'guardian.link.update', entityType: 'GuardianLink', entityId: link._id, schoolId: req.user.schoolId, detail: { before, after: link.rights } });
    res.json({ link: shapeLink(link, new Map((await Parent.find({ _id: link.parentId, schoolId: req.user.schoolId }).select('name email phone')).map((p) => [String(p._id), p]))) });
  } catch (e) { fail(res, e); }
};

const endRow = (Model, action, entity) => async (req, res) => {
  try {
    const row = isId(req.params.id) ? await Model.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null;
    if (!row) return res.status(404).json({ message: `${entity} not found` });
    if (row.validTo && new Date(row.validTo) <= new Date()) return res.status(422).json({ message: `This ${entity.toLowerCase()} has already ended.` });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ message: 'Write a short reason for ending it.' });
    row.validTo = new Date(); row.endedReason = reason.slice(0, 300); await row.save();
    await audit(req, { action, entityType: Model.modelName, entityId: row._id, schoolId: req.user.schoolId, detail: { studentId: row.studentId, reason } });
    res.json({ ok: true, endedAt: row.validTo });
  } catch (e) { fail(res, e); }
};
exports.endLink = endRow(GuardianLink, 'guardian.link.end', 'Guardian link');
exports.endRestriction = endRow(ContactRestriction, 'guardian.restriction.end', 'Restriction');

exports.createRestriction = async (req, res) => {
  try {
    const student = await studentOf(req);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const b = req.body || {};
    if (!TYPES.includes(b.type)) return res.status(400).json({ message: 'Choose what is restricted.' });
    let parent = null;
    if (b.parentId) {
      parent = isId(b.parentId) ? await Parent.findOne({ _id: b.parentId, schoolId: req.user.schoolId }).select('name') : null;
      if (!parent) return res.status(404).json({ message: 'Parent account not found' });
    } else if (!String(b.personName || '').trim()) return res.status(400).json({ message: 'Choose a parent account or enter the person\'s name.' });
    if (String(b.reason || '').trim().length < 3) return res.status(400).json({ message: 'Record the reason (court order, safety plan or school decision).' });
    const d = parseDates(b); if (d.error) return res.status(400).json({ message: d.error });
    const nm = String(b.personName || '').trim().toLowerCase();
    const open = await ContactRestriction.find({ schoolId: req.user.schoolId, studentId: student._id, type: b.type });
    if (open.some((r) => live(r) && (parent ? String(r.parentId) === String(parent._id) : !r.parentId && String(r.personName).trim().toLowerCase() === nm))) return res.status(422).json({ message: 'This restriction is already in force.' });
    const r = await ContactRestriction.create({
      schoolId: req.user.schoolId, studentId: student._id, parentId: parent?._id, personName: parent ? '' : String(b.personName).trim().slice(0, 80),
      type: b.type, reason: String(b.reason).slice(0, 500), referenceNo: String(b.referenceNo || '').slice(0, 60), validFrom: d.from, validTo: d.to,
      createdBy: req.user.userId, createdByName: req.actorName || '',
    });
    await audit(req, { action: 'guardian.restriction.create', entityType: 'ContactRestriction', entityId: r._id, schoolId: req.user.schoolId, detail: { studentId: student._id, type: r.type, parentId: parent?._id || null, person: r.personName } });
    res.status(201).json({ restriction: { _id: r._id, type: r.type, name: parent?.name || r.personName, validFrom: r.validFrom, validTo: r.validTo, active: live(r) } });
  } catch (e) { fail(res, e); }
};

// Gate check. Never says WHY someone is refused; a refusal always asks staff to involve a person.
exports.verifyPickup = async (req, res) => {
  try {
    if (!(await can(req.user, 'safety.pickup.verify')).allowed) return res.status(403).json({ message: 'You are not allowed to check pickups.' });
    const student = await studentOf(req);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const b = req.body || {};
    if (!b.parentId && !String(b.personName || '').trim()) return res.status(400).json({ message: 'Choose who is collecting the child.' });
    if (b.parentId && !isId(b.parentId)) return res.status(400).json({ message: 'Invalid person' });
    const out = await G.pickupDecision(req.user.schoolId, student._id, { parentId: b.parentId, personName: b.personName });
    await audit(req, { action: 'safety.pickup.verify', entityType: 'Student', entityId: student._id, schoolId: req.user.schoolId, detail: { decision: out.decision, reason: out.code, parentId: b.parentId || null, person: b.personName || '' } });
    // staff see only the decision. The real reason stays in the audit log, so a restriction is never revealed at the gate.
    const { code, ...safe } = out;
    // one set of words for every refusal, so the wording itself can never hint that a restriction exists
    res.status(200).json({ studentName: student.name, ...safe, code: out.decision === 'Authorised' ? 'ok' : 'not-authorised', message: out.decision === 'Authorised' ? out.message : 'Do not release the child. Ask the person to wait and call the principal.' });
  } catch (e) { fail(res, e); }
};
