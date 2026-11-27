// Finding a child's ID card from the child's own record, rather than knowing a studio exists.

module.exports = async ({ call, expect, log, tokens }) => {
  const A = tokens.admin;
  const me = (await call('GET', '/schools/my', A)).data.school;
  const kid = ((await call('GET', '/students?limit=1', A)).data.students || [])[0];
  if (!kid) { log(false, 'there is a child to issue to'); return; }

  const d0 = (await expect('a child’s documents can be listed from their record', call('GET', `/studio/person/student/${kid._id}`, A))).data;
  log(d0.person.name === kid.name, 'it names the child');
  log(Array.isArray(d0.designs) && Array.isArray(d0.issued) && Array.isArray(d0.missing), 'it says what can be made, what exists and what is not drawn yet');
  log(d0.missing.includes('idCard') || d0.designs.some((x) => x.family === 'idCard'), 'an ID card is among the things a child can be given');
  log(!d0.designs.some((x) => x.family === 'staffBadge'), 'a staff badge is not offered for a child');

  const t = ((await call('GET', '/teachers?limit=1', A)).data.teachers || [])[0];
  if (t) {
    const td = (await expect('a teacher’s documents too', call('GET', `/studio/person/teacher/${t._id}`, A))).data;
    log(td.missing.includes('staffBadge') || td.designs.some((x) => x.family === 'staffBadge'), 'a staff badge is offered for a teacher');
    log(!td.designs.some((x) => x.family === 'reportCard'), 'a report card is not offered for a teacher');
  }

  await expect('a kind of person we do not issue to', call('GET', `/studio/person/parent/${kid._id}`, A), [404]);
  await expect('somebody who is not here', call('GET', '/studio/person/student/000000000000000000000000', A), [404]);

  /* ── draw a card, approve it, and hand one out from the child's record ── */
  const User = require('../models/User');
  const { hashPassword } = require('../utils/password');
  const { generateAccessToken } = require('../utils/jwt');
  let mate = await User.findOne({ schoolId: me._id, role: 'admin', email: 'persondoc.mate@demo.school' });
  if (!mate) mate = await User.create({ schoolId: me._id, name: 'Doc Colleague', email: 'persondoc.mate@demo.school', password: await hashPassword('Second@123'), role: 'admin', isActive: true });
  const A2 = generateAccessToken(mate._id, String(me._id), 'admin');

  const made = (await expect('an ID card design is drawn', call('POST', '/studio/templates', A, { name: 'Smoke student card', family: 'idCard' }), [201])).data.template;
  const ver = ((await call('GET', `/studio/templates/${made._id}`, A)).data.versions || [])[0];
  await call('POST', `/studio/templates/${made._id}/versions/${ver._id}/submit`, A, {});
  await expect('and approved by a colleague', call('POST', `/studio/templates/${made._id}/versions/${ver._id}/approve`, A2, { note: 'Fine' }));

  const d1 = (await call('GET', `/studio/person/student/${kid._id}`, A)).data;
  const card = d1.designs.find((x) => String(x._id) === String(made._id));
  log(card && card.ready, 'the approved card now shows on the child’s record as ready');
  log(!d1.missing.includes('idCard'), 'and is no longer listed as missing');

  // Another suite may already have given this child a card. One current card per child is the
  // studio's own rule, so either outcome is right; what matters is that the child ends up with one
  // and that it shows on their record.
  const res = await call('POST', '/studio/issue', A, { templateId: made._id, subjectIds: [String(kid._id)] });
  const issued = (res.data.issued || [])[0];
  const skipped = (res.data.skipped || [])[0];
  log([200, 201, 422].includes(res.status), `a card is asked for (${res.status})`);
  log(!!issued || /already has a current/i.test(skipped?.reason || ''), issued ? `a card was made (${issued.serial})` : `the child already had one, and is not given a second (${skipped?.reason})`);

  const d2 = (await call('GET', `/studio/person/student/${kid._id}`, A)).data;
  const cards = d2.issued.filter((x) => x.family === 'idCard' && x.status === 'Issued');
  log(cards.length === 1 && !!cards[0].serial, `exactly one current card shows on the child’s record (${cards[0] && cards[0].serial})`);

  /* ── only people who may issue documents ── */
  const byTeacher = await call('GET', `/studio/person/student/${kid._id}`, tokens.teacher);
  log(byTeacher.status === 403, 'a teacher without the documents permission cannot open this');

  /* ── a child from another school ── */
  const stray = await call('GET', '/studio/person/student/000000000000000000000001', A);
  log(stray.status === 404, 'and a child who is not ours is simply not found');
};
