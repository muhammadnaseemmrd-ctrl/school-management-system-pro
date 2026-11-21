// School transport (PRD E22): trips, boarding, vehicles, drivers, routes, inspections, incidents and what families see.
const S = require('../utils/transport/service');
const T = require('../utils/transport/trips');
const F = require('../utils/transport/fleet');
const V = require('../utils/transport/views');
const { E, Fail, oid, sid, wrap, ctxOf, clean } = S;
const { audit } = require('../utils/audit');
const TpBoard = require('../models/TpBoard'); const TpTrip = require('../models/TpTrip'); const Parent = require('../models/Parent'); const Student = require('../models/Student'); const TransportAssignment = require('../models/TransportAssignment'); const TransportRoute = require('../models/TransportRoute');
const GR = require('../utils/guardianRights');
const A = (req, action, id, detail = '') => audit(req, { action, entityType: 'transport', entityId: id, schoolId: req.user.schoolId, detail }).catch(() => {});
const body = (req) => req.body || {};
const id = (d) => String(d && d._id);
const staffCtx = (req) => { const c = ctxOf(req); return { schoolId: c.schoolId, byKind: 'staff', byName: c.actor.name, byId: c.actor.id }; };

/* ───────── who am I here ───────── */
exports.access = wrap('tp.access', async (req, res) => { res.json({ manage: await S.isManager(req.user), dispatch: await S.isDispatcher(req.user), admin: req.user.role === 'admin' }); });
exports.settings = wrap('tp.settings', async (req, res) => { const g = await S.getCfg(sid(req)); res.json({ settings: g.settings, version: g.version, history: g.history.map((h) => ({ version: h.version, reason: h.reason, at: h.at, byName: h.byName })) }); });
exports.saveSettings = wrap('tp.saveSettings', async (req, res) => {
  const reason = clean(body(req).reason, 200); if (reason.length < 5) throw new Fail(422, 'Say why the rules are changing (at least 5 characters).');
  const g = await S.getCfg(sid(req)); const next = E.merge({ ...g.settings, ...(body(req).settings || {}) }); const c = ctxOf(req);
  const history = [...g.history.filter((h) => h.version > 1 || h.byName !== 'Default'), { version: g.version + 1, reason, at: new Date(), byId: c.actor.id, byName: c.actor.name, settings: next }];
  await S.putCfg(sid(req), { history: history.slice(-30) }); await A(req, 'transport.settings', String(sid(req)), reason); res.json({ settings: next, version: g.version + 1 });
});

/* ───────── the dispatcher's day ───────── */
exports.overview = wrap('tp.overview', async (req, res) => { res.json(await V.overview(sid(req))); });
exports.trips = wrap('tp.trips', async (req, res) => { res.json(await V.listTrips(sid(req), req.query)); });
exports.trip = wrap('tp.trip', async (req, res) => { res.json(await V.tripDetail(sid(req), req.params.id)); });
exports.generate = wrap('tp.generate', async (req, res) => { const d = body(req).date; const t = await S.today(sid(req)); const date = E.isDay(d) ? d : t; if (date < t) throw new Fail(422, 'Trips are made for today or a later day.'); if (date > E.addDays(t, 14)) throw new Fail(422, 'Trips can be made up to 14 days ahead.'); const r = await T.makeTrips(sid(req), date); await A(req, 'transport.trips.make', date, `${r.made} made`); res.json(r); });
exports.cancelTrip = wrap('tp.cancelTrip', async (req, res) => { const t = await T.cancelTrip(ctxOf(req), req.params.id, body(req).reason); await A(req, 'transport.trip.cancel', req.params.id, body(req).reason); res.json(t); });
exports.reassign = wrap('tp.reassign', async (req, res) => { const t = await T.reassign(ctxOf(req), req.params.id, body(req)); await A(req, 'transport.trip.reassign', req.params.id, body(req).reason || ''); res.json(t); });
exports.addRider = wrap('tp.addRider', async (req, res) => { const r = await T.addRider(ctxOf(req), req.params.id, body(req)); await A(req, 'transport.trip.addRider', req.params.id, body(req).studentId); res.status(201).json(r); });
exports.op = wrap('tp.op', async (req, res) => { const r = await T.applyOp(staffCtx(req), req.params.id, body(req)); await A(req, `transport.trip.${body(req).type}`, req.params.id); res.json(r); });
exports.exceptions = wrap('tp.exceptions', async (req, res) => {
  const f = { schoolId: sid(req), 'exception.kind': { $nin: ['', null] } }; if (req.query.status === 'settled') f['exception.resolved'] = true; else f['exception.resolved'] = false;
  const rows = await TpBoard.find(f).sort({ updatedAt: -1 }).limit(100); const trips = new Map((await TpTrip.find({ _id: { $in: rows.map((r) => r.tripId) } }).select('date routeName direction status')).map((t) => [String(t._id), t]));
  res.json({ rows: rows.map((r) => ({ _id: r._id, tripId: r.tripId, studentId: r.studentId, studentName: r.studentName, className: r.className, state: r.state, stopName: r.stopName, exception: r.exception, trip: trips.get(String(r.tripId)) || null })) });
});
exports.resolveException = wrap('tp.resolveException', async (req, res) => { const r = await T.resolveException(ctxOf(req), req.params.id, body(req)); await A(req, 'transport.exception.resolve', req.params.id, body(req).resolution); res.json(r); });
exports.incidents = wrap('tp.incidents', async (req, res) => { res.json(await F.listIncidents(sid(req), req.query)); });
exports.reportIncident = wrap('tp.reportIncident', async (req, res) => { const r = await F.reportIncident(ctxOf(req), body(req)); await A(req, 'transport.incident.report', id(r), r.incidentNo); res.status(201).json(r); });
exports.updateIncident = wrap('tp.updateIncident', async (req, res) => { const r = await F.updateIncident(ctxOf(req), req.params.id, body(req)); await A(req, `transport.incident.${body(req).action}`, req.params.id); res.json(r); });

/* ───────── vehicles, drivers, routes, riders, inspections ───────── */
exports.vehicles = wrap('tp.vehicles', async (req, res) => { res.json(await F.listVehicles(sid(req))); });
exports.createVehicle = wrap('tp.createVehicle', async (req, res) => { const v = await F.createVehicle(ctxOf(req), body(req)); await A(req, 'transport.vehicle.create', id(v), v.plate); res.status(201).json(v); });
exports.updateVehicle = wrap('tp.updateVehicle', async (req, res) => { const v = await F.updateVehicle(ctxOf(req), req.params.id, body(req)); await A(req, 'transport.vehicle.update', req.params.id); res.json(v); });
exports.drivers = wrap('tp.drivers', async (req, res) => { res.json(await F.listDrivers(sid(req))); });
exports.createDriver = wrap('tp.createDriver', async (req, res) => { const r = await F.createDriver(ctxOf(req), body(req)); await A(req, 'transport.driver.create', id(r.driver), r.driver.name); res.status(201).json(r); });
exports.updateDriver = wrap('tp.updateDriver', async (req, res) => { const d = await F.updateDriver(ctxOf(req), req.params.id, body(req)); await A(req, 'transport.driver.update', req.params.id, body(req).status || ''); res.json(d); });
exports.driverKey = wrap('tp.driverKey', async (req, res) => { const r = await F.rotateKey(ctxOf(req), req.params.id); await A(req, 'transport.driver.key', req.params.id); res.json(r); });
exports.routes = wrap('tp.routes', async (req, res) => { res.json(await F.listRoutes(sid(req))); });
exports.createRoute = wrap('tp.createRoute', async (req, res) => { const r = await F.createRoute(ctxOf(req), body(req)); await A(req, 'transport.route.create', id(r), r.name); res.status(201).json(r); });
exports.saveStops = wrap('tp.saveStops', async (req, res) => { const r = await F.saveStops(ctxOf(req), req.params.id, body(req)); await A(req, 'transport.stops.save', req.params.id, `${r.length} stops`); res.json(r); });
exports.savePlan = wrap('tp.savePlan', async (req, res) => { const r = await F.savePlan(ctxOf(req), body(req)); await A(req, 'transport.plan.save', id(r.plan), `${r.plan.direction}`); res.json(r); });
exports.students = wrap('tp.students', async (req, res) => { res.json(await F.searchStudents(sid(req), req.query)); });
exports.riders = wrap('tp.riders', async (req, res) => { res.json(await F.listRiders(sid(req), req.query)); });
exports.assignRiders = wrap('tp.assignRiders', async (req, res) => { const r = await F.assignRiders(ctxOf(req), body(req)); await A(req, 'transport.riders.assign', String(body(req).routeId), `${r.assigned}`); res.json(r); });
exports.updateRider = wrap('tp.updateRider', async (req, res) => { const r = await F.updateRider(ctxOf(req), req.params.studentId, body(req)); await A(req, 'transport.rider.update', req.params.studentId); res.json(r); });
exports.removeRider = wrap('tp.removeRider', async (req, res) => { const r = await F.removeRider(ctxOf(req), req.params.studentId); await A(req, 'transport.rider.remove', req.params.studentId, String(body(req).reason || '').slice(0, 200)); res.json(r); });
exports.inspections = wrap('tp.inspections', async (req, res) => { res.json(await F.listInspections(sid(req), req.query)); });
exports.createInspection = wrap('tp.createInspection', async (req, res) => { const r = await F.createInspection(ctxOf(req), body(req)); await A(req, 'transport.inspection.create', id(r.inspection), r.inspection.result); res.status(201).json(r); });

/* ───────── reports ───────── */
const cell = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
const csv = (rows) => rows.map((r) => r.map((v) => `"${cell(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
const REPORTS = {
  punctuality: async (s, q) => { const d = await V.punctuality(s, q); return { json: d, csv: [['Route', 'Run', 'Trips', 'Measured', 'On time %', 'Average delay (min)', 'Worst delay (min)', 'Children not accounted for'], ...d.rows.map((r) => [r.route, r.direction, r.trips, r.measured, r.onTimePct ?? '', r.avgDelay ?? '', r.maxDelay, r.unreconciled])] }; },
  ridership: async (s, q) => { const d = await V.ridership(s, q); return { json: d, csv: [['Route', 'Run', 'Trips', 'Children carried', 'Average per trip', 'Seats', 'Fill %', 'Did not board', 'Not riding', 'Exceptions'], ...d.rows.map((r) => [r.route, r.direction, r.trips, r.boarded, r.avgRiders, r.seats, r.fillPct ?? '', r.noShow, r.optedOut, r.exceptions])] }; },
  exceptions: async (s, q) => { const d = await V.exceptionsReport(s, q); return { json: d, csv: [['Date', 'Route', 'Run', 'Child', 'Class', 'What', 'Note', 'Settled', 'How', 'By'], ...d.rows.map((r) => [r.date, r.route, r.direction, r.student, r.className, r.kind, r.note, r.settled ? 'yes' : 'no', r.resolution, r.by])] }; },
};
exports.report = wrap('tp.report', async (req, res) => { const r = REPORTS[req.params.name]; if (!r) throw new Fail(404, 'There is no such report.'); const out = await r(sid(req), req.query); if (req.query.format === 'csv') { res.set('Content-Type', 'text/csv; charset=utf-8'); res.set('Content-Disposition', `attachment; filename="transport-${req.params.name}.csv"`); return res.send(csv(out.csv)); } res.json(out.json); });
exports.sweepNow = wrap('tp.sweep', async (req, res) => { res.json(await V.sweep(sid(req))); });

/* ───────── driver page (signed in with the driver's own key) ───────── */
exports.driverMe = wrap('tp.driverMe', async (req, res) => { res.json(await V.driverToday(req.driver)); });
exports.driverTrip = wrap('tp.driverTrip', async (req, res) => { res.json(await V.driverTrip(req.driver, req.params.id)); });
exports.driverOp = wrap('tp.driverOp', async (req, res) => { const d = req.driver; res.json(await T.applyOp({ schoolId: d.schoolId, byKind: 'driver', byName: d.name, byId: d._id, driver: d }, req.params.id, body(req))); });
exports.driverSync = wrap('tp.driverSync', async (req, res) => { if (!Array.isArray(body(req).ops) || !body(req).ops.length) throw new Fail(400, 'Send at least one action.'); res.json(await V.driverSync(req.driver, body(req).ops)); });

/* ───────── families ───────── */
exports.myChildren = wrap('tp.myChildren', async (req, res) => {
  const schoolId = sid(req);
  if (req.user.role === 'student') { const a = await TransportAssignment.findOne({ schoolId, studentId: req.user.userId }); return res.json([{ _id: req.user.userId, rider: !!a }]); }
  const p = await Parent.findOne({ _id: req.user.userId, schoolId }).select('children'); const kids = await Student.find({ schoolId, _id: { $in: p?.children || [] } }).select('name');
  const rights = await GR.resolveForParent(schoolId, p, kids.map((k) => k._id)); const as = await TransportAssignment.find({ schoolId, studentId: { $in: kids.map((k) => k._id) } }).select('studentId routeId');
  const routes = new Map((await TransportRoute.find({ schoolId }).select('name')).map((r) => [String(r._id), r.name]));
  res.json(kids.filter((k) => rights.get(String(k._id))?.rights?.viewInfo).map((k) => { const a = as.find((x) => String(x.studentId) === String(k._id)); return { _id: k._id, name: k.name, rider: !!a, routeName: a ? routes.get(String(a.routeId)) || '' : '' }; }));
});
const me = (req) => ({ ...req.user, name: req.actorName || '' });
exports.myView = wrap('tp.myView', async (req, res) => { res.json(await V.myView(me(req), req.query.childId)); });
exports.myLive = wrap('tp.myLive', async (req, res) => { res.json(await V.myLive(me(req), req.query.childId)); });
exports.mySkip = wrap('tp.mySkip', async (req, res) => { const r = await V.skip(me(req), body(req)); await A(req, 'transport.family.skip', id(r), r.date); res.status(201).json(r); });
exports.myUnskip = wrap('tp.myUnskip', async (req, res) => { res.json(await V.unskip(me(req), req.params.id)); });
exports.myConcern = wrap('tp.myConcern', async (req, res) => { const r = await V.concern(me(req), body(req)); await A(req, 'transport.family.concern', r.incidentNo); res.status(201).json(r); });
