// Gate, visitors, contractors, gate log, logbook and handover, dismissal and pickup, emergency assembly (E09).
module.exports = async ({ call, expect, log, tokens }) => {
  const School = require('../models/School'); const Teacher = require('../models/Teacher'); const Class = require('../models/Class'); const Student = require('../models/Student'); const Parent = require('../models/Parent'); const User = require('../models/User');
  const Notification = require('../models/Notification'); const AuditLog = require('../models/AuditLog'); const AppSetting = require('../models/AppSetting'); const Daily = require('../models/DailyAttendance');
  const GuardianLink = require('../models/GuardianLink'); const Restriction = require('../models/ContactRestriction'); const Visit = require('../models/VisitorVisit'); const Pass = require('../models/ContractorPass');
  const GateEntry = require('../models/GateEntry'); const LogItem = require('../models/GateLogItem'); const Handover = require('../models/GateHandover'); const PAuth = require('../models/PickupAuthorization'); const PEvent = require('../models/PickupEvent');
  const Drill = require('../models/SafetyDrill'); const Muster = require('../models/MusterRecord'); const Device = require('../models/AttendanceDevice'); const History = require('../models/AttendanceHistory');
  const { hashPassword } = require('../utils/password'); const { nowInTz } = require('../utils/time'); const S = require('../utils/safety'); const AO = require('../utils/attendanceOps');
  const { generateAccessToken } = require('../utils/jwt');
  console.log('\n— Gate, visitors and dismissal —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id); const clock = nowInTz(school.timezone || process.env.DEFAULT_TIMEZONE || 'UTC'); const today = clock.dateKey;
  const tokFor = (doc, role) => generateAccessToken(String(doc._id), sid, role);
  const A = tokens.admin; const T = tokens.teacher;
  const sara = await Teacher.findOne({ schoolId: sid, email: 'sara.khan@demo.school' }); const otherT = (await Teacher.find({ schoolId: sid, _id: { $ne: sara._id } }))[0];
  let adm2 = await User.findOne({ schoolId: sid, email: 'second@demo.school' }); if (!adm2) adm2 = await User.create({ schoolId: sid, name: 'Second Admin', email: 'second@demo.school', password: await hashPassword('Admin@1234'), role: 'admin' });
  const admin1 = await User.findOne({ schoolId: sid, email: 'admin@demo.school' }); const A2 = tokFor(adm2, 'admin'); const OT = tokFor(otherT, 'teacher');
  const plusMin = (m) => new Date(Date.now() + m * 60000).toISOString();
  await AppSetting.deleteOne({ key: `safety:${sid}` });

  // ── fixtures: class 77-G headed by Sara, six students, two parents ──
  await Class.deleteMany({ schoolId: sid, standard: '77' });
  const cls = await Class.create({ schoolId: sid, standard: '77', division: 'G', capacity: 30, room: 'Room 77', academicYear: '2026-2027', classTeacherId: sara._id }); const cid = String(cls._id);
  const pw = await hashPassword('Student@123'); const kids = [];
  for (let i = 1; i <= 6; i++) kids.push(await Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: `Gate Kid ${i}`, email: `gatekid${i}@demo.school`, password: pw, classId: cls._id, rollNumber: `G${i}`, studentId: `GK${i}`, isActive: true }));
  const [k1, k2, k3, k4] = kids;
  const pa = await Parent.create({ schoolId: sid, name: 'Gate Parent One', email: 'gateparent1@demo.school', password: await hashPassword('Parent@123'), phone: '0300-1111111', children: [k1._id, k3._id] });
  const pb = await Parent.create({ schoolId: sid, name: 'Gate Parent Two', email: 'gateparent2@demo.school', password: await hashPassword('Parent@123'), phone: '0300-2222222', children: [k2._id] });
  await GuardianLink.create({ schoolId: sid, studentId: k1._id, parentId: pa._id, relationship: 'Father', isPrimary: true, rights: { viewInfo: true, viewAttendance: true, viewMarks: true, viewFees: true, payFees: true, receiveNotices: true, receiveMessages: true, pickup: true } });
  await GuardianLink.create({ schoolId: sid, studentId: k3._id, parentId: pa._id, relationship: 'Father', rights: { viewInfo: true, viewAttendance: true, viewMarks: true, viewFees: true, payFees: true, receiveNotices: true, receiveMessages: true, pickup: false } });
  await GuardianLink.create({ schoolId: sid, studentId: k1._id, personName: 'Driver Salim', relationship: 'Driver', phone: '0301', rights: { viewInfo: false, viewAttendance: false, viewMarks: false, viewFees: false, payFees: false, receiveNotices: false, receiveMessages: false, pickup: true } });
  await Restriction.create({ schoolId: sid, studentId: k1._id, personName: 'Banned Uncle', type: 'no-pickup', reason: 'Court order 77/2026' });
  await Restriction.create({ schoolId: sid, studentId: k1._id, personName: 'Barred Visitor', type: 'no-access', reason: 'Safety plan' });
  const PA = tokFor(pa, 'parent'); const PB = tokFor(pb, 'parent'); const S1 = tokFor(k1, 'student');
  const mark = async (stu, status, extra = {}) => Daily.updateOne({ studentId: stu._id, date: clock.dateUTC }, { $set: { schoolId: sid, classId: cls._id, status, ...extra } }, { upsert: true });
  await mark(k1, 'Present'); await mark(k2, 'Present'); await mark(k3, 'Absent'); await mark(k4, 'Present'); await mark(kids[4], 'Present'); await mark(kids[5], 'Present');

  // ── policy and access ──
  await expect('unauthenticated refused', call('GET', '/safety/overview', null), [401]);
  await expect('a teacher not on gate duty cannot open the desk', call('GET', '/safety/overview', T), [403]);
  await expect('a parent cannot open the desk', call('GET', '/safety/overview', PA), [403]);
  await expect('a teacher cannot read the safety policy', call('GET', '/safety/settings', T), [403]);
  const def = (await expect('admin reads the policy', call('GET', '/safety/settings', A))).data.settings;
  log(def.requireId === true && def.idRetentionDays === 30 && def.gates.length === 1, 'defaults: ID check on, 30-day ID retention, one gate');
  await expect('a silly gate list is refused', call('PUT', '/safety/settings', A, { gates: ['Main', 'main'] }), [400]);
  await expect('a retention above a year is refused', call('PUT', '/safety/settings', A, { idRetentionDays: 400 }), [400]);
  await expect('two gates are accepted', call('PUT', '/safety/settings', A, { gates: ['Main gate', 'Back gate'] }));
  const grant = await expect('a teacher is given gate duty for a day', call('POST', '/permissions/grants', A, { granteeId: String(sara._id), granteeRole: 'teacher', action: 'safety.gate.operate', validTo: new Date(Date.now() + 86400000).toISOString(), reason: 'Gate duty this week' }), [201]);
  log((await call('GET', '/safety/overview', T)).status === 200, 'with the grant the teacher can open the desk');
  await expect('another teacher still cannot', call('GET', '/safety/overview', OT), [403]);

  // ── visitors: invitation, approval, check-in ──
  const v1 = await expect('a teacher invites a guest (host is the teacher)', call('POST', '/safety/visits', T, { visitorName: 'Mr Guest', phone: '0345', kind: 'Guest', purpose: 'Book fair', expectedFrom: plusMin(-5), expectedTo: plusMin(120) }), [201]);
  log(v1.data.visit.status === 'Approved' && /^AUL-V\.[a-f0-9]{24}\./.test(v1.data.inviteCode), 'a host who arranges their own visit needs no further approval and gets a code');
  const stored = await Visit.findById(v1.data.visit._id); log(stored.tokenHash && !stored.tokenHash.includes(v1.data.inviteCode.split('.')[2]) && stored.tokenHash.length === 64, 'only a hash of the code is stored');
  await expect('a visit that ends before it starts is refused', call('POST', '/safety/visits', T, { visitorName: 'X Y', purpose: 'test', expectedFrom: plusMin(60), expectedTo: plusMin(30) }), [400]);
  await expect('a visit longer than a day is refused', call('POST', '/safety/visits', T, { visitorName: 'X Y', purpose: 'test', expectedFrom: plusMin(0), expectedTo: plusMin(60 * 30) }), [400]);
  await expect('a visit needs a purpose', call('POST', '/safety/visits', T, { visitorName: 'X Y', purpose: '', expectedFrom: plusMin(0), expectedTo: plusMin(30) }), [400]);
  await expect('someone barred from campus cannot even be invited', call('POST', '/safety/visits', T, { visitorName: 'barred visitor', purpose: 'Meeting', expectedFrom: plusMin(0), expectedTo: plusMin(30) }), [403]);
  const rot = (await expect('a fresh code replaces the old one', call('POST', `/safety/visits/${v1.data.visit._id}/invite`, T, {}))).data;
  const old = await call('POST', '/safety/scan/lookup', A, { code: v1.data.inviteCode }); log(old.status === 422, 'the earlier code stops working');
  const lk = (await expect('the desk looks up the new code', call('POST', '/safety/scan/lookup', A, { code: rot.inviteCode }))).data; log(lk.type === 'visitor' && lk.valid && lk.next === 'check-in', 'lookup says valid, ready to check in');
  await expect('an unrelated person cannot invite for the guest', call('POST', `/safety/visits/${v1.data.visit._id}/invite`, OT, {}), [404]);
  await expect('check-in needs the ID checked', call('POST', `/safety/visits/${v1.data.visit._id}/check-in`, A, { method: 'qr', code: rot.inviteCode }), [422]);
  await expect('check-in with a wrong code is refused', call('POST', `/safety/visits/${v1.data.visit._id}/check-in`, A, { method: 'qr', code: rot.inviteCode.slice(0, -2) + 'zz', idChecked: true, idType: 'CNIC', idNumber: '3520212345671', purposeConfirmed: true }), [422]);
  await expect('a parent cannot check a visitor in', call('POST', `/safety/visits/${v1.data.visit._id}/check-in`, PA, {}), [403]);
  const ci = await expect('the desk checks the guest in', call('POST', `/safety/visits/${v1.data.visit._id}/check-in`, A, { method: 'qr', code: rot.inviteCode, idChecked: true, idType: 'CNIC', idNumber: '3520212345671', purposeConfirmed: true, gate: 'Back gate' }));
  log(ci.data.visit.status === 'CheckedIn' && ci.data.visit.idLast4 === '5671' && /^V-\d{4}-001$/.test(ci.data.visit.badge.number) && ci.data.visit.gate === 'Back gate', 'checked in with a numbered badge and the right gate');
  const raw = await Visit.findById(v1.data.visit._id); log(!JSON.stringify(raw.toObject()).includes('3520212345671') && raw.tokenHash === '', 'the full ID number is never kept and the code is used up');
  await expect('a second check-in is refused', call('POST', `/safety/visits/${v1.data.visit._id}/check-in`, A, { method: 'manual', manualReason: 'again' }), [409]);
  const bd = (await expect('the badge is printed', call('GET', `/safety/visits/${v1.data.visit._id}/badge`, A))).data.badge;
  log(bd.hostName && bd.zones.includes('Reception') && !JSON.stringify(bd).match(/5671|0345|Book fair/), 'the badge shows site, host, areas and expiry but no ID, phone or purpose');
  log((await call('GET', `/safety/visits/${v1.data.visit._id}/badge`, A)).data.badge.reprint === true, 'a second print is marked as a reprint');
  log(!!(await GateEntry.findOne({ subjectId: v1.data.visit._id, direction: 'in', method: 'qr', gate: 'Back gate' })), 'the arrival is in the gate log');
  log(!!(await Notification.findOne({ userId: sara._id, key: `visitin:${v1.data.visit._id}` })), 'the host is told when their guest arrives');

  // parent asks to meet the class teacher; host decides; creator cannot approve own request
  await expect('a parent cannot invite for a child that is not theirs', call('POST', '/safety/visits', PB, { visitorName: 'x', purpose: 'Meeting', studentId: String(k1._id), expectedFrom: plusMin(10), expectedTo: plusMin(60) }), [404]);
  await expect('a parent can only ask for the class teacher or the office', call('POST', '/safety/visits', PA, { purpose: 'Meeting', studentId: String(k1._id), hostType: 'teacher', hostId: String(otherT._id), expectedFrom: plusMin(10), expectedTo: plusMin(60) }), [422]);
  const v2 = await expect('a parent asks to meet the class teacher', call('POST', '/safety/visits', PA, { purpose: 'Progress meeting', studentId: String(k1._id), hostType: 'teacher', hostId: String(sara._id), expectedFrom: plusMin(-5), expectedTo: plusMin(60) }), [201]);
  log(v2.data.visit.status === 'Requested' && !v2.data.inviteCode, 'it waits for the host, with no code yet');
  log(!!(await Notification.findOne({ userId: sara._id, key: `visitreq:${v2.data.visit._id}` })), 'the teacher is asked to approve');
  await expect('the parent cannot approve their own request', call('POST', `/safety/visits/${v2.data.visit._id}/decide`, PA, { decision: 'approve' }), [403]);
  await expect('another teacher cannot decide it', call('POST', `/safety/visits/${v2.data.visit._id}/decide`, OT, { decision: 'approve' }), [404]);
  await expect('check-in before approval is refused', call('POST', `/safety/visits/${v2.data.visit._id}/check-in`, A, { method: 'manual', manualReason: 'here now' }), [422]);
  await expect('the class teacher approves', call('POST', `/safety/visits/${v2.data.visit._id}/decide`, T, { decision: 'approve', note: 'See you then' }));
  await expect('it cannot be decided twice', call('POST', `/safety/visits/${v2.data.visit._id}/decide`, T, { decision: 'decline' }), [409]);
  log(!!(await Notification.findOne({ userId: pa._id, key: `visitdec:${v2.data.visit._id}` })), 'the parent is told');
  const pinv = (await expect('the parent opens the invitation', call('POST', `/safety/visits/${v2.data.visit._id}/invite`, PA, {}))).data; log(!!pinv.inviteCode, 'and receives the code');
  await expect('manual check-in needs a reason', call('POST', `/safety/visits/${v2.data.visit._id}/check-in`, A, { method: 'manual', idChecked: true, idType: 'CNIC', idNumber: '1234567890123', purposeConfirmed: true }), [400]);
  await expect('the visitor must show an ID type from the list', call('POST', `/safety/visits/${v2.data.visit._id}/check-in`, A, { method: 'manual', manualReason: 'lost invitation', idChecked: true, idType: 'Library card', idNumber: '1234567890123', purposeConfirmed: true }), [422]);
  const ci2 = await expect('checked in by hand with a reason', call('POST', `/safety/visits/${v2.data.visit._id}/check-in`, A, { method: 'manual', manualReason: 'Parent lost the invitation', idChecked: true, idType: 'CNIC', idNumber: '1234567890123', purposeConfirmed: true }));
  log(ci2.data.visit.checkInMethod === 'manual' && ci2.data.visit.manualReason.includes('lost') && /-002$/.test(ci2.data.visit.badge.number), 'by-hand check-ins keep the reason; badge numbers run on');
  log(!!(await Notification.findOne({ userId: sara._id, key: `visitin:${v2.data.visit._id}` })), 'the host is told their visitor arrived');
  const mine = (await call('GET', '/safety/visits', PA)).data.visits; log(mine.length === 1 && mine[0].phone !== undefined && mine[0].idLast4 === undefined, 'a parent sees only their own visit and no ID details');
  const hosted = (await call('GET', '/safety/visits', OT)).data.visits; log(hosted.length === 0, 'a teacher sees only visits they host or arranged');
  await expect('another family cannot read the visit', call('GET', `/safety/visits/${v2.data.visit._id}`, PB), [404]);

  // walk-ins and reception override
  const w = await expect('reception registers a walk-in', call('POST', '/safety/visits', A, { visitorName: 'Walk In Vendor', kind: 'Vendor', purpose: 'Delivery of chairs', walkIn: true }), [201]);
  log(w.data.visit.status === 'Requested' && w.data.visit.walkIn, 'a walk-in waits for the host');
  await expect('reception cannot approve their own walk-in without a reason', call('POST', `/safety/visits/${w.data.visit._id}/decide`, A, { decision: 'approve' }), [403]);
  await expect('the override needs a written reason', call('POST', `/safety/visits/${w.data.visit._id}/decide`, A, { decision: 'approve', override: true, note: 'ok' }), [403]);
  await expect('a different administrator can approve normally', call('POST', `/safety/visits/${w.data.visit._id}/decide`, A2, { decision: 'approve' }));
  const w2 = await expect('a second walk-in', call('POST', '/safety/visits', A, { visitorName: 'Second Walker', purpose: 'Looking for the accounts office', walkIn: true }), [201]);
  await expect('reception approves with a written reason', call('POST', `/safety/visits/${w2.data.visit._id}/decide`, A, { decision: 'approve', override: true, note: 'Host is in class, principal agreed by phone' }));
  const ov = await Visit.findById(w2.data.visit._id); log(ov.receptionOverride === true && ov.overrideReason.includes('principal'), 'the override and its reason are recorded');
  log(!!(await Notification.findOne({ userId: adm2._id, key: `visitovr:${w2.data.visit._id}` })), 'the other administrators are told of the override');
  const v3 = await expect('a vendor visit starting in two hours', call('POST', '/safety/visits', A, { visitorName: 'Later Vendor', kind: 'Vendor', purpose: 'Printer service', hostType: 'admin', hostId: String(admin1._id), expectedFrom: plusMin(120), expectedTo: plusMin(180) }), [201]);
  log(v3.data.visit.status === 'Approved', 'an administrator hosting their own visit is approved at once');
  await expect('check-in long before the window is refused', call('POST', `/safety/visits/${v3.data.visit._id}/check-in`, A, { method: 'manual', manualReason: 'early', idChecked: true, idType: 'CNIC', idNumber: '1111222233334', purposeConfirmed: true }), [422]);
  await expect('the host can cancel before arrival', call('POST', `/safety/visits/${v3.data.visit._id}/cancel`, A, {}));
  await expect('a cancelled visit stays cancelled', call('POST', `/safety/visits/${v3.data.visit._id}/cancel`, A, {}), [409]);

  // barred person at the desk
  const bv = await Visit.create({ schoolId: sid, visitorName: 'BARRED  visitor', purpose: 'Meeting', kind: 'Guest', hostType: 'office', hostName: 'School office', expectedFrom: new Date(Date.now() - 60000), expectedTo: new Date(Date.now() + 3600000), status: 'Approved', createdById: admin1._id, createdByRole: 'admin' });
  const bz = await call('POST', `/safety/visits/${bv._id}/check-in`, A, { method: 'manual', manualReason: 'walked in', idChecked: true, idType: 'CNIC', idNumber: '9999888877776', purposeConfirmed: true });
  log(bz.status === 403 && !/restrict|court|order|plan|safety/i.test(JSON.stringify(bz.data)), 'a person barred from campus is refused with no explanation');
  log((await Visit.findById(bv._id)).status === 'Refused' && !!(await GateEntry.findOne({ subjectId: bv._id, allowed: false, denyReason: 'restricted' })), 'the refusal is in the gate log');
  log(!!(await Notification.findOne({ userId: adm2._id, key: `barred:${bv._id}` })), 'administrators are told');

  // check out, overstay, redaction
  await expect('the desk checks the guest out', call('POST', `/safety/visits/${v1.data.visit._id}/check-out`, A, {}));
  await expect('a second check-out is refused', call('POST', `/safety/visits/${v1.data.visit._id}/check-out`, A, {}), [409]);
  await Visit.updateOne({ _id: v2.data.visit._id }, { $set: { checkInAt: new Date(Date.now() - 10 * 3600000) } });
  const ov1 = (await expect('overview flags a visitor who stayed too long', call('GET', '/safety/overview', A))).data;
  log(ov1.findings.some((f) => f.kind === 'Overstay') && ov1.counts.visitorsInside === 1, 'overstay finding and count of people inside');
  log(!!(await Notification.findOne({ userId: admin1._id, key: `overstay:${v2.data.visit._id}` })), 'administrators are told once');
  await Visit.updateOne({ _id: v1.data.visit._id }, { $set: { createdAt: new Date(Date.now() - 40 * 86400000) } });
  const hk = (await call('GET', '/safety/overview', A)).data.housekeeping;
  const wiped = await Visit.findById(v1.data.visit._id); log(wiped.idLast4 === '' && wiped.idType === '' && !!wiped.idRedactedAt, 'ID details are wiped after the retention period');
  await expect('the second visitor leaves', call('POST', `/safety/visits/${v2.data.visit._id}/check-out`, A, {}));

  // ── contractors ──
  const pbody = { company: 'SafeGuard Security', personName: 'Guard Hamid', phone: '0300', purpose: 'Night patrol', validFrom: plusMin(-10), validTo: plusMin(240), gates: ['Main gate'] };
  await expect('a teacher cannot create a contractor pass', call('POST', '/safety/contractors', T, pbody), [403]);
  await expect('a shift longer than the limit is refused', call('POST', '/safety/contractors', A, { ...pbody, validTo: plusMin(60 * 20) }), [422]);
  await expect('a gate outside the list is refused', call('POST', '/safety/contractors', A, { ...pbody, gates: ['Roof'] }), [400]);
  const cp = await expect('admin creates a contractor pass', call('POST', '/safety/contractors', A, pbody), [201]);
  await expect('the creator cannot approve it', call('POST', `/safety/contractors/${cp.data.pass._id}/decide`, A, { decision: 'approve' }), [403]);
  await expect('no entry before approval', call('POST', `/safety/contractors/${cp.data.pass._id}/move`, A, { direction: 'in', gate: 'Main gate' }), [403]);
  await expect('a different administrator approves', call('POST', `/safety/contractors/${cp.data.pass._id}/decide`, A2, { decision: 'approve' }));
  const cc = (await expect('a code is issued', call('POST', `/safety/contractors/${cp.data.pass._id}/credential`, A2, {}))).data;
  log(/^AUL-C\./.test(cc.code), 'it is a contractor code');
  const clk = (await call('POST', '/safety/scan/lookup', A, { code: cc.code })).data; log(clk.type === 'contractor' && clk.valid && clk.next === 'in', 'lookup recognises it');
  const wg = await call('POST', `/safety/contractors/${cp.data.pass._id}/move`, A, { direction: 'in', gate: 'Back gate' }); log(wg.status === 403 && wg.data.code === 'wrong-gate', 'the wrong gate is refused');
  await expect('the right gate admits', call('POST', `/safety/contractors/${cp.data.pass._id}/move`, A, { direction: 'in', gate: 'Main gate', code: cc.code }));
  await expect('already inside is refused', call('POST', `/safety/contractors/${cp.data.pass._id}/move`, A, { direction: 'in', gate: 'Main gate' }), [403]);
  log((await GateEntry.countDocuments({ subjectId: cp.data.pass._id })) === 4, 'every attempt, allowed or not, is in the gate log');
  await Pass.updateOne({ _id: cp.data.pass._id }, { $set: { validTo: new Date(Date.now() - 60000) } });
  const ov2 = (await call('GET', '/safety/overview', A)).data; log(ov2.findings.some((f) => f.kind === 'ContractorOverstay') && ov2.counts.contractorsInside === 1, 'a contractor inside after the pass ended is a finding');
  await expect('leaving is always allowed, even after expiry', call('POST', `/safety/contractors/${cp.data.pass._id}/move`, A, { direction: 'out', gate: 'Main gate' }));
  const ex = await call('POST', `/safety/contractors/${cp.data.pass._id}/move`, A, { direction: 'in', gate: 'Main gate' }); log(ex.status === 403 && ex.data.code === 'expired', 'an expired pass cannot enter again');
  const rv = await expect('a pass is withdrawn with a reason', call('POST', `/safety/contractors/${cp.data.pass._id}/revoke`, A2, { reason: 'Contract ended early' })); log(rv.data.pass.status === 'Revoked', 'withdrawn');
  await expect('a withdrawn pass cannot be revoked again', call('POST', `/safety/contractors/${cp.data.pass._id}/revoke`, A2, { reason: 'again again' }), [409]);
  // reader restrictions
  const dvA = (await call('POST', '/attendance-ops/devices', A, { name: 'Contractor reader', kind: 'gate', location: 'Side' })).data; const dvB = (await call('POST', '/attendance-ops/devices', A, { name: 'Other reader', kind: 'gate', location: 'Front' })).data;
  const cp2 = (await call('POST', '/safety/contractors', A, { company: 'CleanCo', personName: 'Cleaner Bilal', purpose: 'Deep clean', validFrom: plusMin(-5), validTo: plusMin(120), deviceIds: [dvA.device._id] })).data.pass;
  await call('POST', `/safety/contractors/${cp2._id}/decide`, A2, { decision: 'approve' }); const cc2 = (await call('POST', `/safety/contractors/${cp2._id}/credential`, A2, {})).data.code;
  const scan = (dv, code, direction = 'in') => call('POST', '/safety/device/scan', null, { code, direction, gate: 'Main gate' }, { 'X-Device-Id': dv.device._id, 'X-Device-Key': dv.key });
  const sB = await scan(dvB, cc2); log(sB.status === 403 && sB.data.code === 'wrong-device', 'a reader the pass is not tied to refuses it');
  const sA = await scan(dvA, cc2); log(sA.status === 200 && sA.data.allowed === true, 'the named reader admits');
  await expect('a reader needs its key', call('POST', '/safety/device/scan', null, { code: cc2 }, { 'X-Device-Id': dvA.device._id, 'X-Device-Key': 'wrong' }), [401]);
  const junk = await scan(dvA, 'not-a-code'); log(junk.status === 403, 'a reader refuses codes it does not know');
  const vin = (await call('POST', '/safety/visits', T, { visitorName: 'Reader Guest', purpose: 'Meeting', expectedFrom: plusMin(-5), expectedTo: plusMin(90) })).data;
  const needs = await scan(dvA, vin.inviteCode); log(needs.status === 202 && needs.data.code === 'needs-desk', 'a visitor arriving at a reader is sent to the desk for the ID check');
  log((await Visit.findById(vin.visit._id)).status === 'Approved', 'a reader never admits a visitor by itself');
  await expect('the contractor leaves through the reader', scan(dvA, cc2, 'out'));
  await call('POST', `/safety/contractors/${cp2._id}/revoke`, A2, { reason: 'Finished early' });

  // ── gate log ──
  await expect('a hand-written entry needs a reason', call('POST', '/safety/gate-log', A, { subjectKind: 'student', subjectId: String(k2._id), direction: 'in' }), [400]);
  await expect('and a person', call('POST', '/safety/gate-log', A, { subjectKind: 'other', direction: 'in', manualReason: 'reader is off' }), [400]);
  const me1 = await expect('a student is written in by hand', call('POST', '/safety/gate-log', T, { subjectKind: 'student', subjectId: String(k2._id), direction: 'in', manualReason: 'Reader is offline' }), [201]);
  log(me1.data.entry.subjectName === 'Gate Kid 2' && me1.data.entry.method === 'manual', 'name comes from the record, method is manual');
  const gl = (await expect('the gate log lists by method', call('GET', '/safety/gate-log?method=manual&kind=student', A))).data; log(gl.entries.length >= 1 && gl.entries.every((e) => e.method === 'manual'), 'filters work');
  const denied = (await call('GET', '/safety/gate-log?allowed=false', A)).data.entries; log(denied.length >= 4 && denied.every((e) => e.allowed === false), 'refused attempts can be listed on their own');
  log(!(await Daily.findOne({ studentId: k2._id, date: clock.dateUTC, status: { $ne: 'Present' } })), 'gate entries never change classroom attendance');
  await expect('a parent cannot read the gate log', call('GET', '/safety/gate-log', PA), [403]);

  // ── guard logbook and handover ──
  const it1 = (await expect('a gate incident is written down', call('POST', '/safety/logbook', A, { kind: 'Incident', severity: 'High', text: 'Stranger photographed the gate from a car', gate: 'Main gate' }), [201])).data.item;
  await call('POST', '/safety/logbook', A, { kind: 'Action', severity: 'Low', text: 'Replace torn visitor sign' }); await call('POST', '/safety/logbook', A, { kind: 'Note', text: 'Delivery van came at 9' });
  log(!!(await Notification.findOne({ userId: adm2._id, key: `gateinc:${it1._id}` })), 'a high severity incident reaches the other administrators');
  await expect('a logbook line needs words', call('POST', '/safety/logbook', A, { kind: 'Note', text: '' }), [400]);
  const open = (await call('GET', '/safety/logbook?status=Open', A)).data.items; log(open.length === 2, 'notes are not open items; incidents and actions are');
  await expect('a handover to oneself is refused', call('POST', '/safety/handovers', A, { toId: String(admin1._id), toRole: 'admin' }), [403]);
  await expect('a handover to someone not on duty is refused', call('POST', '/safety/handovers', A, { toId: String(otherT._id), toRole: 'teacher' }), [422]);
  const ds = (await call('GET', '/safety/duty-staff', A)).data.staff; log(ds.some((x) => x.name === 'Second Admin') && ds.some((x) => String(x.id) === String(sara._id)), 'the list of people who can take over includes administrators and teachers on duty');
  const h = (await expect('the shift is handed to Sara', call('POST', '/safety/handovers', A, { toId: String(sara._id), toRole: 'teacher', note: 'Keys in the drawer', witnessName: 'Mr Aslam', keysAndEquipment: 'Gate keys, radio' }), [201])).data.handover;
  log(h.openItems.length === 2 && h.status === 'Pending', 'it lists the open items');
  await expect('only one handover waits at a time', call('POST', '/safety/handovers', A, { toId: String(sara._id), toRole: 'teacher' }), [409]);
  await expect('the person handing over cannot accept', call('POST', `/safety/handovers/${h._id}/decide`, A, { decision: 'accept' }), [403]);
  await expect('someone else cannot accept', call('POST', `/safety/handovers/${h._id}/decide`, A2, { decision: 'accept' }), [403]);
  await Handover.updateOne({ _id: h._id }, { $set: { createdAt: new Date(Date.now() - 3 * 3600000) } });
  log((await call('GET', '/safety/overview', A)).data.findings.some((f) => f.kind === 'HandoverWaiting'), 'a handover nobody accepted shows as a finding');
  await expect('the new person accepts', call('POST', `/safety/handovers/${h._id}/decide`, T, { decision: 'accept' }));
  const carried = await LogItem.find({ schoolId: sid, status: 'Open' }); log(carried.length === 2 && carried.every((x) => String(x.carriedToId) === String(sara._id) && x.carriedCount === 1), 'open items now belong to the new person');
  await expect('a handover cannot be accepted twice', call('POST', `/safety/handovers/${h._id}/decide`, T, { decision: 'accept' }), [409]);
  await expect('Sara resolves an item with words', call('POST', `/safety/logbook/${it1._id}/resolve`, T, { resolution: 'Reported to police liaison' }));
  await expect('resolving needs words', call('POST', `/safety/logbook/${open[0]._id}/resolve`, T, { resolution: '' }), [400]);
  await expect('and only once', call('POST', `/safety/logbook/${it1._id}/resolve`, T, { resolution: 'again' }), [409]);

  // ── dismissal and pickup ──
  await expect('a parent cannot run the roster', call('GET', `/safety/dismissal/roster?classId=${cid}`, PA), [403]);
  await expect('a teacher of another class cannot open this roster', call('GET', `/safety/dismissal/roster?classId=${cid}`, OT), [404]);
  const ro = (await expect('Sara opens the dismissal roster', call('GET', `/safety/dismissal/roster?classId=${cid}`, T))).data;
  const r1 = ro.students.find((s) => s.name === 'Gate Kid 1'); const r3 = ro.students.find((s) => s.name === 'Gate Kid 3');
  log(r1.people.map((p) => p.name).sort().join('|') === 'Driver Salim|Gate Parent One' && r1.today === 'Present', 'the roster lists people who may collect, and never the restricted ones');
  log(!JSON.stringify(ro).match(/Banned Uncle|Court order|Safety plan/), 'it never hints that anyone is restricted');
  log(r3.people.length === 0 && r3.today === 'Absent', 'a child whose parent has no pickup right has an empty list and shows absent');
  const sr = (await call('GET', '/safety/dismissal/search?q=gate kid 4', T)).data.students; log(sr.length === 1 && sr[0].classLabel === '77-G', 'search finds a child by name');
  log((await call('GET', '/safety/dismissal/search?q=gate kid 4', OT)).data.students.length === 0, 'a teacher only finds children in their own class');
  const ck = (await expect('check an authorised guardian', call('POST', '/safety/dismissal/check', T, { studentId: String(k1._id), parentId: String(pa._id) }))).data; log(ck.decision === 'Authorised', 'authorised');
  const ckr = (await call('POST', '/safety/dismissal/check', T, { studentId: String(k1._id), personName: 'Banned Uncle' })).data; const cku = (await call('POST', '/safety/dismissal/check', T, { studentId: String(k1._id), personName: 'Random Man' })).data;
  log(ckr.decision === 'Denied' && ckr.message === cku.message && ckr.code === cku.code, 'a restricted person and a stranger get exactly the same refusal');
  await expect('a refused person cannot be released', call('POST', '/safety/dismissal/release', T, { studentId: String(k1._id), personName: 'Banned Uncle' }), [403]);
  log(!!(await PEvent.findOne({ studentId: k1._id, outcome: 'Refused', refusedCode: 'restricted' })), 'the refusal and its real cause are recorded for administrators');
  log(!!(await Notification.findOne({ userId: admin1._id, key: new RegExp('^pickupbar:') })), 'administrators are told a restricted person tried');
  const evl = (await call('GET', '/safety/dismissal/events?outcome=Refused', T)).data.events; log(evl.length >= 1 && evl.every((e) => e.refusedCode === undefined), 'a teacher sees refusals without the internal cause');
  const evA = (await call('GET', '/safety/dismissal/events?outcome=Refused', A)).data.events; log(evA.some((e) => e.refusedCode === 'restricted'), 'an administrator sees the cause');
  await expect('an absent child is not released without a reason', call('POST', '/safety/dismissal/release', T, { studentId: String(k3._id), personName: 'Nobody Listed' }), [403]);
  await GuardianLink.updateOne({ studentId: k3._id, parentId: pa._id }, { $set: { 'rights.pickup': true } });
  const ab = await call('POST', '/safety/dismissal/release', T, { studentId: String(k3._id), parentId: String(pa._id) }); log(ab.status === 422 && ab.data.code === 'absent-today', 'a child marked absent today is not handed over without confirming');
  const abOk = await call('POST', '/safety/dismissal/release', T, { studentId: String(k3._id), parentId: String(pa._id), overrideAbsent: true, reason: 'Child is in the library, register was wrong' }); log(abOk.status === 201 && abOk.data.event.absentOverride === true, 'with a reason it goes ahead and is flagged');
  const rel = await expect('release k1 to the father', call('POST', '/safety/dismissal/release', T, { studentId: String(k1._id), parentId: String(pa._id) }), [201]);
  log(rel.data.event.basis === 'guardian' && rel.data.event.outcome === 'Released', 'released on the basis of the guardian link');
  await expect('a child cannot be released twice in a day', call('POST', '/safety/dismissal/release', T, { studentId: String(k1._id), parentId: String(pa._id) }), [409]);
  const hd = await Daily.findOne({ studentId: k1._id, date: clock.dateUTC }); log(hd.status === 'HalfDay' && /^\d\d:\d\d$/.test(hd.leftAt) && hd.authorizedBy === 'Gate Parent One', 'the register shows an early exit with the collector as authoriser');
  log(!!(await History.findOne({ studentId: k1._id, source: 'pickup' })), 'the change is in the attendance history');
  log(!!(await GateEntry.findOne({ subjectId: k1._id, direction: 'out', method: 'pickup' })), 'the exit is in the gate log');
  log(!!(await Notification.findOne({ userId: pa._id, key: `pickup:${rel.data.event._id}` })) && !!(await Notification.findOne({ userId: k1._id, key: `pickup:${rel.data.event._id}` })), 'the family and the student are told who collected');
  const mineE = (await call('GET', '/safety/dismissal/mine', PA)).data.events; log(mineE.length >= 1 && mineE.every((e) => e.refusedCode === undefined && e.reason === undefined), 'a parent sees when their child was collected and nothing internal');
  log((await call('GET', '/safety/dismissal/mine', PB)).data.events.length === 0, 'another family sees none of it');
  log((await call('GET', '/safety/dismissal/mine', S1)).data.events.length >= 1, 'a student sees their own');

  // one-day alternates
  await expect('a parent without the pickup right cannot authorise (that child)', call('POST', '/safety/dismissal/authorizations', PB, { studentId: String(k2._id), personName: 'Neighbour Naveed', day: today }), [404]);
  await expect('a parent cannot authorise for someone else\'s child', call('POST', '/safety/dismissal/authorizations', PB, { studentId: String(k1._id), personName: 'Neighbour Naveed', day: today }), [404]);
  await expect('a day in the past is refused', call('POST', '/safety/dismissal/authorizations', PA, { studentId: String(k1._id), personName: 'Neighbour Naveed', day: AO.addDays(today, -1) }), [400]);
  await expect('more than a week ahead is refused', call('POST', '/safety/dismissal/authorizations', PA, { studentId: String(k1._id), personName: 'Neighbour Naveed', day: AO.addDays(today, 9) }), [400]);
  const rr = await call('POST', '/safety/dismissal/authorizations', PA, { studentId: String(k1._id), personName: 'banned uncle', day: today }); log(rr.status === 422 && !/restrict|court/i.test(rr.data.message), 'a restricted person cannot be authorised and the family is not told why');
  const au = (await expect('the father authorises a neighbour', call('POST', '/safety/dismissal/authorizations', PA, { studentId: String(k1._id), personName: 'Neighbour Naveed', phone: '0302', relationship: 'Neighbour', day: AO.addDays(today, 1) }), [201])).data;
  log(/^\d{6}$/.test(au.code) && !JSON.stringify(await PAuth.findById(au.authorization._id)).includes(au.code), 'a six-digit code is shown once and only its hash is stored');
  await expect('the same person twice is refused', call('POST', '/safety/dismissal/authorizations', PA, { studentId: String(k1._id), personName: 'Neighbour Naveed', day: AO.addDays(today, 1) }), [409]);
  const myA = (await call('GET', '/safety/dismissal/authorizations', PA)).data.authorizations; log(myA.length === 1 && myA[0].code === undefined, 'the parent sees their list but never the code again');
  await expect('a teacher cannot list authorisations without gate duty', call('GET', '/safety/dismissal/authorizations', OT), [403]);
  // make k4 collectable today by an alternate
  await GuardianLink.create({ schoolId: sid, studentId: k4._id, parentId: pb._id, relationship: 'Mother', rights: { viewInfo: true, viewAttendance: true, viewMarks: true, viewFees: true, payFees: true, receiveNotices: true, receiveMessages: true, pickup: true } }); await Parent.updateOne({ _id: pb._id }, { $set: { children: [k2._id, k4._id] } });
  const au2 = (await expect('the mother authorises an aunt for today', call('POST', '/safety/dismissal/authorizations', PB, { studentId: String(k4._id), personName: 'Aunt Farah', relationship: 'Aunt', day: today }), [201])).data;
  await expect('the wrong code is refused', call('POST', '/safety/dismissal/release', T, { studentId: String(k4._id), personName: 'Aunt Farah', code: '000000' }), [403]);
  await expect('the right code with another name is refused', call('POST', '/safety/dismissal/release', T, { studentId: String(k4._id), personName: 'Aunt Fatima', code: au2.code }), [403]);
  await expect('the code does not work for a different child', call('POST', '/safety/dismissal/release', T, { studentId: String(kids[4]._id), personName: 'Aunt Farah', code: au2.code }), [403]);
  const ar = await expect('the right name and code release the child', call('POST', '/safety/dismissal/release', T, { studentId: String(k4._id), personName: 'Aunt Farah', code: au2.code }), [201]); log(ar.data.event.basis === 'authorisation', 'basis is the authorisation');
  log((await PAuth.findById(au2.authorization._id)).status === 'Used', 'the code is used up');
  const au3 = (await call('POST', '/safety/dismissal/authorizations', PB, { studentId: String(k4._id), personName: 'Uncle Zahid', day: today })).data;
  await expect('another family cannot revoke it', call('POST', `/safety/dismissal/authorizations/${au3.authorization._id}/revoke`, PA, {}), [404]);
  await expect('the mother revokes it', call('POST', `/safety/dismissal/authorizations/${au3.authorization._id}/revoke`, PB, {}));
  await expect('a revoked authorisation cannot be revoked again', call('POST', `/safety/dismissal/authorizations/${au3.authorization._id}/revoke`, PB, {}), [409]);
  const ad = await expect('the office records one on a family\'s behalf', call('POST', '/safety/dismissal/authorizations', A, { studentId: String(kids[4]._id), personName: 'Cousin Kamran', day: today, confirmedWith: 'Mother by phone' }), [201]);
  await expect('but must say who confirmed', call('POST', '/safety/dismissal/authorizations', A, { studentId: String(kids[4]._id), personName: 'Cousin Kamran2', day: today }), [400]);

  // exceptions with a second person
  const k5 = kids[4];
  await expect('an exception needs a reason', call('POST', '/safety/dismissal/exceptions', T, { studentId: String(k5._id), personName: 'Family Friend', reason: 'short', familyConfirmedWith: 'Mother' }), [400]);
  await expect('and a phone call to the family', call('POST', '/safety/dismissal/exceptions', T, { studentId: String(k5._id), personName: 'Family Friend', reason: 'Mother is stuck at the hospital' }), [400]);
  const rx = await call('POST', '/safety/dismissal/exceptions', T, { studentId: String(k1._id), personName: 'Banned Uncle', reason: 'He says it is an emergency now', familyConfirmedWith: 'Nobody' }); log(rx.status === 409 || rx.status === 403, 'a restricted person (or a child already collected) cannot get an exception');
  await Restriction.create({ schoolId: sid, studentId: k2._id, personName: 'Barred Visitor', type: 'no-access', reason: 'x' });
  const rx2 = await call('POST', '/safety/dismissal/exceptions', T, { studentId: String(k2._id), personName: 'Barred Visitor', reason: 'He says the mother sent him', familyConfirmedWith: 'Mother' }); log(rx2.status === 403, 'someone with a no-access restriction is refused too'); await Restriction.deleteMany({ studentId: k2._id, personName: 'Barred Visitor' });
  const ex1 = (await expect('Sara asks for an exception', call('POST', '/safety/dismissal/exceptions', T, { studentId: String(k2._id), personName: 'Family Friend Imran', relationship: 'Friend', phone: '0303', reason: 'Mother is stuck at the hospital', familyConfirmedWith: 'Mother (phoned)' }), [201])).data.event;
  log(ex1.outcome === 'Pending', 'it waits for an administrator');
  await expect('a second request for the same child is refused', call('POST', '/safety/dismissal/exceptions', T, { studentId: String(k2._id), personName: 'Someone Else', reason: 'Another reason here', familyConfirmedWith: 'Mother' }), [409]);
  await expect('a teacher cannot decide it', call('POST', `/safety/dismissal/exceptions/${ex1._id}/decide`, T, { decision: 'approve' }), [403]);
  const ra = await call('GET', `/safety/dismissal/roster?classId=${cid}`, T); log(ra.data.students.find((s) => s.name === 'Gate Kid 2').exceptionPending === true, 'the roster shows an exception is pending');
  const ex2 = (await call('POST', '/safety/dismissal/exceptions', A, { studentId: String(k5._id), personName: 'Admin Asked Person', reason: 'Parent phoned to say a friend comes', familyConfirmedWith: 'Father' })).data.event;
  await expect('the administrator who asked cannot decide', call('POST', `/safety/dismissal/exceptions/${ex2._id}/decide`, A, { decision: 'approve' }), [403]);
  await Restriction.create({ schoolId: sid, studentId: k2._id, personName: 'Family Friend Imran', type: 'no-pickup', reason: 'added meanwhile' });
  await expect('a restriction added after the request still wins', call('POST', `/safety/dismissal/exceptions/${ex1._id}/decide`, A, { decision: 'approve' }), [403]);
  await Restriction.deleteMany({ studentId: k2._id, personName: 'Family Friend Imran' });
  log((await PEvent.findById(ex1._id)).outcome === 'Refused', 'the request ended as a refusal');
  await expect('a different administrator approves the other exception', call('POST', `/safety/dismissal/exceptions/${ex2._id}/decide`, A2, { decision: 'approve', note: 'Father confirmed' }));
  log((await PEvent.findById(ex2._id)).outcome === 'Released' && (await PEvent.findById(ex2._id)).basis === 'exception', 'approving releases the child on an exception');
  await expect('an exception cannot be decided twice', call('POST', `/safety/dismissal/exceptions/${ex2._id}/decide`, A2, { decision: 'decline' }), [409]);
  const ex3 = (await call('POST', '/safety/dismissal/exceptions', T, { studentId: String(k2._id), personName: 'Family Friend Imran', reason: 'Mother is stuck at the hospital', familyConfirmedWith: 'Mother' })).data.event;
  await expect('declining closes it', call('POST', `/safety/dismissal/exceptions/${ex3._id}/decide`, A2, { decision: 'decline', note: 'Could not confirm' })); log((await PEvent.findById(ex3._id)).outcome === 'Declined', 'declined');

  // emergency override
  await expect('a teacher cannot use the override', call('POST', '/safety/dismissal/override', T, { studentId: String(k2._id), personName: 'Neighbour Doctor', reason: 'Gas leak in the street, evacuating' }), [403]);
  await expect('the override needs a real description', call('POST', '/safety/dismissal/override', A, { studentId: String(k2._id), personName: 'Neighbour Doctor', reason: 'urgent' }), [400]);
  await Restriction.create({ schoolId: sid, studentId: k2._id, personName: 'Restricted Neighbour', type: 'no-access', reason: 'x' });
  const ob = await call('POST', '/safety/dismissal/override', A, { studentId: String(k2._id), personName: 'Restricted Neighbour', reason: 'Gas leak in the street, evacuating now' }); log(ob.status === 403 && ob.data.message.includes('Do not release'), 'the emergency override can never release to a restricted person');
  await Restriction.deleteMany({ studentId: k2._id, personName: 'Restricted Neighbour' });
  const ovr = (await expect('the override releases in a real emergency', call('POST', '/safety/dismissal/override', A, { studentId: String(k2._id), personName: 'Neighbour Doctor', relationship: 'Neighbour', reason: 'Gas leak in the street, evacuating now' }), [201])).data.event;
  log(ovr.basis === 'emergency-override' && ovr.reviewState === 'NeedsReview', 'it is flagged for review');
  log(!!(await AuditLog.findOne({ schoolId: sid, action: 'safety.pickup.override', entityId: String(ovr._id) })), 'it is in the audit log');
  log(!!(await Notification.findOne({ userId: adm2._id, key: `pickupovr:${ovr._id}` })), 'every other administrator is told');
  log((await call('GET', '/safety/overview', A)).data.findings.some((f) => f.kind === 'OverrideReview'), 'it shows as a finding until reviewed');
  await expect('the administrator who used it cannot review it', call('POST', `/safety/dismissal/events/${ovr._id}/review`, A, { note: 'Fine by me' }), [403]);
  await expect('review needs words', call('POST', `/safety/dismissal/events/${ovr._id}/review`, A2, { note: '' }), [400]);
  await expect('a different administrator reviews', call('POST', `/safety/dismissal/events/${ovr._id}/review`, A2, { note: 'Gas leak confirmed by the fire service' }));
  await expect('a review is only done once', call('POST', `/safety/dismissal/events/${ovr._id}/review`, A2, { note: 'again please' }), [409]);
  const pr = (await call('GET', '/safety/dismissal/events?review=pending', A)).data.events; log(pr.length === 0, 'nothing is left to review');

  // ── drills and emergency assembly ──
  await expect('a teacher cannot start a drill', call('POST', '/safety/drills', T, { kind: 'Fire' }), [403]);
  await expect('a drill needs a kind', call('POST', '/safety/drills', A, { kind: 'Picnic' }), [400]);
  // present today: k2 (released by override), k4 (released), k1 (released), k3 (released absent override) -> only the unreleased remain
  await Visit.updateOne({ _id: vin.visit._id }, { $set: { status: 'CheckedIn', checkInAt: new Date(), badge: { number: 'V-TEST-9', day: today, seq: 99, zones: ['Reception'], printedCount: 0 } } });
  const k6 = kids[5]; await Parent.updateOne({ _id: pb._id }, { $set: { children: [k2._id, k4._id, k6._id] } });
  const k7 = await Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: 'Gate Kid 7', email: 'gatekid7@demo.school', password: pw, classId: cls._id, rollNumber: 'G7', studentId: 'GK7', isActive: true }); await mark(k7, 'Present');
  const dr = (await expect('administrator starts a fire drill', call('POST', '/safety/drills', A, { kind: 'Fire', title: 'Fire drill', assemblyPoint: 'Playground' }), [201])).data.drill;
  const mine77 = await Muster.find({ drillId: dr._id, classId: cls._id }); log(mine77.map((m) => m.name).sort().join(',') === 'Gate Kid 6,Gate Kid 7', 'the roster leaves out children already collected or absent');
  log(dr.counts.others === 1 && (await Muster.findOne({ drillId: dr._id, kind: 'visitor' })).name === 'Reader Guest', 'visitors inside are on the head count');
  await expect('only one drill can run', call('POST', '/safety/drills', A, { kind: 'Fire' }), [409]);
  log(!!(await Notification.findOne({ userId: sara._id, key: `drill:${dr._id}` })), 'class teachers are told to count');
  await expect('another teacher cannot see Sara\'s class roster', call('GET', `/safety/drills/${dr._id}/roster?classId=${cid}`, OT), [404]);
  const dro = (await expect('Sara sees her class', call('GET', `/safety/drills/${dr._id}/roster?classId=${cid}`, T))).data; log(dro.classes[0].students.length === 2, 'two students to count');
  const [m6, m7] = dro.classes[0].students;
  await expect('Missing needs a note', call('POST', `/safety/drills/${dr._id}/muster`, T, { classId: cid, marks: [{ studentId: String(k6._id), status: 'Missing' }] }), [400]);
  await expect('another teacher cannot count Sara\'s class', call('POST', `/safety/drills/${dr._id}/muster`, OT, { classId: cid, allSafe: true }), [404]);
  await expect('a student outside the class is refused', call('POST', `/safety/drills/${dr._id}/muster`, T, { classId: cid, marks: [{ studentId: String(admin1._id), status: 'Safe' }] }), [404]);
  const mm = (await expect('one student is missing', call('POST', `/safety/drills/${dr._id}/muster`, T, { classId: cid, marks: [{ studentId: String(k6._id), status: 'Missing', note: 'Last seen in the toilets' }] }))).data; log(mm.counts.missing === 1, 'the count shows one missing');
  log(!!(await Notification.findOne({ userId: admin1._id, key: `drillmiss:${dr._id}:${k6._id}` })), 'administrators are told at once');
  const cl1 = await call('POST', `/safety/drills/${dr._id}/close`, A, { summary: 'Drill ended' }); log(cl1.status === 422 && cl1.data.code === 'not-accounted', 'a drill cannot close with children unaccounted for');
  await expect('the visitor is marked safe', call('POST', `/safety/drills/${dr._id}/others/${(await Muster.findOne({ drillId: dr._id, kind: 'visitor' }))._id}`, A, { status: 'Safe' }));
  const nf0 = await call('POST', `/safety/drills/${dr._id}/notify-families`, A, {}); log(nf0.status === 422, 'families are not told while nobody is accounted for');
  await expect('the rest of the class is marked safe', call('POST', `/safety/drills/${dr._id}/muster`, T, { classId: cid, allSafe: true }));
  const others = [...new Set((await Muster.find({ drillId: dr._id, kind: 'student' })).map((m) => String(m.classId)))].filter((c) => c !== cid);
  for (const c of others) await expect(`the administrator counts another class (${c.slice(-4)})`, call('POST', `/safety/drills/${dr._id}/muster`, A, { classId: c, allSafe: true }));
  const total = await Muster.countDocuments({ drillId: dr._id, kind: 'student' });
  const dt = (await call('GET', `/safety/drills/${dr._id}`, A)).data; log(dt.drill.counts.safe === total - 1 && dt.drill.counts.missing === 1 && dt.notAccountedFor.length === 1 && dt.notAccountedFor[0].note.includes('toilets'), 'the detail shows who is still not accounted for and why');
  const fb0 = (await call('GET', `/safety/drills/${dr._id}/fallback`, A)).data.calls; log(fb0.some((c) => c.studentName === 'Gate Kid 6' && c.why === 'not yet accounted for'), 'families of a child not accounted for go on the phone list');
  const nf = (await expect('families of safe children are told', call('POST', `/safety/drills/${dr._id}/notify-families`, A, {}))).data; log(nf.studentsAccountedFor === total - 1, 'only children who are safe, never the missing one');
  const fb1 = (await call('GET', `/safety/drills/${dr._id}/fallback`, A)).data; log(!fb1.calls.some((c) => c.why === 'has not opened the notice'), 'nobody is on the phone list for an unopened notice before the wait is over');
  await Drill.updateOne({ _id: dr._id }, { $set: { familiesNotifiedAt: new Date(Date.now() - 20 * 60000) } });
  const fb2 = (await call('GET', `/safety/drills/${dr._id}/fallback`, A)).data; log(fb2.calls.some((c) => c.why === 'has not opened the notice' && c.phone), 'after the wait, families who have not opened the notice go on the phone list with a number');
  const noteK4 = await Notification.findOne({ userId: pb._id, key: `drillfam:${dr._id}` }); if (noteK4) await Notification.updateOne({ _id: noteK4._id }, { $set: { readAt: new Date() } });
  const fb3 = (await call('GET', `/safety/drills/${dr._id}/fallback`, A)).data; log(!fb3.calls.some((c) => c.parentName === 'Gate Parent Two' && c.why === 'has not opened the notice'), 'once a family opens the notice they leave the phone list');
  await expect('the missing child is found', call('POST', `/safety/drills/${dr._id}/muster`, T, { classId: cid, marks: [{ studentId: String(k6._id), status: 'Safe', note: 'Found in the library' }] }));
  const cl2 = await expect('closing now works', call('POST', `/safety/drills/${dr._id}/close`, A, { summary: 'Everyone counted in 6 minutes' })); log(cl2.data.drill.status === 'Closed' && cl2.data.drill.durationSeconds >= 0 && cl2.data.drill.counts.safe === total, 'closed with final counts');
  await expect('counts cannot change after closing', call('POST', `/safety/drills/${dr._id}/muster`, T, { classId: cid, marks: [{ studentId: String(k6._id), status: 'Missing', note: 'late edit' }] }), [422]);
  await expect('closing twice is refused', call('POST', `/safety/drills/${dr._id}/close`, A, { summary: 'again please' }), [409]);
  await expect('the administrator who closed cannot sign', call('POST', `/safety/drills/${dr._id}/sign`, A, {}), [403]);
  await expect('a follow-up is added', call('POST', `/safety/drills/${dr._id}/actions`, A, { text: 'Fix the stuck assembly gate', ownerName: 'Caretaker', dueDate: AO.addDays(today, 7) }), [201]);
  await expect('a follow-up needs words', call('POST', `/safety/drills/${dr._id}/actions`, A, { text: '' }), [400]);
  await expect('a different administrator signs the report', call('POST', `/safety/drills/${dr._id}/sign`, A2, {}));
  await expect('a signed report cannot gain actions', call('POST', `/safety/drills/${dr._id}/actions`, A, { text: 'Another thing to do' }), [422]);
  const cmp = await expect('but an open follow-up can still be completed', call('POST', `/safety/drills/${dr._id}/actions/0/done`, A, {})); log(cmp.data.drill.actions[0].done === true, 'marked done');
  await expect('and only once', call('POST', `/safety/drills/${dr._id}/actions/0/done`, A, {}), [409]);
  // a forced close
  const dr2 = (await call('POST', '/safety/drills', A, { kind: 'Lockdown', title: 'Lockdown drill' })).data.drill;
  await expect('a forced close needs a real reason', call('POST', `/safety/drills/${dr2._id}/close`, A, { summary: 'Stopped early', forceReason: 'short' }), [422]);
  const fc = await expect('forced close with a reason', call('POST', `/safety/drills/${dr2._id}/close`, A, { summary: 'Stopped early', forceReason: 'Fire service asked everyone to stand down' })); log(fc.data.drill.forceReason.includes('Fire service'), 'the reason is kept on the report');
  const dl = (await call('GET', '/safety/drills', A)).data.drills; log(dl.length >= 2 && dl[0].status === 'Closed', 'drills are listed newest first');
  await expect('a parent cannot see drills', call('GET', '/safety/drills', PA), [403]);

  // ── overview, housekeeping, cron, audit, isolation ──
  const ov3 = (await call('GET', '/safety/overview', A)).data; log(ov3.counts.releasedToday >= 4 && ov3.counts.refusedToday >= 2 && ov3.day === today, 'the desk overview counts releases and refusals today');
  await Visit.updateOne({ _id: v3.data.visit._id }, { $set: { status: 'Approved', expectedTo: new Date(Date.now() - 1000) } });
  await PAuth.updateOne({ _id: au.authorization._id }, { $set: { day: AO.addDays(today, -2) } });
  process.env.CRON_SECRET = 'cron-secret-test';
  await expect('the cron route needs the secret', call('GET', '/cron/safety', null), [401]);
  const cr = await expect('the cron route runs the housekeeping', call('GET', '/cron/safety', null, null, { authorization: 'Bearer cron-secret-test' })); log(cr.data.expired >= 2, 'late invitations and old pickup codes are expired');
  log((await Visit.findById(v3.data.visit._id)).status === 'Expired' && (await PAuth.findById(au.authorization._id)).status === 'Expired', 'both are expired');
  await expect('an unknown visit is a 404', call('GET', `/safety/visits/${'a'.repeat(24)}`, A), [404]);
  await expect('a malformed id is a 404', call('POST', '/safety/visits/not-an-id/check-in', A, {}), [404]);
  const acts = (await AuditLog.find({ schoolId: sid, action: /^safety\./ })).map((a) => a.action);
  for (const a of ['safety.visit.create', 'safety.visit.checkin', 'safety.visit.refused', 'safety.contractor.approve', 'safety.pickup.release', 'safety.pickup.refused', 'safety.pickup.override', 'safety.drill.start', 'safety.drill.sign', 'safety.handover.accept']) log(acts.includes(a), `audited: ${a}`);
  const named = await AuditLog.findOne({ schoolId: sid, action: 'safety.pickup.override' }); log(named.actorName === 'Demo Admin' || named.actorName.length > 0, 'audit entries carry the actor\'s name');

  // clean up so later suites see the demo school as before
  await Drill.deleteMany({ schoolId: sid }); await Muster.deleteMany({ schoolId: sid }); await PEvent.deleteMany({ schoolId: sid }); await PAuth.deleteMany({ schoolId: sid });
  await Visit.deleteMany({ schoolId: sid }); await Pass.deleteMany({ schoolId: sid }); await GateEntry.deleteMany({ schoolId: sid }); await LogItem.deleteMany({ schoolId: sid }); await Handover.deleteMany({ schoolId: sid });
  await Restriction.deleteMany({ studentId: { $in: kids.map((k) => k._id) } }); await GuardianLink.deleteMany({ studentId: { $in: kids.map((k) => k._id) } });
  await Daily.deleteMany({ studentId: { $in: kids.map((k) => k._id) } }); await History.deleteMany({ studentId: { $in: kids.map((k) => k._id) } });
  await Device.deleteMany({ _id: { $in: [dvA.device._id, dvB.device._id] } }); await Student.deleteMany({ classId: cls._id }); await Parent.deleteMany({ _id: { $in: [pa._id, pb._id] } }); await Class.deleteOne({ _id: cls._id });
  await AppSetting.deleteOne({ key: `safety:${sid}` }); const PG = require('../models/PermissionGrant'); await PG.deleteMany({ schoolId: sid, action: 'safety.gate.operate' });
  delete process.env.CRON_SECRET;
};
