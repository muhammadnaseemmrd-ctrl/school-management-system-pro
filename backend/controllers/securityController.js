// Security pilots, device events and incident evidence (PRD E34). A device does nothing until a written pilot is approved by two people;
// it sends metadata only; evidence is seen by few, logged, exported only with two approvals, and destroyed on schedule.
const SecurityPilot = require('../models/SecurityPilot');
const DeviceIntegration = require('../models/DeviceIntegration');
const DeviceEvent = require('../models/DeviceEvent');
const IncidentEvidence = require('../models/IncidentEvidence');
const EvidenceAccess = require('../models/EvidenceAccess');
const EvidenceExport = require('../models/EvidenceExport');
const SecurityAppeal = require('../models/SecurityAppeal');
const AttendanceEvidence = require('../models/AttendanceEvidence');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Consent = require('../utils/consent');
const K = require('../utils/security/service');

const { S, Fail, oid, sid, txt, KINDS, LIMITS } = K;
const wrap = S.wrap; const bad = S.bad;
const ctxOf = (req) => S.ctxOf(req);
const nameOf = (req) => req.actorName || req.user.name || '';
const toId = (v, name) => { try { return oid(v); } catch (e) { throw new Fail(422, `${name} is not valid.`); } };
const tell = async (schoolId, recipients, title, body, link, key = '') => { try { await S.N.notify({ schoolId, recipients, title, body, link, type: 'security', key }); } catch (e) { console.error('security notify:', e.message); } };
const stamp = (req, action, note = '') => ({ at: new Date(), byName: nameOf(req), action, note: String(note || '').slice(0, 300) });
const CONSENT = 'camera_attendance';
const log = (req, incidentId, action, detail) => EvidenceAccess.create({ schoolId: sid(req), incidentId, action, byId: oid(req.user.userId), byName: nameOf(req), byRole: req.user.role, detail: detail || null }).catch((e) => console.error('evidence log:', e.message));
const leads = async (schoolId) => (await require('../models/User').find({ schoolId, role: 'admin', isActive: { $ne: false } }).select('_id')).map((u) => ({ id: u._id, role: 'admin' }));

/* ───────────────────────── pilots ───────────────────────── */
const pView = (p) => ({ id: p._id, no: p.no, title: p.title, kind: p.kind, kindLabel: KINDS[p.kind]?.label, purpose: p.purpose, legalBasis: p.legalBasis, dpiaRef: p.dpiaRef, retentionDays: p.retentionDays, manualAlternative: p.manualAlternative, consentRequired: p.consentRequired, lowConfidence: p.lowConfidence, reviewOn: p.reviewOn, status: p.status, askedByName: p.askedByName, approvals: (p.approvals || []).map((a) => ({ role: a.role, byName: a.byName, at: a.at, note: a.note })), soleAdmin: p.soleAdmin, pausedReason: p.pausedReason, history: p.history, rev: p.rev || 0 });
const pBody = (b, cur) => {
  const kind = b.kind ?? cur?.kind; if (!KINDS[kind]) throw new Fail(422, 'Choose what kind of pilot this is.');
  const title = txt(b.title ?? cur?.title, 140); if (title.length < 4) throw new Fail(422, 'Give the pilot a title.');
  const need = (k, label, min) => { const v = txt(b[k] ?? cur?.[k], k === 'purpose' ? 500 : 400); if (v.length < min) throw new Fail(422, `${label} needs a real answer (at least ${min} characters).`); return v; };
  const purpose = need('purpose', 'The purpose', 20); const legalBasis = need('legalBasis', 'The legal basis', 10); const manualAlternative = need('manualAlternative', 'The manual alternative (what happens for anyone who is not in the pilot)', 15);
  const dpiaRef = txt(b.dpiaRef ?? cur?.dpiaRef, 120); if (dpiaRef.length < 3) throw new Fail(422, 'Give the reference of the data protection impact assessment.');
  const retentionDays = Number(b.retentionDays ?? cur?.retentionDays); if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Fail(422, 'Keep device data for 1 to 365 days.');
  const reviewOn = b.reviewOn ?? cur?.reviewOn; if (!K.isDay(reviewOn)) throw new Fail(422, 'Give the review date as YYYY-MM-DD.'); if (reviewOn <= K.day()) throw new Fail(422, 'The review date must be in the future.'); if (reviewOn > K.addDays(K.day(), LIMITS.maxReviewDays)) throw new Fail(422, `A pilot must be reviewed within ${LIMITS.maxReviewDays} days.`);
  const low = b.lowConfidence ?? cur?.lowConfidence ?? 0.8; const lowConfidence = Number(low); if (!(lowConfidence >= 0.5 && lowConfidence <= 0.99)) throw new Fail(422, 'The confidence threshold must be between 0.5 and 0.99.');
  return { kind, title, purpose, legalBasis, dpiaRef, retentionDays, manualAlternative, reviewOn, lowConfidence, consentRequired: !!KINDS[kind].consent };
};
exports.pilots = wrap('pilots', async (req, res) => res.json({ kinds: Object.entries(KINDS).map(([k, v]) => ({ key: k, label: v.label, consent: v.consent, events: v.events })), pilots: (await SecurityPilot.find({ schoolId: sid(req) }).sort({ createdAt: -1 }).limit(200)).map(pView) }));
exports.addPilot = wrap('addPilot', async (req, res) => {
  const schoolId = sid(req); const body = pBody(req.body || {}); const p = await SecurityPilot.create({ schoolId, no: await K.nextNo(schoolId, 'SPL'), ...body, status: 'Draft', askedById: oid(req.user.userId), askedByName: nameOf(req), history: [stamp(req, 'drafted')] });
  await K.note(req, 'pilot.add', 'SecurityPilot', p._id, { kind: p.kind }); res.status(201).json({ pilot: pView(p) });
});
exports.editPilot = wrap('editPilot', async (req, res) => {
  const p = await SecurityPilot.findOne({ _id: toId(req.params.id, 'The pilot'), schoolId: sid(req) }); if (!p) throw new Fail(404, 'Pilot not found.'); if (p.status !== 'Draft') throw new Fail(409, 'Only a draft can be changed. A pilot that was approved is changed by ending it and writing a new plan.');
  await SecurityPilot.updateOne({ _id: p._id, status: 'Draft' }, { $set: pBody(req.body || {}, p) }); res.json({ pilot: pView(await SecurityPilot.findOne({ _id: p._id })) });
});
exports.askPilot = wrap('askPilot', async (req, res) => {
  const p = await SecurityPilot.findOne({ _id: toId(req.params.id, 'The pilot'), schoolId: sid(req) }); if (!p) throw new Fail(404, 'Pilot not found.'); if (p.status !== 'Draft') throw new Fail(409, 'Only a draft can be sent for approval.');
  pBody({}, p); const r = await SecurityPilot.updateOne({ _id: p._id, status: 'Draft' }, { $set: { status: 'Review', approvals: [], history: [...p.history, stamp(req, 'sent for approval')] } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this pilot.');
  await tell(sid(req), await leads(sid(req)), 'A security pilot needs approval', p.title, '/admin?tab=security', `pilot-${p._id}`); res.json({ ok: true });
});
// Two roles must each approve: the data protection officer and the security lead. Different people, and not the person who wrote the plan.
exports.approvePilot = wrap('approvePilot', async (req, res) => {
  const schoolId = sid(req); const p = await SecurityPilot.findOne({ _id: toId(req.params.id, 'The pilot'), schoolId }); if (!p) throw new Fail(404, 'Pilot not found.'); if (p.status !== 'Review') throw new Fail(409, 'This pilot is not waiting for approval.');
  const role = String(req.body?.role || ''); if (!['dpo', 'security'].includes(role)) throw new Fail(422, 'Say which role you are approving as: dpo or security.');
  if (!(await K.holds(req.user, role === 'dpo' ? K.PERM.dpo : K.PERM.lead))) throw new Fail(403, role === 'dpo' ? 'Only the data protection officer can approve in that role.' : 'Only the security lead can approve in that role.');
  const decision = String(req.body?.decision || 'approve'); const note = txt(req.body?.note, 300);
  if (decision === 'return') { if (note.length < 5) throw new Fail(422, 'Say what must change.'); const r = await SecurityPilot.updateOne({ _id: p._id, status: 'Review', rev: p.rev || 0 }, { $set: { status: 'Draft', approvals: [], rev: (p.rev || 0) + 1, history: [...p.history, stamp(req, `returned by ${role}`, note)] } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this pilot.'); return res.json({ ok: true, status: 'Draft' }); }
  if (decision !== 'approve') throw new Fail(422, 'Choose approve or return.');
  const me = String(req.user.userId); const sole = await S.sole(schoolId);
  if (!sole && String(p.askedById) === me) throw new Fail(403, 'You wrote this plan, so someone else must approve it.', { reason: 'maker_checker' });
  const have = p.approvals || []; if (have.some((a) => a.role === role)) throw new Fail(409, 'That role has already approved.'); if (!sole && have.some((a) => String(a.byId) === me)) throw new Fail(403, 'The data protection officer and the security lead must be two different people.', { reason: 'maker_checker' });
  const approvals = [...have, { role, byId: oid(me), byName: nameOf(req), at: new Date(), note }]; const both = ['dpo', 'security'].every((x) => approvals.some((a) => a.role === x));
  if (both && p.reviewOn <= K.day()) throw new Fail(409, 'The review date has passed. Send it back and set a new date.');
  const set = { approvals, rev: (p.rev || 0) + 1, history: [...p.history, stamp(req, `approved as ${role}`, note)] }; if (both) { set.status = 'Active'; set.soleAdmin = sole && approvals.every((a) => String(a.byId) === me); }
  const r = await SecurityPilot.updateOne({ _id: p._id, status: 'Review', rev: p.rev || 0 }, { $set: set }); if (!r.matchedCount) throw new Fail(409, 'Someone else just changed this pilot. Reload it.');
  await K.note(req, 'pilot.approve', 'SecurityPilot', p._id, { role, active: both, soleAdmin: !!set.soleAdmin }); res.json({ ok: true, status: both ? 'Active' : 'Review', soleAdmin: !!set.soleAdmin });
});
exports.pausePilot = wrap('pausePilot', async (req, res) => {
  const p = await SecurityPilot.findOne({ _id: toId(req.params.id, 'The pilot'), schoolId: sid(req) }); if (!p) throw new Fail(404, 'Pilot not found.'); if (p.status !== 'Active') throw new Fail(409, 'Only an active pilot can be paused.');
  const reason = txt(req.body?.reason, 300); if (reason.length < 5) throw new Fail(422, 'Say why.'); const r = await SecurityPilot.updateOne({ _id: p._id, status: 'Active' }, { $set: { status: 'Paused', pausedReason: reason, history: [...p.history, stamp(req, 'paused', reason)] } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this pilot.');
  await K.note(req, 'pilot.pause', 'SecurityPilot', p._id, { reason }); res.json({ ok: true });
});
// Resuming a paused pilot needs a new review date and the data protection officer, not the person who paused it.
exports.resumePilot = wrap('resumePilot', async (req, res) => {
  const schoolId = sid(req); const p = await SecurityPilot.findOne({ _id: toId(req.params.id, 'The pilot'), schoolId }); if (!p) throw new Fail(404, 'Pilot not found.'); if (p.status !== 'Paused') throw new Fail(409, 'This pilot is not paused.');
  if (!(await K.holds(req.user, K.PERM.dpo))) throw new Fail(403, 'Only the data protection officer can resume a pilot.'); const reviewOn = req.body?.reviewOn; if (!K.isDay(reviewOn) || reviewOn <= K.day() || reviewOn > K.addDays(K.day(), LIMITS.maxReviewDays)) throw new Fail(422, `Give a new review date within ${LIMITS.maxReviewDays} days.`);
  const note = txt(req.body?.note, 300); if (note.length < 10) throw new Fail(422, 'Say what was reviewed.');
  const r = await SecurityPilot.updateOne({ _id: p._id, status: 'Paused' }, { $set: { status: 'Active', reviewOn, pausedReason: '', history: [...p.history, stamp(req, 'resumed', note)] } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this pilot.');
  await K.note(req, 'pilot.resume', 'SecurityPilot', p._id, { reviewOn }); res.json({ ok: true });
});
exports.endPilot = wrap('endPilot', async (req, res) => {
  const schoolId = sid(req); const p = await SecurityPilot.findOne({ _id: toId(req.params.id, 'The pilot'), schoolId }); if (!p) throw new Fail(404, 'Pilot not found.'); if (p.status === 'Ended') throw new Fail(409, 'Already ended.'); const reason = txt(req.body?.reason, 300); if (reason.length < 5) throw new Fail(422, 'Say why.');
  await SecurityPilot.updateOne({ _id: p._id }, { $set: { status: 'Ended', history: [...p.history, stamp(req, 'ended', reason)] } }); await DeviceIntegration.updateMany({ schoolId, pilotId: p._id, status: 'Active' }, { $set: { status: 'Disabled' } });
  const gone = await DeviceEvent.deleteMany({ schoolId, pilotId: p._id, state: { $in: ['info', 'dismissed'] } }); await K.note(req, 'pilot.end', 'SecurityPilot', p._id, { reason }); res.json({ ok: true, devicesDisabled: true, note: 'Its devices were switched off. Data kept by the pilot is deleted on the retention schedule.', removed: gone?.deletedCount ?? null });
});

/* ───────────────────────── devices ───────────────────────── */
const dView = (d, pilots) => { const lim = LIMITS.offlineMinutes * 60000; const seen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0; return { id: d._id, name: d.name, kind: d.kind, location: d.location, pilotId: d.pilotId, pilotNo: pilots?.get(String(d.pilotId))?.no || '', pilotStatus: pilots?.get(String(d.pilotId))?.status || '', status: d.status, lastSeenAt: d.lastSeenAt, lastEventAt: d.lastEventAt, driftSeconds: Math.round(d.driftSeconds || 0), online: d.status === 'Active' && seen && Date.now() - seen < lim, clockOk: Math.abs(d.driftSeconds || 0) <= LIMITS.clockDriftSeconds, keyExpiresAt: d.keyExpiresAt, keyPrefix: d.keyPrefix }; };
exports.devices = wrap('devices', async (req, res) => { const schoolId = sid(req); const ds = await DeviceIntegration.find({ schoolId }).sort({ createdAt: -1 }).limit(300); const ps = new Map((await SecurityPilot.find({ schoolId }).select('no status')).map((p) => [String(p._id), p])); res.json({ devices: ds.map((d) => dView(d, ps)) }); });
const mintKey = () => { const key = K.secretOf(); return { key, hash: K.hashKey(key), prefix: key.slice(3, 11), expires: new Date(Date.now() + 365 * 86400000) }; };
exports.addDevice = wrap('addDevice', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const p = await SecurityPilot.findOne({ _id: toId(b.pilotId, 'The pilot'), schoolId }); if (!p) throw new Fail(404, 'Pilot not found.'); if (['Ended'].includes(p.status)) throw new Fail(409, 'That pilot has ended.');
  const name = txt(b.name, 100); if (name.length < 3) throw new Fail(422, 'Name the device.'); if (!K.DEVICE_KINDS.includes(b.kind)) throw new Fail(422, 'Choose camera, reader, counter or gateway.');
  if (p.kind === 'entry_counter' && b.kind === 'camera') throw new Fail(422, 'A counter pilot cannot use a camera.');
  const m = mintKey(); const d = await DeviceIntegration.create({ schoolId, name, kind: b.kind, location: txt(b.location, 120), pilotId: p._id, keyHash: m.hash, keyPrefix: m.prefix, keyExpiresAt: m.expires, createdByName: nameOf(req) });
  await K.note(req, 'device.add', 'DeviceIntegration', d._id, { kind: d.kind }); res.status(201).json({ device: dView(d, new Map([[String(p._id), p]])), key: { id: String(d._id), secret: m.key, shownOnce: true, expiresAt: m.expires } });
});
exports.rotateKey = wrap('rotateKey', async (req, res) => {
  const d = await DeviceIntegration.findOne({ _id: toId(req.params.id, 'The device'), schoolId: sid(req) }); if (!d) throw new Fail(404, 'Device not found.'); if (d.status === 'Retired') throw new Fail(409, 'This device is retired.');
  const m = mintKey(); await DeviceIntegration.updateOne({ _id: d._id }, { $set: { keyHash: m.hash, keyPrefix: m.prefix, keyExpiresAt: m.expires, rotatedAt: new Date() } }); await K.note(req, 'device.rotate', 'DeviceIntegration', d._id, {});
  res.json({ key: { id: String(d._id), secret: m.key, shownOnce: true, expiresAt: m.expires }, note: 'The old key stopped working at once.' });
});
exports.deviceStatus = wrap('deviceStatus', async (req, res) => {
  const d = await DeviceIntegration.findOne({ _id: toId(req.params.id, 'The device'), schoolId: sid(req) }); if (!d) throw new Fail(404, 'Device not found.'); const to = String(req.body?.status || ''); if (!['Active', 'Disabled', 'Retired'].includes(to)) throw new Fail(422, 'Choose active, disabled or retired.'); if (d.status === 'Retired') throw new Fail(409, 'A retired device stays retired.');
  const p = await SecurityPilot.findOne({ _id: d.pilotId }).select('status'); if (to === 'Active' && p?.status === 'Ended') throw new Fail(409, 'That pilot has ended.');
  await DeviceIntegration.updateOne({ _id: d._id }, { $set: { status: to, ...(to === 'Retired' ? { keyHash: '', keyPrefix: '' } : {}) } }); await K.note(req, `device.${to.toLowerCase()}`, 'DeviceIntegration', d._id, {}); res.json({ ok: true });
});

/* ── what a device sends (key-authenticated, no sign-in) ── */
exports.deviceAuth = async (req, res, next) => {
  try {
    const id = req.get('X-Device-Id'); const key = req.get('X-Device-Key'); if (!id || !key || !/^[a-f0-9]{24}$/i.test(id)) return res.status(401).json({ message: 'Device id and key are required.' });
    const d = await DeviceIntegration.findOne({ _id: oid(id) }); if (!d || !d.keyHash || !K.sameHash(K.hashKey(key), d.keyHash)) return res.status(401).json({ message: 'Device not recognised.' });
    if (d.status !== 'Active') return res.status(403).json({ message: 'This device is switched off.', reason: 'device_disabled' }); if (d.keyExpiresAt && new Date(d.keyExpiresAt) < new Date()) return res.status(403).json({ message: 'This device key has expired. Ask for a new one.', reason: 'key_expired' });
    const p = await SecurityPilot.findOne({ _id: d.pilotId }); if (!p || p.status !== 'Active') return res.status(403).json({ message: 'The pilot for this device is not active, so it is not accepting events.', reason: 'pilot_not_active' });
    req.device = d; req.pilot = p; next();
  } catch (e) { console.error('device auth:', e.message); res.status(500).json({ message: 'Something went wrong.' }); }
};
const driftOf = (t) => { const x = new Date(t).getTime(); return Number.isFinite(x) ? (x - Date.now()) / 1000 : null; };
exports.heartbeat = wrap('heartbeat', async (req, res) => {
  const d = req.device; const drift = driftOf(req.body?.deviceTime); const set = { lastSeenAt: new Date(), offlineNotified: false }; if (drift !== null) set.driftSeconds = drift;
  const wasOffline = d.offlineNotified; await DeviceIntegration.updateOne({ _id: d._id }, { $set: set });
  if (wasOffline) await DeviceEvent.create({ schoolId: d.schoolId, deviceId: d._id, pilotId: d.pilotId, kind: 'online', at: new Date(), expiresAt: new Date(Date.now() + req.pilot.retentionDays * 86400000) });
  res.json({ ok: true, serverTime: new Date().toISOString(), driftSeconds: Math.round(drift ?? d.driftSeconds ?? 0), clockOk: Math.abs(drift ?? d.driftSeconds ?? 0) <= LIMITS.clockDriftSeconds });
});
exports.ingest = wrap('ingest', async (req, res) => {
  const d = req.device; const p = req.pilot; const rule = KINDS[p.kind]; const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length) throw new Fail(400, 'Send at least one event.'); if (events.length > LIMITS.maxBatch) throw new Fail(400, `Send at most ${LIMITS.maxBatch} events at a time.`);
  const drift = driftOf(req.body?.deviceTime); const out = { accepted: 0, held: 0, replayed: 0, rejected: [], ignoredFields: 0 };
  for (const [i, e] of events.entries()) {
    const rej = (reason) => out.rejected.push({ index: i, reason });
    if (!e || typeof e !== 'object' || Array.isArray(e)) { rej('bad_event'); continue; }
    if (K.biometric(e) || K.BIO.test(String(e.kind || '')) || K.BIO.test(String(e.method || ''))) { rej('biometric_data_refused'); continue; }
    out.ignoredFields += Object.keys(e).filter((k) => !K.ALLOWED.includes(k)).length;
    const kind = String(e.kind || ''); if (!rule.events.includes(kind)) { rej('kind_not_allowed'); continue; }
    const at = new Date(e.at); if (Number.isNaN(at.getTime())) { rej('bad_time'); continue; } if (at.getTime() > Date.now() + 600000) { rej('future_time'); continue; } if (at.getTime() < Date.now() - 7 * 86400000) { rej('too_old'); continue; }
    const badgeId = txt(e.badgeId, 40); const ref = txt(e.ref, 60); const key = K.sha([String(d._id), kind, at.toISOString(), ref, badgeId]);
    if (await DeviceEvent.findOne({ schoolId: d.schoolId, eventKey: key })) { out.replayed++; continue; }
    const meta = {}; if (kind === 'count') { const n = Number(e.count); if (!Number.isInteger(n) || n < 0 || n > 100000) { rej('bad_count'); continue; } meta.count = n; }
    if (e.zone) meta.zone = txt(e.zone, 40); if (e.door) meta.door = txt(e.door, 40); if (e.note) meta.note = txt(e.note, 120); if (Number.isFinite(Number(e.battery))) meta.battery = Math.max(0, Math.min(100, Number(e.battery)));
    const flags = []; if (Math.abs(drift ?? d.driftSeconds ?? 0) > LIMITS.clockDriftSeconds) flags.push('clock-drift');
    let studentId = null; let state = 'info'; let confidence = null; let evidenceId = null;
    if (kind === 'badge_scan' || kind === 'qr_scan') {
      if (!badgeId) { rej('no_badge'); continue; } const st = await Student.findOne({ schoolId: d.schoolId, badgeId, isActive: { $ne: false } }).select('name'); if (!st) { rej('unknown_badge'); continue; }
      if (p.consentRequired && !(await Consent.hasConsent(d.schoolId, st._id, CONSENT))) { rej('no_consent'); continue; }
      studentId = st._id; if (e.confidence !== undefined) { confidence = Number(e.confidence); if (!(confidence >= 0 && confidence <= 1)) { rej('bad_confidence'); continue; } }
      if (await DeviceEvent.findOne({ schoolId: d.schoolId, deviceId: d._id, studentId, at: { $gte: new Date(at.getTime() - 60000), $lte: new Date(at.getTime() + 60000) } })) flags.push('suspect-duplicate');
      if (confidence !== null && confidence < p.lowConfidence) { state = 'held'; flags.push('low-confidence'); } else state = 'used';
    }
    const ev = await DeviceEvent.create({ schoolId: d.schoolId, deviceId: d._id, pilotId: p._id, kind, at, studentId, direction: e.direction === 'out' ? 'out' : e.direction === 'in' ? 'in' : '', confidence, meta, flags, state, eventKey: key, expiresAt: new Date(at.getTime() + p.retentionDays * 86400000) });
    // a scan is extra evidence that a child arrived. It never marks the child absent, and never marks a lesson.
    if (state === 'used') { const a = await AttendanceEvidence.create({ schoolId: d.schoolId, kind: 'badge', studentId, deviceId: null, direction: ev.direction || 'in', occurredAt: at, status: 'Info', flags: ['security-pilot', ...flags], badgeId: '' }); await DeviceEvent.updateOne({ _id: ev._id }, { $set: { evidenceId: a._id } }); }
    if (state === 'held') out.held++; else out.accepted++;
  }
  const set = { lastSeenAt: new Date(), lastEventAt: new Date(), offlineNotified: false }; if (drift !== null) set.driftSeconds = drift; await DeviceIntegration.updateOne({ _id: d._id }, { $set: set });
  res.status(201).json({ ...out, note: 'Only metadata is kept. Scans are extra evidence of arrival and never mark a child absent.' });
});

/* ── events held for a person to look at ── */
const eView = (e, names) => ({ id: e._id, kind: e.kind, at: e.at, deviceId: e.deviceId, deviceName: names?.get(String(e.deviceId)) || '', studentId: e.studentId, confidence: e.confidence, flags: e.flags, state: e.state, meta: e.meta, decidedByName: e.decidedByName });
exports.events = wrap('events', async (req, res) => {
  const schoolId = sid(req); const q = { schoolId }; if (req.query.state) q.state = String(req.query.state); if (req.query.deviceId) q.deviceId = toId(req.query.deviceId, 'The device'); if (req.query.kind) q.kind = String(req.query.kind);
  const es = await DeviceEvent.find(q).sort({ at: -1 }).limit(300); const names = new Map((await DeviceIntegration.find({ schoolId }).select('name')).map((d) => [String(d._id), d.name]));
  const sts = new Map((await Student.find({ _id: { $in: es.map((e) => e.studentId).filter(Boolean) } }).select('name')).map((s) => [String(s._id), s.name]));
  res.json({ events: es.map((e) => ({ ...eView(e, names), studentName: e.studentId ? sts.get(String(e.studentId)) || '' : '' })) });
});
exports.decideEvent = wrap('decideEvent', async (req, res) => {
  const schoolId = sid(req); const e = await DeviceEvent.findOne({ _id: toId(req.params.id, 'The event'), schoolId }); if (!e) throw new Fail(404, 'Event not found.'); if (e.state !== 'held') throw new Fail(409, 'This event is not waiting for a decision.');
  const decision = String(req.body?.decision || ''); if (!['use', 'dismiss'].includes(decision)) throw new Fail(422, 'Choose use or dismiss.'); const note = txt(req.body?.note, 200); if (note.length < 5) throw new Fail(422, 'Write why.');
  const r = await DeviceEvent.updateOne({ _id: e._id, state: 'held' }, { $set: { state: decision === 'use' ? 'used' : 'dismissed', decidedByName: nameOf(req), decidedAt: new Date() } }); if (!r.matchedCount) throw new Fail(409, 'Someone else already decided this.');
  if (decision === 'use') { const a = await AttendanceEvidence.create({ schoolId, kind: 'badge', studentId: e.studentId, direction: e.direction || 'in', occurredAt: e.at, status: 'Info', flags: ['security-pilot', 'reviewed'], badgeId: '' }); await DeviceEvent.updateOne({ _id: e._id }, { $set: { evidenceId: a._id } }); }
  await K.note(req, `event.${decision}`, 'DeviceEvent', e._id, {}); res.json({ ok: true });
});

/* ───────────────────────── incidents ───────────────────────── */
const isLeadish = async (user) => (await K.holds(user, K.PERM.lead)) || (await K.holds(user, K.PERM.dpo));
const canSee = async (req, inc) => String(inc.createdById) === String(req.user.userId) || (inc.viewers || []).some((v) => String(v) === String(req.user.userId)) || (await isLeadish(req.user));
const iView = (i) => ({ id: i._id, no: i.no, title: i.title, description: i.description, occurredAt: i.occurredAt, location: i.location, severity: i.severity, status: i.status, viewers: (i.viewerNames || []), items: (i.items || []).map((x) => ({ id: x.id, kind: x.kind, ref: x.ref, checksum: x.checksum, note: x.note, addedByName: x.addedByName, at: x.at })), legalHold: i.legalHold ? { reason: i.legalHold.reason, byName: i.legalHold.byName, at: i.legalHold.at } : null, retentionUntil: i.retentionUntil, closedAt: i.closedAt, destroyedAt: i.destroyedAt, destruction: i.destruction ? { at: i.destruction.at, items: i.destruction.items, certificate: i.destruction.certificate } : null, createdByName: i.createdByName, createdAt: i.createdAt });
const find = async (req) => { const i = await IncidentEvidence.findOne({ _id: toId(req.params.id, 'The incident'), schoolId: sid(req) }); if (!i || !(await canSee(req, i))) throw new Fail(404, 'Incident not found.'); return i; };
exports.incidents = wrap('incidents', async (req, res) => {
  const all = await IncidentEvidence.find({ schoolId: sid(req) }).sort({ createdAt: -1 }).limit(300); const out = []; for (const i of all) if (await canSee(req, i)) out.push({ id: i._id, no: i.no, title: i.title, severity: i.severity, status: i.status, occurredAt: i.occurredAt, items: (i.items || []).length, legalHold: !!i.legalHold, retentionUntil: i.retentionUntil });
  res.json({ incidents: out });
});
exports.addIncident = wrap('addIncident', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const title = txt(b.title, 160); if (title.length < 4) throw new Fail(422, 'Give the incident a title.'); const at = new Date(b.occurredAt); if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60000) throw new Fail(422, 'Give when it happened (not in the future).');
  const i = await IncidentEvidence.create({ schoolId, no: await K.nextNo(schoolId, 'INC'), title, description: txt(b.description, 2000), occurredAt: at, location: txt(b.location, 120), severity: ['low', 'medium', 'high'].includes(b.severity) ? b.severity : 'medium', createdById: oid(req.user.userId), createdByName: nameOf(req) });
  await log(req, i._id, 'created'); await K.note(req, 'incident.add', 'IncidentEvidence', i._id, {}); res.status(201).json({ incident: iView(i) });
});
exports.incident = wrap('incident', async (req, res) => { const i = await find(req); await log(req, i._id, 'viewed'); res.json({ incident: iView(i) }); });
exports.setViewers = wrap('setViewers', async (req, res) => {
  const i = await find(req); if (i.status === 'Destroyed') throw new Fail(409, 'This evidence has been destroyed.'); const ids = (Array.isArray(req.body?.userIds) ? req.body.userIds : []).slice(0, 10); const people = [];
  for (const id of ids) { const p = await K.person(sid(req), id); if (!p) throw new Fail(404, 'Every viewer must be a member of staff here.'); people.push(p); }
  await IncidentEvidence.updateOne({ _id: i._id }, { $set: { viewers: people.map((p) => p.id), viewerNames: people.map((p) => p.name) } }); await log(req, i._id, 'viewers changed', { count: people.length }); res.json({ ok: true, viewers: people.map((p) => p.name) });
});
exports.addItem = wrap('addItem', async (req, res) => {
  const i = await find(req); if (i.status !== 'Open') throw new Fail(409, 'Evidence cannot be added once the incident is closed.'); const b = req.body || {};
  const kind = ['clip', 'photo', 'log', 'note'].includes(b.kind) ? b.kind : null; if (!kind) throw new Fail(422, 'Choose clip, photo, log or note.');
  const ref = String(b.ref || '').trim(); if (ref.length < 3 || ref.length > 300 || /^data:/i.test(ref) || /[\r\n]/.test(ref)) throw new Fail(422, 'Say where the item is kept (a place or link). The file itself is not stored here.');
  if (/^https?:\/\/[^/]*@/i.test(ref)) throw new Fail(422, 'A link must not carry a password.'); if (!K.hex64(b.checksum)) throw new Fail(422, 'Give the SHA-256 checksum of the file, 64 hexadecimal characters.');
  if (i.items.length >= 100) throw new Fail(409, 'That is enough items for one incident.'); const item = { id: `i-${require('crypto').randomBytes(3).toString('hex')}`, kind, ref, checksum: String(b.checksum).toLowerCase(), note: txt(b.note, 200), deviceId: b.deviceId || null, addedByName: nameOf(req), at: new Date() };
  await IncidentEvidence.updateOne({ _id: i._id, status: 'Open' }, { $set: { items: [...i.items, item] } }); await log(req, i._id, 'item added', { itemId: item.id, kind }); res.status(201).json({ item });
});
exports.closeIncident = wrap('closeIncident', async (req, res) => {
  const i = await find(req); if (i.status !== 'Open') throw new Fail(409, 'This incident is already closed.'); const days = Number(req.body?.retentionDays ?? LIMITS.incidentRetentionDays); if (!Number.isInteger(days) || days < LIMITS.minIncidentRetention || days > LIMITS.maxIncidentRetention) throw new Fail(422, `Keep evidence for ${LIMITS.minIncidentRetention} to ${LIMITS.maxIncidentRetention} days after closing.`);
  const note = txt(req.body?.note, 300); if (note.length < 10) throw new Fail(422, 'Write how the incident ended.'); const r = await IncidentEvidence.updateOne({ _id: i._id, status: 'Open' }, { $set: { status: 'Closed', closedAt: new Date(), retentionUntil: K.addDays(K.day(), days) } }); if (!r.matchedCount) throw new Fail(409, 'Someone else closed this.');
  await log(req, i._id, 'closed', { note, days }); await K.note(req, 'incident.close', 'IncidentEvidence', i._id, { days }); res.json({ ok: true, retentionUntil: K.addDays(K.day(), days) });
});
exports.hold = wrap('hold', async (req, res) => {
  const i = await find(req); if (i.status === 'Destroyed') throw new Fail(409, 'This evidence has been destroyed.'); if (i.legalHold) throw new Fail(409, 'A legal hold is already in place.'); const reason = txt(req.body?.reason, 300); if (reason.length < 10) throw new Fail(422, 'Say what the hold is for (a case, a request, a court order).');
  const r = await IncidentEvidence.updateOne({ _id: i._id, legalHold: null }, { $set: { legalHold: { reason, byName: nameOf(req), byId: String(req.user.userId), at: new Date() } } }); if (!r.matchedCount) throw new Fail(409, 'A legal hold is already in place.');
  await log(req, i._id, 'legal hold set', { reason }); await K.note(req, 'incident.hold', 'IncidentEvidence', i._id, { reason }); res.json({ ok: true });
});
// Lifting a hold is a second person's decision, because it is what lets destruction happen.
exports.release = wrap('release', async (req, res) => {
  const i = await find(req); if (!i.legalHold) throw new Fail(409, 'There is no legal hold on this.'); if (!(await K.holds(req.user, K.PERM.dpo))) throw new Fail(403, 'Only the data protection officer can lift a legal hold.');
  const reason = txt(req.body?.reason, 300); if (reason.length < 10) throw new Fail(422, 'Say why the hold can end.'); const sole = await S.separate(ctxOf(req), i.legalHold.byId, 'Lifting a legal hold');
  const r = await IncidentEvidence.updateOne({ _id: i._id, status: i.status }, { $set: { legalHold: null } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this.'); await log(req, i._id, 'legal hold lifted', { reason, soleAdmin: sole }); await K.note(req, 'incident.release', 'IncidentEvidence', i._id, { soleAdmin: sole }); res.json({ ok: true, soleAdmin: sole });
});
exports.access = wrap('access', async (req, res) => { const i = await find(req); res.json({ access: (await EvidenceAccess.find({ schoolId: sid(req), incidentId: i._id }).sort({ createdAt: -1 }).limit(500)).map((a) => ({ at: a.createdAt, action: a.action, byName: a.byName, byRole: a.byRole, detail: a.detail })) }); });

/* ── handing evidence to someone outside ── */
const xView = (x) => ({ id: x._id, incidentId: x.incidentId, incidentNo: x.incidentNo, itemIds: x.itemIds, purpose: x.purpose, recipient: x.recipient, status: x.status, requestedByName: x.requestedByName, approvals: (x.approvals || []).map((a) => ({ byName: a.byName, role: a.role, at: a.at })), rejection: x.rejection, soleAdmin: x.soleAdmin, manifestHash: x.manifestHash, fulfilledAt: x.fulfilledAt, expiresAt: x.expiresAt });
exports.exportsList = wrap('exportsList', async (req, res) => { const q = { schoolId: sid(req) }; if (req.query.status) q.status = String(req.query.status); res.json({ exports: (await EvidenceExport.find(q).sort({ createdAt: -1 }).limit(200)).map(xView) }); });
exports.askExport = wrap('askExport', async (req, res) => {
  const i = await find(req); if (i.status === 'Destroyed') throw new Fail(409, 'This evidence has been destroyed.'); const purpose = txt(req.body?.purpose, 400); const recipient = txt(req.body?.recipient, 160); if (purpose.length < 15) throw new Fail(422, 'Say why the evidence is needed (for example the police report number).'); if (recipient.length < 3) throw new Fail(422, 'Say who will receive it.');
  const ids = Array.isArray(req.body?.itemIds) && req.body.itemIds.length ? req.body.itemIds.map(String) : i.items.map((x) => x.id); const have = new Set(i.items.map((x) => x.id)); if (!ids.length) throw new Fail(422, 'There is nothing in this incident to export.'); if (ids.some((x) => !have.has(x))) throw new Fail(422, 'One of the items is not part of this incident.');
  const x = await EvidenceExport.create({ schoolId: sid(req), incidentId: i._id, incidentNo: i.no, itemIds: ids, purpose, recipient, requestedById: oid(req.user.userId), requestedByName: nameOf(req), expiresAt: new Date(Date.now() + LIMITS.exportExpiryDays * 86400000) });
  await log(req, i._id, 'export requested', { exportId: String(x._id), recipient }); await tell(sid(req), await leads(sid(req)), 'Evidence export needs two approvals', `${i.no} to ${recipient}`, '/admin?tab=security', `exp-${x._id}`); res.status(201).json({ export: xView(x) });
});
// Two different people approve, neither the one who asked. Each must hold the security lead or data protection officer role.
exports.decideExport = wrap('decideExport', async (req, res) => {
  const schoolId = sid(req); const x = await EvidenceExport.findOne({ _id: toId(req.params.id, 'The export'), schoolId }); if (!x) throw new Fail(404, 'Export not found.'); if (x.status !== 'Requested') throw new Fail(409, `This export is ${x.status.toLowerCase()}.`); if (new Date(x.expiresAt) < new Date()) throw new Fail(409, 'This request has expired. Ask again.');
  if (!(await isLeadish(req.user))) throw new Fail(403, 'Only the security lead or the data protection officer can decide.'); const decision = String(req.body?.decision || ''); if (!['approve', 'reject'].includes(decision)) throw new Fail(422, 'Choose approve or reject.'); const note = txt(req.body?.note, 300);
  const me = String(req.user.userId); const sole = await S.sole(schoolId); if (!sole && String(x.requestedById) === me) throw new Fail(403, 'You asked for this export, so someone else must decide it.', { reason: 'maker_checker' });
  if (decision === 'reject') { if (note.length < 5) throw new Fail(422, 'Say why.'); const r = await EvidenceExport.updateOne({ _id: x._id, status: 'Requested' }, { $set: { status: 'Rejected', rejection: { byName: nameOf(req), note, at: new Date() } } }); if (!r.matchedCount) throw new Fail(409, 'Someone else decided this.'); await K.note(req, 'export.reject', 'EvidenceExport', x._id, {}); return res.json({ ok: true, status: 'Rejected' }); }
  if ((x.approvals || []).some((a) => String(a.byId) === me)) throw new Fail(409, 'You have already approved this.');
  const approvals = [...(x.approvals || []), { byId: oid(me), byName: nameOf(req), at: new Date(), note }]; const need = sole ? 1 : 2; const done = approvals.length >= need;
  const r = await EvidenceExport.updateOne({ _id: x._id, status: 'Requested', rev: x.rev || 0 }, { $set: { approvals, rev: (x.rev || 0) + 1, status: done ? 'Approved' : 'Requested', soleAdmin: done && sole } }); if (!r.matchedCount) throw new Fail(409, 'Someone else just decided. Reload it.');
  await IncidentEvidence.findOne({ _id: x.incidentId }).then((i) => i && EvidenceAccess.create({ schoolId, incidentId: i._id, action: done ? 'export approved' : 'export approval 1', byId: oid(me), byName: nameOf(req), byRole: req.user.role, detail: { exportId: String(x._id) } }));
  await K.note(req, 'export.approve', 'EvidenceExport', x._id, { done, soleAdmin: done && sole }); res.json({ ok: true, status: done ? 'Approved' : 'Requested', approvals: approvals.length, needed: need, soleAdmin: done && sole });
});
// Handing over: a list of what is released with its checksums, made once.
exports.fulfilExport = wrap('fulfilExport', async (req, res) => {
  const schoolId = sid(req); const x = await EvidenceExport.findOne({ _id: toId(req.params.id, 'The export'), schoolId }); if (!x) throw new Fail(404, 'Export not found.'); if (x.status !== 'Approved') throw new Fail(409, x.status === 'Fulfilled' ? 'This was already handed over.' : 'It needs approval first.'); if (new Date(x.expiresAt) < new Date()) throw new Fail(409, 'This approval has expired. Ask again.');
  if (String(x.requestedById) !== String(req.user.userId) && !(await isLeadish(req.user))) throw new Fail(403, 'Only the person who asked or a lead can hand it over.');
  const i = await IncidentEvidence.findOne({ _id: x.incidentId, schoolId }); if (!i || i.status === 'Destroyed') throw new Fail(409, 'This evidence has been destroyed.'); const items = i.items.filter((t) => x.itemIds.includes(t.id));
  const manifest = { incident: i.no, title: i.title, occurredAt: i.occurredAt, purpose: x.purpose, recipient: x.recipient, items: items.map((t) => ({ id: t.id, kind: t.kind, ref: t.ref, sha256: t.checksum, note: t.note })), approvedBy: x.approvals.map((a) => a.byName), requestedBy: x.requestedByName, madeAt: new Date().toISOString() }; const hash = K.sha(manifest);
  const r = await EvidenceExport.updateOne({ _id: x._id, status: 'Approved' }, { $set: { status: 'Fulfilled', manifest, manifestHash: hash, fulfilledAt: new Date(), fulfilledByName: nameOf(req) } }); if (!r.matchedCount) throw new Fail(409, 'Someone else already handed this over.');
  await log(req, i._id, 'export handed over', { exportId: String(x._id), recipient: x.recipient, items: items.length, hash }); await K.note(req, 'export.fulfil', 'EvidenceExport', x._id, { hash }); res.json({ manifest, manifestHash: hash });
});

/* ───────────────────────── families and appeals ───────────────────────── */
const myKids = async (req) => { const schoolId = sid(req); if (req.user.role === 'student') return [oid(req.user.userId)]; const p = await Parent.findOne({ _id: oid(req.user.userId), schoolId }).select('children'); return (p?.children || []).map(String).map(oid); };
exports.mySignals = wrap('mySignals', async (req, res) => {
  const schoolId = sid(req); const kids = await myKids(req); const sts = await Student.find({ _id: { $in: kids }, schoolId }).select('name'); const names = new Map((await DeviceIntegration.find({ schoolId }).select('name location')).map((d) => [String(d._id), d]));
  const pilots = await SecurityPilot.find({ schoolId, status: 'Active', consentRequired: true }).select('title purpose retentionDays manualAlternative'); const out = [];
  for (const s of sts) { const c = await Consent.check(schoolId, 'student', s._id, CONSENT); const es = await DeviceEvent.find({ schoolId, studentId: s._id }).sort({ at: -1 }).limit(60); out.push({ studentId: s._id, name: s.name, consent: c.state, signals: es.map((e) => ({ id: e._id, at: e.at, kind: e.kind, place: names.get(String(e.deviceId))?.location || names.get(String(e.deviceId))?.name || '', state: e.state })) }); }
  res.json({ children: out, pilots: pilots.map((p) => ({ title: p.title, purpose: p.purpose, retentionDays: p.retentionDays, manualAlternative: p.manualAlternative })), note: 'A scan is only extra evidence of arrival. It never marks a child absent and never leads to a sanction on its own.' });
});
exports.appeals = wrap('appeals', async (req, res) => { const q = { schoolId: sid(req) }; if (req.query.status) q.status = String(req.query.status); res.json({ appeals: await SecurityAppeal.find(q).sort({ createdAt: -1 }).limit(200) }); });
async function raise(req, type, kids) {
  const schoolId = sid(req); const b = req.body || {}; const statement = txt(b.statement, 1500); if (statement.length < 15) throw new Fail(422, 'Tell us what you think is wrong.');
  const about = ['signal', 'incident', 'other'].includes(b.about) ? b.about : 'signal'; let studentId = null; let originalById = null; let originalByName = '';
  if (kids) { studentId = b.studentId ? toId(b.studentId, 'The child') : kids[0]; if (!kids.some((k) => String(k) === String(studentId))) throw new Fail(403, 'You can only ask about your own child.'); }
  if (about === 'signal' && b.aboutId) { const e = await DeviceEvent.findOne({ _id: toId(b.aboutId, 'The signal'), schoolId }); if (!e) throw new Fail(404, 'That signal was not found.'); if (kids && String(e.studentId) !== String(studentId)) throw new Fail(403, 'You can only ask about your own child.'); studentId = studentId || e.studentId; }
  const a = await SecurityAppeal.create({ schoolId, no: await K.nextNo(schoolId, 'APL'), requesterType: type, requesterId: oid(req.user.userId), requesterName: nameOf(req), studentId, about, aboutId: String(b.aboutId || ''), statement, originalById, originalByName: txt(b.originalByName, 100) || originalByName });
  if (type === 'staff' && b.originalById) { const p = await K.person(schoolId, b.originalById); if (p) await SecurityAppeal.updateOne({ _id: a._id }, { $set: { originalById: p.id, originalByName: p.name } }); }
  await tell(schoolId, await leads(schoolId), 'A challenge about a security device needs an answer', a.no, '/admin?tab=security', `apl-${a._id}`); return a;
}
exports.myAppeal = wrap('myAppeal', async (req, res) => { const kids = await myKids(req); res.status(201).json({ appeal: await raise(req, req.user.role === 'parent' ? 'parent' : 'student', kids) }); });
exports.addAppeal = wrap('addAppeal', async (req, res) => res.status(201).json({ appeal: await raise(req, 'staff', null) }));
exports.myAppeals = wrap('myAppeals', async (req, res) => res.json({ appeals: (await SecurityAppeal.find({ schoolId: sid(req), requesterId: oid(req.user.userId) }).sort({ createdAt: -1 }).limit(50)).map((a) => ({ no: a.no, statement: a.statement, status: a.status, decision: a.decision, createdAt: a.createdAt })) }));
exports.decideAppeal = wrap('decideAppeal', async (req, res) => {
  const schoolId = sid(req); const a = await SecurityAppeal.findOne({ _id: toId(req.params.id, 'The appeal'), schoolId }); if (!a) throw new Fail(404, 'Appeal not found.'); if (a.status !== 'Open') throw new Fail(409, `This was already ${a.status.toLowerCase()}.`);
  const decision = String(req.body?.decision || ''); if (!['uphold', 'reject'].includes(decision)) throw new Fail(422, 'Choose uphold or reject.'); const note = txt(req.body?.note, 400); if (note.length < 10) throw new Fail(422, 'Explain the decision so the person can understand it.');
  const me = String(req.user.userId); const sole = await S.sole(schoolId);
  if (a.originalById && String(a.originalById) === me && !sole) throw new Fail(403, 'You were part of the decision being challenged, so someone else must decide.', { reason: 'maker_checker' }); if (a.requesterType === 'staff' && String(a.requesterId) === me && !sole) throw new Fail(403, 'You raised this, so someone else must decide.', { reason: 'maker_checker' });
  const r = await SecurityAppeal.updateOne({ _id: a._id, status: 'Open' }, { $set: { status: decision === 'uphold' ? 'Upheld' : 'Rejected', decidedById: oid(me), decidedByName: nameOf(req), decidedAt: new Date(), decision: note, soleAdmin: sole && !!(a.originalById && String(a.originalById) === me) } }); if (!r.matchedCount) throw new Fail(409, 'Someone else already decided this.');
  if (decision === 'uphold' && a.about === 'signal' && a.aboutId) { const e = await DeviceEvent.findOne({ _id: oid(a.aboutId), schoolId }); if (e) { if (e.evidenceId) await AttendanceEvidence.deleteOne({ _id: e.evidenceId }); await DeviceEvent.updateOne({ _id: e._id }, { $set: { state: 'dismissed', evidenceId: null, decidedByName: nameOf(req), decidedAt: new Date() } }); } }
  await K.note(req, `appeal.${decision}`, 'SecurityAppeal', a._id, {}); const to = a.requesterType === 'parent' ? 'parent' : a.requesterType === 'student' ? 'student' : 'admin'; await tell(schoolId, [{ id: a.requesterId, role: to }], `Your challenge was ${decision === 'uphold' ? 'upheld' : 'not upheld'}`, note, '/', `aplr-${a._id}`);
  res.json({ ok: true, status: decision === 'uphold' ? 'Upheld' : 'Rejected' });
});

/* ───────────────────────── overview and sweep ───────────────────────── */
exports.overview = wrap('overview', async (req, res) => {
  const schoolId = sid(req); const [pilots, devices, held, incidents, exps, appeals] = await Promise.all([SecurityPilot.find({ schoolId }).select('status reviewOn'), DeviceIntegration.find({ schoolId, status: 'Active' }).select('lastSeenAt'), DeviceEvent.countDocuments({ schoolId, state: 'held' }), IncidentEvidence.countDocuments({ schoolId, status: 'Open' }), EvidenceExport.countDocuments({ schoolId, status: 'Requested' }), SecurityAppeal.countDocuments({ schoolId, status: 'Open' })]);
  const lim = LIMITS.offlineMinutes * 60000; const by = (s) => pilots.filter((p) => p.status === s).length;
  res.json({ pilotsActive: by('Active'), pilotsWaiting: by('Review'), pilotsPaused: by('Paused'), reviewsDue: pilots.filter((p) => p.status === 'Active' && p.reviewOn <= K.addDays(K.day(), 14)).length, devices: devices.length, devicesOffline: devices.filter((d) => !d.lastSeenAt || Date.now() - new Date(d.lastSeenAt).getTime() > lim).length, heldSignals: held, openIncidents: incidents, exportsWaiting: exps, appealsOpen: appeals });
});
exports.sweepSchool = async (schoolId) => {
  const out = { paused: 0, eventsDeleted: 0, offline: 0, exportsExpired: 0, destroyed: 0 }; const today = K.day(); const admins = await leads(schoolId);
  for (const p of await SecurityPilot.find({ schoolId, status: 'Active', reviewOn: { $lte: today } }).limit(200)) { const r = await SecurityPilot.updateOne({ _id: p._id, status: 'Active' }, { $set: { status: 'Paused', pausedReason: 'The review date passed without a review.', history: [...p.history, { at: new Date(), byName: 'system', action: 'paused', note: 'Review date passed' }] } }); if (r.matchedCount) { out.paused++; await tell(schoolId, admins, 'A security pilot was paused', `${p.title}: its review date passed. Devices stop being accepted until it is reviewed.`, '/admin?tab=security', `pilot-paused-${p._id}-${p.reviewOn}`); } }
  const gone = await DeviceEvent.deleteMany({ schoolId, expiresAt: { $lt: new Date() }, state: { $ne: 'held' } }); out.eventsDeleted = gone?.deletedCount || 0;
  const lim = new Date(Date.now() - LIMITS.offlineMinutes * 60000);
  for (const d of await DeviceIntegration.find({ schoolId, status: 'Active', offlineNotified: false }).limit(500)) {
    const seen = d.lastSeenAt || d.createdAt; if (new Date(seen) >= lim) continue; const p = await SecurityPilot.findOne({ _id: d.pilotId }).select('status retentionDays'); if (!p || p.status !== 'Active') continue;
    const r = await DeviceIntegration.updateOne({ _id: d._id, offlineNotified: false }, { $set: { offlineNotified: true } }); if (!r.matchedCount) continue;
    await DeviceEvent.create({ schoolId, deviceId: d._id, pilotId: d.pilotId, kind: 'offline', at: new Date(), flags: ['silent'], expiresAt: new Date(Date.now() + p.retentionDays * 86400000) }); out.offline++; await tell(schoolId, admins, 'A device has gone quiet', `${d.name} has not been heard from for ${LIMITS.offlineMinutes} minutes.`, '/admin?tab=security', `dev-off-${d._id}-${today}`);
  }
  out.exportsExpired = (await EvidenceExport.updateMany({ schoolId, status: { $in: ['Requested', 'Approved'] }, expiresAt: { $lt: new Date() } }, { $set: { status: 'Expired' } }))?.modifiedCount || 0;
  for (const i of await IncidentEvidence.find({ schoolId, status: 'Closed', retentionUntil: { $lte: today, $ne: '' } }).limit(200)) {
    if (i.legalHold) continue; const cert = K.sha({ no: i.no, items: i.items.map((x) => x.checksum), at: today });
    const r = await IncidentEvidence.updateOne({ _id: i._id, status: 'Closed', legalHold: null }, { $set: { status: 'Destroyed', destroyedAt: new Date(), description: '', items: i.items.map((x) => ({ id: x.id, kind: x.kind, ref: '', checksum: x.checksum, note: '', at: x.at })), destruction: { at: new Date(), items: i.items.length, certificate: cert } } });
    if (r.matchedCount) { out.destroyed++; await EvidenceAccess.create({ schoolId, incidentId: i._id, action: 'destroyed', byName: 'system', byRole: 'system', detail: { certificate: cert } }); await tell(schoolId, admins, 'Incident evidence was destroyed on schedule', `${i.no}: kept until ${i.retentionUntil}. Please destroy the stored files named in it.`, '/admin?tab=security', `inc-destroy-${i._id}`); }
  }
  return out;
};

// what the signed-in person may do here, so the screen shows only what works for them
exports.me = wrap('me', async (req, res) => {
  const [lead, dpo, operate] = await Promise.all([K.holds(req.user, K.PERM.lead), K.holds(req.user, K.PERM.dpo), K.holds(req.user, K.PERM.operate)]);
  res.json({ lead: !!lead, dpo: !!dpo, operate: !!(operate || lead || dpo), either: !!(lead || dpo) });
});
