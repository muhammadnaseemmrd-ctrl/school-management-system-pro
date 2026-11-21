// Shared pieces of the library and the school store (PRD E18): who may work the desk, the policy with its versions, borrower cards, and numbering.
const base = require('../early/service');
const R = require('../registrar/service');
const E = require('./engine');
const A = require('../attendanceOps');
const N = require('../notify');
const { can } = require('../permissions');
const AppSetting = require('../../models/AppSetting');
const Student = require('../../models/Student');
const Teacher = require('../../models/Teacher');
const Class = require('../../models/Class');
const LbCard = require('../../models/LbCard');
const LbLoan = require('../../models/LbLoan');
const LbFine = require('../../models/LbFine');
const StTill = require('../../models/StTill');

const { oid, sid, who, bad, clean, pg } = base;
const isDup = R.isDup;
// A rule that stops an action. `code` is the HTTP status, `extra` carries a machine readable reason such as { reason: 'limit' }.
class Fail extends Error { constructor(code, message, extra = {}) { super(message); this.code = code; this.extra = extra; } }
const wrap = (name, fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    if (e instanceof Fail) return bad(res, e.code, e.message, e.extra);
    console.error(`library ${name}:`, e); if (!res.headersSent) res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};
const ctxOf = (req) => ({ schoolId: sid(req), actor: who(req) });

/* ───────── who may work a desk ───────── */
// Administrators always; a teacher or librarian needs a time-limited grant (PRD E01).
const deskAccess = async (user) => user.role === 'admin' || (user.role === 'teacher' && (await can(user, 'library.desk.operate')).allowed);
const tillAccess = async (user) => user.role === 'admin' || (user.role === 'teacher' && (await can(user, 'store.till.operate')).allowed);
const onDesk = async (req, res, next) => { try { if (await deskAccess(req.user)) return next(); return bad(res, 403, 'You are not on the library desk.'); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const onTill = async (req, res, next) => { try { if (await tillAccess(req.user)) return next(); return bad(res, 403, 'You are not on the store till.'); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const sole = async (schoolId) => R.soleAdmin(schoolId);

/* ───────── policy, with versions ───────── */
const getLib = async (schoolId) => {
  const s = await AppSetting.findOne({ key: `library:${schoolId}` }); const v = s?.value || {};
  const policies = v.policies?.length ? v.policies : [{ version: 1, ...E.mergePolicy({}), reason: 'Starting values', at: new Date(0), byName: 'Default' }];
  const cur = policies[policies.length - 1];
  return { policies, policy: E.mergePolicy(cur), version: cur.version, enabled: v.enabled !== false };
};
const putLib = (schoolId, value) => AppSetting.updateOne({ key: `library:${schoolId}` }, { $set: { value } }, { upsert: true });
const getStore = async (schoolId) => {
  const s = await AppSetting.findOne({ key: `store:${schoolId}` }); const v = s?.value || {};
  return { holdDays: 3, refundDays: 7, maxCashierDiscount: 10, cashTolerance: 50, countFlagValue: 5000, receiptFooter: '', ...v };
};
const putStore = (schoolId, value) => AppSetting.updateOne({ key: `store:${schoolId}` }, { $set: { value } }, { upsert: true });

/* ───────── numbering ───────── */
// Barcodes and numbered records take the next number; a unique index makes a second caller that picked the same one try the next.
async function nextBarcode(Model, schoolId, kind, mk = {}) {
  let n = (await Model.countDocuments({ schoolId })) + 1;
  return { take: async (build) => { for (let i = 0; i < 12; i += 1) { try { return await build(E.makeBarcode(kind, n + i)); } catch (e) { if (!isDup(e)) throw e; } } throw new Error('could not make a barcode'); } };
}
const numbered = (Model, schoolId, field, prefix, doc) => R.createNumbered(Model, schoolId, field, prefix, doc);

/* ───────── cards ───────── */
async function describeHolder(schoolId, holderType, holderId) {
  if (holderType === 'student') {
    const s = await Student.findOne({ _id: holderId, schoolId }).select('name fullName classId isActive admissionNumber'); if (!s) return null;
    const cl = s.classId ? await Class.findOne({ _id: s.classId, schoolId }).select('name'): null;
    return { name: s.fullName || s.name || '', classLabel: cl?.name || '', active: s.isActive !== false, number: s.admissionNumber || '' };
  }
  if (holderType === 'teacher') { const t = await Teacher.findOne({ _id: holderId, schoolId }).select('name isActive'); if (!t) return null; return { name: t.name || '', classLabel: 'Teacher', active: t.isActive !== false, number: '' }; }
  return null;
}
// The card for a person, made the first time it is needed.
async function cardFor(schoolId, holderType, holderId) {
  if (!['student', 'teacher'].includes(holderType) || !oid(holderId)) throw new Fail(422, 'Choose a student or a teacher.');
  const found = await LbCard.findOne({ schoolId, holderType, holderId: oid(holderId) }); if (found) return found;
  const h = await describeHolder(schoolId, holderType, oid(holderId)); if (!h) throw new Fail(404, 'That person is not in your school.');
  const seq = await nextBarcode(LbCard, schoolId, 'card');
  try { return await seq.take((barcode) => LbCard.create({ schoolId, holderType, holderId: oid(holderId), name: h.name, classLabel: h.classLabel, barcode })); }
  catch (e) { if (isDup(e)) { const again = await LbCard.findOne({ schoolId, holderType, holderId: oid(holderId) }); if (again) return again; } throw e; }
}
// A scanned card, an admission number or a person id -> card. A misread card fails its check digit instead of finding someone else.
async function findCard(schoolId, q) {
  const raw = clean(q.card || '', 40);
  if (raw) {
    const r = E.readBarcode(raw); if (!r.ok) throw new Fail(422, r.reason === 'check' ? 'The card was not read correctly. Scan it again.' : 'That is not a library card.', { reason: 'scan' });
    if (r.kind !== 'card') throw new Fail(422, 'That is a book barcode, not a library card.', { reason: 'scan' });
    const c = await LbCard.findOne({ schoolId, barcode: r.code }); if (!c) throw new Fail(404, 'No card has that number.'); return c;
  }
  if (q.cardId) { const c = oid(q.cardId) ? await LbCard.findOne({ _id: q.cardId, schoolId }) : null; if (!c) throw new Fail(404, 'That card is not in your school.'); return c; }
  if (q.studentId) return cardFor(schoolId, 'student', q.studentId);
  if (q.teacherId) return cardFor(schoolId, 'teacher', q.teacherId);
  if (q.admissionNumber) { const s = await Student.findOne({ schoolId, admissionNumber: clean(q.admissionNumber, 40) }).select('_id'); if (!s) throw new Fail(404, 'No student has that admission number.'); return cardFor(schoolId, 'student', s._id); }
  throw new Fail(422, 'Scan a card or choose a person.');
}

/* ───────── people to tell ───────── */
async function tell(schoolId, card, title, body, link = '/student#/library', right = 'receiveNotices') {
  try {
    const recipients = card.holderType === 'student' ? [{ id: card.holderId, role: 'student' }, ...(await N.parentsOf(schoolId, [card.holderId], right))] : [{ id: card.holderId, role: 'teacher' }];
    await N.notify({ schoolId, recipients, title, body, link, type: 'library' });
  } catch (e) { /* a failed alert never stops the desk */ }
}
const tellAdmins = async (schoolId, title, body, link = '/admin#/library', exclude = null) => { try { await N.notify({ schoolId, recipients: await N.admins(schoolId), title, body, link, type: 'library', exclude }); } catch (e) { /* the desk goes on */ } };

const unpaidTotal = async (schoolId, cardId) => (await LbFine.find({ schoolId, cardId, status: 'open' }).select('amount')).reduce((s, f) => s + f.amount, 0);
const today = (schoolId) => base.today(schoolId);
const localDay = async (schoolId, at) => (at ? (await A.localDay(schoolId, at)) : today(schoolId));

module.exports = { base, R, E, A, N, can, Fail, wrap, ctxOf, deskAccess, tillAccess, onDesk, onTill, sole, getLib, putLib, getStore, putStore, nextBarcode, numbered, describeHolder, cardFor, findCard, tell, tellAdmins, unpaidTotal, today, localDay, oid, sid, who, bad, clean, pg, isDup, LbLoan, StTill };
