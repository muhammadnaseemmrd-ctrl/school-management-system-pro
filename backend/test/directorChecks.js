// A group of schools under one director: the Iqra case. The director opens schools, appoints the
// people who run them, and sees the group — and may never read inside a school.

module.exports = async ({ call, expect, log, tokens, base }) => {
  const SA = tokens.superadmin;
  const A = tokens.admin;

  /* ── the platform owner makes a group and its director ── */
  const org = (await expect('the owner makes a group', call('POST', '/organizations', SA, { name: 'Iqra Education System' }), [201])).data.organization;
  const made = (await expect('the owner appoints its director', call('POST', `/organizations/${org._id}/directors`, SA, { name: 'Iqra Director', email: 'director@iqra.example', title: 'Director' }), [201])).data;
  log(!!made.temporaryPassword && made.director.canCreateSchools, 'the director gets a first-time password and may open schools');
  await expect('two directors cannot share an address', call('POST', `/organizations/${org._id}/directors`, SA, { name: 'Again', email: 'director@iqra.example' }), [409]);
  const listed = (await expect('the owner can see a group\'s directors', call('GET', `/organizations/${org._id}/directors`, SA))).data;
  log(listed.directors.length === 1, 'the director is listed under the group');

  /* ── signing in ── */
  const badPw = await call('POST', '/director/login', null, { email: 'director@iqra.example', password: 'wrong-password' });
  log(badPw.status === 401, 'a wrong password is refused');
  const li = (await expect('the director signs in', call('POST', '/director/login', null, { email: 'director@iqra.example', password: made.temporaryPassword }))).data;
  const D = li.accessToken;
  log(li.user.role === 'director' && !li.school, 'a director has no school of their own');
  log(li.user.organization && li.user.organization.name === 'Iqra Education System', 'they are signed in to their group');

  /* ── a director cannot reach a school's records ── */
  const peeks = [
    ['GET', '/students?limit=5'], ['GET', '/teachers?limit=5'], ['GET', '/classes?limit=5'],
    ['GET', '/schools/my'], ['GET', '/fees'], ['GET', '/dataio/modules'],
  ];
  let blocked = 0;
  for (const [m, u] of peeks) { const r = await call(m, u, D); if (r.status === 403) blocked += 1; }
  log(blocked === peeks.length, `a director is turned away from every school door (${blocked}/${peeks.length})`);
  await expect('and from the owner console', call('GET', '/superadmin/schools', D), [403]);
  await expect('a school administrator cannot use the director portal', call('GET', '/director/overview', A), [403]);

  /* ── opening schools in the group ── */
  const ov0 = (await expect('the group opens empty', call('GET', '/director/overview', D))).data;
  log(ov0.totals.schools === 0 && ov0.organization.name === 'Iqra Education System', 'no schools yet');

  await expect('a school needs a name', call('POST', '/director/schools', D, { code: 'IQ-A', email: 'a@iqra.example', phone: '051', adminName: 'Head', adminEmail: 'head.a@iqra.example' }), [400]);
  await expect('a school needs somebody to run it', call('POST', '/director/schools', D, { name: 'Iqra A', code: 'IQ-A', email: 'a@iqra.example', phone: '051' }), [400]);
  await expect('a director cannot make themselves a head teacher', call('POST', '/director/schools', D, { name: 'Iqra A', code: 'IQ-A', email: 'a@iqra.example', phone: '051', adminName: 'Me', adminEmail: 'director@iqra.example' }), [422]);

  const s1 = (await expect('the director opens a school', call('POST', '/director/schools', D, {
    name: 'Iqra Model School, Satellite Town', nameUr: 'اقرا ماڈل اسکول', code: 'IQ-A', email: 'satellite@iqra.example',
    phone: '051 1234567', city: 'Rawalpindi', adminName: 'Farah Siddiqui', adminEmail: 'farah@iqra.example',
  }), [201])).data;
  log(!!s1.admin.temporaryPassword && s1.admin.schoolCode === 'IQ-A', 'it hands back the head teacher\'s first-time password and the school code');

  const s2 = (await expect('and a second one', call('POST', '/director/schools', D, {
    name: 'Iqra Model School, Chaklala', code: 'IQ-B', email: 'chaklala@iqra.example', phone: '051 7654321',
    adminName: 'Tariq Javed', adminEmail: 'tariq@iqra.example',
  }), [201])).data;

  await expect('two schools cannot share a code', call('POST', '/director/schools', D, { name: 'Iqra C', code: 'IQ-A', email: 'c@iqra.example', phone: '051', adminName: 'X Y', adminEmail: 'x@iqra.example' }), [409]);
  await expect('nor an email address', call('POST', '/director/schools', D, { name: 'Iqra C', code: 'IQ-C', email: 'satellite@iqra.example', phone: '051', adminName: 'X Y', adminEmail: 'x2@iqra.example' }), [409]);

  const ov = (await expect('the group now shows both', call('GET', '/director/overview', D))).data;
  log(ov.totals.schools === 2 && ov.totals.open === 2, 'two schools, both open');
  log(ov.schools.every((s) => s.counts && typeof s.counts.students === 'number'), 'each school shows counts, not records');
  log(JSON.stringify(ov).indexOf('admissionNumber') === -1, 'no child appears anywhere in the group view');

  /* ── the head teacher really can run their school ── */
  const hl = (await expect('the new head teacher signs in', call('POST', '/auth/login', null, { email: 'farah@iqra.example', password: s1.admin.temporaryPassword, schoolCode: 'IQ-A' }))).data;
  const H = hl.accessToken;
  log(hl.user.role === 'admin' && hl.school.code === 'IQ-A', 'they land in their own school');
  const theirs = (await expect('and see their own school', call('GET', '/schools/my', H))).data;
  log(theirs.school.nameUr === 'اقرا ماڈل اسکول', 'the Urdu name the director set came through');
  const crossA = await call('GET', `/director/schools/${s2.school._id}`, H);
  log(crossA.status === 403, 'a head teacher cannot look at the group');

  /* ── appointing more people ── */
  const extra = (await expect('the director appoints a principal', call('POST', `/director/schools/${s1.school._id}/admins`, D, { name: 'Imran Qureshi', email: 'imran@iqra.example', title: 'Principal' }), [201])).data;
  log(!!extra.temporaryPassword, 'they get a first-time password too');
  await expect('the same person is not appointed twice', call('POST', `/director/schools/${s1.school._id}/admins`, D, { name: 'Imran Qureshi', email: 'imran@iqra.example' }), [409]);
  const det = (await expect('the school shows who runs it', call('GET', `/director/schools/${s1.school._id}`, D))).data;
  log(det.admins.length === 2, 'both people are listed');
  log(det.campuses.length >= 0, 'its branches are listed');

  const pl = await call('POST', '/auth/login', null, { email: 'imran@iqra.example', password: extra.temporaryPassword, schoolCode: 'IQ-A' });
  log(pl.status === 200, 'the principal can sign in');

  const rst = (await expect('the director can reset their password', call('POST', `/director/schools/${s1.school._id}/admins/${det.admins[1]._id}/reset`, D), [200])).data;
  const pl2 = await call('POST', '/auth/login', null, { email: 'imran@iqra.example', password: rst.temporaryPassword, schoolCode: 'IQ-A' });
  log(pl2.status === 200, 'the new password works');
  const plOld = await call('POST', '/auth/login', null, { email: 'imran@iqra.example', password: extra.temporaryPassword, schoolCode: 'IQ-A' });
  log(plOld.status === 401, 'and the old one no longer does');

  await expect('the last person running a school cannot be switched off', call('POST', `/director/schools/${s2.school._id}/admins/${(await call('GET', `/director/schools/${s2.school._id}`, D)).data.admins[0]._id}/active`, D, { active: false }), [422]);
  await expect('but one of two can be', call('POST', `/director/schools/${s1.school._id}/admins/${det.admins[1]._id}/active`, D, { active: false }));

  /* ── a director may only touch their own group ── */
  const other = (await expect('the owner makes a second group', call('POST', '/organizations', SA, { name: 'Another Trust' }), [201])).data.organization;
  const om = (await expect('with its own director', call('POST', `/organizations/${other._id}/directors`, SA, { name: 'Other Director', email: 'other@trust.example' }), [201])).data;
  const ol = (await call('POST', '/director/login', null, { email: 'other@trust.example', password: om.temporaryPassword })).data;
  const O = ol.accessToken;
  const reach = await call('GET', `/director/schools/${s1.school._id}`, O);
  log(reach.status === 404, 'the other group\'s director cannot see this group\'s school');
  const touch = await call('PATCH', `/director/schools/${s1.school._id}`, O, { name: 'Renamed by a stranger' });
  log(touch.status === 404, 'nor change it');
  const addTo = await call('POST', `/director/schools/${s1.school._id}/admins`, O, { name: 'Sneaky Person', email: 'sneak@trust.example' });
  log(addTo.status === 404, 'nor appoint anybody to it');
  const ov2 = (await call('GET', '/director/overview', O)).data;
  log(ov2.totals.schools === 0, 'their own group is still empty');

  /* ── closing and reopening a school ── */
  await expect('closing a school needs a reason', call('POST', `/director/schools/${s2.school._id}/open`, D, { open: false }), [400]);
  await expect('the director closes a school', call('POST', `/director/schools/${s2.school._id}/open`, D, { open: false, reason: 'Building work until April' }));
  const shut = await call('POST', '/auth/login', null, { email: 'tariq@iqra.example', password: s2.admin.temporaryPassword, schoolCode: 'IQ-B' });
  log([403, 423].includes(shut.status), 'its head teacher cannot sign in while it is closed');
  await expect('and opens it again', call('POST', `/director/schools/${s2.school._id}/open`, D, { open: true }));
  const back = await call('POST', '/auth/login', null, { email: 'tariq@iqra.example', password: s2.admin.temporaryPassword, schoolCode: 'IQ-B' });
  log(back.status === 200, 'then they can');

  /* ── the owner can rein a director in ── */
  await expect('the owner takes away the right to open schools', call('PATCH', `/organizations/${org._id}/directors/${made.director._id}`, SA, { canCreateSchools: false }));
  const denied = await call('POST', '/director/schools', D, { name: 'Iqra D', code: 'IQ-D', email: 'd@iqra.example', phone: '051', adminName: 'A B', adminEmail: 'ab@iqra.example' });
  log(denied.status === 403, 'and then they cannot');
  await expect('the owner suspends the director', call('PATCH', `/organizations/${org._id}/directors/${made.director._id}`, SA, { isActive: false }));
  const gone = await call('GET', '/director/overview', D);
  log(gone.status === 423, 'their portal closes mid-session');
  const noLogin = await call('POST', '/director/login', null, { email: 'director@iqra.example', password: made.temporaryPassword });
  log(noLogin.status === 403, 'and they cannot sign in again');
  await expect('the owner lets them back in', call('PATCH', `/organizations/${org._id}/directors/${made.director._id}`, SA, { isActive: true, canCreateSchools: true }));

  /* ── suspending the group stops its directors ── */
  await expect('the owner suspends the group', call('PATCH', `/organizations/${org._id}`, SA, { status: 'suspended' }));
  const orgShut = await call('POST', '/director/login', null, { email: 'director@iqra.example', password: made.temporaryPassword });
  log(orgShut.status === 403, 'a suspended group lets nobody in');
  await expect('and lifts it', call('PATCH', `/organizations/${org._id}`, SA, { status: 'active' }));
};
