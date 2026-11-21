// Webhooks (PRD E30 WebhookDelivery). An event is written to the outbox first and sent after, so it is never lost; each delivery is signed,
// retried on a schedule, and replayable. The receiver uses the event id to ignore a repeat.
const crypto = require('crypto');
const mongoose = require('../../lib/pgdoc');
const Connector = require('../../models/Connector');
const WebhookDelivery = require('../../models/WebhookDelivery');
const DisclosureLog = require('../../models/DisclosureLog');
const Student = require('../../models/Student');
const Class = require('../../models/Class');
const V = require('./vault');
const NET = require('./net');
const { EVENTS, RETRY_MINUTES, MAX_ATTEMPTS, PAUSE_AFTER } = require('./catalog');

const oid = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const BODY_LIMIT = 60000;

// Stripe-style: the receiver rebuilds "<time>.<body>", signs it with the secret and compares. Five minutes of drift are tolerated by the receiver, not by us.
const sign = (secret, t, body) => V.hmac(secret, `${t}.${body}`);
// while a replaced secret is still in its grace period both signatures are sent, so the receiver can check against either
const header = (secret, t, body, older) => `t=${t},v1=${sign(secret, t, body)}${older ? `,v1=${sign(older, t, body)}` : ''}`;

// what a webhook may be told about an event, never more than its scopes allow
async function shape(type, data, scopes) {
  const has = (s) => scopes.includes(s);
  if (type === 'connector.test') return { message: 'This is a test event from Aulensia.' };
  if (type === 'student.enrolled' || type === 'student.left') {
    const s = data.student || {}; const cls = s.classId ? await Class.findById(s.classId).select('campusId standard division').lean() : null;
    const out = { studentId: String(s._id), name: s.name, admissionNumber: s.admissionNumber || null, classId: s.classId ? String(s.classId) : null, className: cls ? `${cls.standard}-${cls.division}` : null, campusId: cls && cls.campusId ? String(cls.campusId) : null };
    if (has('roster.contact')) { out.email = s.email || null; out.phone = s.phone || null; }
    if (has('roster.guardians')) { const Parent = require('../../models/Parent'); out.guardianIds = (await Parent.find({ schoolId: s.schoolId, children: s._id }).select('_id').lean()).map((p) => String(p._id)); }
    return out;
  }
  if (type === 'payment.received') { const p = data.payment || {}; return { paymentId: String(p._id), studentId: String(p.studentId), amount: p.amount, method: p.method, receiptNo: p.receiptNo || null, receivedAt: p.receivedAt || null }; }
  if (type === 'attendance.absent') return { studentId: String(data.studentId), classId: data.classId ? String(data.classId) : null, date: data.date, kind: data.kind || 'Absent' };
  if (type === 'notice.published') { const n = data.notice || {}; return { noticeId: String(n._id), title: n.title, category: n.category, content: String(n.content || '').slice(0, 2000) }; }
  return {};
}

// Called after something happened. Never throws: a problem here must not undo what the school just did.
async function emit(schoolId, type, data, { eventId } = {}) {
  try {
    if (!EVENTS[type]) return { queued: 0 };
    const subs = await Connector.find({ schoolId: oid(schoolId), kind: 'webhook', status: 'active' }).lean(); let queued = 0; const id = eventId || `evt_${V.token(12)}`;
    for (const c of subs) {
      if (!(c.config.events || []).includes(type) || !c.scopes.includes(EVENTS[type].scope)) continue;
      try { await WebhookDelivery.create({ schoolId: oid(schoolId), connectorId: c._id, eventId: id, type, payload: await shape(type, data, c.scopes), nextAttemptAt: new Date() }); queued += 1; }
      catch (e) { if (!(e.code === 11000 || /duplicate|E11000/.test(e.message))) throw e; }
    }
    if (queued) kick(schoolId);
    return { queued, eventId: id };
  } catch (e) { console.error('webhook emit:', e.message); return { queued: 0, error: true }; }
}

// send what is due soon after the response has gone; the daily timer and the overview pick up anything this misses
const kicks = new Map();
// at most one sweep every two seconds per school; a call that comes sooner is not lost, it runs once when the two seconds are over
function kick(schoolId) {
  const k = String(schoolId); const run = () => { kicks.set(k, { at: Date.now(), timer: null }); setImmediate(() => sweep(schoolId).catch((e) => console.error('webhook kick:', e.message))); };
  const last = kicks.get(k); if (!last) return run();
  const wait = 2000 - (Date.now() - last.at); if (wait <= 0) return run();
  if (!last.timer) { last.timer = setTimeout(run, wait); if (last.timer.unref) last.timer.unref(); }
}

const dueFilter = (schoolId) => ({ ...(schoolId ? { schoolId: oid(schoolId) } : {}), status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: new Date() } });

async function pauseConnector(c, reason) {
  await Connector.updateOne({ _id: c._id, status: 'active' }, { $set: { status: 'paused', pausedReason: reason }, $push: { history: { at: new Date(), by: 'Aulensia', what: 'paused', note: reason } } });
  try { const P = require('../group/policy'); const N = require('../notify'); const admins = await P.wideAdmins(c.schoolId); await N.notify({ schoolId: c.schoolId, recipients: admins.map((a) => ({ id: a._id, role: 'admin' })), title: 'A webhook was paused', body: `${c.name}: ${reason}`, link: '/admin#/integrations', type: 'integration', key: `int:pause:${c._id}:${Date.now() >> 16}` }); } catch (e) { console.error('webhook pause notice:', e.message); }
}

async function deliverOne(d, { force = false } = {}) {
  const claim = await WebhookDelivery.updateOne({ _id: d._id, status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: new Date() }, $or: [{ claimUntil: null }, { claimUntil: { $lt: new Date() } }] }, { $set: { claimUntil: new Date(Date.now() + 60000) } });
  if (claim.matchedCount !== 1) return null;
  const c = await Connector.findById(d.connectorId);
  if (!c || c.status === 'revoked') { await WebhookDelivery.updateOne({ _id: d._id }, { $set: { status: 'dead', lastError: 'The webhook was removed.', claimUntil: null } }); return 'dead'; }
  if (c.status !== 'active' && !force) { await WebhookDelivery.updateOne({ _id: d._id }, { $set: { claimUntil: null, nextAttemptAt: new Date(Date.now() + 300000) } }); return 'held'; }
  const t = Math.floor(Date.now() / 1000); const body = JSON.stringify({ id: d.eventId, type: d.type, createdAt: new Date(d.createdAt).toISOString(), data: d.payload });
  let status = 0; let ms = 0; let err = '';
  try {
    if (body.length > BODY_LIMIT) throw new Error('The event is too large to send.');
    const secret = V.open(c.secretEnc);
    const r = await NET.request(c.config.url, { method: 'POST', body, headers: { 'content-type': 'application/json', 'aulensia-event-id': d.eventId, 'aulensia-event-type': d.type, 'aulensia-delivery': String(d._id), 'aulensia-signature': header(secret, t, body, c.previousSecretEnc && c.previousUntil && new Date(c.previousUntil) > new Date() ? V.open(c.previousSecretEnc) : null) }, timeoutMs: 5000, maxBytes: 2048 });
    status = r.status; ms = r.ms; if (status < 200 || status > 299) err = status >= 300 && status < 400 ? 'The other system answered with a redirect, which is not followed.' : `The other system answered ${status}.`;
  } catch (e) { err = e.code === 'ETIMEDOUT' ? 'The other system did not answer in time.' : e.code === 'EPRIVATE' || e.code === 'EBADURL' ? e.message : `Could not reach the other system (${e.code || 'error'}).`; }
  const attempts = d.attempts + 1; const ok = !err; const gone = status === 410;
  const step = { at: new Date(), status, ms, error: err };
  if (ok) {
    await WebhookDelivery.updateOne({ _id: d._id }, { $set: { status: 'delivered', attempts, lastStatus: status, lastError: '', lastMs: ms, deliveredAt: new Date(), claimUntil: null }, $push: { history: step } });
    await Connector.updateOne({ _id: c._id }, { $set: { failures: 0 } });
    if (d.type !== 'connector.test') await DisclosureLog.create({ schoolId: c.schoolId, connectorId: c._id, connectorName: c.name, kind: 'webhook', channel: 'webhook', what: d.type, categories: require('./catalog').categoriesOf(c.scopes), records: 1 });
    return 'delivered';
  }
  const dead = gone || attempts >= MAX_ATTEMPTS; const wait = RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)];
  await WebhookDelivery.updateOne({ _id: d._id }, { $set: { status: dead ? 'dead' : 'failed', attempts, lastStatus: status, lastError: err, lastMs: ms, nextAttemptAt: new Date(Date.now() + wait * 60000), claimUntil: null }, $push: { history: step } });
  await Connector.updateOne({ _id: c._id }, { $inc: { failures: 1 } }); const fresh = await Connector.findById(c._id).select('failures status name schoolId');
  if (gone) await pauseConnector(c, 'The other system said the address no longer exists (410).');
  else if (fresh && fresh.status === 'active' && fresh.failures >= PAUSE_AFTER) await pauseConnector(c, `${fresh.failures} deliveries in a row failed.`);
  return dead ? 'dead' : 'failed';
}

// sends what is due; many schools at once from the daily timer, one school from a kick
async function sweep(schoolId, { limit = 50 } = {}) {
  const due = await WebhookDelivery.find(dueFilter(schoolId)).sort({ nextAttemptAt: 1 }).limit(limit); const out = { tried: 0, delivered: 0, failed: 0, dead: 0, held: 0 };
  for (const d of due) { const r = await deliverOne(d); if (r) { out.tried += 1; if (out[r] !== undefined) out[r] += 1; } }
  return out;
}

// a new delivery of an event that was already made, for when the receiver lost it or was fixed
async function replay(delivery, by) {
  const c = await Connector.findById(delivery.connectorId); if (!c || c.status === 'revoked') { const e = new Error('This webhook was removed.'); e.code = 409; throw e; }
  const d = await WebhookDelivery.create({ schoolId: delivery.schoolId, connectorId: delivery.connectorId, eventId: delivery.eventId, type: delivery.type, payload: delivery.payload, replayOf: delivery._id, replayKey: `r${V.token(6)}`, nextAttemptAt: new Date() });
  await Connector.updateOne({ _id: c._id }, { $push: { history: { at: new Date(), by, what: 'replayed a delivery', note: delivery.type } } });
  return d;
}
async function testEvent(c) {
  const id = `evt_${V.token(12)}`; const d = await WebhookDelivery.create({ schoolId: c.schoolId, connectorId: c._id, eventId: id, type: 'connector.test', payload: await shape('connector.test', {}, c.scopes), nextAttemptAt: new Date(), replayKey: '' });
  const got = await deliverOne(d, { force: true }); return { delivery: await WebhookDelivery.findById(d._id), result: got };
}

module.exports = { sign, header, emit, sweep, deliverOne, replay, testEvent, kick, shape };
