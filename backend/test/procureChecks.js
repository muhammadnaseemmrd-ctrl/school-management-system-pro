// Purchasing, funds, assets and facilities (E19): rules, suppliers, funds, budgets, requests, orders and goods received.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Teacher = require('../models/Teacher');
  const PermissionGrant = require('../models/PermissionGrant'); const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password'); const E = require('../utils/procure/engine');
  const M = (n) => require('../models/' + n);
  console.log('\n— Purchasing, funds, assets and facilities —');

  // ── 1. the rules on their own ──
  const D = E.merge({});
  log(E.fiscalYear('2026-08-10', 7) === '2026-27' && E.fiscalYear('2027-03-01', 7) === '2026-27' && E.fiscalYear('2026-03-01', 1) === '2026' && E.yearRange('2026-27', 7).to === '2027-06-30', 'the budget year runs from the school’s first month and has a start and an end');
  log(E.levelsFor(100000, D) === 1 && E.levelsFor(100001, D) === 2 && E.quoteRule(49999, [], D).ok && !E.quoteRule(50000, [1, 2], D).ok && E.quoteRule(50000, [1, 2, 3], D).ok, 'a large request needs two approvers and a request at the threshold needs three quotes');
  log(E.matchInvoice({ amount: 1000, orderTotal: 1000, receivedValue: 1000 }, D).match === 'matched' && E.matchInvoice({ amount: 1015, orderTotal: 1000, receivedValue: 1000 }, D).match === 'within_tolerance' && E.matchInvoice({ amount: 500, orderTotal: 1000, receivedValue: 300 }, D).match === 'exception' && E.matchInvoice({ amount: 1100, orderTotal: 1000, receivedValue: 1000 }, D).match === 'over', 'a bill is matched, inside the tolerance, an exception, or more than the order allows');
  const tg = E.makeTag(422); log(/^AS\d{8}$/.test(tg) && E.readTag(tg).ok && E.readTag(tg.slice(0, -1) + ((Number(tg.slice(-1)) + 1) % 10)).reason === 'check' && E.readTag('BK00000013').reason === 'format', 'an asset tag has a check digit and a misread tag is refused');
  const dp = E.depreciation({ cost: 120000, salvage: 0, usefulLifeYears: 4, capitalizedOn: '2026-01-15' }, '2026-07-20');
  log(dp.months === 6 && dp.accumulated === 15000 && dp.book === 105000 && E.depreciation({ cost: 1000, salvage: 200, usefulLifeYears: 1, capitalizedOn: '2020-01-01' }, '2030-01-01').book === 200 && E.depreciation({ cost: 1000, usefulLifeYears: 2, capitalizedOn: '2026-05-01' }, '2026-04-01').accumulated === 0, 'value falls in a straight line, stops at the scrap value and does not start early');
  log(E.occurrences({ startOn: '2026-01-31', frequency: 'monthly', amount: 5, endOn: '2026-04-30' }, '2026-01-01', '2026-12-31').map((o) => o.on).join() === '2026-01-31,2026-02-28,2026-03-31,2026-04-30' && E.occurrences({ startOn: '2026-01-01', frequency: 'quarterly', amount: 1 }, '2026-01-01', '2026-12-31').length === 4, 'running costs fall on the right dates, even at the end of a short month');
  log(E.cleanSettings({ tolerancePercent: 25 }).error && E.cleanSettings({ minQuotes: 0 }).error && E.cleanSettings({ costCentres: [] }).error && E.cleanSettings({ minQuotes: 2 }).settings.minQuotes === 2, 'settings outside their limits are refused');

  // ── 2. two schools ──
  const pw = await hashPassword('Pur@12345');
  const mk = async (code) => {
    const s = await School.create({ name: `${code} Academy`, code, email: `${code.toLowerCase()}@pur.test`, phone: '+92-300-1111111', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0 });
    const a = await User.create({ schoolId: s._id, name: `${code} Admin`, email: `admin@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const a2 = await User.create({ schoolId: s._id, name: `${code} Dean`, email: `admin2@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const mkT = (n) => Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const t = await mkT('Hamid'); const t2 = await mkT('Nida'); const t3 = await mkT('Omar');
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    return { s, a, a2, t, t2, t3, A: tok(a, 'admin'), A2: tok(a2, 'admin'), T: tok(t, 'teacher'), T2: tok(t2, 'teacher'), T3: tok(t3, 'teacher') };
  };
  const X = await mk('PUR001'); const Y = await mk('PUR002');
  const G = (p, t) => call('GET', p, t); const PO = (p, b, t) => call('POST', p, t, b || {}); const PA = (p, b, t) => call('PATCH', p, t, b || {}); const PU = (p, b, t) => call('PUT', p, t, b || {}); const DEL = (p, t) => call('DELETE', p, t);
  const P = '/procure'; const id = (r) => r.data && r.data._id; const grant = (school, t, action) => PermissionGrant.create({ schoolId: school._id, granteeId: t._id, granteeModel: 'Teacher', granteeName: t.name, action, source: 'grant', validFrom: new Date(Date.now() - 1000), validTo: new Date(Date.now() + 86400000), reason: 'Cover', grantedBy: new mg.Types.ObjectId() });
  await expect('purchasing needs a sign-in', G(`${P}/overview`, null), [401]);
  await expect('a student cannot open purchasing', G(`${P}/overview`, tokens.student), [403]);
  await expect('a teacher without a grant cannot open the office', G(`${P}/overview`, X.T), [403]);
  await expect('a teacher without a grant cannot raise a request', G(`${P}/options`, X.T), [403]);
  await expect('any teacher can report a maintenance job', PO(`${P}/tickets`, { title: 'Tap leaking in the staff room', location: 'Staff room', priority: 'normal' }, X.T), [201]);
  const acc0 = await G(`${P}/access`, X.T); log(acc0.status === 200 && !acc0.data.officer && !acc0.data.request, 'a teacher is told they are neither the officer nor allowed to request');
  await grant(X.s, X.t, 'procure.request'); await grant(X.s, X.t3, 'procure.officer');
  await expect('a teacher with the request grant sees the form options', G(`${P}/options`, X.T), [200]);
  await expect('but not the office overview', G(`${P}/overview`, X.T), [403]);
  await expect('the overview opens for an administrator', G(`${P}/overview`, X.A), [200]);

  // ── 3. settings keep their versions ──
  const s0 = await G(`${P}/settings`, X.A); log(s0.status === 200 && s0.data.version === 1 && s0.data.settings.minQuotes === 3, 'the school starts with the default purchasing rules');
  await expect('changing the rules needs a reason', PU(`${P}/settings`, { settings: { minQuotes: 2 } }, X.A), [422]);
  await expect('a tolerance above the limit is refused', PU(`${P}/settings`, { settings: { tolerancePercent: 50 }, reason: 'Too loose' }, X.A), [422]);
  await expect('a teacher officer cannot change the rules', PU(`${P}/settings`, { settings: { minQuotes: 2 }, reason: 'Trying it out' }, X.T3), [403]);
  const s1 = await PU(`${P}/settings`, { settings: { quoteThreshold: 60000 }, reason: 'Raise the quote threshold for the term' }, X.A); log(s1.status === 200 && s1.data.version === 2 && (await G(`${P}/settings`, X.A)).data.history.length === 2 && s1.data.settings.minQuotes === 3, 'a change makes version 2 and keeps the other rules');
  await PU(`${P}/settings`, { settings: { quoteThreshold: 50000 }, reason: 'Put the threshold back' }, X.A);
  const year = (await G(`${P}/options`, X.A)).data.year;

  // ── 4. suppliers ──
  await expect('a supplier needs a name', PO(`${P}/vendors`, { name: '' }, X.A), [422]);
  await expect('a bad account number is refused', PO(`${P}/vendors`, { name: 'Bad Bank Co', bank: { accountNo: '12' } }, X.A), [422]);
  const v1 = await PO(`${P}/vendors`, { name: 'Alpha Stationers', taxNo: 'NTN-1111', phone: '0300', bank: { bankName: 'HBL', accountTitle: 'Alpha Stationers', accountNo: 'PK36HABB0000001234567702' } }, X.A);
  log(v1.status === 201 && v1.data.pendingBank && v1.data.pendingBank.accountNo.startsWith('…') && !v1.data.bank.accountNo, 'a supplier is added with bank details that wait for approval and show only the last four digits');
  await expect('the same name cannot be added twice', PO(`${P}/vendors`, { name: 'ALPHA  stationers' }, X.A), [409]);
  await expect('the same tax number cannot be added twice', PO(`${P}/vendors`, { name: 'Other Name', taxNo: 'ntn1111' }, X.A), [409]);
  await expect('the same bank account cannot belong to two suppliers', PO(`${P}/vendors`, { name: 'Copycat Traders', bank: { accountNo: 'PK36HABB0000001234567702' } }, X.A), [409]);
  const v2 = await PO(`${P}/vendors`, { name: 'Beta Furnishers', taxNo: 'NTN-2222' }, X.A); const v3 = await PO(`${P}/vendors`, { name: 'Gamma Supplies' }, X.A); const v4 = await PO(`${P}/vendors`, { name: '=cmd Evil Trading' }, X.A);
  await expect('the person who entered the bank details cannot approve them', PO(`${P}/vendors/${id(v1)}/bank/decide`, { approve: true }, X.A), [403]);
  await expect('a teacher officer cannot approve bank details', PO(`${P}/vendors/${id(v1)}/bank/decide`, { approve: true }, X.T3), [403]);
  const bk = await PO(`${P}/vendors/${id(v1)}/bank/decide`, { approve: true }, X.A2); log(bk.status === 200 && (await G(`${P}/vendors/${id(v1)}`, X.A)).data.vendor.bank.accountNo === '…7702', 'a different administrator approves the bank details');
  await expect('a bank change needs a reason', PO(`${P}/vendors/${id(v1)}/bank`, { bank: { accountNo: 'PK00NEWBANK00000099' } }, X.T3), [422]);
  await expect('a teacher officer can ask for a bank change', PO(`${P}/vendors/${id(v1)}/bank`, { bank: { bankName: 'MCB', accountNo: 'PK00NEWBANK00000099' }, reason: 'The supplier moved bank' }, X.T3), [200]);
  await expect('the same account as already on file is refused', PO(`${P}/vendors/${id(v1)}/bank`, { bank: { accountNo: 'pk36habb0000001234567702' }, reason: 'Same again' }, X.T3), [422]);
  const rj = await PO(`${P}/vendors/${id(v1)}/bank/decide`, { approve: false }, X.A); log(rj.status === 200 && rj.data.status === 'rejected' && (await G(`${P}/vendors/${id(v1)}`, X.A)).data.vendor.bank.accountNo === '…7702', 'a turned-down bank change leaves the approved account in place');
  await expect('blocking a supplier needs a reason', PA(`${P}/vendors/${id(v3)}`, { status: 'blocked' }, X.A), [422]);
  const lv = await G(`${P}/vendors?q=alpha`, X.A); log(lv.data.total === 1 && lv.data.rows[0].bankKey === undefined, 'the supplier list can be searched and never exposes the account key');
  await expect('another school cannot open this supplier', G(`${P}/vendors/${id(v1)}`, Y.A), [404]);

  // ── 5. funds ──
  await expect('a teacher officer cannot create a fund', PO(`${P}/funds`, { name: 'Sneaky' }, X.T3), [403]);
  await expect('a restricted fund must say what it can be spent on', PO(`${P}/funds`, { name: 'Donor fund', kind: 'donor' }, X.A), [422]);
  await expect('a fund can only name real spending categories', PO(`${P}/funds`, { name: 'Odd fund', kind: 'grant', allowed: ['Yachts'] }, X.A), [422]);
  await expect('a fund cannot end before it starts', PO(`${P}/funds`, { name: 'Backwards', kind: 'grant', allowed: ['Furniture'], validFrom: '2026-06-01', validTo: '2026-01-01' }, X.A), [422]);
  const f1 = await PO(`${P}/funds`, { name: 'Operations', kind: 'general', amount: 5000000 }, X.A); log(f1.status === 201 && f1.data.received === 5000000 && f1.data.available === 5000000, 'a general fund opens with its starting amount');
  const f2 = await PO(`${P}/funds`, { name: 'Donor furniture fund', kind: 'donor', donor: 'Mr Khan', allowed: ['Furniture'], amount: 150000 }, X.A);
  const f3 = await PO(`${P}/funds`, { name: 'Old science grant', kind: 'grant', allowed: ['Lab equipment'], validFrom: '2020-01-01', validTo: '2020-12-31', amount: 90000 }, X.A);
  await expect('a fund name is unique', PO(`${P}/funds`, { name: 'Operations' }, X.A), [409]);
  await expect('money added to a fund must be positive', PO(`${P}/funds/${id(f2)}/money`, { amount: 0 }, X.A), [422]);
  await expect('a correction needs a reason', PO(`${P}/funds/${id(f2)}/money`, { kind: 'adjust', direction: 'down', amount: 1000 }, X.A), [422]);
  await expect('a correction cannot take out more than is available', PO(`${P}/funds/${id(f2)}/money`, { kind: 'adjust', direction: 'down', amount: 999999, note: 'Entered twice by mistake' }, X.A), [409]);
  await PO(`${P}/funds/${id(f2)}/money`, { amount: 10000, note: 'Second instalment', reference: 'DON-2' }, X.A); await PO(`${P}/funds/${id(f2)}/money`, { kind: 'adjust', direction: 'down', amount: 10000, note: 'Instalment was entered twice' }, X.A);
  const fd = await G(`${P}/funds/${id(f2)}`, X.A); log(fd.data.fund.available === 150000 && fd.data.entries.length === 3 && fd.data.entries.every((e) => e.balanceAfter !== undefined), 'every change to a fund is an entry, and corrections are new entries');
  await expect('another school cannot open this fund', G(`${P}/funds/${id(f2)}`, Y.A), [404]);

  // ── 6. budgets ──
  await expect('a budget needs lines', PO(`${P}/budgets`, { year, costCentre: 'Academic', lines: [] }, X.A), [422]);
  await expect('a budget needs a cost centre from the list', PO(`${P}/budgets`, { year, costCentre: 'Moonbase', lines: [{ category: 'Stationery', amount: 1 }] }, X.A), [422]);
  await expect('a budget line must be a real category', PO(`${P}/budgets`, { year, costCentre: 'Academic', lines: [{ category: 'Yachts', amount: 1 }] }, X.A), [422]);
  await expect('a category cannot be on a budget twice', PO(`${P}/budgets`, { year, costCentre: 'Academic', lines: [{ category: 'Stationery', amount: 1 }, { category: 'Stationery', amount: 2 }] }, X.A), [422]);
  const bu1 = await PO(`${P}/budgets`, { year, costCentre: 'Academic', lines: [{ category: 'Stationery', amount: 100000 }, { category: 'Furniture', amount: 400000 }, { category: 'IT equipment', amount: 300000 }, { category: 'Lab equipment', amount: 80000 }] }, X.A);
  log(bu1.status === 201 && bu1.data.total === 880000 && bu1.data.status === 'draft', 'a budget starts as a draft with its total');
  await expect('there is one budget per cost centre and year', PO(`${P}/budgets`, { year, costCentre: 'Academic', lines: [{ category: 'Stationery', amount: 1 }] }, X.A), [409]);
  const bu2 = await PO(`${P}/budgets`, { year, costCentre: 'Facilities', lines: [{ category: 'Construction', amount: 2000000 }, { category: 'Repairs and maintenance', amount: 200000 }] }, X.A);
  const dropped = await PU(`${P}/budgets/${id(bu1)}`, { lines: [{ category: 'Stationery', amount: 100000 }, { category: 'Furniture', amount: 400000 }] }, X.A); const afterDrop = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic');
  log(dropped.status === 200 && afterDrop.lines.length === 2 && afterDrop.total === 500000, 'taking a category off a draft budget removes its line and lowers the total');
  await expect('a draft can be edited', PU(`${P}/budgets/${id(bu1)}`, { lines: [{ category: 'Stationery', amount: 100000 }, { category: 'Furniture', amount: 400000 }, { category: 'IT equipment', amount: 300000 }, { category: 'Lab equipment', amount: 80000 }] }, X.A), [200]);
  await expect('a draft cannot be spent from', PO(`${P}/requisitions`, { title: 'Pens', costCentre: 'Academic', category: 'Stationery', items: [{ description: 'Pens', qty: 10, unitPrice: 50 }], justification: 'Needed for exams' }, X.T).then(async (r) => PO(`${P}/requisitions/${id(r)}/submit`, {}, X.T)), [422]);
  await expect('the person who made a budget cannot approve it', PO(`${P}/budgets/${id(bu1)}/approve`, {}, X.A), [403]);
  await expect('a teacher officer cannot approve a budget', PO(`${P}/budgets/${id(bu1)}/approve`, {}, X.T3), [403]);
  await expect('a different administrator approves the budget', PO(`${P}/budgets/${id(bu1)}/approve`, {}, X.A2), [200]); await PO(`${P}/budgets/${id(bu2)}/approve`, {}, X.A2);
  await expect('an approved budget cannot be edited directly', PU(`${P}/budgets/${id(bu1)}`, { lines: [{ category: 'Stationery', amount: 1 }] }, X.A), [409]);
  const bl = await G(`${P}/budgets?year=${year}`, X.A); const lineOf = (cc, cat) => bl.data.rows.find((b) => b.costCentre === cc).lines.find((l) => l.category === cat);
  log(bl.data.rows.length === 2 && lineOf('Academic', 'Stationery').available === 100000, 'approved budgets show their lines with what is left');

  // ── 7. requests ──
  const mkReq = (token, over = {}) => PO(`${P}/requisitions`, { title: 'Exam stationery', costCentre: 'Academic', category: 'Stationery', items: [{ description: 'Answer sheets', qty: 100, unit: 'pack', unitPrice: 50 }], justification: 'Term exams', ...over }, token);
  await expect('a request needs items', mkReq(X.T, { items: [] }), [422]);
  await expect('a quantity must be a whole number', mkReq(X.T, { items: [{ description: 'x', qty: 1.5, unitPrice: 5 }] }), [422]);
  await expect('a request must name a real cost centre', mkReq(X.T, { costCentre: 'Nowhere' }), [422]);
  const r1 = await mkReq(X.T); log(r1.status === 201 && r1.data.total === 5000 && /^REQ-\d{4}-\d{5}$/.test(r1.data.reqNo) && r1.data.budgetLineId, 'a teacher with the grant raises a request that finds its budget line and totals itself');
  await expect('a teacher cannot approve a request', PO(`${P}/requisitions/${id(r1)}/decide`, { approve: true }, X.T), [403]);
  await expect('a request cannot be approved before it is submitted', PO(`${P}/requisitions/${id(r1)}/decide`, { approve: true }, X.A2), [409]);
  await expect('another teacher with no grant cannot open it', G(`${P}/requisitions/${id(r1)}`, X.T2), [403]);
  await expect('the requester sees their own request', G(`${P}/requisitions/${id(r1)}`, X.T), [200]);
  await expect('the requester can edit a draft', PA(`${P}/requisitions/${id(r1)}`, { justification: 'Term exams and quizzes' }, X.T), [200]);
  const sub = await PO(`${P}/requisitions/${id(r1)}/submit`, {}, X.T); log(sub.status === 200 && sub.data.levels === 1, 'a small request is submitted for one approver');
  await expect('a submitted request cannot be edited', PA(`${P}/requisitions/${id(r1)}`, { title: 'Changed' }, X.T), [409]);
  const myList = await G(`${P}/requisitions`, X.T); log(myList.data.rows.length >= 1 && myList.data.rows.every((r) => /Hamid/.test(r.requesterName)), 'a requester sees only their own requests');
  await expect('a turned-down request needs a reason', PO(`${P}/requisitions/${id(r1)}/decide`, { approve: false }, X.A), [422]);
  const ap = await PO(`${P}/requisitions/${id(r1)}/decide`, { approve: true }, X.A); log(ap.status === 200 && ap.data.status === 'approved', 'an administrator approves a request from someone else');
  const afterAp = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic').lines.find((l) => l.category === 'Stationery'); log(afterAp.committed === 5000 && afterAp.available === 95000, 'approval sets the money aside in the budget line');
  await expect('an approved request cannot be approved twice', PO(`${P}/requisitions/${id(r1)}/decide`, { approve: true }, X.A2), [409]);
  // the maker and checker
  const r2 = await mkReq(X.A, { title: 'Marker pens' }); await PO(`${P}/requisitions/${id(r2)}/submit`, {}, X.A);
  const self = await PO(`${P}/requisitions/${id(r2)}/decide`, { approve: true }, X.A); log(self.status === 403 && self.data.reason === 'maker_checker', 'an administrator cannot approve their own request when there is another administrator');
  await PO(`${P}/requisitions/${id(r2)}/decide`, { approve: false, note: 'Not needed this term' }, X.A2);
  // cancelling releases the money
  const rc = await mkReq(X.A, { title: 'Chalk', items: [{ description: 'Chalk', qty: 10, unitPrice: 100 }] }); await PO(`${P}/requisitions/${id(rc)}/submit`, {}, X.A); await PO(`${P}/requisitions/${id(rc)}/decide`, { approve: true }, X.A2);
  const mid = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic').lines.find((l) => l.category === 'Stationery').committed; await expect('a reason is needed to cancel', PO(`${P}/requisitions/${id(rc)}/cancel`, {}, X.A), [422]);
  await PO(`${P}/requisitions/${id(rc)}/cancel`, { reason: 'Bought elsewhere already' }, X.A); const mid2 = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic').lines.find((l) => l.category === 'Stationery').committed;
  log(mid === 6000 && mid2 === 5000, 'cancelling an approved request gives the money back');
  // no budget line, not enough budget, fund rules
  const rn = await mkReq(X.A, { title: 'Sports kit', category: 'Sports' }); const rnSub = await PO(`${P}/requisitions/${id(rn)}/submit`, {}, X.A); log(rnSub.status === 422 && rnSub.data.reason === 'budget', 'a request with no approved budget line cannot be submitted');
  const big = await mkReq(X.A, { title: 'Too much paper', items: [{ description: 'Paper', qty: 1, unitPrice: 99000 }] }); const bigSub = await PO(`${P}/requisitions/${id(big)}/submit`, {}, X.A); log(bigSub.status === 409 && bigSub.data.reason === 'budget' && bigSub.data.left === 95000, 'a request bigger than what is left in the budget line is refused and says how much is left');
  const rf = await mkReq(X.A, { title: 'Chairs for the hall', category: 'Furniture', items: [{ description: 'Chairs', qty: 10, unitPrice: 4000 }], fundId: id(f2) }); log((await PO(`${P}/requisitions/${id(rf)}/submit`, {}, X.A)).status === 200, 'a request can name a donor fund that allows the category');
  const rfBad = await mkReq(X.A, { title: 'Pens from donor', fundId: id(f2) }); const rfBadSub = await PO(`${P}/requisitions/${id(rfBad)}/submit`, {}, X.A); log(rfBadSub.status === 422 && rfBadSub.data.reason === 'fund' && /Furniture/.test(rfBadSub.data.message), 'a donor fund refuses a category it does not allow and says what it does allow');
  const rOld = await mkReq(X.A, { title: 'Old grant lab kit', category: 'Lab equipment', items: [{ description: 'Beakers', qty: 10, unitPrice: 100 }], fundId: id(f3) }); const rOldSub = await PO(`${P}/requisitions/${id(rOld)}/submit`, {}, X.A); log(rOldSub.status === 422 && rOldSub.data.reason === 'fund', 'a grant that has run out of time cannot be spent');
  await PO(`${P}/requisitions/${id(rf)}/decide`, { approve: true }, X.A2); const f2n = (await G(`${P}/funds/${id(f2)}`, X.A)).data.fund; log(f2n.committed === 40000 && f2n.available === 110000, 'approving a request against a fund sets the money aside in the fund too');
  await expect('a fund with money set aside cannot be closed', PO(`${P}/funds/${id(f2)}/close`, { reason: 'Finished with it' }, X.A), [409]);
  // quotes
  const rq = await mkReq(X.T, { title: 'Lab computers', category: 'IT equipment', items: [{ description: 'Desktop PC', qty: 5, unitPrice: 20000 }] });
  const rqSub = await PO(`${P}/requisitions/${id(rq)}/submit`, {}, X.T); log(rqSub.status === 422 && rqSub.data.reason === 'quotes' && rqSub.data.need === 3, 'a request at the quote threshold needs three quotes');
  await expect('a teacher without the officer grant cannot add quotes', PO(`${P}/requisitions/${id(rq)}/quotes`, { vendorId: id(v2), amount: 98000 }, X.T), [403]);
  await expect('a quote needs a real supplier', PO(`${P}/requisitions/${id(rq)}/quotes`, { vendorId: 'x', amount: 98000 }, X.T3), [422]);
  const q1 = await PO(`${P}/requisitions/${id(rq)}/quotes`, { vendorId: id(v1), amount: 99000, validTo: '2099-01-01' }, X.T3); await PO(`${P}/requisitions/${id(rq)}/quotes`, { vendorId: id(v2), amount: 96000 }, X.T3);
  await expect('a supplier cannot quote twice', PO(`${P}/requisitions/${id(rq)}/quotes`, { vendorId: id(v2), amount: 90000 }, X.T3), [409]);
  const q3 = await PO(`${P}/requisitions/${id(rq)}/quotes`, { vendorId: id(v3), amount: 97500 }, X.T3);
  const rqSole = await PO(`${P}/requisitions/${id(rq)}/submit`, {}, X.T); log(rqSole.status === 422 && /Choose the quote/.test(rqSole.data.message), 'with quotes in, the recommended one must be chosen');
  await expect('a quote that is not the lowest needs a reason', PO(`${P}/requisitions/${id(rq)}/choose-quote`, { quoteKey: q3.data.quote.key }, X.T3), [422]);
  await expect('the lowest quote needs no reason', PO(`${P}/requisitions/${id(rq)}/choose-quote`, { quoteKey: 'q2' }, X.T3), [200]);
  await expect('a quote can be taken off', DEL(`${P}/requisitions/${id(rq)}/quotes/q1`, X.T3), [200]);
  const two = await PO(`${P}/requisitions/${id(rq)}/submit`, {}, X.T); log(two.status === 422 && two.data.have === 2, 'taking a quote off leaves the request short of quotes again');
  const rqOne = await PO(`${P}/requisitions/${id(rq)}/submit`, { soleSourceReason: 'Only Beta stocks this model in the city' }, X.T); log(rqOne.status === 200 && rqOne.data.levels === 1, 'only one or two suppliers is allowed with a written reason');
  const rqDetail = (await G(`${P}/requisitions/${id(rq)}`, X.A)).data; log(rqDetail.requisition.soleSourceReason && rqDetail.requisition.trail.some((t) => /One supplier/.test(t.note)), 'the reason for fewer quotes is kept in the trail');
  // two approvers
  const rl = await mkReq(X.T, { title: 'New classroom desks', category: 'Furniture', items: [{ description: 'Desks', qty: 100, unitPrice: 1500 }] }); await PO(`${P}/requisitions/${id(rl)}/quotes`, { vendorId: id(v1), amount: 150000 }, X.T3); await PO(`${P}/requisitions/${id(rl)}/quotes`, { vendorId: id(v2), amount: 149000 }, X.T3); await PO(`${P}/requisitions/${id(rl)}/quotes`, { vendorId: id(v3), amount: 151000 }, X.T3); await PO(`${P}/requisitions/${id(rl)}/choose-quote`, { quoteKey: 'q2' }, X.T3);
  const rlSub = await PO(`${P}/requisitions/${id(rl)}/submit`, {}, X.T); log(rlSub.status === 200 && rlSub.data.levels === 2, 'a request above the one-approver limit needs two approvers');
  const a1 = await PO(`${P}/requisitions/${id(rl)}/decide`, { approve: true }, X.A); log(a1.status === 200 && a1.data.status === 'submitted' && /second/.test(a1.data.waitingFor), 'the first approval leaves it waiting for a second');
  await expect('the same administrator cannot give both approvals', PO(`${P}/requisitions/${id(rl)}/decide`, { approve: true }, X.A), [403]);
  const lineBefore = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic').lines.find((l) => l.category === 'Furniture'); const a2r = await PO(`${P}/requisitions/${id(rl)}/decide`, { approve: true }, X.A2); const lineAfter = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic').lines.find((l) => l.category === 'Furniture');
  log(a2r.data.status === 'approved' && lineAfter.committed - lineBefore.committed === 150000, 'the second approval approves it and sets the money aside once');
  // two administrators deciding together
  const rr = await mkReq(X.T, { title: 'Race', items: [{ description: 'Stapler', qty: 10, unitPrice: 300 }] }); await PO(`${P}/requisitions/${id(rr)}/submit`, {}, X.T);
  const race = await Promise.all([PO(`${P}/requisitions/${id(rr)}/decide`, { approve: true }, X.A), PO(`${P}/requisitions/${id(rr)}/decide`, { approve: true }, X.A2)]); log(race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 1, 'two administrators approving at once: one decides and the other is told it is done');
  const cm = (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === 'Academic').lines.find((l) => l.category === 'Stationery').committed; log(cm === 5000 + 3000, 'the money was set aside once');

  // ── 8. orders ──
  const st = { X, Y, G, PO, PA, PU, DEL, P, id, M, year, v1, v2, v3, v4, f1, f2, f3, bu1, bu2, mkReq, lineOf: async (cc, cat) => (await G(`${P}/budgets?year=${year}`, X.A)).data.rows.find((b) => b.costCentre === cc).lines.find((l) => l.category === cat), r1, rq, rl, rr, rf };
  await expect('a request must be approved before it is ordered', PO(`${P}/requisitions/${id(rq)}/order`, { vendorId: id(v1) }, X.T3), [409]);
  await expect('a teacher without the officer grant cannot order', PO(`${P}/requisitions/${id(r1)}/order`, { vendorId: id(v1) }, X.T), [403]);
  await expect('an order needs a supplier', PO(`${P}/requisitions/${id(r1)}/order`, {}, X.T3), [422]);
  await expect('a blocked supplier cannot be ordered from', (async () => { await PA(`${P}/vendors/${id(v3)}`, { status: 'blocked', blockReason: 'Late delivery twice' }, X.A); const r = await PO(`${P}/requisitions/${id(r1)}/order`, { vendorId: id(v3) }, X.T3); await PA(`${P}/vendors/${id(v3)}`, { status: 'active' }, X.A); return r; })(), [422]);
  await expect('an order above the approved amount is refused', PO(`${P}/requisitions/${id(r1)}/order`, { vendorId: id(v1), lines: [{ description: 'Answer sheets', qty: 100, unitPrice: 60 }] }, X.T3), [422]);
  const o1 = await PO(`${P}/requisitions/${id(r1)}/order`, { vendorId: id(v1), expectedOn: '2099-01-10' }, X.T3); log(o1.status === 201 && /^PO-\d{4}-\d{5}$/.test(o1.data.poNo) && o1.data.total === 5000 && o1.data.committedLeft === 5000, 'a purchase order is issued from an approved request');
  const twice = await PO(`${P}/requisitions/${id(r1)}/order`, { vendorId: id(v1) }, X.T3); log(twice.status === 409, 'the same request cannot be ordered twice');
  const ro = await mkReq(X.A, { title: 'Order race', items: [{ description: 'Folders', qty: 10, unitPrice: 200 }] }); await PO(`${P}/requisitions/${id(ro)}/submit`, {}, X.A); await PO(`${P}/requisitions/${id(ro)}/decide`, { approve: true }, X.A2);
  const oRace = await Promise.all([PO(`${P}/requisitions/${id(ro)}/order`, { vendorId: id(v1) }, X.A), PO(`${P}/requisitions/${id(ro)}/order`, { vendorId: id(v2) }, X.T3)]); log(oRace.filter((r) => r.status === 201).length === 1 && oRace.filter((r) => r.status === 409).length === 1, 'two people ordering the same request together: one order only');
  const lo = await M('PcOrder').countDocuments({ schoolId: X.s._id, requisitionId: ro._id || oRace.find((r) => r.status === 201).data.requisitionId }); log(lo === 1, 'only one order exists for it');
  // a cheaper order than approved gives the difference back
  const rs = await mkReq(X.A, { title: 'Cheaper order', items: [{ description: 'Markers', qty: 100, unitPrice: 100 }] }); await PO(`${P}/requisitions/${id(rs)}/submit`, {}, X.A); await PO(`${P}/requisitions/${id(rs)}/decide`, { approve: true }, X.A2);
  const before = (await st.lineOf('Academic', 'Stationery')).committed; const os = await PO(`${P}/requisitions/${id(rs)}/order`, { vendorId: id(v2), lines: [{ description: 'Markers', qty: 100, unitPrice: 90 }] }, X.A); const after = (await st.lineOf('Academic', 'Stationery')).committed;
  log(os.status === 201 && os.data.total === 9000 && before - after === 1000, 'an order for less than approved gives the difference back to the budget');
  // a little over, inside the tolerance, takes a little more
  const rt = await mkReq(X.A, { title: 'Tolerance', items: [{ description: 'Glue', qty: 100, unitPrice: 100 }] }); await PO(`${P}/requisitions/${id(rt)}/submit`, {}, X.A); await PO(`${P}/requisitions/${id(rt)}/decide`, { approve: true }, X.A2);
  const ot = await PO(`${P}/requisitions/${id(rt)}/order`, { vendorId: id(v2), lines: [{ description: 'Glue', qty: 100, unitPrice: 101 }] }, X.A); log(ot.status === 201 && ot.data.total === 10100, 'an order slightly over the approval, inside the tolerance, is accepted and the extra is set aside');
  const rec = await G(`${P}/reconcile`, X.A); log(rec.status === 200 && rec.data.ok, 'every fund, budget line and project equals its entries');
  Object.assign(st, { o1, os, ot, oRace, ro, rt, rs });

  // ── 9. goods received ──
  const d1 = (await G(`${P}/orders/${id(o1)}`, X.A)).data; const ln = d1.lines[0]; log(d1.lines.length === 1 && ln.qty === 100 && ln.receivable === 102 && d1.order.status === 'issued', 'an order shows its lines and what can still arrive');
  await expect('a delivery must say how many arrived', PO(`${P}/orders/${id(o1)}/receive`, { lines: [] }, X.T3), [422]);
  await expect('a line that is not on the order is refused', PO(`${P}/orders/${id(o1)}/receive`, { lines: [{ lineId: id(v1), qty: 1 }] }, X.T3), [422]);
  await expect('a teacher without the officer grant cannot receive', PO(`${P}/orders/${id(o1)}/receive`, { lines: [{ lineId: ln._id, qty: 10 }] }, X.T), [403]);
  const g1 = await PO(`${P}/orders/${id(o1)}/receive`, { clientKey: 'grn-1', lines: [{ lineId: ln._id, qty: 60, rejected: 2, note: '2 torn' }] }, X.T3); log(g1.status === 201 && /^GRN-/.test(g1.data.grnNo) && g1.data.value === 3000, 'a delivery is recorded with its value and what was rejected');
  const g1b = await PO(`${P}/orders/${id(o1)}/receive`, { clientKey: 'grn-1', lines: [{ lineId: ln._id, qty: 60 }] }, X.T3); log(g1b.status === 200 && g1b.data.repeat && g1b.data._id === g1.data._id, 'sending the same delivery again records it once');
  log((await G(`${P}/orders/${id(o1)}`, X.A)).data.order.status === 'part_received', 'a part delivery makes the order part received');
  const rcv = await Promise.all([PO(`${P}/orders/${id(o1)}/receive`, { lines: [{ lineId: ln._id, qty: 30 }] }, X.A), PO(`${P}/orders/${id(o1)}/receive`, { lines: [{ lineId: ln._id, qty: 30 }] }, X.T3)]);
  log(rcv.filter((r) => r.status === 201).length === 1 && rcv.filter((r) => r.status === 409).length === 1 && rcv.find((r) => r.status === 409).data.reason === 'over_receipt', 'two people receiving the same last items: only what is left can arrive');
  const dd = (await G(`${P}/orders/${id(o1)}`, X.A)).data; log(dd.lines[0].receivedQty === 90 && dd.receipts.length === 2, 'the quantities add up and every delivery is listed');
  await PO(`${P}/orders/${id(o1)}/receive`, { lines: [{ lineId: ln._id, qty: 10 }] }, X.A); log((await G(`${P}/orders/${id(o1)}`, X.A)).data.order.status === 'received', 'when everything has arrived the order is received');
  await expect('a received order cannot be cancelled', PO(`${P}/orders/${id(o1)}/cancel`, { reason: 'Changed our minds' }, X.A), [409]);
  await expect('another school cannot open this order', G(`${P}/orders/${id(o1)}`, Y.A), [404]);
  require('./procureChecks2').__state = st;
  await require('./procureChecks2')({ call, expect, log, tokens, base }, st);
};
