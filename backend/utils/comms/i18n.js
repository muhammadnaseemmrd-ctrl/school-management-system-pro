// The few sentences the system writes for families and staff, in English and Urdu (PRD E20: language preference).
// A person's own words are never translated by the system: a message keeps what was written, and the other language only if the writer gave it.
const D = {
  'msg.new': { en: 'New message from {from}', ur: '{from} کی طرف سے نیا پیغام' },
  'msg.urgent': { en: 'Urgent message from {from}', ur: '{from} کی طرف سے فوری پیغام' },
  'ticket.created': { en: 'Help request {number} received', ur: 'مدد کی درخواست {number} موصول ہو گئی' },
  'ticket.created.body': { en: 'We have your request: {subject}. You will hear from us within {when}.', ur: 'آپ کی درخواست ہمیں مل گئی: {subject}۔ ہم {when} کے اندر آپ کو جواب دیں گے۔' },
  'ticket.reply': { en: 'Reply on {number}', ur: '{number} پر جواب' },
  'ticket.status': { en: '{number} is now: {status}', ur: '{number} کی نئی صورتحال: {status}' },
  'ticket.waiting': { en: 'We need your reply on {number}', ur: '{number} پر ہمیں آپ کے جواب کی ضرورت ہے' },
  'status.Open': { en: 'Open', ur: 'کھلی' }, 'status.In progress': { en: 'In progress', ur: 'جاری' }, 'status.Waiting on family': { en: 'Waiting for your reply', ur: 'آپ کے جواب کا انتظار' },
  'status.Resolved': { en: 'Resolved', ur: 'حل ہو گئی' }, 'status.Closed': { en: 'Closed', ur: 'بند' },
  'ticket.staff.new': { en: 'New help request {number}: {subject}', ur: 'مدد کی نئی درخواست {number}: {subject}' },
  'ticket.staff.reply': { en: 'The family replied on {number}', ur: 'خاندان نے {number} پر جواب دیا' },
  'ticket.staff.assigned': { en: '{number} was assigned to you', ur: '{number} آپ کے سپرد کی گئی' },
  'ticket.breach.first': { en: '{number} has passed its first-reply time', ur: '{number} کا پہلے جواب کا وقت گزر گیا' },
  'ticket.breach.resolve': { en: '{number} has passed its resolution time', ur: '{number} کے حل کا وقت گزر گیا' },
  'thread.overdue': { en: 'A family message from {from} has waited past its reply time', ur: '{from} کے پیغام کے جواب کا وقت گزر گیا' },
  'ptm.open': { en: 'Parent-teacher meetings: booking is open', ur: 'والدین اور اساتذہ کی ملاقاتیں: بکنگ کھل گئی' },
  'ptm.open.body': { en: '{title}. Choose a time with each teacher before {closes}.', ur: '{title}۔ {closes} سے پہلے ہر استاد کے ساتھ وقت منتخب کریں۔' },
  'ptm.booked': { en: 'Meeting booked with {teacher}', ur: '{teacher} کے ساتھ ملاقات طے ہو گئی' },
  'ptm.booked.staff': { en: 'A parent booked a meeting about {student}', ur: 'ایک والد/والدہ نے {student} کے بارے میں ملاقات طے کی' },
  'ptm.cancelled': { en: 'Meeting cancelled', ur: 'ملاقات منسوخ کر دی گئی' },
  'ptm.cancelled.body': { en: 'Your meeting with {teacher} on {when} was cancelled. {why}', ur: '{when} کو {teacher} کے ساتھ آپ کی ملاقات منسوخ ہو گئی۔ {why}' },
  'ptm.reminder': { en: 'Meeting reminder: {teacher}', ur: 'ملاقات کی یاددہانی: {teacher}' },
  'ptm.summary': { en: 'Notes from your meeting are ready', ur: 'آپ کی ملاقات کے نوٹس تیار ہیں' },
  'ptm.nudge': { en: 'You have not booked a meeting yet', ur: 'آپ نے ابھی تک ملاقات بک نہیں کی' },
  'when.hours': { en: '{n} working hours', ur: '{n} کام کے گھنٹے' }, 'when.hour': { en: '1 working hour', ur: '1 کام کا گھنٹا' },
  'when.days': { en: '{n} working days', ur: '{n} کام کے دن' }, 'when.day': { en: '1 working day', ur: '1 کام کا دن' },
};
const T = (key, vars = {}, lang = 'en') => {
  const row = D[key]; if (!row) return key;
  return (row[lang] || row.en).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
};
const both = (key, vars = {}) => ({ en: T(key, vars, 'en'), ur: T(key, vars, 'ur') });
// "8 working hours", or days when it divides the working day
const waitWords = (minutes, dayMinutes, lang) => {
  if (minutes >= dayMinutes && minutes % dayMinutes === 0) { const n = minutes / dayMinutes; return n === 1 ? T('when.day', {}, lang) : T('when.days', { n }, lang); }
  const h = Math.max(1, Math.round(minutes / 60)); return h === 1 ? T('when.hour', {}, lang) : T('when.hours', { n: h }, lang);
};
module.exports = { T, both, waitWords };
