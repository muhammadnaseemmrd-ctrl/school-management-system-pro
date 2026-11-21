// Analytics (E25), part two: saved and scheduled reports, jobs with owners, the teacher time pulse, versioned definitions, isolation.
module.exports = async ({ call, expect, log, tokens, base, F }) => {
  const { X, Y, today, ad, win, P, G, PO, PU, m, val, mg } = F; const { Teacher, User } = F.models;
  const AnRun = require('../models/AnRun'); const AnSchedule = require('../models/AnSchedule'); const AnAction = require('../models/AnAction'); const AnPulse = require('../models/AnPulse'); const Notification = require('../models/Notification');
  const School = require('../models/School'); const Svc = require('../utils/analytics/service'); const { hashPassword } = require('../utils/password'); const { generateAccessToken } = require('../utils/jwt');
  const PA = (p, b, t) => call('PATCH', p, t, b || {}); const id = (r) => r.data && r.data._id; const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const raw = (path, token) => fetch(`${base}/api${path}`, { headers: { authorization: `Bearer ${token}` } });
  const mine = async (t, key) => Notification.countDocuments({ userId: t._id, key: new RegExp(`^${key}`) });
  console.log('\n— Analytics: reports, jobs, pulse, definitions —');

  // ── 1. scheduled reports ──
  await expect('a teacher cannot manage reports', G(`${P}/schedules`, X.TH), [403]); await expect('a campus administrator cannot manage reports', G(`${P}/schedules`, X.A3), [403]);
  const rec = (...u) => u.map((x) => ({ userId: String(x._id), role: x instanceof Teacher.prototype.constructor || x.schoolCode ? 'teacher' : 'admin' }));
  const base1 = { name: 'Weekly digest', metrics: ['attendance.rate', 'fees.collection', 'attendance.missing_registers'], cadence: 'weekly', dow, periodRule: 'last_7_days', groupBy: 'class', recipients: rec(X.a, X.tHead, X.tLead) };
  await expect('a report needs a measure', PO(`${P}/schedules`, { ...base1, metrics: [] }, X.A), [422]); await expect('a measure must exist', PO(`${P}/schedules`, { ...base1, metrics: ['nope.nothing'] }, X.A), [422]);
  await expect('weekly or monthly only', PO(`${P}/schedules`, { ...base1, cadence: 'daily' }, X.A), [422]); await expect('monthly days stop at 28', PO(`${P}/schedules`, { ...base1, cadence: 'monthly', dom: 31 }, X.A), [422]);
  await expect('a report needs people', PO(`${P}/schedules`, { ...base1, recipients: [] }, X.A), [422]); await expect('people from another school cannot be named', PO(`${P}/schedules`, { ...base1, recipients: [{ userId: String(Y.a._id), role: 'admin' }] }, X.A), [422]);
  await expect('the period must be one of the choices', PO(`${P}/schedules`, { ...base1, periodRule: 'forever' }, X.A), [422]);
  const sc1 = await PO(`${P}/schedules`, base1, X.A); const sid1 = id(sc1);
  log(sc1.status === 201 && sc1.data.nextDate > today && sc1.data.recipients.find((r) => r.role === 'teacher' && r.name.includes('TeachA')).missing.join() === 'Fees collected' && sc1.data.recipients.find((r) => r.role === 'admin').missing.length === 0, 'a new report says what each person will not see before anyone is surprised');
  const run1 = await PO(`${P}/schedules/${sid1}/run`, {}, X.A); const runs1 = run1.data.runs || [];
  log(run1.status === 200 && runs1.length === 3 && new Set(runs1.map((r) => r.level)).size === 3, 'one run per distinct view: administrator, curriculum lead and the class teacher');
  const full = async (rr, t) => (await G(`${P}/runs/${rr._id}`, t)).data; const runT = runs1.find((r) => r.level === 'teacher'); const runL = runs1.find((r) => r.level === 'lead'); const runAdm = runs1.find((r) => r.level === 'admin');
  const dT = await full(runT, X.TH); const dA = await full(runAdm, X.A); const dL = await full(runL, X.TL);
  log(dT.results.map((r) => r.key).join() === 'attendance.rate,attendance.missing_registers' && dT.hidden.length === 1 && dT.hidden[0].key === 'fees.collection' && dT.hidden[0].why, 'the teacher\'s copy leaves out the fee figures and says so');
  log(dA.results.length === 3 && dA.exceptions.some((e) => e.metricKey === 'attendance.missing_registers' && e.severity === 'critical') && dA.hash.length === 32 && dL.results.length === 2, 'the administrator\'s copy has all three and its urgent exceptions');
  log(runAdm.from === ad(-7) && runAdm.to === ad(-1) && runAdm.periodKey === Svc.isoWeek(today), 'the period follows the rule: the seven days before today');
  await expect('the teacher can open their own copy', G(`${P}/runs/${runT._id}`, X.TH), [200]); await expect('the teacher cannot open the administrator\'s copy', G(`${P}/runs/${runAdm._id}`, X.TH), [404]); await expect('nor the lead the teacher\'s', G(`${P}/runs/${runT._id}`, X.TL), [404]);
  await expect('a school-wide administrator can open every copy', G(`${P}/runs/${runT._id}`, X.A2), [200]); await expect('a campus administrator cannot', G(`${P}/runs/${runAdm._id}`, X.A3), [404]); await expect('another school cannot', G(`${P}/runs/${runAdm._id}`, Y.A), [404]);
  const lt = await G(`${P}/runs`, X.TH); const la = await G(`${P}/runs`, X.A); log(lt.data.total === 1 && la.data.total >= 3, 'each person lists only the runs they may open');
  log((await mine(X.tHead, 'an:run:')) === 1 && (await mine(X.tLead, 'an:run:')) === 1 && (await mine(X.a, 'an:run:')) === 1, 'each person on the report was told it is ready');
  const again = await PO(`${P}/schedules/${sid1}/run`, {}, X.A); log(again.status === 200 && (await AnRun.countDocuments({ scheduleId: sid1 })) === 3 && (await mine(X.tHead, 'an:run:')) === 1, 'running the same period again makes no second copy and sends no second notice');
  const csv = await raw(`/analytics/runs/${runAdm._id}/file/csv`, X.A); const csvT = await csv.text(); const pdf = await raw(`/analytics/runs/${runAdm._id}/file/pdf`, X.A); const pdfB = Buffer.from(await pdf.arrayBuffer());
  log(csv.status === 200 && csvT.startsWith('Measure,Group') && csvT.includes('Attendance rate') && pdf.status === 200 && pdfB.slice(0, 4).toString() === '%PDF' && pdfB.length > 1500, 'a saved run downloads as CSV and as a printable PDF');
  log((await raw(`/analytics/runs/${runAdm._id}/file/pdf`, X.TH)).status === 404 && (await raw(`/analytics/runs/${runAdm._id}/file/xls`, X.A)).status === 404, 'files follow the same access rules and only the known formats exist');
  await AnSchedule.updateOne({ _id: sid1 }, { $set: { nextDate: ad(-1) } }); const sw1 = await PO(`${P}/sweep`, {}, X.A); const after = await AnSchedule.findById(sid1);
  log(sw1.status === 200 && sw1.data.ran === 3 && after.nextDate > today && after.lastError === '', 'the daily sweep runs what is due and moves the next date on');
  const sw2 = await PO(`${P}/sweep`, {}, X.A); log(sw2.data.ran === 0, 'a second sweep finds nothing due');
  await expect('a report can be paused', PA(`${P}/schedules/${sid1}`, { active: false }, X.A), [200]); await AnSchedule.updateOne({ _id: sid1 }, { $set: { nextDate: ad(-1) } }); log((await PO(`${P}/sweep`, {}, X.A)).data.ran === 0, 'a paused report is not run');
  await expect('and started again', PA(`${P}/schedules/${sid1}`, { active: true, name: 'Weekly leadership digest' }, X.A), [200]);
  const sc2 = await PO(`${P}/schedules`, { ...base1, name: 'Only the idle teacher', recipients: rec(X.tNone) }, X.A); await Teacher.updateOne({ _id: X.tNone._id }, { $set: { isActive: false } });
  await expect('a report whose people are all gone cannot run', PO(`${P}/schedules/${id(sc2)}/run`, {}, X.A), [409]); await AnSchedule.updateOne({ _id: id(sc2) }, { $set: { nextDate: ad(-1) } }); const sw3 = await PO(`${P}/sweep`, {}, X.A);
  log(sw3.data.failed === 1 && (await AnSchedule.findById(id(sc2))).lastError.includes('reached'), 'the sweep records why a report could not run'); await Teacher.updateOne({ _id: X.tNone._id }, { $set: { isActive: true } });
  await expect('a pack needs a title', PO(`${P}/runs`, { keys: ['attendance.rate'], from: ad(-10), to: today }, X.A), [422]);
  const pk = await PO(`${P}/runs`, { title: 'Board pack', kind: 'pack', keys: ['attendance.rate', 'fees.collection'], from: ad(-10), to: today, groupBy: 'standard' }, X.A); const pkT = await PO(`${P}/runs`, { title: 'My classes', kind: 'pack', keys: ['attendance.rate', 'fees.collection'], from: ad(-10), to: today }, X.TH);
  const pkTd = (await G(`${P}/runs/${id(pkT)}`, X.TH)).data; log(pk.status === 201 && pk.data.measures === 2 && pkT.status === 201 && pkTd.results.length === 1 && pkTd.hidden[0].key === 'fees.collection', 'a pack holds only what its maker may see; the rest is listed as left out');
  const pkPdf = await raw(`/analytics/runs/${id(pkT)}/file/pdf`, X.TH); log(pkPdf.status === 200 && Buffer.from(await pkPdf.arrayBuffer()).slice(0, 4).toString() === '%PDF', 'a teacher\'s own pack prints');

  // ── 2. jobs with owners ──
  const job = { title: 'Chase 8-A registers', detail: 'Two days had none', metricKey: 'attendance.missing_registers', groupKey: String(X.c8a._id), groupLabel: '8-A', classId: String(X.c8a._id), ownerId: String(X.tOther._id), ownerRole: 'teacher', dueOn: ad(7), source: 'exception' };
  await expect('a teacher cannot hand out jobs', PO(`${P}/jobs`, job, X.TH), [403]); await expect('the title needs words', PO(`${P}/jobs`, { ...job, title: 'x' }, X.A), [422]); await expect('the date cannot be in the past', PO(`${P}/jobs`, { ...job, dueOn: ad(-1) }, X.A), [422]);
  await expect('the owner must belong to this school', PO(`${P}/jobs`, { ...job, ownerId: String(Y.tHead._id) }, X.A), [422]); await expect('the measure must exist', PO(`${P}/jobs`, { ...job, metricKey: 'nope.nothing' }, X.A), [422]);
  const j1 = await PO(`${P}/jobs`, job, X.A); log(j1.status === 201 && j1.data.ownerName.includes('TeachB') && !j1.data.overdue && (await mine(X.tOther, 'an:job:')) === 1, 'a job is made and its owner is told');
  const dup = await PO(`${P}/jobs`, job, X.A); log(dup.status === 409 && dup.data.reason === 'duplicate' && dup.data.jobId, 'a second open job for the same slip is refused and points at the first');
  const lo = await G(`${P}/jobs`, X.TO); const lh = await G(`${P}/jobs`, X.TH); const lc = await G(`${P}/jobs`, X.A3); log(lo.data.total === 1 && lh.data.total === 0 && lc.data.total === 1, 'the owner sees it, another teacher does not, and the campus administrator sees it because it is about their class');
  await expect('someone else cannot finish it', PO(`${P}/jobs/${id(j1)}/done`, {}, X.TH), [403]); const dn = await PO(`${P}/jobs/${id(j1)}/done`, { note: 'Registers now taken' }, X.TO); log(dn.status === 200 && (await mine(X.a, 'an:jobdone:')) === 1, 'the owner finishes it and the person who made it is told');
  await expect('a finished job cannot be finished again', PO(`${P}/jobs/${id(j1)}/done`, {}, X.TO), [409]);
  const j2 = await PO(`${P}/jobs`, { ...job, groupKey: 'x2', title: 'Review pass rates' }, X.A); await expect('a reason is needed to cancel', PO(`${P}/jobs/${id(j2)}/drop`, { reason: 'no' }, X.A), [422]);
  await expect('only an administrator reassigns', PO(`${P}/jobs/${id(j2)}/reassign`, { ownerId: String(X.tHead._id), ownerRole: 'teacher' }, X.TO), [403]); const rs = await PO(`${P}/jobs/${id(j2)}/reassign`, { ownerId: String(X.tHead._id), ownerRole: 'teacher', dueOn: ad(9) }, X.A);
  log(rs.status === 200 && (await G(`${P}/jobs`, X.TH)).data.total === 1 && (await mine(X.tHead, 'an:job:')) === 1, 'a job can be moved to someone else, who is told');
  await expect('a job is cancelled with a reason', PO(`${P}/jobs/${id(j2)}/drop`, { reason: 'No longer needed' }, X.A), [200]); await expect('and only once', PO(`${P}/jobs/${id(j2)}/drop`, { reason: 'No longer needed' }, X.A), [409]);
  const j3 = await PO(`${P}/jobs`, { ...job, groupKey: 'x3', title: 'Follow up fees' }, X.A); await AnAction.updateOne({ _id: id(j3) }, { $set: { dueOn: ad(-1) } }); const odue = (await G(`${P}/jobs`, X.TO)).data.jobs.find((j) => j.title === 'Follow up fees');
  const sw4 = await PO(`${P}/sweep`, {}, X.A); const sw5 = await PO(`${P}/sweep`, {}, X.A); log(odue.overdue && sw4.data.reminded === 1 && sw5.data.reminded === 0 && (await mine(X.tOther, 'an:late:')) === 1, 'an overdue job is flagged and its owner reminded once');
  const ovj = await G(`${P}/overview?${win}`, X.A); log(ovj.data.openJobs === 1 && ovj.data.jobs[0].title === 'Follow up fees', 'the overview carries the open jobs');

  // ── 3. the teacher time pulse ──
  const pm = await G(`${P}/pulse/me`, X.TH); log(pm.status === 200 && !pm.data.optedIn && pm.data.categories.length === 6 && pm.data.about.includes('voluntary') && pm.data.minPeople === 5, 'the pulse starts switched off and says it is voluntary');
  await expect('an administrator has no pulse of their own', G(`${P}/pulse/me`, X.A), [403]); const wk = Svc.isoWeek(today);
  const pe = await PU(`${P}/pulse/entry`, { week: wk, category: 'marking', minutes: 300 }, X.TH); log(pe.status === 409 && pe.data.reason === 'not_opted_in', 'nothing can be entered before joining');
  await expect('joining is the teacher\'s own choice', PO(`${P}/pulse/join`, {}, X.TH), [200]);
  for (const [label, b] of [['a made-up kind of work', { week: wk, category: 'gossip', minutes: 10 }], ['too many minutes', { week: wk, category: 'marking', minutes: 4000 }], ['a fraction of a minute', { week: wk, category: 'marking', minutes: 1.5 }], ['a future week', { week: Svc.isoWeek(ad(21)), category: 'marking', minutes: 10 }], ['a week from long ago', { week: Svc.isoWeek(ad(-300)), category: 'marking', minutes: 10 }], ['a week written wrongly', { week: '2026-47', category: 'marking', minutes: 10 }]]) await expect(`${label} is refused`, PU(`${P}/pulse/entry`, b, X.TH), [422]);
  await expect('an entry is saved', PU(`${P}/pulse/entry`, { week: wk, category: 'marking', minutes: 300 }, X.TH), [200]); await PU(`${P}/pulse/entry`, { week: wk, category: 'marking', minutes: 320 }, X.TH);
  log((await AnPulse.countDocuments({ schoolId: X.s._id, teacherId: X.tHead._id, kind: 'entry' })) === 1, 'entering the same week again updates it rather than adding');
  const rp0 = await G(`${P}/pulse/report`, X.A); log(rp0.status === 200 && rp0.data.categories.every((c) => c.suppressed && c.avgMinutes === null && c.people === null) && rp0.data.optedIn === null, 'with one teacher the school sees no figure at all');
  await expect('a teacher cannot read the school report', G(`${P}/pulse/report`, X.TH), [403]);
  const mins = [200, 250, 350, 400, 280]; for (let i = 0; i < 5; i += 1) { await PO(`${P}/pulse/join`, {}, X.TE[i]); await PU(`${P}/pulse/entry`, { week: wk, category: 'marking', minutes: mins[i] }, X.TE[i]); }
  const rp1 = await G(`${P}/pulse/report`, X.A); const mk1 = rp1.data.categories.find((c) => c.key === 'marking'); const pl1 = rp1.data.categories.find((c) => c.key === 'planning');
  log(mk1.people === 6 && mk1.avgMinutes === 300 && !mk1.suppressed && pl1.suppressed && rp1.data.optedIn === 6, 'six teachers: the marking average is shown (300 minutes), planning stays hidden');
  log(!JSON.stringify(rp1.data).includes(String(X.tHead._id)) && !JSON.stringify(rp1.data).includes('teacherId'), 'no individual appears anywhere in the school report');
  log((await G(`${P}/pulse/me`, X.TH)).data.schoolAvg.find((c) => c.key === 'marking').avgMinutes === 300, 'a teacher sees the school average beside their own entries');
  const lv = await PO(`${P}/pulse/leave`, { erase: true }, X.TH); log(lv.status === 200 && lv.data.erased === 1 && (await AnPulse.countDocuments({ schoolId: X.s._id, teacherId: X.tHead._id, kind: 'entry' })) === 0 && !(await G(`${P}/pulse/me`, X.TH)).data.optedIn, 'leaving can erase every entry');
  const rpH = await G(`${P}/pulse/report`, X.A); log(rpH.data.categories.find((c) => c.key === 'marking').people === 5 && rpH.data.optedIn === 5, 'five still joined: the figure remains');
  await PO(`${P}/pulse/leave`, {}, X.TE[0]); const rp2 = await G(`${P}/pulse/report`, X.A);
  log((await AnPulse.countDocuments({ schoolId: X.s._id, teacherId: X.extra[0]._id, kind: 'entry' })) === 1 && rp2.data.categories.find((c) => c.key === 'marking').suppressed && rp2.data.optedIn === null, 'leaving stops counting the person at once, and with four left the figure disappears, though their entries are kept for them');
  await PO(`${P}/pulse/join`, {}, X.TE[0]); log((await G(`${P}/pulse/report`, X.A)).data.categories.find((c) => c.key === 'marking').suppressed === false, 'joining again counts their earlier entries once more');

  // ── 4. definitions, versions and approval ──
  await expect('a teacher cannot read definitions', G(`${P}/definitions`, X.TH), [403]); await expect('a campus administrator cannot change them', PU(`${P}/definitions/attendance.rate`, { reason: 'Because', params: { leaveAs: 'absent' } }, X.A3), [403]);
  const defs0 = await G(`${P}/definitions`, X.A); log(defs0.status === 200 && defs0.data.measures.length === 15 && defs0.data.measures.every((d) => d.version === 0), 'all 15 start on the built-in definition');
  const draft = { reason: 'Approved leave should count against us', params: { leaveAs: 'absent' }, alert: { below: 88, criticalBelow: 75 }, target: 95, minCell: 3 };
  await expect('a reason is needed', PU(`${P}/definitions/attendance.rate`, { ...draft, reason: 'no' }, X.A), [422]); await expect('unknown settings are refused', PU(`${P}/definitions/attendance.rate`, { ...draft, params: { nope: 1 } }, X.A), [422]);
  await expect('a setting must be one of its choices', PU(`${P}/definitions/attendance.rate`, { ...draft, params: { leaveAs: 'maybe' } }, X.A), [422]); await expect('the smallest group is 1 to 30', PU(`${P}/definitions/attendance.rate`, { ...draft, minCell: 0 }, X.A), [422]);
  await expect('the urgent line cannot be on the wrong side of the line', PU(`${P}/definitions/attendance.rate`, { ...draft, alert: { below: 80, criticalBelow: 90 } }, X.A), [422]); await expect('a measure can never be opened to more people', PU(`${P}/definitions/fees.collection`, { reason: 'Everyone should see', minLevel: 'teacher' }, X.A), [422]);
  await expect('an unknown measure', PU(`${P}/definitions/nope.nothing`, draft, X.A), [404]);
  const pv = await PU(`${P}/definitions/attendance.rate`, draft, X.A); log(pv.status === 201 && pv.data.version === 1 && pv.data.status === 'pending' && val(await m('attendance.rate', X.A)) === 93.4, 'a change waits for approval and nothing moves yet');
  const own = await PO(`${P}/definitions/attendance.rate/decide`, { approve: true }, X.A); log(own.status === 403 && own.data.reason === 'maker_checker', 'the person who made the change cannot approve it');
  await expect('only one change can wait at a time', PU(`${P}/definitions/attendance.rate`, draft, X.A2), [409]); await expect('turning one down needs words', PO(`${P}/definitions/attendance.rate/decide`, { approve: false, note: 'no' }, X.A2), [422]);
  const rj = await PO(`${P}/definitions/attendance.rate/decide`, { approve: false, note: 'Not yet, discuss at the meeting' }, X.A2); log(rj.status === 200 && rj.data.status === 'rejected' && val(await m('attendance.rate', X.A)) === 93.4, 'a rejected change leaves everything as it was');
  const pv2 = await PU(`${P}/definitions/attendance.rate`, draft, X.A); log(pv2.data.version === 2, 'the next proposal is version 2');
  const ap = await PO(`${P}/definitions/attendance.rate/decide`, { approve: true, note: 'Agreed' }, X.A2); const nowR = await m('attendance.rate', X.A, '&groupBy=class');
  log(ap.status === 200 && ap.data.status === 'published' && !ap.data.soleAdmin && val(nowR) === 92 && nowR.data.version === 2 && nowR.data.target === 95 && nowR.data.groups.every((g) => !g.suppressed) && nowR.data.groups.find((g) => g.label === '7-B').value === 100, 'approved by a second administrator: leave now counts as absent (92.0%), the smaller class is shown at three children');
  const hist = (await G(`${P}/definitions`, X.A)).data.measures.find((d) => d.key === 'attendance.rate'); log(hist.version === 2 && hist.history.length === 2 && hist.history[0].status === 'published' && hist.history[1].status === 'rejected' && hist.history[1].decisionNote.includes('meeting'), 'every version is kept with who decided and why');
  const ovx = await G(`${P}/overview?${win}`, X.A); log(ovx.data.exceptions.some((e) => e.metricKey === 'attendance.rate') === false, 'the school\'s own lines decide what counts as an exception (92.0 is above its line of 88)');
  const newRun = await PO(`${P}/runs`, { title: 'After the change', keys: ['attendance.rate'], from: ad(-10), to: today }, X.A); const oldRun = (await G(`${P}/runs/${runAdm._id}`, X.A)).data; const nr = (await G(`${P}/runs/${id(newRun)}`, X.A)).data;
  log(nr.results[0].version === 2 && oldRun.results.find((r) => r.key === 'attendance.rate').version === 0 && oldRun.results.find((r) => r.key === 'attendance.rate').total.value !== nr.results[0].total.value, 'a saved run keeps the definition version it used, so old reports never change');
  const nar = await PU(`${P}/definitions/attendance.unexcused`, { reason: 'Leads only for now', minLevel: 'lead' }, X.A); await PO(`${P}/definitions/attendance.unexcused/decide`, { approve: true }, X.A2);
  await expect('a measure narrowed to leads is closed to teachers', m('attendance.unexcused', X.TH), [403]); await expect('but open to a lead', m('attendance.unexcused', X.TL), [200]); log(nar.status === 201 && !(await G(`${P}/catalog`, X.TH)).data.measures.some((d) => d.key === 'attendance.unexcused'), 'and drops out of the teacher\'s catalogue');
  // a school with one administrator may approve its own change, and the record says so
  const pw = await hashPassword('Ana@12345'); const Z = await School.create({ name: 'ANA003 Academy', code: 'ANA003', email: 'z@ana.test', phone: '+92-300-1111111', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0, timezone: 'UTC' });
  const za = await User.create({ schoolId: Z._id, name: 'Solo Admin', email: 'solo@ana003.test', password: pw, role: 'admin', isActive: true }); const ZA = generateAccessToken(String(za._id), String(Z._id), 'admin');
  await PU(`${P}/definitions/attendance.rate`, { reason: 'Our own line', alert: { below: 85 } }, ZA); const zs = await PO(`${P}/definitions/attendance.rate/decide`, { approve: true }, ZA); log(zs.status === 200 && zs.data.soleAdmin === true, 'a school with a single administrator may approve its own change, recorded as such');

  // ── 5. custom measures ──
  const cu = { baseKey: 'attendance.rate', name: 'Grade 7 attendance', filters: { standards: ['7'] }, reason: 'Head of lower school asked for it' };
  await expect('a custom measure needs something to narrow to', PO(`${P}/definitions`, { ...cu, filters: {} }, X.A), [422]); await expect('and a real measure as its base', PO(`${P}/definitions`, { ...cu, baseKey: 'nope' }, X.A), [422]); await expect('and a name', PO(`${P}/definitions`, { ...cu, name: 'x' }, X.A), [422]);
  await expect('subjects only narrow learning measures', PO(`${P}/definitions`, { ...cu, filters: { subjectIds: [String(new mg.Types.ObjectId())] } }, X.A), [422]); await expect('it cannot be opened to more people than its base', PO(`${P}/definitions`, { baseKey: 'fees.collection', name: 'Fees for all', filters: { standards: ['7'] }, minLevel: 'teacher', reason: 'Everyone should see' }, X.A), [422]);
  const c1 = await PO(`${P}/definitions`, cu, X.A); const ck = c1.data.key; log(c1.status === 201 && /^c_/.test(ck) && !(await G(`${P}/catalog`, X.A)).data.measures.some((d) => d.key === ck), 'a custom measure is not live until it is approved');
  await expect('its maker cannot approve it', PO(`${P}/definitions/${ck}/decide`, { approve: true }, X.A), [403]); await expect('a second administrator can', PO(`${P}/definitions/${ck}/decide`, { approve: true }, X.A2), [200]);
  const cm = await m(ck, X.A); const cmT = await m(ck, X.TH); const cmO = await m(ck, X.TO);
  log(val(cm) === 94.3 && cm.data.total.num === 83 && cm.data.total.den === 88 && cm.data.name === 'Grade 7 attendance' && cm.data.definition.custom && cm.data.numerator.includes('present'), 'a custom measure inherits its base\'s numerator and denominator and narrows the classes (83 of 88)');
  log(val(cmT) === 91.4 && cmO.data.noData, 'a teacher sees it only for their own classes inside the narrowing');
  const c2 = await PO(`${P}/definitions`, { baseKey: 'learning.average', name: 'Maths average', filters: { subjectIds: [String((await require('../models/Subject').findOne({ schoolId: X.s._id }))._id)] }, reason: 'Curriculum lead asked' }, X.A); await PO(`${P}/definitions/${c2.data.key}/decide`, { approve: true }, X.A2);
  log(val(await m(c2.data.key, X.A)) === 65.3, 'a measure narrowed to a subject reads only that subject\'s marks');
  await PA(`${P}/schedules/${sid1}`, { metrics: ['attendance.rate', ck] }, X.A); const rt = await PO(`${P}/definitions/${ck}/retire`, { reason: 'x' }, X.A); await expect('retiring needs a reason', PO(`${P}/definitions/${ck}/retire`, { reason: 'x' }, X.A), [422]);
  const rt2 = await PO(`${P}/definitions/${ck}/retire`, { reason: 'No longer reported separately' }, X.A); log(rt2.status === 200 && rt2.data.removedFromReports === 1 && !(await G(`${P}/catalog`, X.A)).data.measures.some((d) => d.key === ck) && (await AnSchedule.findById(sid1)).metrics.join() === 'attendance.rate', 'a retired measure leaves the catalogue and every report');
  await expect('a built-in measure cannot be retired', PO(`${P}/definitions/attendance.rate/retire`, { reason: 'Not wanted' }, X.A), [404]);

  // ── 6. isolation and the daily call ──
  const yDefs = await G(`${P}/definitions`, Y.A); log(yDefs.data.measures.every((d) => d.version === 0 && !d.custom) && val(await m('attendance.rate', Y.A)) === null, 'another school\'s definitions and figures are untouched by all of this');
  await expect('another school cannot decide this school\'s change', PO(`${P}/definitions/attendance.rate/decide`, { approve: true }, Y.A2), [404]); await expect('nor open its jobs', PO(`${P}/jobs/${id(j3)}/done`, {}, Y.A), [404]);
  log((await G(`${P}/jobs?status=done`, Y.A)).data.total === 0 && (await G(`${P}/runs`, Y.A)).data.total === 0 && (await G(`${P}/schedules`, Y.A)).data.schedules.length === 0, 'another school sees no jobs, runs or reports of this one');
  process.env.CRON_SECRET = 'an-cron-secret'; const noAuth = await fetch(`${base}/api/cron/analytics`); const cr = await fetch(`${base}/api/cron/analytics`, { headers: { authorization: 'Bearer an-cron-secret' } }); const crj = await cr.json();
  log(noAuth.status === 401 && cr.status === 200 && crj.schools >= 1 && typeof crj.ran === 'number', 'the daily call refuses a missing secret and sweeps every school with it');
  const grantLine = require('../utils/permissions'); log(!!grantLine.CATALOG['analytics.lead'] && grantLine.CATALOG['analytics.lead'].grantable === true && grantLine.CATALOG['analytics.lead'].defaults.join() === 'admin', 'the curriculum-lead grant is in the permission catalogue');
};
