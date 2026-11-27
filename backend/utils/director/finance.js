// What a group office needs to know about money, and nothing more.
//
// The line this draws on purpose: totals and the school's own expense lines, never a named
// child's fee record. A head office decides budgets, staffing and whether a campus is paying for
// itself; it does not need to know which family is behind on this term's fee. Where a figure
// could only be reached through one child, it is a count or a sum, never a name.

const FeeInvoice = require('../../models/FeeInvoice');
const FeePayment = require('../../models/FeePayment');
const PayrollBatch = require('../../models/PayrollBatch');
const PcInvoice = require('../../models/PcInvoice');
const School = require('../../models/School');

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// A window to read. "year" means the last twelve months, which is what a board asks for; "month"
// is the month running now; "all" is everything the school has ever recorded.
const windowOf = (period) => {
  const now = new Date();
  if (period === 'all') return { from: null, label: 'Everything so far' };
  if (period === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), label: 'This month' };
  const from = new Date(now);
  from.setMonth(from.getMonth() - 11);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  return { from, label: 'Last twelve months' };
};

const inWindow = (field, from) => (from ? { [field]: { $gte: from } } : {});

// One school's money. Each figure says where it comes from, because a director who cannot tell a
// billed fee from a collected one will read the wrong story out of the same number.
const forSchool = async (schoolId, from) => {
  const [invoices, payments, payruns, bills] = await Promise.all([
    FeeInvoice.find({ schoolId, status: { $ne: 'Void' }, ...inWindow('issueDate', from) }).select('total paid adjusted writtenOff status dueDate'),
    FeePayment.find({ schoolId, status: 'Confirmed', ...inWindow('receivedAt', from) }).select('amount refunded'),
    PayrollBatch.find({ schoolId, status: 'Finalized' }).select('period totals'),
    PcInvoice.find({ schoolId, status: { $in: ['approved', 'paid'] }, ...inWindow('createdAt', from) }).select('amount status'),
  ]);

  const billed = invoices.reduce((s, i) => s + (i.total || 0), 0);
  const settled = invoices.reduce((s, i) => s + (i.paid || 0) + (i.adjusted || 0) + (i.writtenOff || 0), 0);
  const outstanding = Math.max(0, billed - settled);
  const today = new Date();
  const overdue = invoices
    .filter((i) => i.dueDate && new Date(i.dueDate) < today && (i.total || 0) > ((i.paid || 0) + (i.adjusted || 0) + (i.writtenOff || 0)))
    .reduce((s, i) => s + ((i.total || 0) - ((i.paid || 0) + (i.adjusted || 0) + (i.writtenOff || 0))), 0);

  const collected = payments.reduce((s, p) => s + (p.amount || 0) - (p.refunded || 0), 0);

  // payroll is read by the months it covers, not by when the run happened to be made
  const since = from ? `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}` : '';
  const runs = since ? payruns.filter((r) => !r.period || r.period >= since) : payruns;
  const payroll = runs.reduce((s, r) => s + (r.totals?.net || 0), 0);
  const staffPaid = runs.reduce((s, r) => s + (r.totals?.employees || 0), 0);

  const supplierBills = bills.reduce((s, b) => s + (b.amount || 0), 0);
  const supplierPaid = bills.filter((b) => b.status === 'paid').reduce((s, b) => s + (b.amount || 0), 0);
  const supplierOwed = Math.max(0, supplierBills - supplierPaid);

  const expenses = payroll + supplierBills;

  // the school's own books, when it keeps them. A school that has not set them up is not a hole in
  // the group's picture; it simply has no ledger yet, and the figures above still stand.
  let books = null;
  try {
    const ST = require('../accounts/statements');
    const ov = await ST.overview(schoolId, { role: 'admin' });
    if (ov && ov.ready) {
      books = {
        cash: money(ov.cash), yearIncome: money(ov.yearIncome), yearExpense: money(ov.yearExpense),
        feeReceivable: money(ov.feeReceivable), suppliersOwed: money(ov.suppliersOwed),
        salariesOwed: money(ov.salariesOwed), closedThrough: ov.closedThrough || '',
      };
    }
  } catch (e) {
    books = null;
  }

  return {
    fees: { billed: money(billed), collected: money(collected), outstanding: money(outstanding), overdue: money(overdue), invoices: invoices.length },
    expenses: { total: money(expenses), payroll: money(payroll), supplierBills: money(supplierBills), supplierOwed: money(supplierOwed), payRuns: runs.length, staffPaid },
    net: money(collected - expenses),
    books,
  };
};

// The whole group, school by school and added up.
const forGroup = async (organizationId, period) => {
  const { from, label } = windowOf(period);
  const schools = await School.find({ organizationId }).sort({ name: 1 }).limit(200);
  const rows = [];
  for (const s of schools) {
    const figures = await forSchool(s._id, from);
    rows.push({
      schoolId: String(s._id),
      name: s.name,
      code: s.code,
      institutionType: s.institutionType || 'school',
      isActive: s.isActive !== false,
      ...figures,
    });
  }
  const add = (pick) => money(rows.reduce((t, r) => t + pick(r), 0));
  return {
    period: { key: period || 'year', label, from: from ? from.toISOString().slice(0, 10) : null },
    schools: rows,
    totals: {
      fees: {
        billed: add((r) => r.fees.billed), collected: add((r) => r.fees.collected),
        outstanding: add((r) => r.fees.outstanding), overdue: add((r) => r.fees.overdue),
      },
      expenses: {
        total: add((r) => r.expenses.total), payroll: add((r) => r.expenses.payroll),
        supplierBills: add((r) => r.expenses.supplierBills), supplierOwed: add((r) => r.expenses.supplierOwed),
      },
      net: add((r) => r.net),
      cash: money(rows.reduce((t, r) => t + (r.books?.cash || 0), 0)),
      booksKept: rows.filter((r) => r.books).length,
    },
  };
};

// One school, in more detail: month by month, and where the money went.
const detailFor = async (schoolId, period) => {
  const { from, label } = windowOf(period);
  const base = await forSchool(schoolId, from);

  const [invoices, payments, payruns, bills] = await Promise.all([
    FeeInvoice.find({ schoolId, status: { $ne: 'Void' }, ...inWindow('issueDate', from) }).select('total issueDate'),
    FeePayment.find({ schoolId, status: 'Confirmed', ...inWindow('receivedAt', from) }).select('amount refunded receivedAt method'),
    PayrollBatch.find({ schoolId, status: 'Finalized' }).select('period totals'),
    PcInvoice.find({ schoolId, status: { $in: ['approved', 'paid'] }, ...inWindow('createdAt', from) }).select('amount status createdAt invoiceNo'),
  ]);

  const months = new Map();
  const bucket = (d) => { const k = new Date(d); return `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}`; };
  const touch = (k) => { if (!months.has(k)) months.set(k, { month: k, billed: 0, collected: 0, payroll: 0, supplies: 0 }); return months.get(k); };
  for (const i of invoices) if (i.issueDate) touch(bucket(i.issueDate)).billed += i.total || 0;
  for (const p of payments) if (p.receivedAt) touch(bucket(p.receivedAt)).collected += (p.amount || 0) - (p.refunded || 0);
  for (const r of payruns) if (r.period) touch(r.period).payroll += r.totals?.net || 0;
  for (const b of bills) if (b.createdAt) touch(bucket(b.createdAt)).supplies += b.amount || 0;

  const byMethod = {};
  for (const p of payments) {
    const m = p.method || 'other';
    byMethod[m] = money((byMethod[m] || 0) + (p.amount || 0) - (p.refunded || 0));
  }

  return {
    period: { key: period || 'year', label },
    ...base,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({
      month: m.month, billed: money(m.billed), collected: money(m.collected),
      payroll: money(m.payroll), supplies: money(m.supplies), net: money(m.collected - m.payroll - m.supplies),
    })),
    collectedBy: byMethod,
    // the largest supplier bills, so a director can see what the money went on without opening
    // the school's own purchasing screens
    biggestBills: bills.sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 10)
      .map((b) => ({ invoiceNo: b.invoiceNo || '', amount: money(b.amount), status: b.status, on: b.createdAt })),
  };
};

module.exports = { forGroup, forSchool, detailFor, windowOf };
