// Permission fabric: scoped time-limited grants, break-glass, separation (E01).
module.exports = async ({ call, expect, log, tokens }) => {
  const School = require('../models/School'); const Class = require('../models/Class'); const Teacher = require('../models/Teacher'); const User = require('../models/User');
  const Student = require('../models/Student'); const Parent = require('../models/Parent');
  const PermissionGrant = require('../models/PermissionGrant'); const AuditLog = require('../models/AuditLog'); const Notification = require('../models/Notification');
  const ContactRestriction = require('../models/ContactRestriction'); const GuardianLink = require('../models/GuardianLink');
  const { hashPassword } = require('../utils/password'); const { can } = require('../utils/permissions');
  const A = tokens.admin; const T = tokens.teacher; const P = tokens.parent;
  console.log('\n— Permission fabric, grants and break-glass —');

  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id);
  await PermissionGrant.deleteMany({ schoolId: sid }); await ContactRestriction.deleteMany({ schoolId: sid }); await GuardianLink.deleteMany({ schoolId: sid });
  const sara = await Teacher.findOne({ schoolId: sid, email: 'sara.khan@demo.school' });
  const admin1 = await User.findOne({ schoolId: sid, email: 'admin@demo.school' });
  const classes = await Class.find({ schoolId: sid });
  const other = classes.find((c) => String(c.classTeacherId || '') !== String(sara._id));
  const today = new Date(); const plus = (d) => new Date(today.getTime() + d * 864e5).toISOString();

  // who may use the screens
  const m = await expect('admin reads the permission matrix', call('GET', '/permissions/matrix', A));
  log(m.data.actions.some((a) => a.action === 'safeguarding.case.read' && a.defaults.length === 0) && m.data.actions.some((a) => a.implemented === false), 'matrix lists defaults and marks planned actions as not yet in the product');
  await expect('teacher cannot read the matrix', call('GET', '/permissions/matrix', T), [401, 403]);
  await expect('parent cannot list grants', call('GET', '/permissions/grants', P), [401, 403]);
  await expect('teacher cannot create a grant', call('POST', '/permissions/grants', T, { action: 'academics.attendance.mark' }), [401, 403]);
  await expect('unauthenticated refused', call('GET', '/permissions/grants', null), [401]);

  // cover teacher
  log(!!other, 'there is a class Sara does not head');
  await expect('teacher cannot open a class they do not head', call('GET', `/daily-attendance/class/${other._id}`, T), [403]);
  const body = { granteeId: String(sara._id), granteeRole: 'teacher', action: 'academics.attendance.mark', classId: String(other._id), validTo: plus(2), reason: 'Covering for sick colleague' };
  const g1 = await expect('admin grants cover for one class', call('POST', '/permissions/grants', A, body), [201]);
  const opened = await call('GET', `/daily-attendance/class/${other._id}`, T);
  log(opened.status === 200, `the cover teacher can now open that class (${opened.status})`);
  const third = classes.find((c) => String(c._id) !== String(other._id) && String(c.classTeacherId || '') !== String(sara._id));
  if (third) await expect('the grant does not reach other classes', call('GET', `/daily-attendance/class/${third._id}`, T), [403]);
  await expect('a duplicate grant is a business-state error', call('POST', '/permissions/grants', A, body), [422]);
  await expect('revoke needs a reason', call('POST', `/permissions/grants/${g1.data.grant._id}/revoke`, A, {}), [400]);
  await expect('admin revokes', call('POST', `/permissions/grants/${g1.data.grant._id}/revoke`, A, { reason: 'Colleague is back' }));
  await expect('revoking twice is refused', call('POST', `/permissions/grants/${g1.data.grant._id}/revoke`, A, { reason: 'again' }), [422]);
  await expect('after revoking the teacher is refused again', call('GET', `/daily-attendance/class/${other._id}`, T), [403]);
  const exp = await PermissionGrant.create({ schoolId: sid, granteeId: sara._id, granteeModel: 'Teacher', granteeName: 'Sara', action: 'academics.attendance.mark', classId: other._id, validFrom: plus(-5), validTo: plus(-1), reason: 'old cover' });
  await expect('an expired grant gives nothing', call('GET', `/daily-attendance/class/${other._id}`, T), [403]);
  const fut = await PermissionGrant.create({ schoolId: sid, granteeId: sara._id, granteeModel: 'Teacher', granteeName: 'Sara', action: 'academics.attendance.mark', classId: other._id, validFrom: plus(1), validTo: plus(3), reason: 'later cover' });
  await expect('a grant that has not started gives nothing', call('GET', `/daily-attendance/class/${other._id}`, T), [403]);
  log((await can({ role: 'teacher', userId: String(sara._id), schoolId: sid }, 'academics.attendance.mark', { classId: other._id, at: new Date(Date.now() + 2 * 864e5) })).allowed, 'the check answers correctly for a future moment');
  await PermissionGrant.deleteMany({ _id: { $in: [exp._id, fut._id] } });

  // validation and separation
  await expect('cannot grant to yourself', call('POST', '/permissions/grants', A, { ...body, granteeId: String(admin1._id), granteeRole: 'admin', action: 'safeguarding.case.read' }), [403]);
  await expect('only grantable permissions', call('POST', '/permissions/grants', A, { ...body, action: 'platform.billing.manage' }), [400]);
  await expect('a grant has a maximum length', call('POST', '/permissions/grants', A, { ...body, validTo: plus(200) }), [422]);
  await expect('an end date is required', call('POST', '/permissions/grants', A, { ...body, validTo: undefined }), [400]);
  await expect('a reason is required', call('POST', '/permissions/grants', A, { ...body, reason: '' }), [400]);
  await expect('class scope needs a class', call('POST', '/permissions/grants', A, { ...body, classId: undefined }), [400]);
  await expect('restriction reasons cannot go to a teacher', call('POST', '/permissions/grants', A, { ...body, action: 'safeguarding.case.read', classId: undefined }), [422]);
  await expect('unknown person', call('POST', '/permissions/grants', A, { ...body, granteeId: '000000000000000000000000' }), [404]);

  // restriction reasons are restricted, and every read is audited
  const parent = await Parent.findOne({ schoolId: sid, email: 'parent@demo.school' }); const kid = String(parent.children[0]);
  await expect('admin 1 records a restriction', call('POST', `/guardians/students/${kid}/restrictions`, A, { parentId: String(parent._id), type: 'no-pickup', reason: 'Court order about custody', referenceNo: 'FC-9' }), [201]);
  const own = (await call('GET', `/guardians/students/${kid}`, A)).data.restrictions[0];
  log(own.reason === 'Court order about custody' && own.reasonHidden === false, 'the admin who recorded it can read the reason');
  await User.create({ schoolId: sid, name: 'Second Admin', email: 'second@demo.school', password: await hashPassword('Admin@1234'), role: 'admin' });
  const l2 = await call('POST', '/auth/login', null, { email: 'second@demo.school', password: 'Admin@1234', schoolCode: 'DEMO01' });
  const A2 = l2.data.token || l2.data.accessToken; log(!!A2, 'a second admin can log in');
  const seen2 = (await call('GET', `/guardians/students/${kid}`, A2)).data.restrictions[0];
  log(seen2.reason === '' && seen2.referenceNo === '' && seen2.reasonHidden === true && seen2.type === 'no-pickup', 'another admin sees the type but not the reason or court reference');
  await expect('break-glass needs a real reason', call('POST', '/permissions/break-glass', A2, { action: 'safeguarding.case.read', reason: 'need it' }), [400]);
  await expect('break-glass only for restricted actions', call('POST', '/permissions/break-glass', A2, { action: 'academics.attendance.mark', reason: 'a long enough reason here' }), [400]);
  await expect('teacher cannot use break-glass', call('POST', '/permissions/break-glass', T, { action: 'safeguarding.case.read', reason: 'a long enough reason here' }), [401, 403]);
  const bg = await expect('second admin uses break-glass', call('POST', '/permissions/break-glass', A2, { action: 'safeguarding.case.read', reason: 'Child safety concern raised by the principal today', minutes: 600 }), [201]);
  log((new Date(bg.data.grant.validTo) - new Date(bg.data.grant.validFrom)) <= 60 * 60000 + 1000, 'break-glass is capped at 60 minutes whatever is asked');
  log(bg.data.notifiedAdmins >= 1, 'the other admins are told');
  log((await Notification.countDocuments({ userId: admin1._id, title: /emergency access/ })) >= 1, 'a notification reaches the first admin');
  await expect('only one emergency window at a time', call('POST', '/permissions/break-glass', A2, { action: 'safeguarding.case.read', reason: 'Child safety concern raised by the principal today' }), [422]);
  const seen3 = (await call('GET', `/guardians/students/${kid}`, A2)).data.restrictions[0];
  log(seen3.reason === 'Court order about custody' && seen3.reasonHidden === false, 'during the window the reason is readable');
  const reads = await AuditLog.find({ schoolId: sid, action: 'safeguarding.case.read' });
  log(reads.length >= 1 && reads[0].detail.via === 'break-glass', 'the read is audited with how access was obtained');
  const log2 = (await call('GET', '/permissions/grants?source=break-glass', A)).data.grants;
  log(log2.length === 1 && log2[0].granteeName === 'Second Admin' && log2[0].reason.length > 10, 'the break-glass log shows who, why and until when');
  await PermissionGrant.updateMany({ source: 'break-glass', schoolId: sid }, { validTo: new Date(Date.now() - 1000) });
  const seen4 = (await call('GET', `/guardians/students/${kid}`, A2)).data.restrictions[0];
  log(seen4.reasonHidden === true, 'when the window ends the reason is hidden again');
  const grantedRead = await expect('admin 1 grants read access for a week', call('POST', '/permissions/grants', A, { granteeId: String((await User.findOne({ email: 'second@demo.school' }))._id), granteeRole: 'admin', action: 'safeguarding.case.read', validTo: plus(7), reason: 'Designated safeguarding lead' }), [201]);
  log((await call('GET', `/guardians/students/${kid}`, A2)).data.restrictions[0].reasonHidden === false, 'a granted window also opens the reasons');

  // gate check goes through the same fabric
  const v = await call('POST', `/guardians/students/${kid}/pickup-verify`, T, { personName: 'Someone' });
  log(v.status === 200, 'teachers can run the pickup check by default');

  // tenant isolation
  await expect('owner creates another school', call('POST', '/superadmin/schools', tokens.superadmin, { name: 'Perm Test School', code: 'PRM02', email: 'p@school.test', phone: '0513333333', adminName: 'P Admin', adminEmail: 'padmin@school.test', adminPassword: 'Admin@12345' }), [201]);
  const lb = await call('POST', '/auth/login', null, { email: 'padmin@school.test', password: 'Admin@12345', schoolCode: 'PRM02' }); const B = lb.data.token || lb.data.accessToken;
  const bGrants = (await call('GET', '/permissions/grants', B)).data.grants; log(bGrants.length === 0, 'another school sees none of these grants');
  await expect('another school cannot revoke them', call('POST', `/permissions/grants/${grantedRead.data.grant._id}/revoke`, B, { reason: 'hack' }), [404]);
  await expect('another school cannot grant to our teacher', call('POST', '/permissions/grants', B, { ...body, granteeId: String(sara._id) }), [404]);
  await expect('another school cannot grant for our class', call('POST', '/permissions/grants', B, { ...body, granteeId: String(sara._id), classId: String(other._id) }), [404]);
  await expect('owner removes it', call('DELETE', `/superadmin/schools/${(await School.findOne({ code: 'PRM02' }))._id}`, tokens.superadmin, { confirmCode: 'PRM02' }));

  const acts = (await AuditLog.find({ schoolId: sid, action: /^permission\./ })).map((a) => a.action);
  log(['permission.grant', 'permission.revoke', 'permission.break-glass'].every((x) => acts.includes(x)), 'grants, revokes and break-glass are all audited');
  await User.deleteMany({ email: 'second@demo.school' });
};
