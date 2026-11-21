// School transport (E22): rules, planning, the driver's trip, boarding and hand-over, positions that last only as long as a trip, and what families see.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Teacher = require('../models/Teacher'); const Student = require('../models/Student'); const Parent = require('../models/Parent'); const Class = require('../models/Class');
  const PermissionGrant = require('../models/PermissionGrant'); const GuardianLink = require('../models/GuardianLink'); const ContactRestriction = require('../models/ContactRestriction'); const Notification = require('../models/Notification');
  const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password'); const E = require('../utils/transport/engine'); const Consent = require('../utils/consent');
  const M = (n) => require('../models/' + n);
  console.log('\n— School transport —');

  // ── 1. the rules on their own ──
  const D = E.merge({});
  log(D.lateNoticeMin === 10 && D.checklist.length >= 6 && E.merge({ lateNoticeMin: 1, earliestStartMin: 9999 }).lateNoticeMin === 3 && E.merge({ earliestStartMin: 9999 }).earliestStartMin === 240 && E.merge({ checklist: [{ label: 'x', critical: true }] }).checklist.length === 1, 'settings are kept inside safe limits and the checklist can be changed');
  const k0 = E.localToUtc('2026-11-23', 7 * 60 + 30, 'Asia/Karachi'); log(k0.toISOString() === '2026-11-23T02:30:00.000Z' && E.localToUtc('2026-11-23', 30, 'Asia/Karachi').toISOString() === '2026-11-22T19:30:00.000Z', 'school-clock times become the right instant (Karachi is five hours ahead)');
  const stp = [{ _id: 'a', name: 'A', seq: 1, offsetMin: 0, lat: 33.6, lng: 73.0 }, { _id: 'b', name: 'B', seq: 2, offsetMin: 10, lat: 33.62, lng: 73.02 }, { _id: 'c', name: 'C', seq: 3, offsetMin: 25 }];
  const mr = E.runStops(stp, 'morning', k0, 40); const ar = E.runStops(stp, 'afternoon', k0, 40);
  log(mr.map((s) => s.name).join('') === 'ABC' && ar.map((s) => s.name).join('') === 'CBA' && mr[2].plannedAt - mr[0].plannedAt === 25 * 60000 && ar[0].plannedAt - k0 === 15 * 60000 && ar[2].plannedAt - k0 === 40 * 60000, 'the afternoon run drops in the reverse order, the last pickup first');
  const tr0 = { startedAt: new Date(k0.getTime() + 8 * 60000), plannedStart: k0, stops: mr.map((s) => ({ ...s })), lastPos: null };
  log(E.delayMinutes(tr0, new Date(k0.getTime() + 8 * 60000)) === 8 && E.etas(tr0, new Date(k0.getTime() + 8 * 60000)).etaByStop[String('c')] === new Date(mr[2].plannedAt.getTime() + 8 * 60000).toISOString(), 'a late start moves every later stop by the same delay');
  const tr1 = { ...tr0, lastPos: { lat: 33.6, lng: 73.0 } }; const e1 = E.etas(tr1, k0, 30); log(new Date(e1.etaByStop.b) > k0 && new Date(e1.etaByStop.b) < new Date(k0.getTime() + 20 * 60000) && !!e1.etaByStop.c, 'with a position, the estimate follows the distance and falls back to the plan for stops without a position');
  const now0 = new Date(); log(E.checkPing({ lat: 33.6, lng: 73.0, speedKmh: 40, at: now0 }, now0).ok && !E.checkPing({ lat: 200, lng: 73 }, now0).ok && !E.checkPing({ lat: 33, lng: 73, speedKmh: 400 }, now0).ok && !E.checkPing({ lat: 33, lng: 73, at: new Date(now0.getTime() + 10 * 60000) }, now0).ok && !E.checkPing({ lat: 'x', lng: 3 }, now0).ok, 'an implausible position, speed or time is not accepted');
  const bd = (s) => ({ state: s }); log(E.canClose([bd('alighted'), bd('no_show')], {}, { emptyChecked: true }).ok && !E.canClose([bd('alighted')], {}, { emptyChecked: false }).ok && E.canClose([bd('boarded')], {}, { emptyChecked: true }).code === 'unreconciled' && E.canClose([bd('boarded')], {}, { emptyChecked: true, reason: 'handed to the office' }).ok && E.canClose([bd('expected')], {}, { emptyChecked: true }).code === 'unreconciled', 'a trip cannot end with a child still on board unless a reason is written');
  log(E.plateKey('lhr-12 ab 3456') === 'LHR12AB3456' && E.phoneKey('+92 300 1234567') === '3001234567' && E.phoneKey('0300-1234567') === '3001234567', 'plates and phone numbers compare without spaces and dashes');

  // ── 2. two schools, people and a day ──
  const pw = await hashPassword('Tra@12345'); let seq = 0;
  const mk = async (code) => {
    const s = await School.create({ name: `${code} Academy`, code, email: `${code.toLowerCase()}@tra.test`, phone: '+92-300-1111111', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0, timezone: 'UTC' });
    const a = await User.create({ schoolId: s._id, name: `${code} Admin`, email: `admin@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const a2 = await User.create({ schoolId: s._id, name: `${code} Dean`, email: `admin2@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const mkT = (n) => Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const t = await mkT('Dina'); const t2 = await mkT('Manzar'); const t3 = await mkT('Nobody');
    const c1 = await Class.create({ schoolId: s._id, standard: '3', division: 'B', capacity: 30 });
    const mkSt = (n) => { seq += 1; return Student.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} Academy`, name: n, email: `kid${seq}@${code.toLowerCase()}.test`, password: pw, role: 'student', admissionNumber: `${code}-${seq}`, gender: 'Female', dateOfBirth: new Date('2016-05-05T00:00:00Z'), classId: c1._id, division: 'B', guardian: { name: 'G', mobileNumber: '03005550000' } }); };
    const k1 = await mkSt(`${code} Amna Kid`); const k2 = await mkSt(`${code} Bilal Kid`); const k3 = await mkSt(`${code} Chand Kid`); const k4 = await mkSt(`${code} Daud Kid`); const k5 = await mkSt(`${code} Eman Kid`); const k6 = await mkSt(`${code} Farid Kid`);
    const mkP = (n, kids) => Parent.create({ schoolId: s._id, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, phone: '+92-300-0000000', relationship: 'Mother', children: kids.map((k) => k._id) });
    const p1 = await mkP('Parentone', [k1, k2]); const p2 = await mkP('Parenttwo', [k3]); const p3 = await mkP('Parentthree', [k4]); const p4 = await mkP('Parentfour', [k5, k6]);
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    return { s, a, a2, t, t2, t3, c1, k1, k2, k3, k4, k5, k6, p1, p2, p3, p4, A: tok(a, 'admin'), A2: tok(a2, 'admin'), T: tok(t, 'teacher'), T2: tok(t2, 'teacher'), T3: tok(t3, 'teacher'), P1: tok(p1, 'parent'), P2: tok(p2, 'parent'), P3: tok(p3, 'parent'), P4: tok(p4, 'parent'), K1: tok(k1, 'student'), K3: tok(k3, 'student') };
  };
  const X = await mk('TRA001'); const Y = await mk('TRA002');
  const G = (p, t, h) => call('GET', p, t, null, h); const PO = (p, b, t, h) => call('POST', p, t, b || {}, h); const PA = (p, b, t) => call('PATCH', p, t, b || {}); const PU = (p, b, t) => call('PUT', p, t, b || {}); const DEL = (p, t) => call('DELETE', p, t);
  const P = '/transport'; const id = (r) => r.data && r.data._id; const dh = (d, key) => ({ 'X-Driver-Id': String(d), 'X-Driver-Key': key });
  const grant = (school, t, action) => PermissionGrant.create({ schoolId: school._id, granteeId: t._id, granteeModel: 'Teacher', granteeName: t.name, action, source: 'grant', validFrom: new Date(Date.now() - 1000), validTo: new Date(Date.now() + 86400000), reason: 'Cover', grantedBy: new mg.Types.ObjectId() });
  const notes = (user, role, text) => Notification.find({ userId: user._id, userRole: role, type: { $in: ['transport', 'safety'] }, ...(text ? { title: new RegExp(text) } : {}) });

  await expect('transport needs a sign-in', G(`${P}/overview`, null), [401]);
  await expect('a student cannot open the office side', G(`${P}/overview`, tokens.student), [403]);
  await expect('a parent cannot open the office side', G(`${P}/vehicles`, X.P1), [403]);
  await expect('a teacher without a grant cannot open the dispatcher\'s day', G(`${P}/overview`, X.T), [403]);
  await expect('a teacher without a grant cannot plan', PO(`${P}/vehicles`, { plate: 'TRA-1', capacity: 30 }, X.T), [403]);
  const ac0 = await G(`${P}/access`, X.T); log(ac0.status === 200 && !ac0.data.manage && !ac0.data.dispatch, 'a teacher is told they are neither manager nor dispatcher');
  await grant(X.s, X.t, 'transport.dispatch'); await grant(X.s, X.t2, 'transport.manage');
  await expect('a dispatcher sees the day', G(`${P}/overview`, X.T), [200]);
  await expect('a dispatcher cannot add a vehicle', PO(`${P}/vehicles`, { plate: 'TRA-1', capacity: 30 }, X.T), [403]);
  await expect('a manager can add a vehicle', PO(`${P}/vehicles`, { plate: 'TRA-MGR', capacity: 20 }, X.T2), [201]);
  await expect('a manager also sees the day', G(`${P}/overview`, X.T2), [200]);
  await expect('only an administrator changes the rules', PU(`${P}/settings`, { reason: 'Trying', settings: { lateNoticeMin: 5 } }, X.T2), [403]);

  // ── 3. vehicles, drivers, routes, stops, plans, riders ──
  const v1 = await expect('a vehicle is added', PO(`${P}/vehicles`, { plate: 'TRA-100', capacity: 3, label: 'Bus one', fitnessExpiry: '2099-01-01', insuranceExpiry: '2099-01-01' }, X.A), [201]);
  await expect('the same plate in other letters is refused', PO(`${P}/vehicles`, { plate: 'tra 100', capacity: 40 }, X.A), [409]);
  await expect('an absurd capacity is refused', PO(`${P}/vehicles`, { plate: 'TRA-BAD', capacity: 500 }, X.A), [422]);
  await expect('the same plate in another school is fine', PO(`${P}/vehicles`, { plate: 'TRA-100', capacity: 30 }, Y.A), [201]);
  const v2 = await expect('a second vehicle', PO(`${P}/vehicles`, { plate: 'TRA-200', capacity: 30, fitnessExpiry: '2099-01-01', insuranceExpiry: '2099-01-01' }, X.A), [201]);
  const vY = (await G(`${P}/vehicles`, Y.A)).data[0];
  await expect('a vehicle of another school is not found', PA(`${P}/vehicles/${vY._id}`, { label: 'Mine now' }, X.A), [404]);
  const d1r = await expect('a driver is added and gets a key', PO(`${P}/drivers`, { name: 'Rashid Driver', phone: '0300-5551111', licenceExpiry: '2099-01-01' }, X.A), [201]);
  const d1 = d1r.data.driver; const key1 = d1r.data.key; log(typeof key1 === 'string' && key1.length >= 30 && !('keyHash' in d1) && d1.hasKey, 'the key is shown once and only a flag is kept in the list');
  const dl = await G(`${P}/drivers`, X.A); log(!JSON.stringify(dl.data).includes(key1) && !JSON.stringify(dl.data).includes('keyHash'), 'listing drivers never shows the key or its hash');
  await expect('a second driver with the same phone is refused', PO(`${P}/drivers`, { name: 'Other', phone: '+92 300 5551111' }, X.A), [409]);
  const d2r = await expect('a second driver without a phone', PO(`${P}/drivers`, { name: 'Salman Driver', licenceExpiry: '2099-01-01' }, X.A), [201]);
  const d3r = await expect('a third driver without a phone is allowed too', PO(`${P}/drivers`, { name: 'Tariq Driver', licenceExpiry: '2099-01-01' }, X.A), [201]);
  const d2 = d2r.data.driver; const key2 = d2r.data.key; const d3 = d3r.data.driver; const key3 = d3r.data.key;
  const v3 = await expect('a third vehicle', PO(`${P}/vehicles`, { plate: 'TRA-300', capacity: 30, fitnessExpiry: '2099-01-01', insuranceExpiry: '2099-01-01' }, X.A), [201]);
  const rt = await expect('a route is made', PO(`${P}/routes`, { name: 'Route North', monthlyFee: 3000 }, X.A), [201]);
  await expect('a route name is unique', PO(`${P}/routes`, { name: 'Route North' }, X.A), [409]);
  const rtId = id(rt);
  await expect('a route needs at least one stop', PU(`${P}/routes/${rtId}/stops`, { stops: [] }, X.A), [422]);
  await expect('two stops cannot share a name', PU(`${P}/routes/${rtId}/stops`, { stops: [{ name: 'Gate', offsetMin: 0 }, { name: 'gate', offsetMin: 5 }] }, X.A), [422]);
  await expect('stops cannot go back in time', PU(`${P}/routes/${rtId}/stops`, { stops: [{ name: 'A', offsetMin: 10 }, { name: 'B', offsetMin: 5 }] }, X.A), [422]);
  await expect('a stop needs both coordinates or neither', PU(`${P}/routes/${rtId}/stops`, { stops: [{ name: 'A', offsetMin: 0, lat: 33.6 }] }, X.A), [422]);
  await expect('a stop position must be real', PU(`${P}/routes/${rtId}/stops`, { stops: [{ name: 'A', offsetMin: 0, lat: 133.6, lng: 73 }] }, X.A), [422]);
  await expect('a plan needs stops first', PU(`${P}/plans`, { routeId: rtId, direction: 'morning', startTime: '07:00', durationMin: 40, days: [1], vehicleId: id(v1), driverId: d1._id }, X.A), [409]);
  const stops = await expect('stops are saved in order', PU(`${P}/routes/${rtId}/stops`, { stops: [{ name: 'Sector A', offsetMin: 0, lat: 33.6, lng: 73.0 }, { name: 'Sector B', offsetMin: 10, lat: 33.62, lng: 73.02 }, { name: 'Sector C', offsetMin: 25, lat: 33.64, lng: 73.05 }] }, X.A), [200]);
  const [sA, sB, sC] = stops.data; log(stops.data.length === 3 && sA.seq === 1 && sC.seq === 3, 'the stops come back numbered in order');
  const re = await expect('stops can be reordered and renamed without losing their ids', PU(`${P}/routes/${rtId}/stops`, { stops: [{ id: sA._id, name: 'Sector A', offsetMin: 0, lat: 33.6, lng: 73.0 }, { id: sB._id, name: 'Sector B (main road)', offsetMin: 12, lat: 33.62, lng: 73.02 }, { id: sC._id, name: 'Sector C', offsetMin: 25, lat: 33.64, lng: 73.05 }] }, X.A), [200]);
  log(re.data[1]._id === sB._id && re.data[1].name === 'Sector B (main road)', 'a stop keeps its id when it is renamed');
  // riders
  await expect('a rider needs a stop that is on the route', PO(`${P}/riders/assign`, { studentIds: [String(X.k1._id)], routeId: rtId, stopId: String(new mg.Types.ObjectId()) }, X.A), [404]);
  await expect('riders of another school cannot be assigned', PO(`${P}/riders/assign`, { studentIds: [String(Y.k1._id)], routeId: rtId, stopId: sA._id }, X.A), [404]);
  await expect('k1 and k2 ride from Sector A', PO(`${P}/riders/assign`, { studentIds: [String(X.k1._id), String(X.k2._id)], routeId: rtId, stopId: sA._id }, X.A), [200]);
  await expect('k3 rides from Sector B and must be handed to an adult', PO(`${P}/riders/assign`, { studentIds: [String(X.k3._id)], routeId: rtId, stopId: sB._id, handoff: 'guardian' }, X.T2), [200]);
  await expect('k4 rides from Sector C', PO(`${P}/riders/assign`, { studentIds: [String(X.k4._id)], routeId: rtId, stopId: sC._id }, X.A), [200]);
  await expect('k5 is on the route but has no stop yet', PO(`${P}/riders/assign`, { studentIds: [String(X.k5._id)], routeId: rtId }, X.A), [200]);
  const rl = await G(`${P}/riders?routeId=${rtId}`, X.T); log(rl.data.length === 5 && rl.data.find((r) => r.name.includes('Chand')).handoff === 'guardian' && rl.data.find((r) => r.name.includes('Eman')).stopName === '', 'the rider list shows each child with stop and hand-over rule');
  const un = await G(`${P}/riders?routeId=${rtId}&unassigned=1`, X.T); log(un.data.length === 1 && un.data[0].name.includes('Eman'), 'children without a stop can be listed');
  await expect('a stop with riders cannot be removed', PU(`${P}/routes/${rtId}/stops`, { stops: [{ id: sA._id, name: 'Sector A', offsetMin: 0 }, { id: sB._id, name: 'B', offsetMin: 12 }] }, X.A), [409]);
  // plans: start about now so that today's trip can be driven
  const nowU = new Date(); const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; const startT = hhmm(new Date(nowU.getTime() - 3 * 60000));
  if (nowU.getUTCHours() === 0 && nowU.getUTCMinutes() < 6) { log(true, 'skipped near midnight'); return; }
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  await expect('a plan needs a real time', PU(`${P}/plans`, { routeId: rtId, direction: 'morning', startTime: '7am', durationMin: 40, days: allDays }, X.A), [422]);
  await expect('a plan needs a day', PU(`${P}/plans`, { routeId: rtId, direction: 'morning', startTime: startT, durationMin: 40, days: [] }, X.A), [422]);
  await expect('a plan cannot use a vehicle of another school', PU(`${P}/plans`, { routeId: rtId, direction: 'morning', startTime: startT, durationMin: 40, days: allDays, vehicleId: vY._id, driverId: d1._id }, X.A), [404]);
  const pl1 = await expect('the morning plan is saved', PU(`${P}/plans`, { routeId: rtId, direction: 'morning', startTime: startT, durationMin: 40, days: allDays, vehicleId: id(v1), driverId: d1._id, escortName: 'Mrs Escort' }, X.A), [200]);
  log(pl1.data.warnings.length === 1 && /seats/.test(pl1.data.warnings[0]), 'a plan warns when more children ride than the vehicle has seats');
  await expect('changing a plan needs a reason', PU(`${P}/plans`, { routeId: rtId, direction: 'morning', startTime: startT, durationMin: 45, days: allDays, vehicleId: id(v2), driverId: d1._id }, X.A), [422]);
  await expect('the same plan changes with a reason', PU(`${P}/plans`, { routeId: rtId, direction: 'morning', startTime: startT, durationMin: 40, days: allDays, vehicleId: id(v2), driverId: d1._id, reason: 'Bigger bus for this route' }, X.A), [200]);
  const rt2 = id(await PO(`${P}/routes`, { name: 'Route South' }, X.A)); const s2 = (await PU(`${P}/routes/${rt2}/stops`, { stops: [{ name: 'South Gate', offsetMin: 0 }, { name: 'South Park', offsetMin: 15 }] }, X.A)).data;
  const clash = await expect('another route cannot use the same vehicle at the same time', PU(`${P}/plans`, { routeId: rt2, direction: 'morning', startTime: startT, durationMin: 30, days: allDays, vehicleId: id(v2), driverId: d2._id }, X.A), [409]); log(clash.data.reason === 'vehicle_clash', 'the clash is named');
  const dclash = await expect('nor the same driver', PU(`${P}/plans`, { routeId: rt2, direction: 'morning', startTime: startT, durationMin: 30, days: allDays, vehicleId: id(v3), driverId: d1._id }, X.A), [409]); log(dclash.data.reason === 'driver_clash', 'the driver clash is named');
  const ap = await expect('the afternoon plan is saved with a smaller bus and another driver', PU(`${P}/plans`, { routeId: rtId, direction: 'afternoon', startTime: startT, durationMin: 40, days: allDays, vehicleId: id(v1), driverId: d3._id }, X.A), [200]); log(!!ap.data.plan, 'the afternoon plan exists too');
  const rts = await G(`${P}/routes`, X.T); const rN = rts.data.find((r) => r.name === 'Route North'); log(rN.stops.length === 3 && rN.plans.length === 2 && rN.riders === 5 && rN.ridersWithoutStop === 1, 'the route list shows stops, plans and riders with no stop');
  const sg = await expect('the rules read', G(`${P}/settings`, X.A), [200]); log(sg.data.version === 1 && sg.data.settings.checklist.length >= 6, 'the rules start at version one');
  await expect('a rule change needs a reason', PU(`${P}/settings`, { settings: { lateNoticeMin: 5 } }, X.A), [422]);
  const sp = await expect('a rule change is saved as a new version', PU(`${P}/settings`, { reason: 'Families asked for earlier notice', settings: { lateNoticeMin: 5 } }, X.A), [200]); log(sp.data.version === 2 && sp.data.settings.lateNoticeMin === 5, 'version two has the new value');
  await PU(`${P}/settings`, { reason: 'Back to the usual figure', settings: { lateNoticeMin: 10 } }, X.A);

  // ── 4. the day's trips ──
  const gen = await expect('trips are made for today', PO(`${P}/trips/generate`, {}, X.A), [200]);
  const gen2 = await PO(`${P}/trips/generate`, {}, X.A); log(gen2.status === 200 && gen2.data.made === 0, 'making the trips again makes nothing new');
  const par = await Promise.all([PO(`${P}/trips/generate`, {}, X.A), PO(`${P}/trips/generate`, {}, X.A2)]); const tripsN = await M('TpTrip').countDocuments({ schoolId: X.s._id }); log(tripsN === 2, 'two people making the trips at once still leave one morning and one afternoon trip');
  const ov = await expect('the day is shown', G(`${P}/overview`, X.A), [200]); const trips = ov.data.trips; const mTrip = trips.find((t) => t.direction === 'morning'); const aTrip = trips.find((t) => t.direction === 'afternoon');
  log(trips.length === 2 && mTrip.counts.expected === 4 && mTrip.status === 'scheduled', 'each run has a trip and four expected riders (the child with no stop is left out)');
  const sk = gen.data.skipped.find((x) => x.why === 'riders_without_stop'); log(!!sk && sk.count === 1, 'the make-trips result says which riders have no stop');
  const sat = await G(`${P}/trips?date=2020-01-01`, X.A); log(sat.data.rows.length === 0, 'a day with no plan has no trips');
  const detail = await expect('a trip opens', G(`${P}/trips/${mTrip._id}`, X.A), [200]); log(detail.data.boards.length === 4 && detail.data.trip.stops.length === 3 && detail.data.trip.vehiclePlate === 'TRA-200' && detail.data.trip.checklist.items.length >= 6, 'it lists riders, stops, vehicle and the checklist to do');
  await expect('a trip of another school is not found', G(`${P}/trips/${mTrip._id}`, Y.A), [404]);

  // ── 5. the driver ──
  await expect('the driver page needs a key', G(`${P}/driver/me`, null), [401]);
  await expect('a wrong key is refused', G(`${P}/driver/me`, null, dh(d1._id, 'nope')), [401]);
  await expect('another driver\'s key does not open this driver', G(`${P}/driver/me`, null, dh(d1._id, key2)), [401]);
  const me = await expect('the driver sees today', G(`${P}/driver/me`, null, dh(d1._id, key1)), [200]);
  const dm = me.data.trips.find((t) => t.direction === 'morning'); const dRider = dm.riders[0];
  log(me.data.trips.length === 1 && dm.riders.length === 4 && !('phone' in dRider) && !('guardian' in dRider) && !JSON.stringify(me.data).includes('0300') && Object.keys(dRider).every((k) => ['studentId', 'name', 'className', 'stopId', 'stopName', 'state', 'handoff', 'boardedAt', 'exception', 'collectors'].includes(k)), 'the driver sees names, class and stop only: no phone, guardian or history');
  const other = await G(`${P}/driver/me`, null, dh(d2._id, key2)); log(other.status === 200 && other.data.trips.length === 0, 'another driver sees none of these trips');
  await expect('another driver cannot act on this trip', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'start' }, null, dh(d2._id, key2)), [403]);
  await expect('the trip cannot start before the checklist', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'start' }, null, dh(d1._id, key1)), [409]);
  await expect('the checklist must be complete', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'checklist', items: [{ key: 'tyres', ok: true }] }, null, dh(d1._id, key1)), [422]);
  const items = (bad) => dm.checklist.items.map((i) => ({ key: i.key, ok: i.key !== bad, note: i.key === bad ? 'Left brake pad worn' : '' }));
  const fail = await expect('a failed safety item is accepted as an answer', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'checklist', items: items('brakes') }, null, dh(d1._id, key1)), [200]);
  log(fail.data.passed === false && fail.data.failed.length === 1, 'the driver is told the bus cannot start');
  const stillSched = await M('TpTrip').findById(dm._id); log(stillSched.status === 'scheduled', 'the trip stays scheduled after a failed critical item');
  const inc0 = await G(`${P}/incidents?status=open_all`, X.A); log(inc0.data.rows.some((i) => i.kind === 'vehicle_fault' && /brakes|Brakes/.test(i.note)), 'the failed check opens an incident for the office');
  await expect('the trip still cannot start', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'start' }, null, dh(d1._id, key1)), [409]);
  const ok = await expect('a passed checklist makes the trip ready', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'checklist', items: items('') }, null, dh(d1._id, key1)), [200]); log(ok.data.passed === true, 'the checklist passes');
  await expect('a position before the trip starts is refused', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'ping', lat: 33.6, lng: 73.0, speedKmh: 20 }, null, dh(d1._id, key1)), [409]);
  await expect('a child cannot board before the trip starts', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'board', studentId: String(X.k1._id) }, null, dh(d1._id, key1)), [409]);
  // vehicle and driver papers
  await M('TpVehicle').updateOne({ _id: id(v2) }, { $set: { insuranceExpiry: '2020-01-01' } });
  const exp = await expect('an expired insurance stops the trip', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'start' }, null, dh(d1._id, key1)), [409]); log(exp.data.reason === 'expired', 'the refusal names the paper');
  await M('TpVehicle').updateOne({ _id: id(v2) }, { $set: { insuranceExpiry: '2099-01-01' } });
  await M('TpDriver').updateOne({ _id: d1._id }, { $set: { licenceExpiry: '2020-01-01' } });
  await expect('an expired licence stops the trip', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'start' }, null, dh(d1._id, key1)), [409]);
  await M('TpDriver').updateOne({ _id: d1._id }, { $set: { licenceExpiry: '2099-01-01' } });

  // go: two starts at once, one trip started, one notice per family
  const starts = await Promise.all([PO(`${P}/driver/trips/${dm._id}/op`, { type: 'start', clientKey: 's1' }, null, dh(d1._id, key1)), PO(`${P}/driver/trips/${dm._id}/op`, { type: 'start', clientKey: 's2' }, null, dh(d1._id, key1))]);
  log(starts.every((r) => r.status === 200) && (await M('TpTrip').findById(dm._id)).status === 'active', 'two starts at once leave one active trip');
  const on1 = await notes(X.p1, 'parent', 'on its way'); log(on1.length === 1, 'a family is told once that the bus is on its way');
  const st1 = await expect('starting again is harmless', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'start' }, null, dh(d1._id, key1)), [200]); log(st1.data.alreadyStarted === true, 'it says the trip had already started');
  await expect('the checklist cannot be redone mid-trip', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'checklist', items: items('') }, null, dh(d1._id, key1)), [409]);

  // positions
  await expect('an impossible position is refused', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'ping', lat: 200, lng: 73 }, null, dh(d1._id, key1)), [422]);
  await expect('a position is stored while the trip is active', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'ping', lat: 33.6, lng: 73.0, speedKmh: 25 }, null, dh(d1._id, key1)), [200]);
  const pg2 = await PO(`${P}/driver/trips/${dm._id}/op`, { type: 'ping', lat: 33.6001, lng: 73.0, speedKmh: 25 }, null, dh(d1._id, key1)); log(pg2.status === 200 && pg2.data.ignored === true, 'positions sent too close together are ignored');
  const live0 = await G(`${P}/me/live?childId=${X.k1._id}`, X.P1); log(live0.status === 200 && live0.data.live === false && live0.data.reason === 'no_consent', 'a family that has not agreed sees no map');
  await Consent.append({ schoolId: X.s._id, type: 'student', subjectDoc: X.k1, purpose: 'bus_tracking', status: 'granted', version: '2026-1', givenByName: 'Parent', givenByRelation: 'Mother', method: 'portal', actor: { id: X.p1._id, name: 'Parent' } });
  const live1 = await expect('a family that agreed sees the bus', G(`${P}/me/live?childId=${X.k1._id}`, X.P1), [200]);
  log(live1.data.live === true && Math.abs(live1.data.position.lat - 33.6) < 0.01 && live1.data.stops.length === 3 && !!live1.data.etaAt && !('driverPhone' in live1.data), 'it shows the position, the stops and an estimate, with no driver details');
  const ls = await G(`${P}/me/live?childId=${X.k1._id}`, X.K1); log(ls.data.live === false && ls.data.reason === 'family_only', 'a child\'s own login never shows the bus position');
  await expect('another family cannot look at this child', G(`${P}/me/live?childId=${X.k1._id}`, X.P2), [403]);
  await expect('a child of another school cannot be looked up', G(`${P}/me/live?childId=${Y.k1._id}`, X.P1), [403, 404]);
  const trk = await G(`${P}/trips/${dm._id}`, X.A); log(trk.data.track.length >= 1, 'the office sees the track while the trip is active');
  const ovn = await G(`${P}/overview`, X.A); log(ovn.data.totals.active === 1 && ovn.data.totals.onBoard === 0, 'the day shows one active trip');

  // boarding
  const b1 = await expect('a child boards', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'board', studentId: String(X.k1._id), stopId: sA._id, clientKey: 'b-k1' }, null, dh(d1._id, key1)), [200]); log(b1.data.boarded === 1, 'the count of children on board is one');
  const b1r = await PO(`${P}/driver/trips/${dm._id}/op`, { type: 'board', studentId: String(X.k1._id), clientKey: 'b-k1' }, null, dh(d1._id, key1)); log(b1r.data.replayed === true, 'the same action sent again is recognised and not repeated');
  const bn = await notes(X.p1, 'parent', 'on the school bus'); log(bn.length === 1, 'the family was told once that the child boarded');
  await expect('a child not on this trip\'s list is refused', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'board', studentId: String(X.k6._id) }, null, dh(d1._id, key1)), [404]);
  const two = await Promise.all([PO(`${P}/driver/trips/${dm._id}/op`, { type: 'board', studentId: String(X.k2._id), clientKey: 'b-k2a' }, null, dh(d1._id, key1)), PO(`${P}/driver/trips/${dm._id}/op`, { type: 'board', studentId: String(X.k2._id), clientKey: 'b-k2b' }, null, dh(d1._id, key1))]);
  log(two.every((r) => r.status === 200) && (await notes(X.p1, 'parent', 'on the school bus')).length === 2 && (await M('TpTrip').findById(dm._id)).counts.boarded === 2, 'two phones boarding the same child at once count and tell the family once');
  await expect('a wrong stop name is only noted', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'arrive', stopId: sA._id }, null, dh(d1._id, key1)), [200]);
  const ns = await expect('a child who is not at the stop is marked', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'no_show', studentId: String(X.k3._id) }, null, dh(d1._id, key1)), [200]); log((await notes(X.p2, 'parent', 'not at the stop')).length === 1, 'their family is told the bus carried on');
  await expect('a child already on the bus cannot be marked missing', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'no_show', studentId: String(X.k1._id) }, null, dh(d1._id, key1)), [409]);
  await expect('a late child can still board after being marked missing', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'board', studentId: String(X.k3._id), stopId: sB._id }, null, dh(d1._id, key1)), [200]);
  await expect('a child can board at a stop that is not theirs', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'board', studentId: String(X.k4._id), stopId: sA._id }, null, dh(d1._id, key1)), [200]);
  const over = await M('TpTrip').findById(dm._id); log(over.counts.boarded === 4 && over.capacity === 30, 'four are on board');
  const ex = await expect('the driver reports a problem with a child', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'exception', studentId: String(X.k4._id), kind: 'behaviour', note: '=HYPERLINK("http://x","y") shouting on the bus' }, null, dh(d1._id, key1)), [200]);
  const exl = await G(`${P}/exceptions`, X.T); log(exl.data.rows.length === 1 && exl.data.rows[0].exception.kind === 'behaviour', 'the office sees it in the exceptions list');
  await expect('it cannot be settled without words', PO(`${P}/exceptions/${exl.data.rows[0]._id}/resolve`, { resolution: 'ok' }, X.T), [422]);
  await expect('it is settled with words', PO(`${P}/exceptions/${exl.data.rows[0]._id}/resolve`, { resolution: 'Spoke to the child and the parent' }, X.T), [200]);
  await expect('a settled exception cannot be settled again', PO(`${P}/exceptions/${exl.data.rows[0]._id}/resolve`, { resolution: 'Again, for good measure' }, X.T), [409]);
  await expect('the trip cannot end before the empty check', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'end' }, null, dh(d1._id, key1)), [409]);
  const endBad = await expect('the trip cannot end with children on board', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'end', emptyChecked: true }, null, dh(d1._id, key1)), [409]); log(endBad.data.reason === 'unreconciled' && endBad.data.onboard === 4, 'it says how many are still on board');
  await expect('school arrival lets everyone off together', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'school_arrival' }, null, dh(d1._id, key1)), [200]);
  const afterArr = await M('TpTrip').findById(dm._id); log(afterArr.counts.alighted === 4 && afterArr.counts.boarded === 0 && afterArr.stops[2].arrivedAt, 'all four are off and the school stop is marked reached');
  log((await notes(X.p1, 'parent', 'Arrived at school')).length === 1, 'the family of two children gets the arrival notice');
  const endOk = await expect('the trip ends after the empty check', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'end', emptyChecked: true, count: 0 }, null, dh(d1._id, key1)), [200]); log(endOk.data.unreconciled === 0, 'nobody is unaccounted for');
  const done = await M('TpTrip').findById(dm._id); log(done.status === 'completed' && !!done.endedAt && done.emptyCheck.done && done.positionsPurgedAt && !(done.lastPos && done.lastPos.at), 'the trip is completed and its positions are gone');
  log((await M('TpPing').countDocuments({ tripId: dm._id })) === 0, 'no position is kept after a trip with no incident');
  await expect('a position after the trip is refused', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'ping', lat: 33.6, lng: 73.0 }, null, dh(d1._id, key1)), [409]);
  const lateLive = await G(`${P}/me/live?childId=${X.k1._id}`, X.P1); log(lateLive.data.live === false, 'the family sees no map once the trip is over');
  await expect('a finished trip cannot be ended again', PO(`${P}/driver/trips/${dm._id}/op`, { type: 'end', emptyChecked: true }, null, dh(d1._id, key1)), [409]);
  const tdet = await G(`${P}/trips/${dm._id}`, X.A); log(tdet.data.track.length === 0 && tdet.data.events.some((e) => e.kind === 'board'), 'the office sees the history but no track');

  await require('./transportChecks2')({ call, expect, log, tokens, base }, { X, Y, rtId, sA, sB, sC, v1, v2, v3, d1, d2, d3, key1, key2, key3, mTrip, aTrip, dm, G, PO, PA, PU, DEL, P, id, dh, grant, notes, hhmm, allDays });
};
