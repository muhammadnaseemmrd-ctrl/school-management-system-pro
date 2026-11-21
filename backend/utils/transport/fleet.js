// Vehicles, drivers, routes, stops, plans, riders, inspections and incidents (PRD E22).
const S = require('./service');
const T = require('./trips');
const { E, Fail, oid, clean } = S;
const TpVehicle = require('../../models/TpVehicle'); const TpDriver = require('../../models/TpDriver'); const TpStop = require('../../models/TpStop'); const TpPlan = require('../../models/TpPlan');
const TpTrip = require('../../models/TpTrip'); const TpBoard = require('../../models/TpBoard'); const TpInspection = require('../../models/TpInspection'); const TpIncident = require('../../models/TpIncident');
const TransportRoute = require('../../models/TransportRoute'); const TransportAssignment = require('../../models/TransportAssignment'); const Student = require('../../models/Student'); const Class = require('../../models/Class');

const plain = (d) => (d && d.toObject ? d.toObject() : d);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dayOrEmpty = (v, label) => { const s = clean(v, 10); if (!s) return ''; if (!E.isDay(s)) throw new Fail(422, `${label} must be a date.`); return s; };
const must = (doc, what) => { if (!doc) throw new Fail(404, `That ${what} is not in your school.`); return doc; };

/* ───────── vehicles ───────── */
const vehicleOut = (v, t) => { const o = plain(v); return { ...o, inspectionDue: !o.nextInspectionDue || o.nextInspectionDue <= E.addDays(t, 7), fitnessSoon: !!o.fitnessExpiry && o.fitnessExpiry <= E.addDays(t, 30), insuranceSoon: !!o.insuranceExpiry && o.insuranceExpiry <= E.addDays(t, 30) }; };
async function listVehicles(schoolId) { const t = await S.today(schoolId); return (await TpVehicle.find({ schoolId }).sort({ plate: 1 })).map((v) => vehicleOut(v, t)); }
async function createVehicle(ctx, b) {
  const plate = clean(b.plate, 20).toUpperCase(); if (!plate) throw new Fail(422, 'Enter the number plate.'); const capacity = Math.round(Number(b.capacity));
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 120) throw new Fail(422, 'Capacity must be between 1 and 120 seats.');
  try { return await TpVehicle.create({ schoolId: ctx.schoolId, plate, plateKey: E.plateKey(plate), label: clean(b.label, 60), kind: ['bus', 'van', 'other'].includes(b.kind) ? b.kind : 'bus', capacity, fitnessExpiry: dayOrEmpty(b.fitnessExpiry, 'Fitness expiry'), insuranceExpiry: dayOrEmpty(b.insuranceExpiry, 'Insurance expiry'), notes: clean(b.notes, 300) }); }
  catch (e) { if (S.isDup(e)) throw new Fail(409, 'A vehicle with that plate is already listed.'); throw e; }
}
async function updateVehicle(ctx, id, b) {
  const v = must(oid(id) ? await TpVehicle.findOne({ _id: id, schoolId: ctx.schoolId }) : null, 'vehicle'); const $set = {};
  if (b.plate !== undefined) { const plate = clean(b.plate, 20).toUpperCase(); if (!plate) throw new Fail(422, 'Enter the number plate.'); $set.plate = plate; $set.plateKey = E.plateKey(plate); }
  if (b.capacity !== undefined) { const c = Math.round(Number(b.capacity)); if (!Number.isFinite(c) || c < 1 || c > 120) throw new Fail(422, 'Capacity must be between 1 and 120 seats.'); $set.capacity = c; }
  for (const k of ['label', 'notes']) if (b[k] !== undefined) $set[k] = clean(b[k], k === 'label' ? 60 : 300);
  if (b.kind !== undefined && ['bus', 'van', 'other'].includes(b.kind)) $set.kind = b.kind;
  if (b.fitnessExpiry !== undefined) $set.fitnessExpiry = dayOrEmpty(b.fitnessExpiry, 'Fitness expiry'); if (b.insuranceExpiry !== undefined) $set.insuranceExpiry = dayOrEmpty(b.insuranceExpiry, 'Insurance expiry');
  if (b.status !== undefined) {
    if (b.status === 'retired') {
      const reason = clean(b.reason, 200); if (reason.length < 5) throw new Fail(422, 'Say why the vehicle is retired.');
      const plans = await TpPlan.countDocuments({ schoolId: ctx.schoolId, vehicleId: v._id, status: 'active' }); if (plans) throw new Fail(409, `This vehicle is still on ${plans} standing plan(s). Give those plans another vehicle first.`);
      $set.status = 'retired'; $set.holdReason = reason;
    } else if (b.status === 'active') {
      if (v.status === 'inspection_hold') throw new Fail(409, 'A vehicle on hold is released only by a passed inspection.', { reason: 'inspection_needed' });
      $set.status = 'active'; $set.holdReason = '';
    } else throw new Fail(422, 'That status is not allowed here.');
  }
  try { await TpVehicle.updateOne({ _id: v._id }, { $set }); } catch (e) { if (S.isDup(e)) throw new Fail(409, 'A vehicle with that plate is already listed.'); throw e; }
  return TpVehicle.findById(v._id);
}

/* ───────── drivers ───────── */
const driverOut = (d) => { const o = plain(d); delete o.keyHash; return { ...o, hasKey: !!d.keyHash }; };
async function listDrivers(schoolId) { return (await TpDriver.find({ schoolId }).sort({ name: 1 })).map(driverOut); }
async function createDriver(ctx, b) {
  const name = clean(b.name, 80); if (name.length < 2) throw new Fail(422, 'Enter the driver\'s name.'); const phone = clean(b.phone, 20); const key = S.newKey();
  const doc = { schoolId: ctx.schoolId, name, phone, licenceLast4: clean(b.licenceLast4, 4), licenceExpiry: dayOrEmpty(b.licenceExpiry, 'Licence expiry'), notes: clean(b.notes, 300), keyHash: S.sha(key), keySetAt: new Date() };
  if (E.phoneKey(phone)) doc.phoneKey = E.phoneKey(phone);
  try { const d = await TpDriver.create(doc); return { driver: driverOut(d), key }; } catch (e) { if (S.isDup(e)) throw new Fail(409, 'A driver with that phone number is already listed.'); throw e; }
}
async function updateDriver(ctx, id, b) {
  const d = must(oid(id) ? await TpDriver.findOne({ _id: id, schoolId: ctx.schoolId }) : null, 'driver'); const $set = {}; const $unset = {};
  if (b.name !== undefined) { const n = clean(b.name, 80); if (n.length < 2) throw new Fail(422, 'Enter the driver\'s name.'); $set.name = n; }
  if (b.phone !== undefined) { const p = clean(b.phone, 20); $set.phone = p; if (E.phoneKey(p)) $set.phoneKey = E.phoneKey(p); else $unset.phoneKey = ''; }
  if (b.licenceLast4 !== undefined) $set.licenceLast4 = clean(b.licenceLast4, 4); if (b.licenceExpiry !== undefined) $set.licenceExpiry = dayOrEmpty(b.licenceExpiry, 'Licence expiry'); if (b.notes !== undefined) $set.notes = clean(b.notes, 300);
  if (b.status !== undefined) {
    if (!['active', 'suspended', 'ended'].includes(b.status)) throw new Fail(422, 'That status is not allowed.');
    if (b.status !== 'active') {
      const reason = clean(b.reason, 200); if (reason.length < 5) throw new Fail(422, 'Say why the driver is switched off.');
      const plans = await TpPlan.countDocuments({ schoolId: ctx.schoolId, driverId: d._id, status: 'active' }); if (plans) throw new Fail(409, `This driver is still on ${plans} standing plan(s). Give those plans another driver first.`);
      const live = await TpTrip.countDocuments({ schoolId: ctx.schoolId, driverId: d._id, status: 'active' }); if (live) throw new Fail(409, 'This driver has a trip under way.');
    }
    $set.status = b.status;
  }
  const upd = { $set }; if (Object.keys($unset).length) upd.$unset = $unset;
  try { await TpDriver.updateOne({ _id: d._id }, upd); } catch (e) { if (S.isDup(e)) throw new Fail(409, 'A driver with that phone number is already listed.'); throw e; }
  return driverOut(await TpDriver.findById(d._id));
}
// A new key switches the old link off at once and is shown only now
async function rotateKey(ctx, id) {
  const d = must(oid(id) ? await TpDriver.findOne({ _id: id, schoolId: ctx.schoolId }) : null, 'driver'); if (d.status === 'ended') throw new Fail(409, 'This driver has left.');
  const key = S.newKey(); await TpDriver.updateOne({ _id: d._id }, { $set: { keyHash: S.sha(key), keySetAt: new Date() } }); return { driver: driverOut(await TpDriver.findById(d._id)), key };
}

/* ───────── routes, stops, plans ───────── */
async function listRoutes(schoolId) {
  const [routes, stops, plans, assigns] = await Promise.all([TransportRoute.find({ schoolId }).sort({ name: 1 }), TpStop.find({ schoolId }).sort({ seq: 1 }), TpPlan.find({ schoolId }), TransportAssignment.find({ schoolId }).select('routeId stopId')]);
  return routes.map((r) => { const rs = stops.filter((s) => String(s.routeId) === String(r._id)); const ra = assigns.filter((a) => String(a.routeId) === String(r._id));
    return { ...plain(r), stops: rs.map(plain), plans: plans.filter((p) => String(p.routeId) === String(r._id)).map(plain), riders: ra.length, ridersWithoutStop: ra.filter((a) => !a.stopId || !rs.some((s) => s.active && String(s._id) === String(a.stopId))).length }; });
}
async function createRoute(ctx, b) {
  const name = clean(b.name, 80); if (!name) throw new Fail(422, 'Name the route.'); const fee = Number(b.monthlyFee === undefined ? 0 : b.monthlyFee); if (!Number.isFinite(fee) || fee < 0) throw new Fail(422, 'Enter the monthly fee in rupees (0 if none).');
  try { return await TransportRoute.create({ schoolId: ctx.schoolId, name, monthlyFee: fee, notes: clean(b.notes, 300) }); } catch (e) { if (S.isDup(e)) throw new Fail(409, 'A route with that name already exists.'); throw e; }
}
async function saveStops(ctx, routeId, b) {
  const route = must(oid(routeId) ? await TransportRoute.findOne({ _id: routeId, schoolId: ctx.schoolId }) : null, 'route'); const list = Array.isArray(b.stops) ? b.stops : [];
  if (!list.length || list.length > 40) throw new Fail(422, 'A route needs between 1 and 40 stops.');
  const seen = new Set(); let prev = -1; const clean1 = [];
  for (const [i, s] of list.entries()) {
    const name = clean(s.name, 80); if (!name) throw new Fail(422, `Stop ${i + 1} needs a name.`); const k = name.toLowerCase(); if (seen.has(k)) throw new Fail(422, `Two stops are called "${name}".`); seen.add(k);
    const off = Math.round(Number(s.offsetMin ?? 0)); if (!Number.isFinite(off) || off < 0 || off > 600) throw new Fail(422, `Stop ${i + 1}: minutes from the start must be 0 to 600.`); if (off < prev) throw new Fail(422, `Stop ${i + 1} comes before the one above it in time.`); prev = off;
    const hasLat = s.lat !== undefined && s.lat !== null && s.lat !== ''; const hasLng = s.lng !== undefined && s.lng !== null && s.lng !== '';
    if (hasLat !== hasLng) throw new Fail(422, `Stop ${i + 1}: give both latitude and longitude, or neither.`);
    const lat = hasLat ? Number(s.lat) : null; const lng = hasLng ? Number(s.lng) : null; if (hasLat && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) throw new Fail(422, `Stop ${i + 1}: that position is not valid.`);
    clean1.push({ id: oid(s.id), name, offsetMin: off, lat, lng });
  }
  const existing = await TpStop.find({ schoolId: ctx.schoolId, routeId: route._id });
  const keep = new Set(clean1.map((s) => String(s.id)).filter(Boolean)); const gone = existing.filter((s) => !keep.has(String(s._id)));
  for (const g of gone) { if (!g.active) continue; const n = await TransportAssignment.countDocuments({ schoolId: ctx.schoolId, routeId: route._id, stopId: g._id }); if (n) throw new Fail(409, `"${g.name}" still has ${n} rider(s). Move them to another stop first.`, { reason: 'riders_on_stop', stopId: g._id }); }
  for (const s of clean1) if (s.id && !existing.some((x) => String(x._id) === String(s.id))) throw new Fail(404, 'One of those stops is not on this route.');
  // two passes so the unique order number never clashes while stops are moved
  for (const [i, e] of existing.entries()) await TpStop.updateOne({ _id: e._id }, { $set: { seq: 1000 + i } });
  const out = [];
  for (const [i, s] of clean1.entries()) {
    if (s.id) { await TpStop.updateOne({ _id: s.id }, { $set: { seq: i + 1, name: s.name, offsetMin: s.offsetMin, lat: s.lat, lng: s.lng, active: true } }); out.push(s.id); }
    else out.push((await TpStop.create({ schoolId: ctx.schoolId, routeId: route._id, seq: i + 1, name: s.name, offsetMin: s.offsetMin, lat: s.lat, lng: s.lng })));
  }
  for (const g of gone) { const used = await TpBoard.countDocuments({ schoolId: ctx.schoolId, stopId: g._id }); if (used) await TpStop.updateOne({ _id: g._id }, { $set: { seq: 1000000 + parseInt(String(g._id).slice(-6), 16), active: false } }); else await TpStop.deleteOne({ _id: g._id }); }
  return TpStop.find({ schoolId: ctx.schoolId, routeId: route._id, active: true }).sort({ seq: 1 });
}
const overlap = (a, b) => a.start < b.end && b.start < a.end;
async function savePlan(ctx, b) {
  const route = must(oid(b.routeId) ? await TransportRoute.findOne({ _id: b.routeId, schoolId: ctx.schoolId }) : null, 'route'); const direction = b.direction;
  if (!['morning', 'afternoon'].includes(direction)) throw new Fail(422, 'Choose morning or afternoon.'); if (!E.isTime(b.startTime)) throw new Fail(422, 'Enter the start time as HH:MM.');
  const dur = Math.round(Number(b.durationMin)); if (!Number.isFinite(dur) || dur < 5 || dur > 600) throw new Fail(422, 'The run must take between 5 and 600 minutes.');
  const days = [...new Set((Array.isArray(b.days) ? b.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(); if (!days.length) throw new Fail(422, 'Choose at least one day.');
  const veh = b.vehicleId ? must(oid(b.vehicleId) ? await TpVehicle.findOne({ _id: b.vehicleId, schoolId: ctx.schoolId }) : null, 'vehicle') : null; if (veh && veh.status === 'retired') throw new Fail(409, 'That vehicle is retired.');
  const drv = b.driverId ? must(oid(b.driverId) ? await TpDriver.findOne({ _id: b.driverId, schoolId: ctx.schoolId }) : null, 'driver') : null; if (drv && drv.status !== 'active') throw new Fail(409, 'That driver is not active.');
  const stops = await TpStop.countDocuments({ schoolId: ctx.schoolId, routeId: route._id, active: true }); if (!stops) throw new Fail(409, 'Add the route\'s stops before planning a run.', { reason: 'no_stops' });
  const status = b.status === 'paused' ? 'paused' : 'active';
  const start = E.mins(b.startTime); const mine = { start, end: start + dur };
  if (status === 'active') {
    for (const other of await TpPlan.find({ schoolId: ctx.schoolId, status: 'active' })) {
      if (String(other.routeId) === String(route._id) && other.direction === direction) continue;
      if (!(other.days || []).some((d) => days.includes(d))) continue; const os = E.mins(other.startTime);
      if (!overlap(mine, { start: os, end: os + other.durationMin })) continue;
      if (veh && String(other.vehicleId) === String(veh._id)) throw new Fail(409, 'That vehicle is already on another run at the same time.', { reason: 'vehicle_clash' });
      if (drv && String(other.driverId) === String(drv._id)) throw new Fail(409, 'That driver is already on another run at the same time.', { reason: 'driver_clash' });
    }
  }
  const riders = await TransportAssignment.countDocuments({ schoolId: ctx.schoolId, routeId: route._id, stopId: { $ne: null } }); const warnings = [];
  if (veh && riders > veh.capacity) warnings.push(`${riders} riders are listed for ${veh.capacity} seats on ${veh.plate}.`);
  const cur = await TpPlan.findOne({ schoolId: ctx.schoolId, routeId: route._id, direction }); const reason = clean(b.reason, 200); if (cur && reason.length < 5) throw new Fail(422, 'Say why the plan is changing.');
  const set = { startTime: b.startTime, durationMin: dur, days, vehicleId: veh?._id || null, driverId: drv?._id || null, escortName: clean(b.escortName, 80), status };
  let plan;
  if (cur) { await TpPlan.updateOne({ _id: cur._id }, { $set: set, $push: { trail: S.trail(ctx.actor, 'changed', reason) } }); plan = await TpPlan.findById(cur._id); }
  else { try { plan = await TpPlan.create({ schoolId: ctx.schoolId, routeId: route._id, direction, ...set, trail: [S.trail(ctx.actor, 'made', '')] }); } catch (e) { if (S.isDup(e)) throw new Fail(409, 'That run already has a plan. Open it to change it.'); throw e; } }
  return { plan, warnings, note: 'The plan applies to trips made from tomorrow. Change a trip already made from Today.' };
}

/* ───────── riders ───────── */
async function listRiders(schoolId, q) {
  const f = { schoolId }; if (oid(q.routeId)) f.routeId = oid(q.routeId); if (q.unassigned === '1') f.stopId = null;
  const as = await TransportAssignment.find(f); const ids = as.map((a) => a.studentId);
  const kids = await Student.find({ schoolId, _id: { $in: ids } }).select('name classId isActive');
  const cls = new Map((await Class.find({ schoolId, _id: { $in: kids.map((k) => k.classId).filter(Boolean) } })).map((c) => [String(c._id), T.className(c)]));
  const stops = new Map((await TpStop.find({ schoolId, _id: { $in: as.map((a) => a.stopId).filter(Boolean) } })).map((s) => [String(s._id), s.name]));
  const routes = new Map((await TransportRoute.find({ schoolId })).map((r) => [String(r._id), r.name]));
  let rows = as.map((a) => { const k = kids.find((x) => String(x._id) === String(a.studentId)); return { studentId: a.studentId, name: k?.name || '', className: cls.get(String(k?.classId)) || '', active: k?.isActive !== false, routeId: a.routeId, routeName: routes.get(String(a.routeId)) || '', stopId: a.stopId, stopName: stops.get(String(a.stopId)) || '', pickupPoint: a.pickupPoint, handoff: a.handoff || 'release' }; });
  if (q.q) { const re = new RegExp(esc(q.q), 'i'); rows = rows.filter((r) => re.test(r.name) || re.test(r.stopName) || re.test(r.className)); }
  rows.sort((a, b) => a.routeName.localeCompare(b.routeName) || a.name.localeCompare(b.name)); return rows.slice(0, 500);
}
async function assignRiders(ctx, b) {
  const ids = (Array.isArray(b.studentIds) ? b.studentIds : [b.studentId]).map(oid).filter(Boolean); if (!ids.length) throw new Fail(422, 'Choose at least one student.'); if (ids.length > 200) throw new Fail(422, 'Choose at most 200 students at a time.');
  const valid = await Student.find({ schoolId: ctx.schoolId, _id: { $in: ids } }).select('_id'); if (valid.length !== ids.length) throw new Fail(404, 'One of those students is not in your school.');
  const route = must(oid(b.routeId) ? await TransportRoute.findOne({ _id: b.routeId, schoolId: ctx.schoolId }) : null, 'route');
  let stop = null; if (b.stopId) { stop = await TpStop.findOne({ _id: oid(b.stopId), schoolId: ctx.schoolId, routeId: route._id, active: true }); if (!stop) throw new Fail(404, 'That stop is not on this route.'); }
  const handoff = b.handoff === 'guardian' ? 'guardian' : 'release';
  for (const s of valid) await TransportAssignment.findOneAndUpdate({ schoolId: ctx.schoolId, studentId: s._id }, { routeId: route._id, pickupPoint: stop?.name || '', stopId: stop?._id || null, handoff }, { upsert: true, new: true });
  for (const s of valid) await syncRider(ctx.schoolId, s._id);
  return { assigned: valid.length, route: route.name, stop: stop?.name || '' };
}
async function updateRider(ctx, studentId, b) {
  const a = must(oid(studentId) ? await TransportAssignment.findOne({ schoolId: ctx.schoolId, studentId }) : null, 'rider'); const $set = {};
  if (b.stopId !== undefined) { if (!b.stopId) { $set.stopId = null; $set.pickupPoint = ''; } else { const s = await TpStop.findOne({ _id: oid(b.stopId), schoolId: ctx.schoolId, routeId: a.routeId, active: true }); if (!s) throw new Fail(404, 'That stop is not on this rider\'s route.'); $set.stopId = s._id; $set.pickupPoint = s.name; } }
  if (b.handoff !== undefined) { if (!['release', 'guardian'].includes(b.handoff)) throw new Fail(422, 'Choose how the child is handed over.'); $set.handoff = b.handoff; }
  if (!Object.keys($set).length) throw new Fail(422, 'Nothing to change.');
  await TransportAssignment.updateOne({ _id: a._id }, { $set }); await syncRider(ctx.schoolId, a.studentId); return TransportAssignment.findById(a._id);
}
async function removeRider(ctx, studentId) { const a = must(oid(studentId) ? await TransportAssignment.findOne({ schoolId: ctx.schoolId, studentId }) : null, 'rider'); await TransportAssignment.deleteOne({ _id: a._id }); await syncRider(ctx.schoolId, a.studentId); return { removed: true }; }
// A change to a rider reaches trips that are made but have not started
async function syncRider(schoolId, studentId) {
  const a = await TransportAssignment.findOne({ schoolId, studentId }); const t = await S.today(schoolId);
  const live = await TpTrip.find({ schoolId, date: { $gte: t }, status: { $in: ['scheduled', 'checked'] } }).select('_id routeId stops direction date');
  const stu = await Student.findById(studentId).select('name classId'); const cl = stu?.classId ? await Class.findById(stu.classId) : null;
  for (const trip of live) {
    const here = a && a.stopId && String(a.routeId) === String(trip.routeId) && trip.stops.find((s) => String(s.stopId) === String(a.stopId));
    const row = await TpBoard.findOne({ tripId: trip._id, studentId });
    if (!here) { if (row && row.state === 'expected' && row.source !== 'dispatcher') { await TpBoard.deleteOne({ _id: row._id }); await T.recount(trip._id); } continue; }
    if (!row) { try { await TpBoard.create({ schoolId, tripId: trip._id, studentId, studentName: stu?.name || '', className: T.className(cl), stopId: here.stopId, stopName: here.name, handoff: a.handoff || 'release', state: 'expected', source: 'plan' }); } catch (e) { if (!S.isDup(e)) throw e; } }
    else if (row.state === 'expected') await TpBoard.updateOne({ _id: row._id }, { $set: { stopId: here.stopId, stopName: here.name, handoff: a.handoff || 'release' } });
    await T.recount(trip._id);
  }
}

/* ───────── inspections ───────── */
async function createInspection(ctx, b) {
  const v = must(oid(b.vehicleId) ? await TpVehicle.findOne({ _id: b.vehicleId, schoolId: ctx.schoolId }) : null, 'vehicle'); const cfg = (await S.getCfg(ctx.schoolId)).settings;
  const given = new Map((Array.isArray(b.items) ? b.items : []).map((i) => [String(i.key), i]));
  const items = cfg.inspection.map((i) => { const g = given.get(i.key); const r = g && ['pass', 'fail', 'na'].includes(g.result) ? g.result : ''; return { key: i.key, label: i.label, critical: i.critical, result: r, note: clean(g?.note, 200) }; });
  if (items.some((i) => !i.result)) throw new Fail(422, 'Mark every line pass, fail or not applicable.', { reason: 'incomplete' });
  const failedCritical = items.filter((i) => i.critical && i.result === 'fail').length; const failedAny = items.filter((i) => i.result === 'fail');
  const doneOn = dayOrEmpty(b.doneOn, 'Inspection date') || await S.today(ctx.schoolId); const t = await S.today(ctx.schoolId); if (doneOn > t) throw new Fail(422, 'An inspection cannot be dated in the future.');
  const inspectorName = clean(b.inspectorName, 80) || ctx.actor.name; if (!inspectorName) throw new Fail(422, 'Write who inspected the vehicle.');
  const result = failedCritical ? 'fail' : 'pass'; const nextDue = E.addDays(doneOn, cfg.inspectionEveryDays);
  // a hold is lifted only by someone other than the person who put it on, unless the school has one administrator
  let sole = false;
  if (result === 'pass' && v.status === 'inspection_hold') {
    const prior = await TpInspection.findOne({ schoolId: ctx.schoolId, vehicleId: v._id, result: 'fail' }).sort({ doneOn: -1, createdAt: -1 });
    if (prior && prior.byId && String(prior.byId) === String(ctx.actor.id)) { if (await S.R.soleAdmin(ctx.schoolId)) sole = true; else throw new Fail(403, 'A vehicle on hold must be passed by someone other than the person who failed it.', { reason: 'maker_checker' }); }
  }
  let ticketNo = '';
  if (failedAny.length) { try { const X = require('../procure/assets'); const tk = await X.reportTicket({ schoolId: ctx.schoolId, actor: ctx.actor, role: ctx.role }, { title: `Vehicle ${v.plate}: inspection failed - ${failedAny.map((f) => f.label).slice(0, 3).join(', ')}`, description: failedAny.map((f) => `${f.label}${f.note ? ` (${f.note})` : ''}`).join('; '), location: `Transport - ${v.plate}`, priority: failedCritical ? 'urgent' : 'high' }); ticketNo = tk.ticketNo || ''; } catch (e) { /* purchasing may not be set up; the inspection still stands */ } }
  const ins = await TpInspection.create({ schoolId: ctx.schoolId, vehicleId: v._id, vehiclePlate: v.plate, kind: ['routine', 'annual', 'after_incident'].includes(b.kind) ? b.kind : 'routine', items, result, failedCritical, doneOn, nextDue, inspectorName, byId: ctx.actor.id || null, notes: clean(b.notes, 400), ticketNo });
  const $set = { lastInspectionOn: doneOn, nextInspectionDue: nextDue };
  if (result === 'fail' && v.status === 'active') { $set.status = 'inspection_hold'; $set.holdReason = failedAny.filter((i) => i.critical).map((i) => i.label).join('; ').slice(0, 200); $set.holdSince = new Date(); }
  if (result === 'pass' && v.status === 'inspection_hold') { $set.status = 'active'; $set.holdReason = ''; }
  await TpVehicle.updateOne({ _id: v._id }, { $set });
  if (result === 'fail') {
    const trips = await TpTrip.find({ schoolId: ctx.schoolId, vehicleId: v._id, date: { $gte: t }, status: { $in: ['scheduled', 'checked'] } }).select('routeName date direction');
    await S.tellDispatch(ctx.schoolId, `Vehicle ${v.plate} is on hold`, `${v.holdReason || 'A critical inspection item failed'}. ${trips.length ? `${trips.length} trip(s) need another vehicle: ${trips.slice(0, 4).map((x) => `${x.routeName} ${x.direction} ${x.date}`).join('; ')}.` : 'No trips are waiting for it.'}`, { urgent: true });
  }
  return { inspection: ins, vehicle: await TpVehicle.findById(v._id), soleAdminRelease: sole };
}
async function listInspections(schoolId, q) { const f = { schoolId }; if (oid(q.vehicleId)) f.vehicleId = oid(q.vehicleId); return TpInspection.find(f).sort({ doneOn: -1, createdAt: -1 }).limit(100); }


// Find a child by name for the rider and one-off screens: active children only, at most 15.
async function searchStudents(schoolId, q) {
  const text = clean(q && q.q, 60); if (text.length < 2) return { students: [] };
  const kids = await Student.find({ schoolId, isActive: { $ne: false }, name: new RegExp(esc(text), 'i') }).select('name classId admissionNumber').sort({ name: 1 }).limit(15);
  const cls = new Map((await Class.find({ schoolId, _id: { $in: kids.map((k) => k.classId).filter(Boolean) } })).map((c) => [String(c._id), T.className(c)]));
  const on = new Map((await TransportAssignment.find({ schoolId, studentId: { $in: kids.map((k) => k._id) } }).select('studentId routeId')).map((a) => [String(a.studentId), a.routeId]));
  return { students: kids.map((k) => ({ _id: k._id, name: k.name, className: cls.get(String(k.classId)) || '', studentId: k.admissionNumber || '', rides: on.has(String(k._id)) })) };
}

/* ───────── incidents ───────── */
async function listIncidents(schoolId, q) {
  const f = { schoolId }; if (['open', 'acknowledged', 'resolved'].includes(q.status)) f.status = q.status; else if (q.status === 'open_all') f.status = { $in: ['open', 'acknowledged'] }; if (TpIncident.KINDS.includes(q.kind)) f.kind = q.kind;
  const { limit, skip, page } = S.pg(q); const [rows, total] = await Promise.all([TpIncident.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), TpIncident.countDocuments(f)]); return { rows, total, page, limit };
}
async function reportIncident(ctx, b) {
  let trip = null; if (b.tripId) trip = must(oid(b.tripId) ? await TpTrip.findOne({ _id: b.tripId, schoolId: ctx.schoolId }) : null, 'trip');
  if (trip) return T.openIncident({ ...ctx, byKind: 'staff', byName: ctx.actor.name, byId: ctx.actor.id }, trip, b);
  const kind = TpIncident.KINDS.includes(b.kind) ? b.kind : 'other'; const note = clean(b.note, 600); if (note.length < 5) throw new Fail(422, 'Say what happened.'); const severity = ['low', 'medium', 'high', 'critical'].includes(b.severity) ? b.severity : 'medium';
  const veh = oid(b.vehicleId) ? await TpVehicle.findOne({ _id: b.vehicleId, schoolId: ctx.schoolId }) : null;
  const inc = await S.numbered(TpIncident, ctx.schoolId, 'incidentNo', 'TI', { vehicleId: veh?._id || null, vehiclePlate: veh?.plate || '', kind, severity, note, reportedByKind: 'staff', reportedByName: ctx.actor.name, trail: [S.trail(ctx.actor, 'reported', note.slice(0, 120))] });
  if (severity === 'high' || severity === 'critical') await S.tellDispatch(ctx.schoolId, `Bus incident: ${kind.replace(/_/g, ' ')}`, `${inc.incidentNo}: ${note.slice(0, 160)}`, { urgent: true, type: 'safety' });
  return inc;
}
async function updateIncident(ctx, id, b) {
  const inc = must(oid(id) ? await TpIncident.findOne({ _id: id, schoolId: ctx.schoolId }) : null, 'incident');
  if (b.action === 'acknowledge') { const w = await TpIncident.updateOne({ _id: inc._id, status: 'open' }, { $set: { status: 'acknowledged' }, $push: { trail: S.trail(ctx.actor, 'acknowledged', clean(b.note, 200)) } }); if (!w.matchedCount) throw new Fail(409, 'This incident has already been taken up.'); }
  else if (b.action === 'resolve') { const r = clean(b.resolution, 400); if (r.length < 10) throw new Fail(422, 'Write what was done (at least 10 characters).'); const w = await TpIncident.updateOne({ _id: inc._id, status: { $in: ['open', 'acknowledged'] } }, { $set: { status: 'resolved', resolution: r }, $push: { trail: S.trail(ctx.actor, 'resolved', r.slice(0, 200)) } }); if (!w.matchedCount) throw new Fail(409, 'This incident is already resolved.'); }
  else throw new Fail(422, 'Choose acknowledge or resolve.');
  return TpIncident.findById(inc._id);
}

module.exports = { searchStudents, listVehicles, createVehicle, updateVehicle, listDrivers, createDriver, updateDriver, rotateKey, listRoutes, createRoute, saveStops, savePlan, listRiders, assignRiders, updateRider, removeRider, syncRider, createInspection, listInspections, listIncidents, reportIncident, updateIncident, plain, esc };
