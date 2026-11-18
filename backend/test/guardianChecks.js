// Guardian rights, contact restrictions and pickup checks (E05).
module.exports = async ({ call, expect, log, tokens }) => {
  const mongoose = require('../lib/pgdoc');
  const School = require('../models/School'); const Student = require('../models/Student'); const Parent = require('../models/Parent');
  const GuardianLink = require('../models/GuardianLink'); const ContactRestriction = require('../models/ContactRestriction'); const AuditLog = require('../models/AuditLog');
  const Notification = require('../models/Notification');
  const A = tokens.admin; const P = tokens.parent; const T = tokens.teacher;
  const N = require('../utils/notify'); const G = require('../utils/guardianRights');
  console.log('\n— Guardian rights, restrictions and pickup —');

  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id);
  await GuardianLink.deleteMany({ schoolId: sid }); await ContactRestriction.deleteMany({ schoolId: sid });
  const parent = await Parent.findOne({ schoolId: sid, email: 'parent@demo.school' });
  const kid = (await Student.find({ _id: { $in: parent.children } }).select('name'))[0];
  const kidId = String(kid._id); const pid = String(parent._id);

  // 1. Old-style links keep working with normal rights, but never pickup
  const base = await call('GET', '/parents/me/children', P);
  const card0 = base.data.children.find((c) => String(c._id) === kidId);
  log(!!card0 && card0.rights.viewAttendance === true && card0.rights.pickup === false, 'a parent linked the old way keeps normal rights and no pickup right');
  const g0 = await expect('admin sees rights for a student', call('GET', `/guardians/students/${kidId}`, A));
  log(g0.data.implicit.some((x) => String(x.parentId) === pid) && g0.data.links.length === 0, 'old-style parents are shown as standard rights until edited');

  // 2. Who may manage
  await expect('parent cannot read guardian rights', call('GET', `/guardians/students/${kidId}`, P), [401, 403]);
  await expect('teacher cannot change guardian rights', call('POST', `/guardians/students/${kidId}/links`, T, { parentId: pid }), [401, 403]);
  await expect('student cannot create a restriction', call('POST', `/guardians/students/${kidId}/restrictions`, tokens.student, { parentId: pid, type: 'no-access', reason: 'x' }), [401, 403]);
  await expect('unauthenticated request refused', call('GET', `/guardians/students/${kidId}`, null), [401]);
  await expect('invalid student id', call('GET', '/guardians/students/nope', A), [404]);

  // 3. Create a link with limited rights: attendance hidden, fees visible
  const lk = await expect('admin links the parent with limited rights', call('POST', `/guardians/students/${kidId}/links`, A, { parentId: pid, relationship: 'Mother', isPrimary: true, rights: { viewAttendance: false, payFees: false } }), [201]);
  const linkId = lk.data.link._id;
  log(lk.data.link.rights.viewAttendance === false && lk.data.link.rights.viewFees === true && lk.data.link.rights.pickup === false, 'link rights are stored as given, pickup stays off by default');
  const c1 = (await call('GET', '/parents/me/children', P)).data.children.find((c) => String(c._id) === kidId);
  log(c1.attendanceHidden === true && c1.overall === null, 'the parent portal hides attendance the guardian may not see');
  await expect('attendance detail refused without the right', call('GET', `/parents/me/children/${kidId}/attendance`, P), [403]);
  await expect('a second live link for the same pair is a business-state error', call('POST', `/guardians/students/${kidId}/links`, A, { parentId: pid }), [422]);
  const fee = await call('GET', `/fees/summary/${kidId}`, P); // viewFees still on
  log(fee.status !== 404, `fees can still be viewed with the right on (${fee.status})`);
  const pay = await call('POST', '/fees/proofs', P, { studentId: kidId, itemKeys: ['x'], method: 'Other', screenshotUrl: 'https://res.cloudinary.com/x/y.png' });
  log(pay.status === 404, `payment proof refused without payFees (${pay.status})`);

  // 4. Edit with optimistic version check
  await expect('stale edit is a 409', call('PUT', `/guardians/links/${linkId}`, A, { rights: { viewAttendance: true }, version: '2020-01-01T00:00:00.000Z' }), [409]);
  const up = await expect('edit restores attendance', call('PUT', `/guardians/links/${linkId}`, A, { rights: { viewAttendance: true }, version: lk.data.link.version }));
  log(up.data.link.rights.viewAttendance === true, 'the edit is applied');
  const c2 = (await call('GET', '/parents/me/children', P)).data.children.find((c) => String(c._id) === kidId);
  log(c2.attendanceHidden !== true, 'attendance is visible again');

  // 5. Restriction beats the link, and nothing leaks
  const rs = await expect('admin records a no-contact restriction', call('POST', `/guardians/students/${kidId}/restrictions`, A, { parentId: pid, type: 'no-contact', reason: 'Court order', referenceNo: 'FC-221' }), [201]);
  const before = await Notification.countDocuments({ userId: parent._id });
  const to = await N.parentsOf(sid, [kidId]);
  log(!to.some((r) => String(r.id) === pid), 'a no-contact restriction removes the guardian from every notification fan-out');
  const c3 = (await call('GET', '/parents/me/children', P)).data.children.find((c) => String(c._id) === kidId);
  log(c3.rights.receiveNotices === false && c3.rights.viewAttendance === true, 'other rights are unaffected by a no-contact restriction');
  await expect('restriction needs a reason', call('POST', `/guardians/students/${kidId}/restrictions`, A, { parentId: pid, type: 'no-fees' }), [400]);
  await expect('restriction type is validated', call('POST', `/guardians/students/${kidId}/restrictions`, A, { parentId: pid, type: 'whatever', reason: 'abc' }), [400]);
  const ended = await expect('ending needs a reason', call('POST', `/guardians/restrictions/${rs.data.restriction._id}/end`, A, {}), [400]);
  await expect('restriction ends with a reason', call('POST', `/guardians/restrictions/${rs.data.restriction._id}/end`, A, { reason: 'Order lifted' }));
  await expect('ending twice is refused', call('POST', `/guardians/restrictions/${rs.data.restriction._id}/end`, A, { reason: 'Order lifted' }), [422]);
  log((await N.parentsOf(sid, [kidId])).some((r) => String(r.id) === pid), 'notifications resume once the restriction has ended');

  // 6. no-access hides the child entirely
  const na = await expect('no-access restriction', call('POST', `/guardians/students/${kidId}/restrictions`, A, { parentId: pid, type: 'no-access', reason: 'Safety plan' }), [201]);
  const c4 = (await call('GET', '/parents/me/children', P)).data.children;
  log(!c4.some((c) => String(c._id) === kidId), 'a no-access restriction removes the child from the parent portal');
  await expect('student detail refused to restricted guardian', call('GET', `/students/${kidId}`, P), [403, 404]);
  await expect('attendance refused to restricted guardian', call('GET', `/parents/me/children/${kidId}/attendance`, P), [403]);
  await call('POST', `/guardians/restrictions/${na.data.restriction._id}/end`, A, { reason: 'Resolved' });

  // 7. Pickup
  const v0 = await expect('pickup check for a guardian without the pickup right', call('POST', `/guardians/students/${kidId}/pickup-verify`, T, { parentId: pid }));
  log(v0.data.decision === 'Denied' && v0.data.requiresHumanContact === true, 'no pickup right means do not release, ask for a person');
  await call('PUT', `/guardians/links/${linkId}`, A, { rights: { pickup: true } });
  const v1 = (await call('POST', `/guardians/students/${kidId}/pickup-verify`, T, { parentId: pid })).data;
  log(v1.decision === 'Authorised', 'a guardian with the pickup right is authorised');
  const drv = await expect('authorise a driver with no account', call('POST', `/guardians/students/${kidId}/links`, A, { personName: 'Driver Bashir', phone: '0300', relationship: 'Driver', rights: { pickup: true } }), [201]);
  log(drv.data.link.rights.viewFees === false && drv.data.link.rights.viewAttendance === false && drv.data.link.rights.pickup === true, 'a person without an account can only be given pickup');
  await expect('the same driver cannot be listed twice', call('POST', `/guardians/students/${kidId}/links`, A, { personName: ' DRIVER bashir ', rights: { pickup: true } }), [422]);
  const v2 = (await call('POST', `/guardians/students/${kidId}/pickup-verify`, T, { personName: 'driver bashir' })).data;
  log(v2.decision === 'Authorised', 'the driver is recognised by name, ignoring case');
  const v3 = (await call('POST', `/guardians/students/${kidId}/pickup-verify`, T, { personName: 'Stranger' })).data;
  log(v3.decision === 'Denied' && v3.code === 'not-authorised', 'someone who is not listed is refused');
  const pr = await expect('restrict pickup for the driver', call('POST', `/guardians/students/${kidId}/restrictions`, A, { personName: 'Driver Bashir', type: 'no-pickup', reason: 'Safety plan' }), [201]);
  await expect('the same restriction cannot be added twice', call('POST', `/guardians/students/${kidId}/restrictions`, A, { personName: 'driver bashir', type: 'no-pickup', reason: 'again' }), [422]);
  const v4 = (await call('POST', `/guardians/students/${kidId}/pickup-verify`, T, { personName: 'Driver Bashir' })).data;
  log(v4.decision === 'Denied' && v4.requiresHumanContact === true && !/safety|court|order|plan|restrict/i.test(JSON.stringify(v4)), 'a restricted person is refused and the reply never says why');
  await expect('end the driver link', call('POST', `/guardians/links/${drv.data.link._id}/end`, A, { reason: 'Left the family' }));
  const v5 = (await call('POST', `/guardians/students/${kidId}/pickup-verify`, T, { personName: 'Driver Bashir' })).data;
  log(v5.decision === 'Denied', 'an ended link no longer authorises pickup');
  await expect('an ended link cannot be edited', call('PUT', `/guardians/links/${drv.data.link._id}`, A, { note: 'x' }), [422]);
  await expect('pickup check needs a person', call('POST', `/guardians/students/${kidId}/pickup-verify`, T, {}), [400]);
  await expect('parent cannot run the pickup check', call('POST', `/guardians/students/${kidId}/pickup-verify`, P, { parentId: pid }), [401, 403]);

  // 8. Time-limited link: a link that has not started or has expired grants nothing
  const past = new Date(Date.now() - 864e5 * 10).toISOString(); const pastEnd = new Date(Date.now() - 864e5 * 5).toISOString();
  await expect('end date must follow the start date', call('POST', `/guardians/students/${kidId}/links`, A, { personName: 'Aunt', validFrom: pastEnd, validTo: past }), [400]);
  const ev = G.evaluate({ links: [{ validFrom: past, validTo: pastEnd, rights: { viewInfo: true } }], restrictions: [], legacyLinked: true });
  log(ev.linked === false && Object.values(ev.rights).every((x) => x === false), 'an expired link grants nothing, even for an old-style parent');
  const fut = G.evaluate({ links: [{ validFrom: new Date(Date.now() + 864e5).toISOString(), validTo: null, rights: {} }], restrictions: [], legacyLinked: true });
  log(fut.linked === false, 'a link that has not started yet grants nothing');
  const histFrom = G.evaluate({ links: [{ validFrom: past, validTo: pastEnd, rights: { viewInfo: true, pickup: true } }], restrictions: [], legacyLinked: true, at: new Date(Date.now() - 864e5 * 7) });
  log(histFrom.linked && histFrom.rights.pickup === true, 'rights can be reconstructed for any past day');

  // 9. Tenant isolation
  await expect('owner creates a second school', call('POST', '/superadmin/schools', tokens.superadmin, { name: 'Guardian Test School', code: 'GRD02', email: 'g@school.test', phone: '0512222222', adminName: 'G Admin', adminEmail: 'gadmin@school.test', adminPassword: 'Admin@12345' }), [201]);
  const bl = await call('POST', '/auth/login', null, { email: 'gadmin@school.test', password: 'Admin@12345', schoolCode: 'GRD02' });
  const B = bl.data.token || bl.data.accessToken;
  log(!!B, 'second school admin can log in');
  await expect('another school admin cannot read this student\'s guardians', call('GET', `/guardians/students/${kidId}`, B), [404]);
  await expect('another school admin cannot link a guardian to this student', call('POST', `/guardians/students/${kidId}/links`, B, { personName: 'Mallory' }), [404]);
  await expect('another school admin cannot end this link', call('POST', `/guardians/links/${linkId}/end`, B, { reason: 'hack' }), [404]);
  await expect('another school admin cannot run the pickup check', call('POST', `/guardians/students/${kidId}/pickup-verify`, B, { personName: 'x' }), [401, 403, 404]);
  await expect('link to a parent from another school is refused', call('POST', `/guardians/students/${kidId}/links`, B, { parentId: pid }), [404]);

  await expect('owner removes the second school', call('DELETE', `/superadmin/schools/${(await School.findOne({ code: 'GRD02' }))._id}`, tokens.superadmin, { confirmCode: 'GRD02' }));

  // 10. Audit
  const acts = (await AuditLog.find({ schoolId: sid, action: /^(guardian|safety)\./ })).map((a) => a.action);
  const need = ['guardian.link.create', 'guardian.link.update', 'guardian.link.end', 'guardian.restriction.create', 'guardian.restriction.end', 'safety.pickup.verify'];
  log(need.every((n) => acts.includes(n)), 'every create, change, end and pickup check is audited');
  const pv = await AuditLog.findOne({ schoolId: sid, action: 'safety.pickup.verify' });
  log(!!pv && !!pv.detail.decision && pv.detail.reason, 'pickup audit rows record the decision and the real reason');
};
