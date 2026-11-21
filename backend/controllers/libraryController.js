// The library (PRD E18): desk, catalogue, cards, reservations, fines, kiosk sync, textbooks, labels, reports and what students, teachers and parents see.
const S = require('../utils/library/service');
const D = require('../utils/library/desk');
const C = require('../utils/library/catalog');
const { E, Fail, oid, sid, who, bad, wrap, ctxOf, clean } = S;
const { audit } = require('../utils/audit');
const G = require('../utils/guardianRights');
const LbTitle = require('../models/LbTitle'); const LbCopy = require('../models/LbCopy'); const LbLoan = require('../models/LbLoan'); const LbOp = require('../models/LbOp');
const Student = require('../models/Student'); const Teacher = require('../models/Teacher'); const Class = require('../models/Class');

const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'library', entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const plain = (d) => (d && d.toObject ? d.toObject() : d);

exports.access = wrap('lib.access', async (req, res) => {
  const { enabled } = await S.getLib(sid(req)); res.json({ enabled, desk: await S.deskAccess(req.user), till: await S.tillAccess(req.user), admin: req.user.role === 'admin' });
});
exports.overview = wrap('lib.overview', async (req, res) => { res.json({ ...(await C.overview(sid(req))), policy: (await S.getLib(sid(req))).policy }); });

/* ───────── policy ───────── */
exports.policy = wrap('lib.policy', async (req, res) => { const g = await S.getLib(sid(req)); res.json({ policy: g.policy, version: g.version, history: g.policies.map((p) => ({ version: p.version, reason: p.reason, at: p.at, byName: p.byName })).reverse(), defaults: E.POLICY_DEFAULTS }); });
exports.savePolicy = wrap('lib.savePolicy', async (req, res) => {
  const reason = clean(req.body.reason, 300); if (reason.length < 5) throw new Fail(422, 'Write why the rules are changing.');
  const r = E.cleanPolicy(req.body.policy || {}); if (r.error) throw new Fail(422, r.error);
  const g = await S.getLib(sid(req)); const next = { version: g.version + 1, ...r.policy, reason, at: new Date(), byName: req.actorName || '' };
  await S.putLib(sid(req), { policies: [...g.policies.slice(-19), next], enabled: g.enabled }); await A(req, 'library.policy', String(next.version), reason); res.json({ version: next.version, policy: r.policy });
});

/* ───────── catalogue ───────── */
exports.titles = wrap('lib.titles', async (req, res) => { res.json(await C.listTitles(sid(req), req.query)); });
exports.title = wrap('lib.title', async (req, res) => {
  const t = oid(req.params.id) ? await LbTitle.findOne({ _id: req.params.id, schoolId: sid(req) }) : null; if (!t) throw new Fail(404, 'That book is not in the catalogue.'); res.json({ title: plain(t), copies: await C.copiesOf(sid(req), t._id) });
});
exports.createTitle = wrap('lib.createTitle', async (req, res) => { const t = await C.createTitle(ctxOf(req), req.body || {}); await A(req, 'library.title.create', String(t._id), t.title); res.status(201).json(t); });
exports.updateTitle = wrap('lib.updateTitle', async (req, res) => { const t = await C.updateTitle(ctxOf(req), req.params.id, req.body || {}); await A(req, 'library.title.update', req.params.id, t.title); res.json(t); });
exports.addCopies = wrap('lib.addCopies', async (req, res) => { const made = await C.addCopies(ctxOf(req), req.params.id, req.body || {}); await A(req, 'library.copies.add', req.params.id, `${made.length} copies`); res.status(201).json({ added: made.length, copies: made }); });
exports.setCopy = wrap('lib.setCopy', async (req, res) => { const r = await C.setCopy(ctxOf(req), req.params.id, req.body || {}); await A(req, 'library.copy.set', req.params.id, `${req.body.status || ''} ${req.body.condition || ''}`.trim()); res.json(r); });
exports.lookupCopy = wrap('lib.lookupCopy', async (req, res) => {
  const { copy, title } = await D.readCopy(sid(req), req.query.barcode); const loan = copy.status === 'on_loan' ? await LbLoan.findOne({ schoolId: sid(req), copyId: copy._id, status: 'open' }) : null;
  res.json({ copy: plain(copy), title: { _id: title._id, title: title.title, kind: title.kind, lendable: title.lendable, authors: title.authors }, loan: loan ? { _id: loan._id, holderName: loan.holderName, dueOn: loan.dueOn, kind: loan.kind } : null });
});

/* ───────── people and cards ───────── */
exports.people = wrap('lib.people', async (req, res) => {
  const q = clean(req.query.q, 60); if (q.length < 2) return res.json({ rows: [] }); const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); const schoolId = sid(req);
  const [ss, ts] = await Promise.all([Student.find({ schoolId, isActive: { $ne: false }, $or: [{ name: re }, { fullName: re }, { admissionNumber: re }] }).select('name fullName admissionNumber classId').limit(8), Teacher.find({ schoolId, isActive: { $ne: false }, name: re }).select('name').limit(5)]);
  const cls = await Class.find({ schoolId, _id: { $in: ss.map((s) => s.classId).filter(Boolean) } }).select('name'); const cn = new Map(cls.map((c) => [String(c._id), c.name]));
  res.json({ rows: [...ss.map((s) => ({ type: 'student', id: s._id, name: s.fullName || s.name, label: [s.admissionNumber, cn.get(String(s.classId))].filter(Boolean).join(' · ') })), ...ts.map((t) => ({ type: 'teacher', id: t._id, name: t.name, label: 'Teacher' }))] });
});
exports.cardLookup = wrap('lib.cardLookup', async (req, res) => { const card = await S.findCard(sid(req), req.query); res.json(await C.cardView(sid(req), card)); });
exports.cards = wrap('lib.cards', async (req, res) => { res.json(await C.listCards(sid(req), req.query)); });
exports.cardStatus = wrap('lib.cardStatus', async (req, res) => { const r = await C.cardStatus(ctxOf(req), req.params.id, req.body || {}); await A(req, 'library.card.status', req.params.id, `${req.body.status || 'override'}: ${clean(req.body.reason, 100)}`); res.json(r); });

/* ───────── lending ───────── */
exports.issue = wrap('lib.issue', async (req, res) => { const b = req.body || {}; const card = await S.findCard(sid(req), b); const r = await D.issue(ctxOf(req), { card, barcode: b.barcode, kind: 'loan' }); res.status(201).json(r); });
exports.giveBack = wrap('lib.return', async (req, res) => { const b = req.body || {}; res.json(await D.giveBack(ctxOf(req), { barcode: b.barcode, damage: b.damage || 'none', note: clean(b.note, 120) })); });
exports.lost = wrap('lib.lost', async (req, res) => { const r = await D.markLost(ctxOf(req), { loanId: req.params.id, note: clean(req.body?.note, 160) }); await A(req, 'library.lost', req.params.id, ''); res.json(r); });
exports.renew = wrap('lib.renew', async (req, res) => { res.json(await D.renew(ctxOf(req), { loanId: req.params.id })); });
exports.loans = wrap('lib.loans', async (req, res) => { res.json(await C.loanList(sid(req), req.query)); });
exports.reservations = wrap('lib.reservations', async (req, res) => { res.json(await C.reservationList(sid(req), req.query)); });
exports.reserve = wrap('lib.reserve', async (req, res) => { const card = await S.findCard(sid(req), req.body || {}); res.status(201).json(await D.reserve(ctxOf(req), { card, titleId: req.body.titleId })); });
exports.cancelReservation = wrap('lib.cancelReservation', async (req, res) => { res.json(await D.cancelReservation(ctxOf(req), { reservationId: req.params.id, reason: clean(req.body?.reason, 100) || 'Cancelled at the desk' })); });

/* ───────── fines ───────── */
exports.fines = wrap('lib.fines', async (req, res) => { res.json(await C.fineList(sid(req), req.query)); });
exports.payFine = wrap('lib.payFine', async (req, res) => { const r = await D.payFine(ctxOf(req), { fineId: req.params.id, method: req.body?.method, reference: req.body?.reference }); await A(req, 'library.fine.pay', req.params.id, `${r.fineNo} Rs ${r.amount}`); res.json(r); });
exports.waiveFine = wrap('lib.waiveFine', async (req, res) => { const r = await D.waiveFine(ctxOf(req), { fineId: req.params.id, reason: req.body?.reason }); await A(req, 'library.fine.waive', req.params.id, clean(req.body?.reason, 120)); res.json(r); });

/* ───────── the kiosk, possibly offline: every action carries a key so sending it twice does nothing ───────── */
exports.sync = wrap('lib.sync', async (req, res) => {
  const ops = Array.isArray(req.body?.ops) ? req.body.ops : null; if (!ops) throw new Fail(422, 'Send the saved actions in a list.'); if (ops.length > 100) throw new Fail(422, 'Send up to 100 actions at a time.');
  const schoolId = sid(req); const ctx = ctxOf(req); const results = [];
  for (const op of ops) {
    const key = clean(op.clientKey, 80); if (!key) { results.push({ clientKey: '', ok: false, message: 'This action has no key.' }); continue; }
    const ckey = `${schoolId}:${key}`; const had = await LbOp.findOne({ ckey }); if (had) { results.push({ clientKey: key, ok: had.ok, repeat: true, result: had.result }); continue; }
    const at = op.capturedAt && !Number.isNaN(Date.parse(op.capturedAt)) ? new Date(op.capturedAt) : null; const late = !!at && Date.now() - at.getTime() > 5 * 60000; let ok = false; let result;
    try {
      if (op.type === 'issue') { const card = await S.findCard(schoolId, { card: op.card }); const r = await D.issue(ctx, { card, barcode: op.barcode, kind: 'loan', at }); result = { due: r.due, title: r.title, holder: r.card.name }; }
      else if (op.type === 'return') { const r = await D.giveBack(ctx, { barcode: op.barcode, damage: op.damage || 'none', at }); result = { title: r.title, fines: r.fines.map((f) => f.amount) }; }
      else throw new Fail(422, 'Unknown action.');
      ok = true;
    } catch (e) { if (!(e instanceof Fail)) { console.error('library sync:', e); results.push({ clientKey: key, ok: false, retry: true, message: 'Something went wrong. Try again.' }); continue; } result = { message: e.message, ...e.extra }; }
    try { await LbOp.create({ schoolId, ckey, op: op.type, capturedAt: at, ok, result, byName: ctx.actor.name, late }); } catch (e) { /* a parallel send stored it first */ }
    results.push({ clientKey: key, ok, late, result });
  }
  res.json({ results });
});

/* ───────── catalogue import ───────── */
exports.importPreview = wrap('lib.importPreview', async (req, res) => { res.json(await C.previewImport(sid(req), req.body?.rows)); });
exports.importCommit = wrap('lib.importCommit', async (req, res) => { const r = await C.commitImport(ctxOf(req), req.body?.rows, req.body?.decisions || {}); await A(req, 'library.import', '', `${r.added} added, ${r.updated} updated, ${r.copies} copies`); res.json(r); });

/* ───────── textbooks ───────── */
exports.textbookNeeds = wrap('lib.textbookNeeds', async (req, res) => { if (!oid(req.query.classId)) throw new Fail(422, 'Choose a class.'); res.json(await C.textbookNeeds(sid(req), req.query.classId, clean(req.query.year, 12))); });
exports.classSet = wrap('lib.classSet', async (req, res) => { const r = await C.issueClassSet(ctxOf(req), req.body || {}); await A(req, 'library.textbooks.issue', '', `${r.title} to ${r.class}: ${r.issued}`); res.json(r); });
exports.recoveries = wrap('lib.recoveries', async (req, res) => { res.json({ rows: await C.recoveries(sid(req), clean(req.query.year, 12)) }); });

/* ───────── paper ───────── */
const pdf = (res, buf, name) => { res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"` }); res.send(buf); };
exports.copyLabels = wrap('lib.copyLabels', async (req, res) => pdf(res, await C.copyLabels(sid(req), req.body || {}), 'book-labels.pdf'));
exports.cardLabels = wrap('lib.cardLabels', async (req, res) => pdf(res, await C.cardLabels(sid(req), req.body || {}), 'library-cards.pdf'));
exports.usage = wrap('lib.usage', async (req, res) => { res.json(await C.usage(sid(req))); });
const cell = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
const csv = (rows) => rows.map((r) => r.map((v) => `"${cell(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
exports.exportLoans = wrap('lib.export', async (req, res) => {
  const { rows } = await C.loanList(sid(req), { ...req.query, limit: 100, page: 1 }); res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="library-loans.csv"' });
  res.send(`﻿${csv([['Borrower', 'Book', 'Barcode', 'Kind', 'Issued', 'Due', 'Status', 'Days late'], ...rows.map((l) => [l.holderName, l.titleName, l.barcode, l.kind, E.keyOf(l.issuedAt), E.keyOf(l.dueOn), l.status, l.daysLate])])}`);
});

/* ───────── students, teachers and parents ───────── */
async function myCard(req) {
  const schoolId = sid(req); const u = req.user;
  if (u.role === 'teacher') return S.cardFor(schoolId, 'teacher', u.userId);
  if (u.role === 'student') return S.cardFor(schoolId, 'student', u.userId);
  if (u.role === 'parent') {
    const childId = oid(req.query.childId || req.body?.childId); if (!childId) throw new Fail(422, 'Choose a child.');
    const g = await G.resolve(schoolId, u.userId, childId); if (!g.linked || !g.rights.viewInfo) throw new Fail(403, 'You cannot see this child\'s library record.'); req.guardian = g; return S.cardFor(schoolId, 'student', childId);
  }
  throw new Fail(403, 'Not available.');
}
exports.me = wrap('lib.me', async (req, res) => {
  const card = await myCard(req); const v = await C.cardView(sid(req), card); const { enabled, policy } = await S.getLib(sid(req));
  if (req.user.role === 'parent' && !req.guardian.rights.viewFees) { v.fines = []; v.owed = 0; }
  res.json({ ...v, enabled, policy: { loanDays: policy.loanDays[card.holderType], maxRenewals: policy.maxRenewals, finePerDay: policy.finePerDay, graceDays: policy.graceDays }, canAct: req.user.role !== 'parent' });
});
exports.meTitles = wrap('lib.meTitles', async (req, res) => { const r = await C.listTitles(sid(req), { ...req.query, limit: 20 }); res.json({ ...r, rows: r.rows.map((t) => ({ _id: t._id, title: t.title, authors: t.authors, kind: t.kind, subjects: t.subjects, shelf: t.shelf, available: t.available, copies: t.copies, lendable: t.lendable })) }); });
exports.meReserve = wrap('lib.meReserve', async (req, res) => { if (req.user.role === 'parent') throw new Fail(403, 'Ask your child or the library to reserve.'); const card = await myCard(req); res.status(201).json(await D.reserve(ctxOf(req), { card, titleId: req.body?.titleId })); });
exports.meCancel = wrap('lib.meCancel', async (req, res) => { if (req.user.role === 'parent') throw new Fail(403, 'Not available.'); const card = await myCard(req); res.json(await D.cancelReservation(ctxOf(req), { reservationId: req.params.id, card, reason: 'Cancelled by the borrower' })); });
exports.meRenew = wrap('lib.meRenew', async (req, res) => { if (req.user.role === 'parent') throw new Fail(403, 'Not available.'); const card = await myCard(req); res.json(await D.renew(ctxOf(req), { loanId: req.params.id, card })); });

exports.sweepNow = wrap('lib.sweep', async (req, res) => { res.json({ library: await D.sweep(sid(req), ctxOf(req).actor), orders: await require('../utils/library/store').sweepOrders(sid(req), ctxOf(req).actor) }); });
