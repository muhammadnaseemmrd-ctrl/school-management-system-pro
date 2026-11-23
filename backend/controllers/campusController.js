// Campuses and campus administrators (PRD E01).
const mongoose = require('../lib/pgdoc');
const Campus = require('../models/Campus');
const CampusMembership = require('../models/CampusMembership');
const Class = require('../models/Class');
const Student = require('../models/Student');
const User = require('../models/User');
const Organization = require('../models/Organization');
const School = require('../models/School');
const CS = require('../utils/campus');
const { audit } = require('../utils/audit');
const { oid, sid, bad, wrap, clean } = require('../utils/early/service');

const MAX_CAMPUSES = 25;
const isDup = (e) => e && (e.code === 11000 || /duplicate key|E11000/.test(e.message || ''));
const codeOf = (v) => clean(v, 12).toUpperCase().replace(/[^A-Z0-9-]/g, '');
const shape = (c, extra = {}) => ({ _id: c._id, name: c.name, code: c.code, address: c.address, phone: c.phone, isDefault: !!c.isDefault, status: c.status, closedAt: c.closedAt || null, createdAt: c.createdAt, ...extra });
const schoolWide = async (req, res) => { if (await CS.scopeOf(req.user)) { bad(res, 403, 'Only a school-wide administrator can do this.'); return false; } return true; };

// every campus with its head count, and who I am (school-wide or limited to some campuses)
exports.overview = wrap('campus.overview', async (req, res) => {
  const schoolId = sid(req);
  await CS.ensureDefault(schoolId);
  const Teacher = require('../models/Teacher');
  const Employee = require('../models/Employee');
  const [campuses, classes, members, school, teachers, staff] = await Promise.all([
    Campus.find({ schoolId }).sort({ isDefault: -1, name: 1 }),
    Class.find({ schoolId }).select('campusId studentCount standard division'),
    CampusMembership.find({ schoolId }),
    School.findById(schoolId).select('organizationId name'),
    Teacher.find({ schoolId }).select('campusId'),
    Employee.find({ schoolId, status: { $ne: 'Separated' } }).select('campusId'),
  ]);
  const def = campuses.find((c) => c.isDefault);
  const live = members.filter((m) => !m.revokedAt);
  const per = {};
  campuses.forEach((c) => { per[String(c._id)] = { classes: 0, students: 0, admins: 0, teachers: 0, staff: 0 }; });
  classes.forEach((c) => { const k = String(c.campusId || def._id); if (per[k]) { per[k].classes += 1; per[k].students += c.studentCount || 0; } });
  live.forEach((m) => { if (per[String(m.campusId)]) per[String(m.campusId)].admins += 1; });
  teachers.forEach((t) => { const k = String(t.campusId || def._id); if (per[k]) per[k].teachers += 1; });
  staff.forEach((e) => { const k = String(e.campusId || def._id); if (per[k]) per[k].staff += 1; });
  const sc = await CS.scopeOf(req.user);
  const org = school?.organizationId ? await Organization.findById(school.organizationId).select('name slug') : null;
  res.json({
    campuses: campuses.filter((c) => !sc || sc.campusIds.includes(String(c._id))).map((c) => shape(c, per[String(c._id)])),
    me: { schoolWide: !sc, campusIds: sc ? sc.campusIds : [] },
    organization: org ? { _id: org._id, name: org.name } : null,
    limits: { maxCampuses: MAX_CAMPUSES },
  });
});

exports.create = wrap('campus.create', async (req, res) => {
  if (!(await schoolWide(req, res))) return;
  const schoolId = sid(req); const b = req.body || {};
  const name = clean(b.name, 80); const code = codeOf(b.code || name.split(/\s+/).map((w) => w[0]).join(''));
  if (name.length < 2) return bad(res, 400, 'Give the campus a name.');
  if (code.length < 2) return bad(res, 400, 'Give the campus a short code, such as NORTH.');
  await CS.ensureDefault(schoolId);
  if ((await Campus.countDocuments({ schoolId })) >= MAX_CAMPUSES) return bad(res, 422, `A school can have at most ${MAX_CAMPUSES} campuses.`);
  try {
    const c = await Campus.create({ schoolId, name, code, address: clean(b.address, 200), phone: clean(b.phone, 30), createdByName: req.actorName || '' });
    await audit(req, { action: 'campus.create', entityType: 'Campus', entityId: c._id, schoolId, detail: { name, code } });
    res.status(201).json({ campus: shape(c) });
  } catch (e) { if (isDup(e)) return bad(res, 409, 'Another campus already uses that code.'); throw e; }
});

exports.update = wrap('campus.update', async (req, res) => {
  if (!(await schoolWide(req, res))) return;
  const schoolId = sid(req); const b = req.body || {};
  const c = oid(req.params.id) ? await Campus.findOne({ _id: oid(req.params.id), schoolId }) : null;
  if (!c) return bad(res, 404, 'Campus not found');
  const set = {};
  if (b.name !== undefined) { const n = clean(b.name, 80); if (n.length < 2) return bad(res, 400, 'Give the campus a name.'); set.name = n; }
  if (b.address !== undefined) set.address = clean(b.address, 200);
  if (b.phone !== undefined) set.phone = clean(b.phone, 30);
  if (b.status !== undefined) {
    if (!['active', 'closed'].includes(b.status)) return bad(res, 400, 'Status must be active or closed.');
    if (b.status === 'closed' && c.status !== 'closed') {
      if (c.isDefault) return bad(res, 409, 'The default campus cannot be closed.');
      const inUse = (await Class.countDocuments({ schoolId, campusId: c._id }));
      if (inUse) return bad(res, 409, `This campus still has ${inUse} class${inUse === 1 ? '' : 'es'}. Move them to another campus first.`);
      set.closedAt = new Date();
    }
    if (b.status === 'active') set.closedAt = null;
    set.status = b.status;
  }
  if (!Object.keys(set).length) return bad(res, 400, 'Nothing to change.');
  await Campus.updateOne({ _id: c._id, schoolId }, { $set: set });
  if (set.name) await CampusMembership.updateMany({ schoolId, campusId: c._id }, { $set: { campusName: set.name } });
  await audit(req, { action: 'campus.update', entityType: 'Campus', entityId: c._id, schoolId, detail: set });
  res.json({ campus: shape({ ...c.toObject(), ...set }) });
});

// move classes (and with them their students) to a campus. A campus admin may only move between their own campuses.
exports.assignClasses = wrap('campus.assign', async (req, res) => {
  const schoolId = sid(req); const ids = Array.isArray(req.body?.classIds) ? [...new Set(req.body.classIds.map(String))] : [];
  const target = oid(req.params.id) ? await Campus.findOne({ _id: oid(req.params.id), schoolId }) : null;
  if (!target) return bad(res, 404, 'Campus not found');
  if (target.status !== 'active') return bad(res, 409, 'That campus is closed.');
  if (!ids.length || ids.length > 200 || !ids.every((i) => oid(i))) return bad(res, 400, 'Choose the classes to move.');
  if (!(await CS.canAccessCampus(req.user, target._id))) return bad(res, 403, 'That campus is outside your access.');
  const classes = await Class.find({ schoolId, _id: { $in: ids.map(oid) } });
  if (classes.length !== ids.length) return bad(res, 404, 'One of the classes was not found.');
  for (const c of classes) if (!(await CS.canAccessClass(req.user, c._id))) return bad(res, 403, 'One of those classes is outside your campus.');
  const def = await CS.ensureDefault(schoolId);
  const moved = [];
  for (const c of classes) {
    const from = String(c.campusId || def._id);
    if (from === String(target._id)) continue;
    await Class.updateOne({ _id: c._id, schoolId }, { $set: { campusId: target._id } });
    moved.push({ classId: c._id, name: `${c.standard}-${c.division}`, from });
  }
  CS.bust(schoolId);
  await audit(req, { action: 'campus.assign-classes', entityType: 'Campus', entityId: target._id, schoolId, detail: { campus: target.name, moved } });
  res.json({ moved: moved.length, campus: shape(target) });
});

exports.classes = wrap('campus.classes', async (req, res) => {
  const schoolId = sid(req);
  const sc = await CS.scopeOf(req.user); const def = await CS.ensureDefault(schoolId);
  const rows = await Class.find({ schoolId }).select('standard division campusId studentCount');
  res.json({ classes: rows.filter((c) => !sc || sc.classIds.has(String(c._id))).map((c) => ({ _id: c._id, name: `${c.standard}-${c.division}`, campusId: c.campusId || def._id, students: c.studentCount || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) });
});

// ── the people who work at each branch ──
// A teacher or a member of staff belongs to one branch. Nobody is hidden by this: it is for the
// office to know who is where, and for the branch roll-up to be honest. An empty branch means the
// main one, the same as for a class.
exports.staff = wrap('campus.staff', async (req, res) => {
  const schoolId = sid(req);
  const Teacher = require('../models/Teacher');
  const Employee = require('../models/Employee');
  const def = await CS.ensureDefault(schoolId);
  const sc = await CS.scopeOf(req.user);
  const [teachers, staffRows] = await Promise.all([
    Teacher.find({ schoolId }).select('name email campusId designation').sort({ name: 1 }).limit(2000),
    Employee.find({ schoolId, status: { $ne: 'Separated' } }).select('name code kind campusId teacherId').sort({ name: 1 }).limit(2000),
  ]);
  const mine = (campusId) => !sc || sc.campusIds.includes(String(campusId || def._id));
  res.json({
    teachers: teachers.filter((t) => mine(t.campusId)).map((t) => ({ _id: t._id, name: t.name, email: t.email, role: t.designation || 'Teacher', campusId: String(t.campusId || def._id) })),
    staff: staffRows.filter((e) => mine(e.campusId)).map((e) => ({ _id: e._id, name: e.name, code: e.code, role: e.kind, linkedTeacher: !!e.teacherId, campusId: String(e.campusId || def._id) })),
    defaultCampusId: String(def._id),
  });
});

// move teachers and staff to a branch
exports.assignStaff = wrap('campus.assignStaff', async (req, res) => {
  const schoolId = sid(req);
  const Teacher = require('../models/Teacher');
  const Employee = require('../models/Employee');
  const target = oid(req.params.id) ? await Campus.findOne({ _id: oid(req.params.id), schoolId }) : null;
  if (!target) return bad(res, 404, 'Campus not found');
  if (target.status !== 'active') return bad(res, 409, 'That campus is closed.');
  if (!(await CS.canAccessCampus(req.user, target._id))) return bad(res, 403, 'That campus is outside your access.');
  const teacherIds = Array.isArray(req.body?.teacherIds) ? [...new Set(req.body.teacherIds.map(String))].filter(oid) : [];
  const staffIds = Array.isArray(req.body?.staffIds) ? [...new Set(req.body.staffIds.map(String))].filter(oid) : [];
  if (!teacherIds.length && !staffIds.length) return bad(res, 400, 'Choose the people to move.');
  if (teacherIds.length + staffIds.length > 400) return bad(res, 400, 'Move at most 400 people at a time.');
  const t = teacherIds.length ? await Teacher.updateMany({ schoolId, _id: { $in: teacherIds.map(oid) } }, { $set: { campusId: target._id } }) : { modifiedCount: 0 };
  const e = staffIds.length ? await Employee.updateMany({ schoolId, _id: { $in: staffIds.map(oid) } }, { $set: { campusId: target._id } }) : { modifiedCount: 0 };
  await audit(req, { action: 'campus.assign-staff', entityType: 'Campus', entityId: target._id, schoolId, detail: { campus: target.name, teachers: teacherIds.length, staff: staffIds.length } });
  res.json({ moved: (t.modifiedCount ?? teacherIds.length) + (e.modifiedCount ?? staffIds.length), campus: shape(target) });
});

// ── campus administrators ──
exports.members = wrap('campus.members', async (req, res) => {
  if (!(await schoolWide(req, res))) return;
  const schoolId = sid(req);
  const [admins, rows] = await Promise.all([User.find({ schoolId, role: 'admin' }).select('name email'), CampusMembership.find({ schoolId })]);
  const live = rows.filter((m) => !m.revokedAt);
  res.json({ admins: admins.map((a) => {
    const mine = live.filter((m) => String(m.userId) === String(a._id));
    return { _id: a._id, name: a.name, email: a.email, schoolWide: mine.length === 0, memberships: mine.map((m) => ({ _id: m._id, campusId: m.campusId, campusName: m.campusName })) };
  }) });
});

exports.addMember = wrap('campus.addMember', async (req, res) => {
  if (!(await schoolWide(req, res))) return;
  const schoolId = sid(req); const b = req.body || {};
  const campus = oid(b.campusId) ? await Campus.findOne({ _id: oid(b.campusId), schoolId }) : null;
  if (!campus) return bad(res, 404, 'Campus not found');
  if (campus.status !== 'active') return bad(res, 409, 'That campus is closed.');
  const user = oid(b.userId) ? await User.findOne({ _id: oid(b.userId), schoolId, role: 'admin' }).select('name') : null;
  if (!user) return bad(res, 404, 'Administrator not found');
  // somebody must always be able to see the whole school
  const [admins, rows] = await Promise.all([User.find({ schoolId, role: 'admin' }).select('_id'), CampusMembership.find({ schoolId })]);
  const limited = new Set(rows.filter((m) => !m.revokedAt).map((m) => String(m.userId))); limited.add(String(user._id));
  if (!admins.some((a) => !limited.has(String(a._id)))) return bad(res, 409, 'At least one administrator must stay school-wide. Add another administrator first.');
  try {
    const m = await CampusMembership.create({ schoolId, userId: user._id, userName: user.name, campusId: campus._id, campusName: campus.name, activeKey: `${user._id}:${campus._id}`, addedByName: req.actorName || '' });
    CS.bust(schoolId);
    await audit(req, { action: 'campus.member-add', entityType: 'CampusMembership', entityId: m._id, schoolId, detail: { admin: user.name, campus: campus.name } });
    res.status(201).json({ membership: { _id: m._id, userId: m.userId, campusId: m.campusId, campusName: m.campusName } });
  } catch (e) { if (isDup(e)) return bad(res, 409, 'That administrator already works on this campus.'); throw e; }
});

exports.removeMember = wrap('campus.removeMember', async (req, res) => {
  if (!(await schoolWide(req, res))) return;
  const schoolId = sid(req);
  const m = oid(req.params.mid) ? await CampusMembership.findOne({ _id: oid(req.params.mid), schoolId }) : null;
  if (!m || m.revokedAt) return bad(res, 404, 'Membership not found');
  await CampusMembership.updateOne({ _id: m._id, schoolId }, { $set: { revokedAt: new Date(), revokedByName: req.actorName || '' }, $unset: { activeKey: 1 } });
  CS.bust(schoolId);
  await audit(req, { action: 'campus.member-remove', entityType: 'CampusMembership', entityId: m._id, schoolId, detail: { admin: m.userName, campus: m.campusName } });
  res.json({ ok: true });
});
