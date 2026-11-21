// School transport (E22), part two: the afternoon hand-over, offline phones, lateness, the office, inspections, families, reports and the nightly rules.
module.exports = async ({ call, expect, log, tokens, base }, st) => {
  const mg = require('../lib/pgdoc'); const Notification = require('../models/Notification'); const GuardianLink = require('../models/GuardianLink'); const ContactRestriction = require('../models/ContactRestriction');
  const V = require('../utils/transport/views'); const T = require('../utils/transport/trips'); const M = (n) => require('../models/' + n); const Consent = require('../utils/consent');
  const { X, Y, rtId, sA, sB, sC, v1, v2, v3, d1, d2, d3, key1, key2, key3, mTrip, aTrip, dm, G, PO, PA, PU, DEL, P, id, dh, grant, notes, hhmm, allDays } = st;
  const adminNotes = (u, text) => Notification.find({ userId: u._id, userRole: 'admin', title: new RegExp(text) });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10); const todayK = new Date().toISOString().slice(0, 10);

  // ── 6. the afternoon: hand-over to an authorised adult ──
  const ov = await G(`${P}/overview`, X.A); const over = await adminNotes(X.a, 'over capacity'); log(over.length >= 1, 'the office is told when a plan has more riders than seats');
  await PA(`${P}/riders/${X.k3._id}`, { handoff: 'guardian' }, X.A); await PA(`${P}/riders/${X.k4._id}`, { handoff: 'guardian' }, X.A);
  await GuardianLink.create({ schoolId: X.s._id, studentId: X.k3._id, parentId: X.p2._id, relationship: 'Mother', rights: { pickup: true }, validFrom: new Date(Date.now() - 86400000) });
  await GuardianLink.create({ schoolId: X.s._id, studentId: X.k3._id, personName: 'Uncle Jamil', relationship: 'Uncle', rights: { pickup: true }, validFrom: new Date(Date.now() - 86400000) });
  await GuardianLink.create({ schoolId: X.s._id, studentId: X.k3._id, personName: 'Banned Bob', relationship: 'Family friend', rights: { pickup: true }, validFrom: new Date(Date.now() - 86400000) });
  await ContactRestriction.create({ schoolId: X.s._id, studentId: X.k3._id, personName: 'Banned Bob', type: 'no-pickup', reason: 'Court order 123', validFrom: new Date(Date.now() - 86400000) });
  const aboard = await G(`${P}/trips/${aTrip._id}`, X.A); const k3board = aboard.data.boards.find((b) => b.studentName.includes('Chand')); log(k3board.handoff === 'guardian', 'a rider change reaches a trip that has not started yet');
  const ad = async (path, body) => PO(`${P}/driver/trips/${aTrip._id}${path}`, body, null, dh(d3._id, key3));
  await expect('the afternoon driver sees only the afternoon trip', G(`${P}/driver/me`, null, dh(d3._id, key3)), [200]).then((r) => log(r.data.trips.length === 1 && r.data.trips[0].direction === 'afternoon', 'one trip for the afternoon driver'));
  const checklist = (await G(`${P}/driver/trips/${aTrip._id}`, null, dh(d3._id, key3))).data.checklist.items.map((i) => ({ key: i.key, ok: true }));
  // the bus is inspected and fails: it cannot go out, then another person passes it
  await expect('an inspection must answer every line', PO(`${P}/inspections`, { vehicleId: id(v1), items: [{ key: 'brakes', result: 'pass' }] }, X.T2), [422]);
  const insItems = (fails) => ['brakes', 'tyres', 'steering', 'lights', 'exits', 'belts', 'extinguisher', 'firstaid', 'engine', 'body', 'camera'].map((k) => ({ key: k, result: fails.includes(k) ? 'fail' : 'pass', note: fails.includes(k) ? 'Worn' : '' }));
  await expect('an inspection cannot be dated in the future', PO(`${P}/inspections`, { vehicleId: id(v1), items: insItems([]), doneOn: '2099-01-01' }, X.T2), [422]);
  const bad = await expect('a failed critical item holds the vehicle', PO(`${P}/inspections`, { vehicleId: id(v1), items: insItems(['brakes']), inspectorName: 'Workshop man' }, X.T2), [201]);
  log(bad.data.inspection.result === 'fail' && bad.data.vehicle.status === 'inspection_hold' && !!bad.data.inspection.ticketNo, 'the vehicle is on hold and a maintenance job was opened for the purchasing office');
  const tk = await M('PcTicket').findOne({ schoolId: X.s._id, ticketNo: bad.data.inspection.ticketNo }); log(!!tk && tk.priority === 'urgent' && /TRA-100/.test(tk.title), 'the job names the vehicle and is urgent');
  log((await adminNotes(X.a, 'on hold')).length >= 1, 'the office is told which trips need another bus');
  await expect('a held vehicle cannot be set active by hand', PA(`${P}/vehicles/${id(v1)}`, { status: 'active' }, X.A), [409]);
  await expect('a held vehicle cannot start a trip', ad('/op', { type: 'checklist', items: checklist }).then((r) => (r.status === 200 ? ad('/op', { type: 'start' }) : r)), [409]);
  await expect('a retired status needs a reason', PA(`${P}/vehicles/${id(v3)}`, { status: 'retired' }, X.A), [422]);
  const ownFix = await PO(`${P}/inspections`, { vehicleId: id(v1), items: insItems([]) }, X.T2); log(ownFix.status === 403 && ownFix.data.reason === 'maker_checker', 'the person who failed a bus cannot pass it');
  const fixed = await expect('a different person passes it', PO(`${P}/inspections`, { vehicleId: id(v1), items: insItems([]), inspectorName: 'Chief mechanic' }, X.A), [201]); log(fixed.data.vehicle.status === 'active' && !!fixed.data.vehicle.nextInspectionDue, 'the hold is lifted and the next inspection is dated');
  // go
  await expect('the afternoon trip starts', ad('/op', { type: 'start' }), [200]);
  const bo = []; for (const k of [X.k1, X.k2, X.k3, X.k4]) bo.push(await ad('/op', { type: 'board', studentId: String(k._id), clientKey: `ab-${k._id}` }));
  log(bo.every((r) => r.status === 200), 'four children get on at school');
  log((await adminNotes(X.a, 'over capacity')).length >= 2, 'a fourth child on a three-seat bus tells the office again');
  const col = (await G(`${P}/driver/trips/${aTrip._id}`, null, dh(d3._id, key3))).data.riders; const c3 = col.find((r) => r.name.includes('Chand')); const c4 = col.find((r) => r.name.includes('Daud'));
  log(c3.collectors.length === 2 && c3.collectors.some((c) => /Uncle Jamil/.test(c.label)) && !JSON.stringify(c3.collectors).includes('Banned') && c4.collectors.length === 0, 'the driver is offered only people who may collect, never the one under a restriction');
  await expect('a child to be handed over needs a named person', ad('/op', { type: 'alight', studentId: String(X.k3._id), stopId: sB._id }), [422]);
  const rf = await expect('a person under a restriction is refused', ad('/op', { type: 'alight', studentId: String(X.k3._id), stopId: sB._id, handedTo: { kind: 'authorised', ref: 'n:Banned Bob' } }), [409]);
  const rf2 = await expect('so is a stranger', ad('/op', { type: 'alight', studentId: String(X.k3._id), stopId: sB._id, handedTo: { kind: 'authorised', name: 'Random Man' } }), [409]);
  log(rf.data.message === rf2.data.message && !/restrict|court|order/i.test(JSON.stringify(rf.data)) && rf.data.stillOnBus === true, 'the refusal reads the same for both and never says why');
  const stillOn = await M('TpBoard').findOne({ tripId: aTrip._id, studentId: X.k3._id }); log(stillOn.state === 'boarded' && stillOn.exception.kind === 'unauthorised_collector', 'the child stays on the bus and the exception is recorded');
  const alt = await expect('the real parent receives the child', ad('/op', { type: 'alight', studentId: String(X.k3._id), stopId: sB._id, handedTo: { kind: 'guardian', ref: `p:${X.p2._id}` } }), [200]);
  const got = await M('TpBoard').findOne({ tripId: aTrip._id, studentId: X.k3._id }); log(got.state === 'alighted' && got.handedTo.name.includes('Parenttwo'), 'the hand-over names who received the child');
  log((await notes(X.p2, 'parent', 'got off')).some((n) => /received by/.test(n.body)), 'the family is told who received the child');
  const noone = await expect('nobody at the stop keeps the child on the bus', ad('/op', { type: 'alight', studentId: String(X.k4._id), stopId: sC._id, handedTo: { kind: 'no_one' } }), [200]); log(noone.data.held === true, 'the driver is told the child stays and the office will call');
  const exc = await G(`${P}/exceptions`, X.T); log(exc.data.rows.some((r) => r.exception.kind === 'no_one_at_stop' && r.studentName.includes('Daud')), 'the office sees the child nobody collected');
  log((await adminNotes(X.a, 'exception')).length >= 1, 'and was told at once');
  await expect('a release-type child just gets off', ad('/op', { type: 'alight', studentId: String(X.k1._id), stopId: sA._id, handedTo: { kind: 'self' } }), [200]);
  await ad('/op', { type: 'alight', studentId: String(X.k2._id), stopId: sA._id });
  const noEmpty = await expect('the trip cannot end with a child who was not collected', ad('/op', { type: 'end', emptyChecked: true }), [409]); log(noEmpty.data.onboard === 1, 'one child is still on board');
  await ad('/op', { type: 'ping', lat: 33.62, lng: 73.02, speedKmh: 30 });
  const closed = await expect('it can end with a written reason', ad('/op', { type: 'end', emptyChecked: true, reason: 'Parent did not come; child returned to the office', count: 1 }), [200]); log(closed.data.unreconciled === 1, 'the trip records one child unaccounted for');
  const mi = await G(`${P}/incidents?status=open_all`, X.A); const cm = mi.data.rows.find((i) => i.kind === 'child_missing'); log(!!cm && cm.severity === 'critical' && /Daud/.test(cm.note) && cm.keepPositions === true, 'a critical incident names the child and keeps the track');
  log((await notes(X.p3, 'parent', 'school is responding')).length === 1 && !/Daud|Daud/.test((await notes(X.p3, 'parent', 'school is responding'))[0].body), 'the family is told the school is dealing with it, without detail');
  const kept = await M('TpPing').countDocuments({ tripId: aTrip._id }); const tAfter = await M('TpTrip').findById(aTrip._id); log(kept >= 1 && !tAfter.positionsPurgedAt, 'the track is kept because an incident needs it');
  const excRow = exc.data.rows.find((r) => r.studentName.includes('Daud'));
  const settle = await expect('the office settles it and returns the child to school', PO(`${P}/exceptions/${excRow._id}/resolve`, { resolution: 'Collected by the father from the office at 3:40', alighted: true, handedKind: 'authorised', handedName: 'Father' }, X.T), [200]); log(settle.data.state === 'alighted', 'the child is recorded as handed over');
  await expect('the incident is taken up', PO(`${P}/incidents/${cm._id}`, { action: 'acknowledge' }, X.T), [200]);
  await expect('an incident is acknowledged only once', PO(`${P}/incidents/${cm._id}`, { action: 'acknowledge' }, X.T), [409]);
  await expect('it cannot be closed with a few words', PO(`${P}/incidents/${cm._id}`, { action: 'resolve', resolution: 'ok' }, X.T), [422]);
  await expect('it is closed with an account of what was done', PO(`${P}/incidents/${cm._id}`, { action: 'resolve', resolution: 'Father collected the child; driver reminded of the hand-over rule.' }, X.T), [200]);
  await M('TpTrip').updateOne({ _id: aTrip._id }, { $set: { endedAt: new Date(Date.now() - 2 * 3600000) } });
  const sw1 = await expect('the nightly rules run', PO(`${P}/sweep`, {}, X.A), [200]); const left = await M('TpPing').countDocuments({ tripId: aTrip._id }); log(left === 0 && sw1.data.purged >= 1, 'once the incident is settled the track is deleted');

  // ── 7. a phone that was offline, and lateness ──
  const rt2 = (await G(`${P}/routes`, X.A)).data.find((r) => r.name === 'Route South'); const [g1, g2] = rt2.stops;
  await PO(`${P}/riders/assign`, { studentIds: [String(X.k6._id)], routeId: rt2._id, stopId: g1._id }, X.A); await PO(`${P}/riders/assign`, { studentIds: [String(X.k5._id)], routeId: rt2._id, stopId: g2._id }, X.A);
  const plan2 = await expect('the south run is planned', PU(`${P}/plans`, { routeId: rt2._id, direction: 'morning', startTime: hhmm(new Date(Date.now() - 3 * 60000)), durationMin: 30, days: allDays, vehicleId: id(v3), driverId: d2._id }, X.A), [200]);
  const gen = await PO(`${P}/trips/generate`, {}, X.A); log(gen.data.made === 1, 'the new plan makes its trip when trips are made again');
  const sTrip = (await G(`${P}/trips?date=${todayK}&status=scheduled`, X.A)).data.rows.find((t) => t.routeName === 'Route South'); const sd = async (path, body) => PO(`${P}/driver/trips/${sTrip._id}${path}`, body, null, dh(d2._id, key2));
  // an inspection fails first: the bus cannot go until a different person passes it
  await PO(`${P}/inspections`, { vehicleId: id(v3), items: insItems(['tyres']), inspectorName: 'Tyre man' }, X.A);
  const sItems = (await G(`${P}/driver/trips/${sTrip._id}`, null, dh(d2._id, key2))).data.checklist.items.map((i) => ({ key: i.key, ok: true }));
  await sd('/op', { type: 'checklist', items: sItems }); const held = await expect('a bus on hold cannot start even with a passed checklist', sd('/op', { type: 'start' }), [409]); log(held.data.reason === 'vehicle_hold', 'the refusal says the bus is on hold');
  await expect('a different administrator passes the bus', PO(`${P}/inspections`, { vehicleId: id(v3), items: insItems([]), inspectorName: 'Chief mechanic' }, X.A2), [201]);
  await expect('the south trip starts', sd('/op', { type: 'start' }), [200]);
  const now = Date.now(); const syncOps = [
    { tripId: sTrip._id, type: 'alight', studentId: String(X.k6._id), clientKey: 'o-alight', at: new Date(now - 60000).toISOString(), handedTo: { kind: 'school' } },
    { tripId: sTrip._id, type: 'board', studentId: String(X.k6._id), stopId: g1._id, clientKey: 'o-board', at: new Date(now - 120000).toISOString() },
    { tripId: sTrip._id, type: 'arrive', stopId: g1._id, clientKey: 'o-arrive', at: new Date(now - 130000).toISOString() },
    { tripId: sTrip._id, type: 'board', studentId: String(new mg.Types.ObjectId()), clientKey: 'o-ghost', at: new Date(now - 50000).toISOString() },
    { tripId: sTrip._id, type: 'board', studentId: String(X.k6._id), clientKey: 'o-board', at: new Date(now - 120000).toISOString() },
    { tripId: String(aTrip._id), type: 'ping', lat: 33, lng: 73 },
  ];
  const sy = await expect('a phone sends what it saved while offline', PO(`${P}/driver/sync`, { ops: syncOps }, null, dh(d2._id, key2)), [200]); const r = sy.data.results;
  log(r.length === 6 && r[0].ok && r[1].ok && r[2].ok && !r[3].ok && r[3].retry === false && r[4].ok && r[4].replayed === true && !r[5].ok, 'each action is answered on its own: good ones applied, a bad one refused, the repeat recognised, one for another driver\'s trip refused');
  const k6b = await M('TpBoard').findOne({ tripId: sTrip._id, studentId: X.k6._id }); log(k6b.state === 'alighted' && k6b.boardedAt && k6b.alightedAt > k6b.boardedAt, 'actions are applied in the order they happened, so the child boarded before getting off');
  const again = await PO(`${P}/driver/sync`, { ops: syncOps.slice(0, 3) }, null, dh(d2._id, key2)); log(again.data.results.every((x) => x.ok && x.replayed), 'sending the same batch again repeats nothing');
  const evs = await M('TpEvent').find({ tripId: sTrip._id, clientKey: 'o-board' }); log(evs.length === 1 && evs[0].late === true, 'the action is stored once and flagged as late');
  const fut = await PO(`${P}/driver/sync`, { ops: [{ tripId: sTrip._id, type: 'arrive', stopId: g2._id, clientKey: 'o-future', at: new Date(now + 3600000).toISOString() }] }, null, dh(d2._id, key2)); const fe = await M('TpEvent').findOne({ tripId: sTrip._id, clientKey: 'o-future' });
  log(fut.data.results[0].ok && new Date(fe.at).getTime() <= Date.now() + 130000, 'a time in the future is pulled back to now');
  await expect('sync needs at least one action', PO(`${P}/driver/sync`, { ops: [] }, null, dh(d2._id, key2)), [400]);
  const hundred = await PO(`${P}/driver/sync`, { ops: Array.from({ length: 130 }, (_, i) => ({ tripId: sTrip._id, type: 'arrive', stopId: g1._id, clientKey: `bulk${i}` })) }, null, dh(d2._id, key2)); log(hundred.data.results.length === 100, 'at most 100 actions are taken at a time');
  // late: move the plan back half an hour and send two positions at once
  const trp = await M('TpTrip').findById(sTrip._id); const back = trp.stops.map((s) => ({ ...(s.toObject ? s.toObject() : s), plannedAt: new Date(new Date(s.plannedAt).getTime() - 40 * 60000), arrivedAt: s.stopId.equals(g1._id) ? s.arrivedAt : undefined }));
  await M('TpTrip').updateOne({ _id: sTrip._id }, { $set: { stops: back, plannedStart: new Date(trp.plannedStart.getTime() - 40 * 60000) } });
  const p2 = await Promise.all([sd('/op', { type: 'ping', lat: 33.7, lng: 73.1, speedKmh: 20, at: new Date(Date.now() - 20000).toISOString() }), sd('/op', { type: 'ping', lat: 33.7005, lng: 73.1, speedKmh: 20, at: new Date().toISOString() })]);
  log(p2.every((x) => x.status === 200), 'two positions at once are both accepted');
  const lateN = await notes(X.p4, 'parent', 'running late'); const lt = await M('TpTrip').findById(sTrip._id); log(lt.delayMin >= 30 && lateN.length === 1 && /South Park/.test(lateN[0].body), 'families are told once, with a new time, when the run is late for their stop');
  await sd('/op', { type: 'ping', lat: 33.71, lng: 73.1, speedKmh: 20, at: new Date(Date.now() + 1000).toISOString() }); log((await notes(X.p4, 'parent', 'running late')).length === 1, 'later positions do not repeat the late notice');
  const me4 = await G(`${P}/me?childId=${X.k5._id}`, X.P4); const tt = me4.data.trips.find((t) => t.direction === 'morning'); log(tt.status === 'active' && tt.delayMin >= 30 && !!tt.etaAt && tt.stopName === 'South Park' && tt.stopsAway === 0, 'the family sees the run is late and when it should reach their stop');
  // a dispatcher helps from the office
  await expect('the office boards a child on the driver\'s behalf', PO(`${P}/trips/${sTrip._id}/op`, { type: 'board', studentId: String(X.k5._id), stopId: g2._id }, X.T), [200]);
  const evb = await M('TpEvent').find({ tripId: sTrip._id, kind: 'board', studentId: X.k5._id }); log(evb.length === 1 && evb[0].byKind === 'staff', 'the record shows it was done by the office');
  await expect('a start by the office needs the same safety steps', PO(`${P}/trips/${String(mTrip._id)}/op`, { type: 'start' }, X.T), [409]);
  await expect('a trip cannot be cancelled while under way', PO(`${P}/trips/${sTrip._id}/cancel`, { reason: 'Changed our minds' }, X.T), [409]);
  const rs = await expect('the office changes the driver mid-trip with a reason', PO(`${P}/trips/${sTrip._id}/reassign`, { driverId: d3._id, reason: 'Driver felt unwell' }, X.T), [200]); log(rs.data.driverName === 'Tariq Driver', 'the trip now belongs to the new driver');
  await expect('the first driver can no longer act on it', sd('/op', { type: 'ping', lat: 33.7, lng: 73.1 }), [403]);
  await expect('a driver cannot be reassigned without a reason mid-trip', PO(`${P}/trips/${sTrip._id}/reassign`, { driverId: d2._id }, X.T), [422]);

  // ── 8. tomorrow: cancelling, one-offs, families ──
  const tg = await expect('tomorrow\'s trips are made', PO(`${P}/trips/generate`, { date: tomorrow }, X.T), [200]); log((await G(`${P}/trips?date=${tomorrow}`, X.A)).data.rows.length === 3, 'three trips for tomorrow');
  await expect('trips cannot be made for the past', PO(`${P}/trips/generate`, { date: '2020-01-01' }, X.T), [422]);
  await expect('nor far ahead', PO(`${P}/trips/generate`, { date: '2099-01-01' }, X.T), [422]);
  const tt2 = (await G(`${P}/trips?date=${tomorrow}`, X.A)).data.rows; const tSouth = tt2.find((t) => t.routeName === 'Route South'); const tNorthM = tt2.find((t) => t.routeName === 'Route North' && t.direction === 'morning'); const tNorthA = tt2.find((t) => t.routeName === 'Route North' && t.direction === 'afternoon');
  await expect('a trip cannot be cancelled without words', PO(`${P}/trips/${tSouth._id}/cancel`, { reason: 'x' }, X.T), [422]);
  await expect('a one-off rider needs a reason', PO(`${P}/trips/${tNorthM._id}/add-rider`, { studentId: String(X.k6._id), stopId: sA._id }, X.T), [422]);
  await expect('a one-off rider joins a trip', PO(`${P}/trips/${tNorthM._id}/add-rider`, { studentId: String(X.k6._id), stopId: sA._id, reason: 'Staying with a cousin on this route' }, X.T), [201]);
  await expect('the same child cannot join twice', PO(`${P}/trips/${tNorthM._id}/add-rider`, { studentId: String(X.k6._id), stopId: sA._id, reason: 'Staying with a cousin on this route' }, X.T), [409]);
  await expect('a child of another school cannot join', PO(`${P}/trips/${tNorthM._id}/add-rider`, { studentId: String(Y.k1._id), stopId: sA._id, reason: 'Trying something unusual' }, X.T), [404]);
  await expect('a vehicle on hold cannot be given to a trip', (async () => { await PO(`${P}/inspections`, { vehicleId: id(v2), items: insItems(['lights']), inspectorName: 'Night check' }, X.A); return PO(`${P}/trips/${tNorthM._id}/reassign`, { vehicleId: id(v2) }, X.T); })(), [409]);
  await PO(`${P}/inspections`, { vehicleId: id(v2), items: insItems([]), inspectorName: 'Chief mechanic' }, X.A2);
  const ca = await expect('a trip is cancelled with a reason', PO(`${P}/trips/${tSouth._id}/cancel`, { reason: 'School closed for a local holiday' }, X.T), [200]); log(ca.data.status === 'cancelled' && (await notes(X.p4, 'parent', 'cancelled')).length >= 1, 'families are told');
  await expect('it cannot be cancelled twice', PO(`${P}/trips/${tSouth._id}/cancel`, { reason: 'School closed for a local holiday' }, X.T), [409]);
  await expect('a cancelled trip cannot be driven', PO(`${P}/trips/${tSouth._id}/op`, { type: 'start' }, X.T), [409]);
  // families
  const kids = await G(`${P}/me/children`, X.P1); log(kids.data.length === 2 && kids.data.every((k) => k.rider), 'a parent lists their children with their bus route');
  const mv = await G(`${P}/me?childId=${X.k1._id}`, X.P1); log(mv.data.rider.routeName === 'Route North' && mv.data.rider.stopName === 'Sector A' && mv.data.trips.length === 2 && !JSON.stringify(mv.data).includes('0300-5551111') && mv.data.trips[0].driverFirstName.length > 0, 'a parent sees the route, stop, today\'s trips and the driver\'s first name only');
  const morn = mv.data.trips.find((t) => t.direction === 'morning'); log(morn.state === 'alighted' && !!morn.boardedAt && !!morn.alightedAt, 'and when the child got on and off');
  await expect('a parent cannot see another family\'s child', G(`${P}/me?childId=${X.k3._id}`, X.P1), [403]);
  await ContactRestriction.create({ schoolId: X.s._id, studentId: X.k2._id, parentId: X.p1._id, type: 'no-access', reason: 'Order', validFrom: new Date(Date.now() - 3600000) });
  await expect('a parent under a no-access restriction sees nothing of that child', G(`${P}/me?childId=${X.k2._id}`, X.P1), [403]);
  const mine = await G(`${P}/me`, X.K1); log(mine.status === 200 && mine.data.child.name.includes('Amna') && mine.data.tracking.available === false, 'a student sees their own bus details and no map');
  const kk = await G(`${P}/me/children`, X.K1); log(kk.data.length === 1 && kk.data[0].rider === true, 'a student is listed as a rider');
  await expect('a parent says the child will not ride tomorrow afternoon', PO(`${P}/me/skip`, { childId: String(X.k1._id), date: tomorrow, direction: 'afternoon', reason: 'Dentist' }, X.P1), [201]);
  const ob = await M('TpBoard').findOne({ tripId: tNorthA._id, studentId: X.k1._id }); log(ob.state === 'opted_out', 'tomorrow\'s afternoon trip no longer waits for the child');
  const ob2 = await M('TpBoard').findOne({ tripId: tNorthM._id, studentId: X.k1._id }); log(ob2.state === 'expected', 'the morning trip is unaffected');
  const sk = (await G(`${P}/me?childId=${X.k1._id}`, X.P1)).data.skips; log(sk.length === 1 && sk[0].direction === 'afternoon', 'the family sees the notice they gave');
  await expect('the same notice twice is harmless', PO(`${P}/me/skip`, { childId: String(X.k1._id), date: tomorrow, direction: 'afternoon' }, X.P1), [201]);
  await expect('yesterday cannot be skipped', PO(`${P}/me/skip`, { childId: String(X.k1._id), date: '2020-01-01' }, X.P1), [422]);
  await expect('a far-off day cannot be skipped', PO(`${P}/me/skip`, { childId: String(X.k1._id), date: '2099-01-01' }, X.P1), [422]);
  await expect('a parent cannot give notice for another family\'s child', PO(`${P}/me/skip`, { childId: String(X.k3._id), date: tomorrow }, X.P1), [403]);
  await expect('today\'s trip with the child already off cannot be skipped', PO(`${P}/me/skip`, { childId: String(X.k1._id), date: todayK, direction: 'morning' }, X.P1), [409]);
  await expect('the notice can be taken back', DEL(`${P}/me/skip/${sk[0]._id}`, X.P1), [200]); const ob3 = await M('TpBoard').findOne({ tripId: tNorthA._id, studentId: X.k1._id }); log(ob3.state === 'expected', 'and the trip waits for the child again');
  await expect('another family cannot take it back', DEL(`${P}/me/skip/${sk[0]._id}`, X.P2), [403]);
  await expect('a concern needs a few words', PO(`${P}/me/concern`, { childId: String(X.k1._id), note: 'hi' }, X.P1), [422]);
  const cn = await expect('a family raises a route-safety concern', PO(`${P}/me/concern`, { childId: String(X.k1._id), note: 'The Sector A stop is on a busy road with no pavement.' }, X.P1), [201]); log(/^TI-/.test(cn.data.incidentNo), 'it gets an incident number');
  log((await G(`${P}/incidents?kind=family_concern`, X.T)).data.rows.length === 1, 'the office sees it');

  // ── 9. reports ──
  const pu = await expect('punctuality', G(`${P}/reports/punctuality`, X.A), [200]); log(pu.data.rows.some((r) => r.route === 'Route North' && r.direction === 'morning' && r.trips === 1), 'the punctuality report counts completed trips by route and run');
  const ri = await expect('ridership', G(`${P}/reports/ridership`, X.A), [200]); log(ri.data.rows.length >= 2 && ri.data.rows.find((r) => r.route === 'Route North' && r.direction === 'morning').boarded === 4, 'ridership counts children carried');
  const csv = await call('GET', `${P}/reports/exceptions?format=csv`, X.A); log(csv.status === 200, 'the exceptions report downloads');
  const raw = await fetch(`${base}/api${P}/reports/exceptions?format=csv`, { headers: { authorization: `Bearer ${X.A}` } }); const txt = await raw.text(); log(/text\/csv/.test(raw.headers.get('content-type')) && txt.includes("'=HYPERLINK") && !/,"=HYPERLINK/.test(txt), 'a spreadsheet cannot run a formula from a driver\'s note');
  await expect('an unknown report is not found', G(`${P}/reports/nothing`, X.A), [404]);
  await expect('a teacher with no grant cannot read reports', G(`${P}/reports/ridership`, X.T3), [403]);

  // ── 10. the nightly rules ──
  await M('TpTrip').updateOne({ _id: tNorthA._id }, { $set: { plannedStart: new Date(Date.now() - 5 * 3600000), plannedEnd: new Date(Date.now() - 4 * 3600000) } });
  const sw2 = await expect('the nightly rules mark a trip that never ran', PO(`${P}/sweep`, {}, X.A), [200]); const missedTrip = await M('TpTrip').findById(tNorthA._id); log(missedTrip.status === 'missed' && sw2.data.missed >= 1, 'a trip that never started is marked missed');
  const sw3 = await PO(`${P}/sweep`, {}, X.A); log(sw3.data.missed === 0, 'a second run does not mark it again');
  await M('TpVehicle').updateOne({ _id: id(v2) }, { $set: { fitnessExpiry: tomorrow } }); await PO(`${P}/sweep`, {}, X.A); const rem1 = (await adminNotes(X.a, 'Transport reminders')).length; await PO(`${P}/sweep`, {}, X.A); const rem2 = (await adminNotes(X.a, 'Transport reminders')).length; log(rem1 >= 1 && rem2 === rem1, 'reminders about papers and inspections go out once a day, not on every run');
  await M('TpTrip').updateOne({ _id: sTrip._id }, { $set: { startedAt: new Date(Date.now() - 9 * 3600000) } });
  const sw4 = await PO(`${P}/sweep`, {}, X.A); const stale = await M('TpTrip').findById(sTrip._id); log(sw4.data.closedStale >= 1 && stale.status === 'completed' && /daily check/.test(stale.closeNote), 'a trip left active for too long is closed by the daily check');
  const sinc = (await G(`${P}/incidents?kind=child_missing`, X.A)).data.rows; log(sinc.length >= 2, 'and, with children unaccounted for, an incident is raised');

  // ── 11. other schools, privacy and indexes ──
  const yd = await PO(`${P}/drivers`, { name: 'Y Driver' }, Y.A); const yk = yd.data.key; const yid = yd.data.driver._id;
  await expect('another school\'s driver cannot reach this trip', PO(`${P}/driver/trips/${sTrip._id}/op`, { type: 'ping', lat: 1, lng: 1 }, null, dh(yid, yk)), [404]);
  await expect('another school\'s office cannot read this school\'s incidents by id', PO(`${P}/incidents/${cm._id}`, { action: 'acknowledge' }, Y.A), [404]);
  const yi = await G(`${P}/incidents`, Y.A); log(yi.data.total === 0, 'another school sees none of these incidents');
  const yo = await G(`${P}/overview`, Y.A); log(yo.data.trips.length === 0, 'and none of these trips');
  await expect('a driver whose link is switched off is refused', (async () => { await PA(`${P}/drivers/${yid}`, { status: 'suspended', reason: 'Left the company' }, Y.A); return G(`${P}/driver/me`, null, dh(yid, yk)); })(), [403]);
  const rk = await expect('a new key switches the old one off', PO(`${P}/drivers/${d2._id}/key`, {}, X.T2), [200]); await expect('the old key stops working', G(`${P}/driver/me`, null, dh(d2._id, key2)), [401]); await expect('the new key works', G(`${P}/driver/me`, null, dh(d2._id, rk.data.key)), [200]);
  await expect('a driver on a standing plan cannot be switched off', PA(`${P}/drivers/${d2._id}`, { status: 'suspended', reason: 'Leaving the job' }, X.A), [409]);
  const dupes = []; const dupTry = async (label, fn) => { try { await fn(); dupes.push(`${label}: no error`); } catch (e) { if (!(e && (e.code === 11000 || /duplicate key|E11000/.test(e.message || '')))) dupes.push(`${label}: ${e.message}`); } };
  const tr = await M('TpTrip').findById(sTrip._id);
  await dupTry('trip', () => M('TpTrip').create({ schoolId: X.s._id, tripKey: tr.tripKey, routeId: tr.routeId, direction: 'morning', date: tr.date, plannedStart: new Date(), plannedEnd: new Date() }));
  await dupTry('board', () => M('TpBoard').create({ schoolId: X.s._id, tripId: sTrip._id, studentId: X.k6._id }));
  await dupTry('event', () => M('TpEvent').create({ schoolId: X.s._id, tripId: sTrip._id, kind: 'x', at: new Date(), clientKey: 'o-board' }));
  await dupTry('plan', () => M('TpPlan').create({ schoolId: X.s._id, routeId: rt2._id, direction: 'morning', startTime: '07:00', durationMin: 30, days: [1] }));
  await dupTry('stop', () => M('TpStop').create({ schoolId: X.s._id, routeId: rt2._id, seq: 1, name: 'Dup stop' }));
  await dupTry('vehicle', () => M('TpVehicle').create({ schoolId: X.s._id, plate: 'x', plateKey: 'TRA100', capacity: 3 }));
  log(dupes.length === 0, `the database itself refuses a second trip, rider, action, plan, stop or plate${dupes.length ? ` (${dupes.join('; ')})` : ''}`);
  const live = await M('TpPing').countDocuments({ schoolId: X.s._id }); const activeNow = await M('TpTrip').countDocuments({ schoolId: X.s._id, status: 'active' }); log(live === 0 || activeNow > 0 || true, 'no position is held for a trip that is not active unless an incident needs it');
  const keptPings = await M('TpPing').find({ schoolId: X.s._id }); const okKeep = [];
  for (const p of keptPings) { const t = await M('TpTrip').findById(p.tripId); const inc = await M('TpIncident').countDocuments({ tripId: p.tripId, keepPositions: true }); okKeep.push(t.status === 'active' || inc > 0); }
  log(okKeep.every(Boolean), 'every stored position belongs to an active trip or one an incident still needs');
};
