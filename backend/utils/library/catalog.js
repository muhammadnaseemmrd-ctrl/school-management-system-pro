// Catalogue, copies, cards, catalogue import, textbooks for the year, labels and reports (PRD E18).
const PDFDocument = require('pdfkit');
const S = require('./service');
const D = require('./desk');
const { encode } = require('../studio/code128');
const { E, Fail, oid, isDup } = S;
const LbTitle = require('../../models/LbTitle');
const LbCopy = require('../../models/LbCopy');
const LbCard = require('../../models/LbCard');
const LbLoan = require('../../models/LbLoan');
const LbFine = require('../../models/LbFine');
const LbReservation = require('../../models/LbReservation');
const LbImport = require('../../models/LbImport');
const Student = require('../../models/Student');
const Class = require('../../models/Class');

const plain = (d) => (d && d.toObject ? d.toObject() : d);
const esc = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
const page = (q) => { const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)); const p = Math.max(1, parseInt(q.page, 10) || 1); return { limit, skip: (p - 1) * limit, page: p }; };

/* ───────── titles ───────── */
async function listTitles(schoolId, q) {
  const { limit, skip, page: p } = page(q); const f = { schoolId, active: q.archived === '1' ? false : true };
  if (q.kind) f.kind = q.kind; if (q.available === '1') f.available = { $gt: 0 };
  if (q.q) { const re = new RegExp(esc(q.q), 'i'); f.$or = [{ title: re }, { authors: re }, { isbn: re }, { subjects: re }, { publisher: re }]; }
  const [rows, total] = await Promise.all([LbTitle.find(f).sort({ title: 1 }).skip(skip).limit(limit), LbTitle.countDocuments(f)]);
  return { rows: rows.map(plain), total, page: p, limit };
}
function titleFields(b, partial = false) {
  const row = E.cleanRow(b); const isbn = E.normalizeIsbn(b.isbn); const errs = [];
  if (!isbn.ok) errs.push(isbn.error); if (!partial && !row.title) errs.push('A title is needed.'); if (Number.isNaN(row.year)) errs.push('The year is not a year.'); if (Number.isNaN(row.price)) errs.push('The price is not a number.');
  if (errs.length) throw new Fail(422, errs[0]);
  const classIds = (Array.isArray(b.classIds) ? b.classIds : []).filter(oid); const out = { ...row, isbn: isbn.isbn || undefined, lendable: row.kind === 'reference' ? false : b.lendable !== false };
  if (row.kind === 'textbook') out.textbook = { classIds, subject: String(b.subject || '').slice(0, 80) };
  return out;
}
async function createTitle(ctx, b) {
  const f = titleFields(b); if (!f.isbn) delete f.isbn;
  try { const t = await LbTitle.create({ ...f, schoolId: ctx.schoolId }); return plain(t); }
  catch (e) { if (isDup(e)) throw new Fail(409, 'A book with this ISBN is already in the catalogue.'); throw e; }
}
async function updateTitle(ctx, id, b) {
  const t = oid(id) ? await LbTitle.findOne({ _id: id, schoolId: ctx.schoolId }) : null; if (!t) throw new Fail(404, 'That book is not in the catalogue.');
  const merged = { ...plain(t), ...b, isbn: b.isbn !== undefined ? b.isbn : t.isbn, classIds: b.classIds || t.textbook?.classIds || [], subject: b.subject ?? t.textbook?.subject }; const f = titleFields(merged);
  const $set = { ...f }; delete $set.isbn; const $unset = {}; if (f.isbn) $set.isbn = f.isbn; else $unset.isbn = 1; if (b.active !== undefined) $set.active = !!b.active;
  if (b.active === false && await LbLoan.findOne({ schoolId: ctx.schoolId, titleId: t._id, status: 'open' })) throw new Fail(409, 'Some copies are out on loan. Archive the book after they come back.');
  try { await LbTitle.updateOne({ _id: t._id, schoolId: ctx.schoolId }, Object.keys($unset).length ? { $set, $unset } : { $set }); } catch (e) { if (isDup(e)) throw new Fail(409, 'A book with this ISBN is already in the catalogue.'); throw e; }
  return plain(await LbTitle.findOne({ _id: t._id, schoolId: ctx.schoolId }));
}

/* ───────── copies ───────── */
async function addCopies(ctx, titleId, { count = 1, price = null, condition = 'new', shelf = '' }) {
  const t = oid(titleId) ? await LbTitle.findOne({ _id: titleId, schoolId: ctx.schoolId, active: true }) : null; if (!t) throw new Fail(404, 'That book is not in the catalogue.');
  const n = Number(count); if (!Number.isInteger(n) || n < 1 || n > 200) throw new Fail(422, 'Add between 1 and 200 copies at a time.'); if (!['new', 'good', 'fair', 'poor'].includes(condition)) throw new Fail(422, 'Condition must be new, good, fair or poor.');
  const made = []; const seq = await S.nextBarcode(LbCopy, ctx.schoolId, 'copy');
  for (let i = 0; i < n; i += 1) made.push(plain(await seq.take((barcode) => LbCopy.create({ schoolId: ctx.schoolId, titleId: t._id, barcode, condition, shelf: String(shelf || t.shelf || '').slice(0, 40), price: price == null || price === '' ? t.price : Math.max(0, Math.round(Number(price) || 0)), history: [{ at: new Date(), status: 'available', byName: ctx.actor.name || '', note: 'Added to the library' }] }))));
  await D.syncTitle(ctx.schoolId, t._id); return made;
}
const copiesOf = async (schoolId, titleId) => { const copies = await LbCopy.find({ schoolId, titleId }).sort({ barcode: 1 }).limit(500); const loans = await LbLoan.find({ schoolId, titleId, status: 'open' }); return copies.map((c) => ({ ...plain(c), loan: loans.find((l) => String(l.copyId) === String(c._id)) ? (({ holderName, dueOn, kind }) => ({ holderName, dueOn, kind }))(loans.find((l) => String(l.copyId) === String(c._id))) : null })); };
async function setCopy(ctx, copyId, { status, condition, note = '' }) {
  const c = oid(copyId) ? await LbCopy.findOne({ _id: copyId, schoolId: ctx.schoolId }) : null; if (!c) throw new Fail(404, 'That copy is not in your school.');
  if (['on_loan', 'reserved'].includes(c.status)) throw new Fail(409, c.status === 'on_loan' ? 'This copy is out on loan. Return it first.' : 'This copy is held for a reservation.');
  const $set = {}; if (condition) { if (!['new', 'good', 'fair', 'poor'].includes(condition)) throw new Fail(422, 'Condition must be new, good, fair or poor.'); $set.condition = condition; }
  if (status) { if (!['available', 'repair', 'damaged', 'withdrawn'].includes(status)) throw new Fail(422, 'A copy can be set to available, repair, damaged or withdrawn.'); if (status === 'withdrawn' && String(note).trim().length < 5) throw new Fail(422, 'Write why the copy is withdrawn.'); $set.status = status; }
  if (!Object.keys($set).length) throw new Fail(422, 'Nothing to change.');
  const done = await LbCopy.updateOne({ _id: c._id, schoolId: ctx.schoolId, status: c.status }, { $set, $push: { history: { $each: [{ at: new Date(), status: $set.status || c.status, byName: ctx.actor.name || '', note: String(note).slice(0, 200) }], $slice: -40 } } });
  if (!done.matchedCount) throw new Fail(409, 'This copy has just changed. Look again.'); await D.syncTitle(ctx.schoolId, c.titleId);
  if ($set.status === 'available') await D.offerToNext(ctx.schoolId, c._id, ctx.actor); return { ok: true };
}

/* ───────── cards ───────── */
async function listCards(schoolId, q) {
  const { limit, skip, page: p } = page(q); const f = { schoolId }; if (q.status) f.status = q.status; if (q.q) f.name = new RegExp(esc(q.q), 'i');
  const [rows, total] = await Promise.all([LbCard.find(f).sort({ name: 1 }).skip(skip).limit(limit), LbCard.countDocuments(f)]);
  const open = await LbLoan.find({ schoolId, status: 'open', cardId: { $in: rows.map((r) => r._id) } }).select('cardId');
  return { rows: rows.map((r) => ({ ...plain(r), loans: open.filter((l) => String(l.cardId) === String(r._id)).length })), total, page: p, limit };
}
async function cardStatus(ctx, cardId, { status, reason = '', overrideDays = 0 }) {
  const c = oid(cardId) ? await LbCard.findOne({ _id: cardId, schoolId: ctx.schoolId }) : null; if (!c) throw new Fail(404, 'That card is not in your school.');
  const $set = {}; const $unset = {};
  if (status) { if (!['active', 'blocked', 'closed'].includes(status)) throw new Fail(422, 'A card is active, blocked or closed.'); if (status !== 'active' && String(reason).trim().length < 5) throw new Fail(422, 'Write the reason.'); $set.status = status; $set.blockReason = status === 'active' ? '' : String(reason).slice(0, 200); }
  if (overrideDays) { const d = Number(overrideDays); if (!Number.isInteger(d) || d < 1 || d > 14) throw new Fail(422, 'An override lasts from 1 to 14 days.'); if (String(reason).trim().length < 10) throw new Fail(422, 'Write why the block is lifted (at least 10 characters).'); $set.overrideUntil = new Date(Date.now() + d * 86400000); $set.overrideReason = String(reason).slice(0, 300); }
  if (!Object.keys($set).length) throw new Fail(422, 'Nothing to change.'); await LbCard.updateOne({ _id: c._id, schoolId: ctx.schoolId }, { $set }); return { ok: true };
}
async function cardView(schoolId, card) {
  const [loans, reservations, fines] = await Promise.all([LbLoan.find({ schoolId, cardId: card._id, status: 'open' }).sort({ dueOn: 1 }), LbReservation.find({ schoolId, cardId: card._id, status: { $in: ['waiting', 'ready'] } }).sort({ createdAt: 1 }), LbFine.find({ schoolId, cardId: card._id, status: 'open' }).sort({ createdAt: -1 })]);
  const today = await S.today(schoolId); const { policy } = await S.getLib(schoolId);
  return { card: plain(card), loans: loans.map((l) => ({ ...plain(l), overdue: E.keyOf(l.dueOn) < today, daysLate: Math.max(0, E.daysBetween(E.keyOf(l.dueOn), today)) })), reservations: await Promise.all(reservations.map((r) => D.placeOf(schoolId, r))), fines: fines.map(plain), owed: fines.reduce((s, f) => s + f.amount, 0), limit: policy.maxLoans[card.holderType] || 3, blockAtFines: policy.blockAtFines };
}

/* ───────── catalogue import: preview, then commit with the decisions ───────── */
async function previewImport(schoolId, rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Fail(422, 'The file has no rows.'); if (rows.length > 2000) throw new Fail(422, 'Import up to 2000 rows at a time.');
  const isbns = rows.map((r) => E.normalizeIsbn(r.isbn)).filter((x) => x.ok && x.isbn).map((x) => x.isbn); const found = isbns.length ? await LbTitle.find({ schoolId, isbn: { $in: isbns } }) : [];
  const out = E.classifyImport(rows, new Map(found.map((t) => [t.isbn, t])));
  const count = (s) => out.filter((r) => r.state === s).length; return { rows: out, summary: { add: count('add'), conflict: count('conflict'), same: count('same'), duplicate: count('duplicate'), problem: count('problem'), copies: out.filter((r) => ['add', 'conflict', 'same'].includes(r.state)).reduce((s, r) => s + r.copies, 0) } };
}
// decisions: { "<row index>": "overwrite" | "keep" } for conflicts. Anything not decided keeps the book as it is.
async function commitImport(ctx, rows, decisions = {}) {
  const prev = await previewImport(ctx.schoolId, rows); const ckey = `${ctx.schoolId}:${E.sha(JSON.stringify([rows, decisions]))}`;
  if (await LbImport.findOne({ ckey })) return { repeat: true, added: 0, updated: 0, copies: 0, skipped: prev.rows.length };
  try { await LbImport.create({ schoolId: ctx.schoolId, ckey, rows: rows.length, summary: prev.summary, byName: ctx.actor.name || '' }); } catch (e) { if (isDup(e)) return { repeat: true, added: 0, updated: 0, copies: 0, skipped: prev.rows.length }; throw e; }
  let added = 0; let updated = 0; let copies = 0; let skipped = 0;
  for (const r of prev.rows) {
    try {
      if (r.state === 'add') { const f = { ...r.row, lendable: r.row.kind !== 'reference', source: 'import', schoolId: ctx.schoolId }; if (r.isbn) f.isbn = r.isbn; const t = await LbTitle.create(f); added += 1; if (r.copies) { await addCopies(ctx, t._id, { count: r.copies, condition: 'new' }); copies += r.copies; } }
      else if (r.state === 'conflict' && decisions[String(r.index)] === 'overwrite') { const $set = {}; r.diffs.forEach((d) => { $set[d.field] = d.incoming; }); await LbTitle.updateOne({ _id: r.titleId, schoolId: ctx.schoolId }, { $set }); updated += 1; if (r.copies) { await addCopies(ctx, r.titleId, { count: r.copies, condition: 'new' }); copies += r.copies; } }
      else if (['conflict', 'same'].includes(r.state) && r.copies) { await addCopies(ctx, r.titleId, { count: r.copies, condition: 'new' }); copies += r.copies; if (r.state === 'conflict') skipped += 1; }
      else skipped += 1;
    } catch (e) { skipped += 1; }
  }
  return { added, updated, copies, skipped };
}

/* ───────── textbooks for the school year ───────── */
async function textbookNeeds(schoolId, classId, year) {
  const titles = await LbTitle.find({ schoolId, kind: 'textbook', active: true, 'textbook.classIds': oid(classId) });
  const students = await Student.find({ schoolId, classId: oid(classId), isActive: { $ne: false } }).select('name fullName admissionNumber').sort({ name: 1 }).limit(500);
  const have = await LbLoan.find({ schoolId, kind: 'textbook', year, status: 'open', holderId: { $in: students.map((s) => s._id) } });
  return { titles: await Promise.all(titles.map(async (t) => ({ _id: t._id, title: t.title, subject: t.textbook?.subject || '', available: await LbCopy.countDocuments({ schoolId, titleId: t._id, status: 'available' }), needed: students.filter((s) => !have.some((l) => String(l.titleId) === String(t._id) && String(l.holderId) === String(s._id))).length }))), students: students.map((s) => ({ _id: s._id, name: s.fullName || s.name, admissionNumber: s.admissionNumber || '', has: have.filter((l) => String(l.holderId) === String(s._id)).map((l) => String(l.titleId)) })) };
}
// Issues one textbook title to every student in a class who does not already hold it, using free copies in order. Stops at the shortage and reports who was left out.
async function issueClassSet(ctx, { classId, titleId, year }) {
  const cl = oid(classId) ? await Class.findOne({ _id: classId, schoolId: ctx.schoolId }) : null; if (!cl) throw new Fail(404, 'That class is not in your school.');
  const t = oid(titleId) ? await LbTitle.findOne({ _id: titleId, schoolId: ctx.schoolId, kind: 'textbook', active: true }) : null; if (!t) throw new Fail(404, 'That textbook is not in the catalogue.'); const y = String(year || '').trim(); if (!/^\d{4}(-\d{2,4})?$/.test(y)) throw new Fail(422, 'Give the school year, for example 2026-27.');
  const students = await Student.find({ schoolId: ctx.schoolId, classId: cl._id, isActive: { $ne: false } }).select('name fullName').sort({ name: 1 }).limit(500);
  const has = new Set((await LbLoan.find({ schoolId: ctx.schoolId, titleId: t._id, kind: 'textbook', year: y, status: 'open' }).select('holderId')).map((l) => String(l.holderId)));
  const free = await LbCopy.find({ schoolId: ctx.schoolId, titleId: t._id, status: 'available' }).sort({ barcode: 1 }).limit(600); let i = 0; const issued = []; const short = []; const failed = [];
  for (const s of students) {
    if (has.has(String(s._id))) continue;
    if (i >= free.length) { short.push(s.fullName || s.name); continue; }
    try { const card = await S.cardFor(ctx.schoolId, 'student', s._id); const r = await D.issue(ctx, { card, barcode: free[i].barcode, kind: 'textbook', year: y }); issued.push({ student: s.fullName || s.name, barcode: free[i].barcode, loanId: r.loan._id }); i += 1; }
    catch (e) { if (e instanceof Fail) { failed.push({ student: s.fullName || s.name, reason: e.message }); i += 1; } else throw e; }
  }
  return { issued: issued.length, short, failed, class: cl.name, title: t.title, year: y };
}
// What is still out for a year, so recoveries can be chased at the end of it.
async function recoveries(schoolId, year) {
  const rows = await LbLoan.find({ schoolId, kind: 'textbook', status: 'open', ...(year ? { year } : {}) }).sort({ holderName: 1 }).limit(2000);
  return rows.map((l) => ({ loanId: l._id, holderName: l.holderName, titleName: l.titleName, barcode: l.barcode, year: l.year, issuedAt: l.issuedAt }));
}

/* ───────── labels and cards as PDF ───────── */
function drawCode(doc, text, x, y, w, h) {
  const mods = encode(text); if (!mods) return; const total = mods.reduce((s, m) => s + m[0], 0); const u = w / total; let cx = x;
  mods.forEach(([wd, bar]) => { if (bar) doc.rect(cx, y, wd * u, h).fill('#000000'); cx += wd * u; });
}
function labelsPdf(items, { title = 'Labels' } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 28, info: { Title: title }, tagged: true, lang: 'en' }); const bufs = []; doc.on('data', (c) => bufs.push(c)); doc.on('end', () => resolve(Buffer.concat(bufs))); doc.on('error', reject);
    const cols = 3; const cw = (doc.page.width - 56) / cols; const ch = 92; const rows = Math.floor((doc.page.height - 56) / ch);
    items.forEach((it, i) => {
      const slot = i % (cols * rows); if (i > 0 && slot === 0) doc.addPage(); const x = 28 + (slot % cols) * cw; const y = 28 + Math.floor(slot / cols) * ch;
      doc.rect(x + 3, y + 3, cw - 6, ch - 6).lineWidth(0.4).strokeColor('#c9cfd3').stroke();
      doc.fillColor('#1b2837').font('Helvetica-Bold').fontSize(8.5).text(String(it.top || '').slice(0, 44), x + 10, y + 10, { width: cw - 20, lineBreak: false });
      doc.fillColor('#5b6b7b').font('Helvetica').fontSize(7.5).text(String(it.sub || '').slice(0, 52), x + 10, y + 22, { width: cw - 20, lineBreak: false });
      drawCode(doc, it.code, x + 12, y + 36, cw - 24, 30); doc.fillColor('#1b2837').font('Courier').fontSize(8).text(it.code, x + 10, y + 70, { width: cw - 20, align: 'center', lineBreak: false });
    });
    if (!items.length) doc.fontSize(11).text('Nothing to print.'); doc.end();
  });
}
async function copyLabels(schoolId, { titleId, barcodes }) {
  const f = { schoolId }; if (oid(titleId)) f.titleId = titleId; else if (Array.isArray(barcodes) && barcodes.length) f.barcode = { $in: barcodes.slice(0, 600) }; else throw new Fail(422, 'Choose a book or the copies to print.');
  const copies = await LbCopy.find(f).sort({ barcode: 1 }).limit(600); const titles = await LbTitle.find({ schoolId, _id: { $in: [...new Set(copies.map((c) => String(c.titleId)))] } }); const nm = new Map(titles.map((t) => [String(t._id), t]));
  return labelsPdf(copies.map((c) => ({ top: nm.get(String(c.titleId))?.title || '', sub: [nm.get(String(c.titleId))?.authors?.[0], c.shelf].filter(Boolean).join(' · '), code: c.barcode })), { title: 'Book labels' });
}
async function cardLabels(schoolId, { cardIds, classId }) {
  let cards = []; if (oid(classId)) { const ss = await Student.find({ schoolId, classId, isActive: { $ne: false } }).select('_id').limit(500); for (const s of ss) cards.push(await S.cardFor(schoolId, 'student', s._id)); } else if (Array.isArray(cardIds) && cardIds.length) cards = await LbCard.find({ schoolId, _id: { $in: cardIds.filter(oid).slice(0, 500) } }); else throw new Fail(422, 'Choose a class or the cards to print.');
  return labelsPdf(cards.map((c) => ({ top: c.name, sub: `${c.classLabel || c.holderType} · Library card`, code: c.barcode })), { title: 'Library cards' });
}

/* ───────── reports ───────── */
async function overview(schoolId) {
  const today = await S.today(schoolId); const [titles, copies, onLoan, open, reserv, fines] = await Promise.all([LbTitle.countDocuments({ schoolId, active: true }), LbCopy.countDocuments({ schoolId, status: { $nin: ['withdrawn'] } }), LbCopy.countDocuments({ schoolId, status: 'on_loan' }), LbLoan.find({ schoolId, status: 'open' }).select('dueOn kind'), LbReservation.countDocuments({ schoolId, status: { $in: ['waiting', 'ready'] } }), LbFine.find({ schoolId, status: 'open' }).select('amount')]);
  return { titles, copies, onLoan, overdue: open.filter((l) => l.kind === 'loan' && E.keyOf(l.dueOn) < today).length, dueToday: open.filter((l) => l.kind === 'loan' && E.keyOf(l.dueOn) === today).length, reservations: reserv, finesOpen: fines.length, finesAmount: fines.reduce((s, f) => s + f.amount, 0), lost: await LbCopy.countDocuments({ schoolId, status: 'lost' }) };
}
async function loanList(schoolId, q) {
  const { limit, skip, page: p } = page(q); const today = await S.today(schoolId); const f = { schoolId, status: q.status || 'open' }; if (q.kind) f.kind = q.kind; if (q.overdue === '1') { f.status = 'open'; f.kind = 'loan'; f.dueOn = { $lt: new Date(`${today}T00:00:00Z`) }; }
  if (q.q) f.$or = [{ holderName: new RegExp(esc(q.q), 'i') }, { titleName: new RegExp(esc(q.q), 'i') }, { barcode: new RegExp(esc(q.q), 'i') }];
  const [rows, total] = await Promise.all([LbLoan.find(f).sort({ dueOn: 1 }).skip(skip).limit(limit), LbLoan.countDocuments(f)]);
  return { rows: rows.map((l) => ({ ...plain(l), overdue: l.status === 'open' && l.kind === 'loan' && E.keyOf(l.dueOn) < today, daysLate: l.status === 'open' ? Math.max(0, E.daysBetween(E.keyOf(l.dueOn), today)) : 0 })), total, page: p, limit };
}
async function fineList(schoolId, q) {
  const { limit, skip, page: p } = page(q); const f = { schoolId }; if (q.status) f.status = q.status; if (q.refundDue === '1') f.refundDue = true; if (q.q) f.holderName = new RegExp(esc(q.q), 'i');
  const [rows, total] = await Promise.all([LbFine.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), LbFine.countDocuments(f)]); return { rows: rows.map(plain), total, page: p, limit };
}
async function reservationList(schoolId, q) { const f = { schoolId, status: q.status || { $in: ['waiting', 'ready'] } }; const rows = await LbReservation.find(f).sort({ createdAt: 1 }).limit(300); return { rows: await Promise.all(rows.map((r) => D.placeOf(schoolId, r))) }; }
// Books nobody has borrowed in a year, and the most borrowed, for buying decisions.
async function usage(schoolId) {
  const since = new Date(Date.now() - 365 * 86400000); const loans = await LbLoan.find({ schoolId, kind: 'loan', issuedAt: { $gte: since } }).select('titleId titleName'); const count = new Map();
  loans.forEach((l) => { const k = String(l.titleId); const v = count.get(k) || { titleId: k, title: l.titleName, loans: 0 }; v.loans += 1; count.set(k, v); });
  const top = [...count.values()].sort((a, b) => b.loans - a.loans).slice(0, 10); const idle = (await LbTitle.find({ schoolId, active: true, kind: { $in: ['book', 'periodical', 'other'] }, copies: { $gt: 0 } }).limit(2000)).filter((t) => !count.has(String(t._id))).slice(0, 30).map((t) => ({ titleId: t._id, title: t.title, copies: t.copies }));
  return { top, idle, loansThisYear: loans.length };
}
// What a student or teacher sees about themselves.
async function mine(schoolId, holderType, holderId) {
  const card = await S.cardFor(schoolId, holderType, holderId); return cardView(schoolId, card);
}

module.exports = { listTitles, createTitle, updateTitle, addCopies, copiesOf, setCopy, listCards, cardStatus, cardView, previewImport, commitImport, textbookNeeds, issueClassSet, recoveries, copyLabels, cardLabels, labelsPdf, overview, loanList, fineList, reservationList, usage, mine };
