// Organizations: groups of schools managed by the platform owner (PRD E01).
// An organization only groups schools. It never gives anyone in one school access to another school's records.
const Organization = require('../models/Organization');
const School = require('../models/School');
const { audit } = require('../utils/audit');
const { oid, bad, wrap, clean } = require('../utils/early/service');

const isDup = (e) => e && (e.code === 11000 || /duplicate key|E11000/.test(e.message || ''));
const slugOf = (v) => clean(v, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const shape = (o, schools = []) => ({ _id: o._id, name: o.name, slug: o.slug, contactName: o.contactName, contactEmail: o.contactEmail, status: o.status, createdAt: o.createdAt,
  schoolCount: schools.length, schools: schools.map((s) => ({ _id: s._id, name: s.name, code: s.code, plan: s.plan, isActive: s.isActive })) });
const load = async (id) => (oid(id) ? Organization.findById(oid(id)) : null);

exports.list = wrap('org.list', async (req, res) => {
  const [orgs, schools] = await Promise.all([Organization.find({}).sort({ createdAt: -1 }).limit(200), School.find({ organizationId: { $ne: null } }).select('name code plan isActive organizationId').limit(2000)]);
  res.json({ organizations: orgs.map((o) => shape(o, schools.filter((s) => String(s.organizationId) === String(o._id)))) });
});

exports.create = wrap('org.create', async (req, res) => {
  const b = req.body || {}; const name = clean(b.name, 100); const slug = slugOf(b.slug || name);
  if (name.length < 2 || slug.length < 2) return bad(res, 400, 'Give the organization a name.');
  try {
    const o = await Organization.create({ name, slug, contactName: clean(b.contactName, 80), contactEmail: clean(b.contactEmail, 120), createdByName: req.actorName || '' });
    await audit(req, { action: 'organization.create', entityType: 'Organization', entityId: o._id, detail: { name, slug } });
    res.status(201).json({ organization: shape(o) });
  } catch (e) { if (isDup(e)) return bad(res, 409, 'That organization name is already taken.'); throw e; }
});

exports.update = wrap('org.update', async (req, res) => {
  const o = await load(req.params.id); if (!o) return bad(res, 404, 'Organization not found');
  const b = req.body || {}; const set = {};
  if (b.name !== undefined) { const n = clean(b.name, 100); if (n.length < 2) return bad(res, 400, 'Give the organization a name.'); set.name = n; }
  if (b.contactName !== undefined) set.contactName = clean(b.contactName, 80);
  if (b.contactEmail !== undefined) set.contactEmail = clean(b.contactEmail, 120);
  if (b.status !== undefined) { if (!['active', 'suspended'].includes(b.status)) return bad(res, 400, 'Status must be active or suspended.'); set.status = b.status; }
  if (!Object.keys(set).length) return bad(res, 400, 'Nothing to change.');
  await Organization.updateOne({ _id: o._id }, { $set: set });
  await audit(req, { action: 'organization.update', entityType: 'Organization', entityId: o._id, detail: set });
  res.json({ organization: shape({ ...o.toObject(), ...set }) });
});

exports.get = wrap('org.get', async (req, res) => {
  const o = await load(req.params.id); if (!o) return bad(res, 404, 'Organization not found');
  res.json({ organization: shape(o, await School.find({ organizationId: o._id }).select('name code plan isActive')) });
});

exports.unassigned = wrap('org.unassigned', async (req, res) => {
  const all = await School.find({}).select('name code organizationId').limit(2000);
  res.json({ schools: all.filter((s) => !s.organizationId).map((s) => ({ _id: s._id, name: s.name, code: s.code })) });
});

exports.attach = wrap('org.attach', async (req, res) => {
  const o = await load(req.params.id); if (!o) return bad(res, 404, 'Organization not found');
  if (o.status !== 'active') return bad(res, 409, 'This organization is suspended.');
  const s = oid(req.body?.schoolId) ? await School.findById(oid(req.body.schoolId)).select('name organizationId') : null;
  if (!s) return bad(res, 404, 'School not found');
  if (s.organizationId && String(s.organizationId) !== String(o._id)) return bad(res, 409, 'That school already belongs to another organization. Remove it from there first.');
  await School.updateOne({ _id: s._id }, { $set: { organizationId: o._id } });
  await audit(req, { action: 'organization.attach', entityType: 'Organization', entityId: o._id, schoolId: s._id, detail: { school: s.name, organization: o.name } });
  res.json({ ok: true });
});

exports.detach = wrap('org.detach', async (req, res) => {
  const o = await load(req.params.id); if (!o) return bad(res, 404, 'Organization not found');
  const s = oid(req.params.schoolId) ? await School.findOne({ _id: oid(req.params.schoolId), organizationId: o._id }).select('name') : null;
  if (!s) return bad(res, 404, 'That school is not in this organization.');
  await School.updateOne({ _id: s._id }, { $set: { organizationId: null } });
  await audit(req, { action: 'organization.detach', entityType: 'Organization', entityId: o._id, schoolId: s._id, detail: { school: s.name, organization: o.name } });
  res.json({ ok: true });
});
