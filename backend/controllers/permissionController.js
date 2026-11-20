const mongoose = require('../lib/pgdoc');
const PermissionGrant = require('../models/PermissionGrant');
const User = require('../models/User'); const Teacher = require('../models/Teacher'); const Class = require('../models/Class');
const P = require('../utils/permissions'); const N = require('../utils/notify');
const { audit } = require('../utils/audit');
const Campus = require('../utils/campus'); const CampusModel = require('../models/Campus');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const shape = (g) => ({ _id: g._id, granteeId: g.granteeId, granteeName: g.granteeName, action: g.action, label: P.CATALOG[g.action]?.label || g.action, classId: g.classId, className: g.className, campusId: g.campusId || null, campusName: g.campusName || '',
  source: g.source, validFrom: g.validFrom, validTo: g.validTo, reason: g.reason, grantedByName: g.grantedByName, revokedAt: g.revokedAt, revokeReason: g.revokeReason, active: P.liveGrant(g, new Date()) });

exports.matrix = async (req, res) => {
  res.json({ actions: Object.entries(P.CATALOG).map(([action, d]) => ({ action, ...d })), limits: { maxGrantDays: P.MAX_GRANT_DAYS, maxBreakGlassMinutes: P.MAX_BREAK_GLASS_MIN } });
};

exports.list = async (req, res) => {
  try {
    const q = { schoolId: req.user.schoolId };
    if (req.query.source === 'break-glass') q.source = 'break-glass';
    const sc = await Campus.scopeOf(req.user);
    if (sc && req.query.source !== 'break-glass') q.campusId = { $in: sc.campusIds.map((i) => new mongoose.Types.ObjectId(i)) };   // a campus admin sees the grants of their campuses
    const rows = await PermissionGrant.find(q).sort({ createdAt: -1 }).limit(200);
    const out = rows.map(shape);
    res.json({ grants: req.query.active === '1' ? out.filter((g) => g.active) : out });
  } catch (e) { fail(res, e); }
};

exports.create = async (req, res) => {
  try {
    const b = req.body || {}; const sid = req.user.schoolId;
    const def = P.CATALOG[b.action];
    if (!def || !def.grantable) return res.status(400).json({ message: 'This permission cannot be granted.' });
    if (!isId(b.granteeId) || !['admin', 'teacher'].includes(b.granteeRole)) return res.status(400).json({ message: 'Choose who receives it.' });
    if (String(b.granteeId) === String(req.user.userId)) return res.status(403).json({ message: 'You cannot grant a permission to yourself. Ask another admin, or use emergency access.' });
    if (String(b.reason || '').trim().length < 5) return res.status(400).json({ message: 'Write the reason for this grant.' });
    const from = b.validFrom ? new Date(b.validFrom) : new Date(); const to = b.validTo ? new Date(b.validTo) : null;
    if (!to || Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) return res.status(400).json({ message: 'Choose when the permission ends.' });
    if (to <= from) return res.status(400).json({ message: 'The end must be after the start.' });
    if ((to - from) / 864e5 > P.MAX_GRANT_DAYS) return res.status(422).json({ message: `A permission can last at most ${P.MAX_GRANT_DAYS} days. Renew it when it ends.` });

    const Model = b.granteeRole === 'teacher' ? Teacher : User;
    const grantee = await Model.findOne({ _id: b.granteeId, schoolId: sid }).select('name');
    if (!grantee) return res.status(404).json({ message: 'Person not found' });
    if (b.action === 'safeguarding.case.read' && b.granteeRole !== 'admin') return res.status(422).json({ message: 'Only school admins can be given access to restriction reasons.' });
    let cls = null;
    if (def.scope === 'class') {
      if (!isId(b.classId)) return res.status(400).json({ message: 'Choose the class.' });
      cls = await Class.findOne({ _id: b.classId, schoolId: sid });
      if (!cls) return res.status(404).json({ message: 'Class not found' });
      if (b.granteeRole !== 'teacher') return res.status(422).json({ message: 'Admins can already take attendance for every class.' });
    }
    // optional campus limit. A campus admin may only grant inside their own campuses, and never for the whole school.
    let campus = null; const mine = await Campus.scopeOf(req.user);
    if (b.campusId) {
      campus = isId(b.campusId) ? await CampusModel.findOne({ _id: b.campusId, schoolId: sid, status: 'active' }) : null;
      if (!campus) return res.status(404).json({ message: 'Campus not found' });
      if (cls && String(await Campus.campusOfClass(sid, cls._id)) !== String(campus._id)) return res.status(422).json({ message: 'That class is not on the chosen campus.' });
    }
    if (mine) {
      const where = campus ? String(campus._id) : cls ? await Campus.campusOfClass(sid, cls._id) : null;
      if (!where || !mine.campusIds.includes(String(where))) return res.status(403).json({ message: 'You can only give access inside your own campus. Choose a campus or a class you look after.' });
      if (!campus) campus = await CampusModel.findOne({ _id: where, schoolId: sid });
    }
    const dup = (await PermissionGrant.find({ schoolId: sid, granteeId: grantee._id, action: b.action, classId: cls ? cls._id : null, campusId: campus ? campus._id : null })).find((g) => P.liveGrant(g, to) || P.liveGrant(g, from));
    if (dup) return res.status(422).json({ message: 'This person already has this permission for that period.' });

    const g = await PermissionGrant.create({ schoolId: sid, granteeId: grantee._id, granteeModel: b.granteeRole === 'teacher' ? 'Teacher' : 'User', granteeName: grantee.name, action: b.action,
      classId: cls ? cls._id : null, className: cls ? `${cls.standard}-${cls.division}` : '', campusId: campus ? campus._id : null, campusName: campus ? campus.name : '', source: 'grant', validFrom: from, validTo: to, reason: String(b.reason).slice(0, 300),
      grantedBy: req.user.userId, grantedByName: req.actorName || '' });
    await audit(req, { action: 'permission.grant', entityType: 'PermissionGrant', entityId: g._id, schoolId: sid, detail: { grantee: grantee.name, permission: b.action, classId: cls?._id || null, campusId: campus?._id || null, until: to } });
    await N.notify({ schoolId: sid, recipients: [{ id: grantee._id, role: b.granteeRole }], title: `You have new access: ${def.label}`, body: `${cls ? `Class ${cls.standard}-${cls.division}. ` : ''}Until ${to.toDateString()}.`, type: 'general' });
    res.status(201).json({ grant: shape(g) });
  } catch (e) { fail(res, e); }
};

exports.revoke = async (req, res) => {
  try {
    const g = isId(req.params.id) ? await PermissionGrant.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null;
    if (!g) return res.status(404).json({ message: 'Grant not found' });
    { const sc = await Campus.scopeOf(req.user); if (sc && (!g.campusId || !sc.campusIds.includes(String(g.campusId)))) return res.status(404).json({ message: 'Grant not found' }); }
    if (g.revokedAt || new Date(g.validTo) <= new Date()) return res.status(422).json({ message: 'This permission has already ended.' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ message: 'Write a short reason.' });
    g.revokedAt = new Date(); g.revokedByName = req.actorName || ''; g.revokeReason = reason.slice(0, 300); await g.save();
    await audit(req, { action: 'permission.revoke', entityType: 'PermissionGrant', entityId: g._id, schoolId: req.user.schoolId, detail: { grantee: g.granteeName, permission: g.action, reason } });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
};

// Emergency access for the admin who asks. Short, reasoned, told to every other admin, never silent.
exports.breakGlass = async (req, res) => {
  try {
    const b = req.body || {}; const sid = req.user.schoolId;
    const def = P.CATALOG[b.action];
    if (!def || !def.breakGlass) return res.status(400).json({ message: 'Emergency access is not available for this permission.' });
    const reason = String(b.reason || '').trim();
    if (reason.length < 15) return res.status(400).json({ message: 'Describe the emergency in at least a sentence. Other admins will be told.' });
    const minutes = Math.min(P.MAX_BREAK_GLASS_MIN, Math.max(5, parseInt(b.minutes, 10) || 30));
    const me = await User.findOne({ _id: req.user.userId, schoolId: sid }).select('name');
    if (!me) return res.status(404).json({ message: 'Account not found' });
    const open = (await PermissionGrant.find({ schoolId: sid, granteeId: me._id, action: b.action, source: 'break-glass' })).find((g) => P.liveGrant(g, new Date()));
    if (open) return res.status(422).json({ message: 'You already have emergency access running.' });
    const now = new Date();
    const g = await PermissionGrant.create({ schoolId: sid, granteeId: me._id, granteeModel: 'User', granteeName: me.name, action: b.action, source: 'break-glass',
      validFrom: now, validTo: new Date(now.getTime() + minutes * 60000), reason: reason.slice(0, 300), grantedBy: me._id, grantedByName: me.name });
    await audit(req, { action: 'permission.break-glass', entityType: 'PermissionGrant', entityId: g._id, schoolId: sid, detail: { permission: b.action, minutes, reason } });
    const others = (await N.admins(sid)).filter((a) => String(a.id) !== String(me._id));
    await N.notify({ schoolId: sid, recipients: others, title: `${me.name} used emergency access`, body: `${def.label} for ${minutes} minutes. Reason: ${reason}`.slice(0, 200), type: 'general' });
    res.status(201).json({ grant: shape(g), notifiedAdmins: others.length });
  } catch (e) { fail(res, e); }
};

exports.people = async (req, res) => {
  try {
    const sid = req.user.schoolId;
    await Campus.ensureDefault(sid); const scope = await Campus.scopeOf(req.user);
    const campuses = (await CampusModel.find({ schoolId: sid, status: 'active' }).sort({ isDefault: -1, name: 1 })).filter((c) => !scope || scope.campusIds.includes(String(c._id)));
    const [admins, teachers, classes] = await Promise.all([User.find({ schoolId: sid, role: 'admin' }).select('name email'), Teacher.find({ schoolId: sid }).select('name email'), Class.find({ schoolId: sid }).select('standard division')]);
    res.json({ campuses: campuses.map((c) => ({ _id: c._id, name: c.name })), admins: admins.map((u) => ({ _id: u._id, name: u.name, email: u.email })), teachers: teachers.map((u) => ({ _id: u._id, name: u.name, email: u.email })),
      classes: classes.map((c) => ({ _id: c._id, name: `${c.standard}-${c.division}` })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) });
  } catch (e) { fail(res, e); }
};
