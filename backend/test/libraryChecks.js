// Library and school store (E18)
module.exports = async ({ call, expect, log, tokens, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Student = require('../models/Student'); const Teacher = require('../models/Teacher'); const Class = require('../models/Class');
  const PermissionGrant = require('../models/PermissionGrant'); const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password'); const E = require('../utils/library/engine');
  const M = (n) => require('../models/' + n);
  console.log('\n— Library and school store —');

  // ── 1. the rules on their own ──
  const bc = E.makeBarcode('copy', 422); const r0 = E.readBarcode(bc);
  log(/^BK\d{8}$/.test(bc) && r0.ok && r0.kind === 'copy' && E.readBarcode(bc.slice(0, -1) + ((Number(bc.slice(-1)) + 1) % 10)).reason === 'check' && E.readBarcode('XX1234567').reason === 'format' && E.readBarcode(E.makeBarcode('card', 7)).kind === 'card', 'a barcode carries a check digit, so a misread scan is refused instead of finding another book');
  log(E.normalizeIsbn('0-306-40615-2').isbn === '9780306406157' && !E.normalizeIsbn('9780306406158').ok && E.normalizeIsbn('').isbn === '' && !E.normalizeIsbn('12345').ok, 'ISBNs are checked and written in one form; a wrong last digit is caught');
  const P = E.mergePolicy({}); const lf = (d, r) => E.lateFine(P, d, r);
  log(lf('2026-03-10', '2026-03-10').amount === 0 && lf('2026-03-10', '2026-03-11').amount === 0 && lf('2026-03-10', '2026-03-12').amount === 5 && lf('2026-03-10', '2026-03-13').amount === 10 && lf('2026-03-10', '2026-03-13').days === 2 && lf('2026-03-10', '2026-08-01').amount === 500 && lf('2026-03-10', '2026-08-01').capped, 'a fine starts after the grace day, counts days late and stops at the cap');
  log(E.lostFee(P, 400) === 500 && E.lostFee(P, 0) === 600 && E.damageFee(P, 'minor', 400) === 100 && E.damageFee(P, 'major', 400) === 240 && E.damageFee(P, 'destroyed', 400) === 400, 'lost and damaged fees come from the policy: part of the price plus handling');
  log(E.cleanPolicy({ finePerDay: -1 }).error && E.cleanPolicy({ finePerDay: 10, fineCap: 5 }).error && E.cleanPolicy({ finePerDay: 10 }).policy.finePerDay === 10, 'a policy with a negative fine, or a cap below the daily fine, is refused');
  const cl = E.classifyImport([{ title: 'A', isbn: '9780306406157', copies: 2 }, { title: 'B', isbn: '9780306406157' }, { title: '', isbn: '' }, { title: 'C', isbn: '9780306406158' }, { title: 'D', isbn: '9780306406164' }], new Map([['9780306406164', { _id: 'x', title: 'D old', isbn: '9780306406164', authors: [], subjects: [], language: 'English' }]]));
  log(cl.map((x) => x.state).join() === 'add,duplicate,problem,problem,conflict', 'an import sorts rows into add, repeat in the file, problem and different from the catalogue');

  // ── 2. two schools ──
  const pw = await hashPassword('Lib@12345');
  const mk = async (code) => {
    const s = await School.create({ name: `${code} Academy`, code, email: `${code.toLowerCase()}@lib.test`, phone: '+92-300-1111111', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0 });
    const a = await User.create({ schoolId: s._id, name: `${code} Admin`, email: `admin@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const a2 = await User.create({ schoolId: s._id, name: `${code} Dean`, email: `admin2@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const mkT = (n) => Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const t = await mkT('Hamid'); const t2 = await mkT('Nida');
    const cls = await Class.create({ schoolId: s._id, name: 'Class 5', standard: '5', division: 'A', classTeacherId: t._id });
    const mkS = (n, i) => Student.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, role: 'student', admissionNumber: `${code}-${i}`, gender: 'Female', dateOfBirth: new Date('2012-05-05T00:00:00Z'), division: 'A', classId: cls._id, guardian: { name: 'G', mobileNumber: '03005550000' } });
    const st = await mkS('Zara', 1); const st2 = await mkS('Bilal', 2); const st3 = await mkS('Hina', 3); const st4 = await mkS('Imran', 4);
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    return { s, a, a2, t, t2, st, st2, st3, st4, cls, A: tok(a, 'admin'), A2: tok(a2, 'admin'), T: tok(t, 'teacher'), T2: tok(t2, 'teacher'), S: tok(st, 'student'), S2: tok(st2, 'student'), S4: tok(st4, 'student') };
  };
  const X = await mk('LIB001'); const Y = await mk('LIB002');
  const G = (p, t) => call('GET', p, t); const PO = (p, b, t) => call('POST', p, t, b || {}); const PA = (p, b, t) => call('PATCH', p, t, b || {}); const PU = (p, b, t) => call('PUT', p, t, b || {});
  const L = '/library'; const ST = '/store'; const id = (r) => r.data && r.data._id;
  await expect('the library needs a sign-in', G(`${L}/overview`, null), [401]);
  await expect('a student cannot open the desk', G(`${L}/overview`, X.S), [403]);
  await expect('a teacher without a grant cannot open the desk', G(`${L}/overview`, X.T), [403]);
  await expect('a teacher without a grant cannot open the store till', G(`${ST}/skus`, X.T), [403]);
  await expect('the office overview opens for an administrator', G(`${L}/overview`, X.A), [200]);
  const acc = await G(`${L}/access`, X.T); log(acc.status === 200 && !acc.data.desk && !acc.data.till, 'a teacher is told they are not on the desk');

  // ── 3. the policy keeps its versions ──
  const p0 = await G(`${L}/policy`, X.A); log(p0.status === 200 && p0.data.version === 1 && p0.data.policy.finePerDay === 5, 'the school starts with the published default rules');
  await expect('changing the rules needs a reason', PU(`${L}/policy`, { policy: { finePerDay: 10 } }, X.A), [422]);
  await expect('a fine cap below the daily fine is refused', PU(`${L}/policy`, { policy: { finePerDay: 10, fineCap: 5 }, reason: 'Trying a cap' }, X.A), [422]);
  const p1 = await PU(`${L}/policy`, { policy: { loanDays: { student: 7 }, maxLoans: { student: 2 }, finePerDay: 10, blockAtFines: 100, maxRenewals: 1 }, reason: 'Shorter loans for the new term' }, X.A);
  log(p1.status === 200 && p1.data.version === 2 && (await G(`${L}/policy`, X.A)).data.history.length === 2, 'a change makes version 2 and the old version stays in the history');
  await expect('an administrator of another school cannot see the history', G(`${L}/policy`, Y.T), [403]);

  // ── 4. catalogue and copies ──
  await expect('a teacher cannot add a book', PO(`${L}/titles`, { title: 'X' }, X.T), [403]);
  await expect('a book needs a title', PO(`${L}/titles`, { title: '' }, X.A), [422]);
  await expect('a wrong ISBN is refused', PO(`${L}/titles`, { title: 'Bad', isbn: '9780306406158' }, X.A), [422]);
  const t1 = await PO(`${L}/titles`, { title: 'The Story of Pakistan', authors: ['A. Rahman'], isbn: '978-0-306-40615-7', price: 400, subjects: ['History'] }, X.A); log(t1.status === 201 && t1.data.isbn === '9780306406157', 'a book is added with its ISBN in one form');
  await expect('the same ISBN cannot be added twice', PO(`${L}/titles`, { title: 'Again', isbn: '9780306406157' }, X.A), [409]);
  const t2 = await PO(`${L}/titles`, { title: 'Atlas of the World', kind: 'reference' }, X.A); const t3 = await PO(`${L}/titles`, { title: 'Science 5', kind: 'textbook', classIds: [String(X.cls._id)], subject: 'Science', price: 300 }, X.A);
  log(t2.data.lendable === false && t3.data.textbook.classIds.length === 1, 'a reference book stays in the library and a textbook belongs to a class');
  const c1 = await PO(`${L}/titles/${id(t1)}/copies`, { count: 3 }, X.A); log(c1.status === 201 && c1.data.added === 3 && new Set(c1.data.copies.map((c) => c.barcode)).size === 3, 'three copies each get their own barcode');
  await expect('more than 200 copies at once is refused', PO(`${L}/titles/${id(t1)}/copies`, { count: 500 }, X.A), [422]);
  await PO(`${L}/titles/${id(t2)}/copies`, { count: 1 }, X.A); const ct = await PO(`${L}/titles/${id(t3)}/copies`, { count: 2 }, X.A); const refCopy = (await G(`${L}/titles/${id(t2)}`, X.A)).data.copies[0];
  const [b1, b2, b3] = c1.data.copies.map((c) => c.barcode);
  const sh = await G(`${L}/titles?q=pakistan`, X.A); log(sh.data.total === 1 && sh.data.rows[0].copies === 3 && sh.data.rows[0].available === 3, 'the search finds the book and the counts match the copies');
  await expect('another school sees nothing of this catalogue', G(`${L}/titles?q=pakistan`, Y.A), [200]); log((await G(`${L}/titles?q=pakistan`, Y.A)).data.total === 0, 'and finds nothing');
  await expect('another school cannot open this book', G(`${L}/titles/${id(t1)}`, Y.A), [404]);

  // ── 5. who may work the desk ──
  await PermissionGrant.create({ schoolId: X.s._id, granteeId: X.t._id, granteeModel: 'Teacher', granteeName: 'Hamid', action: 'library.desk.operate', source: 'grant', validFrom: new Date(Date.now() - 1000), validTo: new Date(Date.now() + 864e5), reason: 'Librarian cover', grantedBy: X.a._id });
  log((await G(`${L}/access`, X.T)).data.desk === true && (await G(`${L}/overview`, X.T)).status === 200, 'a teacher with a granted window can work the desk');
  await expect('but not change the catalogue', PO(`${L}/titles`, { title: 'Nope' }, X.T), [403]);
  await expect('and not the store, which needs its own grant', G(`${ST}/skus`, X.T), [403]);

  // ── 6. lending ──
  const card = await G(`${L}/cards/lookup?studentId=${X.st._id}`, X.A); log(card.status === 200 && /^LC\d{8}$/.test(card.data.card.barcode) && card.data.limit === 2 && card.data.loans.length === 0, 'a student gets a card the first time, with the limit from the policy');
  const cardB = card.data.card.barcode;
  await expect('a scan with a wrong check digit is refused', PO(`${L}/issue`, { card: cardB.slice(0, -1) + ((Number(cardB.slice(-1)) + 1) % 10), barcode: b1 }, X.A), [422]);
  await expect('a book barcode is not a card', PO(`${L}/issue`, { card: b1, barcode: b1 }, X.A), [422]);
  await expect('a barcode no copy has is refused', PO(`${L}/issue`, { card: cardB, barcode: E.makeBarcode('copy', 99999) }, X.A), [404]);
  await expect('a reference book cannot be lent', PO(`${L}/issue`, { card: cardB, barcode: refCopy.barcode }, X.A), [422]);
  await expect('a textbook is issued for the year, not lent', PO(`${L}/issue`, { card: cardB, barcode: ct.data.copies[0].barcode }, X.A), [422]);
  const i1 = await PO(`${L}/issue`, { card: cardB, barcode: b1 }, X.A); log(i1.status === 201 && i1.data.due && E.daysBetween(E.keyOf(new Date()), i1.data.due) >= 6, 'a book is lent for the number of days the policy gives');
  await expect('the same copy cannot be lent twice', PO(`${L}/issue`, { studentId: String(X.st2._id), barcode: b1 }, X.A), [409]);
  await expect('a person cannot be over the limit', (async () => { await PO(`${L}/issue`, { card: cardB, barcode: b2 }, X.A); return PO(`${L}/issue`, { card: cardB, barcode: b3 }, X.A); })(), [409]);
  const both = await G(`${L}/cards/lookup?card=${cardB}`, X.A); log(both.data.loans.length === 2 && (await G(`${L}/titles?q=pakistan`, X.A)).data.rows[0].available === 1, 'the card lists what is out and the book shows one copy left');
  const [l1, l2] = both.data.loans;
  // race: two desks lend the last copy at once
  const racer = (await G(`${L}/cards/lookup?studentId=${X.st2._id}`, X.A)).data.card.barcode; const racer2 = (await G(`${L}/cards/lookup?studentId=${X.st3._id}`, X.A)).data.card.barcode; const card4 = (await G(`${L}/cards/lookup?studentId=${X.st4._id}`, X.A)).data.card.barcode;
  const race = await Promise.all([PO(`${L}/issue`, { card: racer, barcode: b3 }, X.A), PO(`${L}/issue`, { card: racer2, barcode: b3 }, X.A)]);
  log(race.map((r) => r.status).sort().join() === '201,409' && (await M('LbCopy').findOne({ barcode: b3 })).status === 'on_loan' && (await M('LbLoan').countDocuments({ schoolId: X.s._id, barcode: b3, status: 'open' })) === 1, 'two desks lending the last copy together: one succeeds, one is told it is gone, and there is one loan');

  // ── 7. renewing and reserving ──
  const rn = await PO(`${L}/loans/${l1._id}/renew`, {}, X.A); log(rn.status === 200 && rn.data.renewals === 1, 'a loan can be renewed');
  await expect('but only as many times as the policy allows', PO(`${L}/loans/${l1._id}/renew`, {}, X.A), [409]);
  await expect('a student cannot reserve while a copy is on the shelf', (async () => { await PO(`${L}/titles/${id(t1)}/copies`, { count: 1 }, X.A); return PO(`${L}/reservations`, { studentId: String(X.st3._id), titleId: id(t1) }, X.A); })(), [409]);
  const all = (await G(`${L}/titles/${id(t1)}`, X.A)).data.copies; const spare = all.find((c) => c.status === 'available'); const loserCard = race[0].status === 201 ? racer2 : racer;
  const sp = await PO(`${L}/issue`, { card: loserCard, barcode: spare.barcode }, X.A); log(sp.status === 201 && (await M('LbCopy').countDocuments({ schoolId: X.s._id, titleId: id(t1), status: 'available' })) === 0, 'the fourth copy goes to the student who lost the race, so every copy is out');
  const rv = await call('POST', `${L}/me/reserve`, X.S4, { titleId: id(t1) }); log(rv.status === 201 && rv.data.position === 1, 'a student joins the queue when every copy is out');
  await expect('a second place in the same queue is refused', call('POST', `${L}/me/reserve`, X.S4, { titleId: id(t1) }), [409]);
  await expect('a loan with someone waiting cannot be renewed', PO(`${L}/loans/${l2._id}/renew`, {}, X.A), [409]);

  // ── 8. returning, late fines, reservations being offered ──
  await M('LbLoan').updateOne({ _id: l1._id }, { $set: { dueOn: new Date(Date.now() - 6 * 86400000) } });
  const ov = await G(`${L}/loans?overdue=1`, X.A); log(ov.data.total === 1 && ov.data.rows[0].daysLate >= 5, 'the overdue list shows the loan and the days late');
  await expect('a person with an overdue book cannot borrow another', PO(`${L}/issue`, { card: cardB, barcode: spare.barcode }, X.A), [409]);
  const rt = await PO(`${L}/return`, { barcode: b1 }, X.A);
  log(rt.status === 200 && rt.data.fines.length === 1 && rt.data.fines[0].kind === 'overdue' && rt.data.fines[0].amount >= 50 && rt.data.heldFor === `${X.st4.name}`, 'a late return makes a fine by the policy and holds the copy for the first person waiting');
  await expect('a copy that is already back cannot be returned again', PO(`${L}/return`, { barcode: b1 }, X.A), [409]);
  await expect('the person waiting is the only one who can borrow the held copy', PO(`${L}/issue`, { card: cardB, barcode: b1 }, X.A), [409]);
  const held = await PO(`${L}/issue`, { card: card4, barcode: b1 }, X.A); log(held.status === 201 && (await M('LbReservation').findOne({ schoolId: X.s._id, status: 'fulfilled' })), 'the person waiting borrows it and the reservation is fulfilled');
  const stN = await M('Notification').find({ schoolId: X.s._id, title: /reserved book is ready/ }).limit(2); log(stN.length >= 1, 'the person waiting was told the book is ready');
  const fines = await G(`${L}/fines?status=open`, X.A); const f1 = fines.data.rows[0];
  const blocked = await M('LbFine').create({ schoolId: X.s._id, fineNo: 'LF-TEST-1', cardId: (await M('LbCard').findOne({ barcode: cardB }))._id, holderType: 'student', holderId: X.st._id, holderName: 'x', kind: 'overdue', amount: 100, basis: 'test' });
  await expect('fines of the blocking amount stop new loans', PO(`${L}/issue`, { card: cardB, barcode: spare.barcode }, X.A), [409]);
  await expect('a fine cannot be waived without a real reason', PO(`${L}/fines/${blocked._id}/waive`, { reason: 'ok' }, X.A), [422]);
  await expect('a teacher on the desk cannot waive a fine', PO(`${L}/fines/${blocked._id}/waive`, { reason: 'Because I said so' }, X.T), [403]);
  log((await PO(`${L}/fines/${blocked._id}/waive`, { reason: 'Book was returned on time, scan was missed' }, X.A)).status === 200, 'an administrator can waive a fine with a written reason');
  const pay = await PO(`${L}/fines/${f1._id}/pay`, { method: 'cash' }, X.T); log(pay.status === 200, 'the desk takes payment of a fine');
  await expect('a fine cannot be paid twice', PO(`${L}/fines/${f1._id}/pay`, { method: 'cash' }, X.T), [409]);
  await expect('or waived after it was paid', PO(`${L}/fines/${f1._id}/waive`, { reason: 'Trying after payment' }, X.A), [409]);

  // ── 9. lost, found, damaged ──
  const lostLoan = (await G(`${L}/cards/lookup?card=${cardB}`, X.A)).data.loans.find((l) => l.barcode === b2); const ls = await PO(`${L}/loans/${lostLoan._id}/lost`, {}, X.A);
  log(ls.status === 200 && ls.data.fine.kind === 'lost' && ls.data.fine.amount === 500 && (await M('LbCopy').findOne({ barcode: b2 })).status === 'lost', 'a lost book charges the price part plus handling, as the policy says, and the copy is marked lost');
  await expect('a lost loan cannot be marked lost again', PO(`${L}/loans/${lostLoan._id}/lost`, {}, X.A), [409]);
  const pL = await PO(`${L}/fines/${ls.data.fine._id}/pay`, { method: 'cash' }, X.A);
  const found = await PO(`${L}/return`, { barcode: b2 }, X.A); log(found.status === 200 && found.data.found && found.data.fines[0].action === 'refund due' && (await M('LbCopy').findOne({ barcode: b2 })).status === 'available', 'a lost book that turns up after the charge was paid goes back on the shelf and a refund is flagged, not made');
  log((await G(`${L}/fines?refundDue=1`, X.A)).data.total === 1, 'the refund is listed for an administrator to decide');
  const dm = await PO(`${L}/issue`, { card: racer2, barcode: b2 }, X.A); const dret = await PO(`${L}/return`, { barcode: b2, damage: 'major', note: 'Cover torn off' }, X.A);
  log(dm.status === 201 && dret.data.fines[0].kind === 'damage' && dret.data.fines[0].amount === 240 && dret.data.copyStatus === 'repair', 'a badly damaged return charges the policy share and sends the copy for repair');
  await expect('a copy for repair cannot be lent', PO(`${L}/issue`, { card: racer, barcode: b2 }, X.A), [409]);
  const fix = (await G(`${L}/titles/${id(t1)}`, X.A)).data.copies.find((c) => c.barcode === b2); await expect('a teacher cannot change a copy', PATCH(), [403]);
  function PATCH() { return PA(`${L}/copies/${fix._id}`, { status: 'available' }, X.T); }
  log((await PA(`${L}/copies/${fix._id}`, { status: 'available' }, X.A)).status === 200 && (await M('LbCopy').findOne({ barcode: b2 })).status === 'available', 'an administrator puts a repaired copy back on the shelf');
  await expect('withdrawing a copy needs a reason', PA(`${L}/copies/${fix._id}`, { status: 'withdrawn' }, X.A), [422]);

  // ── 10. the offline kiosk ──
  const k1 = await PO(`${L}/sync`, { ops: [{ clientKey: 'k-1', type: 'issue', card: cardB, barcode: b2, capturedAt: new Date(Date.now() - 3600000).toISOString() }, { clientKey: 'k-2', type: 'return', barcode: E.makeBarcode('copy', 99999) }, { clientKey: '', type: 'return', barcode: b2 }] }, X.T);
  log(k1.status === 200 && k1.data.results[0].ok && k1.data.results[0].late && !k1.data.results[1].ok && !k1.data.results[2].ok, 'saved kiosk actions are applied, late ones are marked, and one that fails says why without stopping the rest');
  const k2 = await PO(`${L}/sync`, { ops: [{ clientKey: 'k-1', type: 'issue', card: cardB, barcode: b2 }] }, X.T); log(k2.data.results[0].repeat && (await M('LbLoan').countDocuments({ schoolId: X.s._id, barcode: b2, status: 'open' })) === 1, 'sending the same saved action again does nothing');
  await expect('more than 100 saved actions at once are refused', PO(`${L}/sync`, { ops: Array.from({ length: 101 }, (_, i) => ({ clientKey: `z${i}`, type: 'return', barcode: b1 })) }, X.T), [422]);

  // ── 11. import ──
  const rows = [{ title: 'Import One', isbn: '9780306406164', authors: 'A; B', copies: 2, price: 250 }, { title: 'Import Two', isbn: '', copies: 1 }, { title: '', isbn: '' }, { title: 'The Story of Pakistan', isbn: '9780306406157', publisher: 'New Press', copies: 1 }];
  await expect('a teacher cannot import', PO(`${L}/import/preview`, { rows }, X.T), [403]);
  const pv = await PO(`${L}/import/preview`, { rows }, X.A); log(pv.status === 200 && pv.data.summary.add === 2 && pv.data.summary.problem === 1 && pv.data.summary.conflict === 1, 'the preview sorts the rows and changes nothing');
  log((await M('LbTitle').countDocuments({ schoolId: X.s._id })) === 3, 'nothing was added by the preview');
  const cm = await PO(`${L}/import/commit`, { rows, decisions: { 3: 'overwrite' } }, X.A); log(cm.status === 200 && cm.data.added === 2 && cm.data.updated === 1 && cm.data.copies === 4, 'the commit adds the new books and copies and updates the one the office chose');
  const cm2 = await PO(`${L}/import/commit`, { rows, decisions: { 3: 'overwrite' } }, X.A); log(cm2.data.repeat && (await M('LbTitle').countDocuments({ schoolId: X.s._id })) === 5, 'committing the same file again changes nothing');

  // ── 12. textbooks ──
  const need = await G(`${L}/textbooks/needs?classId=${X.cls._id}&year=2026-27`, X.A); log(need.data.titles.length === 1 && need.data.titles[0].needed === 4 && need.data.titles[0].available === 2, 'the class needs 4 copies and the library has 2');
  const cs = await PO(`${L}/textbooks/class-set`, { classId: String(X.cls._id), titleId: id(t3), year: '2026-27' }, X.A); log(cs.status === 200 && cs.data.issued === 2 && cs.data.short.length === 2, 'two students get the textbook and the shortage is named');
  const cs2 = await PO(`${L}/textbooks/class-set`, { classId: String(X.cls._id), titleId: id(t3), year: '2026-27' }, X.A); log(cs2.data.issued === 0 && cs2.data.short.length === 2, 'running it again issues nothing new');
  log((await G(`${L}/textbooks/recoveries?year=2026-27`, X.A)).data.rows.length === 2, 'the recoveries list shows the two textbooks still out');
  await expect('a textbook loan does not make a late fine', (async () => { await M('LbLoan').updateMany({ schoolId: X.s._id, kind: 'textbook' }, { $set: { dueOn: new Date(Date.now() - 30 * 86400000) } }); return PO(`${L}/return`, { barcode: ct.data.copies[0].barcode }, X.A); })(), [200]);
  log((await G(`${L}/fines?q=${encodeURIComponent('LIB001 Zara')}`, X.A)).data.rows.every((f) => f.kind !== 'overdue' || f.barcode !== ct.data.copies[0].barcode), 'and no overdue fine exists for it');

  // ── 13. sweeps ──
  await M('LbLoan').updateOne({ schoolId: X.s._id, barcode: b1, status: 'open' }, { $set: { dueOn: new Date(Date.now() + 86400000) } });
  const sw = await PO(`${L}/sweep`, {}, X.A); log(sw.status === 200 && sw.data.library.reminded >= 1, 'the nightly sweep reminds borrowers whose books are due soon');
  const sw2 = await PO(`${L}/sweep`, {}, X.A); log(sw2.data.library.reminded === 0, 'and does not remind them twice in a day');

  // ── 14. labels, exports and what families see ──
  const pdf = await call('POST', `${L}/labels/copies`, X.A, { titleId: id(t1) }); log(pdf.status === 200, 'barcode labels print for a book');
  const csv = await call('GET', `${L}/loans.csv`, X.A); log(csv.status === 200, 'loans export as a spreadsheet');
  const my = await call('GET', `${L}/me`, X.S); log(my.status === 200 && my.data.card.barcode === cardB && my.data.canAct === true, 'a student sees their own card, loans and charges');
  await expect('a student cannot renew another student\'s loan', call('POST', `${L}/me/loans/${(await G(`${L}/cards/lookup?card=${racer}`, X.A)).data.loans[0]._id}/renew`, X.S, {}), [404]);
  const ts = await call('GET', `${L}/me/titles?q=pakistan`, X.S4); log(ts.status === 200 && ts.data.rows.length === 1 && !('price' in ts.data.rows[0]), 'a student can search the catalogue');
  const us = await G(`${L}/reports/usage`, X.A); log(us.status === 200 && us.data.top.length >= 1, 'the office sees the most borrowed books');
  await expect('another school cannot touch this school\'s loan', PO(`${L}/loans/${l2._id}/renew`, {}, Y.A), [404]);
  await expect('or its fines', PO(`${L}/fines/${blocked._id}/pay`, { method: 'cash' }, Y.A), [404]);
  await require('./libraryStoreChecks')({ call, expect, log, X, Y, G, PO, PA, PU, id, M, L, ST });
};
