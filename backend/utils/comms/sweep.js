// Housekeeping for family communication (PRD E20). Safe to run often and by two callers at once:
//   release pushes held for quiet hours, raise overdue replies and SLA breaches once, close old resolved requests, remind families of meetings.
const C = require('./service');
const { T, both } = require('./i18n');
const N = require('../notify');
const CmThread = require('../../models/CmThread');
const CmTicket = require('../../models/CmTicket');
const CmPtm = require('../../models/CmPtm');
const CmPtmSlot = require('../../models/CmPtmSlot');
const Student = require('../../models/Student');
const { oid, K } = C;
const LINK = { parent: '/parent#/messages', teacher: '/teacher#/familyDesk', admin: '/admin#/familyDesk' };

async function run(schoolId) {
  const s = oid(schoolId); const now = new Date(); const settings = await C.getSettings(s); const tz = await K.tzOf(s); const out = { pushes: null, overdueThreads: 0, breaches: 0, closed: 0, reminded: 0, ptmClosed: 0 };
  out.pushes = await C.dispatchDue(s);
  // family messages waiting past their reply time
  const late = await CmThread.find({ schoolId: s, status: 'open', waitingOn: 'school', overdueAt: null, replyDueAt: { $lte: now } }).limit(200);
  for (const t of late) {
    const r = await CmThread.updateOne({ _id: t._id, overdueAt: null }, { $set: { overdueAt: now } }); if (!r.matchedCount) continue; out.overdueThreads += 1;
    const to = t.staffKind === 'teacher' ? [{ role: 'teacher', id: t.teacherId }, ...(await N.admins(s))] : await N.admins(s);
    await C.deliver({ schoolId: s, to, title: both('thread.overdue', { from: t.parentName }), body: { en: t.studentName, ur: t.studentName }, link: LINK, type: 'general', key: `thread.overdue:${t._id}`, kind: 'sla', refId: t._id });
  }
  // tickets past a deadline (the clock is stopped while the school waits for the family)
  const live = await CmTicket.find({ schoolId: s, status: { $in: ['Open', 'In progress'] }, breach: { $ne: 'resolve' } }).select('-events').limit(500);
  for (const t of live) {
    const first = !t.firstResponseAt && t.firstResponseDueAt && now > new Date(t.firstResponseDueAt); const fin = t.resolveDueAt && now > new Date(t.resolveDueAt);
    const kind = fin ? 'resolve' : first ? 'first' : ''; if (!kind || t.breach === kind) continue;
    const r = await CmTicket.updateOne({ _id: t._id, breach: t.breach }, { $set: { breach: kind, breachedAt: now }, $push: { events: { at: now, byRole: 'system', kind: 'sla', en: kind === 'first' ? 'First reply time passed' : 'Resolution time passed', ur: kind === 'first' ? 'پہلے جواب کا وقت گزر گیا' : 'حل کا وقت گزر گیا', data: { kind } } } }); if (!r.matchedCount) continue; out.breaches += 1;
    await C.deliver({ schoolId: s, to: t.assigneeId ? [{ role: 'admin', id: t.assigneeId }, ...(await N.admins(s))] : await N.admins(s), title: both(`ticket.breach.${kind}`, { number: t.number }), body: { en: t.subject, ur: t.subject }, link: LINK, type: 'general', urgent: true, key: `ticket.breach:${t._id}:${kind}`, kind: 'sla', refId: t._id });
  }
  // resolved requests close themselves when the family does not reply
  const old = await CmTicket.find({ schoolId: s, status: 'Resolved', resolvedAt: { $lte: new Date(now.getTime() - settings.autoCloseDays * 86400000) } }).select('_id').limit(200);
  for (const t of old) { const r = await CmTicket.updateOne({ _id: t._id, status: 'Resolved' }, { $set: { status: 'Closed', closedAt: now }, $push: { events: { at: now, byRole: 'system', kind: 'status', en: 'Closed automatically', ur: 'خود بخود بند', data: { to: 'Closed' } } } }); if (r.matchedCount) out.closed += 1; }
  // meeting reminders, once, about a day ahead
  const soon = await CmPtmSlot.find({ schoolId: s, state: 'Booked', remindedAt: null, startsAt: { $gt: now, $lte: new Date(now.getTime() + 26 * 3600000) } }).limit(500);
  for (const x of soon) {
    const r = await CmPtmSlot.updateOne({ _id: x._id, remindedAt: null }, { $set: { remindedAt: now } }); if (!r.matchedCount) continue; out.reminded += 1;
    await C.deliver({ schoolId: s, to: [{ role: 'parent', id: x.parentId }], title: both('ptm.reminder', { teacher: x.teacherName }), body: { en: K.fmtWhen(tz, x.startsAt, 'en'), ur: K.fmtWhen(tz, x.startsAt, 'ur') }, link: LINK, type: 'general', key: `ptm.reminder:${x._id}`, kind: 'ptm', refId: x._id });
    await C.deliver({ schoolId: s, to: [{ role: 'teacher', id: x.teacherId }], title: { en: `Meeting soon: ${x.studentName}`, ur: `ملاقات جلد: ${x.studentName}` }, body: { en: K.fmtWhen(tz, x.startsAt, 'en'), ur: K.fmtWhen(tz, x.startsAt, 'ur') }, link: LINK, type: 'general', key: `ptm.reminder.t:${x._id}`, kind: 'ptm', refId: x._id });
  }
  // a meeting day ends when its last session is over
  const open = await CmPtm.find({ schoolId: s, status: 'Open' }).limit(50);
  for (const p of open) { const end = (p.sessions || []).map((x) => K.localToDate(tz, x.day, K.mins(x.to))).sort((a, b) => b - a)[0]; if (end && now > end) { p.status = 'Closed'; await p.save(); out.ptmClosed += 1; } }
  return out;
}
module.exports = { run };
