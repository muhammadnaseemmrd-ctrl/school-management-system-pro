// Money across a group of schools: totals and expenses for the head office, and no child's
// fee record anywhere in them.

module.exports = async ({ call, expect, log, tokens }) => {
  const SA = tokens.superadmin;
  const A = tokens.admin;

  /* ── a group with one school that already has fees and payroll ── */
  const org = (await expect('a group is made', call('POST', '/organizations', SA, { name: 'Money Group' }), [201])).data.organization;
  const me = (await call('GET', '/schools/my', A)).data.school;
  await expect('the demo school joins it', call('POST', `/organizations/${org._id}/schools`, SA, { schoolId: me._id }));
  const made = (await expect('it gets a director', call('POST', `/organizations/${org._id}/directors`, SA, { name: 'Money Director', email: 'money.director@group.example' }), [201])).data;
  const D = (await call('POST', '/director/login', null, { email: 'money.director@group.example', password: made.temporaryPassword })).data.accessToken;

  /* ── the group's money ── */
  const g = (await expect('the group’s money is shown', call('GET', '/director/finance', D))).data;
  log(g.period.key === 'year' && /twelve months/i.test(g.period.label), `it opens on the last twelve months ("${g.period.label}")`);
  log(g.schools.length === 1 && g.schools[0].code === me.code, 'the school is in it');
  const s = g.schools[0];
  log(['billed', 'collected', 'outstanding', 'overdue'].every((k) => typeof s.fees[k] === 'number'), 'fees are billed, collected, outstanding and overdue');
  log(['total', 'payroll', 'supplierBills', 'supplierOwed'].every((k) => typeof s.expenses[k] === 'number'), 'expenses are salaries and suppliers');
  log(typeof s.net === 'number' && s.net === Math.round((s.fees.collected - s.expenses.total) * 100) / 100, 'what is left over is collected minus spent');
  log(typeof g.totals.fees.collected === 'number' && g.totals.fees.collected === s.fees.collected, 'the group total adds the schools up');
  log(s.institutionType === 'school', 'each school says what kind it is');

  /* ── the figures are real, not placeholders ── */
  const fees = (await call('GET', '/finance/invoices?limit=200', A)).data;
  if ((fees.invoices || []).length) {
    const live = (fees.invoices || []).filter((i) => i.status !== 'Void').reduce((t, i) => t + (i.total || 0), 0);
    log(s.fees.billed > 0, `the school has really billed something (${s.fees.billed})`);
    log(s.fees.billed <= Math.round(live * 100) / 100 + 1, 'and the group office is not inventing a larger figure than the school has');
  }

  /* ── periods ── */
  const m = (await expect('this month alone can be asked for', call('GET', '/director/finance?period=month', D))).data;
  log(/this month/i.test(m.period.label), 'the window says which it is');
  log(m.totals.fees.billed <= g.totals.fees.billed + 1, 'one month is never more than twelve');
  const all = (await expect('and everything so far', call('GET', '/director/finance?period=all', D))).data;
  log(all.period.from === null, 'everything has no start date');
  log(all.totals.fees.billed >= g.totals.fees.billed - 1, 'and is never less than twelve months');
  const junk = (await expect('a window we do not know falls back', call('GET', '/director/finance?period=since-forever', D))).data;
  log(junk.period.key === 'year', 'to the last twelve months');

  /* ── one school, in detail ── */
  const one = (await expect('one school opens in detail', call('GET', `/director/schools/${me._id}/finance`, D))).data;
  log(one.school.code === me.code && Array.isArray(one.months), 'it comes back month by month');
  log(typeof one.collectedBy === 'object' && Array.isArray(one.biggestBills), 'with how families paid and the largest bills');
  log(one.months.every((x) => /^\d{4}-\d{2}$/.test(x.month)), 'every month is a real month');
  log(one.fees.collected === s.fees.collected, 'and it agrees with the group view');

  /* ── no child, anywhere ── */
  const text = JSON.stringify(g) + JSON.stringify(one);
  log(!/admissionNumber/.test(text), 'no admission number appears in the group office');
  log(!/studentId|guardian/i.test(text), 'no child or guardian is named');
  const kids = (await call('GET', '/students?limit=3', A)).data.students || [];
  if (kids.length) log(!text.includes(kids[0].name), `the school's own children are not in it (checked "${kids[0].name}")`);
  const peek = await call('GET', '/finance/invoices?limit=5', D);
  log(peek.status === 403, 'and a director still cannot open the school’s own fee screens');

  /* ── only your own group ── */
  const other = (await expect('a second group', call('POST', '/organizations', SA, { name: 'Other Money Group' }), [201])).data.organization;
  const od = (await expect('with its own director', call('POST', `/organizations/${other._id}/directors`, SA, { name: 'Other', email: 'other.money@group.example' }), [201])).data;
  const O = (await call('POST', '/director/login', null, { email: 'other.money@group.example', password: od.temporaryPassword })).data.accessToken;
  const theirs = (await call('GET', '/director/finance', O)).data;
  log(theirs.schools.length === 0 && theirs.totals.fees.collected === 0, 'another group’s director sees none of this money');
  const reach = await call('GET', `/director/schools/${me._id}/finance`, O);
  log(reach.status === 404, 'and cannot open this school’s figures');

  /* ── nobody else gets in ── */
  const byAdmin = await call('GET', '/director/finance', A);
  log(byAdmin.status === 403, 'a school administrator cannot open the group’s money');
  const bySa = await call('GET', '/director/finance', SA);
  log(bySa.status === 403, 'nor the platform owner through this door');

  /* ── tidy up, so the rest of the suite sees the school outside any group ── */
  await call('DELETE', `/organizations/${org._id}/schools/${me._id}`, SA);
};
