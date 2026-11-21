// Alumni, giving, quality, board, service hours and the annual report (E32): consent first, money never edited, checks by someone else.
module.exports = async ({ call, expect, log, base }) => {
  const mg = require('../lib/pgdoc'); const School = require('../models/School'); const User = require('../models/User'); const Teacher = require('../models/Teacher'); const Student = require('../models/Student'); const Class = require('../models/Class');
  const PermissionGrant = require('../models/PermissionGrant'); const AlumniProfile = require('../models/AlumniProfile'); const FundSpend = require('../models/FundSpend'); const DonorGift = require('../models/DonorGift'); const AnnualReport = require('../models/AnnualReport');
  const ServiceLog = require('../models/ServiceLog'); const AccEvidence = require('../models/AccEvidence'); const QaCycle = require('../models/QaCycle'); const GivingFund = require('../models/GivingFund'); const FundraisingCampaign = require('../models/FundraisingCampaign');
  const { generateAccessToken } = require('../utils/jwt'); const { hashPassword } = require('../utils/password');
  console.log('\n— Alumni, giving and quality —');
  const pw = await hashPassword('Adv@123456'); const day = (n = 0) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const mk = async (code, { admins = 2 } = {}) => {
    const s = await School.create({ name: `${code} School`, code, email: `${code.toLowerCase()}@adv.test`, phone: '+92-300-5555555', principalName: 'P', adminId: new mg.Types.ObjectId(), isActive: true, studentLimit: 0, timezone: 'UTC' });
    const mkA = (n) => User.create({ schoolId: s._id, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, role: 'admin', isActive: true });
    const a1 = await mkA('Head'); const a2 = admins > 1 ? await mkA('Dean') : null;
    const mkT = (n) => Teacher.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} School`, name: `${code} ${n}`, email: `${n.toLowerCase()}@${code.toLowerCase()}.test`, password: pw, isActive: true });
    const t1 = await mkT('Teacher'); const t2 = await mkT('Giver'); const t3 = await mkT('Quality');
    await require('../utils/campus').ensureDefault(s._id);
    const c7 = await Class.create({ schoolId: s._id, standard: '7', division: 'A', academicYear: '2026', classTeacherId: t1._id });
    const mkS = (n, adm, active) => Student.create({ schoolId: s._id, schoolCode: code, schoolName: `${code} School`, name: n, email: `${adm.toLowerCase()}@${code.toLowerCase()}.test`, phone: '03001230001', password: pw, classId: c7._id, admissionNumber: adm, isActive: active });
    const kid = await mkS('Zubair Haroon Qureshi', `${code}-2201`, true); const old = await mkS('Hira Tariq Mirza', `${code}-1101`, false);
    const grant = (perm, t) => PermissionGrant.create({ schoolId: s._id, granteeId: t._id, granteeModel: 'Teacher', granteeName: t.name, action: perm, source: 'grant', validFrom: new Date(Date.now() - 1000), validTo: new Date(Date.now() + 86400000), reason: 'Role', grantedBy: a1._id });
    await grant('giving.officer', t2); await grant('quality.lead', t3); await grant('alumni.lead', t2);
    const tok = (u, r) => generateAccessToken(String(u._id), String(s._id), r);
    return { s, a1, a2, t1, t2, t3, kid, old, A1: tok(a1, 'admin'), A2: a2 ? tok(a2, 'admin') : null, T1: tok(t1, 'teacher'), T2: tok(t2, 'teacher'), T3: tok(t3, 'teacher'), ST: tok(kid, 'student') };
  };
  const X = await mk('AD001'); const Y = await mk('AD002', { admins: 1 });
  const G = (p, t) => call('GET', `/advancement${p}`, t); const PO = (p, b, t) => call('POST', `/advancement${p}`, t, b || {}); const PU = (p, b, t) => call('PUT', `/advancement${p}`, t, b || {}); const DE = (p, t) => call('DELETE', `/advancement${p}`, t);
  const tokenOf = (r) => r.data.link.token; const pubG = (p) => call('GET', `/public${p}`, null); const pubP = (p, b) => call('POST', `/public${p}`, null, b || {}); const pubU = (p, b) => call('PUT', `/public${p}`, null, b || {});

  /* ── 1. who may use what ── */
  await expect('a plain teacher cannot open the alumni list', G('/alumni', X.T1), [403]); await expect('a student cannot', G('/alumni', X.ST), [403]); await expect('nobody signed out can', G('/alumni', null), [401]);
  await expect('a plain teacher cannot open giving', G('/giving/funds', X.T1), [403]); await expect('a plain teacher cannot open quality', G('/quality/standards', X.T1), [403]);
  await expect('a teacher with the alumni grant can', G('/alumni', X.T2), [200]); await expect('a teacher with the quality grant can open quality', G('/quality/standards', X.T3), [200]);
  await expect('a teacher with only the giving grant cannot open quality', G('/quality/standards', X.T2), [403]);
  await expect('a teacher cannot run the annual report', G('/reports', X.T2), [403]);

  /* ── 2. alumni and consent ── */
  await expect('a year in the future is refused', PO('/alumni', { name: 'Future Person', gradYear: new Date().getUTCFullYear() + 3 }, X.A1), [422]);
  const stillIn = await PO('/alumni', { name: 'Zubair Haroon Qureshi', gradYear: 2024, studentId: String(X.kid._id) }, X.A1); log(stillIn.status === 409, 'a student who is still enrolled cannot be listed as alumni');
  const a1r = await expect('a graduate is added from a leaver\'s record', PO('/alumni', { name: 'Hira Tariq Mirza', gradYear: 2022, classLabel: '10-A', studentId: String(X.old._id) }, X.A1), [201]);
  const al1 = a1r.data.alumnus; const tok1 = tokenOf(a1r); log(/^al_[A-Za-z0-9]{8}_/.test(tok1) && a1r.data.link.shownOnce === true && !JSON.stringify(a1r.data).includes('linkHash'), 'the private link is shown once and the stored hash is never sent');
  log(al1.state === 'Invited' && al1.contact === null && al1.consent.contact === false, 'a new graduate has no contact details and no consent');
  const bulk = await expect('a list is added in one go', PO('/alumni/bulk', { rows: [{ name: 'Ali Raza', gradYear: 2020 }, { name: 'X', gradYear: 1800 }, { name: 'Sana Iqbal', gradYear: 2021 }] }, X.A1), [201]); log(bulk.data.added === 2 && bulk.data.failed.length === 1 && bulk.data.failed[0].row === 2, 'bad rows are named, good rows are added');
  await expect('too many rows at once is refused', PO('/alumni/bulk', { rows: Array.from({ length: 201 }, (_, i) => ({ name: `P${i}`, gradYear: 2020 })) }, X.A1), [422]);
  const pub0 = await pubG(`/alumni/${tok1}`); log(pub0.status === 200 && pub0.data.alumnus.name === 'Hira Tariq Mirza' && pub0.data.alumnus.consent.contact === false && /only keep your contact details/i.test(pub0.data.promise), 'the graduate opens their own page and sees the promise');
  await expect('a made-up link shows nothing', pubG('/alumni/al_abcdefgh_AAAAAAAAAAAAAAAAAAAAAAAA'), [404]); await expect('a malformed link shows nothing', pubG('/alumni/nonsense'), [404]);
  await expect('contact without a channel is refused', pubU(`/alumni/${tok1}/consent`, { contact: true }), [422]);
  await expect('a bad email is refused', pubU(`/alumni/${tok1}/consent`, { contact: true, channels: ['email'], email: 'nope' }), [422]);
  await expect('the graduate agrees to email only, and to events', pubU(`/alumni/${tok1}/consent`, { contact: true, channels: ['email'], email: 'hira@mail.test', phone: '0300 1234567', events: true, directory: 'hidden' }), [200]);
  let sv = (await G('/alumni', X.A1)).data.alumni.find((a) => a.name === 'Hira Tariq Mirza'); log(sv.contact && sv.contact.email === 'hira@mail.test' && sv.contact.phone === '' && sv.state === 'Active' && sv.profile === null, 'staff see only the email she chose, and no profile because she stays unlisted');
  const raw = await AlumniProfile.findOne({ _id: al1.id }); log(raw.contact.phone === '' && raw.consent.source === 'self', 'the phone number she did not agree to was never stored');
  let dir = (await G('/alumni/directory', X.A1)).data.people; log(!dir.some((p) => p.name === 'Hira Tariq Mirza'), 'an unlisted graduate is not in the directory');
  await expect('she chooses to be listed', pubU(`/alumni/${tok1}/consent`, { contact: true, channels: ['email'], email: 'hira@mail.test', directory: 'visible', events: true, profile: { headline: 'Engineer', city: 'Lahore', employer: 'Acme', field: 'Software' } }), [200]);
  dir = (await G('/alumni/directory', X.A1)).data.people; log(dir.some((p) => p.name === 'Hira Tariq Mirza' && p.city === 'Lahore'), 'then she appears in the directory with the profile she wrote');
  const aud = (await G('/alumni/audience?channel=email', X.A1)).data; log(aud.count === 1 && aud.people[0].email === 'hira@mail.test' && aud.of >= 1, 'the mailing list has only people who agreed to email');
  const audPhone = (await G('/alumni/audience?channel=phone', X.A1)).data; log(audPhone.count === 0, 'nobody agreed to phone, so the phone list is empty');
  await expect('a wrong channel is refused', G('/alumni/audience?channel=fax', X.A1), [422]);
  const csv = await fetch(`${base}/api/advancement/alumni/audience?channel=email&format=csv&purpose=events`, { headers: { authorization: `Bearer ${X.A1}` } }); const csvText = await csv.text(); log(csv.status === 200 && /hira@mail\.test/.test(csvText) && /text\/csv/.test(csv.headers.get('content-type')), 'the list downloads as a spreadsheet');
  const sana = bulk.data.links.find((l) => l.name === 'Sana Iqbal'); await expect('a second graduate agrees to contact but not events', pubU(`/alumni/${sana.token}/consent`, { contact: true, channels: ['email'], email: 'sana@mail.test', events: false }), [200]);
  const aud2 = (await G('/alumni/audience?channel=email&purpose=events', X.A1)).data; log(aud2.count === 1, 'the events list leaves out people who did not agree to event messages');
  await expect('staff cannot record consent without saying how it was given', PU(`/alumni/${bulk.data.links[0].id}/consent`, { contact: true, channels: ['phone'], phone: '0300 7654321' }, X.A1), [422]);
  await expect('staff record what a graduate said on the phone', PU(`/alumni/${bulk.data.links[0].id}/consent`, { contact: true, channels: ['phone'], phone: '0300 7654321', how: 'Said yes by phone on the reunion call, 3 March' }, X.A1), [200]);
  const ali = (await G('/alumni', X.A1)).data.alumni.find((a) => a.name === 'Ali Raza'); log(ali.consent.source === 'staff' && ali.contact.phone === '0300 7654321', 'it is marked as recorded by staff');
  await expect('she changes her mind about contact', pubU(`/alumni/${tok1}/consent`, { contact: false, directory: 'hidden' }), [200]);
  const raw2 = await AlumniProfile.findOne({ _id: al1.id }); log(raw2.contact.email === undefined && !(raw2.contact && Object.keys(raw2.contact).length) && Object.keys(raw2.profile || {}).length === 0, 'withdrawing consent deletes the contact details and the profile');
  log((await G('/alumni/audience?channel=email', X.A1)).data.count === 1, 'and she drops off the mailing list at once');
  const rot = await expect('a new link is issued', PO(`/alumni/${al1.id}/link`, {}, X.A1), [200]); await expect('the old link stops working', pubG(`/alumni/${tok1}`), [404]); const tok1b = rot.data.link.token; await expect('the new one works', pubG(`/alumni/${tok1b}`), [200]);

  /* ── employment answers ── */
  const early = (await G('/alumni/employment', X.A1)).data; log(early.answers === null && /Fewer than/.test(early.note), 'with too few answers no figures are shown');
  const extra = await PO('/alumni/bulk', { rows: Array.from({ length: 6 }, (_, i) => ({ name: `Grad ${i}`, gradYear: 2019 })) }, X.A1);
  for (const l of extra.data.links) await pubP(`/alumni/${l.token}/employment`, { status: 'Employed', sector: 'IT' }); await pubP(`/alumni/${sana.token}/employment`, { status: 'Studying' });
  await expect('an answer outside the list is refused', pubP(`/alumni/${sana.token}/employment`, { status: 'Rich' }), [422]);
  const emp = (await G('/alumni/employment', X.A1)).data; log(emp.answers && emp.answers.status.shown.length === 1 && emp.answers.status.shown[0].label === 'Employed' && emp.answers.status.hidden === true && emp.total === null, 'a group smaller than the minimum is hidden and no total is shown that would give it away');

  /* ── events ── */
  const ev = await expect('an event is made', PO('/events', { title: 'Reunion 2026', startsAt: new Date(Date.now() + 20 * 86400000).toISOString(), place: 'School hall', capacity: 1 }, X.A1), [201]); const evId = ev.data.event._id;
  log((await pubG(`/alumni/${tok1b}`)).data.events.length === 0, 'a draft event is not shown to graduates');
  await expect('a title is needed', PO('/events', { startsAt: new Date().toISOString() }, X.A1), [422]); await expect('a draft cannot be closed', PO(`/events/${evId}/status`, { status: 'Closed' }, X.A1), [409]);
  await expect('the event is published', PO(`/events/${evId}/status`, { status: 'Published' }, X.A1), [200]); log((await pubG(`/alumni/${tok1b}`)).data.events.some((e) => e.title === 'Reunion 2026'), 'a published event shows on the graduate\'s page');
  await expect('she says she is going', pubP(`/alumni/${tok1b}/rsvp`, { eventId: evId, status: 'going' }), [200]); const full = await pubP(`/alumni/${sana.token}/rsvp`, { eventId: evId, status: 'going' }); log(full.status === 409 && /full/i.test(full.data.message), 'a full event turns the next person away');
  await expect('she can change her answer', pubP(`/alumni/${tok1b}/rsvp`, { eventId: evId, status: 'maybe' }), [200]); await expect('and the other can now come', pubP(`/alumni/${sana.token}/rsvp`, { eventId: evId, status: 'going' }), [200]);
  await expect('an answer must be going, maybe or no', pubP(`/alumni/${tok1b}/rsvp`, { eventId: evId, status: 'perhaps' }), [422]);
  const rs = (await G(`/events/${evId}/rsvps`, X.A1)).data.rsvps; log(rs.length === 2 && rs.every((r) => r.name), 'staff see who answered');
  const evl = (await G('/events', X.A1)).data.events.find((e) => String(e._id) === String(evId)); log(evl.rsvp.going === 1 && evl.rsvp.maybe === 1, 'the counts add up');

  /* ── leaving and erasing ── */
  const wd = await pubP(`/alumni/${sana.token}/withdraw`, { erase: false }); log(wd.status === 200, 'a graduate can withdraw'); await expect('the link no longer works after withdrawing', pubG(`/alumni/${sana.token}`), [404]);
  const sraw = await AlumniProfile.findOne({ linkPrefix: '' , name: 'Sana Iqbal' }); log(sraw && sraw.state === 'Withdrawn' && !sraw.contact.email && !sraw.employment.answeredAt, 'withdrawing removes contact details and answers');
  log((await G(`/events/${evId}/rsvps`, X.A1)).data.rsvps.length === 1, 'and her event answer');
  const er = await expect('staff can erase a graduate on request', PO(`/alumni/${al1.id}/erase`, {}, X.A1), [200]); const eraw = await AlumniProfile.findOne({ _id: al1.id }); log(eraw.state === 'Erased' && eraw.name === 'Removed' && !eraw.studentId, 'an erased graduate keeps only a blank row');
  await expect('an erased graduate cannot get a new link', PO(`/alumni/${al1.id}/link`, {}, X.A1), [409]);
  log((await G('/alumni', Y.A1)).data.alumni.length === 0, 'another school sees none of these graduates');

  /* ── 3. funds, pledges and gifts ── */
  await expect('a restricted fund needs allowed uses', PO('/giving/funds', { name: 'Open ended', restricted: true }, X.A1), [422]);
  const fr = await expect('a restricted fund is made', PO('/giving/funds', { name: 'Scholarships', purpose: 'Fees for children who cannot pay', restricted: true, allowedCategories: ['Scholarships', 'books'] }, X.A1), [201]); const fund = fr.data.fund.id;
  await expect('a duplicate fund name is refused', PO('/giving/funds', { name: 'Scholarships', restricted: false }, X.A1), [409]);
  const fo = await expect('an unrestricted fund is made', PO('/giving/funds', { name: 'General', restricted: false }, X.T2), [201]); const general = fo.data.fund.id;
  const widen = await PU(`/giving/funds/${fund}`, { allowedCategories: ['scholarships', 'books', 'sports'] }, X.A1); log(widen.status === 422, 'widening what a fund may be spent on needs a written reason');
  await expect('with the donor\'s agreement written down it is allowed', PU(`/giving/funds/${fund}`, { allowedCategories: ['scholarships', 'books', 'sports'], reason: 'Donor agreed by letter of 4 May to sports kit' }, X.A1), [200]);
  const fnote = (await G('/giving/funds', X.A1)).data.funds.find((f) => f.id === fund); log(/Widened/.test(fnote.restrictionNote), 'the widening is written on the fund');
  await expect('a pledge with uneven instalments is refused', PO('/giving/pledges', { donorName: 'Mr Khan', fundId: fund, amount: 1000, schedule: [{ dueOn: day(10), amount: 400 }, { dueOn: day(40), amount: 400 }] }, X.A1), [422]);
  await expect('permission to contact needs a contact', PO('/giving/pledges', { donorName: 'Mr Khan', fundId: fund, amount: 1000, contactConsent: true }, X.A1), [422]);
  const pl = await expect('a pledge is recorded', PO('/giving/pledges', { donorName: 'Mr Khan', fundId: fund, amount: 1000, recognition: 'named', schedule: [{ dueOn: day(-12), amount: 500 }, { dueOn: day(30), amount: 500 }], contact: { email: 'khan@mail.test' } }, X.A1), [201]); const pledge = pl.data.pledge;
  log(/^PLG-\d{4}-\d{5}$/.test(pledge.no) && pledge.contact === null && pledge.outstanding === 1000, 'it gets a number; an email given without permission is not kept');
  const praw = await mg.connection?.db; log(true, 'pledge stored');
  const gi = await expect('a gift is recorded against the pledge', PO('/giving/gifts', { pledgeId: pledge.id, amount: 400, receivedOn: day(-1), method: 'bank', reference: 'HBL-7781', idempotencyKey: 'k-1' }, X.A1), [201]); const gift = gi.data.gift; log(/^RCP-\d{4}-\d{5}$/.test(gift.receiptNo) && gift.fundId === fund, 'it gets a receipt number and goes into the pledge\'s fund');
  const again = await PO('/giving/gifts', { pledgeId: pledge.id, amount: 400, receivedOn: day(-1), method: 'bank', reference: 'HBL-7781', idempotencyKey: 'k-1' }, X.A1); log(again.status === 200 && again.data.duplicate === true && again.data.gift.id === gift.id, 'sending the same gift twice records it once');
  const dupRef = await PO('/giving/gifts', { pledgeId: pledge.id, amount: 100, receivedOn: day(-1), method: 'bank', reference: 'HBL-7781', idempotencyKey: 'k-2' }, X.A1); log(dupRef.status === 409 && dupRef.data.reason === 'duplicate_reference', 'a bank reference already used is stopped');
  await expect('unless the person says it really is another gift', PO('/giving/gifts', { pledgeId: pledge.id, amount: 100, receivedOn: day(-1), method: 'bank', reference: 'HBL-7781', allowDuplicateReference: true, idempotencyKey: 'k-3' }, X.A1), [201]);
  await expect('a gift dated in the future is refused', PO('/giving/gifts', { fundId: general, amount: 10, receivedOn: day(3), donorName: 'Anyone' }, X.A1), [422]); await expect('a nil or negative gift is refused', PO('/giving/gifts', { fundId: general, amount: -5, receivedOn: day(0) }, X.A1), [422]);
  await expect('a gift to a missing fund is refused', PO('/giving/gifts', { fundId: String(new mg.Types.ObjectId()), amount: 10, receivedOn: day(0) }, X.A1), [404]);
  await expect('a named gift needs a name', PO('/giving/gifts', { fundId: general, amount: 10, receivedOn: day(0), recognition: 'named' }, X.A1), [422]);
  await expect('the rest of the pledge is paid', PO('/giving/gifts', { pledgeId: pledge.id, amount: 500, receivedOn: day(0), method: 'cash' }, X.A1), [201]);
  const pls = (await G('/giving/pledges', X.A1)).data.pledges.find((p) => p.id === pledge.id); log(pls.status === 'Fulfilled' && pls.paid === 1000, 'a pledge that is paid in full is marked fulfilled');
  await expect('a fulfilled pledge takes no more gifts', PO('/giving/gifts', { pledgeId: pledge.id, amount: 10, receivedOn: day(0) }, X.A1), [409]);
  await expect('a gift is thanked', PO(`/giving/gifts/${gift.id}/acknowledge`, {}, X.A1), [200]);
  const fv = (await G('/giving/funds', X.A1)).data.funds.find((f) => f.id === fund); log(fv.received === 1000 && fv.balance === 1000 && fv.available === 1000, 'the fund balance is the gifts received');
  const pa = await expect('an anonymous gift to the general fund', PO('/giving/gifts', { fundId: general, amount: 250, receivedOn: day(0), method: 'cash' }, X.A1), [201]); log(pa.data.gift.donorName === '' && pa.data.gift.recognition === 'anonymous', 'it stays anonymous');

  /* ── reversing a gift ── */
  const rev0 = await PO(`/giving/gifts/${pa.data.gift.id}/reverse`, { reason: 'Recorded twice by mistake' }, X.A1); log(rev0.status === 403 && rev0.data.reason === 'maker_checker', 'the person who recorded a gift cannot reverse it');
  await expect('a reversal needs a reason', PO(`/giving/gifts/${pa.data.gift.id}/reverse`, { reason: 'oops' }, X.A2), [422]);
  const rev1 = await expect('another administrator reverses it', PO(`/giving/gifts/${pa.data.gift.id}/reverse`, { reason: 'Recorded twice by mistake' }, X.A2), [201]); log(rev1.data.gift.amount === -250 && rev1.data.gift.reversalOf === pa.data.gift.id, 'the reversal is a second row with the opposite amount');
  await expect('a gift cannot be reversed twice', PO(`/giving/gifts/${pa.data.gift.id}/reverse`, { reason: 'Trying again to be sure' }, X.A2), [409]); await expect('a reversal cannot be reversed', PO(`/giving/gifts/${rev1.data.gift.id}/reverse`, { reason: 'Reverse the reversal now' }, X.A2), [409]);
  const orig = await DonorGift.findOne({ _id: pa.data.gift.id }); log(orig.amount === 250, 'the original row is untouched');
  log((await G('/giving/funds', X.A1)).data.funds.find((f) => f.id === general).balance === 0, 'the fund balance is back to nothing');
  const ysole = await PO('/giving/funds', { name: 'Y fund', restricted: false }, Y.A1); const yg = await PO('/giving/gifts', { fundId: ysole.data.fund.id, amount: 100, receivedOn: day(0) }, Y.A1); const yr = await PO(`/giving/gifts/${yg.data.gift.id}/reverse`, { reason: 'Wrong amount entered' }, Y.A1); log(yr.status === 201 && yr.data.soleAdmin === true, 'a school with one administrator can reverse its own entry, and it is marked as such');

  /* ── restricted spending ── */
  const bad1 = await PO('/giving/spends', { fundId: fund, amount: 200, category: 'staff party', description: 'Staff party for the winter term' }, X.A1); log(bad1.status === 422 && bad1.data.reason === 'restricted' && bad1.data.allowed.includes('books'), 'spending on something the donors did not allow is refused, and the allowed uses are listed');
  await expect('unless the donor\'s agreement is written down', PO('/giving/spends', { fundId: fund, amount: 50, category: 'laboratory', description: 'Microscope slides for science', variationNote: 'Mr Khan agreed by phone on 5 May, confirmed by WhatsApp' }, X.A1), [201]);
  await expect('more than is available is refused', PO('/giving/spends', { fundId: fund, amount: 99999, category: 'books', description: 'Books for the library shelf' }, X.A1), [409]);
  const sp = await expect('a spend on an allowed use is asked for', PO('/giving/spends', { fundId: fund, amount: 600, category: 'Scholarships', description: 'Term fee for three children' }, X.A1), [201]); const spend = sp.data.spend;
  const self = await PO(`/giving/spends/${spend.id}/decide`, { decision: 'approve' }, X.A1); log(self.status === 403 && self.data.reason === 'maker_checker', 'the person who asked cannot approve');
  await expect('a refusal needs a reason', PO(`/giving/spends/${spend.id}/decide`, { decision: 'decline' }, X.A2), [422]);
  const ok = await expect('another administrator approves', PO(`/giving/spends/${spend.id}/decide`, { decision: 'approve', note: 'Matches the donor letter' }, X.A2), [200]); log(ok.data.spend.status === 'Approved', 'the spend is approved');
  await expect('a decided spend is final', PO(`/giving/spends/${spend.id}/decide`, { decision: 'decline', note: 'Changed mind' }, X.A2), [409]);
  const left = (await G('/giving/funds', X.A1)).data.funds.find((f) => f.id === fund); log(left.spent === 600 && left.balance === 400, 'the fund balance falls by what was spent');
  const revSpent = await PO(`/giving/gifts/${gift.id}/reverse`, { reason: 'Donor asked for the money back' }, X.A2); log(revSpent.status === 409 && revSpent.data.reason === 'spent', 'money that is already spent cannot be taken back out');
  // two approvals chasing the same last money: only one gets it
  const fx = await PO('/giving/funds', { name: 'Race', restricted: false }, X.A1); const raceFund = fx.data.fund.id; await PO('/giving/gifts', { fundId: raceFund, amount: 1000, receivedOn: day(0), donorName: 'Race Donor', recognition: 'named' }, X.A1);
  const mkSpend = (n) => FundSpend.create({ schoolId: X.s._id, fundId: raceFund, amount: 800, category: 'general', description: `Spend number ${n} for the race`, status: 'Requested', requestedById: X.t1._id, requestedByName: 'T1' });
  const s1 = await mkSpend(1); const s2 = await mkSpend(2);
  const raced = await Promise.all([PO(`/giving/spends/${s1._id}/decide`, { decision: 'approve' }, X.A2), PO(`/giving/spends/${s2._id}/decide`, { decision: 'approve' }, X.A1)]);
  log(raced.filter((r) => r.status === 200).length === 1 && raced.filter((r) => r.status === 409).length === 1, 'two approvals for the same last money: exactly one succeeds');
  log((await G('/giving/funds', X.A1)).data.funds.find((f) => f.id === raceFund).balance === 200, 'and the fund never goes below nothing');
  const dups = await Promise.all([PO(`/giving/gifts/${gift.id}/reverse`, { reason: 'Double click on reverse' }, X.A2), PO(`/giving/gifts/${gift.id}/reverse`, { reason: 'Double click on reverse' }, X.A2)]); log(dups.filter((r) => r.status === 201).length === 0, 'a reversal of spent money stays refused even when sent twice');

  /* ── campaigns ── */
  await expect('where the money goes must add up', PO('/giving/campaigns', { title: 'Scholarship drive', fundId: fund, goal: 100000, uses: [{ label: 'scholarships', percent: 60 }, { label: 'books', percent: 30 }] }, X.A1), [422]);
  const notAllowed = await PO('/giving/campaigns', { title: 'Scholarship drive', fundId: fund, goal: 100000, uses: [{ label: 'scholarships', percent: 50 }, { label: 'staff party', percent: 50 }] }, X.A1); log(notAllowed.status === 422 && /does not allow/.test(notAllowed.data.message), 'a page cannot promise a use the fund does not allow');
  const cr = await expect('a campaign is drafted', PO('/giving/campaigns', { title: 'Scholarship drive', story: 'Help a child stay in school.', fundId: fund, goal: 100000, endsOn: day(60), uses: [{ label: 'scholarships', percent: 70 }, { label: 'books', percent: 30 }] }, X.A1), [201]); const camp = cr.data.campaign;
  await expect('a draft has no public page', pubG(`/campaigns/${camp.code}`), [404]); await expect('a goal is needed before review', PO(`/giving/campaigns/${(await PO('/giving/campaigns', { title: 'No goal drive', fundId: general }, X.A1)).data.campaign.id}/ask`, {}, X.A1), [422]);
  await expect('it is sent for review', PO(`/giving/campaigns/${camp.id}/ask`, {}, X.A1), [200]); await expect('a campaign under review cannot be edited', PU(`/giving/campaigns/${camp.id}`, { title: 'Sneaky change' }, X.A1), [409]);
  await expect('a teacher with the giving grant cannot decide', PO(`/giving/campaigns/${camp.id}/decide`, { decision: 'approve' }, X.T2), [403]);
  const same = await PO(`/giving/campaigns/${camp.id}/decide`, { decision: 'approve' }, X.A1); log(same.status === 403 && same.data.reason === 'maker_checker', 'the page is read by someone other than who wrote it');
  await expect('another administrator puts it live', PO(`/giving/campaigns/${camp.id}/decide`, { decision: 'approve' }, X.A2), [200]);
  await PO('/giving/pledges', { donorName: 'Mrs Ansari', fundId: fund, amount: 5000, recognition: 'named', campaignId: camp.id }, X.A1).then(async (p) => PO('/giving/gifts', { pledgeId: p.data.pledge.id, amount: 5000, receivedOn: day(0), method: 'jazzcash', reference: 'JC-1' }, X.A1));
  const anon = await PO('/giving/pledges', { donorName: 'Quiet Donor', fundId: fund, amount: 2000, recognition: 'anonymous', campaignId: camp.id }, X.A1); await PO('/giving/gifts', { pledgeId: anon.data.pledge.id, amount: 2000, receivedOn: day(0), method: 'bank', reference: 'BK-2' }, X.A1);
  const pc = await pubG(`/campaigns/${camp.code}`); log(pc.status === 200 && pc.data.raised === 7000 && pc.data.goal === 100000 && pc.data.percent === 7 && pc.data.uses.length === 2, 'the public page shows the goal, the total and where the money goes');
  log(pc.data.thankYou.includes('Mrs Ansari') && !JSON.stringify(pc.data).includes('Quiet Donor') && pc.data.donors === null, 'a named donor is thanked, an anonymous one is not listed, and a tiny donor count is not shown');
  log(!/email|phone|contact/i.test(JSON.stringify(pc.data).replace(/promise[^}]*/, '')), 'the public page carries no contact details');
  await expect('a live campaign cannot be edited', PU(`/giving/campaigns/${camp.id}`, { title: 'Another title' }, X.A1), [409]); await expect('it is closed', PO(`/giving/campaigns/${camp.id}/close`, {}, X.A1), [200]); log((await pubG(`/campaigns/${camp.code}`)).data.status === 'Closed', 'a closed campaign still shows what it raised');
  const ov = (await G('/giving/overview', X.A1)).data; log(ov.funds >= 3 && ov.received > 0 && typeof ov.openSpends === 'number', 'the overview adds up funds, gifts and waiting spends');

  /* ── 4. accreditation, reviews and findings ── */
  const st = await expect('a standard is added', PO('/quality/standards', { framework: 'ISO 21001', code: '4.1', title: 'Understanding the school and its context', ownerId: String(X.t3._id) }, X.T3), [201]); const std = st.data.standard._id;
  await expect('a duplicate code in a framework is refused', PO('/quality/standards', { framework: 'ISO 21001', code: '4.1', title: 'Again' }, X.T3), [409]); await PO('/quality/standards', { framework: 'ISO 21001', code: '5.2', title: 'Policy' }, X.T3);
  await expect('evidence must say where it is kept', PO('/quality/evidence', { standardId: std, title: 'Context analysis' }, X.T3), [422]); await expect('evidence that has already run out is refused', PO('/quality/evidence', { standardId: std, title: 'Old paper', heldAt: 'Cabinet 2', validUntil: day(-3) }, X.T3), [422]);
  const evd = await expect('evidence is submitted', PO('/quality/evidence', { standardId: std, title: 'Context analysis 2026', heldAt: 'Shared drive/ISO/4.1', validUntil: day(90) }, X.T3), [201]); const evid = evd.data.evidence._id;
  const cov0 = (await G('/quality/coverage?framework=ISO%2021001', X.T3)).data; log(cov0.standards.find((s) => s.code === '4.1').state === 'Waiting' && cov0.summary.percentMet === 0, 'evidence that nobody has checked does not count');
  const selfRev = await PO(`/quality/evidence/${evid}/review`, { decision: 'accept' }, X.T3); log(selfRev.status === 403 && selfRev.data.reason === 'maker_checker', 'whoever submitted the evidence cannot accept it');
  await expect('a rejection says what is missing', PO(`/quality/evidence/${evid}/review`, { decision: 'reject' }, X.A1), [422]);
  await expect('someone else accepts it', PO(`/quality/evidence/${evid}/review`, { decision: 'accept', note: 'Seen and checked' }, X.A1), [200]); await expect('it cannot be reviewed twice', PO(`/quality/evidence/${evid}/review`, { decision: 'accept' }, X.A2), [409]);
  const cov1 = (await G('/quality/coverage?framework=ISO%2021001', X.T3)).data; log(cov1.standards.find((s) => s.code === '4.1').state === 'Met' && cov1.summary.met === 1 && cov1.summary.gaps === 1 && cov1.summary.percentMet === 50, 'accepted, current evidence makes the standard met; the other is a gap');
  await AccEvidence.updateOne({ _id: evid }, { $set: { validUntil: day(-1) } }); const sweepQ = await require('../controllers/qualityController').sweepSchool(X.s._id); log(sweepQ.expired === 1, 'the daily sweep expires evidence that has run out');
  const cov2 = (await G('/quality/coverage?framework=ISO%2021001', X.T3)).data; log(cov2.standards.find((s) => s.code === '4.1').state === 'Gap', 'and the standard is a gap again');
  const cy = await expect('a review cycle is set', PO('/quality/cycles', { title: 'Safeguarding policy', area: 'Safety', intervalMonths: 12, nextDueOn: day(5), ownerId: String(X.t3._id) }, X.T3), [201]); const cyc = cy.data.cycle._id;
  const cl = (await G('/quality/cycles', X.T3)).data.cycles.find((c) => String(c._id) === String(cyc)); log(cl.dueSoon === true && cl.overdue === false, 'a review due within two weeks is flagged');
  await require('../controllers/qualityController').sweepSchool(X.s._id); log((await QaCycle.findOne({ _id: cyc })).remindedOn === day(5), 'the sweep reminds its owner once'); const again2 = await require('../controllers/qualityController').sweepSchool(X.s._id); log(again2.cyclesReminded === 0, 'and not again for the same due date');
  await expect('completing a review needs a note', PO(`/quality/cycles/${cyc}/complete`, { outcome: 'updated', note: 'ok' }, X.T3), [422]); await expect('completing a review needs an outcome', PO(`/quality/cycles/${cyc}/complete`, { outcome: 'fine', note: 'Reviewed with the staff team' }, X.T3), [422]);
  await expect('the review is completed', PO(`/quality/cycles/${cyc}/complete`, { outcome: 'updated', note: 'Reviewed with the staff team and updated section 3' }, X.T3), [200]); const cd = await QaCycle.findOne({ _id: cyc }); log(cd.lastReviewedOn === day(0) && cd.nextDueOn > day(300) && cd.history.length === 1, 'the next review is set a year on and the history is kept');
  await expect('a finding needs someone responsible', PO('/quality/findings', { title: 'Fire drills not logged', severity: 'high' }, X.T3), [422]); await expect('the owner must be staff here', PO('/quality/findings', { title: 'Fire drills not logged', ownerId: String(new mg.Types.ObjectId()) }, X.T3), [422]);
  const fd = await expect('a finding is raised', PO('/quality/findings', { title: 'Fire drills not logged', detail: 'No drill record since January', severity: 'high', ownerId: String(X.a1._id), dueOn: day(-2), standardId: std }, X.T3), [201]); const fid = fd.data.finding._id; log(/^FND-\d{4}-\d{5}$/.test(fd.data.finding.no) && fd.data.finding.overdue === true, 'it gets a number and shows as overdue past its date');
  await expect('a finding cannot be closed before there is a plan', PO(`/quality/findings/${fid}/close`, { note: 'Drill held and logged', evidence: 'Log book p.4' }, X.A2), [409]);
  await expect('someone who is neither the owner nor a lead cannot write the plan', PO(`/quality/findings/${fid}/plan`, { plan: 'Hold a drill every month and log it' }, X.T1), [403]); await expect('the plan needs substance', PO(`/quality/findings/${fid}/plan`, { plan: 'fix' }, X.A1), [422]);
  await expect('the owner writes the plan', PO(`/quality/findings/${fid}/plan`, { plan: 'Hold a drill every month and log it', dueOn: day(7) }, X.A1), [200]);
  const selfClose = await PO(`/quality/findings/${fid}/close`, { note: 'Drill held and logged', evidence: 'Log book p.4' }, X.A1); log(selfClose.status === 403 && selfClose.data.reason === 'maker_checker', 'the person responsible cannot close their own finding');
  await expect('closing needs proof', PO(`/quality/findings/${fid}/close`, { note: 'Drill held and logged' }, X.A2), [422]); await expect('someone else closes it', PO(`/quality/findings/${fid}/close`, { note: 'Drill held and logged', evidence: 'Log book p.4' }, X.A2), [200]);
  await expect('a closed finding stays closed', PO(`/quality/findings/${fid}/close`, { note: 'Drill held and logged', evidence: 'Log book p.4' }, X.A2), [409]);
  const qo = (await G('/quality/overview', X.T3)).data; log(typeof qo.findingsOpen === 'number' && qo.cyclesOverdue === 0, 'the quality overview counts what is open');

  /* ── 5. the board ── */
  await expect('a school-wide administrator is not a board member just by their job', G('/board/meetings', X.A1), [403]); log((await G('/board/me', X.A1)).data.member === null, 'and is told they are not a member');
  await expect('a teacher cannot choose board members', PO('/board/members', { userId: String(X.t1._id), role: 'secretary' }, X.T1), [403]); await expect('a student cannot be a member', PO('/board/members', { userId: String(X.kid._id), role: 'member' }, X.A1), [404]);
  const chair = await expect('the chair is added', PO('/board/members', { userId: String(X.a1._id), role: 'chair' }, X.A1), [201]); await expect('there cannot be two chairs', PO('/board/members', { userId: String(X.a2._id), role: 'chair' }, X.A1), [409]);
  await expect('a member is added', PO('/board/members', { userId: String(X.a2._id), role: 'member' }, X.A1), [201]); await expect('the same person cannot join twice', PO('/board/members', { userId: String(X.a2._id), role: 'member' }, X.A1), [409]);
  await expect('the secretary is added', PO('/board/members', { userId: String(X.t1._id), role: 'secretary' }, X.A1), [201]); const obs = await expect('an observer is added', PO('/board/members', { userId: String(X.t2._id), role: 'observer' }, X.A1), [201]);
  const mt = await expect('the secretary sets up a meeting with one private item', PO('/board/meetings', { title: 'Term board meeting', date: day(3), agenda: [{ title: 'Budget', text: 'Review the term budget' }, { title: 'Head\'s contract', text: 'Private discussion', restricted: true }] }, X.T1), [201]); const mid = mt.data.meeting._id;
  await expect('an ordinary member cannot set up a meeting', PO('/board/meetings', { title: 'Mine', date: day(5) }, X.A2), [403]); await expect('an observer cannot either', PO('/board/meetings', { title: 'Mine', date: day(5) }, X.T2), [403]);
  const seeM = (await G(`/board/meetings/${mid}`, X.A2)).data.meeting; const seeO = (await G(`/board/meetings/${mid}`, X.T2)).data.meeting; const seeC = (await G(`/board/meetings/${mid}`, X.A1)).data.meeting;
  log(seeM.agenda.length === 1 && seeO.agenda.length === 1 && seeC.agenda.length === 2, 'a private agenda item is seen by the chair and secretary only');
  await expect('minutes cannot be written before the meeting is held', PUT_MIN(mid, X.T1, 'Minutes of the meeting held on this date, all present'), [409]); await expect('the meeting is marked as held', PU(`/board/meetings/${mid}`, { status: 'Held' }, X.T1), [200]);
  await expect('an ordinary member cannot write minutes', PUT_MIN(mid, X.A2, 'Minutes of the meeting held on this date, all present'), [403]);
  await expect('resolutions are recorded by the chair', PO(`/board/meetings/${mid}/resolutions`, { text: 'The term budget is approved as presented', outcome: 'passed' }, X.A1), [200]);
  await expect('the secretary drafts the minutes', PUT_MIN(mid, X.T1, 'Minutes of the meeting held on this date. All members present. Budget approved.'), [200]);
  await expect('the drafter cannot approve their own minutes', PO(`/board/meetings/${mid}/minutes/approve`, {}, X.T1), [403]); await expect('an observer cannot approve', PO(`/board/meetings/${mid}/minutes/approve`, {}, X.T2), [403]);
  const ap1 = await expect('a member approves', PO(`/board/meetings/${mid}/minutes/approve`, {}, X.A2), [200]); log(ap1.data.status === 'Draft' && ap1.data.approvals === 1, 'one approval is not enough'); await expect('the same member cannot approve twice', PO(`/board/meetings/${mid}/minutes/approve`, {}, X.A2), [409]);
  await expect('editing the draft', PUT_MIN(mid, X.T1, 'Minutes of the meeting held on this date. All members present. Budget approved with one change.'), [200]);
  await expect('the member approves the new version', PO(`/board/meetings/${mid}/minutes/approve`, {}, X.A2), [200]); log((await require('../models/BoardMeeting').findOne({ _id: mid })).minutes.approvals.length === 1, 'editing the draft had cancelled the earlier approval');
  const ap2 = await expect('the chair approves too', PO(`/board/meetings/${mid}/minutes/approve`, {}, X.A1), [200]); log(ap2.data.status === 'Approved', 'with the chair and another member the minutes are approved');
  await expect('approved minutes cannot be changed', PUT_MIN(mid, X.T1, 'Trying to change the minutes after they were approved by the board'), [409]); await expect('and cannot be approved again', PO(`/board/meetings/${mid}/minutes/approve`, {}, X.A1), [409]);
  await expect('a removed member loses access at once', DE(`/board/members/${obs.data.member._id}`, X.A1), [200]); await expect('the papers are closed to them', G('/board/meetings', X.T2), [403]);
  await expect('another school\'s board is separate', G('/board/meetings', Y.A1), [403]);

  /* ── 6. service hours ── */
  await expect('a plain teacher cannot see service entries', G('/service', X.T1), [403]); const sFut = await PO('/service/mine', { activity: 'Cleaning the park', hours: 2, date: day(2), supervisorName: 'Mr Aziz' }, X.ST); log(sFut.status === 422, 'service in the future is refused');
  await expect('more than 12 hours is refused', PO('/service/mine', { activity: 'Cleaning the park', hours: 13, date: day(-1), supervisorName: 'Mr Aziz' }, X.ST), [422]); await expect('a supervisor is required', PO('/service/mine', { activity: 'Cleaning the park', hours: 2, date: day(-1) }, X.ST), [422]);
  const sl = await expect('a student records their own service', PO('/service/mine', { activity: 'Cleaning the park', orgName: 'Green Lahore', hours: 4, date: day(-2), supervisorName: 'Mr Aziz' }, X.ST), [201]); const sTok = tokenOf(sl); const slId = sl.data.log.id; log(sl.data.log.status === 'Pending' && /^sv_/.test(sTok), 'it waits for the supervisor and gives a private link once');
  await expect('the same day cannot go over 12 hours', PO('/service/mine', { activity: 'More cleaning', hours: 9, date: day(-2), supervisorName: 'Mr Aziz' }, X.ST), [409]);
  const spub = await pubG(`/service/${sTok}`); log(spub.status === 200 && spub.data.student === 'Zubair' && !JSON.stringify(spub.data).includes('Qureshi') && !JSON.stringify(spub.data).includes('2201'), 'the supervisor sees the student\'s first name only, no admission number');
  log((await G('/service/summary', X.T3)).data.totalHours === 0, 'waiting entries add nothing to anyone\'s total'); log((await call('GET', '/advancement/service/mine', X.ST)).data.verifiedHours === 0, 'and the student\'s own count is still nothing');
  await expect('the supervisor must write what they saw', pubP(`/service/${sTok}`, { decision: 'confirm', hours: 3 }), [422]); await expect('they cannot confirm more hours than were logged', pubP(`/service/${sTok}`, { decision: 'confirm', hours: 6, statement: 'I saw him work all day' }), [422]);
  const conf = await expect('the supervisor confirms fewer hours', pubP(`/service/${sTok}`, { decision: 'confirm', hours: 3, statement: 'Worked with our team on the clean-up, three hours' }), [200]); log(conf.data.ok === true, 'it is confirmed'); await expect('the link works only once', pubG(`/service/${sTok}`), [404]); await expect('and cannot be used to answer again', pubP(`/service/${sTok}`, { decision: 'decline', statement: 'Changed my mind about this' }), [404]);
  const mine = (await call('GET', '/advancement/service/mine', X.ST)).data; log(mine.verifiedHours === 3, 'only the hours the supervisor confirmed count');
  const sum = (await G('/service/summary', X.T3)).data; log(sum.totalHours === 3 && sum.students[0].studentName === 'Zubair Haroon Qureshi', 'staff totals match');
  const sl2 = await PO('/service/mine', { activity: 'Reading to children', hours: 2, date: day(-3), supervisorName: 'Ms Noor' }, X.ST); const lk = await expect('a lost link is replaced by the student', PO(`/service/${sl2.data.log.id}/link`, {}, X.ST), [200]); await expect('the old link stops working', pubG(`/service/${tokenOf(sl2)}`), [404]); await expect('a plain teacher cannot replace a link', PO(`/service/${sl2.data.log.id}/link`, {}, X.T1), [403]);
  const dec = await expect('a supervisor declines', pubP(`/service/${tokenOf(lk)}`, { decision: 'decline', statement: 'I do not know this student' }), [200]); log((await ServiceLog.findOne({ _id: sl2.data.log.id })).status === 'Declined', 'a declined entry is kept as declined');
  await expect('staff can reject an entry that looks wrong', PO(`/service/${slId}/reject`, { note: 'Supervisor is a relative' }, X.T3), [200]); log((await G('/service/summary', X.T3)).data.totalHours === 0, 'rejecting a confirmed entry takes its hours off the total'); await expect('it cannot be rejected twice', PO(`/service/${slId}/reject`, { note: 'Again for no reason' }, X.T3), [409]);
  const old90 = await ServiceLog.create({ schoolId: X.s._id, studentId: X.kid._id, studentName: 'Zubair Haroon Qureshi', activity: 'Old unanswered service entry', hours: 1, date: day(-100), supervisorName: 'Nobody', status: 'Pending', linkHash: 'x', linkPrefix: 'zzzzzzzz' });
  await ServiceLog.updateOne({ _id: old90._id }, { $set: { createdAt: new Date(Date.now() - 95 * 86400000) } }); await require('../controllers/qualityController').sweepSchool(X.s._id); log((await ServiceLog.findOne({ _id: old90._id })).status === 'Declined', 'an entry nobody answered in 90 days is closed by the sweep');

  /* ── 7. the annual report ── */
  const yr0 = new Date().getUTCFullYear(); await expect('a year that makes no sense is refused', PO('/reports', { year: 1900 }, X.A1), [422]);
  const rp = await expect('a report is started', PO('/reports', { year: yr0 }, X.A1), [201]); const rid = rp.data.report.id; const m = rp.data.report.metrics;
  log(m.find((x) => x.key === 'students').value >= 1 && m.find((x) => x.key === 'alumni').value >= 5, 'figures are counted from the school\'s records');
  log(m.find((x) => x.key === 'giving') && m.find((x) => x.key === 'standards'), 'giving and accreditation figures are included');
  await expect('a story needs everyone\'s agreement', PO(`/reports/${rid}/stories`, { title: 'A year of reading', text: 'The reading club grew from ten to forty children this year, led by Ms Noor.' }, X.A1), [422]);
  await expect('and a note of who agreed and how', PO(`/reports/${rid}/stories`, { title: 'A year of reading', text: 'The reading club grew from ten to forty children this year, led by Ms Noor.', consentConfirmed: true, consentNote: 'ok' }, X.A1), [422]);
  const stry = await expect('a story with agreement goes in', PO(`/reports/${rid}/stories`, { title: 'A year of reading', text: 'The reading club grew from ten to forty children this year, led by Ms Noor.', consentConfirmed: true, consentNote: 'Ms Noor and the parents signed the form on 2 June' }, X.A1), [201]); const storyId = stry.data.story.id;
  const gone = await PO(`/reports/${rid}/stories`, { title: 'To remove', text: 'This story will be taken out again before the report is approved by anyone.', consentConfirmed: true, consentNote: 'Everyone agreed in writing on 3 June' }, X.A1); await expect('a story can be taken out of a draft', DE(`/reports/${rid}/stories/${gone.data.story.id}`, X.A1), [200]);
  await expect('the figures can be refreshed while it is a draft', PO(`/reports/${rid}/refresh`, {}, X.A1), [200]); await expect('a draft has no PDF', call('GET', `/advancement/reports/${rid}/pdf`, X.A1), [409]);
  const selfA = await PO(`/reports/${rid}/approve`, {}, X.A1); log(selfA.status === 403 && selfA.data.reason === 'maker_checker', 'the person who made the report cannot approve it');
  const okA = await expect('another administrator approves it', PO(`/reports/${rid}/approve`, {}, X.A2), [200]); log(/^[0-9a-f]{64}$/.test(okA.data.hash), 'a check code is made from what was approved');
  await expect('an approved report cannot get a new story', PO(`/reports/${rid}/stories`, { title: 'Late story', text: 'This story is added after approval which must not be allowed to happen at all.', consentConfirmed: true, consentNote: 'Everyone agreed in writing' }, X.A1), [409]); await expect('or new figures', PO(`/reports/${rid}/refresh`, {}, X.A1), [409]);
  const pdf = await fetch(`${base}/api/advancement/reports/${rid}/pdf`, { headers: { authorization: `Bearer ${X.A1}` } }); const buf = Buffer.from(await pdf.arrayBuffer()); log(pdf.status === 200 && buf.slice(0, 4).toString() === '%PDF' && /pdf/.test(pdf.headers.get('content-type')), 'the approved report prints as a PDF');
  await expect('it is not public until published', pubG('/annual/doesnotexist'), [404]); const pub = await expect('it is published', PO(`/reports/${rid}/publish`, {}, X.A1), [200]); const pr = await pubG(`/annual/${pub.data.code}`);
  log(pr.status === 200 && pr.data.report.stories.length === 1 && pr.data.report.hash === okA.data.hash && !pr.data.report.metrics.some((x) => x.value === null), 'the public report shows approved stories and figures only, with its check code');
  await expect('a published report cannot be published again', PO(`/reports/${rid}/publish`, {}, X.A1), [409]);
  const rp2 = await PO('/reports', { year: yr0 - 1, title: 'Tamper test' }, X.A1); await PO(`/reports/${rp2.data.report.id}/approve`, {}, X.A2); await AnnualReport.updateOne({ _id: rp2.data.report.id }, { $set: { metrics: [{ key: 'students', label: 'Students enrolled', value: 99999, unit: 'students', source: 'x' }] } });
  const tam = await PO(`/reports/${rp2.data.report.id}/publish`, {}, X.A1); log(tam.status === 409 && /no longer matches/.test(tam.data.message), 'a report changed after approval will not publish');
  const yrp = await PO('/reports', { year: yr0 }, Y.A1); const yap = await PO(`/reports/${yrp.data.report.id}/approve`, {}, Y.A1); const ya = yrp.data.report.metrics.find((x) => x.key === 'alumni'); log(ya.value === null && /Hidden/.test(ya.source), 'a small alumni count is hidden in the figures'); log(yap.status === 200 && yap.data.soleAdmin === true, 'a school with one administrator can approve its own report, and it is marked as such');

  /* ── 8. the daily job ── */
  process.env.CRON_SECRET = 'adv-secret'; await expect('the daily job refuses an anonymous caller', call('GET', '/cron/advancement', null), [401]); const cron = await call('GET', '/cron/advancement', null, null, { authorization: 'Bearer adv-secret' }); log(cron.status === 200 && cron.data.schools >= 2, 'the daily job runs for every school');
  const lateC = await FundraisingCampaign.create({ schoolId: X.s._id, code: 'latecampaign', title: 'Ended drive', fundId: general, goal: 10, endsOn: day(-3), status: 'Live', uses: [] }); const sw = await require('../controllers/advancementController').sweepSchool(X.s._id); log(sw.closed === 1 && (await FundraisingCampaign.findOne({ _id: lateC._id })).status === 'Closed', 'a campaign past its end date is closed by the sweep');
  const lateP = await PO('/giving/pledges', { donorName: 'Late Donor', fundId: general, amount: 100, schedule: [{ dueOn: day(-20), amount: 100 }] }, X.A1); const sw2 = await require('../controllers/advancementController').sweepSchool(X.s._id); log(sw2.reminded >= 1 && lateP.status === 201, 'overdue pledge instalments are chased');

  function PUT_MIN(id, t, text) { return PU(`/board/meetings/${id}/minutes`, { text }, t); }
};
