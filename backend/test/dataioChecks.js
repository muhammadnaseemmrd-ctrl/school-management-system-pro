// Filling the school from a sheet (templates, checking, writing) and the whole-school workbook.
const ExcelJS = require('exceljs');

module.exports = async ({ call, expect, log, tokens, base }) => {
  const A = tokens.admin;
  const T = tokens.teacher;

  const form = async (url, token, buf, name = 'data.xlsx') => {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
    const res = await fetch(`${base}/api${url}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd });
    let data = null; try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data };
  };
  const bin = async (url, token) => {
    const res = await fetch(`${base}/api${url}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || '' };
  };
  const book = async (sheet, headers, rows) => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(sheet);
    ws.addRow(headers); for (const r of rows) ws.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  };
  const load = async (buf) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; };
  const commit = async (mod, rows, opts) => call('POST', `/dataio/${mod}/commit`, A, { rows: rows.map((r) => ({ n: r.n, raw: r.raw })), ...(opts || {}) });

  /* ── what is on offer ── */
  const mods = (await expect('the parts that can be filled from a sheet are listed', call('GET', '/dataio/modules', A))).data;
  const keys = mods.groups.flatMap((g) => g.modules.map((m) => m.key));
  log(keys.length >= 12 && keys.includes('students') && keys.includes('staff'), `every part is offered (${keys.length})`);
  log(mods.limits.maxRows > 0 && mods.limits.batch > 0, 'the row and batch limits are told to the browser');
  await expect('a teacher cannot fill the school from a sheet', call('GET', '/dataio/modules', T), [403]);
  await expect('a part we do not know is turned away', call('GET', '/dataio/not-a-thing/template', A), [404]);

  /* ── the blank template ── */
  const tpl = await bin('/dataio/students/template', A);
  log(tpl.status === 200 && /spreadsheetml/.test(tpl.type), 'the students template downloads as a workbook');
  const twb = await load(tpl.buf);
  log(twb.worksheets.length === 2, 'it carries a sheet that explains every column');
  const heads = (twb.worksheets[0].getRow(1).values || []).slice(1).map(String);
  log(heads.includes('Full name') && heads.includes('Class'), 'the headings are the ones we read back');

  /* ── a good file ── */
  const good = await book('Students', ['Full name', 'Admission number', 'Class', 'Section', 'Gender', 'Date of birth', 'Guardian email'], [
    ['Smoke Child One', 'SMK-001', '8', 'A', 'Female', '2013-05-04', 'smoke.guardian@example.com'],
    ['Smoke Child Two', 'SMK-002', '8', 'A', 'male', '12/03/2013', ''],
  ]);
  const pv = await form('/dataio/students/preview', A, good);
  log(pv.status === 200 && pv.data.summary.create === 2, `a filled file is read (${JSON.stringify(pv.data.summary)})`);
  const wr = await commit('students', pv.data.rows);
  log(wr.status === 200 && wr.data.tally.created === 2, 'both children are added');
  log(wr.data.results.some((r) => r.credential && r.credential.parent), 'a parent sign-in comes with the first child');

  const again = await form('/dataio/students/preview', A, good);
  log(again.data.summary.create === 0, 'the same file a second time adds nobody');

  /* ── mistakes are explained, not swallowed ── */
  const bad = await book('Students', ['Full name', 'Admission number', 'Class', 'Section', 'Gender', 'Date of birth'], [
    ['', 'SMK-010', '8', 'A', 'Female', '2013-05-04'],
    ['Smoke Bad Class', 'SMK-011', '99', 'Z', 'Female', '2013-05-04'],
    ['Smoke Bad Gender', 'SMK-012', '8', 'A', 'purple', '2013-05-04'],
    ['Smoke Future', 'SMK-013', '8', 'A', 'Female', '2099-01-01'],
    ['Smoke Twin', 'SMK-014', '8', 'A', 'Male', '2013-05-04'],
    ['Smoke Twin', 'SMK-014', '8', 'A', 'Male', '2013-05-04'],
  ]);
  const pvb = await form('/dataio/students/preview', A, bad);
  log(pvb.data.summary.error === 5 && pvb.data.summary.create === 1, `every mistake is found before anything is written (${JSON.stringify(pvb.data.summary)})`);
  const rows = Object.fromEntries(pvb.data.rows.map((r) => [r.n, r]));
  log(/needed/i.test(rows[2].errors[0] || ''), 'a missing name is named');
  log(/no class matches/i.test(rows[3].errors[0] || ''), 'a class we do not have is named');
  log(/same record as row/i.test(rows[7].errors[0] || ''), 'the same record twice in one file is caught');
  const wrb = await commit('students', pvb.data.rows);
  log(wrb.data.tally.created === 1 && wrb.data.tally.failed === 5, 'only the sound row is written');

  /* ── the browser is not trusted ── */
  const tamper = await call('POST', '/dataio/students/commit', A, { rows: [{ n: 1, raw: { name: 'Smoke Ghost', className: '999' } }] });
  log(tamper.data.tally.failed === 1, 'a row changed after the check is refused');
  await expect('too many rows at once is refused', call('POST', '/dataio/students/commit', A, { rows: new Array(500).fill({ n: 1, raw: {} }) }), [400]);

  /* ── a file that is not ours ── */
  const wrong = await form('/dataio/students/preview', A, await book('Sheet1', ['Thing', 'Other thing'], [['x', 'y']]));
  log(wrong.status === 422 && /template/i.test(wrong.data.message || ''), 'a file whose headings are not ours is turned away with a reason');
  const headless = await form('/dataio/students/preview', A, await book('Sheet1', ['Thing'], [['x']]));
  log(headless.status === 400, 'a sheet with nothing that looks like headings is turned away too');
  const notXl = await form('/dataio/students/preview', A, Buffer.from('plain text'), 'notes.txt');
  log(notXl.status === 400, 'a file that is not a workbook is turned away');

  /* ── other parts, and updates ── */
  const stf = await form('/dataio/staff/preview', A, await book('Staff', ['Staff number', 'Full name', 'Role', 'Department'], [
    ['SMK-G1', 'Smoke Guard', 'guard', 'Gate'],
    ['SMK-G2', 'Smoke Wizard', 'wizard', 'Tower'],
  ]));
  log(stf.data.summary.create === 1 && stf.data.summary.error === 1, 'a role the school does not have is refused');
  log((await commit('staff', stf.data.rows)).data.tally.created === 1, 'the guard is added');

  const upd = await form('/dataio/staff/preview', A, await book('Staff', ['Staff number', 'Full name', 'Role', 'Department'], [['SMK-G1', 'Smoke Guard', 'guard', 'Night gate']]));
  log(upd.data.summary.update === 1 && (upd.data.rows[0].changes || []).length > 0, 'a changed row says what would change');
  log((await commit('staff', upd.data.rows)).data.tally.skipped === 1, 'without asking, nothing is overwritten');
  log((await commit('staff', upd.data.rows, { updateExisting: true })).data.tally.updated === 1, 'asking for updates changes it');

  /* ── fees carry their instalments ── */
  const fee = await form('/dataio/fee-structures/preview', A, await book('Fee structures', ['Class', 'Yearly total', 'Instalments'], [['77', 40000, 4]]));
  const feeW = await commit('fee-structures', fee.data.rows);
  log(feeW.data.tally.created + feeW.data.tally.updated === 1, 'a fee structure loads with its instalments worked out');

  /* ── taking what is here back out ── */
  const ex = await bin('/dataio/staff/export', A);
  log(ex.status === 200 && ex.buf.length > 2000, 'what is already here downloads as a sheet');
  const back = await form('/dataio/staff/preview', A, ex.buf);
  log(back.status === 200 && back.data.summary.create === 0, 'that sheet loaded straight back adds nobody');

  /* ── the whole school in one workbook ── */
  const plan = (await expect('the whole-school order is set out', call('GET', '/dataio/whole-school/plan', A))).data;
  const order = plan.steps.map((s) => s.key);
  log(order.indexOf('students') > order.indexOf('classes') && order.indexOf('guardians') > order.indexOf('students'), 'the sheets are ordered by what depends on what');

  const wtpl = await bin('/dataio/whole-school/template', A);
  const wwb = await load(wtpl.buf);
  log(wtpl.status === 200 && wwb.worksheets[0].name === 'Start here', 'the whole-school workbook opens with a front page');
  log(wwb.worksheets.length === order.length + 1, 'it holds one sheet for each part');

  const fill = (name, list) => {
    const ws = wwb.getWorksheet(name);
    const hs = (ws.getRow(1).values || []).slice(1).map(String);
    ws.spliceRows(2, 1);
    for (const r of list) ws.addRow(hs.map((h) => (r[h] === undefined ? '' : r[h])));
  };
  fill('Teachers', [{ 'Full name': 'Smoke Teacher', Email: 'smoke.teacher@example.com', Mobile: '03001112233' }]);
  fill('Classes', [{ Class: '88', Section: 'S', Seats: 30, 'Head teacher email': 'smoke.teacher@example.com' }]);
  fill('Students', [{ 'Full name': 'Smoke Whole Child', 'Admission number': 'SMK-W1', Class: '88', Section: 'S', Gender: 'Female', 'Date of birth': '2014-01-01' }]);
  fill('Guardians', [{ 'Full name': 'Smoke Whole Parent', Email: 'smoke.whole@example.com', Relationship: 'Father', 'Children (admission numbers)': 'SMK-W1' }]);
  const filled = Buffer.from(await wwb.xlsx.writeBuffer());

  const wpv = await form('/dataio/whole-school/preview', A, filled);
  const sheets = Object.fromEntries(wpv.data.sheets.map((s) => [s.key, s]));
  log(wpv.status === 200 && sheets.students.summary.create === 1, 'a child is read even though the class is only on another sheet of the same file');
  log((sheets.students.rows[0].warnings || []).some((w) => /same file/i.test(w)), 'and it says the class is coming from this file');
  log(sheets.classes.summary.create === 1, 'the class is read even though its head teacher is only on another sheet');

  let made = 0; let refused = 0;
  for (const step of plan.steps) {
    const sheet = sheets[step.key];
    if (!sheet || !sheet.rows.length) continue;
    const todo = sheet.rows.filter((r) => r.state === 'create');
    if (!todo.length) continue;
    const r = await commit(step.key, todo);
    made += r.data.tally.created; refused += r.data.tally.failed;
  }
  log(made === 4 && refused === 0, `the whole workbook is written in order (${made} records, ${refused} refused)`);

  const cls = (await call('GET', '/classes?limit=1000', A)).data.classes || [];
  const made88 = cls.find((c) => String(c.standard) === '88' && c.division === 'S');
  log(!!made88 && !!made88.classTeacherId, 'the class was linked to the teacher from the same workbook');
  const kids = (await call('GET', '/students?limit=1000', A)).data.students || [];
  const kid = kids.find((s) => s.admissionNumber === 'SMK-W1');
  log(!!kid && String(kid.classId?._id || kid.classId) === String(made88 && made88._id), 'the child sits in the class from the same workbook');

  const notOurs = await form('/dataio/whole-school/preview', A, await book('Random', ['a', 'b'], [[1, 2]]));
  log(notOurs.status === 422, 'a workbook that is not ours is turned away');
};
