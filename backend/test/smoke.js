/**
 * End-to-end smoke test on an in-process PostgreSQL (PGlite): boots the real Express app, seeds the demo school
 * and exercises every role. Run:  node test/smoke.js
 */
process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite:memory';
process.env.SEED_DEMO = 'true';
process.env.JWT_SECRET = 'test-secret'; process.env.JWT_REFRESH_SECRET = 'test-refresh';
process.env.SUPERADMIN_EMAIL = 'owner@test.local'; process.env.SUPERADMIN_PASSWORD = 'Super@12345';
const fs = require('fs'); const path = require('path'); const http = require('http');

const app = require('../server');
let base; let failures = 0; let checks = 0;
const log = (ok, msg) => { checks++; if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

async function call(method, url, token, body, extra) {
  const res = await fetch(base + '/api' + url, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, data };
}
const expect = async (label, p, okStatuses = [200, 201]) => {
  const r = await p;
  const ok = okStatuses.includes(r.status);
  log(ok, `${label} -> ${r.status}${ok ? '' : ' ' + JSON.stringify(r.data).slice(0, 220)}`);
  return r;
};

(async () => {
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  // wait for boot + seed (first request is gated until ready)
  await call('GET', '/schools/branding');

  const login = async (email, password) => {
    const r = await call('POST', '/auth/login', null, { email, password, schoolCode: 'DEMO01' });
    return r.data && (r.data.token || r.data.accessToken);
  };
  const tokens = {
    admin: await login('admin@demo.school', 'Demo@1234'),
    teacher: await login('sara.khan@demo.school', 'Teacher@123'),
    student: await login('ayesha.khan@demo.school', 'Student@123'),
    parent: await login('parent@demo.school', 'Parent@123'),
  };
  for (const [k, v] of Object.entries(tokens)) log(!!v, `login as ${k}`);
  const sa = await call('POST', '/superadmin/login', null, { email: 'owner@test.local', password: 'Super@12345' });
  tokens.superadmin = sa.data && (sa.data.token || sa.data.accessToken); log(!!tokens.superadmin, 'login as superadmin');
  const bad = await call('POST', '/auth/login', null, { email: 'admin@demo.school', password: 'nope', schoolCode: 'demo01' });
  log(bad.status === 401 || bad.status === 400, `wrong password rejected -> ${bad.status}`);
  const ci = await call('POST', '/auth/login', null, { email: 'ADMIN@demo.school', password: 'Demo@1234', schoolCode: 'demo01' });
  log(ci.status === 200, `login with lower-case school code + upper-case email -> ${ci.status}`);

  // ---- every parameter-less GET route, per role: nothing may answer 500
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const files = {}; for (const m of serverSrc.matchAll(/const (\w+) = require\('\.\/routes\/([^']+)'\)/g)) files[m[1]] = m[2];
  const mounts = []; for (const m of serverSrc.matchAll(/app\.use\('([^']+)',\s*(?:gate\([^)]*\),\s*)?(\w+)\)/g)) if (files[m[2]]) mounts.push([m[1], files[m[2]]]);
  const gets = [];
  for (const [mount, file] of mounts) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', file + '.js'), 'utf8');
    for (const m of src.matchAll(/router\.get\('([^']*)'/g)) if (!m[1].includes(':')) gets.push((mount.replace('/api', '') + (m[1] === '/' ? '' : m[1])) || '/');
  }
  let n500 = 0;
  for (const role of Object.keys(tokens)) {
    for (const u of [...new Set(gets)]) {
      const r = await call('GET', u, tokens[role]);
      if (r.status >= 500) { n500++; log(false, `GET ${u} as ${role} -> ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`); }
    }
  }
  log(n500 === 0, `no 5xx on ${new Set(gets).size} parameter-less GET routes x ${Object.keys(tokens).length} roles`);

  // ---- data shape checks
  const A = tokens.admin;
  const classes = (await expect('admin classes', call('GET', '/classes', A))).data;
  const cl = classes.classes || classes.data || classes; log(Array.isArray(cl) && cl.length >= 2, `classes returned (${Array.isArray(cl) ? cl.length : '?'})`);
  const studentsRes = (await expect('admin students', call('GET', '/students?limit=1000', A))).data;
  const students = studentsRes.students || studentsRes.data || studentsRes; log(Array.isArray(students) && students.length >= 12, `students returned (${Array.isArray(students) ? students.length : '?'})`);
  log(!students[0].password, 'student password never leaks');
  log(students[0].classId && typeof students[0].classId === 'object' && students[0].classId.standard !== undefined, 'student.classId populated');
  const s0 = students.find((s) => s.name === 'Ayesha Khan');
  await expect('student by id', call('GET', `/students/${s0._id}`, A));
  await expect('student attendance', call('GET', `/students/${s0._id}/attendance`, A));
  const ov = (await expect('daily-attendance overview', call('GET', '/daily-attendance/overview', A))).data; log(!!ov, 'overview returned');
  const classId = (cl[0]._id);
  await expect('class students', call('GET', `/classes/${classId}/students`, A));
  await expect('daily attendance for class', call('GET', `/daily-attendance/class/${classId}`, A));
  const fo = (await expect('fees overview', call('GET', '/fees/overview', A))).data; console.log('   fees overview:', JSON.stringify(fo).slice(0, 200));
  const proofs = (await expect('fee proofs', call('GET', '/fees/proofs', A))).data;
  const pl = proofs.proofs || proofs; log(Array.isArray(pl) && pl.length >= 1, `pending payment proof listed (${Array.isArray(pl) ? pl.length : '?'})`);

  // ---- admin CRUD + validation + uniqueness
  const dupe = await call('POST', '/students', A, { name: 'Dup', email: 'ayesha.khan@demo.school', password: 'Student@123', rollNumber: '99', classId });
  log([400, 409].includes(dupe.status), `duplicate student e-mail rejected -> ${dupe.status} ${JSON.stringify(dupe.data).slice(0, 120)}`);
  const sub = await expect('create subject', call('POST', '/subjects', A, { name: 'Smoke Subject', code: 'SMK1', classId }));
  const subj = sub.data.subject || sub.data;
  if (subj && subj._id) {
    await expect('update subject', call('PUT', `/subjects/${subj._id}`, A, { name: 'Smoke Subject 2' }));
    await expect('delete subject', call('DELETE', `/subjects/${subj._id}`, A));
  }
  const notice = await expect('create notice', call('POST', '/notices', A, { title: 'Smoke notice', content: 'See https://example.com now', targetAudience: 'All' }));
  const T = tokens.teacher, S = tokens.student, P = tokens.parent;
  const pn = (await expect('parent notices', call('GET', '/notices/user/notices?limit=50', P))).data;
  const pnl = pn.notices || pn; log(Array.isArray(pnl) && pnl.some((x) => /Smoke notice/.test(x.title)), 'parent sees the new notice');

  // ---- notifications (bell)
  const nots = (await expect('parent notifications', call('GET', '/notifications', P))).data;
  const nl = nots.items || nots.notifications || nots; log(Array.isArray(nl) && nl.length >= 1, `parent has notifications (${Array.isArray(nl) ? nl.length : '?'})`);
  await expect('unread count', call('GET', '/notifications/unread-count', P));
  await expect('mark all read', call('PUT', '/notifications/read-all', P));
  const key = (await expect('push key', call('GET', '/notifications/push/key', P))).data; log(!!(key && (key.publicKey || key.key)), 'VAPID public key issued');

  const uploadFile = async (tok, purpose) => {
    const f = new FormData(); f.append('file', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], { type: 'image/png' }), 'x.png');
    const r = await fetch(base + '/api/upload?purpose=' + purpose, { method: 'POST', headers: { authorization: `Bearer ${tok}` }, body: f });
    const j = await r.json().catch(() => ({})); return { status: r.status, url: j.url, j };
  };
  // ---- profile editing for every role
  for (const [role, tok] of [['teacher', T], ['student', S], ['parent', P], ['admin', A]]) {
    const up = await call('PUT', '/profile/me', tok, { phone: '0300-1112223', extra: { about: `Hi from ${role}`, address: 'Street 1', city: 'Islamabad', emergencyName: 'Em', emergencyPhone: '0300-0000001' } });
    log(up.status === 200, `${role} updates own profile -> ${up.status} ${up.status === 200 ? '' : JSON.stringify(up.data).slice(0, 150)}`);
    const me = await call('GET', '/profile/me', tok);
    log(me.status === 200 && JSON.stringify(me.data).includes(`Hi from ${role}`), `${role} profile persisted`);
    const fu = await uploadFile(tok, 'profile'); log(fu.status === 200 && !!fu.url, `${role} uploads a profile file -> ${fu.status}`);
    const doc = await call('POST', '/profile/me/documents', tok, { title: 'Test doc', category: 'Certificate', url: fu.url, fileName: 't.pdf' });
    log([200, 201].includes(doc.status), `${role} adds a document -> ${doc.status} ${[200,201].includes(doc.status) ? '' : JSON.stringify(doc.data).slice(0, 150)}`);
    const me2 = (await call('GET', '/profile/me', tok)).data; const docs = me2.profile.documents || [];
    log(docs.length >= 1, `${role} sees ${docs.length} document(s)`);
    if (docs[0]) { const del = await call('DELETE', `/profile/me/documents/${docs[0]._id}`, tok); log(del.status === 200, `${role} deletes document -> ${del.status}`); }
  }

  // ---- upload + stored file round trip (BYTEA)
  const form = new FormData(); form.append('file', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], { type: 'image/png' }), 'x.png');
  const up = await fetch(base + '/api/upload?purpose=payment', { method: 'POST', headers: { authorization: `Bearer ${S}` }, body: form });
  const upj = await up.json().catch(() => ({})); log(up.status === 200 || up.status === 201, `student uploads a screenshot -> ${up.status} ${JSON.stringify(upj).slice(0, 160)}`);
  if (upj.url) {
    const f = await fetch(upj.url.startsWith('http') ? upj.url : base + upj.url); const buf = Buffer.from(await f.arrayBuffer());
    log(f.status === 200 && buf.length === 16 && buf[1] === 0x50, `stored file served back intact (${buf.length} bytes) -> ${f.status}`);
  }

  // ---- payment proof flow: student submits, admin approves
  const feeSum = (await expect('student fee summary', call('GET', '/fees/summary', S, undefined), [200, 404])).data;
  // ---- fee payment flow: parent submits a screenshot for a child, admin approves, status flips to Paid
  const kids = (await expect('parent children', call('GET', '/parents/me/children', P))).data; const kl = kids.children || kids;
  log(Array.isArray(kl) && kl.length === 2, `parent has 2 children (${Array.isArray(kl) ? kl.length : '?'})`);
  const kid = kl.find((k) => k.name === 'Usman Ali') || kl[1];
  const sum0 = (await expect('child fee summary', call('GET', `/fees/summary/${kid._id}`, P))).data;
  const items0 = sum0.items || []; log(items0.length > 0, `child has ${items0.length} fee items`);
  const pick = items0.find((i) => i.status === 'Unpaid');
  if (pick) {
    const shot = await uploadFile(P, 'payment');
    const sub = await expect('parent submits proof', call('POST', '/fees/proofs', P, { studentId: kid._id, itemKeys: [pick.key], method: 'JazzCash', reference: 'TX123', screenshotUrl: shot.url }));
    const again = await call('POST', '/fees/proofs', P, { studentId: kid._id, itemKeys: [pick.key], method: 'JazzCash', screenshotUrl: shot.url });
    log(again.status === 400, `same fee cannot be submitted twice -> ${again.status}`);
    const pid = (sub.data.proof || {})._id;
    const sum1 = (await call('GET', `/fees/summary/${kid._id}`, P)).data; log((sum1.items.find((i) => i.key === pick.key) || {}).status === 'Under review', 'fee shows Under review');
    const rev = await expect('admin approves', call('PUT', `/fees/proofs/${pid}/review`, A, { action: 'approve' }));
    const sum2 = (await call('GET', `/fees/summary/${kid._id}`, P)).data; log((sum2.items.find((i) => i.key === pick.key) || {}).status === 'Paid', 'fee shows Paid after approval');
    const kn = (await call('GET', '/notifications', P)).data; log(JSON.stringify(kn.items || []).includes('Payment'), 'parent notified about the payment decision');
  }
  const ch = await expect('admin creates a fee charge', call('POST', '/fees/charges', A, { title: 'Smoke trip', type: 'Other', amount: 1500, target: { mode: 'standard', standard: '8' } }));
  const route = await expect('create transport route', call('POST', '/fees/transport/routes', A, { name: 'Smoke Route', monthlyFee: 4000 }));
  const rid = (route.data.route || route.data)._id;
  if (rid) { await expect('update route', call('PUT', `/fees/transport/routes/${rid}`, A, { name: 'Smoke Route', monthlyFee: 4500 })); await expect('assign student to route', call('POST', '/fees/transport/assign', A, { studentId: s0._id, routeId: rid, pickupPoint: 'Gate 1' })); await expect('generate monthly transport fee', call('POST', '/fees/transport/generate', A, { month: '2026-12' })); await expect('delete route', call('DELETE', `/fees/transport/routes/${rid}`, A), [200, 400]); }
  // ---- attendance marking (head master) + messages + complaints + events + homework
  const today = new Date().toISOString().slice(0, 10);
  const studs = (await call('GET', `/classes/${classId}/students`, A)).data; const sl = studs.students || studs;
  const mark = await call('POST', `/daily-attendance/class/${classId}`, A, { date: today, records: sl.map((s, i) => ({ studentId: s._id, status: i === 0 ? 'Absent' : 'Present' })) });
  log([200, 201].includes(mark.status), `admin marks the day's attendance -> ${mark.status} ${[200, 201].includes(mark.status) ? '' : JSON.stringify(mark.data).slice(0, 160)}`);
  const msg = await call('POST', '/messages', A, { recipientId: s0._id, subject: 'Hello', message: 'Hi there' });
  log([200, 201].includes(msg.status), `admin sends a message -> ${msg.status} ${[200, 201].includes(msg.status) ? '' : JSON.stringify(msg.data).slice(0, 160)}`);
  const ev = await call('POST', '/events', A, { name: 'Smoke event', eventType: 'Other', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 3600e3).toISOString(), description: 'x' });
  console.log('   create event ->', ev.status, JSON.stringify(ev.data).slice(0, 140));
  const cp = await call('POST', '/complaints', S, { title: 'Smoke complaint', description: 'Test', category: 'Other' });
  console.log('   create complaint ->', cp.status, JSON.stringify(cp.data).slice(0, 140));
  const subs = (await call('GET', '/subjects', A)).data; const subList = subs.subjects || subs; const c0 = cl[0];
  const hw = await call('POST', '/homework', T, { classStandard: c0.standard, classDivision: c0.division, subjectId: subList[0] && subList[0]._id, subjectName: subList[0] && subList[0].name, title: 'Smoke HW', description: 'Do it', dueDate: new Date(Date.now() + 86400e3).toISOString() });
  console.log('   create homework ->', hw.status, JSON.stringify(hw.data).slice(0, 140));
  // ---- core admin CRUD: teacher / student / parent / class / exam / marks / timetable
  const tch = await call('POST', '/teachers', A, { name: 'Smoke Teacher', email: 'smoke.teacher@demo.school', password: 'Teacher@123', phone: '0300-1', employeeId: 'EMP-SMK' });
  log(tch.status === 201, `create teacher -> ${tch.status} ${tch.status === 201 ? '' : JSON.stringify(tch.data).slice(0, 200)}`);
  const tid = (tch.data.teacher || tch.data)._id;
  if (tid) {
    await expect('update teacher', call('PUT', `/teachers/${tid}`, A, { phone: '0300-9' }));
    const subs2 = (await call('GET', '/subjects', A)).data; const sl2 = subs2.subjects || subs2;
    await expect('assign teacher class', call('POST', `/teachers/${tid}/assign-class`, A, { classId, subjectId: sl2[0] && sl2[0]._id }), [200, 201, 400]);
    await expect('head master', call('PUT', `/classes/${classId}/head-master`, A, { teacherId: tid }));
    await expect('head master cleared', call('PUT', `/classes/${classId}/head-master`, A, { teacherId: null }));
    await expect('delete teacher', call('DELETE', `/teachers/${tid}`, A));
  }
  const stu = await call('POST', '/students', A, { name: 'Smoke Student', email: 'smoke.student@demo.school', password: 'Student@123', phone: '0300-2', rollNumber: '77', classId, fatherName: 'F', motherName: 'M' });
  log(stu.status === 201, `create student -> ${stu.status} ${stu.status === 201 ? '' : JSON.stringify(stu.data).slice(0, 200)}`);
  const sid = (stu.data.student || stu.data)._id;
  if (sid) {
    await expect('update student', call('PUT', `/students/${sid}`, A, { phone: '0300-3' }));
    await expect('update student with Pakistan fields', call('PUT', `/students/${sid}`, A, { cnicNumber: '35202-1234567-1', province: 'Punjab', postalCode: '54000', motherTongue: 'Punjabi', documents: { cnicCopy: 'https://example.com/cnic.pdf' } }));
    const pk = (await call('GET', `/students/${sid}`, A)).data; const pks = pk.student || pk;
    log(pks.cnicNumber === '35202-1234567-1' && pks.province === 'Punjab' && pks.postalCode === '54000' && pks.motherTongue === 'Punjabi', `Pakistan fields saved (CNIC/B-Form, province, postal code, mother tongue)`);
    log(pks.nationality === 'Pakistani' && pks.country === 'Pakistan', `defaults are Pakistani / Pakistan (${pks.nationality} / ${pks.country})`);
    log(pks.documents && pks.documents.cnicCopy === 'https://example.com/cnic.pdf', 'CNIC copy document saved');
    const other = cl.find((c) => String(c._id) !== String(classId));
    if (other) await expect('promote student', call('POST', `/students/${sid}/promote`, A, { newClassId: other._id }));
    await expect('delete student', call('DELETE', `/students/${sid}`, A));
  }
  const par = await call('POST', '/parents', A, { name: 'Smoke Parent', email: 'smoke.parent@demo.school', password: 'Parent@123', phone: '0300-4', children: [s0._id] });
  log([200, 201].includes(par.status), `create parent -> ${par.status} ${[200, 201].includes(par.status) ? '' : JSON.stringify(par.data).slice(0, 200)}`);
  const pid2 = (par.data.parent || par.data)._id;
  if (pid2) { await expect('update parent', call('PUT', `/parents/${pid2}`, A, { phone: '0300-5' })); await expect('delete parent', call('DELETE', `/parents/${pid2}`, A)); }
  const cls2 = await call('POST', '/classes', A, { standard: '10', division: 'A', capacity: 40 }); log([200, 201].includes(cls2.status), `create class -> ${cls2.status} ${[200, 201].includes(cls2.status) ? '' : JSON.stringify(cls2.data).slice(0, 160)}`);
  const cid2 = (cls2.data.class || cls2.data)._id; if (cid2) await expect('delete class', call('DELETE', `/classes/${cid2}`, A));
  const subs3 = (await call('GET', '/subjects', A)).data; const sl3 = subs3.subjects || subs3;
  const exam = await call('POST', '/marks/exams', A, { name: 'Smoke exam', classId, subjectId: sl3[0] && sl3[0]._id, date: new Date().toISOString(), totalMarks: 100, passingMarks: 35 });
  log([200, 201].includes(exam.status), `create exam -> ${exam.status} ${[200, 201].includes(exam.status) ? '' : JSON.stringify(exam.data).slice(0, 200)}`);
  const exid = (exam.data.exam || exam.data)._id;
  if (exid) {
    const mk = await call('POST', '/marks/enter', A, { examId: exid, studentId: s0._id, subjectId: sl3[0] && sl3[0]._id, marks: 80, outOfMarks: 100, passStatus: 'Pass', remarks: 'ok' });
    log([200, 201].includes(mk.status), `enter marks -> ${mk.status} ${[200, 201].includes(mk.status) ? '' : JSON.stringify(mk.data).slice(0, 200)}`);
    await expect('exam results', call('GET', `/marks/exam/${exid}`, A));
    await expect('student marks', call('GET', `/marks/student/${s0._id}`, A));
    await expect('toppers', call('GET', '/marks/toppers', A));
    await expect('delete exam', call('DELETE', `/marks/exams/${exid}`, A));
  }
  await expect('timetable config', call('POST', '/timetables/config', A, { periodsPerDay: 6, periodDuration: 40, startTime: '08:00', breakAfterPeriod: 3, breakDuration: 20 }), [200, 201, 400]);
  await expect('timetable generate', call('POST', '/timetables/generate', A, { standards: ['8'] }), [200, 201, 400]);
  await expect('timetable for class', call('GET', `/timetables/class/${classId}`, A), [200, 404]);
  // ---- edit a single timetable period (admin) incl. teacher-clash protection
  {
    const tl = (await call('GET', '/teachers', A)).data; const tlist = tl.teachers || tl;
    const cls = (await call('GET', '/classes', A)).data; const clist = cls.classes || cls;
    const subj = sl3[0] && sl3[0]._id; const tch0 = tlist[0] && tlist[0]._id;
    const slot = { dayOfWeek: 'Monday', startTime: '15:00', endTime: '15:40' };
    await expect('edit slot: bad day rejected', call('PUT', `/timetables/class/${classId}/slot`, A, { ...slot, dayOfWeek: 'Funday', subjectId: subj, teacherId: tch0 }), [400]);
    await expect('edit slot: teacher role forbidden', call('PUT', `/timetables/class/${classId}/slot`, tokens.teacher, { ...slot, subjectId: subj, teacherId: tch0 }), [403]);
    await expect('edit slot: needs subject+teacher', call('PUT', `/timetables/class/${classId}/slot`, A, { ...slot }), [400]);
    const set1 = await expect('edit slot: set period', call('PUT', `/timetables/class/${classId}/slot`, A, { ...slot, subjectId: subj, teacherId: tch0 }));
    const tt1 = set1.data.timetable; const got = tt1 && (tt1.slots || []).find(x => x.startTime === '15:00');
    log(!!got && (got.subjectId._id || got.subjectId) === subj, 'edit slot: period saved with subject');
    const other = clist.find(c => c._id !== classId);
    if (other) {
      await expect('edit slot: same teacher, other class -> clash', call('PUT', `/timetables/class/${other._id}/slot`, A, { ...slot, startTime: '15:20', endTime: '16:00', subjectId: subj, teacherId: tch0 }), [409]);
      await expect('edit slot: clash overridden with force', call('PUT', `/timetables/class/${other._id}/slot`, A, { ...slot, startTime: '15:20', endTime: '16:00', subjectId: subj, teacherId: tch0, force: true }));
      await expect('edit slot: clear other class period', call('PUT', `/timetables/class/${other._id}/slot`, A, { ...slot, startTime: '15:20', endTime: '16:00', clear: true }));
    }
    const upd = await expect('edit slot: change period again', call('PUT', `/timetables/class/${classId}/slot`, A, { ...slot, subjectId: subj, teacherId: tch0, room: 'Room 5' }));
    log(((upd.data.timetable.slots || []).filter(x => x.startTime === '15:00').length) === 1, 'edit slot: editing replaces, never duplicates');
    const clr = await expect('edit slot: clear period', call('PUT', `/timetables/class/${classId}/slot`, A, { ...slot, clear: true }));
    log(!(clr.data.timetable.slots || []).some(x => x.startTime === '15:00'), 'edit slot: period removed after clear');
    const brk = (await call('GET', `/timetables/class/${classId}`, A)).data.timetables || [];
    const bslot = brk.flatMap(t => (t.slots || []).map(x => ({ ...x, day: t.dayOfWeek }))).find(x => x.isBreak);
    if (bslot) await expect('edit slot: break cannot be edited', call('PUT', `/timetables/class/${classId}/slot`, A, { dayOfWeek: bslot.day, startTime: bslot.startTime, endTime: bslot.endTime, subjectId: subj, teacherId: tch0 }), [400]);
  }
  const cmp = (await call('GET', '/complaints', A)).data; const cmpl = cmp.complaints || cmp;
  if (Array.isArray(cmpl) && cmpl[0]) { await expect('complaint comment', call('POST', `/complaints/${cmpl[0]._id}/comment`, A, { text: 'checking', message: 'checking', comment: 'checking' }), [200, 201, 400]); await expect('complaint resolve', call('POST', `/complaints/${cmpl[0]._id}/resolve`, A, { resolution: 'done', note: 'done' }), [200, 201, 400]); }
  // ---- super admin
  const SA = tokens.superadmin;
  const st = (await expect('superadmin stats', call('GET', '/superadmin/stats', SA))).data; console.log('   stats:', JSON.stringify(st).slice(0, 220));
  const offers = (await expect('offers list', call('GET', '/superadmin/offers', SA))).data; log(JSON.stringify(offers).includes('ADMIT25'), 'demo offer ADMIT25 present');
  const newOffer = await expect('create offer', call('POST', '/superadmin/offers', SA, { title: 'Smoke offer', code: 'SMOKE10', discountType: 'percent', discountValue: 10, planSlugs: [], isActive: true }));
  const oid = (newOffer.data.offer || newOffer.data)._id;
  if (oid) { await expect('edit offer', call('PUT', `/superadmin/offers/${oid}`, SA, { discountValue: 15 })); await expect('delete offer', call('DELETE', `/superadmin/offers/${oid}`, SA)); }
  const plans = (await expect('plans list', call('GET', '/superadmin/plans', SA))).data; const pls = Object.values(plans.plans || {}); log(pls.length >= 3, `plans listed (${pls.length})`);
  log(pls[0] && pls[0].features && typeof pls[0].features === 'object' && !Array.isArray(pls[0].features) && Object.keys(pls[0].features).length > 3, 'plan.features serialised as an object');
  const np = await expect('create plan', call('POST', '/superadmin/plans', SA, { slug: 'smoke', label: 'Smoke', pricePKR: 1000, features: { fees: true } }));
  await expect('edit plan', call('PUT', '/superadmin/plans/smoke', SA, { pricePKR: 1200, label: 'Smoke' }));
  await expect('delete plan', call('DELETE', '/superadmin/plans/smoke', SA));
  const schools = (await expect('schools list', call('GET', '/superadmin/schools', SA))).data;
  // ---- backups
  const JSZip = require('jszip');
  const getZip = async (url, token) => {
    const r = await fetch(base + '/api' + url, { headers: { authorization: `Bearer ${token}` } });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get('content-type'), buf };
  };
  const bl0 = await expect('backups list (admin)', call('GET', '/backup', A)); log(Array.isArray(bl0.data.backups), 'backups list is an array');
  await expect('teacher cannot list backups', call('GET', '/backup', tokens.teacher), [403]);
  await expect('student cannot download backup', call('GET', '/backup/download', tokens.student), [403]);
  await expect('unauthenticated backup refused', call('GET', '/backup'), [401]);
  const mk1 = await expect('create manual backup', call('POST', '/backup', A, {}), [201]);
  const bid = mk1.data.backup && mk1.data.backup._id; log(!!bid, 'backup has an id');
  log(mk1.data.backup && mk1.data.backup.counts && mk1.data.backup.counts.Student > 0, `backup counts include students (${mk1.data.backup && mk1.data.backup.counts && mk1.data.backup.counts.Student})`);
  const bl1 = (await call('GET', '/backup', A)).data; log(bl1.backups.length === 1 && bl1.backups[0].size > 0 && !('data' in bl1.backups[0]), 'list shows 1 backup without its data blob');
  const z1 = await getZip('/backup/download', A);
  log(z1.status === 200 && /zip/.test(z1.type || ''), `full download is a zip (${z1.status}, ${z1.buf.length} bytes)`);
  const zz = await JSZip.loadAsync(z1.buf);
  log(!!zz.file('backup.json') && !!zz.file('school-data.xlsx') && !!zz.file('README.txt'), 'zip contains backup.json, school-data.xlsx, README.txt');
  const bj = await zz.file('backup.json').async('string'); const bobj = JSON.parse(bj);
  log(bobj.format === 'aulensia-backup' && bobj.tables.Student.length > 0 && bobj.tables.Teacher.length > 0, 'backup.json has students and teachers');
  log(!/"password"/.test(bj) && !/\$2[aby]\$/.test(bj), 'downloaded backup contains no password hashes');
  const ExcelJS = require('exceljs'); const wbk = new ExcelJS.Workbook(); await wbk.xlsx.load(await zz.file('school-data.xlsx').async('nodebuffer'));
  log(wbk.getWorksheet('Student') && wbk.getWorksheet('Student').rowCount > 1, 'xlsx has a Student sheet with rows');
  log(Object.values(bobj.tables).every((rows) => rows.every((r) => !r.schoolId || String(r.schoolId) === String(bobj.school._id))), 'every row belongs to this school (tenant isolation)');
  const zf = await getZip('/backup/download?includeFiles=1', A); log(zf.status === 429 || zf.status === 200, `second download inside the cooldown is throttled or ok (${zf.status})`);
  const z2 = await getZip(`/backup/${bid}/download`, A); log(z2.status === 200 && /zip/.test(z2.type || ''), `stored backup downloads as zip (${z2.status})`);
  const sch = (schools.schools || schools)[0]; const bsid = sch && sch._id;
  await expect('owner lists school backups', call('GET', `/superadmin/schools/${bsid}/backups`, SA));
  await expect('owner creates backup', call('POST', `/superadmin/schools/${bsid}/backups`, SA, {}), [201, 429]);
  const z3 = await getZip(`/superadmin/schools/${bsid}/backups/${bid}/download`, SA); log(z3.status === 200, `owner downloads stored backup (${z3.status})`);
  await expect('admin cannot use owner routes', call('GET', `/superadmin/schools/${bsid}/backups`, A), [401, 403]);
  const pub = await fetch(base + '/api/public/plans'); const pubj = await pub.json();
  log(pub.status === 200 && Array.isArray(pubj.plans) && pubj.plans.length >= 1, `public plans endpoint works without login (${pubj.plans && pubj.plans.length} plans)`);
  log(pubj.plans.every((p) => p.slug && p.label && Array.isArray(p.features)) && !JSON.stringify(pubj).includes('"code"'), 'public plans expose no offer codes');
  await expect('cron without secret is unavailable', call('GET', '/cron/backup'), [503]);
  process.env.CRON_SECRET = 'cron-test-secret';
  const cr0 = await fetch(base + '/api/cron/backup', { headers: { authorization: 'Bearer wrong' } }); log(cr0.status === 401, `cron rejects wrong secret (${cr0.status})`);
  const cr1 = await fetch(base + '/api/cron/backup', { headers: { authorization: 'Bearer cron-test-secret' } }); const crj = await cr1.json();
  log(cr1.status === 200 && crj.backedUp >= 1, `cron runs weekly backups (${JSON.stringify(crj)})`);
  const cr2 = await (await fetch(base + '/api/cron/backup', { headers: { authorization: 'Bearer cron-test-secret' } })).json(); log(cr2.backedUp === 0, 'cron does not repeat a school backed up this week');
  const bl2 = (await call('GET', '/backup', A)).data; log(bl2.backups.some((b) => b.kind === 'auto') && bl2.backups.some((b) => b.kind === 'manual'), 'list has automatic and manual backups');
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 16000 * 0)); await require('../utils/backup').createSnapshot(bsid, { kind: 'manual' }); }
  const bl3 = (await call('GET', '/backup', A)).data; log(bl3.backups.filter((b) => b.kind === 'manual').length === 3, 'only the 3 newest manual backups are kept');
  await expect('delete a backup', call('DELETE', `/backup/${bl3.backups[0]._id}`, A));
  await expect('delete unknown backup', call('DELETE', '/backup/000000000000000000000000', A), [404]);

  await require('./billingChecks')({ call, expect, log, tokens, base });
  await require('./opsChecks')({ call, expect, log, tokens, base });
  await require('./guardianChecks')({ call, expect, log, tokens, base });
  await require('./permissionChecks')({ call, expect, log, tokens, base });
  await require('./admissionChecks')({ call, expect, log, tokens, base });
  await require('./financeChecks')({ call, expect, log, tokens, base });
  await require('./hrChecks')({ call, expect, log, tokens, base });
  await require('./attendanceChecks')({ call, expect, log, tokens, base });
  await require('./safetyChecks')({ call, expect, log, tokens, base });
  await require('./timetableChecks')({ call, expect, log, tokens, base });
  await require('./syncChecks')({ call, expect, log, tokens, base });
  await require('./studioChecks')({ call, expect, log, tokens, base });
  await require('./assessChecks')({ call, expect, log, tokens, base });
  await require('./omrChecks')({ call, expect, log, tokens, base });
  await require('./earlyChecks')({ call, expect, log, tokens, base });
  await require('./commsChecks')({ call, expect, log, tokens, base });
  for (const m of ['careChecks', 'careChecks2', 'careChecks3', 'themeChecks', 'salesChecks', 'migrationChecks', 'accessChecks', 'registrarChecks', 'trainingChecks', 'libraryChecks', 'procureChecks', 'transportChecks','accountsChecks','analyticsChecks','groupChecks','integrationChecks']) await require('./' + m)({ call, expect, log, tokens, base });

  console.log(`\n${checks - failures}/${checks} checks passed`);
  server.close(); process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Smoke crashed:', e); process.exit(2); });
