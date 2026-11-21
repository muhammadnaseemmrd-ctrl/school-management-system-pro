// What people see and the daily sweep (PRD E22): the dispatcher's day, the driver's page, the family's view, reports, and the nightly rules.
const S = require('./service');
const T = require('./trips');
const F = require('./fleet');
const { E, A, Fail, oid, clean } = S;
const C = require('../consent');
const GR = require('../guardianRights');
const TpTrip = require('../../models/TpTrip'); const TpBoard = require('../../models/TpBoard'); const TpEvent = require('../../models/TpEvent'); const TpPing = require('../../models/TpPing'); const TpVehicle = require('../../models/TpVehicle');
const TpDriver = require('../../models/TpDriver'); const TpIncident = require('../../models/TpIncident'); const TpOptOut = require('../../models/TpOptOut'); const TpPlan = require('../../models/TpPlan'); const TpStop = require('../../models/TpStop');
const TransportAssignment = require('../../models/TransportAssignment'); const TransportRoute = require('../../models/TransportRoute');
const Student = require('../../models/Student'); const Parent = require('../../models/Parent'); const GuardianLink = require('../../models/GuardianLink'); const School = require('../../models/School'); const AppSetting = require('../../models/AppSetting');
const plain = (d) => (d && d.toObject ? d.toObject() : d);
const must = (d, w) => { if (!d) throw new Fail(404, `That ${w} is not in your school.`); return d; };

const tripLine = (t) => ({ _id: t._id, routeId: t.routeId, routeName: t.routeName, direction: t.direction, date: t.date, status: t.status, vehiclePlate: t.vehiclePlate, driverName: t.driverName, plannedStart: t.plannedStart, plannedEnd: t.plannedEnd, startedAt: t.startedAt, endedAt: t.endedAt, delayMin: t.delayMin, counts: t.counts, unreconciled: t.unreconciled, ready: t.status === 'checked' });

/* ───────── the dispatcher's day ───────── */
async function overview(schoolId) {
  const t = await S.today(schoolId); await T.ensureTrips(schoolId, t);
  const [trips, incidents, exc, vehicles, drivers, plansN] = await Promise.all([
    TpTrip.find({ schoolId, date: t }).sort({ plannedStart: 1 }), TpIncident.find({ schoolId, status: { $in: ['open', 'acknowledged'] } }).sort({ createdAt: -1 }).limit(20),
    TpBoard.find({ schoolId, 'exception.kind': { $nin: ['', null] }, 'exception.resolved': false }).sort({ updatedAt: -1 }).limit(30), TpVehicle.find({ schoolId, status: { $ne: 'retired' } }), TpDriver.find({ schoolId, status: 'active' }), TpPlan.countDocuments({ schoolId, status: 'active' }),
  ]);
  const soon = E.addDays(t, (await S.getCfg(schoolId)).settings.documentWarnDays);
  return {
    date: t, trips: trips.map(tripLine), plans: plansN,
    totals: { trips: trips.length, active: trips.filter((x) => x.status === 'active').length, completed: trips.filter((x) => x.status === 'completed').length, notStarted: trips.filter((x) => ['scheduled', 'checked'].includes(x.status)).length, missed: trips.filter((x) => x.status === 'missed').length, riders: trips.reduce((n, x) => n + (x.counts?.expected || 0) + (x.counts?.boarded || 0) + (x.counts?.alighted || 0), 0), onBoard: trips.reduce((n, x) => n + (x.counts?.boarded || 0), 0) },
    incidents, exceptions: exc.map(plain),
    vehiclesOnHold: vehicles.filter((v) => v.status === 'inspection_hold').map(plain),
    expiring: [
      ...vehicles.filter((v) => v.fitnessExpiry && v.fitnessExpiry <= soon).map((v) => ({ kind: 'Vehicle fitness', who: v.plate, on: v.fitnessExpiry, expired: v.fitnessExpiry < t })),
      ...vehicles.filter((v) => v.insuranceExpiry && v.insuranceExpiry <= soon).map((v) => ({ kind: 'Vehicle insurance', who: v.plate, on: v.insuranceExpiry, expired: v.insuranceExpiry < t })),
      ...drivers.filter((d) => d.licenceExpiry && d.licenceExpiry <= soon).map((d) => ({ kind: 'Driver licence', who: d.name, on: d.licenceExpiry, expired: d.licenceExpiry < t })),
    ],
    inspectionsDue: vehicles.filter((v) => v.status === 'active' && (!v.nextInspectionDue || v.nextInspectionDue <= E.addDays(t, 7))).map((v) => ({ _id: v._id, plate: v.plate, due: v.nextInspectionDue || '' })),
  };
}
async function listTrips(schoolId, q) {
  const f = { schoolId }; const t = await S.today(schoolId);
  if (E.isDay(q.date)) f.date = q.date; else { const from = E.isDay(q.from) ? q.from : E.addDays(t, -7); const to = E.isDay(q.to) ? q.to : E.addDays(t, 1); f.date = { $gte: from, $lte: to }; }
  if (['scheduled', 'checked', 'active', 'completed', 'cancelled', 'missed'].includes(q.status)) f.status = q.status; if (oid(q.routeId)) f.routeId = oid(q.routeId); if (q.date === t) await T.ensureTrips(schoolId, t);
  const { limit, skip, page } = S.pg(q); const [rows, total] = await Promise.all([TpTrip.find(f).sort({ date: -1, plannedStart: 1 }).skip(skip).limit(limit), TpTrip.countDocuments(f)]);
  return { rows: rows.map(tripLine), total, page, limit };
}
async function tripDetail(schoolId, id) {
  const trip = must(oid(id) ? await TpTrip.findOne({ _id: id, schoolId }) : null, 'trip');
  const [boards, events, incidents, pings] = await Promise.all([TpBoard.find({ tripId: trip._id }).sort({ stopName: 1, studentName: 1 }), TpEvent.find({ tripId: trip._id, kind: { $ne: 'approach' } }).sort({ at: -1 }).limit(80), TpIncident.find({ schoolId, tripId: trip._id }).sort({ createdAt: -1 }),
    trip.status === 'active' ? TpPing.find({ tripId: trip._id }).sort({ at: -1 }).limit(60) : []]);
  return { trip: plain(trip), boards: boards.map(plain), events: events.map(plain), incidents: incidents.map(plain), track: pings.map((p) => ({ lat: p.lat, lng: p.lng, at: p.at })).reverse() };
}

/* ───────── the driver's page ───────── */
// People who may receive a child at the stop. A person under a restriction is never listed, and the list never says why.
async function collectorsFor(schoolId, studentIds) {
  const out = new Map(); if (!studentIds.length) return out; const now = new Date();
  const links = await GuardianLink.find({ schoolId, studentId: { $in: studentIds } });
  const parents = new Map((await Parent.find({ schoolId, _id: { $in: links.map((l) => l.parentId).filter(Boolean) } }).select('name')).map((p) => [String(p._id), p.name]));
  for (const l of links) {
    if (!l.rights || l.rights.pickup !== true) continue; if (new Date(l.validFrom) > now || (l.validTo && new Date(l.validTo) <= now)) continue;
    const dec = await GR.pickupDecision(schoolId, l.studentId, { parentId: l.parentId || null, personName: l.personName || '' }, now); if (dec.decision !== 'Authorised') continue;
    const name = l.parentId ? parents.get(String(l.parentId)) : l.personName; if (!name) continue;
    const key = String(l.studentId); const list = out.get(key) || []; list.push({ ref: l.parentId ? `p:${l.parentId}` : `n:${l.personName}`, label: `${name}${l.relationship ? ` (${l.relationship})` : ''}` }); out.set(key, list);
  }
  return out;
}
const driverTripOut = async (trip, schoolId) => {
  const boards = await TpBoard.find({ tripId: trip._id }); const need = trip.direction === 'afternoon' ? boards.filter((b) => b.handoff === 'guardian' && b.state === 'boarded').map((b) => b.studentId) : [];
  const col = await collectorsFor(schoolId, need);
  return { ...tripLine(trip), capacity: trip.capacity, stops: trip.stops.map((s) => ({ stopId: s.stopId, name: s.name, seq: s.seq, plannedAt: s.plannedAt, etaAt: s.etaAt, arrivedAt: s.arrivedAt, lat: s.lat, lng: s.lng })), checklist: trip.status === 'scheduled' || trip.status === 'checked' ? { items: trip.checklist.items.map((i) => ({ key: i.key, label: i.label, critical: i.critical })), doneAt: trip.checklist.doneAt || null } : null, escortName: trip.escortName,
    // only what the driver needs: a name, a class, the stop and whether a handover person must be chosen. No phone, health or history.
    riders: boards.map((b) => ({ studentId: b.studentId, name: b.studentName, className: b.className, stopId: b.stopId, stopName: b.stopName, state: b.state, handoff: b.handoff, boardedAt: b.boardedAt, exception: b.exception?.kind && !b.exception.resolved ? b.exception.kind : '', collectors: col.get(String(b.studentId)) || [] })).sort((a, b) => a.name.localeCompare(b.name)) };
};
async function driverToday(driver) {
  const schoolId = driver.schoolId; const t = await S.today(schoolId); await T.ensureTrips(schoolId, t);
  const trips = await TpTrip.find({ schoolId, driverId: driver._id, $or: [{ date: t }, { status: 'active' }] }).sort({ plannedStart: 1 });
  const school = await School.findById(schoolId).select('name phone');
  return { driver: { _id: driver._id, name: driver.name }, school: { name: school?.name || '', phone: school?.phone || '' }, date: t, serverTime: new Date().toISOString(), trips: await Promise.all(trips.map((x) => driverTripOut(x, schoolId))) };
}
async function driverTrip(driver, id) {
  const trip = oid(id) ? await TpTrip.findOne({ _id: id, schoolId: driver.schoolId, driverId: driver._id }) : null; if (!trip) throw new Fail(404, 'That trip is not given to you.'); return driverTripOut(trip, driver.schoolId);
}
// Up to 100 saved actions from a phone that was offline. Oldest first by the time they were captured; one that fails never stops the rest.
async function driverSync(driver, ops) {
  const list = (Array.isArray(ops) ? ops : []).slice(0, 100).map((o, i) => ({ ...o, _i: i })).sort((a, b) => (new Date(a.at || 0) - new Date(b.at || 0)) || a._i - b._i);
  const ctx = { schoolId: driver.schoolId, byKind: 'driver', byName: driver.name, byId: driver._id, driver }; const results = [];
  for (const o of list) {
    try { const r = await T.applyOp(ctx, o.tripId, o); results.push({ clientKey: o.clientKey || '', index: o._i, ok: true, replayed: !!r.replayed, ...(r.message ? { message: r.message } : {}) }); }
    catch (e) { results.push({ clientKey: o.clientKey || '', index: o._i, ok: false, message: e instanceof Fail ? e.message : 'Could not apply this action.', retry: !(e instanceof Fail) }); if (!(e instanceof Fail)) console.error('transport sync:', e); }
  }
  return { results: results.sort((a, b) => a.index - b.index) };
}

/* ───────── families ───────── */
// A parent sees a child they are linked to; a student sees themselves. Never a position for a student's own phone.
async function family(user, childId) {
  const schoolId = user.schoolId; let kid = null; let rights = null;
  if (user.role === 'student') kid = await Student.findOne({ _id: user.userId, schoolId }).select('name classId');
  else if (user.role === 'parent') {
    const id = oid(childId); if (!id) throw new Fail(422, 'Choose a child.');
    const r = await GR.resolve(schoolId, user.userId, id); if (!r.linked || !r.rights.viewInfo) throw new Fail(403, 'You cannot see this child\'s bus details.');
    kid = await Student.findOne({ _id: id, schoolId }).select('name classId'); rights = r.rights;
  } else throw new Fail(403, 'Not available.');
  return must(kid, 'child') && { kid, rights };
}
async function myView(user, childId) {
  const { kid } = await family(user, childId); const schoolId = user.schoolId; const t = await S.today(schoolId);
  const a = await TransportAssignment.findOne({ schoolId, studentId: kid._id });
  const consent = (await C.check(schoolId, 'student', kid._id, 'bus_tracking')).allowed;
  if (!a) return { child: { _id: kid._id, name: kid.name }, rider: null, trips: [], history: [], skips: [], tracking: { consent, available: user.role === 'parent' } };
  await T.ensureTrips(schoolId, t);
  const [route, stop, plans, trips, skips] = await Promise.all([TransportRoute.findOne({ _id: a.routeId, schoolId }), a.stopId ? TpStop.findOne({ _id: a.stopId, schoolId }) : null, TpPlan.find({ schoolId, routeId: a.routeId, status: 'active' }),
    TpTrip.find({ schoolId, routeId: a.routeId, date: t }).sort({ plannedStart: 1 }), TpOptOut.find({ schoolId, studentId: kid._id, date: { $gte: t }, cancelled: { $ne: true } }).sort({ date: 1 })]);
  const boards = new Map((await TpBoard.find({ tripId: { $in: trips.map((x) => x._id) }, studentId: kid._id })).map((b) => [String(b.tripId), b]));
  const tz = await S.tzOf(schoolId); const out = [];
  for (const trip of trips) {
    const b = boards.get(String(trip._id)); if (!b) continue; const s = trip.stops.find((x) => String(x.stopId) === String(b.stopId)); const live = trip.status === 'active';
    out.push({ tripId: trip._id, direction: trip.direction, status: trip.status, plannedAt: s?.plannedAt || trip.plannedStart, etaAt: live && !s?.arrivedAt ? s?.etaAt || null : null, arrivedAt: s?.arrivedAt || null, delayMin: live ? trip.delayMin : 0, driverFirstName: (trip.driverName || '').split(' ')[0], vehiclePlate: trip.vehiclePlate,
      stopName: b.stopName, state: b.state, boardedAt: b.boardedAt, alightedAt: b.alightedAt, handedTo: b.handedTo?.name || '', stopsAway: live && !s?.arrivedAt ? trip.stops.filter((x) => !x.arrivedAt && x.seq < (s?.seq || 0)).length : null });
  }
  const past = await TpBoard.find({ schoolId, studentId: kid._id, state: { $in: ['alighted', 'no_show', 'boarded'] } }).sort({ createdAt: -1 }).limit(20);
  const pt = new Map((await TpTrip.find({ _id: { $in: past.map((p) => p.tripId) } }).select('date direction routeName status')).map((x) => [String(x._id), x]));
  return { child: { _id: kid._id, name: kid.name }, tz, rider: { routeName: route?.name || '', stopName: stop?.name || a.pickupPoint || '', handoff: a.handoff || 'release', plans: plans.map((p) => ({ direction: p.direction, startTime: p.startTime, days: p.days })) },
    trips: out, history: past.map((p) => { const x = pt.get(String(p.tripId)); return x && x.date < t ? { date: x.date, direction: x.direction, state: p.state, boardedAt: p.boardedAt, alightedAt: p.alightedAt } : null; }).filter(Boolean), skips: skips.map((s) => ({ _id: s._id, date: s.date, direction: s.direction, reason: s.reason })),
    tracking: { consent, available: user.role === 'parent' } };
}
// The bus on a map, only while the child's trip is active and the family has said yes
async function myLive(user, childId) {
  if (user.role !== 'parent') return { live: false, reason: 'family_only' };
  const { kid } = await family(user, childId); const schoolId = user.schoolId; const t = await S.today(schoolId);
  const consent = (await C.check(schoolId, 'student', kid._id, 'bus_tracking')).allowed; if (!consent) return { live: false, reason: 'no_consent' };
  const a = await TransportAssignment.findOne({ schoolId, studentId: kid._id }); if (!a) return { live: false, reason: 'not_a_rider' };
  const trips = await TpTrip.find({ schoolId, routeId: a.routeId, date: t, status: 'active' }); let pick = null;
  for (const trip of trips) { const b = await TpBoard.findOne({ tripId: trip._id, studentId: kid._id, state: { $in: ['expected', 'boarded'] } }); if (b) { pick = { trip, b }; break; } }
  if (!pick || !pick.trip.lastPos?.at) return { live: false, reason: pick ? 'no_position_yet' : 'no_active_trip' };
  const { trip, b } = pick; const s = trip.stops.find((x) => String(x.stopId) === String(b.stopId));
  return { live: true, direction: trip.direction, routeName: trip.routeName, position: { lat: trip.lastPos.lat, lng: trip.lastPos.lng, at: trip.lastPos.at }, etaAt: s?.arrivedAt ? null : s?.etaAt || null, stopName: b.stopName, stopsAway: s && !s.arrivedAt ? trip.stops.filter((x) => !x.arrivedAt && x.seq < s.seq).length : 0, delayMin: trip.delayMin, state: b.state,
    stops: trip.stops.map((x) => ({ name: x.name, lat: x.lat, lng: x.lng, arrived: !!x.arrivedAt, mine: String(x.stopId) === String(b.stopId) })), note: 'An estimate. The position is shown only while the trip is under way.' };
}
async function skip(user, b) {
  const { kid } = await family(user, b.childId); const schoolId = user.schoolId; const t = await S.today(schoolId); const date = E.isDay(b.date) ? b.date : t; const direction = ['morning', 'afternoon', 'both'].includes(b.direction) ? b.direction : 'both';
  if (date < t) throw new Fail(422, 'Choose today or a later day.'); if (date > E.addDays(t, 60)) throw new Fail(422, 'Choose a day within the next 60 days.');
  const a = await TransportAssignment.findOne({ schoolId, studentId: kid._id }); if (!a) throw new Fail(409, 'This child does not ride a school bus.');
  const trips = await TpTrip.find({ schoolId, routeId: a.routeId, date, ...(direction === 'both' ? {} : { direction }) });
  for (const trip of trips) { const bd = await TpBoard.findOne({ tripId: trip._id, studentId: kid._id }); if (bd && ['boarded', 'alighted'].includes(bd.state)) throw new Fail(409, 'The child is already on that trip.', { reason: 'on_board' }); }
  let row; try { row = await TpOptOut.create({ schoolId, studentId: kid._id, date, direction, reason: clean(b.reason, 200), byParentId: user.role === 'parent' ? oid(user.userId) : null, byName: user.name || '' }); }
  catch (e) { if (!S.isDup(e)) throw e; await TpOptOut.updateOne({ schoolId, studentId: kid._id, date, direction }, { $set: { cancelled: false, reason: clean(b.reason, 200) } }); row = await TpOptOut.findOne({ schoolId, studentId: kid._id, date, direction }); }
  for (const trip of trips) await TpBoard.updateOne({ tripId: trip._id, studentId: kid._id, state: 'expected' }, { $set: { state: 'opted_out' } }).then(() => T.recount(trip._id));
  await S.tellDispatch(schoolId, 'A child will not ride', `${kid.name} will not ride the ${direction === 'both' ? '' : `${direction} `}bus on ${date}.`, { type: 'transport' });
  return row;
}
async function unskip(user, id) {
  const row = must(oid(id) ? await TpOptOut.findOne({ _id: id, schoolId: user.schoolId }) : null, 'notice'); await family(user, row.studentId);
  const t = await S.today(user.schoolId); if (row.date < t) throw new Fail(409, 'That day has passed.');
  await TpOptOut.updateOne({ _id: row._id }, { $set: { cancelled: true } });
  const a = await TransportAssignment.findOne({ schoolId: user.schoolId, studentId: row.studentId });
  const trips = a ? await TpTrip.find({ schoolId: user.schoolId, routeId: a.routeId, date: row.date, status: { $in: ['scheduled', 'checked'] }, ...(row.direction === 'both' ? {} : { direction: row.direction }) }) : [];
  for (const trip of trips) await TpBoard.updateOne({ tripId: trip._id, studentId: row.studentId, state: 'opted_out' }, { $set: { state: 'expected' } }).then(() => T.recount(trip._id));
  return { cancelled: true };
}
async function concern(user, b) {
  const { kid } = await family(user, b.childId); const note = clean(b.note, 500); if (note.length < 10) throw new Fail(422, 'Tell us a little more (at least 10 characters).');
  const inc = await S.numbered(TpIncident, user.schoolId, 'incidentNo', 'TI', { studentId: kid._id, studentName: kid.name, kind: 'family_concern', severity: 'medium', note, reportedByKind: 'family', reportedByName: user.name || (user.role === 'parent' ? 'A parent' : 'A student'), trail: [S.trail({ id: oid(user.userId), name: user.name || '' }, 'reported', note.slice(0, 120))] });
  await S.tellDispatch(user.schoolId, 'Route concern from a family', `${kid.name}: ${note.slice(0, 160)} (${inc.incidentNo}).`); return { incidentNo: inc.incidentNo };
}

/* ───────── reports ───────── */
async function range(schoolId, q) { const t = await S.today(schoolId); let to = E.isDay(q.to) ? q.to : t; let from = E.isDay(q.from) ? q.from : E.addDays(to, -29); if (from > to) [from, to] = [to, from]; if ((new Date(to) - new Date(from)) / 86400000 > 120) from = E.addDays(to, -120); return { from, to }; }
async function punctuality(schoolId, q) {
  const { from, to } = await range(schoolId, q); const cfg = (await S.getCfg(schoolId)).settings; const trips = await TpTrip.find({ schoolId, date: { $gte: from, $lte: to }, status: 'completed' }); const by = new Map();
  for (const t of trips) {
    const last = t.stops[t.stops.length - 1]; const delay = last?.arrivedAt ? Math.round((new Date(last.arrivedAt) - new Date(last.plannedAt)) / 60000) : null; const k = `${t.routeName}|${t.direction}`;
    const r = by.get(k) || { route: t.routeName, direction: t.direction, trips: 0, measured: 0, onTime: 0, totalDelay: 0, maxDelay: 0, unreconciled: 0 }; r.trips += 1; r.unreconciled += t.unreconciled || 0;
    if (delay !== null) { r.measured += 1; r.totalDelay += Math.max(0, delay); r.maxDelay = Math.max(r.maxDelay, delay); if (delay <= cfg.lateNoticeMin) r.onTime += 1; } by.set(k, r);
  }
  const rows = [...by.values()].map((r) => ({ ...r, onTimePct: r.measured ? Math.round((r.onTime / r.measured) * 100) : null, avgDelay: r.measured ? Math.round(r.totalDelay / r.measured) : null })).sort((a, b) => a.route.localeCompare(b.route) || a.direction.localeCompare(b.direction));
  return { from, to, lateAfterMin: cfg.lateNoticeMin, rows, note: `On time means reaching the last stop within ${cfg.lateNoticeMin} minutes of plan. Trips with no stop times are not counted.` };
}
async function ridership(schoolId, q) {
  const { from, to } = await range(schoolId, q); const trips = await TpTrip.find({ schoolId, date: { $gte: from, $lte: to }, status: { $in: ['completed', 'active'] } }); const by = new Map();
  for (const t of trips) { const k = `${t.routeName}|${t.direction}`; const r = by.get(k) || { route: t.routeName, direction: t.direction, trips: 0, boarded: 0, noShow: 0, optedOut: 0, exceptions: 0, seats: 0 }; r.trips += 1; r.boarded += (t.counts?.boarded || 0) + (t.counts?.alighted || 0); r.noShow += t.counts?.noShow || 0; r.optedOut += t.counts?.optedOut || 0; r.exceptions += t.counts?.exceptions || 0; r.seats += t.capacity || 0; by.set(k, r); }
  return { from, to, rows: [...by.values()].map((r) => ({ ...r, avgRiders: r.trips ? Math.round((r.boarded / r.trips) * 10) / 10 : 0, fillPct: r.seats ? Math.round((r.boarded / r.seats) * 100) : null })).sort((a, b) => a.route.localeCompare(b.route)) };
}
async function exceptionsReport(schoolId, q) {
  const { from, to } = await range(schoolId, q); const trips = new Map((await TpTrip.find({ schoolId, date: { $gte: from, $lte: to } }).select('date routeName direction')).map((t) => [String(t._id), t]));
  const rows = (await TpBoard.find({ schoolId, tripId: { $in: [...trips.keys()].map(oid) }, 'exception.kind': { $nin: ['', null] } })).map((b) => { const t = trips.get(String(b.tripId)); return { date: t?.date, route: t?.routeName, direction: t?.direction, student: b.studentName, className: b.className, kind: b.exception.kind, note: b.exception.note, settled: !!b.exception.resolved, resolution: b.exception.resolution || '', by: b.exception.resolvedBy || '' }; }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { from, to, rows };
}

/* ───────── the daily rules ───────── */
async function sweep(schoolId) {
  const now = new Date(); const t = await S.today(schoolId); const cfg = (await S.getCfg(schoolId)).settings; const tz = await S.tzOf(schoolId); const out = { made: 0, missed: 0, closedStale: 0, purged: 0, warned: 0 };
  for (const d of [t, E.addDays(t, 1)]) out.made += (await T.makeTrips(schoolId, d)).made;
  // trips that never started
  for (const trip of await TpTrip.find({ schoolId, status: { $in: ['scheduled', 'checked'] }, plannedStart: { $lt: new Date(now.getTime() - cfg.latestStartMin * 60000) } })) {
    const w = await TpTrip.updateOne({ _id: trip._id, status: { $in: ['scheduled', 'checked'] } }, { $set: { status: 'missed' }, $push: { trail: S.trail(null, 'missed', 'Did not start in time') } }); if (!w.matchedCount) continue; out.missed += 1;
    const ids = (await TpBoard.find({ tripId: trip._id, state: 'expected' })).map((b) => b.studentId);
    await S.tellDispatch(schoolId, 'A bus trip did not run', `${trip.routeName} ${trip.direction} on ${trip.date} never started.`, { urgent: true });
    if (trip.date === t) await S.tellFamilies(schoolId, ids, 'School bus trip did not run', `${trip.routeName}: the ${trip.direction} trip did not run. The school will contact you.`, { urgent: true });
  }
  // trips left active for too long are closed and flagged
  for (const trip of await TpTrip.find({ schoolId, status: 'active', startedAt: { $lt: new Date(now.getTime() - cfg.staleActiveHours * 3600000) } })) {
    const boards = await TpBoard.find({ tripId: trip._id }); const left = boards.filter((b) => b.state === 'boarded' || b.state === 'expected');
    const w = await TpTrip.updateOne({ _id: trip._id, status: 'active' }, { $set: { status: 'completed', endedAt: now, unreconciled: left.length, closeNote: 'Closed by the daily check: the trip was left active.' }, $push: { trail: S.trail(null, 'closed', 'Left active too long') } }); if (!w.matchedCount) continue; out.closedStale += 1;
    await T.recount(trip._id);
    if (left.length) await T.openIncident({ schoolId, byKind: 'system', byName: 'Daily check' }, trip, { kind: 'child_missing', severity: 'critical', note: `Trip was left active and closed with ${left.length} child(ren) not accounted for: ${left.map((b) => b.studentName).join(', ')}.`, keepPositions: true, familiesNote: true }, left.map((b) => b.studentId));
    else await S.tellDispatch(schoolId, 'A trip was left open', `${trip.routeName} ${trip.direction} on ${trip.date} was closed by the daily check.`); await T.purge(trip._id, left.length > 0);
  }
  // positions are not kept: gone once a trip ends, unless an incident needed them and has since been settled or its keep time has run out
  const old = await TpTrip.find({ schoolId, status: 'completed', positionsPurgedAt: null, endedAt: { $lt: new Date(now.getTime() - 3600000) } }).limit(200);
  for (const trip of old) { const open = await TpIncident.countDocuments({ schoolId, tripId: trip._id, keepPositions: true, status: { $in: ['open', 'acknowledged'] } }); const aged = trip.endedAt < new Date(now.getTime() - cfg.incidentPingDays * 86400000); if (!open || aged) { await TpPing.deleteMany({ tripId: trip._id }); await TpTrip.updateOne({ _id: trip._id }, { $set: { positionsPurgedAt: now }, $unset: { lastPos: '' } }); out.purged += 1; } }
  // reminders, once a day for each thing
  const key = `transport-warn:${schoolId}`; const led = (await AppSetting.findOne({ key }))?.value || {}; const set = {}; const soon = E.addDays(t, cfg.documentWarnDays); const lines = [];
  const mark = (k, text) => { if (led[k] === t) return; set[k] = t; lines.push(text); };
  for (const v of await TpVehicle.find({ schoolId, status: { $ne: 'retired' } })) {
    if (v.fitnessExpiry && v.fitnessExpiry <= soon) mark(`fit_${v._id}`, `${v.plate}: fitness certificate ${v.fitnessExpiry < t ? 'expired' : 'expires'} ${v.fitnessExpiry}`);
    if (v.insuranceExpiry && v.insuranceExpiry <= soon) mark(`ins_${v._id}`, `${v.plate}: insurance ${v.insuranceExpiry < t ? 'expired' : 'expires'} ${v.insuranceExpiry}`);
    if (v.status === 'active' && (!v.nextInspectionDue || v.nextInspectionDue <= t)) mark(`insp_${v._id}`, `${v.plate}: inspection ${v.nextInspectionDue ? `was due ${v.nextInspectionDue}` : 'has never been done'}`);
  }
  for (const d of await TpDriver.find({ schoolId, status: 'active' })) if (d.licenceExpiry && d.licenceExpiry <= soon) mark(`lic_${d._id}`, `${d.name}: licence ${d.licenceExpiry < t ? 'expired' : 'expires'} ${d.licenceExpiry}`);
  if (lines.length) { await AppSetting.updateOne({ key }, { $set: { value: { ...led, ...set } } }, { upsert: true }); await S.tellDispatch(schoolId, 'Transport reminders', lines.slice(0, 8).join('. ') + (lines.length > 8 ? `, and ${lines.length - 8} more.` : '.')); out.warned = lines.length; }
  return out;
}

module.exports = { overview, listTrips, tripDetail, driverToday, driverTrip, driverSync, collectorsFor, myView, myLive, skip, unskip, concern, punctuality, ridership, exceptionsReport, sweep, tripLine };
