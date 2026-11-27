// What kind of place this is, and what that means: a school has a nursery and no registrar, a
// university the other way round. The menu hides what a kind does not use, and the door refuses it.

module.exports = async ({ call, expect, log, tokens }) => {
  const A = tokens.admin;

  const cat = (await expect('the kinds of institution are listed', call('GET', '/schools/institution-types', A))).data;
  const keys = (cat.types || []).map((t) => t.key);
  log(keys.length === 5 && keys.includes('school') && keys.includes('university') && keys.includes('academy'), `five kinds (${keys.join(', ')})`);
  log(cat.types.every((t) => t.label && t.blurb && t.words && Array.isArray(t.hide)), 'each says what it is called, what it means and what it leaves out');
  log(cat.mine && cat.mine.key === 'school', 'a school that has never been asked is a school');

  const me = (await call('GET', '/schools/my', A)).data.school;
  const sid = me._id;

  /* ── a school ── */
  log(!(cat.mine.hide || []).includes('earlyYears'), 'a school keeps its nursery');
  log((cat.mine.hide || []).includes('registrar'), 'and has no registrar');
  const reg0 = await call('GET', '/registrar/programs', A);
  log(reg0.status === 403 && reg0.data.code === 'NOT_FOR_THIS_INSTITUTION', `the registrar is refused, with a reason: "${reg0.data.message}"`);
  const early0 = await call('GET', '/early/rooms', A);
  log(early0.status !== 403 || early0.data?.code !== 'NOT_FOR_THIS_INSTITUTION', 'the nursery answers');

  /* ── becoming a university ── */
  await expect('a kind we do not have is refused', call('PUT', `/schools/${sid}`, A, { institutionType: 'spaceship' }), [400]);
  await expect('the school becomes a university', call('PUT', `/schools/${sid}`, A, { institutionType: 'university' }));
  const uni = (await call('GET', '/schools/institution-types', A)).data;
  log(uni.mine.key === 'university' && uni.mine.words.groups === 'Sections', 'it now calls its classes sections');
  const reg1 = await call('GET', '/registrar/programs', A);
  log(reg1.status !== 403 || reg1.data?.code !== 'NOT_FOR_THIS_INSTITUTION', 'the registrar answers straight away, without waiting for a cache to lapse');
  const early1 = await call('GET', '/early/rooms', A);
  log(early1.status === 403 && early1.data.code === 'NOT_FOR_THIS_INSTITUTION', 'and the nursery is now refused');
  const gate1 = await call('GET', '/safety/overview', A);
  log(gate1.status === 403, 'so is the gate desk, which a university does not run');

  /* ── an academy ── */
  await expect('and then an academy', call('PUT', `/schools/${sid}`, A, { institutionType: 'academy' }));
  const ac = (await call('GET', '/schools/institution-types', A)).data;
  log(ac.mine.words.learners === 'Learners' && ac.mine.words.groups === 'Batches', 'an academy has learners in batches, not students in classes');
  log(ac.mine.hide.includes('registrar') && ac.mine.hide.includes('earlyYears') && ac.mine.hide.includes('advancement'), 'and leaves out the registrar, the nursery and alumni');
  const adv = await call('GET', '/advancement/me', A);
  log(adv.status === 403 && adv.data.code === 'NOT_FOR_THIS_INSTITUTION', 'alumni and giving are refused for an academy');
  const train = await call('GET', '/training/courses', A);
  log(train.status !== 403 || train.data?.code !== 'NOT_FOR_THIS_INSTITUTION', 'but courses, which every kind runs, still answer');

  /* ── the shared heart of the product is never gated ── */
  const shared = [['GET', '/students?limit=1'], ['GET', '/teachers?limit=1'], ['GET', '/finance/invoices?limit=1'], ['GET', '/studio/templates'], ['GET', '/dataio/modules'], ['GET', '/hr/employees?limit=1']];
  let open = 0;
  for (const [m, u] of shared) { const r = await call(m, u, A); if (r.data?.code !== 'NOT_FOR_THIS_INSTITUTION') open += 1; }
  log(open === shared.length, `attendance, fees, people, documents and imports work whatever the kind (${open}/${shared.length})`);

  /* ── put it back, so the rest of the suite sees the school it expects ── */
  await expect('the school goes back to being a school', call('PUT', `/schools/${sid}`, A, { institutionType: 'school' }));
  const back = await call('GET', '/registrar/programs', A);
  log(back.status === 403, 'and the registrar closes again');

  /* ── a teacher cannot change what kind of place they work at ── */
  const t = await call('PUT', `/schools/${sid}`, tokens.teacher, { institutionType: 'university' });
  log(t.status === 403, 'only an administrator sets the kind of institution');
};
