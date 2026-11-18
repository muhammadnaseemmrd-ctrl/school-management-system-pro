// School fee finance rules (PRD E06): invoices, allocations, refunds, statement matching. Whole PKR.
const crypto = require('crypto');
const mongoose = require('../lib/pgdoc');
const FeeInvoice = require('../models/FeeInvoice'); const FeePayment = require('../models/FeePayment'); const FeeRule = require('../models/FeeRule');
const StudentFee = require('../models/StudentFee'); const FeeCharge = require('../models/FeeCharge'); const Student = require('../models/Student'); const Parent = require('../models/Parent');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const LIVE = ['Open', 'PartiallyPaid', 'Paid', 'WrittenOff'];
const balanceOf = (inv) => Math.max(0, inv.total - inv.adjusted - inv.paid);

// Numbers run in order per school. A unique index guards against two people taking the same one.
async function withNumber(Model, schoolId, field, build, make) {
  for (let i = 0; i < 6; i++) {
    const n = (await Model.countDocuments({ schoolId: oid(schoolId), ...(field === 'number' ? {} : { [field]: { $ne: '' } }) })) + 1 + i;
    try { return await make(build(n), n); } catch (e) { if (e.code !== 11000 && !/unique|duplicate/i.test(e.message)) throw e; }
  }
  throw new Error('Could not assign a number. Please try again.');
}
const luhn = (s) => { let sum = 0; [...String(s)].reverse().forEach((d, i) => { let n = +d; if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; } sum += n; }); return (10 - (sum % 10)) % 10; };
const challanFor = (n) => { const body = String(n).padStart(7, '0'); return `${body}${luhn(body)}`; };
const invoiceNo = (n) => `INV-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
const receiptNo = (n) => `R-${String(n).padStart(6, '0')}`;

// Rebuild status from the numbers
function recalc(inv) {
  if (inv.status === 'Void') return inv;
  const bal = balanceOf(inv);
  if (bal <= 0 && inv.total >= 0) inv.status = inv.writtenOff > 0 ? 'WrittenOff' : 'Paid';
  else inv.status = inv.paid > 0 ? 'PartiallyPaid' : 'Open';
  return inv;
}

// Keep the older fee screens (tuition installments and other charges) in step with the invoice
async function syncLegacy(inv) {
  const settled = ['Paid', 'WrittenOff'].includes(inv.status);
  for (const l of inv.lines) {
    if (l.lateFee) continue;
    if (l.kind === 'installment' && l.installment) {
      const sf = await StudentFee.findOne({ schoolId: inv.schoolId, studentId: inv.studentId });
      if (!sf) continue;
      const n = l.installment; const has = (sf.paidInstallments || []).includes(n);
      if (settled && !has) {
        sf.paidInstallments = [...(sf.paidInstallments || []), n];
        const dates = sf.paidDates instanceof Map ? Object.fromEntries(sf.paidDates) : { ...(sf.paidDates || {}) }; dates[String(n)] = new Date(); sf.paidDates = dates;
        if (n <= 4) { sf[`q${n}Status`] = 'Paid'; sf[`q${n}PaidDate`] = new Date(); }
      } else if (!settled && has) {
        sf.paidInstallments = sf.paidInstallments.filter((x) => x !== n);
        const dates = sf.paidDates instanceof Map ? Object.fromEntries(sf.paidDates) : { ...(sf.paidDates || {}) }; delete dates[String(n)]; sf.paidDates = dates;
        if (n <= 4) { sf[`q${n}Status`] = 'Pending'; sf[`q${n}PaidDate`] = undefined; }
      } else continue;
      sf.markModified('paidInstallments'); sf.markModified('paidDates'); await sf.save();
    } else if (l.kind === 'charge' && l.chargeId) {
      if (settled) await FeeCharge.updateOne({ _id: l.chargeId, schoolId: inv.schoolId, status: 'Unpaid' }, { $set: { status: 'Paid', paidAt: new Date(), paidVia: 'admin' } });
      else await FeeCharge.updateOne({ _id: l.chargeId, schoolId: inv.schoolId, status: 'Paid', paidVia: 'admin' }, { $set: { status: 'Unpaid' }, $unset: { paidAt: 1 } });
    }
  }
}

// Take from a payment's unallocated money and put it on invoices, oldest due date first (or the one chosen)
async function allocate(payment, invoices) {
  let left = payment.amount - payment.allocations.reduce((s, a) => s + a.amount, 0) - payment.refunded + 0;
  left = payment.amount - payment.refunded - payment.allocations.reduce((s, a) => s + a.amount, 0);
  const done = [];
  for (const inv of invoices) {
    if (left <= 0) break;
    const take = Math.min(balanceOf(inv), left);
    if (take <= 0) continue;
    inv.paid += take; left -= take; recalc(inv);
    payment.allocations.push({ invoiceId: String(inv._id), invoiceNumber: inv.number, amount: take, at: new Date() });
    await inv.save(); await syncLegacy(inv); done.push({ invoiceId: inv._id, amount: take });
  }
  return { allocated: done, left };
}
const unallocated = (p) => p.status !== 'Confirmed' ? 0 : p.amount - p.refunded - p.allocations.reduce((s, a) => s + a.amount, 0);

// Money coming back out of invoices (a refund): newest allocation first
async function reverseAllocations(payment, amount) {
  let need = amount;
  for (let i = payment.allocations.length - 1; i >= 0 && need > 0; i--) {
    const a = payment.allocations[i]; if (a.amount <= 0) continue;
    const cut = Math.min(a.amount, need);
    const inv = await FeeInvoice.findOne({ _id: a.invoiceId, schoolId: payment.schoolId });
    if (inv) { inv.paid = Math.max(0, inv.paid - cut); recalc(inv); await inv.save(); await syncLegacy(inv); }
    a.amount -= cut; need -= cut;
  }
  payment.markModified('allocations');
  return need;
}

// Discounts from approved, in-date rules
async function discountsFor(schoolId, student, lines, at = new Date()) {
  const rules = (await FeeRule.find({ schoolId: oid(schoolId), status: 'Active' })).filter((r) => new Date(r.validFrom) <= at && (!r.validTo || new Date(r.validTo) > at));
  if (!rules.length) return lines.map((l) => ({ ...l, discount: 0, net: l.amount, discounts: [] }));
  let order = 1;
  const parents = await Parent.find({ schoolId: oid(schoolId), children: student._id }).select('children');
  if (parents.length) {
    const sibs = await Student.find({ schoolId: oid(schoolId), _id: { $in: [...new Set(parents.flatMap((p) => p.children.map(String)))].map(oid) } }).select('createdAt');
    order = sibs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).findIndex((s) => String(s._id) === String(student._id)) + 1 || 1;
  }
  const mine = rules.filter((r) => (r.kind === 'sibling' ? order >= (r.siblingFrom || 2) : (!r.studentId || String(r.studentId) === String(student._id))));
  const fixedUsed = new Set();
  return lines.map((l) => {
    const ds = []; let left = l.amount;
    for (const r of mine) {
      if (r.appliesTo === 'tuition' && l.kind !== 'installment') continue;
      let amt = r.valueType === 'percent' ? Math.round((l.amount * Math.min(100, r.value)) / 100) : (fixedUsed.has(String(r._id)) ? 0 : Math.min(r.value, l.amount));
      if (r.valueType === 'fixed' && amt) fixedUsed.add(String(r._id));
      amt = Math.min(amt, left); if (amt > 0) { ds.push({ ruleId: String(r._id), name: r.name, amount: amt }); left -= amt; }
    }
    return { ...l, discounts: ds, discount: l.amount - left, net: left };
  });
}

/* ───────── bank statements ───────── */
const splitCsv = (text) => { const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some((x) => x.trim())) rows.push(row); row = []; cur = ''; } else cur += c; }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row); return rows; };
const parseDate = (s) => { s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/))) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(`${s} UTC`); return Number.isNaN(d.getTime()) ? null : d; };
const parseAmount = (s) => { const n = Number(String(s || '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? Math.round(n) : NaN; };
const pick = (hdr, names) => hdr.findIndex((h) => names.includes(h));

function parseStatement(csv) {
  const rows = splitCsv(String(csv || '')); if (rows.length < 2) return { error: 'The file has no rows.' };
  const hdr = rows[0].map((h) => h.trim().toLowerCase());
  const iDate = pick(hdr, ['date', 'value date', 'transaction date', 'posting date']); const iDesc = pick(hdr, ['description', 'narration', 'details', 'particulars', 'remarks']);
  const iCr = pick(hdr, ['credit', 'deposit', 'cr', 'credit amount', 'amount']); const iRef = pick(hdr, ['reference', 'ref', 'ref no', 'reference no', 'transaction id', 'cheque no']);
  if (iDate < 0 || iCr < 0) return { error: 'Could not find a date column and a credit or amount column in the first row.' };
  const lines = []; const errors = []; const seen = new Map();
  rows.slice(1).forEach((r, k) => {
    const rowNo = k + 2; const raw = r[iCr]; if (!String(raw || '').trim()) return;           // debit-only rows are not payments in
    const date = parseDate(r[iDate]); const amount = parseAmount(raw);
    if (!date) return errors.push({ row: rowNo, message: `Row ${rowNo}: the date "${r[iDate]}" is not readable.` });
    if (!Number.isFinite(amount) || amount <= 0) { if (amount < 0) return; return errors.push({ row: rowNo, message: `Row ${rowNo}: the amount "${raw}" is not readable.` }); }
    const description = String(r[iDesc] || '').trim().slice(0, 200); const reference = String(r[iRef] || '').trim().slice(0, 80);
    const base = `${date.toISOString().slice(0, 10)}|${amount}|${reference}|${description.toLowerCase()}`; const occ = (seen.get(base) || 0) + 1; seen.set(base, occ);
    lines.push({ date, amount, description, reference, fingerprint: crypto.createHash('sha1').update(`${base}|${occ}`).digest('hex') });
  });
  return { lines, errors };
}

// Suggest which invoice a bank credit pays. A person always confirms.
function suggest(line, openInvoices, names) {
  const hay = `${line.reference} ${line.description}`.toLowerCase(); const nums = hay.match(/\d{6,}/g) || [];
  const byCode = openInvoices.find((i) => nums.some((n) => n.includes(i.challanCode) || i.challanCode.includes(n)));
  if (byCode) return { invoiceId: String(byCode._id), invoiceNumber: byCode.number, studentName: names.get(String(byCode.studentId)) || '', confidence: line.amount === balanceOf(byCode) ? 'high' : 'medium', why: line.amount === balanceOf(byCode) ? 'Challan code and amount match' : 'Challan code matches, amount differs' };
  const same = openInvoices.filter((i) => balanceOf(i) === line.amount && (names.get(String(i.studentId)) || '').toLowerCase().split(' ').some((w) => w.length > 2 && hay.includes(w)));
  if (same.length === 1) return { invoiceId: String(same[0]._id), invoiceNumber: same[0].number, studentName: names.get(String(same[0].studentId)) || '', confidence: 'medium', why: 'Amount and student name match' };
  return null;
}

module.exports = { LIVE, balanceOf, withNumber, challanFor, invoiceNo, receiptNo, recalc, syncLegacy, allocate, unallocated, reverseAllocations, discountsFor, parseStatement, suggest, oid };
