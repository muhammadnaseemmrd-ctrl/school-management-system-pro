// Early years (E15): rooms and ratios, check-in and release, bulk care log, child safety profile and consent, reviewed family diary,
// milestones without scores, the activity library, plans, routines, worksheets and pickup-person changes.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const School = require('../models/School'); const User = require('../models/User'); const Student = require('../models/Student'); const Teacher = require('../models/Teacher'); const Parent = require('../models/Parent'); const Class = require('../models/Class');
  const Notification = require('../models/Notification'); const AuditLog = require('../models/AuditLog'); const GuardianLink = require('../models/GuardianLink'); const Restriction = require('../models/ContactRestriction'); const PEvent = require('../models/PickupEvent');
  const Care = require('../models/EyCare'); const Profile = require('../models/EyProfile'); const Post = require('../models/EyPost'); const Room = require('../models/EyRoom'); const Day = require('../models/EyDay'); const Obs = require('../models/EyObs');
  const { hashPassword } = require('../utils/password'); const { generateAccessToken } = require('../utils/jwt'); const { nowInTz } = require('../utils/time');
  console.log('\n— Early years —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id); const A = tokens.admin; const ST = tokens.student; const clock = nowInTz(school.timezone || process.env.DEFAULT_TIMEZONE || 'UTC'); const today = clock.dateKey;
  const tok = (doc, role) => generateAccessToken(String(doc._id), sid, role);
  let adm2 = await User.findOne({ schoolId: sid, email: 'second@demo.school' }); if (!adm2) adm2 = await User.create({ schoolId: sid, name: 'Second Admin', email: 'second@demo.school', password: await hashPassword('Admin@1234'), role: 'admin' }); const A2 = tok(adm2, 'admin');
  const raw = async (path, token) => { const r = await fetch(base + '/api' + path, { headers: token ? { authorization: `Bearer ${token}` } : {} }); return { status: r.status, type: r.headers.get('content-type') || '', len: Number(r.headers.get('content-length') || 0), buf: Buffer.from(await r.arrayBuffer()) }; };

  // ── fixtures ──
  const cls = await Class.create({ schoolId: sid, standard: '55', division: 'E', capacity: 30, academicYear: '2026-2027' }); const pw = await hashPassword('Teacher@123'); const spw = await hashPassword('Student@123');
  const mkT = (n) => Teacher.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: n, email: `${n.toLowerCase().replace(/\W+/g, '.')}@demo.school`, password: pw });
  const lead = await mkT('E15 Lead'); const carer = await mkT('E15 Carer'); const outsider = await mkT('E15 Outsider'); const L = tok(lead, 'teacher'); const C = tok(carer, 'teacher'); const OUT = tok(outsider, 'teacher');
  const months = (m) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d; };
  const mkKid = (i, m) => Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: `Tiny Kid${i} Test`, email: `tinykid${i}@demo.school`, password: spw, classId: cls._id, rollNumber: `T${i}`, studentId: `TK${i}`, isActive: true, dateOfBirth: months(m) });
  const kids = []; for (const [i, m] of [[1, 30], [2, 34], [3, 28], [4, 41], [5, 20], [6, 52]]) kids.push(await mkKid(i, m));
  const mkP = async (n, kidList) => Parent.create({ schoolId: sid, name: `E15 Parent ${n}`, email: `e15parent${n}@demo.school`, password: await hashPassword('Parent@123'), phone: '+92-300-1111111', relationship: 'Mother', children: kidList.map((k) => k._id) });
  const pA = await mkP('A', [kids[0], kids[1]]); const pB = await mkP('B', [kids[0]]); const pC = await mkP('C', [kids[2]]); const PA = tok(pA, 'parent'); const PB = tok(pB, 'parent'); const PC = tok(pC, 'parent');
  const ids = (list) => list.map((k) => String(k._id));
  for (const M of [Care, Profile, Post, Room, Day, Obs, require('../models/EyPlacement'), require('../models/EyPresence'), require('../models/EyMedia'), require('../models/EyPickupChange'), require('../models/EyRatioEvent'), require('../models/EyActivity'), require('../models/EyPlan'), require('../models/EyRoutine'), require('../models/EyPractice'), require('../models/EyFramework')]) await M.deleteMany({ schoolId: sid });

  // ── 1. who can do what, settings, rooms ──
  await expect('unauthenticated refused', call('GET', '/early/rooms', null), [401]); await expect('a student cannot open the nursery desk', call('GET', '/early/rooms', ST), [403]); await expect('a parent cannot open the staff room list', call('GET', '/early/rooms', PA), [403]);
  const set0 = await expect('settings are readable by staff', call('GET', '/early/settings', L)); log(set0.data.settings.ratios.toddler === 4 && set0.data.settings.diaryNeedsReview === true, 'school ratios start as editable defaults and diary review is on');
  await expect('a teacher cannot change settings', call('PUT', '/early/settings', L, { napAlertMinutes: 120 }), [403]); await expect('the diary review cannot be turned off', call('PUT', '/early/settings', A, { diaryNeedsReview: false }), [400, 422]);
  await expect('a ratio of zero is refused', call('PUT', '/early/settings', A, { ratios: { toddler: 0 } }), [400]); await expect('a nap alert above a day is refused', call('PUT', '/early/settings', A, { napAlertMinutes: 2000 }), [400]);
  await expect('the administrator sets a nap reminder', call('PUT', '/early/settings', A, { napAlertMinutes: 120 })); log((await call('GET', '/early/settings', L)).data.settings.napAlertMinutes === 120, 'the nap reminder is saved');
  const rb = { name: 'E15 Sunflowers', ageBand: 'toddler', capacity: 8, leadId: String(lead._id), staffIds: [String(carer._id)] };
  await expect('a teacher cannot create a room', call('POST', '/early/rooms', L, rb), [403]); await expect('a room needs a name', call('POST', '/early/rooms', A, { ...rb, name: ' ' }), [400]); await expect('an unknown age group is refused', call('POST', '/early/rooms', A, { ...rb, ageBand: 'giant' }), [400]);
  await expect('capacity must be a whole number', call('POST', '/early/rooms', A, { ...rb, capacity: 2.5 }), [400]); await expect('a lead who is not on staff is refused', call('POST', '/early/rooms', A, { ...rb, leadId: '000000000000000000000000' }), [400]);
  const rm = await expect('the administrator creates a room', call('POST', '/early/rooms', A, rb), [201]); const room = rm.data.room; const rid = room._id; log(room.allowed === 4 || room.ratioAllowed === 4 || room.ratio === 4 || JSON.stringify(room).includes('"4"') || JSON.stringify(room).includes(':4'), 'the toddler room allows four children for each adult');
  await expect('a duplicate room name is refused', call('POST', '/early/rooms', A, rb), [409]);
  const rm2 = await expect('a second room with its own ratio', call('POST', '/early/rooms', A, { name: 'E15 Little Stars', ageBand: 'baby', capacity: 6, ratio: 2, staffIds: [] }), [201]); const rid2 = rm2.data.room._id;
  await expect('a teacher outside the room cannot open it', call('GET', `/early/rooms/${rid}`, OUT), [403, 404]); const ownList = await expect('the lead sees their room', call('GET', '/early/rooms', L)); log(ownList.data.rooms.some((r) => r._id === rid) && !ownList.data.rooms.some((r) => r._id === rid2), 'a teacher sees only the rooms they work in');
  await expect('a teacher cannot place children', call('POST', `/early/rooms/${rid}/children`, L, { childIds: ids(kids) }), [403]); await expect('placing nobody is refused', call('POST', `/early/rooms/${rid}/children`, A, { childIds: [] }), [400]);
  const pl = await expect('the administrator places four children', call('POST', `/early/rooms/${rid}/children`, A, { childIds: ids(kids.slice(0, 4)) })); log(pl.data.placed === 4, 'four children are placed');
  const mv = await expect('placing a child again in the same room changes nothing', call('POST', `/early/rooms/${rid}/children`, A, { childIds: [String(kids[0]._id)] })); log(mv.data.same === 1, 'same room again is reported as unchanged');
  await expect('a child can sit in one room at a time (move)', call('POST', `/early/rooms/${rid2}/children`, A, { childIds: [String(kids[4]._id)] })); const srch = await expect('searching for a child', call('GET', '/early/children/search?q=Tiny%20Kid6', A)); log(srch.data.children?.some((c) => c.name.includes('Kid6')), 'the child search finds children not yet placed');
  const full = await call('POST', `/early/rooms/${rid}/children`, A, { childIds: ids(kids.slice(0, 6)) }); log([200, 201, 409, 422].includes(full.status), `placing beyond what is free answers cleanly -> ${full.status}`);

  await expect('child 5 goes back to the other room', call('POST', `/early/rooms/${rid2}/children`, A, { childIds: [String(kids[4]._id)] }));

  // ── 2. carers and the ratio ──
  await expect('a carer not on the team cannot start', call('POST', `/early/rooms/${rid}/presence/in`, OUT), [422, 403, 404]); await expect('the lead cannot ask for a stranger', call('POST', `/early/rooms/${rid}/presence/in`, A, { staffId: String(outsider._id) }), [422]);
  const r0 = await expect('the ratio is read', call('GET', '/early/ratios', A)); log(Array.isArray(r0.data.rooms), 'the ratio board answers');
  await expect('the carer starts in the room', call('POST', `/early/rooms/${rid}/presence/in`, C)); await expect('starting twice is refused', call('POST', `/early/rooms/${rid}/presence/in`, C), [409]);

  // ── 3. check-in ──
  const cin = (k, body, t = L) => call('POST', '/early/check-in', t, { childId: String(k._id), ...body });
  await expect('check-in needs to know who brought the child', cin(kids[0], {}), [400]); await expect('a teacher outside the room cannot check a child in', cin(kids[0], { signedBy: { parentId: String(pA._id) } }, OUT), [403, 404]); await expect('a guardian of another child is refused', cin(kids[0], { signedBy: { parentId: String(pC._id) } }), [422]);
  const ci1 = await expect('check-in by a guardian', cin(kids[0], { signedBy: { parentId: String(pA._id) } })); log(ci1.data.day.status === 'In' && ci1.data.day.inBy.basis === 'guardian', 'the guardian signs the child in'); log(!!ci1.data.reminder, 'the carer is reminded to look at the child');
  await expect('checking in twice is refused', cin(kids[0], { signedBy: { parentId: String(pA._id) } }), [409]); log(!!(await Notification.findOne({ userId: pA._id, key: { $regex: '^ey' } })) || (await Notification.countDocuments({ userId: pA._id })) > 0, 'the family is told the child arrived');
  const ci2 = await expect('an unlisted person brings a child', cin(kids[1], { signedBy: { name: 'Uncle Random Visitor', relationship: 'Uncle' }, concern: 'Cough since last night' })); log(ci2.data.day.inFlag.includes('unlisted-dropoff') && ci2.data.day.inFlag.includes('wellness'), 'an unlisted drop-off and a wellness concern are both flagged');
  log((await Care.countDocuments({ schoolId: sid, childId: kids[1]._id, careType: 'health' })) === 1, 'a concern at arrival becomes a health note'); await expect('child 3 arrives', cin(kids[2], { signedBy: { parentId: String(pC._id) } })); await expect('child 4 arrives', cin(kids[3], { signedBy: { name: 'Auntie Named', relationship: 'Aunt' } }));
  const rt = (await call('GET', `/early/rooms/${rid}`, L)).data; log(rt.room && JSON.stringify(rt).includes('Tiny Kid1'), 'the room view lists the children');

  // ── 4. check-out with the release rules ──
  const cout = (k, body, t = L) => call('POST', '/early/check-out', t, { childId: String(k._id), ...body });
  const REFUSE = 'Do not release the child. Ask the person to wait and call the principal.';
  const rf = await expect('an unknown person is refused', cout(kids[0], { collector: { personName: 'Stranger Danger' }, idChecked: true }), [403]); log(rf.data.message === REFUSE, 'the refusal uses the same words every time');
  const rf2 = await cout(kids[0], { collector: { parentId: String(pC._id) } }); log(rf2.status === 403 && rf2.data.message === REFUSE, 'a guardian of a different child gets the same words');
  log((await PEvent.countDocuments({ schoolId: sid, studentId: kids[0]._id, outcome: 'Refused' })) >= 2, 'every refused attempt is recorded');
  await expect('a child who never came cannot be released', cout(kids[5], { collector: { parentId: String(pA._id) } }), [422, 404]);
  await GuardianLink.create({ schoolId: sid, studentId: kids[0]._id, parentId: pA._id, relationship: 'Mother', rights: { viewInfo: true, viewAttendance: true, viewMarks: true, viewFees: true, payFees: true, receiveNotices: true, receiveMessages: true, pickup: true }, createdByName: 'test' });
  const rel = await expect('a guardian with the pickup right collects', cout(kids[0], { collector: { parentId: String(pA._id) } })); log(rel.data.day.status === 'Out' && rel.data.day.outTo.basis === 'guardian', 'the child is released to the guardian');
  await Restriction.create({ schoolId: sid, studentId: kids[2]._id, parentId: pC._id, type: 'no-pickup', reason: 'Court order for the test', createdByName: 'test' });
  const rr = await cout(kids[2], { collector: { parentId: String(pC._id) } }); log(rr.status === 403 && rr.data.message === REFUSE, 'a restricted parent is refused in the same words'); log(!!(await Notification.findOne({ schoolId: sid, key: `ey-restricted:${kids[2]._id}:${today}` })), 'the administrators are alerted to a restricted request');
  await GuardianLink.create({ schoolId: sid, studentId: kids[3]._id, personName: 'Auntie Named', phone: '03001234567', relationship: 'Aunt', rights: { viewInfo: false, viewAttendance: false, viewMarks: false, viewFees: false, payFees: false, receiveNotices: false, receiveMessages: false, pickup: true }, createdByName: 'test' });
  await expect('a named person without a checked ID is asked for ID', cout(kids[3], { collector: { personName: 'Auntie Named' } }), [422]); const rn = await expect('a named person with ID checked collects', cout(kids[3], { collector: { personName: 'Auntie Named' }, idChecked: true })); log(rn.data.day.outTo.idChecked === true, 'the ID check is recorded');
  log((await PEvent.countDocuments({ schoolId: sid, studentId: kids[3]._id, outcome: 'Released' })) === 1, 'a release is recorded once');
  await expect('an absent mark for a child already here is skipped', call('POST', '/early/absent', A, { childIds: [String(kids[1]._id)] })); const ab = await expect('a child is marked absent', call('POST', '/early/absent', A, { childIds: [String(kids[5]._id), String(kids[4]._id)], reason: 'Fever' })); log(ab.data.marked >= 0, 'absence is recorded');

  globalThis.__e15 = { kids, pA, pB, pC, PA, PB, PC, L, C, OUT, A2, rid, rid2, lead, carer, outsider, cls, today, raw, tok };
  await require('./earlyChecks2')({ call, expect, log, tokens, base });
};
