// Alumni, events, giving and campaigns (PRD E32). Contact only where a person agreed; gifts are never edited; a restricted fund is only spent on what its donors allowed.
const crypto = require('crypto');
const AlumniProfile = require('../models/AlumniProfile');
const AlumniEvent = require('../models/AlumniEvent');
const AlumniRsvp = require('../models/AlumniRsvp');
const GivingFund = require('../models/GivingFund');
const FundraisingCampaign = require('../models/FundraisingCampaign');
const DonorPledge = require('../models/DonorPledge');
const DonorGift = require('../models/DonorGift');
const FundSpend = require('../models/FundSpend');
const DocCounter = require('../models/DocCounter');
const Student = require('../models/Student');
const School = require('../models/School');
const V = require('../utils/advancement/service');

const { S, Fail, oid, sid, txt, email, phone, money } = V;
const wrap = S.wrap; const bad = S.bad;
const ctxOf = (req) => S.ctxOf(req);
const who = (req) => ({ id: oid(req.user.userId), name: req.actorName || req.user.name || '' });
const nameOf = (req) => req.actorName || req.user.name || '';
const tell = async (schoolId, recipients, title, body, link, key = '') => { try { await S.N.notify({ schoolId, recipients, title, body, link, type: 'advancement', key }); } catch (e) { console.error('advancement notify:', e.message); } };
const num = (v, name, { min = 0, max = 1e9, int = false } = {}) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) throw new Fail(422, `${name} is not a valid number.`); return int ? n : money(n); };
const toId = (v, name) => { try { return oid(v); } catch (e) { throw new Fail(422, `${name} is not valid.`); } };
const CHANNELS = ['email', 'phone'];
const METHODS = ['cash', 'bank', 'jazzcash', 'easypaisa', 'cheque', 'other'];
const KINDS = ['individual', 'family', 'company', 'organisation', 'alumni'];

/* ───────────────────────── alumni ───────────────────────── */
// What staff may see of a graduate. Contact only while the person agreed; the profile only if they chose to be listed.
const staffView = (a) => ({
  id: a._id, name: a.name, gradYear: a.gradYear, classLabel: a.classLabel, state: a.state, createdAt: a.createdAt,
  consent: { contact: !!a.consent?.contact, channels: a.consent?.channels || [], directory: a.consent?.directory || 'hidden', events: !!a.consent?.events, source: a.consent?.source || '', updatedAt: a.consent?.updatedAt || null },
  contact: a.consent?.contact ? { email: a.contact?.email || '', phone: a.contact?.phone || '' } : null,
  profile: a.consent?.directory === 'visible' ? (a.profile || {}) : null,
  answeredEmployment: !!a.employment?.answeredAt,
});
const selfView = (a) => ({
  name: a.name, gradYear: a.gradYear, classLabel: a.classLabel, state: a.state,
  consent: { contact: !!a.consent?.contact, channels: a.consent?.channels || [], directory: a.consent?.directory || 'hidden', events: !!a.consent?.events },
  contact: a.consent?.contact ? a.contact || {} : {}, profile: a.profile || {}, employment: a.employment?.answeredAt ? a.employment : null,
});
const findByToken = async (token) => {
  const p = V.parse(token); if (!p) return null;
  const rows = await AlumniProfile.find({ linkPrefix: p.prefix, state: { $in: ['Invited', 'Active'] } }).limit(5);
  return rows.find((r) => V.same(r.linkHash, p.hash)) || null;
};

exports.alumni = wrap('alumni', async (req, res) => {
  const schoolId = sid(req); const q = { schoolId };
  if (req.query.state) q.state = String(req.query.state);
  if (req.query.gradYear) q.gradYear = Number(req.query.gradYear);
  const rows = await AlumniProfile.find(q).sort({ gradYear: -1, name: 1 }).limit(1000);
  const needle = String(req.query.q || '').trim().toLowerCase();
  const list = rows.filter((a) => !needle || a.name.toLowerCase().includes(needle)).map(staffView);
  const counts = { invited: 0, active: 0, contactable: 0, listed: 0 };
  for (const a of rows) { if (a.state === 'Invited') counts.invited++; if (a.state === 'Active') counts.active++; if (a.consent?.contact) counts.contactable++; if (a.consent?.directory === 'visible') counts.listed++; }
  res.json({ counts, alumni: list });
});

async function newAlumnus(req, schoolId, body) {
  const name = txt(body.name, 120); if (name.length < 2) throw new Fail(422, 'Give the graduate\'s name.');
  const gradYear = Number(body.gradYear); const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(gradYear) || gradYear < 1950 || gradYear > thisYear) throw new Fail(422, 'The graduation year is not valid.');
  let studentId = null;
  if (body.studentId) {
    const st = await Student.findOne({ _id: toId(body.studentId, 'The student'), schoolId }).select('isActive name');
    if (!st) throw new Fail(404, 'That student is not in this school.');
    if (st.isActive !== false) throw new Fail(409, 'That student is still enrolled. Only people who have left can be listed as alumni.');
    studentId = st._id;
  }
  const l = V.link('al');
  const doc = await AlumniProfile.create({ schoolId, name, gradYear, classLabel: txt(body.classLabel, 60), studentId, state: 'Invited', linkHash: l.hash, linkPrefix: l.prefix, createdByName: nameOf(req) });
  return { doc, token: l.token };
}
exports.addAlumnus = wrap('addAlumnus', async (req, res) => {
  const { doc, token } = await newAlumnus(req, sid(req), req.body || {});
  await V.note(req, 'alumni.add', 'AlumniProfile', doc._id, { gradYear: doc.gradYear });
  res.status(201).json({ alumnus: staffView(doc), link: { token, path: `/alumni/${token}`, shownOnce: true } });
});
exports.addMany = wrap('addMany', async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length || rows.length > 200) throw new Fail(422, 'Send between 1 and 200 graduates at a time.');
  const out = []; const failed = [];
  for (let i = 0; i < rows.length; i++) {
    try { const { doc, token } = await newAlumnus(req, sid(req), rows[i] || {}); out.push({ id: doc._id, name: doc.name, gradYear: doc.gradYear, token }); } catch (e) { if (e instanceof Fail) failed.push({ row: i + 1, reason: e.message }); else throw e; }
  }
  await V.note(req, 'alumni.bulk', 'AlumniProfile', '', { added: out.length, failed: failed.length });
  res.status(201).json({ added: out.length, failed, links: out.map((o) => ({ ...o, path: `/alumni/${o.token}` })), shownOnce: true });
});
exports.newLink = wrap('newLink', async (req, res) => {
  const a = await AlumniProfile.findOne({ _id: toId(req.params.id, 'The graduate'), schoolId: sid(req) });
  if (!a) throw new Fail(404, 'Graduate not found.'); if (['Erased', 'Withdrawn'].includes(a.state)) throw new Fail(409, 'This person has asked not to be contacted.');
  const l = V.link('al'); await AlumniProfile.updateOne({ _id: a._id }, { $set: { linkHash: l.hash, linkPrefix: l.prefix } });
  await V.note(req, 'alumni.link', 'AlumniProfile', a._id, {});
  res.json({ link: { token: l.token, path: `/alumni/${l.token}`, shownOnce: true }, note: 'The old link no longer works.' });
});
// A member of staff records what a graduate said by phone or in person. The reason is kept, and the graduate can change it with their own link.
exports.recordConsent = wrap('recordConsent', async (req, res) => {
  const a = await AlumniProfile.findOne({ _id: toId(req.params.id, 'The graduate'), schoolId: sid(req) });
  if (!a) throw new Fail(404, 'Graduate not found.'); if (['Erased', 'Withdrawn'].includes(a.state)) throw new Fail(409, 'This person has asked not to be contacted.');
  const b = req.body || {}; const how = txt(b.how, 200); if (how.length < 5) throw new Fail(422, 'Write down how and when the graduate agreed.');
  await applyConsent(a, b, 'staff', how);
  await V.note(req, 'alumni.consent', 'AlumniProfile', a._id, { contact: !!b.contact, source: 'staff' });
  res.json({ alumnus: staffView(await AlumniProfile.findOne({ _id: a._id })) });
});
async function applyConsent(a, b, source, how = '') {
  const contact = !!b.contact; const channels = contact ? [...new Set((Array.isArray(b.channels) ? b.channels : []).map(String).filter((c) => CHANNELS.includes(c)))] : [];
  const e = contact ? email(b.email) : ''; const p = contact ? phone(b.phone) : '';
  if (contact && !channels.length) throw new Fail(422, 'Choose how you may be contacted: email or phone.');
  if (channels.includes('email') && !e) throw new Fail(422, 'Give a valid email address.'); if (channels.includes('phone') && !p) throw new Fail(422, 'Give a valid phone number.');
  const directory = b.directory === 'visible' ? 'visible' : 'hidden';
  const consent = { contact, channels, directory, events: contact && !!b.events, updatedAt: new Date(), source, note: how };
  const set = { consent, contact: contact ? { email: channels.includes('email') ? e : '', phone: channels.includes('phone') ? p : '' } : {}, state: 'Active' };
  if (!contact && directory !== 'visible') set.profile = {};
  await AlumniProfile.updateOne({ _id: a._id }, { $set: set });
}
exports.erase = wrap('erase', async (req, res) => {
  const a = await AlumniProfile.findOne({ _id: toId(req.params.id, 'The graduate'), schoolId: sid(req) });
  if (!a) throw new Fail(404, 'Graduate not found.');
  await eraseOne(a, 'Erased'); await V.note(req, 'alumni.erase', 'AlumniProfile', a._id, {});
  res.json({ ok: true, note: 'Contact details, profile and answers were removed. Their event answers were removed too.' });
});
async function eraseOne(a, state) {
  await AlumniProfile.updateOne({ _id: a._id }, { $set: { state, name: state === 'Erased' ? 'Removed' : a.name, contact: {}, profile: {}, employment: {}, consent: { contact: false, channels: [], directory: 'hidden', events: false, updatedAt: new Date(), source: 'erased', note: '' }, linkHash: '', linkPrefix: '', studentId: null } });
  await AlumniRsvp.deleteMany({ alumniId: a._id });
}
// Who may be written to: only people who agreed, only on the channel they chose, only for what they said yes to.
exports.audience = wrap('audience', async (req, res) => {
  const channel = String(req.query.channel || 'email'); if (!CHANNELS.includes(channel)) throw new Fail(422, 'Choose email or phone.');
  const forEvents = req.query.purpose === 'events';
  const rows = await AlumniProfile.find({ schoolId: sid(req), state: 'Active' }).sort({ gradYear: -1, name: 1 }).limit(5000);
  const list = rows.filter((a) => a.consent?.contact && (a.consent.channels || []).includes(channel) && (!forEvents || a.consent.events) && (a.contact?.[channel]));
  await V.note(req, 'alumni.audience', 'AlumniProfile', '', { channel, count: list.length, forEvents });
  if (req.query.format === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8'); res.set('Content-Disposition', 'attachment; filename="alumni-audience.csv"');
    return res.send(`﻿Name,Graduation year,${channel === 'email' ? 'Email' : 'Phone'}\n${list.map((a) => [V.csvCell(a.name), a.gradYear, V.csvCell(a.contact[channel])].join(',')).join('\n')}\n`);
  }
  res.json({ channel, count: list.length, of: rows.length, people: list.map((a) => ({ id: a._id, name: a.name, gradYear: a.gradYear, [channel]: a.contact[channel] })) });
});
exports.directory = wrap('directory', async (req, res) => {
  const rows = await AlumniProfile.find({ schoolId: sid(req), state: 'Active' }).sort({ gradYear: -1, name: 1 }).limit(2000);
  res.json({ people: rows.filter((a) => a.consent?.directory === 'visible').map((a) => ({ id: a._id, name: a.name, gradYear: a.gradYear, headline: a.profile?.headline || '', city: a.profile?.city || '', employer: a.profile?.employer || '', field: a.profile?.field || '' })) });
});
// The voluntary employment answers, shown as counts only. A group smaller than the school's minimum is folded away, and no total is shown when something was folded.
exports.employment = wrap('employment', async (req, res) => {
  const schoolId = sid(req); const min = await V.minCell(schoolId);
  const rows = (await AlumniProfile.find({ schoolId, state: 'Active' }).limit(5000)).filter((a) => a.employment?.answeredAt);
  const tally = (key) => {
    const m = new Map(); for (const a of rows) { const k = a.employment[key] || 'Not said'; m.set(k, (m.get(k) || 0) + 1); }
    const shown = []; let folded = 0; let hid = false;
    for (const [label, n] of [...m.entries()].sort((x, y) => y[1] - x[1])) { if (n >= min) shown.push({ label, count: n }); else { folded += n; hid = true; } }
    if (folded >= min) { shown.push({ label: 'Other (small groups)', count: folded }); hid = false; }
    else if (hid) { /* the folded people stay hidden, and they cannot be worked out from a total */ }
    return { shown, hidden: hid };
  };
  if (rows.length < min) return res.json({ answers: null, minimum: min, note: `Fewer than ${min} graduates have answered, so no figures are shown.` });
  const status = tally('status'); const sector = tally('sector');
  res.json({ minimum: min, answers: { status, sector }, total: status.hidden || sector.hidden ? null : rows.length, note: 'Answers are voluntary. Groups smaller than the minimum are hidden so nobody can be picked out.' });
});

/* ── the graduate's own page (private link, no sign-in) ── */
exports.pubAlumnus = wrap('pubAlumnus', async (req, res) => {
  const a = await findByToken(req.params.token); if (!a) return bad(res, 404, 'This link is not valid any more.');
  const school = await School.findOne({ _id: a.schoolId }).select('name'); const events = await AlumniEvent.find({ schoolId: a.schoolId, status: 'Published', startsAt: { $gte: new Date() } }).sort({ startsAt: 1 }).limit(20);
  const mine = await AlumniRsvp.find({ alumniId: a._id });
  res.json({ school: school?.name || '', alumnus: selfView(a), events: events.map((e) => ({ id: e._id, title: e.title, startsAt: e.startsAt, place: e.place, description: e.description, mine: mine.find((r) => String(r.eventId) === String(e._id))?.status || null })),
    promise: 'We only keep your contact details while you say yes, and only use them for what you chose. You can change this or remove everything at any time.' });
});
exports.pubConsent = wrap('pubConsent', async (req, res) => {
  const a = await findByToken(req.params.token); if (!a) return bad(res, 404, 'This link is not valid any more.');
  const b = req.body || {}; await applyConsent(a, b, 'self');
  const prof = b.profile || {}; if (b.directory === 'visible') await AlumniProfile.updateOne({ _id: a._id }, { $set: { profile: { headline: txt(prof.headline, 120), city: txt(prof.city, 60), employer: txt(prof.employer, 80), field: txt(prof.field, 60) } } });
  await V.note(null, 'alumni.self', 'AlumniProfile', a._id, { contact: !!b.contact }, a.schoolId);
  res.json({ alumnus: selfView(await AlumniProfile.findOne({ _id: a._id })) });
});
exports.pubEmployment = wrap('pubEmployment', async (req, res) => {
  const a = await findByToken(req.params.token); if (!a) return bad(res, 404, 'This link is not valid any more.');
  const STATUS = ['Employed', 'Self-employed', 'Studying', 'Looking for work', 'Not working', 'Prefer not to say']; const status = String(req.body?.status || '');
  if (!STATUS.includes(status)) throw new Fail(422, 'Choose one of the answers.');
  await AlumniProfile.updateOne({ _id: a._id }, { $set: { employment: { status, sector: txt(req.body?.sector, 60), year: new Date().getUTCFullYear(), answeredAt: new Date() }, state: 'Active' } });
  res.json({ ok: true });
});
exports.pubRsvp = wrap('pubRsvp', async (req, res) => {
  const a = await findByToken(req.params.token); if (!a) return bad(res, 404, 'This link is not valid any more.');
  const e = await AlumniEvent.findOne({ _id: toId(req.body?.eventId, 'The event'), schoolId: a.schoolId, status: 'Published' }); if (!e) throw new Fail(404, 'That event is not open.');
  const status = String(req.body?.status || ''); if (!['going', 'maybe', 'no'].includes(status)) throw new Fail(422, 'Choose going, maybe or no.');
  if (status === 'going' && e.capacity) {
    const going = await AlumniRsvp.countDocuments({ eventId: e._id, status: 'going' }); const mine = await AlumniRsvp.findOne({ eventId: e._id, alumniId: a._id });
    if (going >= e.capacity && mine?.status !== 'going') throw new Fail(409, 'This event is full.');
  }
  await AlumniRsvp.updateOne({ eventId: e._id, alumniId: a._id }, { $set: { schoolId: a.schoolId, eventId: e._id, alumniId: a._id, status } }, { upsert: true });
  res.json({ ok: true });
});
exports.pubWithdraw = wrap('pubWithdraw', async (req, res) => {
  const a = await findByToken(req.params.token); if (!a) return bad(res, 404, 'This link is not valid any more.');
  await eraseOne(a, req.body?.erase ? 'Erased' : 'Withdrawn'); await V.note(null, 'alumni.withdraw', 'AlumniProfile', a._id, { erase: !!req.body?.erase }, a.schoolId);
  res.json({ ok: true, note: 'Done. We have removed your contact details and will not write to you.' });
});

/* ── events ── */
const eventBody = (b) => {
  const title = txt(b.title, 120); if (title.length < 3) throw new Fail(422, 'Give the event a title.');
  const startsAt = new Date(b.startsAt); if (Number.isNaN(startsAt.getTime())) throw new Fail(422, 'Give the date and time.');
  return { title, startsAt, place: txt(b.place, 160), description: txt(b.description, 1500), capacity: b.capacity ? num(b.capacity, 'Capacity', { min: 0, max: 100000, int: true }) : 0 };
};
exports.events = wrap('events', async (req, res) => {
  const schoolId = sid(req); const list = await AlumniEvent.find({ schoolId }).sort({ startsAt: -1 }).limit(200);
  const rs = await AlumniRsvp.find({ schoolId }).limit(20000); const by = {};
  for (const r of rs) { const k = String(r.eventId); by[k] = by[k] || { going: 0, maybe: 0, no: 0 }; by[k][r.status]++; }
  res.json({ events: list.map((e) => ({ ...e.toObject(), rsvp: by[String(e._id)] || { going: 0, maybe: 0, no: 0 } })) });
});
exports.addEvent = wrap('addEvent', async (req, res) => {
  const e = await AlumniEvent.create({ schoolId: sid(req), ...eventBody(req.body || {}), status: 'Draft', createdByName: nameOf(req) });
  await V.note(req, 'event.add', 'AlumniEvent', e._id, {}); res.status(201).json({ event: e });
});
exports.editEvent = wrap('editEvent', async (req, res) => {
  const e = await AlumniEvent.findOne({ _id: toId(req.params.id, 'The event'), schoolId: sid(req) }); if (!e) throw new Fail(404, 'Event not found.');
  if (['Closed', 'Cancelled'].includes(e.status)) throw new Fail(409, 'This event is finished.');
  await AlumniEvent.updateOne({ _id: e._id }, { $set: eventBody({ ...e.toObject(), ...(req.body || {}) }) }); res.json({ event: await AlumniEvent.findOne({ _id: e._id }) });
});
exports.eventStatus = wrap('eventStatus', async (req, res) => {
  const e = await AlumniEvent.findOne({ _id: toId(req.params.id, 'The event'), schoolId: sid(req) }); if (!e) throw new Fail(404, 'Event not found.');
  const to = String(req.body?.status || ''); const ok = { Draft: ['Published', 'Cancelled'], Published: ['Closed', 'Cancelled'] };
  if (!(ok[e.status] || []).includes(to)) throw new Fail(409, `An event that is ${e.status.toLowerCase()} cannot become ${to.toLowerCase()}.`);
  const r = await AlumniEvent.updateOne({ _id: e._id, status: e.status }, { $set: { status: to } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this event. Reload it.');
  await V.note(req, `event.${to.toLowerCase()}`, 'AlumniEvent', e._id, {}); res.json({ ok: true });
});
exports.rsvps = wrap('rsvps', async (req, res) => {
  const e = await AlumniEvent.findOne({ _id: toId(req.params.id, 'The event'), schoolId: sid(req) }); if (!e) throw new Fail(404, 'Event not found.');
  const rs = await AlumniRsvp.find({ eventId: e._id }).limit(5000); const people = await AlumniProfile.find({ _id: { $in: rs.map((r) => r.alumniId) } }).select('name gradYear');
  const nm = new Map(people.map((p) => [String(p._id), p])); res.json({ rsvps: rs.map((r) => ({ name: nm.get(String(r.alumniId))?.name || '', gradYear: nm.get(String(r.alumniId))?.gradYear, status: r.status })) });
});

/* ───────────────────────── giving ───────────────────────── */
const fundTotals = async (schoolId, fundIds) => {
  const out = new Map(fundIds.map((id) => [String(id), { received: 0, spent: 0, pending: 0 }]));
  const gifts = await DonorGift.find({ schoolId, fundId: { $in: fundIds } }).select('fundId amount').limit(200000);
  for (const g of gifts) out.get(String(g.fundId)).received = money(out.get(String(g.fundId)).received + g.amount);
  const spends = await FundSpend.find({ schoolId, fundId: { $in: fundIds }, status: { $in: ['Approved', 'Requested'] } }).select('fundId amount status').limit(50000);
  for (const s of spends) { const t = out.get(String(s.fundId)); if (s.status === 'Approved') t.spent = money(t.spent + s.amount); else t.pending = money(t.pending + s.amount); }
  for (const t of out.values()) { t.balance = money(t.received - t.spent); t.available = money(t.balance - t.pending); }
  return out;
};
const fundView = (f, t) => ({ id: f._id, name: f.name, purpose: f.purpose, restricted: f.restricted, allowedCategories: f.allowedCategories, restrictionNote: f.restrictionNote, state: f.state, version: f.version, ...(t || {}) });
exports.funds = wrap('funds', async (req, res) => {
  const schoolId = sid(req); const fs = await GivingFund.find({ schoolId }).sort({ name: 1 }).limit(200); const t = await fundTotals(schoolId, fs.map((f) => f._id));
  res.json({ funds: fs.map((f) => fundView(f, t.get(String(f._id)))) });
});
const fundBody = (b, cur) => {
  const name = txt(b.name ?? cur?.name, 100); if (name.length < 2) throw new Fail(422, 'Give the fund a name.');
  const restricted = b.restricted === undefined ? (cur ? cur.restricted : true) : !!b.restricted;
  const cats = [...new Set((Array.isArray(b.allowedCategories) ? b.allowedCategories : cur?.allowedCategories || []).map((c) => txt(c, 60).toLowerCase()).filter(Boolean))].slice(0, 30);
  if (restricted && !cats.length) throw new Fail(422, 'A restricted fund needs at least one allowed use, for example "scholarships".');
  return { name, purpose: txt(b.purpose ?? cur?.purpose, 300), restricted, allowedCategories: cats, restrictionNote: txt(b.restrictionNote ?? cur?.restrictionNote, 400) };
};
exports.addFund = wrap('addFund', async (req, res) => {
  try { const f = await GivingFund.create({ schoolId: sid(req), ...fundBody(req.body || {}), createdByName: nameOf(req) }); await V.note(req, 'fund.add', 'GivingFund', f._id, {}); res.status(201).json({ fund: fundView(f, { received: 0, spent: 0, pending: 0, balance: 0, available: 0 }) }); }
  catch (e) { if (e.code === 11000) throw new Fail(409, 'A fund with this name already exists.'); throw e; }
});
exports.editFund = wrap('editFund', async (req, res) => {
  const f = await GivingFund.findOne({ _id: toId(req.params.id, 'The fund'), schoolId: sid(req) }); if (!f) throw new Fail(404, 'Fund not found.');
  const next = fundBody(req.body || {}, f); const loosens = (f.restricted && !next.restricted) || next.allowedCategories.some((c) => !f.allowedCategories.includes(c));
  if (loosens) { const reason = txt(req.body?.reason, 300); if (reason.length < 15) throw new Fail(422, 'Widening what a fund may be spent on needs a written reason, for example the donor\'s agreement.'); next.restrictionNote = `${next.restrictionNote}${next.restrictionNote ? ' | ' : ''}Widened ${V.day()}: ${reason}`.slice(0, 400); }
  if (req.body?.state && ['Active', 'Closed'].includes(req.body.state)) next.state = req.body.state;
  try { await GivingFund.updateOne({ _id: f._id }, { $set: next }); } catch (e) { if (e.code === 11000) throw new Fail(409, 'A fund with this name already exists.'); throw e; }
  await V.note(req, 'fund.edit', 'GivingFund', f._id, { widened: loosens });
  const t = await fundTotals(sid(req), [f._id]); res.json({ fund: fundView(await GivingFund.findOne({ _id: f._id }), t.get(String(f._id))) });
});

const pledgeView = (p, paid) => ({ id: p._id, no: p.no, donorName: p.donorName, donorKind: p.donorKind, recognition: p.recognition, contactConsent: p.contactConsent, contact: p.contactConsent ? p.contact : null, fundId: p.fundId, campaignId: p.campaignId, amount: p.amount, paid: money(paid || 0), outstanding: money(Math.max(0, p.amount - (paid || 0))), schedule: p.schedule, status: p.status, note: p.note, createdAt: p.createdAt });
exports.pledges = wrap('pledges', async (req, res) => {
  const schoolId = sid(req); const q = { schoolId }; if (req.query.status) q.status = String(req.query.status); if (req.query.fundId) q.fundId = toId(req.query.fundId, 'The fund');
  const ps = await DonorPledge.find(q).sort({ createdAt: -1 }).limit(500); const gifts = await DonorGift.find({ schoolId, pledgeId: { $in: ps.map((p) => p._id) } }).select('pledgeId amount').limit(50000);
  const paid = {}; for (const g of gifts) paid[String(g.pledgeId)] = (paid[String(g.pledgeId)] || 0) + g.amount;
  res.json({ pledges: ps.map((p) => pledgeView(p, paid[String(p._id)])) });
});
exports.addPledge = wrap('addPledge', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {};
  const donorName = txt(b.donorName, 120); if (donorName.length < 2) throw new Fail(422, 'Give the donor\'s name.');
  const fund = await GivingFund.findOne({ _id: toId(b.fundId, 'The fund'), schoolId }); if (!fund) throw new Fail(404, 'Fund not found.'); if (fund.state !== 'Active') throw new Fail(409, 'That fund is closed.');
  const amount = num(b.amount, 'The amount', { min: 1 }); const kind = KINDS.includes(b.donorKind) ? b.donorKind : 'individual';
  let campaignId = null; if (b.campaignId) { const c = await FundraisingCampaign.findOne({ _id: toId(b.campaignId, 'The campaign'), schoolId }); if (!c) throw new Fail(404, 'Campaign not found.'); campaignId = c._id; }
  let alumniId = null; if (b.alumniId) { const a = await AlumniProfile.findOne({ _id: toId(b.alumniId, 'The graduate'), schoolId }); if (!a) throw new Fail(404, 'Graduate not found.'); alumniId = a._id; }
  const schedule = []; let sum = 0;
  for (const s of Array.isArray(b.schedule) ? b.schedule.slice(0, 60) : []) { if (!V.isDay(s?.dueOn)) throw new Fail(422, 'Give each due date as YYYY-MM-DD.'); const a = num(s.amount, 'An instalment', { min: 1 }); sum += a; schedule.push({ dueOn: s.dueOn, amount: a }); }
  if (schedule.length && Math.abs(sum - amount) > 0.01) throw new Fail(422, 'The instalments must add up to the pledge.');
  const consent = !!b.contactConsent; const contact = consent ? { email: email(b.contact?.email), phone: phone(b.contact?.phone) } : {};
  if (consent && !contact.email && !contact.phone) throw new Fail(422, 'Give an email or phone number, or untick the permission to contact.');
  const doc = await DonorPledge.create({ schoolId, no: await V.nextNo(schoolId, 'PLG'), donorName, donorKind: kind, alumniId, recognition: b.recognition === 'named' ? 'named' : 'anonymous', contactConsent: consent, contact, campaignId, fundId: fund._id, amount, schedule, status: 'Open', note: txt(b.note, 400), createdByName: nameOf(req) });
  await V.note(req, 'pledge.add', 'DonorPledge', doc._id, { amount }); res.status(201).json({ pledge: pledgeView(doc, 0) });
});
exports.pledgeStatus = wrap('pledgeStatus', async (req, res) => {
  const p = await DonorPledge.findOne({ _id: toId(req.params.id, 'The pledge'), schoolId: sid(req) }); if (!p) throw new Fail(404, 'Pledge not found.');
  const to = String(req.body?.status || ''); if (!['Cancelled', 'WrittenOff'].includes(to)) throw new Fail(422, 'Choose cancelled or written off.');
  const reason = txt(req.body?.reason, 300); if (reason.length < 10) throw new Fail(422, 'Write why.'); if (p.status !== 'Open') throw new Fail(409, `This pledge is already ${p.status.toLowerCase()}.`);
  const r = await DonorPledge.updateOne({ _id: p._id, status: 'Open' }, { $set: { status: to, note: `${p.note ? `${p.note} | ` : ''}${to}: ${reason}`.slice(0, 400) } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this pledge. Reload it.');
  await V.note(req, `pledge.${to.toLowerCase()}`, 'DonorPledge', p._id, { reason }); res.json({ ok: true });
});

const giftView = (g) => ({ id: g._id, receiptNo: g.receiptNo, pledgeId: g.pledgeId, donorName: g.recognition === 'named' || g.donorName ? g.donorName : '', recognition: g.recognition, fundId: g.fundId, campaignId: g.campaignId, amount: g.amount, receivedOn: g.receivedOn, method: g.method, reference: g.reference, reversalOf: g.reversalOf, reversalReason: g.reversalReason, recordedByName: g.recordedByName, acknowledgedAt: g.acknowledgedAt, createdAt: g.createdAt });
exports.gifts = wrap('gifts', async (req, res) => {
  const schoolId = sid(req); const q = { schoolId }; if (req.query.fundId) q.fundId = toId(req.query.fundId, 'The fund'); if (req.query.pledgeId) q.pledgeId = toId(req.query.pledgeId, 'The pledge');
  const gs = await DonorGift.find(q).sort({ receivedOn: -1, createdAt: -1 }).limit(500);
  if (req.query.format === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8'); res.set('Content-Disposition', 'attachment; filename="gifts.csv"');
    return res.send(`﻿Receipt,Date,Donor,Amount,Method,Reference,Reversal of\n${gs.map((g) => [g.receiptNo, g.receivedOn, V.csvCell(g.donorName), g.amount, g.method, V.csvCell(g.reference), g.reversalOf || ''].join(',')).join('\n')}\n`);
  }
  res.json({ gifts: gs.map(giftView) });
});
exports.addGift = wrap('addGift', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const key = txt(b.idempotencyKey, 80);
  if (key) { const old = await DonorGift.findOne({ schoolId, idempotencyKey: key }); if (old) return res.json({ gift: giftView(old), duplicate: true }); }
  const amount = num(b.amount, 'The amount', { min: 1 }); const day = String(b.receivedOn || V.day()); if (!V.isDay(day) || day > V.day()) throw new Fail(422, 'Give the date money was received (not in the future).');
  const method = METHODS.includes(b.method) ? b.method : 'bank'; const reference = txt(b.reference, 80);
  let pledge = null; let fundId; let donorName = txt(b.donorName, 120); let recognition = b.recognition === 'named' ? 'named' : 'anonymous'; let campaignId = null;
  if (b.pledgeId) {
    pledge = await DonorPledge.findOne({ _id: toId(b.pledgeId, 'The pledge'), schoolId }); if (!pledge) throw new Fail(404, 'Pledge not found.'); if (pledge.status !== 'Open') throw new Fail(409, `This pledge is ${pledge.status.toLowerCase()}.`);
    fundId = pledge.fundId; donorName = pledge.donorName; recognition = pledge.recognition; campaignId = pledge.campaignId;
  } else { fundId = toId(b.fundId, 'The fund'); if (donorName.length < 2 && recognition === 'named') throw new Fail(422, 'Give the donor\'s name, or record the gift as anonymous.'); if (b.campaignId) { const c = await FundraisingCampaign.findOne({ _id: toId(b.campaignId, 'The campaign'), schoolId }); if (!c) throw new Fail(404, 'Campaign not found.'); campaignId = c._id; } }
  const fund = await GivingFund.findOne({ _id: fundId, schoolId }); if (!fund) throw new Fail(404, 'Fund not found.'); if (fund.state !== 'Active') throw new Fail(409, 'That fund is closed.');
  if (reference && !b.allowDuplicateReference) { const dup = await DonorGift.findOne({ schoolId, reference, method, reversalOf: null }); if (dup) throw new Fail(409, 'A gift with this bank or cheque reference is already recorded. If it is really a second gift, tick "this is a different gift".', { reason: 'duplicate_reference', receiptNo: dup.receiptNo }); }
  const g = await DonorGift.create({ schoolId, pledgeId: pledge?._id || null, donorName, recognition, fundId, campaignId, amount, receivedOn: day, method, reference, receiptNo: await V.nextNo(schoolId, 'RCP'), idempotencyKey: key, recordedByName: nameOf(req), recordedById: oid(req.user.userId) });
  if (pledge) { const paid = (await DonorGift.find({ schoolId, pledgeId: pledge._id }).select('amount')).reduce((s, x) => s + x.amount, 0); if (paid >= pledge.amount) await DonorPledge.updateOne({ _id: pledge._id, status: 'Open' }, { $set: { status: 'Fulfilled' } }); }
  await V.note(req, 'gift.add', 'DonorGift', g._id, { amount, receiptNo: g.receiptNo }); res.status(201).json({ gift: giftView(g) });
});
exports.acknowledge = wrap('acknowledge', async (req, res) => {
  const g = await DonorGift.findOne({ _id: toId(req.params.id, 'The gift'), schoolId: sid(req) }); if (!g) throw new Fail(404, 'Gift not found.'); if (g.amount <= 0) throw new Fail(409, 'A reversal needs no thank-you.');
  await DonorGift.updateOne({ _id: g._id }, { $set: { acknowledgedAt: new Date() } }); res.json({ ok: true });
});
// A gift is never edited. A mistake is undone by a second row, by someone other than who recorded it, and not if the money is already spent.
exports.reverse = wrap('reverse', async (req, res) => {
  const schoolId = sid(req); const g = await DonorGift.findOne({ _id: toId(req.params.id, 'The gift'), schoolId }); if (!g) throw new Fail(404, 'Gift not found.');
  if (g.amount <= 0 || g.reversalOf) throw new Fail(409, 'This row is already a reversal.');
  const reason = txt(req.body?.reason, 300); if (reason.length < 10) throw new Fail(422, 'Write why this gift is being reversed.');
  const sole = await S.separate(ctxOf(req), g.recordedById, 'Reversing a gift');
  try { await DocCounter.create({ schoolId, key: `giftrev-${g._id}`, n: 1 }); } catch (e) { if (e.code === 11000) throw new Fail(409, 'This gift has already been reversed.'); throw e; }
  const lock = await takeFund(schoolId, g.fundId);
  const t = (await fundTotals(schoolId, [g.fundId])).get(String(g.fundId));
  if (t.balance - g.amount < 0 || t.available - g.amount < 0) { await DocCounter.deleteMany({ schoolId, key: `giftrev-${g._id}` }); throw new Fail(409, 'Part of this money has already been spent or is waiting to be spent, so it cannot be reversed.', { reason: 'spent' }); }
  const r = await DonorGift.create({ schoolId, pledgeId: g.pledgeId, donorName: g.donorName, recognition: g.recognition, fundId: g.fundId, campaignId: g.campaignId, amount: -g.amount, receivedOn: V.day(), method: g.method, reference: g.reference, receiptNo: await V.nextNo(schoolId, 'RCP'), reversalOf: g._id, reversalReason: reason, recordedByName: nameOf(req), recordedById: oid(req.user.userId) });
  if (g.pledgeId) await DonorPledge.updateOne({ _id: g.pledgeId, status: 'Fulfilled' }, { $set: { status: 'Open' } });
  await V.note(req, 'gift.reverse', 'DonorGift', g._id, { reason, soleAdmin: sole, version: lock }); res.status(201).json({ gift: giftView(r), soleAdmin: sole });
});

// Take the fund's version so two approvals, or an approval and a reversal, cannot both use the same money.
async function takeFund(schoolId, fundId) {
  for (let i = 0; i < 8; i++) {
    const f = await GivingFund.findOne({ _id: fundId, schoolId }); if (!f) throw new Fail(404, 'Fund not found.');
    const r = await GivingFund.updateOne({ _id: f._id, version: f.version || 0 }, { $set: { version: (f.version || 0) + 1 } }); if (r.matchedCount) return (f.version || 0) + 1;
  }
  throw new Fail(409, 'This fund is being changed by someone else. Try again in a moment.');
}
const spendView = (s) => ({ id: s._id, fundId: s.fundId, amount: s.amount, category: s.category, description: s.description, status: s.status, variation: s.variation, requestedByName: s.requestedByName, decidedByName: s.decidedByName, decidedAt: s.decidedAt, decisionNote: s.decisionNote, soleAdmin: s.soleAdmin, createdAt: s.createdAt });
exports.spends = wrap('spends', async (req, res) => {
  const q = { schoolId: sid(req) }; if (req.query.status) q.status = String(req.query.status); if (req.query.fundId) q.fundId = toId(req.query.fundId, 'The fund');
  res.json({ spends: (await FundSpend.find(q).sort({ createdAt: -1 }).limit(300)).map(spendView) });
});
exports.addSpend = wrap('addSpend', async (req, res) => {
  const schoolId = sid(req); const b = req.body || {}; const fund = await GivingFund.findOne({ _id: toId(b.fundId, 'The fund'), schoolId }); if (!fund) throw new Fail(404, 'Fund not found.'); if (fund.state !== 'Active') throw new Fail(409, 'That fund is closed.');
  const amount = num(b.amount, 'The amount', { min: 1 }); const category = txt(b.category, 60).toLowerCase(); const description = txt(b.description, 300);
  if (!category) throw new Fail(422, 'Say what the money is for, for example "scholarships".'); if (description.length < 10) throw new Fail(422, 'Describe what the money will pay for.');
  let variation = null;
  if (fund.restricted && !fund.allowedCategories.includes(category)) {
    const n = txt(b.variationNote, 400);
    if (n.length < 20) throw new Fail(422, `This fund may only be spent on: ${fund.allowedCategories.join(', ')}. To use it for something else, record where the donor agreed to it.`, { reason: 'restricted', allowed: fund.allowedCategories });
    variation = { note: n, by: nameOf(req), at: new Date() };
  }
  const t = (await fundTotals(schoolId, [fund._id])).get(String(fund._id)); if (amount > t.available) throw new Fail(409, `Only ${t.available.toLocaleString('en-US')} is available in this fund.`, { reason: 'insufficient', available: t.available });
  const s = await FundSpend.create({ schoolId, fundId: fund._id, amount, category, description, status: 'Requested', variation, requestedById: oid(req.user.userId), requestedByName: nameOf(req) });
  await V.note(req, 'spend.ask', 'FundSpend', s._id, { amount, category, variation: !!variation });
  await tell(schoolId, await S.N.admins(schoolId), 'A fund spend needs a decision', `${amount.toLocaleString('en-US')} from ${fund.name} for ${category}`, '/admin?tab=giving', `spend-${s._id}`);
  res.status(201).json({ spend: spendView(s) });
});
exports.decideSpend = wrap('decideSpend', async (req, res) => {
  const schoolId = sid(req); const s = await FundSpend.findOne({ _id: toId(req.params.id, 'The spend'), schoolId }); if (!s) throw new Fail(404, 'Not found.'); if (s.status !== 'Requested') throw new Fail(409, `This was already ${s.status.toLowerCase()}.`);
  const decision = String(req.body?.decision || ''); if (!['approve', 'decline'].includes(decision)) throw new Fail(422, 'Choose approve or decline.');
  const noteText = txt(req.body?.note, 300); if (decision === 'decline' && noteText.length < 5) throw new Fail(422, 'Say why.');
  const sole = await S.separate(ctxOf(req), s.requestedById, 'A spend');
  const patch = { status: decision === 'approve' ? 'Approved' : 'Declined', decidedById: oid(req.user.userId), decidedByName: nameOf(req), decidedAt: new Date(), decisionNote: noteText, soleAdmin: sole };
  if (decision === 'approve') {
    const fund = await GivingFund.findOne({ _id: s.fundId, schoolId }); if (!fund || fund.state !== 'Active') throw new Fail(409, 'That fund is closed.');
    if (fund.restricted && !fund.allowedCategories.includes(s.category) && !s.variation) throw new Fail(409, 'This is not an allowed use of the fund.', { reason: 'restricted' });
    await takeFund(schoolId, s.fundId);
    const t = (await fundTotals(schoolId, [s.fundId])).get(String(s.fundId)); if (t.balance < s.amount) throw new Fail(409, 'The fund no longer has enough money.', { reason: 'insufficient' });
  }
  const r = await FundSpend.updateOne({ _id: s._id, status: 'Requested' }, { $set: patch }); if (!r.matchedCount) throw new Fail(409, 'Someone else already decided this.');
  await V.note(req, `spend.${decision}`, 'FundSpend', s._id, { amount: s.amount, soleAdmin: sole });
  await tell(schoolId, [{ id: s.requestedById, role: 'admin' }], `Fund spend ${patch.status.toLowerCase()}`, noteText, '/admin?tab=giving', `spendd-${s._id}`);
  res.json({ spend: spendView(await FundSpend.findOne({ _id: s._id })), soleAdmin: sole });
});

/* ───────────────────────── campaigns ───────────────────────── */
const campaignTotals = async (schoolId, ids) => {
  const out = new Map(ids.map((id) => [String(id), { raised: 0, donors: new Set() }]));
  const gs = await DonorGift.find({ schoolId, campaignId: { $in: ids } }).select('campaignId amount donorName reversalOf pledgeId').limit(100000);
  for (const g of gs) { const t = out.get(String(g.campaignId)); t.raised = money(t.raised + g.amount); if (g.amount > 0) t.donors.add(g.pledgeId ? String(g.pledgeId) : `${g.donorName}`); }
  return out;
};
const campaignView = (c, t) => ({ id: c._id, code: c.code, title: c.title, story: c.story, goal: c.goal, startsOn: c.startsOn, endsOn: c.endsOn, fundId: c.fundId, uses: c.uses, status: c.status, askedByName: c.askedByName, decidedByName: c.decidedByName, soleAdmin: c.soleAdmin, raised: t ? t.raised : 0, donors: t ? t.donors.size : 0 });
exports.campaigns = wrap('campaigns', async (req, res) => {
  const cs = await FundraisingCampaign.find({ schoolId: sid(req) }).sort({ createdAt: -1 }).limit(100); const t = await campaignTotals(sid(req), cs.map((c) => c._id));
  res.json({ campaigns: cs.map((c) => campaignView(c, t.get(String(c._id)))) });
});
const campaignBody = async (schoolId, b, cur) => {
  const title = txt(b.title ?? cur?.title, 120); if (title.length < 4) throw new Fail(422, 'Give the campaign a title.');
  const goal = num(b.goal ?? cur?.goal ?? 0, 'The goal', { min: 0 });
  const startsOn = b.startsOn ?? cur?.startsOn ?? ''; const endsOn = b.endsOn ?? cur?.endsOn ?? '';
  for (const d of [startsOn, endsOn]) if (d && !V.isDay(d)) throw new Fail(422, 'Give dates as YYYY-MM-DD.'); if (startsOn && endsOn && endsOn < startsOn) throw new Fail(422, 'The end date is before the start.');
  const fund = await GivingFund.findOne({ _id: toId(b.fundId ?? cur?.fundId, 'The fund'), schoolId }); if (!fund) throw new Fail(404, 'Fund not found.');
  const uses = (Array.isArray(b.uses) ? b.uses : cur?.uses || []).slice(0, 12).map((u) => ({ label: txt(u?.label, 80), percent: num(u?.percent, 'A percentage', { min: 0, max: 100 }) })).filter((u) => u.label);
  if (uses.length && Math.abs(uses.reduce((s, u) => s + u.percent, 0) - 100) > 0.01) throw new Fail(422, 'Where the money goes must add up to 100%.');
  if (fund.restricted && uses.length) { const out = uses.filter((u) => !fund.allowedCategories.includes(u.label.toLowerCase())); if (out.length) throw new Fail(422, `The fund does not allow: ${out.map((u) => u.label).join(', ')}. The page must not promise a use the fund cannot make.`); }
  return { title, story: txt(b.story ?? cur?.story, 2000), goal, startsOn, endsOn, fundId: fund._id, uses };
};
exports.addCampaign = wrap('addCampaign', async (req, res) => {
  const schoolId = sid(req); const body = await campaignBody(schoolId, req.body || {});
  for (let i = 0; i < 5; i++) { try { const c = await FundraisingCampaign.create({ schoolId, code: crypto.randomBytes(5).toString('hex'), ...body, status: 'Draft', createdByName: nameOf(req) }); await V.note(req, 'campaign.add', 'FundraisingCampaign', c._id, {}); return res.status(201).json({ campaign: campaignView(c, null) }); } catch (e) { if (e.code !== 11000) throw e; } }
  throw new Fail(503, 'Try again.');
});
exports.editCampaign = wrap('editCampaign', async (req, res) => {
  const schoolId = sid(req); const c = await FundraisingCampaign.findOne({ _id: toId(req.params.id, 'The campaign'), schoolId }); if (!c) throw new Fail(404, 'Campaign not found.'); if (!['Draft'].includes(c.status)) throw new Fail(409, 'A campaign under review or live cannot be changed. Close it and start another.');
  await FundraisingCampaign.updateOne({ _id: c._id }, { $set: await campaignBody(schoolId, req.body || {}, c) }); res.json({ campaign: campaignView(await FundraisingCampaign.findOne({ _id: c._id }), null) });
});
// A public page is a promise to donors, so a different administrator reads it before it goes live.
exports.campaignAsk = wrap('campaignAsk', async (req, res) => {
  const schoolId = sid(req); const c = await FundraisingCampaign.findOne({ _id: toId(req.params.id, 'The campaign'), schoolId }); if (!c) throw new Fail(404, 'Campaign not found.');
  if (c.status !== 'Draft') throw new Fail(409, 'Only a draft can be sent for review.'); if (!(c.goal > 0)) throw new Fail(422, 'Set a goal first.'); if (!c.uses.length) throw new Fail(422, 'Say where the money goes first.');
  const r = await FundraisingCampaign.updateOne({ _id: c._id, status: 'Draft' }, { $set: { status: 'Review', askedById: oid(req.user.userId), askedByName: nameOf(req) } }); if (!r.matchedCount) throw new Fail(409, 'Someone else changed this campaign.');
  await tell(schoolId, await S.N.admins(schoolId), 'A fundraising page needs a read-through', c.title, '/admin?tab=giving', `camp-${c._id}`); res.json({ ok: true });
});
exports.campaignDecide = wrap('campaignDecide', async (req, res) => {
  const schoolId = sid(req); const c = await FundraisingCampaign.findOne({ _id: toId(req.params.id, 'The campaign'), schoolId }); if (!c) throw new Fail(404, 'Campaign not found.'); if (c.status !== 'Review') throw new Fail(409, 'This campaign is not waiting for review.');
  const decision = String(req.body?.decision || ''); if (!['approve', 'return'].includes(decision)) throw new Fail(422, 'Choose approve or return.');
  const sole = await S.separate(ctxOf(req), c.askedById, 'A public fundraising page');
  const r = await FundraisingCampaign.updateOne({ _id: c._id, status: 'Review' }, { $set: { status: decision === 'approve' ? 'Live' : 'Draft', decidedById: oid(req.user.userId), decidedByName: nameOf(req), decidedAt: new Date(), soleAdmin: sole } }); if (!r.matchedCount) throw new Fail(409, 'Someone else decided this.');
  await V.note(req, `campaign.${decision}`, 'FundraisingCampaign', c._id, { soleAdmin: sole }); res.json({ ok: true, soleAdmin: sole });
});
exports.campaignClose = wrap('campaignClose', async (req, res) => {
  const c = await FundraisingCampaign.findOne({ _id: toId(req.params.id, 'The campaign'), schoolId: sid(req) }); if (!c) throw new Fail(404, 'Campaign not found.'); if (c.status !== 'Live') throw new Fail(409, 'Only a live campaign can be closed.');
  await FundraisingCampaign.updateOne({ _id: c._id, status: 'Live' }, { $set: { status: 'Closed' } }); res.json({ ok: true });
});
// The public page: the goal, the total, where the money goes. Anonymous donors are not listed, and small numbers of donors are not shown.
exports.pubCampaign = wrap('pubCampaign', async (req, res) => {
  const c = await FundraisingCampaign.findOne({ code: String(req.params.code || '').slice(0, 40) }); if (!c || !['Live', 'Closed'].includes(c.status)) return bad(res, 404, 'This page is not open.');
  const schoolId = c.schoolId; const school = await School.findOne({ _id: schoolId }).select('name'); const t = (await campaignTotals(schoolId, [c._id])).get(String(c._id)); const min = await V.minCell(schoolId);
  const named = await DonorGift.find({ schoolId, campaignId: c._id, recognition: 'named', amount: { $gt: 0 } }).select('donorName').limit(200);
  res.json({ school: school?.name || '', title: c.title, story: c.story, goal: c.goal, raised: Math.max(0, t.raised), percent: c.goal ? Math.min(100, Math.round((Math.max(0, t.raised) / c.goal) * 100)) : null, donors: t.donors.size >= min ? t.donors.size : null, uses: c.uses, status: c.status, endsOn: c.endsOn, thankYou: [...new Set(named.map((g) => g.donorName))].slice(0, 50),
    promise: 'Gifts are kept in a separate fund and spent only on the uses shown here. Donors who asked to stay anonymous are not listed.' });
});

/* ───────────────────────── overview and sweep ───────────────────────── */
exports.overview = wrap('overview', async (req, res) => {
  const schoolId = sid(req); const [fs, ps, cs] = await Promise.all([GivingFund.find({ schoolId }), DonorPledge.find({ schoolId, status: 'Open' }), FundraisingCampaign.find({ schoolId, status: { $in: ['Review', 'Live'] } })]);
  const t = await fundTotals(schoolId, fs.map((f) => f._id)); let received = 0; let balance = 0; for (const v of t.values()) { received += v.received; balance += v.balance; }
  const open = await FundSpend.countDocuments({ schoolId, status: 'Requested' }); const al = await AlumniProfile.countDocuments({ schoolId, state: 'Active' });
  res.json({ funds: fs.length, received: money(received), balance: money(balance), openPledges: ps.length, openSpends: open, liveCampaigns: cs.filter((c) => c.status === 'Live').length, awaitingReview: cs.filter((c) => c.status === 'Review').length, activeAlumni: al });
});

exports.sweepSchool = async (schoolId) => {
  const out = { closed: 0, reminded: 0 }; const today = V.day();
  for (const c of await FundraisingCampaign.find({ schoolId, status: 'Live' })) if (c.endsOn && c.endsOn < today) { const r = await FundraisingCampaign.updateOne({ _id: c._id, status: 'Live' }, { $set: { status: 'Closed' } }); if (r.matchedCount) out.closed++; }
  const late = [];
  for (const p of await DonorPledge.find({ schoolId, status: 'Open' }).limit(2000)) { const due = (p.schedule || []).find((s) => s.dueOn < V.addDays(today, -7)); if (due) late.push(p); }
  if (late.length) { await tell(schoolId, await S.N.admins(schoolId), 'Pledge instalments are overdue', `${late.length} pledge${late.length === 1 ? ' has' : 's have'} an instalment more than a week late.`, '/admin?tab=giving', `pledge-late-${today}`); out.reminded += late.length; }
  return out;
};
