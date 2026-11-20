// Consent register (PRD E01): who agreed to what, on which wording, when, and how it was withdrawn.
const Consent = require('../models/Consent');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const GuardianLink = require('../models/GuardianLink');
const Class = require('../models/Class');
const C = require('../utils/consent');
const CS = require('../utils/campus');
const GR = require('../utils/guardianRights');
const { canAccessStudent } = require('../utils/access');
const { audit } = require('../utils/audit');
const { oid, sid, who, bad, wrap, clean, pg } = require('../utils/early/service');

const rowShape = (r, at = new Date()) => ({ _id: r._id, subjectType: r.subjectType, subjectId: r.subjectId, subjectName: r.subjectName, purpose: r.purpose, label: C.PURPOSES[r.purpose]?.label || r.purpose,
  version: r.version, status: r.status, state: C.stateOf(r, at), givenByName: r.givenByName, givenByRelation: r.givenByRelation, method: r.method, evidenceNote: r.evidenceNote,
  expiresAt: r.expiresAt, reason: r.reason, recordedByName: r.recordedByName, recordedByRole: r.recordedByRole, createdAt: r.createdAt, isCurrent: !!r.isCurrent });
const fail = (res, e) => (e.status ? bad(res, e.status, e.message) : (() => { throw e; })());

function parseGrant(b, { portal }) {
  const purpose = String(b.purpose || ''); const def = C.PURPOSES[purpose];
  if (!def) return { err: 'Choose what the consent is for.' };
  const type = String(b.subjectType || (def.subjects[0])); if (!def.subjects.includes(type)) return { err: `This consent is about a ${def.subjects.join(' or ')}.` };
  let expiresAt = null;
  if (b.expiresAt) { expiresAt = new Date(b.expiresAt); if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return { err: 'The end date must be in the future.' }; }
  const method = portal ? 'portal' : String(b.method || '');
  if (!portal && !['paper', 'in-person', 'phone'].includes(method)) return { err: 'Say how the consent was given: on paper, in person or by phone.' };
  return { purpose, def, type, expiresAt, method };
}

// the wording that exists today, so the parent screen can show it
exports.purposes = wrap('consent.purposes', async (req, res) => {
  res.json({ purposes: Object.entries(C.PURPOSES).map(([key, d]) => ({ key, ...d })) });
});

// ── admin ──
exports.list = wrap('consent.list', async (req, res) => {
  const schoolId = sid(req); const { p, l } = pg(req.query);
  const q = { schoolId };
  if (req.query.history !== '1') q.isCurrent = true;
  if (C.PURPOSES[req.query.purpose]) q.purpose = req.query.purpose;
  if (['student', 'parent', 'teacher'].includes(req.query.subjectType)) q.subjectType = req.query.subjectType;
  if (oid(req.query.subjectId)) q.subjectId = oid(req.query.subjectId);
  if (['granted', 'withdrawn'].includes(req.query.status)) q.status = req.query.status;
  const sc = await CS.scopeOf(req.user);
  if (sc) q.campusId = { $in: sc.campusIds.map(oid) };       // a campus admin sees only the consents of their campuses
  const [rows, total] = await Promise.all([Consent.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), Consent.countDocuments(q)]);
  res.json({ consents: rows.map((r) => rowShape(r)), total, page: p, pages: Math.max(1, Math.ceil(total / l)) });
});

exports.summary = wrap('consent.summary', async (req, res) => {
  const schoolId = sid(req); const now = new Date();
  const sc = await CS.scopeOf(req.user);
  const q = { schoolId, isCurrent: true }; if (sc) q.campusId = { $in: sc.campusIds.map(oid) };
  const rows = await Consent.find(q).select('purpose status expiresAt').limit(20000);
  const studentTotal = sc ? await Student.countDocuments({ schoolId, classId: { $in: [...sc.classIds].map(oid) } }) : await Student.countDocuments({ schoolId });
  const out = Object.entries(C.PURPOSES).map(([key, d]) => {
    const mine = rows.filter((r) => r.purpose === key);
    const granted = mine.filter((r) => C.live(r, now)).length; const withdrawn = mine.filter((r) => r.status === 'withdrawn').length;
    const expired = mine.filter((r) => r.status === 'granted' && !C.live(r, now)).length;
    return { key, label: d.label, subjects: d.subjects, version: d.version, granted, withdrawn, expired, unanswered: d.subjects.includes('student') ? Math.max(0, studentTotal - mine.length) : null };
  });
  res.json({ purposes: out, students: studentTotal });
});

// children with no answer yet for one purpose, so the office can chase them
exports.pending = wrap('consent.pending', async (req, res) => {
  const schoolId = sid(req); const purpose = String(req.query.purpose || '');
  if (!C.PURPOSES[purpose]?.subjects.includes('student')) return bad(res, 400, 'Choose a purpose that is asked about children.');
  const sc = await CS.scopeOf(req.user);
  const q = { schoolId }; if (sc) q.classId = { $in: [...sc.classIds].map(oid) };
  const [students, answered, classes] = await Promise.all([Student.find(q).select('name classId').limit(3000), Consent.find({ schoolId, isCurrent: true, purpose, subjectType: 'student' }).select('subjectId'), Class.find({ schoolId }).select('standard division')]);
  const done = new Set(answered.map((r) => String(r.subjectId))); const cn = new Map(classes.map((c) => [String(c._id), `${c.standard}-${c.division}`]));
  const open = students.filter((s) => !done.has(String(s._id)));
  res.json({ total: open.length, students: open.slice(0, 200).map((s) => ({ _id: s._id, name: s.name, className: cn.get(String(s.classId)) || '' })) });
});

exports.history = wrap('consent.history', async (req, res) => {
  const schoolId = sid(req); const type = String(req.query.subjectType || ''); const purpose = String(req.query.purpose || '');
  if (!C.MODEL[type] || !C.PURPOSES[purpose] || !oid(req.query.subjectId)) return bad(res, 400, 'Choose the person and the purpose.');
  const sub = await C.subject(schoolId, type, req.query.subjectId); if (!sub) return bad(res, 404, 'Person not found');
  if (type === 'student' && !(await canAccessStudent(req.user, sub._id))) return bad(res, 404, 'Person not found');
  const rows = await Consent.find({ schoolId, subjectType: type, subjectId: sub._id, purpose }).sort({ createdAt: -1 }).limit(100);
  res.json({ subject: { _id: sub._id, name: sub.name }, history: rows.map((r) => rowShape(r)) });
});

exports.check = wrap('consent.check', async (req, res) => {
  const schoolId = sid(req); const type = String(req.query.subjectType || 'student'); const purpose = String(req.query.purpose || '');
  if (!C.MODEL[type] || !C.PURPOSES[purpose]) return bad(res, 400, 'Choose the person and the purpose.');
  const sub = await C.subject(schoolId, type, req.query.subjectId); if (!sub) return bad(res, 404, 'Person not found');
  if (type === 'student' && !(await canAccessStudent(req.user, sub._id))) return bad(res, 404, 'Person not found');
  res.json(await C.check(schoolId, type, sub._id, purpose));
});

exports.record = wrap('consent.record', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {};
  const g = parseGrant(b, { portal: false }); if (g.err) return bad(res, 400, g.err);
  const sub = await C.subject(schoolId, g.type, b.subjectId); if (!sub) return bad(res, 404, 'Person not found');
  if (g.type === 'student' && !(await canAccessStudent(req.user, sub._id))) return bad(res, 404, 'Person not found');
  if (g.type !== 'student' && (await CS.scopeOf(req.user))) return bad(res, 403, 'Only a school-wide administrator can record this.');
  const givenByName = clean(b.givenByName, 80); if (givenByName.length < 2) return bad(res, 400, 'Write the name of the person who agreed.');
  try {
    const row = await C.append({ schoolId, type: g.type, subjectDoc: sub, purpose: g.purpose, status: 'granted', version: g.def.version, givenByName, givenByRelation: clean(b.givenByRelation, 40),
      method: g.method, evidenceNote: clean(b.evidenceNote, 300), expiresAt: g.expiresAt, actor: who(req) });
    await audit(req, { action: 'consent.grant', entityType: 'Consent', entityId: row._id, schoolId, detail: { subject: sub.name, subjectType: g.type, purpose: g.purpose, version: g.def.version, method: g.method, givenBy: givenByName } });
    res.status(201).json({ consent: rowShape(row) });
  } catch (e) { return fail(res, e); }
});

exports.withdraw = wrap('consent.withdraw', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const purpose = String(b.purpose || ''); const type = String(b.subjectType || 'student');
  if (!C.PURPOSES[purpose] || !C.MODEL[type]) return bad(res, 400, 'Choose the person and the purpose.');
  const sub = await C.subject(schoolId, type, b.subjectId); if (!sub) return bad(res, 404, 'Person not found');
  if (type === 'student' && !(await canAccessStudent(req.user, sub._id))) return bad(res, 404, 'Person not found');
  if (type !== 'student' && (await CS.scopeOf(req.user))) return bad(res, 403, 'Only a school-wide administrator can record this.');
  return doWithdraw(req, res, { schoolId, type, sub, purpose, b, method: ['paper', 'in-person', 'phone'].includes(b.method) ? b.method : 'in-person' });
});

async function doWithdraw(req, res, { schoolId, type, sub, purpose, b, method }) {
  const cur = await C.current(schoolId, type, sub._id, purpose);
  if (!cur || cur.status !== 'granted') return bad(res, 409, 'There is nothing to withdraw: this consent is not currently given.');
  const reason = clean(b.reason, 300);
  try {
    const row = await C.append({ schoolId, type, subjectDoc: sub, purpose, status: 'withdrawn', version: cur.version, givenByName: clean(b.givenByName, 80) || req.actorName || '', givenByRelation: clean(b.givenByRelation, 40),
      method, evidenceNote: clean(b.evidenceNote, 300), reason, actor: who(req) });
    await audit(req, { action: 'consent.withdraw', entityType: 'Consent', entityId: row._id, schoolId, detail: { subject: sub.name, subjectType: type, purpose, reason } });
    return res.json({ consent: rowShape(row) });
  } catch (e) { return fail(res, e); }
}

// ── parent and student ──
async function myChildren(req) {
  const schoolId = sid(req);
  if (req.user.role === 'student') { const s = await Student.findOne({ _id: oid(req.user.userId), schoolId }).select('name classId'); return s ? [s] : []; }
  const parent = await Parent.findOne({ _id: oid(req.user.userId), schoolId }).select('children isActive');
  if (!parent) return [];
  const links = await GuardianLink.find({ schoolId, parentId: parent._id });
  const ids = [...new Set([...(parent.children || []).map(String), ...links.map((l) => String(l.studentId))])];
  const kids = ids.length ? await Student.find({ schoolId, _id: { $in: ids.map(oid) } }).select('name classId') : [];
  const rights = await GR.resolveForParent(schoolId, parent, kids.map((k) => k._id));
  return kids.filter((k) => rights.get(String(k._id))?.linked && rights.get(String(k._id))?.rights.viewInfo);
}

exports.mine = wrap('consent.mine', async (req, res) => {
  const schoolId = sid(req); const kids = await myChildren(req); const now = new Date();
  const subjects = kids.map((k) => ({ type: 'student', doc: k }));
  if (req.user.role === 'parent') { const me = await C.subject(schoolId, 'parent', req.user.userId); if (me) subjects.push({ type: 'parent', doc: me }); }
  const rows = subjects.length ? await Consent.find({ schoolId, isCurrent: true, subjectId: { $in: subjects.map((s) => s.doc._id) } }) : [];
  res.json({ canAnswer: req.user.role === 'parent', purposes: Object.entries(C.PURPOSES).map(([key, d]) => ({ key, label: d.label, detail: d.detail, version: d.version, subjects: d.subjects })),
    people: subjects.map((s) => ({ type: s.type, _id: s.doc._id, name: s.doc.name, answers: Object.entries(C.PURPOSES).filter(([, d]) => d.subjects.includes(s.type)).map(([key, d]) => {
      const r = rows.find((x) => String(x.subjectId) === String(s.doc._id) && x.purpose === key); return { purpose: key, label: d.label, state: C.stateOf(r, now), version: r?.version || '', since: r?.createdAt || null, expiresAt: r?.expiresAt || null, currentVersion: d.version };
    }) })) });
});

async function mySubject(req, res, b) {
  const type = String(b.subjectType || 'student'); const schoolId = sid(req);
  if (!['student', 'parent'].includes(type)) { bad(res, 400, 'Choose who this is about.'); return null; }
  if (type === 'parent') { if (String(b.subjectId) !== String(req.user.userId)) { bad(res, 403, 'You can only answer for yourself.'); return null; } }
  else if (!(await canAccessStudent(req.user, b.subjectId, 'viewInfo'))) { bad(res, 404, 'Child not found'); return null; }
  const sub = await C.subject(schoolId, type, b.subjectId);
  if (!sub) { bad(res, 404, 'Person not found'); return null; }
  return { type, sub, schoolId };
}

exports.mineGrant = wrap('consent.mineGrant', async (req, res) => {
  const b = req.body || {}; const g = parseGrant(b, { portal: true }); if (g.err) return bad(res, 400, g.err);
  const s = await mySubject(req, res, { ...b, subjectType: g.type }); if (!s) return;
  try {
    const row = await C.append({ schoolId: s.schoolId, type: s.type, subjectDoc: s.sub, purpose: g.purpose, status: 'granted', version: g.def.version, givenByName: req.actorName || '', givenByRelation: s.type === 'parent' ? 'self' : 'parent',
      method: 'portal', evidenceNote: '', expiresAt: g.expiresAt, actor: who(req) });
    await audit(req, { action: 'consent.grant', entityType: 'Consent', entityId: row._id, schoolId: s.schoolId, detail: { subject: s.sub.name, subjectType: s.type, purpose: g.purpose, version: g.def.version, method: 'portal' } });
    res.status(201).json({ consent: rowShape(row) });
  } catch (e) { return fail(res, e); }
});

exports.mineWithdraw = wrap('consent.mineWithdraw', async (req, res) => {
  const b = req.body || {}; const purpose = String(b.purpose || ''); if (!C.PURPOSES[purpose]) return bad(res, 400, 'Choose what to withdraw.');
  const s = await mySubject(req, res, b); if (!s) return;
  return doWithdraw(req, res, { schoolId: s.schoolId, type: s.type, sub: s.sub, purpose, b: { ...b, givenByName: req.actorName }, method: 'portal' });
});
