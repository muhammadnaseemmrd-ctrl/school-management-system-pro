// Trips, boarding and onboard reconciliation (PRD E22). Every driver and dispatcher action goes through applyOp, so a phone that was offline can resend and nothing happens twice.
const S = require('./service');
const { E, A, Fail, oid, clean } = S;
const TpTrip = require('../../models/TpTrip'); const TpBoard = require('../../models/TpBoard'); const TpEvent = require('../../models/TpEvent'); const TpPing = require('../../models/TpPing');
const TpPlan = require('../../models/TpPlan'); const TpStop = require('../../models/TpStop'); const TpVehicle = require('../../models/TpVehicle'); const TpDriver = require('../../models/TpDriver');
const TpIncident = require('../../models/TpIncident'); const TpOptOut = require('../../models/TpOptOut');
const TransportRoute = require('../../models/TransportRoute'); const TransportAssignment = require('../../models/TransportAssignment');
const Student = require('../../models/Student'); const Class = require('../../models/Class'); const DailyAttendance = require('../../models/DailyAttendance');
const GuardianLink = require('../../models/GuardianLink'); const Parent = require('../../models/Parent');
const GR = require('../guardianRights');

const plain = (d) => (d && d.toObject ? d.toObject() : d);
const LIVE = ['scheduled', 'checked', 'active'];
const className = (c) => (c ? `${c.standard || ''}${c.division ? ` ${c.division}` : ''}`.trim() : '');

/* ───────── making the day's trips from the plans ───────── */
// Idempotent: a trip is one route, one direction, one day, and a second run finds it already there.
async function makeTrips(schoolId, date, { only = null } = {}) {
  const sidv = oid(schoolId); const tz = await S.tzOf(schoolId); const wd = E.weekday(date);
  const out = { date, made: 0, existing: 0, skipped: [] };
  const plans = (await TpPlan.find({ schoolId: sidv, status: 'active' })).filter((p) => (p.days || []).includes(wd) && (!only || String(p._id) === String(only)));
  if (!plans.length) return out;
  const routeIds = [...new Set(plans.map((p) => String(p.routeId)))];
  const [routes, vehicles, drivers, stops, riders, optouts] = await Promise.all([
    TransportRoute.find({ schoolId: sidv, _id: { $in: routeIds } }), TpVehicle.find({ schoolId: sidv }), TpDriver.find({ schoolId: sidv }),
    TpStop.find({ schoolId: sidv, routeId: { $in: routeIds }, active: true }), TransportAssignment.find({ schoolId: sidv, routeId: { $in: routeIds } }),
    TpOptOut.find({ schoolId: sidv, date, cancelled: { $ne: true } }),
  ]);
  const kids = new Map((await Student.find({ schoolId: sidv, _id: { $in: riders.map((r) => r.studentId) }, isActive: { $ne: false } }).select('name classId')).map((s) => [String(s._id), s]));
  const cls = new Map((await Class.find({ schoolId: sidv, _id: { $in: [...new Set([...kids.values()].map((k) => String(k.classId || '')).filter(Boolean))] } })).map((c) => [String(c._id), c]));
  const leaves = await A.leaveMap(sidv, [...kids.keys()], date);
  const away = new Set((await DailyAttendance.find({ schoolId: sidv, date: A.toUTCDay(date), studentId: { $in: [...kids.keys()].map(oid) }, status: { $in: ['Absent', 'Leave'] } }).select('studentId')).map((x) => String(x.studentId)));
  for (const plan of plans) {
    const route = routes.find((r) => String(r._id) === String(plan.routeId));
    if (!route || route.isActive === false) { out.skipped.push({ planId: plan._id, why: 'route_inactive' }); continue; }
    const rs = stops.filter((s) => String(s.routeId) === String(plan.routeId));
    if (!rs.length) { out.skipped.push({ planId: plan._id, route: route.name, why: 'no_stops' }); continue; }
    const veh = vehicles.find((v) => String(v._id) === String(plan.vehicleId)); const drv = drivers.find((d) => String(d._id) === String(plan.driverId));
    const start = E.localToUtc(date, E.mins(plan.startTime), tz); const stopRows = E.runStops(rs, plan.direction, start, plan.durationMin);
    const end = new Date(start.getTime() + plan.durationMin * 60000); const key = `${plan.routeId}:${date}:${plan.direction}`;
    let trip;
    try {
      trip = await TpTrip.create({ schoolId: sidv, tripKey: key, routeId: route._id, routeName: route.name, planId: plan._id, direction: plan.direction, date, vehicleId: veh?._id || null, vehiclePlate: veh?.plate || '', capacity: veh?.capacity || 0,
        driverId: drv?._id || null, driverName: drv?.name || '', escortName: plan.escortName || '', plannedStart: start, plannedEnd: end, stops: stopRows, checklist: { items: (await S.getCfg(schoolId)).settings.checklist.map((i) => ({ ...i, ok: false, note: '' })) },
        trail: [S.trail(null, 'made', 'From the standing plan')] });
    } catch (e) { if (S.isDup(e)) { out.existing += 1; continue; } throw e; }
    const onRoute = riders.filter((r) => String(r.routeId) === String(plan.routeId)); const here = (r) => r.stopId && rs.some((x) => String(x._id) === String(r.stopId));
    const mine = onRoute.filter((r) => here(r) && kids.has(String(r.studentId)));
    const noStop = onRoute.filter((r) => !here(r)).length;
    if (noStop) out.skipped.push({ planId: plan._id, route: route.name, why: 'riders_without_stop', count: noStop });
    const stopName = new Map(rs.map((s) => [String(s._id), s.name]));
    const rows = mine.map((r) => {
      const k = kids.get(String(r.studentId)); const id = String(r.studentId);
      const out1 = optouts.find((o) => String(o.studentId) === id && (o.direction === 'both' || o.direction === plan.direction));
      const state = out1 ? 'opted_out' : (leaves.has(id) || away.has(id)) ? 'absent' : 'expected';
      return { schoolId: sidv, tripId: trip._id, studentId: r.studentId, studentName: k.name, className: className(cls.get(String(k.classId))), stopId: r.stopId, stopName: stopName.get(String(r.stopId)) || '', handoff: r.handoff || 'release', state };
    });
    if (rows.length) await TpBoard.insertMany(rows, { ordered: false });
    await recount(trip._id); out.made += 1;
    if (veh && rows.length > veh.capacity) await S.tellDispatch(schoolId, 'Bus is over capacity', `${route.name} ${plan.direction}: ${rows.length} riders for ${veh.capacity} seats on ${veh.plate}.`);
  }
  return out;
}
let lastEnsure = new Map();
const ensureTrips = async (schoolId, date) => { const k = `${schoolId}:${date}`; if (Date.now() - (lastEnsure.get(k) || 0) < 60000) return null; lastEnsure.set(k, Date.now()); return makeTrips(schoolId, date); };
const resetEnsure = () => lastEnsure.clear();

async function recount(tripId) {
  const boards = await TpBoard.find({ tripId });
  const c = E.reconcile(boards);
  await TpTrip.updateOne({ _id: tripId }, { $set: { counts: { expected: c.expected, boarded: c.boarded, alighted: c.alighted, noShow: c.noShow, optedOut: c.optedOut, exceptions: c.exceptions } } });
  return c;
}

/* ───────── one action on a trip ───────── */
const when = (op, now) => { let at = op.at ? new Date(op.at) : now; if (Number.isNaN(at.getTime())) at = now; if (at.getTime() > now.getTime() + 120000) at = now; if (at.getTime() < now.getTime() - 12 * 3600000) at = now; return at; };
async function claim(ctx, trip, kind, op, at, now, extra = {}) {
  const key = op.clientKey ? clean(op.clientKey, 80) : '';
  if (!key) return { event: null };
  try { return { event: await require('../../models/TpEvent').create({ schoolId: trip.schoolId, tripId: trip._id, kind, studentId: extra.studentId || null, stopId: extra.stopId || null, at, late: now - at > 120000, clientKey: key, byKind: ctx.byKind, byName: ctx.byName, data: extra.data || {} }) }; }
  catch (e) { if (S.isDup(e)) return { dup: true }; throw e; }
}
const logEvent = (ctx, trip, kind, at, now, extra = {}) => TpEvent.create({ schoolId: trip.schoolId, tripId: trip._id, kind, studentId: extra.studentId || null, stopId: extra.stopId || null, at, late: now - at > 120000, byKind: ctx.byKind, byName: ctx.byName, data: extra.data || {} }).catch(() => null);
const system = (trip, kind, key, data = {}) => TpEvent.create({ schoolId: trip.schoolId, tripId: trip._id, kind, at: new Date(), clientKey: key, byKind: 'system', byName: 'Aulensia', data }).then(() => true).catch((e) => { if (S.isDup(e)) return false; return false; });

async function loadTrip(ctx, tripId) {
  const trip = oid(tripId) ? await TpTrip.findOne({ _id: tripId, schoolId: ctx.schoolId }) : null;
  if (!trip) throw new Fail(404, 'That trip is not in your school.');
  if (ctx.driver) {
    if (String(trip.driverId) !== String(ctx.driver._id)) throw new Fail(403, 'This trip is not given to you.');
    if (trip.status !== 'active' && trip.date !== await S.today(ctx.schoolId)) throw new Fail(409, 'This trip is not for today.');
  }
  return trip;
}
const needActive = (trip) => { if (trip.status !== 'active') throw new Fail(409, trip.status === 'completed' ? 'This trip has already ended.' : 'This trip has not started.', { reason: 'not_active', status: trip.status }); };

async function applyOp(ctx, tripId, op) {
  const now = new Date(); const o = op || {}; const type = String(o.type || '');
  const trip = await loadTrip(ctx, tripId); const at = when(o, now); const cfg = (await S.getCfg(ctx.schoolId)).settings; const tz = await S.tzOf(ctx.schoolId);
  const handler = OPS[type]; if (!handler) throw new Fail(400, 'That action is not known.');
  if (['cancelled', 'missed'].includes(trip.status) || (trip.status === 'completed' && type !== 'incident')) throw new Fail(409, trip.status === 'completed' ? 'This trip has already ended.' : 'This trip is closed.', { reason: 'closed', status: trip.status });
  const c = type === 'ping' ? { event: null } : await claim(ctx, trip, type, o, at, now, { studentId: oid(o.studentId), stopId: oid(o.stopId), data: { type } });
  if (c.dup) return { ok: true, replayed: true };
  try {
    const r = await handler({ ctx, trip, o, at, now, cfg, tz });
    if (!c.event && type !== 'ping') await logEvent(ctx, trip, type, at, now, { studentId: oid(o.studentId), stopId: oid(o.stopId), data: r && r.log ? r.log : {} });
    return { ok: true, ...(r && r.result ? r.result : {}) };
  } catch (e) { if (c.event) await TpEvent.deleteOne({ _id: c.event._id }).catch(() => {}); throw e; }
}

const boardOf = async (trip, studentId) => { const b = oid(studentId) ? await TpBoard.findOne({ tripId: trip._id, studentId }) : null; if (!b) throw new Fail(404, 'That child is not on this trip\'s list.', { reason: 'not_listed' }); return b; };
const fresh = (id) => TpTrip.findById(id);

const OPS = {
  /* — before the trip — */
  async checklist({ ctx, trip, o, tz }) {
    if (!['scheduled', 'checked'].includes(trip.status)) throw new Fail(409, 'The checklist can only be done before the trip starts.');
    const given = new Map((Array.isArray(o.items) ? o.items : []).map((i) => [String(i.key), i]));
    const items = trip.checklist.items.map((i) => { const g = given.get(i.key); return { key: i.key, label: i.label, critical: i.critical, ok: !!(g && g.ok === true), note: clean(g?.note, 200) }; });
    if (items.some((i) => !given.has(i.key))) throw new Fail(422, 'Answer every line of the checklist.', { reason: 'incomplete' });
    const failed = items.filter((i) => i.critical && !i.ok);
    await TpTrip.updateOne({ _id: trip._id, status: { $in: ['scheduled', 'checked'] } }, { $set: { 'checklist.items': items, 'checklist.doneAt': new Date(), 'checklist.byName': ctx.byName, status: failed.length ? 'scheduled' : 'checked' } });
    if (failed.length) {
      await openIncident(ctx, trip, { kind: 'vehicle_fault', severity: 'high', note: `Pre-trip checklist failed: ${failed.map((f) => f.label).join('; ')}.`, keepPositions: false });
      return { result: { passed: false, failed: failed.map((f) => f.label), message: 'The bus failed a safety check and cannot start. The transport office has been told.' } };
    }
    return { result: { passed: true, warnings: items.filter((i) => !i.critical && !i.ok).map((i) => i.label) } };
  },

  async start({ ctx, trip, o, at, now, cfg, tz }) {
    if (trip.status === 'active') return { result: { alreadyStarted: true } };
    const staff = ctx.byKind === 'staff'; const override = staff ? clean(o.override, 200) : '';
    if (trip.status === 'scheduled' && !(staff && override.length >= 5)) throw new Fail(409, 'Do the pre-trip checklist first.', { reason: 'checklist' });
    if (!trip.driverId || !trip.vehicleId) throw new Fail(409, 'A trip needs a vehicle and a driver before it can start.', { reason: 'unassigned' });
    const [veh, drv] = await Promise.all([TpVehicle.findOne({ _id: trip.vehicleId, schoolId: trip.schoolId }), TpDriver.findOne({ _id: trip.driverId, schoolId: trip.schoolId })]);
    if (!veh || veh.status !== 'active') throw new Fail(409, veh?.status === 'inspection_hold' ? 'This vehicle is on hold after a failed inspection.' : 'This vehicle cannot be used.', { reason: 'vehicle_hold' });
    if (!drv || drv.status !== 'active') throw new Fail(409, 'This driver cannot drive trips right now.', { reason: 'driver' });
    const day = trip.date; const expired = [];
    if (drv.licenceExpiry && drv.licenceExpiry < day) expired.push('driver licence');
    if (veh.fitnessExpiry && veh.fitnessExpiry < day) expired.push('vehicle fitness certificate');
    if (veh.insuranceExpiry && veh.insuranceExpiry < day) expired.push('vehicle insurance');
    if (expired.length && !(staff && override.length >= 5)) throw new Fail(409, `The ${expired.join(' and ')} has expired. The transport office must renew it.`, { reason: 'expired', expired });
    const early = (new Date(trip.plannedStart) - now) / 60000; const late = (now - new Date(trip.plannedStart)) / 60000;
    if ((early > cfg.earliestStartMin || late > cfg.latestStartMin) && !(staff && override.length >= 5)) throw new Fail(409, early > 0 ? `This trip can start up to ${cfg.earliestStartMin} minutes before its planned time.` : `This trip is more than ${cfg.latestStartMin} minutes past its planned time. Ask the transport office.`, { reason: 'window' });
    const won = await TpTrip.updateOne({ _id: trip._id, status: { $in: ['checked', 'scheduled'] } }, { $set: { status: 'active', startedAt: at > now ? now : at }, $push: { trail: S.trail({ id: ctx.byId, name: ctx.byName }, 'started', override ? `Override: ${override}` : '') } });
    if (!won.matchedCount) return { result: { alreadyStarted: true } };
    await refreshAbsent(trip);
    await recount(trip._id); const t = await fresh(trip._id); await afterMove(t, cfg, tz, 0, true);
    const boards = await TpBoard.find({ tripId: trip._id, state: 'expected' });
    const first = new Map();
    for (const b of boards) first.set(String(b.stopId), (first.get(String(b.stopId)) || []).concat([b.studentId]));
    for (const [stopId, ids] of first) {
      const s = t.stops.find((x) => String(x.stopId) === stopId);
      await S.tellFamilies(trip.schoolId, ids, trip.direction === 'morning' ? 'The school bus is on its way' : 'The school bus has left school', `${trip.routeName}: expected at ${s?.name || 'your stop'} about ${S.hm(s?.etaAt || s?.plannedAt, tz)}.`);
    }
    return { result: { startedAt: (await fresh(trip._id)).startedAt } };
  },

  /* — on the road — */
  async ping({ ctx, trip, o, now, cfg, tz }) {
    needActive(trip); const p = E.checkPing(o, now); if (!p.ok) throw new Fail(422, 'That position was not accepted.', { reason: p.why });
    if (trip.lastPos?.at && p.at - new Date(trip.lastPos.at) < cfg.pingMinSeconds * 1000 && p.at >= new Date(trip.lastPos.at)) return { result: { ignored: true } };
    if (await TpPing.findOne({ tripId: trip._id, at: p.at })) return { result: { ignored: true } };
    await TpPing.create({ schoolId: trip.schoolId, tripId: trip._id, lat: p.lat, lng: p.lng, speedKmh: p.speedKmh, at: p.at });
    const newer = !trip.lastPos?.at || p.at >= new Date(trip.lastPos.at);
    if (newer) { await TpTrip.updateOne({ _id: trip._id, status: 'active' }, { $set: { lastPos: { lat: p.lat, lng: p.lng, speedKmh: p.speedKmh, at: p.at } } }); await afterMove(await fresh(trip._id), cfg, tz, p.speedKmh, false); }
    return { result: { stored: true }, log: { lat: undefined } };
  },

  async arrive({ ctx, trip, o, at, now, cfg, tz }) {
    needActive(trip); const sid = oid(o.stopId); const idx = trip.stops.findIndex((s) => String(s.stopId) === String(sid));
    if (idx < 0) throw new Fail(404, 'That stop is not on this trip.');
    if (trip.stops[idx].arrivedAt) return { result: { alreadyThere: true } };
    const stops = trip.stops.map((s) => ({ ...plain(s) })); stops[idx].arrivedAt = at;
    await TpTrip.updateOne({ _id: trip._id, status: 'active' }, { $set: { stops } });
    const t = await fresh(trip._id); await afterMove(t, cfg, tz, t.lastPos?.speedKmh || 0, false);
    if (cfg.approachNotice && await system(trip, 'approach', `approach:${sid}`)) {
      const ids = (await TpBoard.find({ tripId: trip._id, stopId: sid, state: trip.direction === 'morning' ? 'expected' : 'boarded' })).map((b) => b.studentId);
      await S.tellFamilies(trip.schoolId, ids, 'The school bus has reached the stop', `${trip.routeName} is at ${stops[idx].name} now.`);
    }
    return { result: { arrivedAt: at } };
  },

  async board({ ctx, trip, o, at, now, cfg, tz }) {
    needActive(trip); const b = await boardOf(trip, o.studentId);
    if (b.state === 'boarded') return { result: { already: true } };
    if (b.state === 'alighted') throw new Fail(409, 'That child has already got off this trip.', { reason: 'already_off' });
    const won = await TpBoard.updateOne({ tripId: trip._id, studentId: b.studentId, state: { $in: ['expected', 'no_show', 'opted_out', 'absent', 'exception'] } }, { $set: { state: 'boarded', boardedAt: at, source: ctx.byKind, 'exception.resolved': true } });
    if (!won.matchedCount) return { result: { already: true } };
    const c = await recount(trip._id); const t = await fresh(trip._id);
    const at1 = t.stops.find((s) => String(s.stopId) === String(oid(o.stopId) || b.stopId));
    await S.tellFamilies(trip.schoolId, [b.studentId], `${b.studentName.split(' ')[0]} is on the school bus`, `${trip.routeName}: boarded${at1 ? ` at ${at1.name}` : ''} at ${S.hm(at, tz)}.`);
    if (trip.capacity && c.boarded > trip.capacity && await system(trip, 'over_capacity', `cap:${c.boarded}`)) await S.tellDispatch(trip.schoolId, 'Bus is over capacity', `${trip.routeName}: ${c.boarded} children on board for ${trip.capacity} seats.`, { urgent: true });
    return { result: { boarded: c.boarded }, log: { wrongStop: o.stopId && b.stopId && String(o.stopId) !== String(b.stopId) } };
  },

  async no_show({ ctx, trip, o, tz }) {
    needActive(trip); const b = await boardOf(trip, o.studentId);
    if (b.state === 'no_show') return { result: { already: true } };
    const won = await TpBoard.updateOne({ tripId: trip._id, studentId: b.studentId, state: 'expected' }, { $set: { state: 'no_show', source: ctx.byKind } });
    if (!won.matchedCount) throw new Fail(409, b.state === 'boarded' ? 'That child is already on the bus.' : 'That child is not waiting for this trip.', { reason: 'state', state: b.state });
    await recount(trip._id);
    await S.tellFamilies(trip.schoolId, [b.studentId], `${b.studentName.split(' ')[0]} was not at the stop`, trip.direction === 'morning' ? `${trip.routeName}: the bus waited at ${b.stopName} and carried on. Please make sure ${b.studentName.split(' ')[0]} gets to school.` : `${trip.routeName}: ${b.studentName.split(' ')[0]} did not get on the bus after school. The school is checking.`, { urgent: trip.direction === 'afternoon', type: trip.direction === 'afternoon' ? 'safety' : 'transport' });
    if (trip.direction === 'afternoon') await S.tellDispatch(trip.schoolId, 'A child did not board the afternoon bus', `${b.studentName} (${b.className}) did not board ${trip.routeName}.`, { urgent: true, type: 'safety' });
    return { result: { state: 'no_show' } };
  },

  async alight({ ctx, trip, o, at, tz }) {
    needActive(trip); const b = await boardOf(trip, o.studentId);
    if (b.state === 'alighted') return { result: { already: true } };
    if (b.state !== 'boarded') throw new Fail(409, 'That child is not marked on board.', { reason: 'not_on_board', state: b.state });
    const h = o.handedTo || {}; const kind = E.HANDOFF_KINDS.includes(h.kind) ? h.kind : (trip.direction === 'morning' ? 'school' : (b.handoff === 'guardian' ? '' : 'self'));
    const sidv = oid(o.stopId) || b.stopId; const stopName = trip.stops.find((s) => String(s.stopId) === String(sidv))?.name || b.stopName;
    let handedTo = { kind, name: clean(h.name, 80) };
    if (trip.direction === 'afternoon' && (b.handoff === 'guardian' || kind === 'guardian' || kind === 'authorised')) {
      if (h.kind === 'no_one') return hold(ctx, trip, b, 'no_one_at_stop', 'Nobody was at the stop to receive the child.');
      const ref = String(h.ref || ''); const parentId = ref.startsWith('p:') ? oid(ref.slice(2)) : null; const personName = ref.startsWith('n:') ? ref.slice(2) : clean(h.name, 80);
      if (!parentId && !personName) throw new Fail(422, 'Choose who is receiving the child.', { reason: 'collector' });
      const dec = await GR.pickupDecision(trip.schoolId, b.studentId, { parentId, personName });
      if (dec.decision !== 'Authorised') { await hold(ctx, trip, b, 'unauthorised_collector', 'The person at the stop is not on the child\'s authorised list.'); throw new Fail(409, 'Do not release the child. Ask the person to wait and call the family or the principal.', { reason: 'handoff_refused', stillOnBus: true }); }
      const who = parentId ? (await Parent.findById(parentId).select('name'))?.name || personName : personName; handedTo = { kind: 'guardian', name: who || 'Authorised adult', parentId };
    }
    const won = await TpBoard.updateOne({ tripId: trip._id, studentId: b.studentId, state: 'boarded' }, { $set: { state: 'alighted', alightedAt: at, alightedStopId: sidv, handedTo, source: ctx.byKind } });
    if (!won.matchedCount) return { result: { already: true } };
    await recount(trip._id);
    await S.tellFamilies(trip.schoolId, [b.studentId], `${b.studentName.split(' ')[0]} got off the bus`, `${trip.routeName}: ${trip.direction === 'morning' ? 'arrived at school' : `got off at ${stopName}${handedTo.name && handedTo.kind === 'guardian' ? `, received by ${handedTo.name}` : ''}`} at ${S.hm(at, tz)}.`);
    return { result: { state: 'alighted' } };
  },

  // morning: the bus is at school and everyone on board gets off together
  async school_arrival({ ctx, trip, at, tz }) {
    needActive(trip); if (trip.direction !== 'morning') throw new Fail(409, 'School arrival is for the morning run.');
    const on = await TpBoard.find({ tripId: trip._id, state: 'boarded' }); const last = trip.stops[trip.stops.length - 1];
    if (last && !last.arrivedAt) { const stops = trip.stops.map((s) => ({ ...plain(s) })); stops[stops.length - 1].arrivedAt = at; await TpTrip.updateOne({ _id: trip._id }, { $set: { stops } }); }
    await TpBoard.updateMany({ tripId: trip._id, state: 'boarded' }, { $set: { state: 'alighted', alightedAt: at, alightedStopId: last?.stopId || null, handedTo: { kind: 'school', name: 'School' }, source: ctx.byKind } });
    await recount(trip._id);
    if (on.length) await S.tellFamilies(trip.schoolId, on.map((b) => b.studentId), 'Arrived at school', `${trip.routeName}: the bus reached school at ${S.hm(at, tz)}.`);
    return { result: { alighted: on.length } };
  },

  async exception({ ctx, trip, o }) {
    const b = await boardOf(trip, o.studentId); const kind = ['unauthorised_collector', 'no_one_at_stop', 'wrong_stop', 'refused_to_board', 'behaviour', 'other'].includes(o.kind) ? o.kind : 'other'; const note = clean(o.note, 300);
    if (kind === 'other' && note.length < 5) throw new Fail(422, 'Say what happened.');
    return hold(ctx, trip, b, kind, note, false);
  },

  async incident({ ctx, trip, o }) {
    const r = await openIncident(ctx, trip, o); return { result: { incidentNo: r.incidentNo } };
  },

  async end({ ctx, trip, o, at, now, cfg, tz }) {
    needActive(trip); const boards = await TpBoard.find({ tripId: trip._id });
    const chk = E.canClose(boards, trip, { emptyChecked: o.emptyChecked === true, reason: o.reason });
    if (!chk.ok) throw new Fail(409, chk.message, { reason: chk.code, onboard: chk.onboard, waiting: chk.waiting });
    const left = boards.filter((b) => b.state === 'boarded'); const waiting = boards.filter((b) => b.state === 'expected');
    const won = await TpTrip.updateOne({ _id: trip._id, status: 'active' }, { $set: { status: 'completed', endedAt: at > now ? now : at, closeNote: clean(o.reason, 300), unreconciled: left.length + waiting.length, emptyCheck: { done: true, at: now, byName: ctx.byName, count: Math.max(0, Number(o.count) || 0) } }, $push: { trail: S.trail({ id: ctx.byId, name: ctx.byName }, 'ended', clean(o.reason, 200)) } });
    if (!won.matchedCount) return { result: { alreadyEnded: true } };
    await recount(trip._id);
    if (left.length || waiting.length) {
      const names = [...left, ...waiting].map((b) => b.studentName).join(', ');
      await openIncident({ ...ctx, byKind: 'system' }, trip, { kind: 'child_missing', severity: 'critical', note: `Trip ended with ${left.length} on board and ${waiting.length} not marked: ${names}. Reason given: ${clean(o.reason, 200)}`, keepPositions: true, studentId: (left[0] || waiting[0]).studentId, familiesNote: true }, [...left, ...waiting].map((b) => b.studentId));
    }
    await purge(trip._id, left.length > 0 || waiting.length > 0);
    return { result: { ended: true, unreconciled: left.length + waiting.length } };
  },
};

// A child could not be handed over, or the driver reports a problem with one: the child stays on the bus and the office is told
async function hold(ctx, trip, b, kind, note, stays = true) {
  await TpBoard.updateOne({ tripId: trip._id, studentId: b.studentId }, { $set: { exception: { kind, note, resolved: false, resolvedBy: '', resolution: '' } } });
  await recount(trip._id);
  await S.tellDispatch(trip.schoolId, 'Bus exception: a child needs attention', `${trip.routeName}: ${b.studentName} (${b.className}) - ${note || kind.replace(/_/g, ' ')}.`, { urgent: true, type: 'safety' });
  return { result: { held: stays, exception: kind, message: stays ? 'The child stays on the bus. The transport office has been told and will call you.' : 'Noted. The transport office has been told.' } };
}

async function openIncident(ctx, trip, o, studentIds = null) {
  const kind = TpIncident.KINDS.includes(o.kind) ? o.kind : 'other'; const severity = ['low', 'medium', 'high', 'critical'].includes(o.severity) ? o.severity : 'medium'; const note = clean(o.note, 600);
  if (note.length < 5) throw new Fail(422, 'Say what happened.');
  const sidv = oid(o.studentId); const stu = sidv ? await Student.findOne({ _id: sidv, schoolId: trip.schoolId }).select('name') : null;
  const keep = o.keepPositions === true || severity === 'critical' || ['accident', 'child_missing', 'medical'].includes(kind);
  const inc = await S.numbered(TpIncident, trip.schoolId, 'incidentNo', 'TI', { tripId: trip._id, routeName: trip.routeName, vehicleId: trip.vehicleId, vehiclePlate: trip.vehiclePlate, studentId: stu?._id || null, studentName: stu?.name || '', kind, severity, note,
    reportedByKind: ctx.byKind, reportedByName: ctx.byName, keepPositions: keep, trail: [S.trail({ id: ctx.byId, name: ctx.byName }, 'reported', note.slice(0, 120))] });
  const urgent = severity === 'high' || severity === 'critical';
  await S.tellDispatch(trip.schoolId, urgent ? `URGENT bus incident: ${kind.replace(/_/g, ' ')}` : `Bus incident: ${kind.replace(/_/g, ' ')}`, `${trip.routeName} (${trip.vehiclePlate}), driver ${trip.driverName || 'unknown'}: ${note.slice(0, 160)} (${inc.incidentNo}).`, { urgent, type: urgent ? 'safety' : 'transport' });
  // families of children who are on board are told something is being handled, never the detail
  if (urgent && trip.status === 'active' || o.familiesNote) {
    const ids = studentIds || (await TpBoard.find({ tripId: trip._id, state: 'boarded' })).map((b) => b.studentId);
    if (ids.length) { const n = await S.tellFamilies(trip.schoolId, ids, 'School bus: the school is responding', `${trip.routeName}: there is a problem on the trip. The school is dealing with it and will contact you. Please keep your phone close.`, { urgent: true, type: 'safety' }); if (n) await TpIncident.updateOne({ _id: inc._id }, { $set: { familiesTold: true } }); }
  }
  return inc;
}

// Positions are kept only while the trip is active, unless an incident needs them
async function purge(tripId, keep) {
  const trip = await TpTrip.findById(tripId); if (!trip) return;
  const inc = keep || (await TpIncident.countDocuments({ schoolId: trip.schoolId, tripId, keepPositions: true })) > 0;
  if (inc) return;
  await TpPing.deleteMany({ tripId }); await TpTrip.updateOne({ _id: tripId }, { $set: { positionsPurgedAt: new Date() }, $unset: { lastPos: '' } });
}

// Move ETAs and the delay along, and tell the families of a stop once when the run is running late for them
async function afterMove(trip, cfg, tz, speed, starting) {
  const e = E.etas(trip, new Date(), speed); const stops = trip.stops.map((s) => ({ ...plain(s), etaAt: e.etaByStop[String(s.stopId)] ? new Date(e.etaByStop[String(s.stopId)]) : s.etaAt }));
  await TpTrip.updateOne({ _id: trip._id }, { $set: { stops, delayMin: e.delayMin } });
  if (starting) return;
  for (const s of stops) {
    if (s.arrivedAt || !s.etaAt) continue;
    if ((new Date(s.etaAt) - new Date(s.plannedAt)) / 60000 < cfg.lateNoticeMin) continue;
    if (!(await system(trip, 'late_notice', `late:${s.stopId}`, { eta: s.etaAt }))) continue;
    const ids = (await TpBoard.find({ tripId: trip._id, stopId: s.stopId, state: { $in: trip.direction === 'morning' ? ['expected'] : ['boarded'] } })).map((b) => b.studentId);
    await S.tellFamilies(trip.schoolId, ids, 'The school bus is running late', `${trip.routeName}: now expected at ${s.name} about ${S.hm(s.etaAt, tz)} (about ${Math.max(1, Math.round((new Date(s.etaAt) - new Date(s.plannedAt)) / 60000))} minutes late).`);
  }
}

// Children who are on leave or marked absent today do not wait at a stop
async function refreshAbsent(trip) {
  const boards = await TpBoard.find({ tripId: trip._id, state: 'expected' }); if (!boards.length) return;
  const ids = boards.map((b) => b.studentId); const leaves = await A.leaveMap(trip.schoolId, ids, trip.date);
  const away = new Set((await DailyAttendance.find({ schoolId: trip.schoolId, date: A.toUTCDay(trip.date), studentId: { $in: ids }, status: { $in: ['Absent', 'Leave'] } }).select('studentId')).map((x) => String(x.studentId)));
  const gone = ids.filter((i) => leaves.has(String(i)) || away.has(String(i)));
  if (gone.length) await TpBoard.updateMany({ tripId: trip._id, studentId: { $in: gone }, state: 'expected' }, { $set: { state: 'absent' } });
}

/* ───────── office actions on a trip ───────── */
async function cancelTrip(ctx, tripId, reason) {
  const r = clean(reason, 200); if (r.length < 5) throw new Fail(422, 'Say why the trip is cancelled.');
  const trip = oid(tripId) ? await TpTrip.findOne({ _id: tripId, schoolId: ctx.schoolId }) : null; if (!trip) throw new Fail(404, 'That trip is not in your school.');
  if (trip.status === 'active') throw new Fail(409, 'A trip that is under way must be ended, not cancelled.');
  const won = await TpTrip.updateOne({ _id: trip._id, status: { $in: ['scheduled', 'checked'] } }, { $set: { status: 'cancelled', cancelReason: r }, $push: { trail: S.trail(ctx.actor, 'cancelled', r) } });
  if (!won.matchedCount) throw new Fail(409, 'This trip can no longer be cancelled.');
  const ids = (await TpBoard.find({ tripId: trip._id, state: 'expected' })).map((b) => b.studentId);
  await S.tellFamilies(trip.schoolId, ids, 'School bus trip cancelled', `${trip.routeName} (${trip.direction}) on ${trip.date} is cancelled: ${r}.`, { urgent: true });
  return fresh(trip._id);
}
async function reassign(ctx, tripId, b) {
  const trip = oid(tripId) ? await TpTrip.findOne({ _id: tripId, schoolId: ctx.schoolId }) : null; if (!trip) throw new Fail(404, 'That trip is not in your school.');
  if (!LIVE.includes(trip.status)) throw new Fail(409, 'This trip is already closed.'); const reason = clean(b.reason, 200); if (trip.status === 'active' && reason.length < 5) throw new Fail(422, 'Say why the vehicle or driver is changing during a trip.');
  const $set = {}; const notes = [];
  if (b.vehicleId !== undefined) { const v = oid(b.vehicleId) ? await TpVehicle.findOne({ _id: b.vehicleId, schoolId: ctx.schoolId }) : null; if (!v) throw new Fail(404, 'That vehicle is not in your school.'); if (v.status !== 'active') throw new Fail(409, 'That vehicle is not available.'); $set.vehicleId = v._id; $set.vehiclePlate = v.plate; $set.capacity = v.capacity; if (String(v._id) !== String(trip.vehicleId)) { notes.push(`vehicle ${v.plate}`); if (trip.status === 'checked') $set.status = 'scheduled'; } }
  if (b.driverId !== undefined) { const d = oid(b.driverId) ? await TpDriver.findOne({ _id: b.driverId, schoolId: ctx.schoolId }) : null; if (!d || d.status !== 'active') throw new Fail(404, 'That driver is not available.'); $set.driverId = d._id; $set.driverName = d.name; if (String(d._id) !== String(trip.driverId)) notes.push(`driver ${d.name}`); if (trip.status === 'checked') $set.status = 'scheduled'; }
  if (!Object.keys($set).length) throw new Fail(422, 'Choose a vehicle or a driver.');
  await TpTrip.updateOne({ _id: trip._id, status: { $in: LIVE } }, { $set, $push: { trail: S.trail(ctx.actor, 'reassigned', `${notes.join(', ')}${reason ? `: ${reason}` : ''}`) } });
  return fresh(trip._id);
}
// A child joins a trip that is not on their route today (a one-off), with a reason
async function addRider(ctx, tripId, b) {
  const trip = oid(tripId) ? await TpTrip.findOne({ _id: tripId, schoolId: ctx.schoolId }) : null; if (!trip) throw new Fail(404, 'That trip is not in your school.');
  if (!LIVE.includes(trip.status)) throw new Fail(409, 'This trip is already closed.'); const reason = clean(b.reason, 200); if (reason.length < 5) throw new Fail(422, 'Say why this child rides today.');
  const stu = oid(b.studentId) ? await Student.findOne({ _id: b.studentId, schoolId: ctx.schoolId, isActive: { $ne: false } }).select('name classId') : null; if (!stu) throw new Fail(404, 'That child is not in your school.');
  const stop = trip.stops.find((s) => String(s.stopId) === String(b.stopId)); if (!stop) throw new Fail(422, 'Choose one of this trip\'s stops.');
  const cl = stu.classId ? await Class.findOne({ _id: stu.classId, schoolId: ctx.schoolId }) : null;
  try { await TpBoard.create({ schoolId: ctx.schoolId, tripId: trip._id, studentId: stu._id, studentName: stu.name, className: className(cl), stopId: stop.stopId, stopName: stop.name, handoff: b.handoff === 'guardian' ? 'guardian' : 'release', state: 'expected', source: 'dispatcher' }); }
  catch (e) { if (S.isDup(e)) throw new Fail(409, 'That child is already on this trip.'); throw e; }
  await recount(trip._id); await logEvent({ byKind: 'staff', byName: ctx.actor.name }, trip, 'add_rider', new Date(), new Date(), { studentId: stu._id, stopId: stop.stopId, data: { reason } });
  return { added: stu.name };
}
async function resolveException(ctx, boardId, b) {
  const row = oid(boardId) ? await TpBoard.findOne({ _id: boardId, schoolId: ctx.schoolId }) : null; if (!row || !row.exception?.kind) throw new Fail(404, 'There is no such exception.');
  const note = clean(b.resolution, 300); if (note.length < 5) throw new Fail(422, 'Write how this was settled.');
  if (row.exception.resolved) throw new Fail(409, 'This exception is already settled.');
  const $set = { 'exception.resolved': true, 'exception.resolvedBy': ctx.actor.name, 'exception.resolvedAt': new Date(), 'exception.resolution': note };
  // the office may close the loop for a child who stayed on the bus: returned to school, or released later to an authorised person
  if (b.alighted === true && row.state === 'boarded') { $set.state = 'alighted'; $set.alightedAt = new Date(); $set.handedTo = { kind: b.handedKind === 'school' ? 'school' : 'authorised', name: clean(b.handedName, 80) || 'Transport office' }; }
  await TpBoard.updateOne({ _id: row._id, 'exception.resolved': { $ne: true } }, { $set });
  await recount(row.tripId); return TpBoard.findById(row._id);
}

module.exports = { makeTrips, ensureTrips, resetEnsure, recount, applyOp, cancelTrip, reassign, addRider, resolveException, openIncident, purge, afterMove, refreshAbsent, plain, className, LIVE, fresh };
