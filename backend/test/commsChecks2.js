// Family communication (E20), part 2: delivery attempts, quiet hours for every alert, retries, late replies and the overview.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const g = globalThis.__e20; const { sid, tz, A, t1, t2, P1, P3, p1, p3, k1, T1, tok } = g;
  const CmThread = require('../models/CmThread'); const CmMessage = require('../models/CmMessage'); const CmDelivery = require('../models/CmDelivery'); const CmPref = require('../models/CmPref'); const Notification = require('../models/Notification');
  const N = require('../utils/notify'); const { nowInTz } = require('../utils/time'); const oid = require('../lib/pgdoc').Types.ObjectId;
  console.log('\n— Family communication: delivery, quiet hours, sweep —');
  const hm = (m) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const around = () => { const m = nowInTz(tz).minutes; return { from: hm(m - 60), to: hm(m + 60) }; };
  const th = (await CmThread.find({ schoolId: sid, parentId: p1._id, staffKind: 'teacher' }))[0]; const tid = String(th._id); const off = (await CmThread.find({ schoolId: sid, parentId: p1._id, staffKind: 'office' }))[0]; const tidO = String(off._id);

  // ── quiet hours hold a push, never the in-app copy ──
  await expect('the school sets quiet hours that cover now', call('PUT', '/comms/settings', A, { quiet: { on: true, ...around() } }));
  const nBefore = await Notification.countDocuments({ userId: p1._id });
  const m1 = await expect('the teacher writes during quiet hours', call('POST', `/comms/threads/${tid}/messages`, t1, { text: 'A note for you.' }), [201]); const mid1 = m1.data.message._id;
  log((await Notification.countDocuments({ userId: p1._id })) === nBefore + 1, 'the in-app alert is saved at once');
  const d1 = await CmDelivery.find({ schoolId: sid, refId: mid1, recipientId: p1._id }); const inapp = d1.find((d) => d.channel === 'inapp'); const push = d1.find((d) => d.channel === 'push');
  log(inapp && inapp.state === 'sent', 'the in-app delivery is recorded as sent'); log(push && push.state === 'deferred' && push.deferUntil > new Date() && push.deferUntil < new Date(Date.now() + 61 * 60000), 'the push is held until the quiet hours end'); log(push.payload && push.payload.title && push.lang === 'en', 'the held push keeps its words and language');
  const dv = await expect('the administrator sees who was told and what happened', call('GET', `/comms/threads/${tid}/deliveries`, A)); log(dv.data.deliveries.some((d) => d.channel === 'push' && d.state === 'deferred') && dv.data.deliveries.some((d) => d.channel === 'inapp'), 'both attempts are listed'); await expect('a teacher cannot read delivery records', call('GET', `/comms/threads/${tid}/deliveries`, t1), [403]);
  const u1 = await expect('the office sends an urgent message', call('POST', `/comms/threads/${tidO}/messages`, A, { text: 'Please collect your child.', urgent: true, urgentReason: 'Fever' }), [201]); const du = await CmDelivery.find({ schoolId: sid, refId: u1.data.message._id, recipientId: p1._id, channel: 'push' });
  log(du.length === 1 && du[0].state !== 'deferred' && du[0].bypassedQuiet === true, 'an urgent office message goes straight through quiet hours');
  await N.notify({ schoolId: sid, recipients: [{ id: p1._id, role: 'parent' }], title: 'Gate alert', type: 'safety', track: { kind: 'safety-test', refId: p1._id } }); const ds = await CmDelivery.find({ schoolId: sid, kind: 'safety-test', channel: 'push' }); log(ds.length === 1 && ds[0].state !== 'deferred', 'a safety alert is never held back');
  await N.notify({ schoolId: sid, recipients: [{ id: p3._id, role: 'parent' }], title: 'Fee reminder', type: 'fee' }); const dg = await CmDelivery.find({ schoolId: sid, recipientId: p3._id, channel: 'push' }); log(dg.length === 1 && dg[0].state === 'deferred', 'ordinary alerts from other parts of the system also wait for the quiet hours to end');
  const bell = await Notification.countDocuments({ userId: p3._id, title: 'Fee reminder' }); log(bell === 1, 'and still show in the app at once');

  // ── a person's own times and the push switch ──
  await expect('the school turns quiet hours off', call('PUT', '/comms/settings', A, { quiet: { on: false, from: '21:00', to: '07:00' } }));
  const m2 = await expect('a message with no quiet hours', call('POST', `/comms/threads/${tid}/messages`, t1, { text: 'Second note.' }), [201]); const d2 = await CmDelivery.find({ schoolId: sid, refId: m2.data.message._id, channel: 'push' }); log(d2.length === 1 && d2[0].state === 'skipped' && d2[0].reason === 'no device', 'with no quiet hours the push is tried at once (this parent has no device)');
  await expect('the parent adds their own quiet times', call('PUT', '/comms/prefs', P1, { quietOn: true, quietFrom: around().from, quietTo: around().to }));
  const m3 = await expect('a message in the parent\'s own quiet time', call('POST', `/comms/threads/${tid}/messages`, t1, { text: 'Third note.' }), [201]); const d3 = await CmDelivery.find({ schoolId: sid, refId: m3.data.message._id, channel: 'push' }); log(d3.length === 1 && d3[0].state === 'deferred', 'a person\'s own quiet times are respected');
  await expect('the parent turns push off', call('PUT', '/comms/prefs', P1, { quietOn: false, push: false }));
  const m4 = await expect('a message to someone who turned push off', call('POST', `/comms/threads/${tid}/messages`, t1, { text: 'Fourth note.' }), [201]); const d4 = await CmDelivery.find({ schoolId: sid, refId: m4.data.message._id, channel: 'push' }); log(d4.length === 1 && d4[0].state === 'skipped' && d4[0].reason === 'push turned off', 'no push is sent, and the record says why'); log((await Notification.countDocuments({ userId: p1._id })) >= nBefore + 4, 'the in-app alert still arrives');
  await expect('the parent turns push on again', call('PUT', '/comms/prefs', P1, { push: true }));

  // ── releasing held pushes, with retries ──
  const realPush = N.pushOnly; let mode = 'failed'; N.pushOnly = async () => mode;
  await CmDelivery.updateMany({ schoolId: sid, channel: 'push', state: 'deferred' }, { $set: { deferUntil: new Date(Date.now() - 1000) } });
  await expect('the school sets quiet hours again', call('PUT', '/comms/settings', A, { quiet: { on: true, ...around() } }));
  const w1 = await expect('a sweep during quiet hours keeps them held', call('POST', '/comms/sweep', A)); log(w1.data.pushes.held >= 2 && w1.data.pushes.sent === 0, 'pushes stay held while quiet hours still apply'); const still = await CmDelivery.countDocuments({ schoolId: sid, channel: 'push', state: 'deferred', deferUntil: { $gt: new Date() } }); log(still >= 2, 'their release time moves to the end of the quiet hours');
  await expect('quiet hours end', call('PUT', '/comms/settings', A, { quiet: { on: false, from: '21:00', to: '07:00' } })); await CmDelivery.updateMany({ schoolId: sid, channel: 'push', state: 'deferred' }, { $set: { deferUntil: new Date(Date.now() - 1000) } });
  const w2 = await expect('the sweep tries to send them', call('POST', '/comms/sweep', A)); log(w2.data.pushes.failed >= 2 && w2.data.pushes.sent === 0, 'a push that fails is counted as failed'); const fl = await CmDelivery.find({ schoolId: sid, channel: 'push', state: 'failed' }); log(fl.length >= 2 && fl.every((d) => d.attempts === 1 && d.nextTryAt > new Date()), 'it is retried later, not at once');
  const w2b = await call('POST', '/comms/sweep', A); log(w2b.data.pushes.looked === 0, 'a second sweep straight away does not retry early');
  await CmDelivery.updateMany({ schoolId: sid, channel: 'push', state: 'failed' }, { $set: { nextTryAt: new Date(Date.now() - 1000) } }); mode = 'sent'; const w3 = await call('POST', '/comms/sweep', A); log(w3.data.pushes.sent >= 2, 'a later try that works marks the push as sent'); log((await CmDelivery.countDocuments({ schoolId: sid, channel: 'push', state: 'failed' })) === 0, 'nothing is left failed');
  const hard = await CmDelivery.create({ schoolId: sid, recipientRole: 'parent', recipientId: p1._id, channel: 'push', state: 'failed', attempts: 2, nextTryAt: new Date(Date.now() - 1000), payload: { title: 'x' } }); mode = 'failed'; await call('POST', '/comms/sweep', A); const hh = await CmDelivery.findById(hard._id); log(hh.state === 'failed' && hh.attempts === 3, 'the third failed try is the last'); await call('POST', '/comms/sweep', A); log((await CmDelivery.findById(hard._id)).attempts === 3, 'it is not tried a fourth time');
  N.pushOnly = realPush;

  // ── late replies ──
  const th0 = await CmThread.findById(tid); log(th0.waitingOn === 'family', 'after the teacher wrote, the thread waits on the family');
  await expect('the parent asks something', call('POST', `/comms/threads/${tid}/messages`, P1, { text: 'When is the next test?' }), [201]); const waiting = await CmThread.findById(tid); log(waiting.waitingOn === 'school' && waiting.replyDueAt > new Date(), 'the school now has a reply deadline'); const dueGap = (waiting.replyDueAt - new Date()) / 60000; log(dueGap > 50 && dueGap < 24 * 60 * 4, 'the deadline counts working time (60 minutes by the school\'s setting)');
  await CmThread.updateOne({ _id: waiting._id }, { $set: { replyDueAt: new Date(Date.now() - 60000) } });
  const nt = await Notification.countDocuments({ userId: T1._id, key: { $regex: '^thread.overdue' } }); const sw = await expect('a sweep raises the late reply', call('POST', '/comms/sweep', A)); log(sw.data.overdueThreads === 1, 'one late reply is raised');
  log((await Notification.countDocuments({ userId: T1._id, key: { $regex: '^thread.overdue' } })) === nt + 1, 'the teacher is told'); log((await Notification.countDocuments({ schoolId: sid, userRole: 'admin', key: { $regex: '^thread.overdue' } })) >= 1, 'so are the administrators');
  const lv = await call('GET', '/comms/threads', t1); log(lv.data.threads.find((t) => String(t._id) === tid).overdue === true, 'the thread is marked late'); const sw2 = await call('POST', '/comms/sweep', A); log(sw2.data.overdueThreads === 0, 'running the sweep again does not raise it twice');
  await expect('the teacher answers', call('POST', `/comms/threads/${tid}/messages`, t1, { text: 'Next Tuesday.' }), [201]); const fin = await CmThread.findById(tid); log(fin.overdueAt === null && fin.waitingOn === 'family', 'answering clears the late mark');

  // ── overview ──
  const ot = await expect('the teacher overview', call('GET', '/comms/overview', t1)); log(typeof ot.data.unreadThreads === 'number' && typeof ot.data.overdueThreads === 'number', 'a teacher sees unread and late counts');
  const op = await expect('the parent overview', call('GET', '/comms/overview', P1)); log(op.data.unreadThreads >= 1 && op.data.ticketsOpen === 0, 'a parent sees unread messages');
  const oa = await expect('the administrator overview', call('GET', '/comms/overview', A)); log(typeof oa.data.held === 'number' && typeof oa.data.failed === 'number' && typeof oa.data.ticketsOpen === 'number', 'the administrator also sees held and failed pushes and the help desk counts');
  await expect('a student has no overview', call('GET', '/comms/overview', tokens.student), [403]);
  await expect('a teacher cannot run the sweep', call('POST', '/comms/sweep', t1), [403]);
  await require('./commsChecks3')({ call, expect, log, tokens, base });
};
