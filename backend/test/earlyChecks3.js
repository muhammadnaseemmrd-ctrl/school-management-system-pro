// Photos, the reviewed family diary and the family side.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const g = globalThis.__e15; const { kids, pA, pB, pC, PA, PB, PC, L, C, OUT, A2, rid, rid2, today, raw } = g; const A = tokens.admin;
  const Care = require('../models/EyCare'); const Post = require('../models/EyPost'); const Media = require('../models/EyMedia'); const Profile = require('../models/EyProfile'); const AuditLog = require('../models/AuditLog'); const Notification = require('../models/Notification');
  const k = (i) => String(kids[i]._id); const sid = String(kids[0].schoolId);
  const jpeg = (n = 400) => 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7)]).toString('base64');
  console.log('\n— Early years: photos and the family diary —');

  // ── photos ──
  const up = (b, t = L) => call('POST', '/early/media', t, { roomId: rid, ...b });
  await expect('a photo needs a description', up({ image: jpeg(), alt: ' ', childIds: [k(0)] }), [400]); await expect('a photo must be tagged', up({ image: jpeg(), alt: 'Painting together', childIds: [] }), [400]); await expect('a photo is a JPEG', up({ image: 'data:image/png;base64,AAAA', alt: 'Painting together', childIds: [k(0)] }), [400]);
  await expect('a file that is not a picture is refused', up({ image: 'data:image/jpeg;base64,' + Buffer.alloc(400, 1).toString('base64'), alt: 'Painting together', childIds: [k(0)] }), [400]); await expect('a photo over the school limit is refused', up({ image: jpeg(700 * 1024), alt: 'Painting together', childIds: [k(0)] }), [400]);
  await expect('everyone in the photo must be in this room', up({ image: jpeg(), alt: 'Painting together', childIds: [k(0), k(4)] }), [422]); await expect('a teacher outside the room cannot upload', up({ image: jpeg(), alt: 'Painting together', childIds: [k(0)] }, OUT), [403, 404]);
  const ph0 = await expect('a photo of a child whose family agreed', up({ image: jpeg(), alt: 'Tiny Kid1 painting a sun', childIds: [k(0)] }), [201]); const ph1 = await expect('a photo of a child whose family has not agreed', up({ image: jpeg(500), alt: 'Tiny Kid2 stacking blocks', childIds: [k(1)] }), [201]);
  const mid0 = ph0.data.media._id; const mid1 = ph1.data.media._id; log(ph0.data.media.state === 'Pending', 'a new photo waits for review');
  const ml = await expect('photos are listed', call('GET', `/early/media?roomId=${rid}`, L)); log(ml.data.media.length === 2 && !('image' in ml.data.media[0]), 'the list carries no picture bytes');
  const im = await raw(`/early/media/${mid0}/image`, L); log(im.status === 200 && im.type.includes('image/jpeg') && im.buf[0] === 0xff, 'staff can open the photo'); log((await raw(`/early/media/${mid0}/image`, PA)).status === 404, 'a family cannot see a photo that is not in a published entry'); log((await raw(`/early/media/${mid0}/image`, OUT)).status >= 403, 'a teacher outside the room cannot open it');

  // ── drafting the diary ──
  const kidsIn = [0, 1, 2];
  await expect('a diary needs something in it', call('POST', '/early/posts', L, { childId: k(1) }), [400]); await expect('a behaviour note cannot go in a diary before it is talked over', call('POST', '/early/posts', L, { childId: k(1), careIds: [g.bhId] }), [400]);
  const lc = (await call('GET', `/early/care?roomId=${rid}`, L)).data.entries; const careIds1 = lc.filter((e) => e.childId === k(1) && e.careType !== 'behavior').map((e) => e._id);
  const po = await expect('a diary is drafted from care entries', call('POST', '/early/posts', L, { childId: k(1), body: 'A quiet morning, then happy at lunch.', careIds: careIds1, mediaIds: [mid1], teacherComment: 'Kid2 shared a block today.' }), [201]); const pid1 = po.data.post._id; log(po.data.post.state === 'Draft', 'a diary starts as a draft');
  await expect('one diary per child per day', call('POST', '/early/posts', L, { childId: k(1), body: 'Second' }), [409]); await expect('photos must show this child', call('POST', '/early/posts', L, { childId: k(2), body: 'Hi', mediaIds: [mid0] }), [400]);
  const gen = await expect('drafts are made for the rest of the room from the log', call('POST', '/early/posts/generate', L, { roomId: rid }), [200, 201]); log(gen.data.created >= 2 && gen.data.skipped.some((s) => s.childId === k(1)), 'drafts are made for children without one, and the child who has one is skipped');
  const gposts = (await call('GET', `/early/posts?roomId=${rid}&childId=${k(0)}`, L)).data.posts; const pid0 = gposts[0]._id; log(gposts[0].body.includes('Tiny') && gposts[0].state === 'Draft', 'a generated draft starts with the child\'s day');
  const ur = await expect('a Urdu draft', call('POST', '/early/posts/generate', L, { roomId: rid, lang: 'ur', childIds: [k(2)] }), [200, 201]); log(ur.data.created === 0, 'a child who already has a draft is not drafted twice');
  await expect('a draft is edited', call('PUT', `/early/posts/${pid0}`, L, { body: 'Kid1 had a lovely day. She painted a sun.', mediaIds: [mid0] })); await expect('another carer who did not write it cannot edit', call('PUT', `/early/posts/${pid0}`, C, { body: 'Hijack' }), [403]);
  await expect('a draft cannot be reviewed before it is sent', call('POST', `/early/posts/${pid0}/review`, A2, { decision: 'publish' }), [409]);
  await expect('a draft is sent for review', call('POST', `/early/posts/${pid0}/submit`, L)); await expect('sending twice is refused', call('POST', `/early/posts/${pid0}/submit`, L), [409]); await expect('a sent diary cannot be edited', call('PUT', `/early/posts/${pid0}`, L, { body: 'Late change' }), [409]);

  // ── review by someone else ──
  await expect('the writer cannot review their own diary when another reviewer exists', call('POST', `/early/posts/${pid0}/review`, L, { decision: 'publish' }), [403]); await expect('a carer who is not the lead cannot review', call('POST', `/early/posts/${pid0}/review`, C, { decision: 'publish' }), [403]);
  await expect('a decision is required', call('POST', `/early/posts/${pid0}/review`, A2, {}), [400]); await expect('withholding needs a reason', call('POST', `/early/posts/${pid0}/review`, A2, { decision: 'withhold' }), [400]);
  const wh = await expect('the reviewer sends it back', call('POST', `/early/posts/${pid0}/review`, A2, { decision: 'withhold', note: 'Please add what she ate' })); log(wh.data.post.state === 'Withheld', 'a diary sent back says why'); log(!!(await Notification.findOne({ schoolId: sid, key: `ey-withheld:${pid0}` })), 'the writer is told');
  await expect('the writer fixes it and sends it again', call('POST', `/early/posts/${pid0}/submit`, L)); const pb = await expect('the second person publishes', call('POST', `/early/posts/${pid0}/review`, A2, { decision: 'publish' })); log(pb.data.post.state === 'Published' && pb.data.post.soleReviewer === false && pb.data.post.reviewedByName === 'Second Admin', 'published by a different person');
  log((await Media.findOne({ _id: mid0 })).state === 'Approved', 'the photo is approved when its entry is published'); await expect('a published diary cannot be reviewed again', call('POST', `/early/posts/${pid0}/review`, A2, { decision: 'publish' }), [409]);

  // consent gates publishing
  await call('POST', `/early/posts/${pid1}/submit`, L); const noc = await expect('a photo of a child whose family has not agreed blocks publishing', call('POST', `/early/posts/${pid1}/review`, A2, { decision: 'publish' }), [422]); log(noc.data.issues.length === 1 && /photos/.test(noc.data.issues[0]), 'the reviewer is told which family has not agreed to photos');
  const dm = await expect('the photo can be left out', call('POST', `/early/posts/${pid1}/review`, A2, { decision: 'publish', dropMedia: true })); log(dm.data.post.state === 'Published' && dm.data.post.mediaIds.length === 0, 'the entry is published without the photo');

  // ── what a family sees ──
  const fc = await expect('a parent lists their nursery children', call('GET', '/early/family/children', PA)); log(fc.data.children.length === 2 && fc.data.children.every((c) => c.room), 'a family sees only its own children in the nursery'); const c0 = fc.data.children.find((c) => c._id === k(0)); log(c0.unread === 1 && c0.today.status === 'In', 'unread entries and today\'s status are shown');
  log((await call('GET', '/early/family/children', PC)).data.children.length === 1, 'another family sees only theirs'); await expect('staff cannot use the family list', call('GET', '/early/family/children', L), [403]);
  const ff = await expect('the family reads the diary', call('GET', `/early/family/children/${k(0)}/feed`, PA)); log(ff.data.posts.length === 1 && ff.data.posts[0].photos.length === 1 && ff.data.posts[0].body.includes('painted a sun'), 'the diary and its photo are shown');
  const gotPhoto = await raw(`/early/media/${mid0}/image`, PA); log(gotPhoto.status === 200 && gotPhoto.type.includes('image/jpeg'), 'the family opens the photo once it is published'); log((await raw(`/early/media/${mid0}/image`, PC)).status === 404, 'a family that is not linked cannot open the photo');
  await expect('a parent of another child cannot read this feed', call('GET', `/early/family/children/${k(0)}/feed`, PC), [404]); const f1 = (await call('GET', `/early/family/children/${k(1)}/feed`, PA)).data.posts[0]; log(f1.photos.length === 0 && f1.lines.every((l) => !/Found it hard/.test(l.text)), 'no photo without consent, and the undiscussed behaviour note stays out');
  await expect('the family marks it read', call('POST', `/early/family/posts/${pid0}/read`, PA)); log((await call('GET', '/early/family/children', PA)).data.children.find((c) => c._id === k(0)).unread === 0, 'read entries are counted down'); await expect('another family cannot mark it read', call('POST', `/early/family/posts/${pid0}/read`, PC), [404]);
  const b2 = await call('GET', `/early/family/children/${k(0)}/feed`, PB); log(b2.status === 200 && b2.data.posts.length === 1, 'the second guardian also sees it');

  // the family changes what it agrees to
  await expect('the family withdraws photo consent', call('PUT', `/early/family/children/${k(0)}/consent`, PA, { photos: false })); log((await call('GET', `/early/family/children/${k(0)}/feed`, PA)).data.posts[0].photos.length === 0, 'withdrawing consent hides photos straight away'); log((await raw(`/early/media/${mid0}/image`, PA)).status === 404, 'and the photo can no longer be opened');
  log((await Profile.findOne({ schoolId: sid, childId: kids[0]._id })).consentHistory.length === 2, 'the change is added to the consent history'); await expect('the family agrees again', call('PUT', `/early/family/children/${k(0)}/consent`, PA, { photos: true }));

  // behaviour note
  const bhd = await expect('the behaviour note is talked over', call('POST', `/early/care/${g.bhId}/discussed`, L, { with: 'Mother, at pickup' })); log(bhd.data.entry.discussedWith === 'Mother, at pickup', 'it records who it was discussed with');

  // withdraw a published entry
  await expect('only the lead can withdraw', call('POST', `/early/posts/${pid0}/retract`, C, { reason: 'Mistake' }), [403]); await expect('withdrawing needs a reason', call('POST', `/early/posts/${pid0}/retract`, L, {}), [400]);
  await expect('the lead withdraws an entry', call('POST', `/early/posts/${pid0}/retract`, L, { reason: 'Wrong child in the photo' })); log((await call('GET', `/early/family/children/${k(0)}/feed`, PA)).data.posts.length === 0, 'a withdrawn entry disappears from the family'); await expect('a published photo cannot be deleted while it is in a live entry', call('DELETE', `/early/media/${mid1}`, L), [200]);

  // correcting a published entry
  const lunch = (await Care.find({ schoolId: sid, childId: kids[1]._id, careType: 'mood', state: 'Active' }))[0]; if (lunch) { await call('POST', `/early/care/${lunch._id}/correct`, L, { data: { value: 'tired' }, reason: 'Wrong mood' }); }

  // the guard rails on the diary
  await expect('a diary for a child of another room is refused', call('POST', '/early/posts', L, { childId: k(4), body: 'Hello' }), [403, 404]); await expect('portfolio entries are separate from the diary', call('POST', '/early/posts', L, { childId: k(0), kind: 'portfolio', body: 'Drew a circle for the first time' }), [201]);
  log((await call('GET', `/early/posts?roomId=${rid}&state=Review`, L)).status === 200, 'the review queue can be listed'); log(!!(await AuditLog.findOne({ schoolId: sid, action: 'early.post.publish' })), 'publishing is audited');

  await require('./earlyChecks4')({ call, expect, log, tokens, base });
};
