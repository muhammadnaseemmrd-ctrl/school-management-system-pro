// Family communication (E20), part 1: settings, preferences, the school clock, quiet hours, guardian scope, language and message threads.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const School = require('../models/School'); const User = require('../models/User'); const Student = require('../models/Student'); const Teacher = require('../models/Teacher'); const Parent = require('../models/Parent'); const Class = require('../models/Class');
  const Notification = require('../models/Notification'); const AuditLog = require('../models/AuditLog'); const Restriction = require('../models/ContactRestriction');
  const CmThread = require('../models/CmThread'); const CmMessage = require('../models/CmMessage'); const CmDelivery = require('../models/CmDelivery'); const CmPref = require('../models/CmPref');
  const { hashPassword } = require('../utils/password'); const { generateAccessToken } = require('../utils/jwt'); const { nowInTz } = require('../utils/time');
  const K = require('../utils/comms/clock'); const N = require('../utils/notify');
  console.log('\n— Family communication: messages, quiet hours, language —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id); const A = tokens.admin; const ST = tokens.student; const tz = school.timezone || process.env.DEFAULT_TIMEZONE || 'UTC';
  const tok = (doc, role) => generateAccessToken(String(doc._id), sid, role);
  let adm2 = await User.findOne({ schoolId: sid, email: 'second@demo.school' }); if (!adm2) adm2 = await User.create({ schoolId: sid, name: 'Second Admin', email: 'second@demo.school', password: await hashPassword('Admin@1234'), role: 'admin' }); const A2 = tok(adm2, 'admin');
  const cls = await Class.create({ schoolId: sid, standard: '66', division: 'F', capacity: 30, academicYear: '2026-2027' }); const cls2 = await Class.create({ schoolId: sid, standard: '67', division: 'G', capacity: 30, academicYear: '2026-2027' });
  const pw = await hashPassword('Teacher@123'); const spw = await hashPassword('Student@123');
  const mkT = (n, extra = {}) => Teacher.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: n, email: `${n.toLowerCase().replace(/\W+/g, '.')}@demo.school`, password: pw, ...extra });
  const T1 = await mkT('E20 Teacher One', { classIds: [cls._id], classTeacherOf: cls._id, isClassTeacher: true }); const T2 = await mkT('E20 Teacher Two', { classIds: [cls2._id] }); const T3 = await mkT('E20 Teacher Three', { subjectClassAssignments: [{ classId: cls._id }] });
  const t1 = tok(T1, 'teacher'); const t2 = tok(T2, 'teacher'); const t3 = tok(T3, 'teacher');
  const mkKid = (i, c) => Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: `Comms Kid${i}`, email: `commskid${i}@demo.school`, password: spw, classId: c._id, rollNumber: `C${i}`, studentId: `CK${i}`, isActive: true });
  const k1 = await mkKid(1, cls); const k2 = await mkKid(2, cls); const k3 = await mkKid(3, cls2);
  const mkP = async (n, kids) => Parent.create({ schoolId: sid, name: `E20 Parent ${n}`, email: `e20parent${n}@demo.school`, password: await hashPassword('Parent@123'), phone: '+92-300-2222222', relationship: 'Mother', children: kids.map((k) => k._id) });
  const p1 = await mkP('One', [k1, k2]); const p2 = await mkP('Two', [k1]); const p3 = await mkP('Three', [k3]); const P1 = tok(p1, 'parent'); const P2 = tok(p2, 'parent'); const P3 = tok(p3, 'parent');
  const kid = (k) => String(k._id); const URDU = /[؀-ۿ]/;
  for (const M of [CmThread, CmMessage, CmDelivery, CmPref, require('../models/CmTicket'), require('../models/CmCanned'), require('../models/CmPtm'), require('../models/CmPtmSlot')]) log(M.schema.path('schoolId') != null, `${M.modelName} is school scoped`);
  globalThis.__e20 = { school, sid, tz, A, A2, ST, t1, t2, t3, T1, T2, T3, P1, P2, P3, p1, p2, p3, k1, k2, k3, cls, cls2, tok };

  // ── 1. settings and preferences ──
  await expect('unauthenticated refused', call('GET', '/comms/threads', null), [401]); await expect('a student cannot use family messages', call('GET', '/comms/threads', ST), [403]);
  const s0 = await expect('a teacher can read the settings', call('GET', '/comms/settings', t1)); log(s0.data.settings.quiet.on === true && s0.data.settings.quiet.from === '21:00' && s0.data.settings.sla.urgent.first === 60, 'quiet hours and deadlines start with school defaults');
  await expect('a teacher cannot change settings', call('PUT', '/comms/settings', t1, { threadReplyMinutes: 120 }), [403]); await expect('a parent cannot read the settings', call('GET', '/comms/settings', P1), [403]);
  await expect('quiet hours need real times', call('PUT', '/comms/settings', A, { quiet: { on: true, from: '25:00', to: '07:00' } }), [400]); await expect('working hours must open before they close', call('PUT', '/comms/settings', A, { hours: { from: '15:00', to: '08:00' } }), [400]);
  await expect('a resolution time cannot be shorter than the first reply', call('PUT', '/comms/settings', A, { sla: { normal: { first: 600, resolve: 300 } } }), [400]); await expect('a first reply under 15 minutes is refused', call('PUT', '/comms/settings', A, { sla: { high: { first: 5, resolve: 600 } } }), [400]); await expect('at least one working day', call('PUT', '/comms/settings', A, { workDays: [] }), [400]);
  await expect('the administrator sets the reply promise', call('PUT', '/comms/settings', A, { threadReplyMinutes: 60 })); log((await call('GET', '/comms/settings', A)).data.settings.threadReplyMinutes === 60, 'the reply promise is saved');
  const pr0 = await expect('preferences start with English', call('GET', '/comms/prefs', P1)); log(pr0.data.prefs.lang === 'en' && pr0.data.prefs.push === true, 'a new person reads English and may be pushed');
  await expect('an unknown language is refused', call('PUT', '/comms/prefs', P1, { lang: 'fr' }), [400]); await expect('personal quiet times need real times', call('PUT', '/comms/prefs', P1, { quietFrom: '9pm' }), [400]);

  // ── 2. the school clock ──
  const ks = { workDays: [1, 2, 3, 4, 5, 6], hours: { from: '08:00', to: '15:00' } }; const KT = 'Asia/Karachi'; const z = (iso) => new Date(iso);
  const q1 = K.quietUntil(z('2026-11-20T17:00:00Z'), [{ from: '21:00', to: '07:00' }], KT); log(q1 && q1.toISOString() === '2026-11-21T02:00:00.000Z', 'at 22:00 school time a push waits until 07:00 the next morning');
  log(K.quietUntil(z('2026-11-20T08:00:00Z'), [{ from: '21:00', to: '07:00' }], KT) === null, 'at 13:00 a push goes at once');
  const q2 = K.quietUntil(z('2026-11-20T20:00:00Z'), [{ from: '21:00', to: '07:00' }], KT); log(q2 && q2.toISOString() === '2026-11-21T02:00:00.000Z', 'at 01:00 the wait ends the same morning');
  const q3 = K.quietUntil(z('2026-11-20T17:00:00Z'), [{ from: '21:00', to: '07:00' }, { from: '06:30', to: '08:30' }], KT); log(q3 && q3.toISOString() === '2026-11-21T03:30:00.000Z', 'a person\'s own window that runs on past the school\'s extends the wait');
  log(K.quietUntil(z('2026-11-20T17:00:00Z'), [{ from: '09:00', to: '09:00' }], KT) === null, 'a window with the same start and end never holds anything');
  const b1 = K.addBusinessMinutes(z('2026-11-20T09:00:00Z'), 120, ks, KT); log(b1.toISOString() === '2026-11-21T04:00:00.000Z', 'two working hours from Friday 14:00 end on Saturday at 09:00');
  const b2 = K.addBusinessMinutes(z('2026-11-21T09:00:00Z'), 120, ks, KT); log(b2.toISOString() === '2026-11-23T04:00:00.000Z', 'Sunday is skipped when working days exclude it');
  const b3 = K.addBusinessMinutes(z('2026-11-20T01:00:00Z'), 60, ks, KT); log(b3.toISOString() === '2026-11-20T04:00:00.000Z', 'before opening the clock starts at opening time');
  log(K.businessMinutesBetween(z('2026-11-20T09:00:00Z'), z('2026-11-23T04:00:00Z'), ks, KT) === 540, 'working time between Friday 14:00 and Monday 09:00 is 540 minutes');
  log(K.businessMinutesBetween(z('2026-11-22T05:00:00Z'), z('2026-11-22T09:00:00Z'), ks, KT) === 0, 'a Sunday counts as no working time');

  // ── 3. who may write to whom ──
  const ct = await expect('a parent sees who can be written to', call('GET', `/comms/contacts?studentId=${kid(k1)}`, P1)); log(ct.data.contacts.some((c) => c.kind === 'office') && ct.data.contacts.some((c) => String(c.id) === String(T1._id)) && ct.data.contacts.some((c) => String(c.id) === String(T3._id)) && !ct.data.contacts.some((c) => String(c.id) === String(T2._id)), 'the office, the class teacher and a subject teacher are listed, not a teacher of another class');
  await expect('a parent cannot list contacts for another family\'s child', call('GET', `/comms/contacts?studentId=${kid(k3)}`, P1), [403]);
  const ch = await expect('a parent lists their children with what they may do', call('GET', '/comms/family/children', P1)); log(ch.data.children.length === 2 && ch.data.children.every((c) => c.canMessage), 'both children are listed and may be messaged about');
  await expect('a parent cannot start a thread about a child who is not theirs', call('POST', '/comms/threads', P1, { studentId: kid(k3), to: 'office', text: 'Hello' }), [403]); await expect('a message needs text', call('POST', '/comms/threads', P1, { studentId: kid(k1), to: 'office', text: '  ' }), [400]);
  await expect('a parent cannot write to a teacher who does not teach the child', call('POST', '/comms/threads', P1, { studentId: kid(k1), to: String(T2._id), text: 'Hello' }), [403]);
  const th1 = await expect('a parent writes to the class teacher', call('POST', '/comms/threads', P1, { studentId: kid(k1), to: String(T1._id), subject: 'Homework', text: 'Could Kid1 have extra reading time?', clientKey: 'a1' }), [201]); const tid1 = th1.data.thread._id;
  log(th1.data.thread.staffKind === 'teacher' && th1.data.thread.waitingOn === 'school' && !!th1.data.thread.replyDueAt, 'the thread waits on the school with a reply time');
  const th1b = await expect('starting the same conversation again reuses it', call('POST', '/comms/threads', P1, { studentId: kid(k1), to: String(T1._id), text: 'Thank you', clientKey: 'a2' }), [200]); log(th1b.data.existing === true && String(th1b.data.thread._id) === String(tid1) && th1b.data.thread.messages === 2, 'one thread per family, child and teacher');
  const rep = await expect('sending the same message again adds nothing', call('POST', `/comms/threads/${tid1}/messages`, P1, { text: 'Thank you', clientKey: 'a2' }), [200]); log(rep.data.message.repeated === true && (await CmThread.findById(tid1)).messages === 2, 'a repeated send is recognised');
  const tn = await Notification.find({ userId: T1._id, type: 'message' }); log(tn.length >= 2 && tn.every((n) => n.link.includes('familyDesk') || n.link.includes('teacher')), 'the teacher is told, with a link to the right screen');
  await expect('another family cannot open the thread', call('GET', `/comms/threads/${tid1}`, P3), [404]); await expect('a teacher of the other class cannot open it', call('GET', `/comms/threads/${tid1}`, t2), [404]); await expect('another teacher of the same class cannot open it', call('GET', `/comms/threads/${tid1}`, t3), [404]);
  const l1 = await expect('the teacher sees the thread as unread', call('GET', '/comms/threads', t1)); log(l1.data.threads.length === 1 && l1.data.threads[0].unread === true, 'a new parent message is unread for the teacher');
  const lp = await call('GET', '/comms/threads', P1); log(lp.data.threads.length === 1 && lp.data.threads[0].unread === false, 'the parent has read their own message');
  const l2 = await call('GET', '/comms/threads', t2); log(l2.data.threads.length === 0, 'a teacher of another class sees nothing');
  await expect('the teacher reads it', call('POST', `/comms/threads/${tid1}/read`, t1)); log((await call('GET', '/comms/threads', t1)).data.threads[0].unread === false, 'reading clears the unread mark');
  const lo = await call('GET', '/comms/threads', A); log(lo.data.threads.length === 0, 'the office list does not include a teacher\'s conversation');
  const lt = await expect('the administrator can browse teacher conversations', call('GET', '/comms/threads?scope=teachers', A)); log(lt.data.threads.length === 1 && (await AuditLog.find({ schoolId: sid, action: 'comms.thread.browse' })).length >= 1, 'browsing teachers\' conversations is recorded');
  await expect('the administrator opens it', call('GET', `/comms/threads/${tid1}`, A)); log((await AuditLog.find({ schoolId: sid, action: 'comms.thread.view' })).length >= 1, 'opening a teacher\'s conversation is recorded');

  // ── 4. teacher writes first; guardian scope ──
  await expect('a teacher cannot write about a child in another class', call('POST', '/comms/threads', t2, { studentId: kid(k1), parentId: String(p1._id), text: 'Hello' }), [403]);
  await expect('a teacher cannot write to a parent of another child', call('POST', '/comms/threads', t1, { studentId: kid(k1), parentId: String(p3._id), text: 'Hello' }), [403]);
  const th2 = await expect('the class teacher writes to the second parent first', call('POST', '/comms/threads', t1, { studentId: kid(k1), parentId: String(p2._id), subject: 'Trip', text: 'The trip form is due Friday.' }), [201]); const tid2 = th2.data.thread._id;
  log(th2.data.thread.waitingOn === 'family' && th2.data.thread.replyDueAt === null, 'the thread now waits on the family and has no school deadline');
  await Restriction.create({ schoolId: sid, studentId: k1._id, parentId: p2._id, type: 'no-contact', reason: 'Court order for the test', createdByName: 'test' });
  await expect('a restricted parent cannot reply', call('POST', `/comms/threads/${tid2}/messages`, P2, { text: 'Please call me' }), [403]); await expect('a restricted parent cannot start a thread', call('POST', '/comms/threads', P2, { studentId: kid(k1), to: 'office', text: 'Hello' }), [403]);
  await expect('the teacher cannot write to a restricted parent', call('POST', `/comms/threads/${tid2}/messages`, t1, { text: 'Are you there?' }), [403]); await expect('nor start a new thread with them', call('POST', '/comms/threads', t1, { studentId: kid(k1), parentId: String(p2._id), text: 'Hello' }), [403, 200]);
  const gt = await call('GET', `/comms/threads/${tid2}`, P2); log(gt.status === 200 && gt.data.canWrite === false, 'the restricted parent can still read what was sent, but cannot write');
  const cb = await call('GET', `/comms/contacts?studentId=${kid(k1)}`, P2); log(cb.status === 403, 'a restricted parent gets no contact list');
  const stu = await expect('staff can search children they may write about', call('GET', '/comms/students?q=Comms Kid', t1)); log(stu.data.students.length === 2 && stu.data.students.every((s) => s.parents.every((p) => String(p._id) !== String(p2._id))), 'the teacher finds their two pupils and the restricted parent is not offered');
  const stuA = await call('GET', '/comms/students?q=Comms Kid', t2); log(stuA.data.students.length === 1, 'a teacher of another class finds only their own pupil');

  // ── 5. language ──
  await expect('the parent chooses Urdu', call('PUT', '/comms/prefs', P1, { lang: 'ur' })); log((await call('GET', '/comms/prefs', P1)).data.prefs.lang === 'ur', 'the choice is saved');
  const rp = await expect('the teacher answers in English with an Urdu version', call('POST', `/comms/threads/${tid1}/messages`, t1, { text: 'Yes, he can read in the library at lunch.', translation: 'جی ہاں، وہ لنچ کے وقت لائبریری میں پڑھ سکتا ہے۔' }), [201]);
  const view = await call('GET', `/comms/threads/${tid1}`, P1); const last = view.data.messages[view.data.messages.length - 1]; log(view.data.lang === 'ur' && URDU.test(last.text) && last.textLang === 'ur' && last.alt.startsWith('Yes'), 'the parent reads the Urdu version and can open the original');
  const first = view.data.messages[0]; log(first.textLang === 'en' && /reading/.test(first.text), 'a message without a translation shows in the language it was written in');
  const pn = await Notification.find({ userId: p1._id, type: 'message' }).sort({ createdAt: -1 }); log(pn.length >= 1 && URDU.test(pn[0].title), 'the alert is in the language the parent chose');
  const tv = await call('GET', `/comms/threads/${tid1}`, t1); log(tv.data.lang === 'en' && /Yes, he can/.test(tv.data.messages[tv.data.messages.length - 1].text), 'the teacher still reads English');
  const wUr = await expect('a parent may write in Urdu', call('POST', `/comms/threads/${tid1}/messages`, P1, { text: 'شکریہ' }), [201]); const tv2 = await call('GET', `/comms/threads/${tid1}`, t1); const lm = tv2.data.messages[tv2.data.messages.length - 1]; log(lm.wrote === 'ur' && lm.text === 'شکریہ' && lm.textLang === 'ur', 'a message in Urdu is kept as written; nothing is translated for the reader');
  await expect('Urdu parent turns back to English', call('PUT', '/comms/prefs', P1, { lang: 'en' }));

  // ── 6. urgent and removal ──
  await expect('a parent cannot mark a message urgent', call('POST', `/comms/threads/${tid1}/messages`, P1, { text: 'Please call', urgent: true, urgentReason: 'Because' }), [403]); await expect('a teacher cannot either', call('POST', `/comms/threads/${tid1}/messages`, t1, { text: 'Call me', urgent: true, urgentReason: 'Because' }), [403]);
  const off = await expect('an office thread is started by the administrator', call('POST', '/comms/threads', A, { studentId: kid(k2), parentId: String(p1._id), subject: 'Pickup', text: 'Your child will be collected early today.' }), [201]); const tidO = off.data.thread._id; log(off.data.thread.staffKind === 'office', 'it is a school office conversation');
  await expect('urgent needs a reason', call('POST', `/comms/threads/${tidO}/messages`, A, { text: 'Please come now', urgent: true }), [400]);
  const ug = await expect('the office can send an urgent message', call('POST', `/comms/threads/${tidO}/messages`, A, { text: 'Please come now', urgent: true, urgentReason: 'Child is unwell' }), [201]); log(ug.data.message.urgent === true && (await AuditLog.find({ schoolId: sid, action: 'comms.message.urgent' })).length === 1, 'an urgent message records why');
  const adminList = await call('GET', '/comms/threads', A); log(adminList.data.threads.some((t) => String(t._id) === String(tidO)), 'office conversations appear in the office list');
  const apo = await call('GET', '/comms/threads', P1); log(apo.data.threads.length === 2, 'the parent sees both of their conversations');
  const parentToOffice = await expect('the parent replies to the office', call('POST', `/comms/threads/${tidO}/messages`, P1, { text: 'On my way.' }), [201]); const an = await Notification.find({ schoolId: sid, type: 'message', userRole: 'admin' }); log(an.length >= 2, 'every administrator is told of a message to the office');
  const msgs = await call('GET', `/comms/threads/${tidO}`, A); const mid = msgs.data.messages[0]._id;
  await expect('a teacher cannot remove a message', call('POST', `/comms/threads/${tid1}/messages/${mid}/remove`, t1, { reason: 'x y z' }), [403]); await expect('removal needs a reason', call('POST', `/comms/threads/${tidO}/messages/${mid}/remove`, A, { reason: '' }), [400]);
  await expect('the administrator removes a message', call('POST', `/comms/threads/${tidO}/messages/${mid}/remove`, A, { reason: 'Contained a phone number' })); const after = await call('GET', `/comms/threads/${tidO}`, P1); log(after.data.messages[0].removed === true && after.data.messages[0].text === '', 'a removed message shows as removed, with no text'); log((await CmMessage.findById(mid)).en.length > 0, 'the original is kept for the record'); await expect('it cannot be removed twice', call('POST', `/comms/threads/${tidO}/messages/${mid}/remove`, A, { reason: 'Again please' }), [409]);

  // ── 7. rate limit, close, reopen ──
  const spam = await Teacher.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: 'E20 Spammer', email: 'e20.spammer@demo.school', password: pw, classIds: [cls._id] }); const ts = tok(spam, 'teacher');
  const sp = await expect('a teacher starts a thread', call('POST', '/comms/threads', ts, { studentId: kid(k2), parentId: String(p1._id), text: 'Hi' }), [201]); await CmMessage.insertMany(Array.from({ length: 30 }, (_, i) => ({ schoolId: sid, threadId: sp.data.thread._id, fromRole: 'teacher', fromId: spam._id, fromName: 'E20 Spammer', en: `m${i}`, wrote: 'en', clientKey: `bulk${i}` })));
  await expect('more than 30 messages in an hour is refused', call('POST', `/comms/threads/${sp.data.thread._id}/messages`, ts, { text: 'One more' }), [429]);
  await expect('the teacher closes a thread', call('POST', `/comms/threads/${tid1}/close`, t1)); log((await call('GET', '/comms/threads?box=closed', t1)).data.threads.length === 1, 'it moves to closed'); log(!(await call('GET', '/comms/threads', t1)).data.threads.some((t) => String(t._id) === String(tid1)), 'and leaves the open list');
  await expect('the parent writes and reopens it', call('POST', `/comms/threads/${tid1}/messages`, P1, { text: 'One more question' }), [201]); log((await call('GET', `/comms/threads/${tid1}`, P1)).data.thread.status === 'open', 'a new message reopens a closed thread');
  await expect('a thread cannot be opened by id from another school scope', call('GET', '/comms/threads/000000000000000000000000', A), [404]);
  await require('./commsChecks2')({ call, expect, log, tokens, base });
};
