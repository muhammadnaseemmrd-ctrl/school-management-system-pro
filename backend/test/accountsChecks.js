// School ledger (E23): chart, journals that balance and cannot be changed, maker-checker, locked months, fund and grant rules, budgets.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Teacher = require('../models/Teacher');
  const PermissionGrant = require('../models/PermissionGrant'); const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password');
  const E = require('../utils/accounts/engine'); const M = (n) => require('../models/' + n);
  console.log('\n— School ledger —');

  // ── 1. the rules on their own ──
  const acc = new Map([['1010', { code: '1010', kind: 'asset', active: true }], ['5200', { code: '5200', kind: 'expense', active: true }], ['4500', { code: '4500', kind: 'income', active: true }], ['1500', { code: '1500', kind: 'asset', active: true }], ['9999', { code: '9999', kind: 'expense', active: false }], ['2100', { code: '2100', kind: 'liability', active: true }]]);
  const cfg0 = E.merge({});
  const ok0 = E.checkLines([{ code: '5200', debit: 500 }, { code: '1010', credit: 500 }], acc, cfg0);
  log(!ok0.error && ok0.totalDebit === 500 && ok0.totalCredit === 500, 'a balanced journal passes the line check');
  log(/does not balance/.test(E.checkLines([{ code: '5200', debit: 500 }, { code: '1010', credit: 400 }], acc, cfg0).error), 'an unbalanced journal is refused with the difference');
  log(/at least two/.test(E.checkLines([{ code: '5200', debit: 500 }], acc, cfg0).error), 'one line is not a journal');
  log(/either a debit or a credit/.test(E.checkLines([{ code: '5200', debit: 5, credit: 5 }, { code: '1010', credit: 0 }], acc, cfg0).error), 'a line with both sides or neither is refused');
  log(/whole rupees/.test(E.checkLines([{ code: '5200', debit: 5.5 }, { code: '1010', credit: 5.5 }], acc, cfg0).error) && /whole rupees/.test(E.checkLines([{ code: '5200', debit: -5 }, { code: '1010', credit: 5 }], acc, cfg0).error), 'fractions and negative amounts are refused');
  log(/switched off/.test(E.checkLines([{ code: '9999', debit: 5 }, { code: '1010', credit: 5 }], acc, cfg0).error) && /does not exist/.test(E.checkLines([{ code: '0000', debit: 5 }, { code: '1010', credit: 5 }], acc, cfg0).error), 'a switched-off or unknown account is refused');
  log(/only on income/.test(E.checkLines([{ code: '1010', debit: 5, fundId: 'f' }, { code: '4500', credit: 5 }], acc, cfg0).error) && !E.checkLines([{ code: '5200', debit: 5, fundId: 'f' }, { code: '1010', credit: 5 }], acc, cfg0).error, 'a fund can be named on income, expense and fixed-asset lines only');
  log(E.fyOf('2026-07', 7) === '2026-27' && E.fyOf('2027-06', 7) === '2026-27' && E.fyOf('2026-03', 7) === '2025-26' && E.fyOf('2026-03', 1) === '2026' && E.validFy('2026-27', 7) && !E.validFy('2026-28', 7), 'fiscal years are worked out from the start month');
  log(E.addMonths('2026-11', 3) === '2027-02' && E.addMonths('2026-01', -1) === '2025-12' && E.lastDay('2028-02') === '2028-02-29', 'month arithmetic and last day');
  const fund = { name: 'Science grant', kind: 'grant', status: 'active', allowedCodes: ['5200'], validFrom: '2026-01-01', validTo: '2026-12-31', ceiling: 1000 };
  log(E.fundReasons(fund, acc.get('5200'), { debit: 900 }, '2026-06-01', 0, cfg0).length === 0 && E.fundReasons(fund, acc.get('5200'), { debit: 200 }, '2026-06-01', 900, cfg0).some((r) => /overspent/.test(r)), 'a grant refuses to be overspent');
  log(E.fundReasons(fund, acc.get('5200'), { debit: 1 }, '2027-01-02', 0, cfg0).some((r) => /ended/.test(r)) && E.fundReasons(fund, acc.get('5200'), { debit: 1 }, '2025-12-31', 0, cfg0).some((r) => /starts/.test(r)), 'a grant refuses dates outside its window');
  log(E.fundReasons({ ...fund, allowedCodes: ['5240'] }, acc.get('5200'), { debit: 1 }, '2026-06-01', 0, cfg0).some((r) => /does not cover/.test(r)) && E.fundReasons({ ...fund, status: 'closed' }, acc.get('5200'), { debit: 1 }, '2026-06-01', 0, cfg0).some((r) => /closed/.test(r)), 'a grant refuses accounts it does not cover and closed funds are refused');
  log(E.fundReasons({ name: 'General', kind: 'unrestricted', status: 'active' }, acc.get('5200'), { debit: 99999999 }, '2020-01-01', 0, cfg0).length === 0, 'an unrestricted fund has no rules but being open');
  const dl = E.deltaLines({ '5200|': 500, '1010|': -500 }, { '5200|': 200, '1010|': -200 });
  log(dl.length === 2 && dl.find((l) => l.code === '5200').debit === 300 && dl.find((l) => l.code === '1010').credit === 300 && E.deltaLines({ 'a|': 5 }, { 'a|': 5 }).length === 0, 'a change posts only the difference');
  log(E.csv([['=cmd()', '+1', 'ok', 'a,b']]).startsWith("'=cmd()") && E.csv([['@x']]).startsWith("'@x") && E.csv([['a,b']]) === '"a,b"', 'exports guard against spreadsheet formulas');
  log(E.checkSettings({ budgetControl: 'maybe' }, acc).error && E.checkSettings({ fiscalStartMonth: 13 }, acc).error && E.checkSettings({ startDate: '2026-02-30' }, acc).error && E.checkSettings({ map: { cash: '5200' } }, acc).error && !E.checkSettings({ map: { cash: '1010' } }, acc).error, 'settings are checked: control, month, date and the kind of account each posting uses');

  // ── 2. two schools, people and the first set-up ──
  const pw = await hashPassword('Acc@12345'); const now = new Date(); const today = now.toISOString().slice(0, 10); const ymNow = today.slice(0, 7);
  const m0 = E.addMonths(ymNow, -3); const m1 = E.addMonths(ymNow, -2); const m2 = E.addMonths(ymNow, -1); const start = `${m0}-01`;
  const mk = async (code, { solo = false } = {}) => {
    const s = await School.create({ name: `${code} Academy`, code, email: `${code.toLowerCase()}@led.test`, phone: '+92-300-1111111', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0, timezone: 'UTC' });
    const a = await User.create({ schoolId: s._id, name: `${code} Admin`, email: `admin@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const a2 = solo ? null : await User.create({ schoolId: s._id, name: `${code} Dean`, email: `admin2@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const mkT = (n) => Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const tA = await mkT('Accountant'); const tC = await mkT('Controller'); const tU = await mkT('Auditor'); const tN = await mkT('Nobody');
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    const grant = (t, action) => PermissionGrant.create({ schoolId: s._id, granteeId: t._id, granteeModel: 'Teacher', granteeName: t.name, action, source: 'grant', validFrom: new Date(Date.now() - 1000), validTo: new Date(Date.now() + 86400000), reason: 'Books', grantedBy: new mg.Types.ObjectId() });
    return { s, a, a2, tA, tC, tU, tN, grant, A: tok(a, 'admin'), A2: a2 ? tok(a2, 'admin') : null, TA: tok(tA, 'teacher'), TC: tok(tC, 'teacher'), TU: tok(tU, 'teacher'), TN: tok(tN, 'teacher') };
  };
  const X = await mk('LED001'); const Y = await mk('LED002'); const Z = await mk('LED003', { solo: true });
  const G = (p, t) => call('GET', p, t); const PO = (p, b, t) => call('POST', p, t, b || {}); const PA = (p, b, t) => call('PATCH', p, t, b || {}); const PU = (p, b, t) => call('PUT', p, t, b || {}); const DEL = (p, t) => call('DELETE', p, t);
  const P = '/accounts'; const id = (r) => r.data && r.data._id;
  const line = (code, debit, credit, extra) => ({ code, debit: debit || 0, credit: credit || 0, ...(extra || {}) });

  await expect('the ledger needs a sign-in', G(`${P}/access`, null), [401]);
  await expect('a student cannot open the ledger', G(`${P}/accounts`, tokens.student), [403]);
  await expect('a teacher without a grant cannot open the ledger', G(`${P}/accounts`, X.TN), [403]);
  const ac0 = await G(`${P}/access`, X.TN); log(ac0.status === 200 && !ac0.data.prepare && !ac0.data.approve && !ac0.data.audit && !ac0.data.ready, 'a teacher is told they have no part in the books yet');
  await X.grant(X.tA, 'accounts.prepare'); await X.grant(X.tC, 'accounts.approve'); await X.grant(X.tU, 'accounts.audit');
  const ac1 = await G(`${P}/access`, X.TC); log(ac1.data.approve && ac1.data.prepare && ac1.data.audit && !ac1.data.admin, 'an approver can also prepare and read');
  const ac2 = await G(`${P}/access`, X.TU); log(ac2.data.audit && !ac2.data.prepare && !ac2.data.approve, 'an auditor can only read');
  const ns = await expect('before set-up the ledger says so', G(`${P}/accounts`, X.A), [409]); log(ns.data.reason === 'not_set_up', 'the answer names the reason');
  await expect('only an administrator sets the ledger up', PO(`${P}/setup`, { startDate: start }, X.TC), [403]);
  await expect('the start date must be a real date', PO(`${P}/setup`, { startDate: '2026-02-30' }, X.A), [422]);
  await expect('the fiscal year must start in a month', PO(`${P}/setup`, { startDate: start, fiscalStartMonth: 14 }, X.A), [422]);
  await expect('set-up works', PO(`${P}/setup`, { startDate: start, fiscalStartMonth: 7 }, X.A), [200]);
  await expect('set-up cannot be done twice', PO(`${P}/setup`, { startDate: start }, X.A), [409]);
  await expect('another school sets up its own', PO(`${P}/setup`, { startDate: start, fiscalStartMonth: 1 }, Y.A), [200]);
  await expect('a sole administrator sets up too', PO(`${P}/setup`, { startDate: start }, Z.A), [200]);
  const ch = await G(`${P}/accounts`, X.TU); const codes = ch.data.accounts.map((a) => a.code);
  log(ch.status === 200 && codes.includes('1010') && codes.includes('4100') && codes.includes('5100') && ch.data.accounts.length >= 28, 'the starting chart of accounts is made');
  log((await G(`${P}/accounts`, Y.A)).data.accounts.length === ch.data.accounts.length && !ch.data.accounts.some((a) => a.balance), 'each school has its own chart, all at zero');

  // ── 3. chart of accounts ──
  await expect('an auditor cannot add an account', PO(`${P}/accounts`, { code: '5300', name: 'Events', kind: 'expense' }, X.TU), [403]);
  const ev = await expect('an accountant adds an account', PO(`${P}/accounts`, { code: '5300', name: 'Events and trips', kind: 'expense', group: 'Running costs' }, X.TA), [201]);
  await expect('the same code is refused', PO(`${P}/accounts`, { code: '5300', name: 'Other', kind: 'expense' }, X.A), [409]);
  await expect('the same code in another school is fine', PO(`${P}/accounts`, { code: '5300', name: 'Events', kind: 'expense' }, Y.A), [201]);
  await expect('a bad code is refused', PO(`${P}/accounts`, { code: ' ', name: 'x', kind: 'expense' }, X.A), [422]);
  await expect('a bad kind is refused', PO(`${P}/accounts`, { code: '5301', name: 'x', kind: 'other' }, X.A), [422]);
  const ev2 = await expect('an account is renamed', PA(`${P}/accounts/${id(ev)}`, { name: 'Events, trips and camps' }, X.A), [200]); log(ev2.data.name === 'Events, trips and camps' && ev2.data.code === '5300', 'the code stays');
  await expect('an account used by an automatic posting cannot be switched off', PA(`${P}/accounts/${(await M('AcAccount').findOne({ schoolId: X.s._id, code: '1200' }))._id}`, { active: false }, X.A), [409]);
  await expect('an unused account can be switched off', PA(`${P}/accounts/${id(ev)}`, { active: false }, X.A), [200]);
  await expect('another school cannot touch it', PA(`${P}/accounts/${id(ev)}`, { name: 'Mine' }, Y.A), [404]);
  await expect('and a switched-off account cannot be posted to', PO(`${P}/journals`, { date: today, memo: 'Off', lines: [line('5300', 10), line('1010', 0, 10)] }, X.TA), [422]);
  await PA(`${P}/accounts/${id(ev)}`, { active: true }, X.A);

  // ── 4. settings ──
  const st0 = await G(`${P}/settings`, X.TU); log(st0.data.settings.map.cash === '1010' && st0.data.version === 1 && st0.data.settings.startDate === start, 'settings start at version 1 with the chosen start date');
  await expect('only an administrator changes settings', PU(`${P}/settings`, { reason: 'Because', settings: { budgetControl: 'block' } }, X.TC), [403]);
  await expect('a reason is needed', PU(`${P}/settings`, { reason: 'x', settings: { budgetControl: 'block' } }, X.A), [422]);
  await expect('a posting account must exist', PU(`${P}/settings`, { reason: 'Mapping', settings: { map: { cash: '7777' } } }, X.A), [422]);
  await expect('a posting account must be of the right kind', PU(`${P}/settings`, { reason: 'Mapping', settings: { map: { cash: '5200' } } }, X.A), [422]);
  await expect('settings are saved with a reason', PU(`${P}/settings`, { reason: 'Use the bank code for wallets too', settings: { requireReconciliation: false, budgetControl: 'warn' } }, X.A), [200]);
  const st1 = await G(`${P}/settings`, X.A); log(st1.data.version === 2 && st1.data.history.length === 2 && st1.data.history[0].reason.includes('bank'), 'every change is a new version with its reason');

  // ── 5. journals: draft, submit, approve ──
  const jBody = (memo, extra) => ({ date: today, memo, reference: 'REF-1', lines: [line('1010', 50000), line('3000', 0, 50000)], type: 'opening', ...(extra || {}) });
  await expect('an unbalanced journal is refused', PO(`${P}/journals`, { date: today, memo: 'Bad', lines: [line('1010', 100), line('3000', 0, 90)] }, X.TA), [422]);
  await expect('a journal before the start date is refused', PO(`${P}/journals`, { date: `${E.addMonths(m0, -1)}-15`, memo: 'Early', lines: [line('1010', 100), line('3000', 0, 100)] }, X.TA), [422]);
  await expect('a journal needs a description', PO(`${P}/journals`, { date: today, memo: '', lines: [line('1010', 100), line('3000', 0, 100)] }, X.TA), [422]);
  await expect('an auditor cannot draft', PO(`${P}/journals`, jBody('Opening cash'), X.TU), [403]);
  const pv = await expect('a preview says what would happen', PO(`${P}/journals/preview`, jBody('Opening cash'), X.TA), [200]); log(pv.data.ok && pv.data.totalDebit === 50000, 'the preview adds it up');
  const pvb = await PO(`${P}/journals/preview`, { date: today, lines: [line('1010', 100), line('3000', 0, 99)] }, X.TA); log(pvb.data.ok === false && /does not balance/.test(pvb.data.error), 'the preview names an imbalance');
  const j1 = await expect('an accountant drafts the opening balances', PO(`${P}/journals`, jBody('Opening cash and net assets'), X.TA), [201]);
  log(/^JE-\d{4}-\d{6}$/.test(j1.data.number) && j1.data.status === 'draft' && j1.data.totalDebit === 50000, 'the journal is numbered and starts as a draft');
  const nothing = await G(`${P}/statements/trial-balance`, X.A); log(nothing.data.rows.length === 0, 'a draft is not in the books');
  await expect('another accountant cannot change the draft', PA(`${P}/journals/${id(j1)}`, { memo: 'Mine now' }, X.TC), [403]);
  await expect('the drafter can change it', PA(`${P}/journals/${id(j1)}`, { memo: 'Opening cash and net assets (start)' }, X.TA), [200]);
  await expect('a draft cannot be approved before it is submitted', PO(`${P}/journals/${id(j1)}/decide`, { decision: 'approve' }, X.TC), [409]);
  await expect('the drafter submits', PO(`${P}/journals/${id(j1)}/submit`, {}, X.TA), [200]);
  await expect('a submitted journal cannot be edited', PA(`${P}/journals/${id(j1)}`, { memo: 'Sneaky' }, X.TA), [409]);
  await expect('an accountant cannot approve', PO(`${P}/journals/${id(j1)}/decide`, { decision: 'approve' }, X.TA), [403]);
  await expect('an auditor cannot approve', PO(`${P}/journals/${id(j1)}/decide`, { decision: 'approve' }, X.TU), [403]);
  const [d1, d2] = await Promise.all([PO(`${P}/journals/${id(j1)}/decide`, { decision: 'approve' }, X.TC), PO(`${P}/journals/${id(j1)}/decide`, { decision: 'approve' }, X.A2)]);
  log([d1.status, d2.status].sort().join() === '200,409', `two approvals at once: one wins, the other is told it is done (${d1.status}, ${d2.status})`);
  const j1p = await G(`${P}/journals/${id(j1)}`, X.TU); log(j1p.data.status === 'posted' && j1p.data.lines.length === 2 && j1p.data.lines[0].name && j1p.data.hash.length === 32 && j1p.data.trail.some((t) => /posted/.test(t.action)), 'it is posted with its lines, names and a fingerprint');
  await expect('a posted journal cannot be edited', PA(`${P}/journals/${id(j1)}`, { memo: 'Changed' }, X.TA), [409]);
  await expect('a posted journal cannot be deleted', DEL(`${P}/journals/${id(j1)}`, X.TA), [409]);
  await expect('a posted journal cannot be approved again', PO(`${P}/journals/${id(j1)}/decide`, { decision: 'approve' }, X.A2), [409]);
  const tb1 = await G(`${P}/statements/trial-balance`, X.TU); log(tb1.data.balanced && tb1.data.totalDebit === 50000 && tb1.data.rows.find((r) => r.code === '1010').debitBalance === 50000, 'the trial balance now shows the opening balances');
  await expect('another school cannot see the journal', G(`${P}/journals/${id(j1)}`, Y.A), [404]);
  log((await G(`${P}/statements/trial-balance`, Y.A)).data.rows.length === 0, 'and its own books are empty');
  // own work cannot be approved
  const j2 = await expect('a controller drafts a journal', PO(`${P}/journals`, { date: today, memo: 'Stationery bought for cash', lines: [line('5200', 1500), line('1010', 0, 1500)] }, X.TC), [201]);
  await expect('and submits it', PO(`${P}/journals/${id(j2)}/submit`, {}, X.TC), [200]);
  const selfOk = await expect('nobody approves their own journal', PO(`${P}/journals/${id(j2)}/decide`, { decision: 'approve' }, X.TC), [403]); log(selfOk.data.reason === 'maker_checker', 'the refusal names the rule');
  await expect('a reason is needed to return a journal', PO(`${P}/journals/${id(j2)}/decide`, { decision: 'reject', note: '' }, X.A), [422]);
  const rj = await expect('a journal is returned with a reason', PO(`${P}/journals/${id(j2)}/decide`, { decision: 'reject', note: 'Please attach the receipt number' }, X.A), [200]); log(rj.data.status === 'rejected' && /receipt/.test(rj.data.decisionNote), 'it comes back with the reason');
  await expect('a returned journal can be corrected', PA(`${P}/journals/${id(j2)}`, { reference: 'R-77', memo: 'Stationery bought for cash (receipt R-77)' }, X.TC), [200]);
  await expect('and sent again', PO(`${P}/journals/${id(j2)}/submit`, {}, X.TC), [200]);
  await expect('and approved by someone else', PO(`${P}/journals/${id(j2)}/decide`, { decision: 'approve' }, X.A), [200]);
  // a sole administrator
  const z1 = await PO(`${P}/journals`, { date: today, memo: 'Opening', type: 'opening', lines: [line('1010', 900), line('3000', 0, 900)] }, Z.A); await PO(`${P}/journals/${id(z1)}/submit`, {}, Z.A);
  const zp = await expect('a school with one administrator may approve its own journal', PO(`${P}/journals/${id(z1)}/decide`, { decision: 'approve' }, Z.A), [200]); log(zp.data.sole === true && zp.data.trail.some((t) => /sole/.test(t.note)), 'and the record says so');
  await expect('a draft can be deleted by whoever made it', (async () => { const d = await PO(`${P}/journals`, { date: today, memo: 'Throw away', lines: [line('5200', 5), line('1010', 0, 5)] }, X.TA); return DEL(`${P}/journals/${id(d)}`, X.TA); })(), [200]);

  // ── 6. reversal ──
  const jr = await expect('a journal to reverse', PO(`${P}/journals`, { date: today, memo: 'Paid the electricity bill twice by mistake', lines: [line('5220', 4000), line('1010', 0, 4000)] }, X.TA), [201]);
  await PO(`${P}/journals/${id(jr)}/submit`, {}, X.TA); await PO(`${P}/journals/${id(jr)}/decide`, { decision: 'approve' }, X.TC);
  await expect('a draft cannot be reversed', (async () => { const d = await PO(`${P}/journals`, { date: today, memo: 'Draft', lines: [line('5200', 5), line('1010', 0, 5)] }, X.TA); return PO(`${P}/journals/${id(d)}/reverse`, { reason: 'Mistake made' }, X.TA); })(), [409]);
  await expect('a reversal needs a reason', PO(`${P}/journals/${id(jr)}/reverse`, { reason: '' }, X.TA), [422]);
  await expect('a reversal cannot be dated before the journal', PO(`${P}/journals/${id(jr)}/reverse`, { reason: 'Paid twice', date: `${m0}-02` }, X.TA), [422]);
  const rv = await expect('a reversal is requested', PO(`${P}/journals/${id(jr)}/reverse`, { reason: 'Paid twice by mistake' }, X.TA), [201]);
  log(rv.data.status === 'submitted' && rv.data.type === 'reversal' && rv.data.lines.find((l) => l.code === '5220').credit === 4000 && rv.data.reversalOfNo === jr.data.number, 'it mirrors the original and waits for approval');
  await expect('a second reversal while one waits is refused', PO(`${P}/journals/${id(jr)}/reverse`, { reason: 'Again' }, X.TA), [409]);
  await expect('the person who asked cannot approve it', PO(`${P}/journals/${id(rv)}/decide`, { decision: 'approve' }, X.TA), [403]);
  await expect('the controller approves the reversal', PO(`${P}/journals/${id(rv)}/decide`, { decision: 'approve' }, X.TC), [200]);
  const orig = await G(`${P}/journals/${id(jr)}`, X.TU); log(orig.data.reversedByNo === rv.data.number, 'the original points to its reversal');
  const lg = await G(`${P}/ledger?code=5220&from=${start}&to=${today}`, X.TU); log(lg.data.closing === 0 && lg.data.rows.length === 2 && lg.data.rows[1].balance === 0, 'the account is back to nothing and both entries stay in the ledger');
  await expect('a journal cannot be reversed twice', PO(`${P}/journals/${id(jr)}/reverse`, { reason: 'Third time' }, X.TA), [409]);
  await expect('a reversal cannot be reversed', PO(`${P}/journals/${id(rv)}/reverse`, { reason: 'Undo the undo' }, X.TA), [409]);
  const rvj = await PO(`${P}/journals`, { date: today, memo: 'Another to reverse', lines: [line('5200', 70), line('1010', 0, 70)] }, X.TA); await PO(`${P}/journals/${id(rvj)}/submit`, {}, X.TA); await PO(`${P}/journals/${id(rvj)}/decide`, { decision: 'approve' }, X.TC);
  const rv2 = await PO(`${P}/journals/${id(rvj)}/reverse`, { reason: 'Wrong account' }, X.TA); await PO(`${P}/journals/${id(rv2)}/decide`, { decision: 'reject', note: 'Leave it, I will use another journal' }, X.TC);
  await expect('a returned reversal lets the original be reversed again', PO(`${P}/journals/${id(rvj)}/reverse`, { reason: 'Wrong account, retry' }, X.TA), [201]);

  // ── 7. months that lock ──
  const lj = await PO(`${P}/journals`, { date: `${m0}-05`, memo: 'Early month cash sale', lines: [line('1010', 300), line('4900', 0, 300)] }, X.TA);
  await expect('a month is not closed while a journal in it is unposted', PO(`${P}/periods/${m0}/close`, {}, X.TA), [422]);
  await PO(`${P}/journals/${id(lj)}/submit`, {}, X.TA); await PO(`${P}/journals/${id(lj)}/decide`, { decision: 'approve' }, X.TC);
  await expect('a month cannot be closed out of order', PO(`${P}/periods/${m1}/close`, {}, X.TA), [422]);
  await expect('the current month cannot be closed before it ends', PO(`${P}/periods/${ymNow}/close`, {}, X.TA), [422]);
  await expect('an auditor cannot close a month', PO(`${P}/periods/${m0}/close`, {}, X.TU), [403]);
  const ck = await G(`${P}/periods/${m0}/checklist`, X.TU); log(ck.data.blockers.length === 0 && ck.data.trialBalanced, 'the checklist is clear');
  const rq = await expect('an accountant asks for the month to be closed', PO(`${P}/periods/${m0}/close`, {}, X.TA), [200]); log(rq.data.status === 'closing', 'it is closing, waiting for sign-off');
  const lateD = await PO(`${P}/journals`, { date: `${m0}-09`, memo: 'Late one', lines: [line('5200', 5), line('1010', 0, 5)] }, X.TA);
  await expect('nothing more can be posted while a month waits to close', PO(`${P}/journals/${id(lateD)}/submit`, {}, X.TA), [423]);
  await expect('the requester cannot sign it off', PO(`${P}/periods/${m0}/approve`, {}, X.TA), [403]);
  await expect('an accountant can withdraw the request', PO(`${P}/periods/${m0}/cancel`, {}, X.TA), [200]); await DEL(`${P}/journals/${id(lateD)}`, X.TA);
  await expect('a controller asks again', PO(`${P}/periods/${m0}/close`, {}, X.TC), [200]);
  const selfC = await expect('a controller cannot sign off their own request', PO(`${P}/periods/${m0}/approve`, {}, X.TC), [403]); log(selfC.data.reason === 'maker_checker', 'the rule is named');
  const cl = await expect('someone else signs it off', PO(`${P}/periods/${m0}/approve`, {}, X.A2), [200]); log(cl.data.status === 'closed' && cl.data.snapshot.hash.length === 32 && cl.data.snapshot.totalDebit === cl.data.snapshot.totalCredit, 'the month is closed with a fingerprint of the books');
  const dLocked = await PO(`${P}/journals`, { date: `${m0}-12`, memo: 'Into a closed month', lines: [line('5200', 5), line('1010', 0, 5)] }, X.TA);
  const sLocked = await expect('a journal dated in a closed month cannot be sent', PO(`${P}/journals/${id(dLocked)}/submit`, {}, X.TA), [423]); log(sLocked.data.reason === 'period_locked' && /closed/.test(sLocked.data.message), 'the refusal says the month is closed'); await DEL(`${P}/journals/${id(dLocked)}`, X.TA);
  await expect('closing it again is refused', PO(`${P}/periods/${m0}/close`, {}, X.TA), [409]);
  const per = await G(`${P}/periods`, X.TU); const p0 = per.data.rows.find((r) => r.ym === m0); log(p0.status === 'closed' && p0.lines === 2 && per.data.rows.find((r) => r.ym === ymNow).status === 'open', 'the months list shows what is closed');
  const vf = await G(`${P}/periods/${m0}/verify`, X.TU); log(vf.data.ok === true, 'a closed month verifies against its fingerprint');
  await PO(`${P}/periods/${m1}/close`, {}, X.TA); await PO(`${P}/periods/${m1}/approve`, {}, X.TC);
  await expect('an earlier month cannot be reopened while a later one is closed', PO(`${P}/periods/${m0}/reopen`, { reason: 'We need to fix something' }, X.A), [409]);
  await expect('only an administrator reopens a month', PO(`${P}/periods/${m1}/reopen`, { reason: 'We need to fix something' }, X.TC), [403]);
  await expect('reopening needs a real reason', PO(`${P}/periods/${m1}/reopen`, { reason: 'oops' }, X.A), [422]);
  await expect('the latest closed month can be reopened', PO(`${P}/periods/${m1}/reopen`, { reason: 'A supplier credit arrived late' }, X.A), [200]);
  const per2 = await G(`${P}/periods`, X.TU); log(per2.data.rows.find((r) => r.ym === m1).history.some((h) => /reopened/.test(h.action)), 'the reopening is in the month\'s history');
  // tampering shows
  const chk0 = await G(`${P}/check`, X.TU); log(chk0.data.ok && chk0.data.balanced && chk0.data.lines >= 6, 'the books check out');
  const L1 = await M('AcLine').findOne({ schoolId: X.s._id, code: '4900' }); const dbg = require('../lib/pgdoc/db'); await dbg.get().query(`UPDATE ${require('../lib/pgdoc/model').q(M('AcLine').table)} SET doc = jsonb_set(doc, '{credit}', '999') WHERE id = $1`, [String(L1._id)]);
  const chk1 = await G(`${P}/check`, X.TU); log(!chk1.data.ok && chk1.data.problems.some((p) => p.kind === 'unbalanced') && chk1.data.problems.some((p) => p.kind === 'changed'), 'a line changed behind the system\'s back is found: out of balance and fingerprint mismatch');
  const vf2 = await G(`${P}/periods/${m0}/verify`, X.TU); log(vf2.data.ok === false, 'and the closed month no longer verifies');
  await dbg.get().query(`UPDATE ${require('../lib/pgdoc/model').q(M('AcLine').table)} SET doc = jsonb_set(doc, '{credit}', '300') WHERE id = $1`, [String(L1._id)]);
  log((await G(`${P}/check`, X.TU)).data.ok && (await G(`${P}/periods/${m0}/verify`, X.TU)).data.ok, 'restored, everything checks again');

  // ── 8. funds and grants ──
  await expect('an accountant cannot make a fund', PO(`${P}/funds`, { name: 'X', kind: 'grant' }, X.TA), [403]);
  await expect('a restricted fund must name its accounts', PO(`${P}/funds`, { name: 'Library fund', kind: 'restricted' }, X.TC), [422]);
  await expect('a fund cannot end before it starts', PO(`${P}/funds`, { name: 'Backwards', kind: 'grant', validFrom: '2026-05-01', validTo: '2026-04-01' }, X.TC), [422]);
  await expect('a fund may only be spent on expense accounts', PO(`${P}/funds`, { name: 'Odd', kind: 'restricted', allowedCodes: ['1010'] }, X.TC), [422]);
  const gr = await expect('a controller makes a grant', PO(`${P}/funds`, { name: 'Science lab grant', kind: 'grant', donor: 'Education Fund', reference: 'EF-2026-14', purpose: 'Lab equipment and supplies', allowedCodes: ['5200', '1500'], validFrom: start, validTo: `${E.addMonths(ymNow, 6)}-28`, ceiling: 10000 }, X.TC), [201]);
  await expect('fund names are unique in a school', PO(`${P}/funds`, { name: 'Science lab grant', kind: 'grant' }, X.A), [409]);
  const fid = id(gr);
  await expect('another school cannot change the fund', PA(`${P}/funds/${fid}`, { reason: 'Taking it over', ceiling: 1 }, Y.A), [404]);
  const spend = (amount, extra) => ({ date: today, memo: 'Lab supplies', lines: [line('5200', amount, 0, { fundId: fid }), line('1010', 0, amount)], ...(extra || {}) });
  const ok1 = await PO(`${P}/journals`, spend(8000), X.TA); const s1 = await expect('spending within the grant is accepted', PO(`${P}/journals/${id(ok1)}/submit`, {}, X.TA), [200]); log(!s1.data.warnings.length, 'with no warnings'); await PO(`${P}/journals/${id(ok1)}/decide`, { decision: 'approve' }, X.TC);
  const over = await PO(`${P}/journals`, spend(3000), X.TA); const sOver = await expect('spending past the award is refused', PO(`${P}/journals/${id(over)}/submit`, {}, X.TA), [422]); log(sOver.data.reason === 'fund_rule' && /overspent/.test(sOver.data.message), 'the refusal names the grant rule');
  const wrongAcc = await PO(`${P}/journals`, { date: today, memo: 'Repairs', lines: [line('5210', 100, 0, { fundId: fid }), line('1010', 0, 100)] }, X.TA); await expect('an account the grant does not cover is refused', PO(`${P}/journals/${id(wrongAcc)}/submit`, {}, X.TA), [422]);
  const late = await PO(`${P}/journals`, { date: `${E.addMonths(ymNow, 7)}-05`, memo: 'After the grant ended', lines: [line('5200', 100, 0, { fundId: fid }), line('1010', 0, 100)] }, X.TA); await expect('a date after the grant ended is refused', PO(`${P}/journals/${id(late)}/submit`, {}, X.TA), [422]);
  await expect('a fund cannot be named on a bank line', PO(`${P}/journals`, { date: today, memo: 'Bad tag', lines: [line('5200', 100), line('1010', 0, 100, { fundId: fid })] }, X.TA), [422]);
  const pvf = await PO(`${P}/journals/preview`, spend(9000), X.TA); log(pvf.data.ok === false && pvf.data.problems.length === 1, 'the preview shows the grant problem before sending');
  const recd = await PO(`${P}/journals`, { date: today, memo: 'Grant instalment received', lines: [line('1020', 6000), line('4500', 0, 6000, { fundId: fid })] }, X.TA); await PO(`${P}/journals/${id(recd)}/submit`, {}, X.TA); await PO(`${P}/journals/${id(recd)}/decide`, { decision: 'approve' }, X.TC);
  const fl = await G(`${P}/funds`, X.TU); const f0 = fl.data.funds.find((f) => f.id === fid); log(f0.received === 6000 && f0.spent === 8000 && f0.balance === -2000 && f0.remainingCeiling === 2000, 'the grant shows what came in, what was spent and what is left of the award');
  await expect('rules cannot change in a way that makes past spending ineligible', PA(`${P}/funds/${fid}`, { reason: 'Narrow the list', allowedCodes: ['1500'] }, X.TC), [409]);
  await expect('the award cannot be set below what was spent', PA(`${P}/funds/${fid}`, { reason: 'Lower it', ceiling: 5000 }, X.TC), [409]);
  await expect('a change needs a reason', PA(`${P}/funds/${fid}`, { ceiling: 20000 }, X.TC), [422]);
  await expect('the award can be raised with a reason', PA(`${P}/funds/${fid}`, { reason: 'Second instalment agreed', ceiling: 20000 }, X.TC), [200]);
  const ok2 = await PO(`${P}/journals`, spend(3000), X.TA); await expect('the same spending now fits', PO(`${P}/journals/${id(ok2)}/submit`, {}, X.TA), [200]);
  await expect('closing a fund needs a reason', PO(`${P}/funds/${fid}/close`, { reason: '' }, X.TC), [422]);
  await expect('a fund is closed', PO(`${P}/funds/${fid}/close`, { reason: 'Grant period finished' }, X.TC), [200]);
  await expect('a closed fund refuses new spending at approval', PO(`${P}/journals/${id(ok2)}/decide`, { decision: 'approve' }, X.TC), [422]);
  await expect('a closed fund can be reopened with a reason', PO(`${P}/funds/${fid}/reopen`, { reason: 'Donor extended the grant' }, X.TC), [200]);
  await expect('and then the spending is approved', PO(`${P}/journals/${id(ok2)}/decide`, { decision: 'approve' }, X.TC), [200]);
  const fs = await G(`${P}/funds/${fid}/lines`, X.TU); log(fs.data.rows.length === 3 && fs.data.rows.every((r) => r.journalNo), 'every line charged to the grant can be listed');
  const rep = await G(`${P}/statements/funds`, X.TU); log(rep.data.funds[0].spentBy.some((r) => r.code === '5200' && r.amount === 11000), 'the grant report shows what it paid for, by account');

  // ── 9. budgets ──
  const fy = E.fyOf(ymNow, 7); const fyr = E.fyRange(fy, 7);
  await expect('an auditor cannot make a budget', PO(`${P}/budgets`, { fy, lines: [{ code: '5200', annual: 1200 }] }, X.TU), [403]);
  await expect('a budget year must look right', PO(`${P}/budgets`, { fy: '2026', lines: [{ code: '5200', annual: 1200 }] }, X.TA), [422]);
  await expect('a budget line must be income or expense', PO(`${P}/budgets`, { fy, lines: [{ code: '1010', annual: 1200 }] }, X.TA), [422]);
  await expect('a budget line cannot repeat', PO(`${P}/budgets`, { fy, lines: [{ code: '5200', annual: 1 }, { code: '5200', annual: 2 }] }, X.TA), [422]);
  await expect('monthly amounts must be twelve', PO(`${P}/budgets`, { fy, lines: [{ code: '5200', months: [1, 2, 3] }] }, X.TA), [422]);
  const bd = await expect('an accountant drafts a budget', PO(`${P}/budgets`, { fy, note: 'First cut', lines: [{ code: '5200', annual: 1000 }, { code: '4100', annual: 120000 }, { code: '5100', months: new Array(12).fill(10000) }] }, X.TA), [201]);
  log(bd.data.version === 1 && bd.data.lines.find((l) => l.code === '5200').months.reduce((a, b) => a + b, 0) === 1000 && bd.data.totalIncome === 120000 && bd.data.totalExpense === 121000, 'a yearly figure is spread over twelve months and totals are kept');
  await expect('a second draft for the same year is refused', PO(`${P}/budgets`, { fy, lines: [{ code: '5200', annual: 1 }] }, X.TA), [409]);
  await expect('the draft can be changed', PU(`${P}/budgets/${id(bd)}`, { lines: [{ code: '5200', annual: 1200 }, { code: '4100', annual: 120000 }, { code: '5100', months: new Array(12).fill(10000) }] }, X.TA), [200]);
  await expect('the drafter cannot approve', PO(`${P}/budgets/${id(bd)}/approve`, {}, X.TA), [403]);
  await expect('someone with approval rights approves it', PO(`${P}/budgets/${id(bd)}/approve`, { note: 'Agreed with the board' }, X.TC), [200]);
  await expect('an approved budget cannot be changed', PU(`${P}/budgets/${id(bd)}`, { lines: [{ code: '5200', annual: 1 }] }, X.TA), [409]);
  const bd2 = await expect('a new version is started from it', PO(`${P}/budgets`, { fy, copyFrom: id(bd), note: 'Mid-year' }, X.TA), [201]); log(bd2.data.version === 2 && bd2.data.lines.length === 3, 'it is version two');
  await expect('the controller who started a version cannot approve it', (async () => { const t = await PO(`${P}/budgets`, { fy: E.fyOf(E.addMonths(ymNow, 12), 7), lines: [{ code: '5200', annual: 5 }] }, X.TC); return PO(`${P}/budgets/${id(t)}/approve`, {}, X.TC); })(), [403]);
  await expect('version two is approved by someone else', PO(`${P}/budgets/${id(bd2)}/approve`, {}, X.A2), [200]);
  const bl = await G(`${P}/budgets?fy=${fy}`, X.TU); log(bl.data.rows.find((r) => r.version === 1).status === 'superseded' && bl.data.rows.find((r) => r.version === 2).status === 'approved', 'the earlier version is superseded');
  const bs = await PO(`${P}/journals`, { date: today, memo: 'Big stationery order', lines: [line('5200', 5000), line('1010', 0, 5000)] }, X.TA); const bws = await expect('over budget is allowed with a warning when control is "warn"', PO(`${P}/journals/${id(bs)}/submit`, {}, X.TA), [200]); log(bws.data.warnings.length === 1 && /budget/.test(bws.data.warnings[0]), 'the warning is attached');
  await PO(`${P}/journals/${id(bs)}/decide`, { decision: 'approve' }, X.TC);
  await expect('control can be turned to block', PU(`${P}/settings`, { reason: 'No overspending this year', settings: { budgetControl: 'block' } }, X.A), [200]);
  const bb = await PO(`${P}/journals`, { date: today, memo: 'More stationery', lines: [line('5200', 100), line('1010', 0, 100)] }, X.TA); const bbs = await expect('over budget is refused when control is "block"', PO(`${P}/journals/${id(bb)}/submit`, {}, X.TA), [422]); log(bbs.data.reason === 'over_budget', 'with the reason named');
  const unb = await PO(`${P}/journals`, { date: today, memo: 'Unbudgeted account', lines: [line('5210', 100), line('1010', 0, 100)] }, X.TA); await expect('an account with no budget line is not blocked', PO(`${P}/journals/${id(unb)}/submit`, {}, X.TA), [200]);
  await PU(`${P}/settings`, { reason: 'Back to warnings', settings: { budgetControl: 'warn' } }, X.A);
  const bva = await G(`${P}/statements/budget?fy=${fy}`, X.TU); const r5200 = bva.data.rows.find((r) => r.code === '5200'); log(bva.data.version === 2 && r5200.annual === 1200 && r5200.actualYtd >= 5000 && r5200.variance < 0, 'budget against actual shows the overspend as unfavourable');
  const csvb = await fetch(`${base}/api${P}/statements/budget?fy=${fy}&format=csv`, { headers: { authorization: `Bearer ${X.TU}` } }); const csvt = await csvb.text(); log(csvb.status === 200 && /text\/csv/.test(csvb.headers.get('content-type')) && csvt.split('\r\n')[0].startsWith('Code,Account'), 'the report downloads as a spreadsheet file');
  await expect('the change of start date is refused once something is posted', PU(`${P}/settings`, { reason: 'Move the start date', settings: { startDate: `${m1}-01` } }, X.A), [409]);
  await expect('the fiscal year cannot move once a budget exists', PU(`${P}/settings`, { reason: 'Move the year', settings: { fiscalStartMonth: 1 } }, X.A), [409]);

  await require('./accountsChecks2')({ call, expect, log, tokens, base, X, Y, Z, E, M, mk, today, ymNow, m0, m1, m2, start, fyr, fy, line, P, G, PO, PA, PU, DEL, id });
};
