// The library desk (PRD E18): lend, return, renew, reserve, lost and damaged copies, and fines by the published policy.
// Every function takes a context { schoolId, actor } so the same rules run for the desk, a kiosk that was offline, a student renewing and the nightly sweep.
const S = require('./service');
const { E, Fail, oid, isDup } = S;
const LbTitle = require('../../models/LbTitle');
const LbCopy = require('../../models/LbCopy');
const LbCard = require('../../models/LbCard');
const LbLoan = require('../../models/LbLoan');
const LbReservation = require('../../models/LbReservation');
const LbFine = require('../../models/LbFine');

const addH = (copy, status, actor, note = '') => ({ $push: { history: { $each: [{ at: new Date(), status, byName: actor.name || '', note }], $slice: -40 } } });

// Keeps the two counters on the title in step with its copies. Counts come from the copies, so a repeat is harmless.
async function syncTitle(schoolId, titleId) {
  const [total, avail] = await Promise.all([LbCopy.countDocuments({ schoolId, titleId, status: { $nin: ['withdrawn', 'lost'] } }), LbCopy.countDocuments({ schoolId, titleId, status: 'available' })]);
  await LbTitle.updateOne({ _id: titleId, schoolId }, { $set: { copies: total, available: avail } });
  return { copies: total, available: avail };
}

async function readCopy(schoolId, raw) {
  const r = E.readBarcode(raw);
  if (!r.ok) throw new Fail(422, r.reason === 'check' ? 'The barcode was not read correctly. Scan it again.' : 'That is not a book barcode.', { reason: 'scan' });
  if (r.kind !== 'copy') throw new Fail(422, 'That is a library card, not a book.', { reason: 'scan' });
  const copy = await LbCopy.findOne({ schoolId, barcode: r.code }); if (!copy) throw new Fail(404, 'No book in this library has that barcode.');
  const title = await LbTitle.findOne({ _id: copy.titleId, schoolId }); return { copy, title };
}

/* ───────── reservations ───────── */
// A copy has just become free: hold it for the first person waiting, or put it back on the shelf.
async function offerToNext(schoolId, copyId, actor) {
  const copy = await LbCopy.findOne({ _id: copyId, schoolId }); if (!copy) return null;
  const { policy } = await S.getLib(schoolId);
  for (let guard = 0; guard < 20; guard += 1) {
    const next = await LbReservation.findOne({ schoolId, titleId: copy.titleId, status: 'waiting' }).sort({ createdAt: 1 }); if (!next) break;
    const card = await LbCard.findOne({ _id: next.cardId, schoolId });
    if (!card || card.status !== 'active') { await LbReservation.updateOne({ _id: next._id, status: 'waiting' }, { $set: { status: 'cancelled', endedReason: 'The card can no longer borrow.' }, $unset: { activeKey: 1 } }); continue; }
    const holdUntil = new Date(Date.now() + policy.holdDays * 86400000);
    const took = await LbReservation.updateOne({ _id: next._id, status: 'waiting' }, { $set: { status: 'ready', copyId: copy._id, readyAt: new Date(), holdUntil } });
    if (!took.matchedCount) continue;
    const held = await LbCopy.updateOne({ _id: copy._id, schoolId, status: { $in: ['available'] } }, { $set: { status: 'reserved', reservedFor: next._id }, ...addH(copy, 'reserved', actor, `Held for ${card.name}`) });
    if (!held.matchedCount) { await LbReservation.updateOne({ _id: next._id }, { $set: { status: 'waiting', copyId: null, readyAt: null, holdUntil: null } }); return null; }
    await S.tell(schoolId, card, 'Your reserved book is ready', `"${copy.titleName || next.titleName}" is waiting for you at the library until ${E.keyOf(holdUntil)}.`);
    await syncTitle(schoolId, copy.titleId); return { ...next.toObject(), status: 'ready', copyId: copy._id, holdUntil };
  }
  await syncTitle(schoolId, copy.titleId); return null;
}

async function reserve(ctx, { card, titleId }) {
  if (card.status !== 'active') throw new Fail(423, `This card is ${card.status}.`);
  const title = oid(titleId) ? await LbTitle.findOne({ _id: titleId, schoolId: ctx.schoolId, active: true }) : null; if (!title) throw new Fail(404, 'That book is not in the catalogue.');
  if (!title.lendable || title.kind === 'textbook') throw new Fail(422, title.kind === 'textbook' ? 'Textbooks are issued by the library for the year, not reserved.' : 'This is a reference book. It stays in the library.');
  if (!title.copies) throw new Fail(409, 'The library has no copy of this book to reserve.');
  if (await LbCopy.findOne({ schoolId: ctx.schoolId, titleId: title._id, status: 'available' })) throw new Fail(409, 'A copy is on the shelf now. Ask for it at the desk instead of reserving.', { reason: 'available' });
  if (await LbLoan.findOne({ schoolId: ctx.schoolId, cardId: card._id, titleId: title._id, status: 'open' })) throw new Fail(409, 'You already have a copy of this book.', { reason: 'held' });
  try { const r = await LbReservation.create({ schoolId: ctx.schoolId, titleId: title._id, titleName: title.title, cardId: card._id, holderName: card.name, activeKey: `${card._id}:${title._id}` }); return placeOf(ctx.schoolId, r); }
  catch (e) { if (isDup(e)) throw new Fail(409, 'You are already in the queue for this book.', { reason: 'queued' }); throw e; }
}
async function placeOf(schoolId, r) { const ahead = await LbReservation.countDocuments({ schoolId, titleId: r.titleId, status: { $in: ['waiting', 'ready'] }, createdAt: { $lt: r.createdAt } }); return { ...(r.toObject ? r.toObject() : r), position: ahead + 1 }; }
async function cancelReservation(ctx, { reservationId, card = null, reason = 'Cancelled' }) {
  const r = oid(reservationId) ? await LbReservation.findOne({ _id: reservationId, schoolId: ctx.schoolId }) : null; if (!r) throw new Fail(404, 'That reservation is not in your school.');
  if (card && String(r.cardId) !== String(card._id)) throw new Fail(404, 'That reservation is not on your card.');
  if (!['waiting', 'ready'].includes(r.status)) throw new Fail(409, 'That reservation has already ended.');
  const was = r.status; const done = await LbReservation.updateOne({ _id: r._id, status: was }, { $set: { status: 'cancelled', endedReason: reason }, $unset: { activeKey: 1 } });
  if (!done.matchedCount) throw new Fail(409, 'That reservation has just changed. Look again.');
  if (was === 'ready' && r.copyId) { await LbCopy.updateOne({ _id: r.copyId, schoolId: ctx.schoolId, status: 'reserved' }, { $set: { status: 'available', reservedFor: null } }); await offerToNext(ctx.schoolId, r.copyId, ctx.actor); }
  return { ok: true };
}

/* ───────── lending ───────── */
async function openLoans(schoolId, cardId) { return LbLoan.find({ schoolId, cardId, status: 'open' }); }
async function checkCanBorrow(ctx, card, kind) {
  if (card.status !== 'active') throw new Fail(423, `This card is ${card.status}${card.blockReason ? `: ${card.blockReason}` : ''}.`, { reason: 'card' });
  if (kind === 'textbook') return;
  const { policy } = await S.getLib(ctx.schoolId); const overridden = card.overrideUntil && new Date(card.overrideUntil) > new Date();
  const open = (await openLoans(ctx.schoolId, card._id)).filter((l) => l.kind === 'loan'); const limit = policy.maxLoans[card.holderType] || 3;
  if (open.length >= limit) throw new Fail(409, `${card.name} already has ${open.length} books out. The limit is ${limit}.`, { reason: 'limit' });
  const today = await S.today(ctx.schoolId);
  if (!overridden && policy.blockWhenOverdue && open.some((l) => E.keyOf(l.dueOn) < today)) throw new Fail(409, `${card.name} has a book that is overdue. It must come back first.`, { reason: 'overdue' });
  const owed = await S.unpaidTotal(ctx.schoolId, card._id);
  if (!overridden && policy.blockAtFines > 0 && owed >= policy.blockAtFines) throw new Fail(409, `${card.name} owes Rs ${owed} in fines. Fines of Rs ${policy.blockAtFines} or more stop new loans.`, { reason: 'fines', owed });
}

async function issue(ctx, { card, barcode, kind = 'loan', year = '', dueOn = null, at = null }) {
  const { copy, title } = await readCopy(ctx.schoolId, barcode);
  if (kind === 'loan' && title.kind === 'textbook') throw new Fail(422, 'This is a textbook. Issue it from Textbooks, for the school year.');
  if (kind === 'textbook' && title.kind !== 'textbook') throw new Fail(422, 'Only a title marked as a textbook can be issued for the year.');
  if (!title.lendable) throw new Fail(422, 'This is a reference book. It stays in the library.', { reason: 'reference' });
  await checkCanBorrow(ctx, card, kind);
  if (copy.status === 'on_loan') { const l = await LbLoan.findOne({ schoolId: ctx.schoolId, copyId: copy._id, status: 'open' }); throw new Fail(409, `This copy is already out${l ? ` with ${l.holderName}` : ''}.`, { reason: 'on_loan' }); }
  let resv = null;
  if (copy.status === 'reserved') { resv = copy.reservedFor ? await LbReservation.findOne({ _id: copy.reservedFor, schoolId: ctx.schoolId, status: 'ready' }) : null; if (!resv || String(resv.cardId) !== String(card._id)) throw new Fail(409, 'This copy is being held for someone who reserved it.', { reason: 'reserved' }); }
  else if (copy.status !== 'available') throw new Fail(409, `This copy cannot be lent: it is marked ${copy.status.replace('_', ' ')}.`, { reason: 'status' });
  const { policy, version } = await S.getLib(ctx.schoolId); const issuedAt = at && new Date(at) < new Date() ? new Date(at) : new Date();
  const dayKey = await S.localDay(ctx.schoolId, at ? issuedAt : null);
  const due = kind === 'textbook' ? (dueOn || E.keyOf(E.addDays(dayKey, 300))) : E.keyOf(E.addDays(dayKey, policy.loanDays[card.holderType] || 14));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < dayKey) throw new Fail(422, 'The return date must be a day from today on.');
  let loan;
  try { loan = await LbLoan.create({ schoolId: ctx.schoolId, copyId: copy._id, titleId: title._id, barcode: copy.barcode, titleName: title.title, cardId: card._id, holderType: card.holderType, holderId: card.holderId, holderName: card.name, kind, year: clean(year), issuedAt, dueOn: new Date(`${due}T00:00:00Z`), conditionOut: copy.condition, issuedByName: ctx.actor.name || '', policyVersion: version, activeCopy: String(copy._id) }); }
  catch (e) { if (isDup(e)) throw new Fail(409, 'This copy has just been lent at another desk.', { reason: 'on_loan' }); throw e; }
  const took = await LbCopy.updateOne({ _id: copy._id, schoolId: ctx.schoolId, status: copy.status, loanId: null }, { $set: { status: 'on_loan', loanId: loan._id, reservedFor: null }, ...addH(copy, 'on_loan', ctx.actor, `Lent to ${card.name}`) });
  if (!took.matchedCount) { await LbLoan.deleteOne({ _id: loan._id }); throw new Fail(409, 'This copy has just changed. Scan it again.', { reason: 'on_loan' }); }
  if (resv) await LbReservation.updateOne({ _id: resv._id, status: 'ready' }, { $set: { status: 'fulfilled' }, $unset: { activeKey: 1 } });
  await syncTitle(ctx.schoolId, title._id);
  return { loan: loan.toObject(), title: title.title, due, card: { _id: card._id, name: card.name } };
}
const clean = (v) => String(v == null ? '' : v).slice(0, 20);

/* ───────── fines ───────── */
async function makeFine(ctx, { card, loan = null, kind, amount, basis, titleName = '', barcode = '', policyVersion }) {
  if (!(amount > 0)) return null;
  const f = await S.numbered(LbFine, ctx.schoolId, 'fineNo', 'LF', { cardId: card._id, holderType: card.holderType, holderId: card.holderId, holderName: card.name, loanId: loan?._id || null, titleName, barcode, kind, amount, basis, policyVersion });
  await S.tell(ctx.schoolId, card, 'A library charge was added', `${basis} Rs ${amount}.`, '/student#/library', 'viewFees');
  return f.toObject();
}

/* ───────── returning ───────── */
const LEVELS = ['none', 'minor', 'major', 'destroyed'];
async function giveBack(ctx, { barcode, damage = 'none', note = '', at = null }) {
  const { copy, title } = await readCopy(ctx.schoolId, barcode);
  if (!LEVELS.includes(damage)) throw new Fail(422, 'Damage must be none, minor, major or destroyed.');
  const { policy, version } = await S.getLib(ctx.schoolId); const returnedAt = at && new Date(at) < new Date() ? new Date(at) : new Date(); const backDay = await S.localDay(ctx.schoolId, at ? returnedAt : null);
  // a copy marked lost that has been found
  if (copy.status === 'lost') {
    const lost = await LbLoan.findOne({ schoolId: ctx.schoolId, copyId: copy._id, status: 'lost' }).sort({ updatedAt: -1 });
    await LbCopy.updateOne({ _id: copy._id, schoolId: ctx.schoolId, status: 'lost' }, { $set: { status: 'available', loanId: null }, ...addH(copy, 'available', ctx.actor, 'Found') });
    const fines = []; if (lost) {
      await LbLoan.updateOne({ _id: lost._id, status: 'lost' }, { $set: { status: 'returned', returnedAt, returnedByName: ctx.actor.name || '', conditionIn: 'found' } });
      for (const f of await LbFine.find({ schoolId: ctx.schoolId, loanId: lost._id, kind: 'lost' })) {
        if (f.status === 'open') { await LbFine.updateOne({ _id: f._id, status: 'open' }, { $set: { status: 'void', refundNote: 'The copy was found.' } }); fines.push({ fineNo: f.fineNo, action: 'voided' }); }
        else if (f.status === 'paid') { await LbFine.updateOne({ _id: f._id, status: 'paid' }, { $set: { refundDue: true, refundNote: 'The copy was found after the charge was paid. An administrator decides on a refund.' } }); fines.push({ fineNo: f.fineNo, action: 'refund due' }); await S.tellAdmins(ctx.schoolId, 'A lost book was found after its charge was paid', `${f.holderName}: ${f.fineNo} (Rs ${f.amount}) may need a refund.`); }
      }
    }
    await syncTitle(ctx.schoolId, title._id); await offerToNext(ctx.schoolId, copy._id, ctx.actor); return { found: true, fines, title: title.title };
  }
  const loan = await LbLoan.findOne({ schoolId: ctx.schoolId, copyId: copy._id, status: 'open' }); if (!loan) throw new Fail(409, 'This copy is not out on loan.', { reason: 'not_out' });
  const done = await LbLoan.updateOne({ _id: loan._id, status: 'open' }, { $set: { status: 'returned', returnedAt, returnedByName: ctx.actor.name || '', conditionIn: damage === 'none' ? 'good' : damage }, $unset: { activeCopy: 1 } });
  if (!done.matchedCount) throw new Fail(409, 'This copy has just been returned at another desk.', { reason: 'not_out' });
  const card = await LbCard.findOne({ _id: loan.cardId, schoolId: ctx.schoolId }); const fines = [];
  if (loan.kind === 'loan') { const lf = E.lateFine(policy, E.keyOf(loan.dueOn), backDay); if (lf.amount > 0) fines.push(await makeFine(ctx, { card, loan, kind: 'overdue', amount: lf.amount, basis: `Returned ${lf.days} day${lf.days === 1 ? '' : 's'} late${lf.capped ? ' (capped)' : ''}.`, titleName: loan.titleName, barcode: loan.barcode, policyVersion: loan.policyVersion || version })); }
  let nextStatus = 'available'; let condition = copy.condition;
  if (damage !== 'none') {
    const fee = E.damageFee(policy, damage, copy.price || title.price); fines.push(await makeFine(ctx, { card, loan, kind: 'damage', amount: fee, basis: `${damage === 'destroyed' ? 'Returned destroyed' : `Returned with ${damage} damage`}${note ? ` (${String(note).slice(0, 80)})` : ''}.`, titleName: loan.titleName, barcode: loan.barcode, policyVersion: version }));
    if (damage === 'minor') condition = 'poor'; nextStatus = damage === 'minor' ? 'available' : damage === 'major' ? 'repair' : 'withdrawn';
  }
  await LbCopy.updateOne({ _id: copy._id, schoolId: ctx.schoolId }, { $set: { status: nextStatus, loanId: null, condition }, ...addH(copy, nextStatus, ctx.actor, damage === 'none' ? 'Returned' : `Returned, damage: ${damage}`) });
  await syncTitle(ctx.schoolId, title._id);
  const held = nextStatus === 'available' ? await offerToNext(ctx.schoolId, copy._id, ctx.actor) : null;
  return { loan: { ...loan.toObject(), status: 'returned', returnedAt }, fines: fines.filter(Boolean), copyStatus: held ? 'reserved' : nextStatus, heldFor: held ? held.holderName : '', title: title.title, holder: loan.holderName };
}

async function markLost(ctx, { loanId, note = '' }) {
  const loan = oid(loanId) ? await LbLoan.findOne({ _id: loanId, schoolId: ctx.schoolId }) : null; if (!loan) throw new Fail(404, 'That loan is not in your school.');
  const done = await LbLoan.updateOne({ _id: loan._id, status: 'open' }, { $set: { status: 'lost', returnedAt: null }, $unset: { activeCopy: 1 } }); if (!done.matchedCount) throw new Fail(409, 'That loan is no longer open.');
  const copy = await LbCopy.findOne({ _id: loan.copyId, schoolId: ctx.schoolId }); const title = await LbTitle.findOne({ _id: loan.titleId, schoolId: ctx.schoolId }); const { policy, version } = await S.getLib(ctx.schoolId); const card = await LbCard.findOne({ _id: loan.cardId, schoolId: ctx.schoolId });
  await LbCopy.updateOne({ _id: copy._id, schoolId: ctx.schoolId }, { $set: { status: 'lost', loanId: null }, ...addH(copy, 'lost', ctx.actor, note || 'Reported lost') });
  const price = copy?.price || title?.price || 0; const fee = E.lostFee(policy, price);
  const fine = await makeFine(ctx, { card, loan, kind: 'lost', amount: fee, basis: `Reported lost (replacement ${price > 0 ? `Rs ${price}` : `Rs ${policy.lostDefaultPrice} standard`}, ${policy.lostPercent}% plus Rs ${policy.lostProcessingFee} handling).`, titleName: loan.titleName, barcode: loan.barcode, policyVersion: version });
  await syncTitle(ctx.schoolId, loan.titleId); return { fine };
}

/* ───────── renewing ───────── */
async function renew(ctx, { loanId, card = null }) {
  const loan = oid(loanId) ? await LbLoan.findOne({ _id: loanId, schoolId: ctx.schoolId }) : null; if (!loan) throw new Fail(404, 'That loan is not in your school.');
  if (card && String(loan.cardId) !== String(card._id)) throw new Fail(404, 'That loan is not on your card.');
  if (loan.status !== 'open') throw new Fail(409, 'That loan has ended.');
  if (loan.kind !== 'loan') throw new Fail(422, 'A textbook issued for the year is not renewed.');
  const { policy } = await S.getLib(ctx.schoolId); const holder = await LbCard.findOne({ _id: loan.cardId, schoolId: ctx.schoolId });
  if (holder.status !== 'active') throw new Fail(423, `This card is ${holder.status}.`);
  if (loan.renewals >= policy.maxRenewals) throw new Fail(409, `This book has been renewed ${loan.renewals} time${loan.renewals === 1 ? '' : 's'}. That is the most the library allows.`, { reason: 'max' });
  const today = await S.today(ctx.schoolId); if (E.keyOf(loan.dueOn) < today) throw new Fail(409, 'This book is overdue. Return it first.', { reason: 'overdue' });
  if (await LbReservation.findOne({ schoolId: ctx.schoolId, titleId: loan.titleId, status: { $in: ['waiting', 'ready'] } })) throw new Fail(409, 'Someone is waiting for this book, so it cannot be renewed.', { reason: 'reserved' });
  const owed = await S.unpaidTotal(ctx.schoolId, holder._id); if (policy.blockAtFines > 0 && owed >= policy.blockAtFines) throw new Fail(409, `Fines of Rs ${owed} are unpaid. Pay at the desk to renew.`, { reason: 'fines' });
  const due = E.keyOf(E.addDays(E.keyOf(loan.dueOn) > today ? E.keyOf(loan.dueOn) : today, policy.loanDays[loan.holderType] || 14));
  const done = await LbLoan.updateOne({ _id: loan._id, status: 'open', renewals: loan.renewals }, { $set: { dueOn: new Date(`${due}T00:00:00Z`), renewals: loan.renewals + 1, remindedOn: '' } });
  if (!done.matchedCount) throw new Fail(409, 'That loan has just changed. Look again.');
  return { dueOn: due, renewals: loan.renewals + 1 };
}

/* ───────── fines: pay and waive ───────── */
async function payFine(ctx, { fineId, method = 'cash', reference = '' }) {
  const f = oid(fineId) ? await LbFine.findOne({ _id: fineId, schoolId: ctx.schoolId }) : null; if (!f) throw new Fail(404, 'That charge is not in your school.');
  if (!['cash', 'bank', 'wallet', 'other'].includes(method)) throw new Fail(422, 'Choose how it was paid.');
  const done = await LbFine.updateOne({ _id: f._id, status: 'open' }, { $set: { status: 'paid', paidAt: new Date(), paidMethod: method, paidRef: String(reference || '').slice(0, 80), receivedByName: ctx.actor.name || '' } });
  if (!done.matchedCount) throw new Fail(409, f.status === 'paid' ? 'That charge is already paid.' : `That charge is ${f.status}.`);
  return { ok: true, fineNo: f.fineNo, amount: f.amount };
}
async function waiveFine(ctx, { fineId, reason }) {
  const why = String(reason || '').trim(); if (why.length < 10) throw new Fail(422, 'Write the reason for waiving this charge (at least 10 characters).');
  const f = oid(fineId) ? await LbFine.findOne({ _id: fineId, schoolId: ctx.schoolId }) : null; if (!f) throw new Fail(404, 'That charge is not in your school.');
  const done = await LbFine.updateOne({ _id: f._id, status: 'open' }, { $set: { status: 'waived', waivedAt: new Date(), waivedByName: ctx.actor.name || '', waiveReason: why.slice(0, 500) } });
  if (!done.matchedCount) throw new Fail(409, `That charge is ${f.status}.`);
  return { ok: true };
}

/* ───────── the nightly sweep ───────── */
async function sweep(schoolId, actor = { id: null, name: 'System' }) {
  const ctx = { schoolId, actor }; const today = await S.today(schoolId); const { policy } = await S.getLib(schoolId); const out = { expired: 0, reminded: 0, overdue: 0 };
  for (const r of await LbReservation.find({ schoolId, status: 'ready', holdUntil: { $lt: new Date() } }).limit(200)) {
    const done = await LbReservation.updateOne({ _id: r._id, status: 'ready' }, { $set: { status: 'expired', endedReason: 'Not collected in time.' }, $unset: { activeKey: 1 } }); if (!done.matchedCount) continue; out.expired += 1;
    const card = await LbCard.findOne({ _id: r.cardId, schoolId }); if (card) await S.tell(schoolId, card, 'A reserved book was released', `"${r.titleName}" was not collected in time and has gone back on the shelf.`);
    if (r.copyId) { await LbCopy.updateOne({ _id: r.copyId, schoolId, status: 'reserved' }, { $set: { status: 'available', reservedFor: null } }); await offerToNext(schoolId, r.copyId, actor); }
  }
  const soon = E.keyOf(E.addDays(today, policy.reminderDaysBefore));
  for (const l of await LbLoan.find({ schoolId, status: 'open', kind: 'loan', dueOn: { $lte: new Date(`${soon}T00:00:00Z`) } }).limit(500)) {
    const due = E.keyOf(l.dueOn); const card = await LbCard.findOne({ _id: l.cardId, schoolId }); if (!card) continue;
    if (due >= today && l.remindedOn !== today && due <= soon) { if ((await LbLoan.updateOne({ _id: l._id, remindedOn: l.remindedOn }, { $set: { remindedOn: today } })).matchedCount) { await S.tell(schoolId, card, 'A library book is due soon', `"${l.titleName}" is due on ${due}.`); out.reminded += 1; } }
    else if (due < today && l.overdueNotedOn !== today && (E.daysBetween(due, today) === 1 || E.daysBetween(due, today) % 7 === 0)) { if ((await LbLoan.updateOne({ _id: l._id, overdueNotedOn: l.overdueNotedOn }, { $set: { overdueNotedOn: today } })).matchedCount) { await S.tell(schoolId, card, 'A library book is overdue', `"${l.titleName}" was due on ${due}. Fines start after ${policy.graceDays} day${policy.graceDays === 1 ? '' : 's'}.`, '/student#/library', 'viewFees'); out.overdue += 1; } }
  }
  return out;
}

module.exports = { syncTitle, readCopy, offerToNext, reserve, placeOf, cancelReservation, openLoans, checkCanBorrow, issue, giveBack, markLost, renew, payFine, waiveFine, makeFine, sweep };
