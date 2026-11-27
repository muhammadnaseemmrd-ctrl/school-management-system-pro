// The group director's own portal: a trust or chain that runs several schools under one name.
//
// What a director may do: open a school under their group, appoint the people who run it
// (administrators and principals), reset those people's passwords, suspend a school, and see how
// the group as a whole is doing.
//
// What a director may never do: read inside a school. No child's name, no mark, no fee, no
// message. A group's head office is not a party to a child's record, and a director who needs to
// look inside a school is given an account in that school like anybody else. Every door below
// returns counts and the school's own details, never its records.

const mongoose = require('../lib/pgdoc');
const Director = require('../models/Director');
const Organization = require('../models/Organization');
const School = require('../models/School');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Campus = require('../models/Campus');
const { hashPassword, comparePassword, validatePasswordStrength, strongTempPassword } = require('../utils/password');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');
const { audit } = require('../utils/audit');
const { getPlansMap } = require('../utils/plans');

const clean = (v, n = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001F]/g, '').trim().slice(0, n);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const bad = (res, s, m, extra) => res.status(s).json({ message: m, ...(extra || {}) });
const wrap = (what, fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e && e.status) return bad(res, e.status, e.message);
    console.error(`director ${what}:`, e);
    return bad(res, 500, 'Something went wrong. Please try again.');
  }
};
const oid = (v) => { try { return new mongoose.Types.ObjectId(String(v)); } catch (e) { return null; } };
const publicDirector = (d) => ({
  _id: d._id, name: d.name, email: d.email, phone: d.phone, title: d.title, role: 'director',
  organizationId: d.organizationId, canCreateSchools: !!d.canCreateSchools, canAppointAdmins: !!d.canAppointAdmins,
  isActive: d.isActive, lastLogin: d.lastLogin,
});

/* ───────────────────────── signing in ───────────────────────── */

exports.login = wrap('login', async (req, res) => {
  const email = clean(req.body?.email, 160).toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return bad(res, 400, 'Email and password are required');
  const d = await Director.findOne({ email }).select('+password');
  if (!d || !(await comparePassword(password, d.password))) return bad(res, 401, 'Invalid credentials');
  if (!d.isActive) return bad(res, 403, 'This director account is suspended. Please contact the platform owner.');
  const org = await Organization.findById(d.organizationId);
  if (!org) return bad(res, 403, 'This group no longer exists. Please contact the platform owner.');
  if (org.status !== 'active') return bad(res, 403, 'This group is suspended. Please contact the platform owner.');

  const accessToken = generateAccessToken(d._id, null, 'director');
  const refreshToken = generateRefreshToken(d._id, null, 'director');
  d.refreshTokens.push({ token: refreshToken });
  d.lastLogin = new Date();
  await d.save();
  res.json({ message: 'Login successful', user: { ...publicDirector(d), organization: { _id: org._id, name: org.name } }, school: null, accessToken, refreshToken });
});

// Every call in the portal loads the director afresh: a suspended director or group stops at once.
exports.requireActiveDirector = async (req, res, next) => {
  try {
    const d = await Director.findById(req.user.userId);
    if (!d) return bad(res, 401, 'Director not found');
    if (!d.isActive) return res.status(423).json({ message: 'This director account is suspended.', code: 'DIRECTOR_SUSPENDED' });
    const org = await Organization.findById(d.organizationId);
    if (!org || org.status !== 'active') return res.status(423).json({ message: 'This group is suspended.', code: 'ORG_SUSPENDED' });
    req.director = d;
    req.organization = org;
    req.actorName = d.name;
    next();
  } catch (e) {
    console.error('director requireActiveDirector:', e);
    return bad(res, 500, 'Something went wrong. Please try again.');
  }
};

const mayCreate = (req, res, next) => (req.director.canCreateSchools ? next() : bad(res, 403, 'You are not able to open new schools in this group. Ask the platform owner.'));
const mayAppoint = (req, res, next) => (req.director.canAppointAdmins ? next() : bad(res, 403, 'You are not able to appoint people in this group. Ask the platform owner.'));
exports.mayCreate = mayCreate;
exports.mayAppoint = mayAppoint;

/* ───────────────────────── the group ───────────────────────── */

// Counts only. The numbers a head office needs, and nothing a head office has no business reading.
const countsFor = async (schoolIds) => {
  if (!schoolIds.length) return {};
  const out = {};
  for (const id of schoolIds) {
    const [students, teachers, classes, campuses, admins] = await Promise.all([
      Student.countDocuments({ schoolId: id, isActive: { $ne: false } }),
      Teacher.countDocuments({ schoolId: id }),
      Class.countDocuments({ schoolId: id }),
      Campus.countDocuments({ schoolId: id, status: 'active' }),
      User.countDocuments({ schoolId: id, role: 'admin', isActive: { $ne: false } }),
    ]);
    out[String(id)] = { students, teachers, classes, campuses, admins };
  }
  return out;
};

const schoolHead = (s, counts) => ({
  _id: s._id, name: s.name, nameUr: s.nameUr || '', institutionType: s.institutionType || 'school',
  institutionLabel: require('../utils/institutionTypes').get(s.institutionType).label,
  code: s.code, email: s.email, phone: s.phone,
  city: s.address?.city || '', principalName: s.principalName || '', principalEmail: s.principalEmail || '',
  plan: s.plan, isActive: s.isActive, studentLimit: s.studentLimit, teacherLimit: s.teacherLimit,
  subscriptionExpiresAt: s.subscriptionExpiresAt || null, createdAt: s.createdAt,
  counts: counts[String(s._id)] || { students: 0, teachers: 0, classes: 0, campuses: 0, admins: 0 },
});

exports.institutionTypes = wrap('institutionTypes', async (req, res) => {
  const IT = require('../utils/institutionTypes');
  res.json({ types: IT.catalogue() });
});

exports.overview = wrap('overview', async (req, res) => {
  const schools = await School.find({ organizationId: req.director.organizationId }).sort({ name: 1 }).limit(500);
  const counts = await countsFor(schools.map((s) => s._id));
  const total = schools.reduce((a, s) => {
    const c = counts[String(s._id)] || {};
    return { students: a.students + (c.students || 0), teachers: a.teachers + (c.teachers || 0), classes: a.classes + (c.classes || 0), campuses: a.campuses + (c.campuses || 0) };
  }, { students: 0, teachers: 0, classes: 0, campuses: 0 });
  res.json({
    organization: { _id: req.organization._id, name: req.organization.name, slug: req.organization.slug },
    director: publicDirector(req.director),
    schools: schools.map((s) => schoolHead(s, counts)),
    totals: { ...total, schools: schools.length, open: schools.filter((s) => s.isActive).length },
  });
});

// A school in this group, or nothing. This is the only way a school id is ever accepted.
const ownSchool = async (req) => {
  const id = oid(req.params.id);
  if (!id) return null;
  return School.findOne({ _id: id, organizationId: req.director.organizationId });
};

exports.getSchool = wrap('getSchool', async (req, res) => {
  const s = await ownSchool(req);
  if (!s) return bad(res, 404, 'That school is not in your group.');
  const counts = await countsFor([s._id]);
  const admins = await User.find({ schoolId: s._id, role: 'admin' }).select('name email phone isActive lastLogin createdAt').sort({ createdAt: 1 }).limit(100);
  const campuses = await Campus.find({ schoolId: s._id }).select('name code status isDefault').sort({ isDefault: -1, name: 1 }).limit(100);
  res.json({
    school: schoolHead(s, counts),
    admins: admins.map((a) => ({ _id: a._id, name: a.name, email: a.email, phone: a.phone || '', isActive: a.isActive !== false, lastLogin: a.lastLogin || null, createdAt: a.createdAt })),
    campuses: campuses.map((c) => ({ _id: c._id, name: c.name, code: c.code, status: c.status, isDefault: !!c.isDefault })),
  });
});

/* ───────────────────────── opening a school ───────────────────────── */

exports.createSchool = wrap('createSchool', async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 120);
  const code = clean(b.code, 24).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const email = clean(b.email, 160).toLowerCase();
  const phone = clean(b.phone, 32);
  const adminName = clean(b.adminName, 80);
  const adminEmail = clean(b.adminEmail, 160).toLowerCase();

  if (name.length < 2) return bad(res, 400, 'Give the school a name.');
  if (code.length < 2) return bad(res, 400, 'Give the school a code. People type it when they sign in.');
  if (!EMAIL.test(email)) return bad(res, 400, 'Give the school an email address.');
  if (!phone) return bad(res, 400, 'Give the school a phone number.');
  if (adminName.length < 2) return bad(res, 400, 'Name the person who will run this school.');
  if (!EMAIL.test(adminEmail)) return bad(res, 400, 'Give that person an email address. It is how they sign in.');

  // A director's own address must not become a school account: that would be a way into the records.
  if (adminEmail === String(req.director.email).toLowerCase()) return bad(res, 422, 'Use the head teacher\'s own email address, not yours. A director account cannot also run a school.');

  if (await School.findOne({ code })) return bad(res, 409, `The code ${code} is already used by another school.`);
  if (await School.findOne({ email })) return bad(res, 409, 'Another school already uses that email address.');
  if (await User.findOne({ email: adminEmail, role: 'admin' })) return bad(res, 409, 'Somebody already runs a school with that email address.');

  // A new school in a group starts on the group's usual plan, which the platform owner sets on the
  // organization. A director does not choose a plan, because a plan is a bill.
  const plans = await getPlansMap();
  const planSlug = plans.free ? 'free' : Object.keys(plans)[0];
  const plan = plans[planSlug] || { studentLimit: 0, teacherLimit: 0 };

  const adminId = new mongoose.Types.ObjectId();
  const schoolId = new mongoose.Types.ObjectId();
  const temporaryPassword = clean(b.adminPassword, 72) || strongTempPassword();
  if (b.adminPassword && !validatePasswordStrength(temporaryPassword)) {
    return bad(res, 400, 'The password needs at least 6 characters with a capital letter, a number and a symbol. Leave it empty and we will make one.');
  }

  const IT = require('../utils/institutionTypes');
  const institutionType = IT.keys.includes(String(b.institutionType)) ? String(b.institutionType) : IT.DEFAULT;

  const school = await School.create({
    _id: schoolId, name, nameUr: clean(b.nameUr, 160), institutionType, code, adminId, email, phone,
    address: { city: clean(b.city, 60), country: 'Pakistan' },
    principalName: adminName, principalEmail: adminEmail, isActive: true,
    organizationId: req.director.organizationId,
    plan: planSlug, studentLimit: plan.studentLimit, teacherLimit: plan.teacherLimit,
    createdVia: 'director',
  });
  await User.create({ _id: adminId, name: adminName, email: adminEmail, password: await hashPassword(temporaryPassword), phone, role: 'admin', schoolId });

  await audit(req, { action: 'director.school.create', entityType: 'School', entityId: schoolId, schoolId, detail: { name, code, organization: String(req.director.organizationId) } });
  res.status(201).json({
    school: schoolHead(school, {}),
    admin: { name: adminName, email: adminEmail, temporaryPassword, schoolCode: code },
  });
});

exports.updateSchool = wrap('updateSchool', async (req, res) => {
  const s = await ownSchool(req);
  if (!s) return bad(res, 404, 'That school is not in your group.');
  const b = req.body || {};
  const set = {};
  if (b.name !== undefined) { const n = clean(b.name, 120); if (n.length < 2) return bad(res, 400, 'Give the school a name.'); set.name = n; }
  if (b.nameUr !== undefined) set.nameUr = clean(b.nameUr, 160);
  if (b.institutionType !== undefined) {
    const IT = require('../utils/institutionTypes');
    if (!IT.keys.includes(String(b.institutionType))) return bad(res, 400, `Choose one of: ${IT.keys.join(', ')}.`);
    set.institutionType = String(b.institutionType);
  }
  if (b.phone !== undefined) set.phone = clean(b.phone, 32);
  if (b.city !== undefined) set.address = { ...(s.address || {}), city: clean(b.city, 60) };
  if (b.principalName !== undefined) set.principalName = clean(b.principalName, 80);
  if (!Object.keys(set).length) return bad(res, 400, 'Nothing to change.');
  await School.updateOne({ _id: s._id }, { $set: set });
  if (set.institutionType) require('../middleware/institution').forget(s._id);
  await audit(req, { action: 'director.school.update', entityType: 'School', entityId: s._id, schoolId: s._id, detail: set });
  res.json({ ok: true });
});

// Closing a school stops everyone in it signing in. It is reversible, and it is not deletion:
// a director may never delete a school's records.
exports.setSchoolOpen = wrap('setSchoolOpen', async (req, res) => {
  const s = await ownSchool(req);
  if (!s) return bad(res, 404, 'That school is not in your group.');
  const open = !!req.body?.open;
  const reason = clean(req.body?.reason, 200);
  if (!open && reason.length < 5) return bad(res, 400, 'Say why this school is being closed. Everyone in it is signed out.');
  await School.updateOne({ _id: s._id }, { $set: { isActive: open, suspendedReason: open ? '' : reason } });
  require('../middleware/auth').invalidateSchoolStatus(s._id);
  await audit(req, { action: open ? 'director.school.open' : 'director.school.close', entityType: 'School', entityId: s._id, schoolId: s._id, detail: { reason } });
  res.json({ ok: true });
});

/* ───────────────────────── the people who run each school ───────────────────────── */

exports.addAdmin = wrap('addAdmin', async (req, res) => {
  const s = await ownSchool(req);
  if (!s) return bad(res, 404, 'That school is not in your group.');
  const name = clean(req.body?.name, 80);
  const email = clean(req.body?.email, 160).toLowerCase();
  const phone = clean(req.body?.phone, 32);
  const title = clean(req.body?.title, 40) || 'Administrator';
  if (name.length < 2) return bad(res, 400, 'Give the person a name.');
  if (!EMAIL.test(email)) return bad(res, 400, 'Give the person an email address. It is how they sign in.');
  if (email === String(req.director.email).toLowerCase()) return bad(res, 422, 'A director account cannot also run a school. Use that person\'s own address.');
  if (await User.findOne({ email, schoolId: s._id, role: 'admin' })) return bad(res, 409, 'That person already runs this school.');

  const temporaryPassword = strongTempPassword();
  const u = await User.create({ name, email, password: await hashPassword(temporaryPassword), phone, role: 'admin', schoolId: s._id });
  if (/principal|head/i.test(title)) await School.updateOne({ _id: s._id }, { $set: { principalName: name, principalEmail: email } });
  await audit(req, { action: 'director.admin.add', entityType: 'User', entityId: u._id, schoolId: s._id, detail: { email, title } });
  res.status(201).json({ admin: { _id: u._id, name, email, phone, title }, temporaryPassword, schoolCode: s.code });
});

exports.resetAdminPassword = wrap('resetAdminPassword', async (req, res) => {
  const s = await ownSchool(req);
  if (!s) return bad(res, 404, 'That school is not in your group.');
  const u = oid(req.params.userId) ? await User.findOne({ _id: oid(req.params.userId), schoolId: s._id, role: 'admin' }) : null;
  if (!u) return bad(res, 404, 'That person does not run this school.');
  const temporaryPassword = strongTempPassword();
  await User.updateOne({ _id: u._id }, { $set: { password: await hashPassword(temporaryPassword), passwordChangedAt: new Date(), refreshTokens: [] } });
  await audit(req, { action: 'director.admin.reset', entityType: 'User', entityId: u._id, schoolId: s._id, detail: { email: u.email } });
  res.json({ temporaryPassword, email: u.email, schoolCode: s.code });
});

exports.setAdminActive = wrap('setAdminActive', async (req, res) => {
  const s = await ownSchool(req);
  if (!s) return bad(res, 404, 'That school is not in your group.');
  const u = oid(req.params.userId) ? await User.findOne({ _id: oid(req.params.userId), schoolId: s._id, role: 'admin' }) : null;
  if (!u) return bad(res, 404, 'That person does not run this school.');
  const active = !!req.body?.active;
  if (!active) {
    const others = await User.countDocuments({ schoolId: s._id, role: 'admin', isActive: { $ne: false }, _id: { $ne: u._id } });
    if (!others) return bad(res, 422, 'This is the only person who can run the school. Appoint somebody else first.');
  }
  await User.updateOne({ _id: u._id }, { $set: { isActive: active, ...(active ? {} : { refreshTokens: [] }) } });
  await audit(req, { action: active ? 'director.admin.enable' : 'director.admin.disable', entityType: 'User', entityId: u._id, schoolId: s._id, detail: { email: u.email } });
  res.json({ ok: true });
});

/* ───────────────────────── money across the group ─────────────────────────
   Totals and the schools' own expense lines. A group office decides budgets and staffing from
   these; it still cannot open a named child's fee record, and nothing below returns one.      */

const Fin = require('../utils/director/finance');

exports.finance = wrap('finance', async (req, res) => {
  const period = ['month', 'year', 'all'].includes(req.query.period) ? req.query.period : 'year';
  const out = await Fin.forGroup(req.director.organizationId, period);
  await audit(req, { action: 'director.finance.read', entityType: 'Organization', entityId: req.director.organizationId, detail: { period, schools: out.schools.length } }).catch(() => {});
  res.json(out);
});

exports.schoolFinance = wrap('schoolFinance', async (req, res) => {
  const s = await ownSchool(req);
  if (!s) return bad(res, 404, 'That school is not in your group.');
  const period = ['month', 'year', 'all'].includes(req.query.period) ? req.query.period : 'year';
  const out = await Fin.detailFor(s._id, period);
  await audit(req, { action: 'director.finance.school', entityType: 'School', entityId: s._id, schoolId: s._id, detail: { period } }).catch(() => {});
  res.json({ school: { _id: s._id, name: s.name, code: s.code, institutionType: s.institutionType || 'school' }, ...out });
});

/* ───────────────────────── the director's own account ───────────────────────── */

exports.me = wrap('me', async (req, res) => {
  res.json({ director: publicDirector(req.director), organization: { _id: req.organization._id, name: req.organization.name } });
});

exports.changePassword = wrap('changePassword', async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  const d = await Director.findById(req.director._id).select('+password');
  if (!(await comparePassword(current, d.password))) return bad(res, 401, 'That is not your current password.');
  if (!validatePasswordStrength(next)) return bad(res, 400, 'The new password needs at least 6 characters with a capital letter, a number and a symbol.');
  await Director.updateOne({ _id: d._id }, { $set: { password: await hashPassword(next), passwordChangedAt: new Date(), refreshTokens: [] } });
  res.json({ ok: true });
});

/* ───────── the platform owner's side: making and managing directors ───────── */

exports.ownerList = wrap('ownerList', async (req, res) => {
  const orgId = oid(req.params.id);
  if (!orgId) return bad(res, 404, 'Organization not found');
  const rows = await Director.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(100);
  res.json({ directors: rows.map(publicDirector) });
});

exports.ownerCreate = wrap('ownerCreate', async (req, res) => {
  const orgId = oid(req.params.id);
  const org = orgId ? await Organization.findById(orgId) : null;
  if (!org) return bad(res, 404, 'Organization not found');
  const b = req.body || {};
  const name = clean(b.name, 80);
  const email = clean(b.email, 160).toLowerCase();
  if (name.length < 2) return bad(res, 400, 'Give the director a name.');
  if (!EMAIL.test(email)) return bad(res, 400, 'Give the director an email address.');
  if (await Director.findOne({ email })) return bad(res, 409, 'A director already uses that email address.');
  const temporaryPassword = clean(b.password, 72) || strongTempPassword();
  if (b.password && !validatePasswordStrength(temporaryPassword)) return bad(res, 400, 'The password needs at least 6 characters with a capital letter, a number and a symbol.');
  const d = await Director.create({
    organizationId: org._id, name, email, phone: clean(b.phone, 32), title: clean(b.title, 40) || 'Director',
    password: await hashPassword(temporaryPassword),
    canCreateSchools: b.canCreateSchools !== false, canAppointAdmins: b.canAppointAdmins !== false,
    createdByName: req.actorName || 'Platform owner',
  });
  await audit(req, { action: 'organization.director.create', entityType: 'Director', entityId: d._id, detail: { email, organization: org.name } });
  res.status(201).json({ director: publicDirector(d), temporaryPassword });
});

exports.ownerUpdate = wrap('ownerUpdate', async (req, res) => {
  const d = oid(req.params.directorId) ? await Director.findById(oid(req.params.directorId)) : null;
  if (!d) return bad(res, 404, 'Director not found');
  const b = req.body || {};
  const set = {};
  if (b.name !== undefined) set.name = clean(b.name, 80);
  if (b.phone !== undefined) set.phone = clean(b.phone, 32);
  if (b.title !== undefined) set.title = clean(b.title, 40);
  if (b.canCreateSchools !== undefined) set.canCreateSchools = !!b.canCreateSchools;
  if (b.canAppointAdmins !== undefined) set.canAppointAdmins = !!b.canAppointAdmins;
  if (b.isActive !== undefined) { set.isActive = !!b.isActive; if (!b.isActive) set.refreshTokens = []; }
  if (!Object.keys(set).length) return bad(res, 400, 'Nothing to change.');
  await Director.updateOne({ _id: d._id }, { $set: set });
  await audit(req, { action: 'organization.director.update', entityType: 'Director', entityId: d._id, detail: set });
  res.json({ ok: true });
});

exports.ownerReset = wrap('ownerReset', async (req, res) => {
  const d = oid(req.params.directorId) ? await Director.findById(oid(req.params.directorId)) : null;
  if (!d) return bad(res, 404, 'Director not found');
  const temporaryPassword = strongTempPassword();
  await Director.updateOne({ _id: d._id }, { $set: { password: await hashPassword(temporaryPassword), passwordChangedAt: new Date(), refreshTokens: [] } });
  await audit(req, { action: 'organization.director.reset', entityType: 'Director', entityId: d._id, detail: { email: d.email } });
  res.json({ temporaryPassword, email: d.email });
});
