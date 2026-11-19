// Document, ID, card and certificate studio (E12): original templates, versioned designs with review, print-safe checks,
// QR tokens that carry no personal data, immutable issued documents, revoke and replace, print batches with recovery,
// family access, and the public check page.
module.exports = async ({ call, expect, log, tokens, base }) => {
  const zlib = require('zlib');
  const School = require('../models/School'); const User = require('../models/User'); const Student = require('../models/Student'); const Teacher = require('../models/Teacher'); const Parent = require('../models/Parent'); const Class = require('../models/Class');
  const Exam = require('../models/Exam'); const Marks = require('../models/Marks'); const Subject = require('../models/Subject'); const StoredFile = require('../models/StoredFile'); const FeeInvoice = require('../models/FeeInvoice'); const FeePayment = require('../models/FeePayment');
  const VisitorVisit = require('../models/VisitorVisit'); const AuditLog = require('../models/AuditLog'); const PermissionGrant = require('../models/PermissionGrant');
  const DocTemplate = require('../models/DocTemplate'); const Version = require('../models/DocTemplateVersion'); const Asset = require('../models/StudioAsset'); const Issuance = require('../models/DocIssuance'); const Batch = require('../models/PrintBatch'); const Counter = require('../models/DocCounter');
  const { hashPassword } = require('../utils/password'); const { generateAccessToken } = require('../utils/jwt');
  const code128 = require('../utils/studio/code128'); const Col = require('../utils/studio/color'); const { renderPdf } = require('../utils/studio/render'); const { buildBase } = require('../utils/studio/baseTemplates'); const { validate } = require('../utils/studio/validate'); const Fl = require('../utils/studio/fields');
  console.log('\n— Document and ID studio —');
  const school = await School.findOne({ code: 'DEMO01' }); const sid = String(school._id); const A = tokens.admin; const T = tokens.teacher; const ST = tokens.student; const P = tokens.parent;
  const tok = (doc, role) => generateAccessToken(String(doc._id), sid, role);
  let adm2 = await User.findOne({ schoolId: sid, email: 'second@demo.school' }); if (!adm2) adm2 = await User.create({ schoolId: sid, name: 'Second Admin', email: 'second@demo.school', password: await hashPassword('Admin@1234'), role: 'admin' }); const A2 = tok(adm2, 'admin');
  const sara = await Teacher.findOne({ schoolId: sid, email: 'sara.khan@demo.school' }); const ayesha = await Student.findOne({ schoolId: sid, email: 'ayesha.khan@demo.school' });
  for (const M of [DocTemplate, Version, Asset, Issuance, Batch, Counter]) await M.deleteMany({ schoolId: sid });
  await PermissionGrant.deleteMany({ schoolId: sid, action: { $in: ['documents.issue', 'documents.print', 'documents.template.manage'] } });
  const raw = async (path, token, method = 'GET', body) => { const r = await fetch(`${base}/api${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined }); const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, buf, type: r.headers.get('content-type') || '', head: r.headers }; };
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const png = (w = 4, h = 4) => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 120)]); return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]); };
  const pages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const isPdf = (r) => r.status === 200 && r.buf.slice(0, 5).toString() === '%PDF-' && /pdf/.test(r.type);

  // ── permissions: nobody but an administrator, until one is granted ──
  await expect('unauthenticated refused', call('GET', '/studio/templates', null), [401]);
  await expect('a teacher has no studio access by default', call('GET', '/studio/templates', T), [403]);
  await expect('a student cannot open the studio', call('GET', '/studio/templates', ST), [403]);
  await expect('a parent cannot open the studio', call('GET', '/studio/overview', P), [403]);
  await expect('the platform owner has no implicit access to a school\'s documents', call('GET', '/studio/templates', tokens.superadmin), [401, 403]);

  // ── catalog and original templates ──
  const cat = (await expect('catalog lists families and fields', call('GET', '/studio/catalog', A))).data;
  const cert = cat.families.find((f) => f.key === 'certificate');
  log(cat.families.length === 12 && !!cert && !cert.fields['invoice.total'] && !!cert.fields['student.name'], 'a certificate can use student fields but not invoice fields');
  log(cat.families.find((f) => f.key === 'idCard').fields['doc.verifyUrl'].qrOnly === true, 'the verification link is marked as QR-only');
  const list = (await expect('first visit seeds Aulensia\'s original templates', call('GET', '/studio/templates', A))).data.templates;
  log(list.length === 17 && list.every((t) => t.isBase && t.liveVersion === 1), `17 original templates, each with a live version (${list.length})`);
  log(list.every((t) => t.provenance.source === 'aulensia-original' && t.provenance.license), 'every original template records its provenance and licence');
  log(new Set(list.map((t) => t.family)).size === 12, 'originals cover all twelve document types');
  log(['completion', 'merit', 'appreciation', 'transfer', 'character', 'conduct'].every((k) => list.some((t) => t.family === 'certificate' && t.kind === k)), 'all six certificate kinds have an original');
  log((await expect('listing again does not duplicate', call('GET', '/studio/templates', A))).data.templates.length === 17, 'base templates are seeded only once');
  const byKey = (k) => list.find((t) => t.key === k);
  const idBase = byKey('id-card-student');
  const idV = (await expect('open the ID card original', call('GET', `/studio/templates/${idBase._id}/versions/${idBase.liveVersion ? (await Version.findOne({ schoolId: sid, templateId: idBase._id }))._id : ''}`, A))).data;
  log(idV.version.layout.sides.length === 2 && idV.version.state === 'Published', 'the ID card has a front and a back and is published');
  log(buildBase().every((t) => { const r = validate(t.layout, { family: t.family }); return !r.errors.length && !r.warnings.length; }), 'every original passes the print and contrast checks with no warnings');
  await expect('an original cannot get a new draft', call('POST', `/studio/templates/${idBase._id}/versions`, A), [403]);
  await expect('an original\'s version cannot be saved over', call('PUT', `/studio/templates/${idBase._id}/versions/${idV.version._id}`, A, { layout: idV.version.layout }), [403, 422]);

  // ── pure pieces ──
  log(code128.encode('A').reduce((a, b) => a + b[0], 0) === 46, 'Code 128 barcode of one character is 46 modules wide');
  log(code128.encode('héllo') === null, 'a barcode refuses characters it cannot encode');
  log(Math.round(Col.ratio('#000000', '#FFFFFF')) === 21 && Col.ratio('#777777', '#FFFFFF') < 4.5, 'contrast ratio maths is right (black on white 21:1, mid grey fails AA)');
  const pdfTest = await renderPdf({ docs: [{ layout: byKeyLayout(), values: { ...Fl.sampleValues('idCard'), 'doc.verifyUrl': 'https://x.test/verify/ABC' }, locale: 'en' }], mode: 'single', title: 'T', loadImage: async () => null });
  function byKeyLayout() { return buildBase().find((t) => t.key === 'id-card-student').layout; }
  log(pdfTest.buffer.slice(0, 5).toString() === '%PDF-' && pages(pdfTest.buffer) === 2, 'a two-sided design renders as two pages');
  const s = pdfTest.buffer.toString('latin1'); log(/StructTreeRoot/.test(s) && /MarkInfo/.test(s) && /\/Lang/.test(s), 'the PDF is tagged with a structure tree and a language');
  const urdu = await renderPdf({ docs: [{ layout: buildBase().find((t) => t.key === 'fee-receipt-roll').layout, values: { ...Fl.sampleValues('receipt'), ...Fl.URDU_SAMPLE, 'doc.verifyUrl': 'https://x.test/v/A' }, locale: 'ur' }], mode: 'single', title: 'U', loadImage: async () => null });
  log(urdu.buffer.length > 5000 && /NotoNaskh/.test(urdu.buffer.toString('latin1')), 'Urdu text is drawn with an embedded Naskh font');

  // ── copy, edit, validate ──
  const dup = (await expect('copy the ID card original', call('POST', `/studio/templates/${idBase._id}/duplicate`, A, { name: 'Campus ID card' }), [201])).data;
  log(dup.version.state === 'Draft' && dup.version.version === 1 && !dup.template.isBase && /Based on/.test(dup.template.provenance.license), 'the copy is a draft and says what it was based on');
  const tplId = dup.template._id; const verId = dup.version._id;
  let lay = (await call('GET', `/studio/templates/${tplId}/versions/${verId}`, A)).data.version.layout;
  const saveLay = (l, extra = {}) => call('PUT', `/studio/templates/${tplId}/versions/${verId}`, A, { layout: l, ...extra });
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const errs = async (mut) => { const l = clone(lay); mut(l); const r = (await saveLay(l)).data; return r.version ? r.version.report.errors.map((e) => e.message).join(' | ') : JSON.stringify(r); };
  log(/not available for a Student ID card/.test(await errs((l) => { l.sides[0].layers.find((x) => x.name === 'Name').text = '{{invoice.total}}'; })), 'a field from another document type is refused');
  log(/only carry the verification link/.test(await errs((l) => { l.sides[0].layers.find((x) => x.type === 'qr').value = '{{student.admissionNo}}'; })), 'a QR code carrying personal data is refused');
  log(/only carry the document serial/.test(await errs((l) => { l.sides[1].layers.find((x) => x.type === 'barcode').value = '{{student.name}}'; })), 'a barcode carrying anything but the serial is refused');
  log(/beyond the page and bleed/.test(await errs((l) => { l.sides[0].layers[5].x = 200; })), 'a layer that leaves the page is refused');
  log(/hard to read: contrast/.test(await errs((l) => { l.sides[0].layers.find((x) => x.name === 'Name').color = '#F0F0F0'; })), 'text that is too faint is refused with its contrast ratio');
  log(/square/.test(await errs((l) => { const q = l.sides[0].layers.find((x) => x.type === 'qr'); q.h = 10; })), 'a QR code must be square');
  log(/no usage right recorded|no longer available/.test(await errs((l) => { l.sides[0].layers.push({ id: 'zz1', type: 'image', source: 'asset', assetId: '000000000000000000000000', name: 'Mystery', x: 5, y: 5, w: 10, h: 10 }); })), 'a picture with no recorded right to use it is refused');
  const warn = (await saveLay((() => { const l = clone(lay); l.sides[0].layers.find((x) => x.name === 'Valid until').size = 5; l.sides[0].layers.find((x) => x.name === 'Admission no').x = 0.5; return l; })())).data.version.report.warnings.map((w) => w.message).join(' | ');
  log(/below 6 pt/.test(warn) && /safe margin/.test(warn), 'tiny text and text inside the safe margin only warn');
  await expect('a design with no paper size is refused', saveLay({ sides: [] }), [400]);
  await expect('nothing but a draft can be saved by someone without the permission', call('PUT', `/studio/templates/${tplId}/versions/${verId}`, T, { layout: lay }), [403]);
  const colorCheck = (await expect('try a theme before saving it', call('POST', '/studio/validate', A, { family: 'idCard', layout: lay, theme: { primary: '#FFEB99' } }))).data.report;
  log(colorCheck.errors.some((e) => /hard to read/.test(e.message)), 'a pale school colour fails the contrast check before anything is printed');
  await expect('a bad colour is ignored, not stored', call('POST', '/studio/validate', A, { family: 'idCard', layout: lay, theme: { primary: 'red' } }));

  // ── pictures and their rights ──
  const form = (name, data, extra = {}, filename = 'logo.png', type = 'image/png') => { const f = new FormData(); f.append('file', new Blob([data], { type }), filename); f.append('name', name); for (const [k, v] of Object.entries(extra)) f.append(k, v); return f; };
  const a1 = (await raw('/studio/assets', A, 'POST', form('Crest', png(), { kind: 'logo' }))); const a1d = JSON.parse(a1.buf.toString());
  log(a1.status === 201 && a1d.asset.license.kind === 'unknown' && !a1d.asset.verified, 'an uploaded picture starts with no right to use recorded');
  log((await raw('/studio/assets', A, 'POST', form('Text', Buffer.from('hello'), {}, 'a.png'))).status === 400, 'a file that is not PNG or JPEG is refused');
  log((await raw('/studio/assets', A, 'POST', form('Big', Buffer.concat([png(), Buffer.alloc(2.2 * 1024 * 1024)])))).status === 400, 'a picture over 2 MB is refused');
  log((await raw('/studio/assets', A, 'POST', form('Stock', png(), { licenseKind: 'licensed' }))).status === 400, 'a licensed picture must say where it came from');
  await expect('clearing a picture with no right recorded is refused', call('POST', `/studio/assets/${a1d.asset._id}/verify`, A), [422]);
  await expect('a teacher cannot add pictures', raw('/studio/assets', T, 'POST', form('X', png())).then((r) => ({ status: r.status })), [403]);
  await expect('record the right to use', call('PUT', `/studio/assets/${a1d.asset._id}/license`, A, { licenseKind: 'owned', licenseSource: 'Drawn by the school' }));
  const withAsset = clone(lay); withAsset.sides[0].layers.push({ id: 'crest1', type: 'image', source: 'asset', assetId: a1d.asset._id, name: 'Crest', alt: 'School crest', x: 70, y: 3.4, w: 8, h: 8, fit: 'contain' });
  log(/not cleared for use/.test((await saveLay(withAsset)).data.version.report.errors.map((e) => e.message).join(' | ')), 'a picture that no administrator has cleared blocks the design');
  await expect('an administrator clears it', call('POST', `/studio/assets/${a1d.asset._id}/verify`, A));
  log((await saveLay(withAsset)).data.version.report.errors.length === 0, 'once cleared, the picture can be used');
  await expect('changing the licence withdraws the clearance', call('PUT', `/studio/assets/${a1d.asset._id}/license`, A, { licenseKind: 'cc', licenseSource: 'Wikimedia', attribution: 'Someone' }));
  log((await Asset.findById(a1d.asset._id)).verified === false, 'a changed licence needs clearing again');
  await call('POST', `/studio/assets/${a1d.asset._id}/verify`, A2);

  // ── review: draft → review → published, with a second person ──
  await expect('a design with problems cannot be sent for review', (async () => { await saveLay(clone((() => { const l = clone(lay); l.sides[0].layers.find((x) => x.name === 'Name').text = '{{invoice.total}}'; return l; })())); return call('POST', `/studio/templates/${tplId}/versions/${verId}/submit`, A); })(), [422]);
  await saveLay(withAsset, { name: 'Campus ID card', note: 'Adds the crest' });
  await expect('send for review', call('POST', `/studio/templates/${tplId}/versions/${verId}/submit`, A));
  await expect('a version in review cannot be changed', saveLay(withAsset), [422]);
  await expect('the author cannot approve their own design', call('POST', `/studio/templates/${tplId}/versions/${verId}/approve`, A), [403]);
  await expect('a reviewer must say what to change', call('POST', `/studio/templates/${tplId}/versions/${verId}/reject`, A2, {}), [400]);
  await expect('the reviewer sends it back', call('POST', `/studio/templates/${tplId}/versions/${verId}/reject`, A2, { note: 'Make the crest bigger' }));
  log((await Version.findById(verId)).state === 'Draft', 'a rejected version returns to draft with the note kept');
  await expect('send for review again', call('POST', `/studio/templates/${tplId}/versions/${verId}/submit`, A));
  await expect('a second administrator approves', call('POST', `/studio/templates/${tplId}/versions/${verId}/approve`, A2));
  let t0 = (await call('GET', `/studio/templates/${tplId}`, A)).data; log(t0.template.liveVersion === 1 && t0.versions[0].state === 'Published' && t0.versions[0].hash.length === 64, 'the approved version is live and has a content hash');
  await expect('approving twice is refused', call('POST', `/studio/templates/${tplId}/versions/${verId}/approve`, A2), [422]);

  // ── proofs ──
  const pr = await raw(`/studio/templates/${tplId}/versions/${verId}/proof`, A); log(isPdf(pr) && pages(pr.buf) === 2, 'a print proof is a PDF with a page per side');
  log(isPdf(await raw(`/studio/templates/${tplId}/versions/${verId}/proof?locale=ur`, A)), 'an Urdu right-to-left preview renders');
  log(isPdf(await raw(`/studio/templates/${tplId}/versions/${verId}/proof?subjectId=${ayesha._id}`, A)), 'a proof can use a real student without issuing anything');
  log((await Issuance.countDocuments({ schoolId: sid })) === 0, 'drawing a proof issues nothing');
  log((await raw(`/studio/templates/${tplId}/versions/${verId}/proof?subjectId=${sara._id}`, A)).status === 422, 'a proof for the wrong kind of record is refused');
  log((await raw(`/studio/templates/${tplId}/versions/${verId}/proof`, T)).status === 403, 'a teacher cannot draw proofs');

  // ── issue an ID card ──
  const issue = (templateId, body, token = A) => call('POST', '/studio/issue', token, { templateId, ...body });
  await expect('issue needs a person', issue(tplId, {}), [400]);
  const tiny = await StoredFile.create({ schoolId: sid, key: 'abcdef012345abcdef012345', originalName: 'photo.png', mimeType: 'image/png', size: png().length, data: png(8, 10) });
  await Student.updateOne({ _id: ayesha._id }, { $set: { avatar: `/api/files/stored/${tiny._id}/${tiny.key}`, bloodGroup: 'B+', father: { name: 'Imran Khan', mobileNumber: '0300 1234567' } } });
  const i1 = (await expect('issue Ayesha\'s ID card', issue(tplId, { subjectIds: [String(ayesha._id)] }), [201])).data;
  log(/^ID-\d{4}-000001$/.test(i1.issued[0].serial), `serial number follows the pattern (${i1.issued[0].serial})`);
  const d1 = await Issuance.findById(i1.issued[0]._id);
  log(/^[0-9A-HJKMNP-TV-Z]{24}$/.test(d1.token) && d1.snapshot.verifyUrl.endsWith(`/verify/${d1.token}`), 'the QR link ends in an opaque 24-character token');
  log(![String(ayesha._id), ayesha.admissionNumber, ayesha.name, ayesha.email].filter(Boolean).some((x) => d1.snapshot.verifyUrl.includes(x)), 'the QR link contains nothing about the student');
  log(d1.snapshot.values['student.photo'].startsWith('stored:') && d1.snapshot.values['student.photo'] !== `stored:${tiny._id}`, 'the photo is copied at issue so later changes cannot alter it');
  log(d1.snapshot.layout.sides.length === 2 && d1.versionNo === 1 && d1.contentHash.length === 64, 'the issued document keeps its own copy of the design, its version and a hash');
  const again = await issue(tplId, { subjectIds: [String(ayesha._id)] }); log(again.status === 422 && /Already has a current/.test(again.data.skipped[0].reason), 'a second ID card for the same student is refused');
  await expect('a replacement needs a reason', issue(tplId, { subjectIds: [String(ayesha._id)], replace: true }), [400]);
  await expect('a teacher cannot issue', issue(tplId, { subjectIds: [String(ayesha._id)] }, T), [403]);
  const wrongKind = await issue(tplId, { subjectIds: [String(sara._id)] }); log(wrongKind.status === 422 && /not found/i.test(wrongKind.data.skipped[0].reason), 'an ID card cannot be issued to a staff id');
  const pdf1 = await raw(`/studio/issuances/${d1._id}/pdf`, A); log(isPdf(pdf1) && pages(pdf1.buf) === 2, 'the issued document downloads as a two-page PDF');
  const pdf1b = await raw(`/studio/issuances/${d1._id}/pdf`, A); log(pdf1.buf.equals(pdf1b.buf), 'printing the same document twice gives the very same file');

  // ── a later version never changes what was issued ──
  await expect('start version 2 of the template', call('POST', `/studio/templates/${tplId}/versions`, A), [201]);
  const v2 = await Version.findOne({ schoolId: sid, templateId: tplId, version: 2 });
  await expect('a second open draft is refused', call('POST', `/studio/templates/${tplId}/versions`, A), [409]);
  const l2 = clone(v2.layout); l2.sides[0].layers.find((x) => x.name === 'Name').size = 13; l2.sides[0].background = '#EEF3FA';
  await call('PUT', `/studio/templates/${tplId}/versions/${v2._id}`, A, { layout: l2 }); await call('POST', `/studio/templates/${tplId}/versions/${v2._id}/submit`, A);
  await expect('approve version 2', call('POST', `/studio/templates/${tplId}/versions/${v2._id}/approve`, A2));
  log((await Version.findById(verId)).state === 'Archived' && (await DocTemplate.findById(tplId)).liveVersion === 2, 'version 1 is archived and version 2 is live');
  const pdf1c = await raw(`/studio/issuances/${d1._id}/pdf`, A); log(pdf1c.buf.equals(pdf1.buf), 'the earlier document still prints exactly as it was');
  const snap = (await call('GET', `/studio/issuances/${d1._id}/snapshot`, A)).data; log(snap.layout.sides[0].background === 'theme.paper' && snap.issuance.versionNo === 1, 'the issued copy still has the version 1 design');
  await Student.updateOne({ _id: ayesha._id }, { $set: { name: 'Ayesha Renamed' } }); await StoredFile.deleteOne({ _id: tiny._id });
  const pdf1d = await raw(`/studio/issuances/${d1._id}/pdf`, A); log(pdf1d.buf.equals(pdf1.buf), 'renaming the student and deleting the original photo changes nothing already issued');
  await Student.updateOne({ _id: ayesha._id }, { $set: { name: ayesha.name } });
  await expect('a draft can be discarded', (async () => { await call('POST', `/studio/templates/${tplId}/versions`, A); const v3 = await Version.findOne({ schoolId: sid, templateId: tplId, version: 3 }); return call('DELETE', `/studio/templates/${tplId}/versions/${v3._id}`, A); })());
  log((await DocTemplate.findById(tplId)).latestVersion === 2, 'discarding a draft gives its number back');

  // ── public check page ──
  const pub = (token) => call('GET', `/public/verify/${token}`, null);
  const v1 = (await expect('anyone can check a document by its token', pub(d1.token))).data;
  log(v1.valid === true && v1.status === 'Valid' && v1.serial === d1.serial && v1.document === 'Student ID card', 'the check page says the document is valid');
  log(Object.keys(v1).sort().join() === 'document,expired,holder,issuedOn,school,serial,status,title,valid,validUntil', 'the check page returns only a fixed, small set of fields');
  log(v1.holder === 'Ayesha K.' && !JSON.stringify(v1).includes(String(ayesha._id)) && !JSON.stringify(v1).includes(ayesha.email), 'the holder is masked and no ids or contact details are exposed');
  await expect('an unknown token is not found', pub('0'.repeat(24)), [404]); await expect('a malformed token is not found', pub('abc'), [404]); await expect('the token check is not case sensitive', pub(d1.token.toLowerCase()));

  // ── replace and revoke ──
  const rep = (await expect('replace the ID card', call('POST', `/studio/issuances/${d1._id}/replace`, A, { reason: 'Lost card' }), [201])).data.issuance;
  log(rep.serial !== d1.serial && rep.replacesId === String(d1._id), 'the replacement has its own serial and points at the old one');
  const old1 = await Issuance.findById(d1._id); log(old1.status === 'Superseded' && old1.replacedById && /Lost card/.test(old1.revokeReason), 'the old card is marked replaced with the reason');
  log((await pub(d1.token)).data.status === 'Replaced' && (await pub(d1.token)).data.valid === false, 'the old card now shows as replaced on the check page');
  await expect('a replaced document cannot be revoked again', call('POST', `/studio/issuances/${d1._id}/revoke`, A, { reason: 'Double' }), [409]);
  const newDoc = await Issuance.findById(rep._id);
  await expect('a reason is needed to revoke', call('POST', `/studio/issuances/${rep._id}/revoke`, A, { reason: 'x' }), [400]);
  await expect('a teacher cannot revoke', call('POST', `/studio/issuances/${rep._id}/revoke`, T, { reason: 'Because' }), [403]);
  const detail = (await call('GET', `/studio/issuances/${rep._id}`, A)).data; log(detail.earlier.length === 1 && detail.earlier[0].serial === d1.serial, 'the history shows the card it replaced');

  // ── fixtures for the other document kinds ──
  const cls = await Class.create({ schoolId: sid, standard: '77', division: 'S', capacity: 30, academicYear: '2026-2027' }); const subjA = await Subject.create({ schoolId: sid, name: 'E12 English', code: 'E12E', standard: '77' }); const subjB = await Subject.create({ schoolId: sid, name: 'E12 Maths', code: 'E12M', standard: '77' });
  const pw = await hashPassword('Student@123'); const kids = [];
  for (let i = 1; i <= 5; i++) kids.push(await Student.create({ schoolId: sid, schoolCode: 'DEMO01', schoolName: 'Demo Public School', name: `Studio Kid ${i} Rao`, email: `studiokid${i}@demo.school`, password: pw, rollNumber: `S${i}`, admissionNumber: `ADM-S${i}`, classId: cls._id, standard: '77', division: 'S', isActive: true }));
  await Student.updateOne({ _id: ayesha._id }, { $set: { classId: cls._id, standard: '77', division: 'S' } });
  const exA = await Exam.create({ schoolId: sid, name: 'E12 Annual', classId: cls._id, subjectId: subjA._id, date: new Date(), totalMarks: 100, passingMarks: 35 }); const exB = await Exam.create({ schoolId: sid, name: 'E12 Annual', classId: cls._id, subjectId: subjB._id, date: new Date(), totalMarks: 100, passingMarks: 35 });
  for (const [k, kid] of [ayesha, ...kids].entries()) { await Marks.create({ schoolId: sid, examId: exA._id, studentId: kid._id, subjectId: subjA._id, marks: 90 - k * 5, outOfMarks: 100, grade: 'A', passStatus: 'Pass' }); await Marks.create({ schoolId: sid, examId: exB._id, studentId: kid._id, subjectId: subjB._id, marks: 80 - k * 5, outOfMarks: 100, passStatus: 'Pass' }); }
  const tmpl = (key) => DocTemplate.findOne({ schoolId: sid, key });
  const bid = async (key) => String((await tmpl(key))._id);

  // ── certificates ──
  const certId = await bid('certificate-merit');
  await expect('a merit certificate needs a citation', issue(certId, { subjectIds: [String(ayesha._id)] }), [400]);
  const c1 = (await expect('issue a merit certificate', issue(certId, { subjectIds: [String(ayesha._id), String(kids[0]._id)], custom: { citation: 'for outstanding performance in Mathematics', signatory: 'Dr. Nadia Rauf', signatoryTitle: 'Principal' } }), [201])).data;
  log(c1.issued.length === 2 && /^CRT-\d{4}-000001$/.test(c1.issued[0].serial) && /000002$/.test(c1.issued[1].serial), 'two certificates get consecutive serials');
  const cdup = await issue(certId, { subjectIds: [String(ayesha._id)], custom: { citation: 'for outstanding performance in Mathematics' } }); log(cdup.status === 422 && /already issued/.test(cdup.data.skipped[0].reason), 'the same certificate is not issued twice by accident');
  await expect('a different citation is a different certificate', issue(certId, { subjectIds: [String(ayesha._id)], custom: { citation: 'for helping her classmates' } }), [201]);
  const mix = await issue(certId, { subjectIds: [String(kids[1]._id), '000000000000000000000000'], custom: { citation: 'for punctuality' } }); log(mix.status === 201 && mix.data.issued.length === 1 && mix.data.skipped.length === 1, 'in a bulk issue one bad record is skipped, the rest still issue');
  const cpdf = await raw(`/studio/issuances/${c1.issued[0]._id}/pdf`, A); log(isPdf(cpdf) && pages(cpdf.buf) === 1, 'a certificate is a single A4 landscape page');
  const tc = await issue(await bid('certificate-transfer'), { subjectIds: [String(kids[2]._id)], custom: { leavingDate: '30 Jun 2026', conduct: 'excellent' } }); log(tc.status === 201, 'a school leaving certificate issues without a citation');

  // ── report card ──
  const rcId = await bid('report-card');
  await expect('a report card needs an exam', issue(rcId, { subjectIds: [String(ayesha._id)] }), [400]);
  const nores = await issue(rcId, { subjectIds: [String(ayesha._id)], term: 'No such exam' }); log(nores.status === 422 && /No exam named/.test(nores.data.skipped[0].reason), 'a report card for an unknown exam is refused');
  const rc = (await expect('issue report cards for the class', issue(rcId, { subjectIds: [String(ayesha._id), ...kids.map((k) => String(k._id))], term: 'E12 Annual', custom: { citation: 'Keep it up.' } }), [201])).data;
  const rc0 = await Issuance.findById(rc.issued[0]._id); const rows = rc0.snapshot.values['transcript.rows'];
  log(rows.length === 2 && rc0.snapshot.values['transcript.total'] === '170 / 200' && rc0.snapshot.values['transcript.position'] === '1st', 'the report card uses the real marks, total and class position');
  log(rc.issued.length === 6 && (await Issuance.findById(rc.issued[5]._id)).snapshot.values['transcript.position'] === '6th', 'positions run down the class');
  await Marks.updateOne({ schoolId: sid, examId: exA._id, studentId: ayesha._id }, { $set: { marks: 10 } });
  log((await Issuance.findById(rc0._id)).snapshot.values['transcript.total'] === '170 / 200', 'a later change to the marks does not alter an issued report card');
  await Marks.updateOne({ schoolId: sid, examId: exA._id, studentId: ayesha._id }, { $set: { marks: 90 } });
  log(isPdf(await raw(`/studio/issuances/${rc0._id}/pdf`, A)), 'the report card downloads');

  // ── fee documents, staff and visitor ──
  const inv = await FeeInvoice.create({ schoolId: sid, studentId: ayesha._id, number: 'E12-INV-1', challanCode: 'E12CH1', period: 'December 2026', dueDate: new Date(Date.now() + 864e5 * 10), lines: [{ key: 'tuition', kind: 'tuition', title: 'Tuition', amount: 15000, net: 15000 }], total: 15000, status: 'Open' });
  const ch = await issue(await bid('fee-challan'), { subjectIds: [String(inv._id)] }); log(ch.status === 201 && /^CHN-/.test(ch.data.issued[0].serial), 'a fee challan is issued for an invoice');
  const chd = await Issuance.findById(ch.data.issued[0]._id); log(chd.snapshot.values['invoice.balance'] === '15,000' && chd.studentId && String(chd.studentId) === String(ayesha._id), 'the challan shows the balance and is linked to the student');
  const pay = await FeePayment.create({ schoolId: sid, studentId: ayesha._id, amount: 5000, method: 'cash', status: 'Confirmed', receiptNo: 'E12-RC-1', allocations: [{ invoiceId: String(inv._id), invoiceNumber: 'E12-INV-1', amount: 5000 }], confirmedByName: 'Front office' });
  const rcp = await issue(await bid('fee-receipt-roll'), { subjectIds: [String(pay._id)] }); log(rcp.status === 201 && isPdf(await raw(`/studio/issuances/${rcp.data.issued[0]._id}/pdf`, A)), 'a receipt is issued for a confirmed payment and prints on an 80 mm roll');
  const pend = await FeePayment.create({ schoolId: sid, studentId: ayesha._id, amount: 100, method: 'cash', status: 'Pending' }); const rp = await issue(await bid('fee-receipt-roll'), { subjectIds: [String(pend._id)] }); log(rp.status === 422 && /confirmed payment/.test(rp.data.skipped[0].reason), 'no receipt is made for a payment that is not confirmed');
  const badge = await issue(await bid('staff-badge'), { subjectIds: [String(sara._id)] }); log(badge.status === 201 && /^STF-/.test(badge.data.issued[0].serial), 'a staff badge is issued for a teacher');
  const lib = await issue(await bid('library-card'), { subjectIds: [String(kids[0]._id)] }); log(lib.status === 201, 'a library card is issued');
  const visit = await VisitorVisit.create({ schoolId: sid, visitorName: 'Bilal Ahmed', purpose: 'Deliver books', expectedFrom: new Date(), expectedTo: new Date(Date.now() + 36e5 * 2), status: 'Approved', hostType: 'office' });
  const vp = await issue(await bid('visitor-pass'), { subjectIds: [String(visit._id)] }); log(vp.status === 201 && (await Issuance.findById(vp.data.issued[0]._id)).validUntil.getTime() === visit.expectedTo.getTime(), 'a visitor pass is valid until the end of the visit');
  const visit2 = await VisitorVisit.create({ schoolId: sid, visitorName: 'Nope', purpose: 'x', expectedFrom: new Date(), expectedTo: new Date(Date.now() + 36e5), status: 'Requested', hostType: 'office' });
  log((await issue(await bid('visitor-pass'), { subjectIds: [String(visit2._id)] })).status === 422, 'no pass is made for a visit that is not approved');
  const lh = await issue(await bid('letterhead'), { custom: { recipient: 'The Parent', subject: 'Fee concession', body: 'Your request has been approved.\n\nRegards,', signatory: 'Principal' } }); log(lh.status === 201 && lh.data.issued[0].subjectName === 'The Parent', 'a letter on the letterhead needs no student');
  const lt = await issue(await bid('official-letter'), { subjectIds: [String(kids[3]._id)], custom: { subject: 'Meeting', body: 'Please see the principal.' } }); log(lt.status === 201, 'an official letter about one student issues');

  // ── lists, search, serial counters ──
  const all = (await call('GET', '/studio/issuances?per=100', A)).data; log(all.total >= 20 && all.issuances.every((d) => !d.snapshot), 'the document list never sends the heavy copy of the design');
  log((await call('GET', `/studio/issuances?q=${rc0.serial}`, A)).data.total === 1, 'documents can be found by serial number');
  log((await call('GET', `/studio/issuances?family=certificate&status=Issued`, A)).data.issuances.every((d) => d.family === 'certificate'), 'the list can be filtered by type');
  const serials = (await Issuance.find({ schoolId: sid })).map((d) => d.serial); log(new Set(serials).size === serials.length, 'no two documents share a serial number');
  const par = await Promise.all(Array.from({ length: 6 }, (_, i) => issue(certId, { subjectIds: [String(kids[4]._id)], custom: { citation: `Parallel ${i}` } })));
  const ps = par.flatMap((r) => (r.data.issued || []).map((x) => x.serial)); log(par.every((r) => r.status === 201) && new Set(ps).size === 6, 'six documents issued at the same moment get six different serials');
  const ov = (await call('GET', '/studio/overview', A)).data; log(ov.issuedLast30 >= 20 && ov.templates >= 18, 'the overview counts what was issued');

  // ── family access ──
  const mine = (await expect('a student sees their own documents', call('GET', '/studio/my/documents', ST))).data.documents;
  log(mine.length >= 4 && mine.every((d) => String(d.studentId) === String(ayesha._id)), 'a student sees only their own documents');
  log(!mine.some((d) => d.family === 'visitorPass' || d.family === 'staffBadge'), 'a student never sees visitor passes or staff badges');
  const rcMine = mine.find((d) => d.family === 'reportCard'); log(isPdf(await raw(`/studio/my/documents/${rcMine._id}/pdf`, ST)), 'a student can download their report card');
  log((await raw(`/studio/my/documents/${rc.issued[1]._id}/pdf`, ST)).status === 404, 'a student cannot download a classmate\'s report card');
  const pm = (await call('GET', '/studio/my/documents', P)).data.documents; log(pm.length > 0 && pm.every((d) => String(d.studentId) === String(ayesha._id)), 'a parent sees their child\'s documents');
  log((await raw(`/studio/my/documents/${rc.issued[1]._id}/pdf`, P)).status === 404, 'a parent cannot download another family\'s document');
  await expect('a student cannot call staff endpoints', call('GET', '/studio/issuances', ST), [403]);

  // ── permissions can be granted, time-limited ──
  const inOneDay = new Date(Date.now() + 864e5).toISOString();
  await expect('grant the registrar permission to a teacher', call('POST', '/permissions/grants', A, { action: 'documents.issue', granteeId: String(sara._id), granteeRole: 'teacher', validTo: inOneDay, reason: 'Acts as registrar this week' }), [201]);
  await expect('the registrar can now issue', issue(await bid('library-card'), { subjectIds: [String(kids[1]._id)] }), [201].concat([]));
  const gi = await issue(await bid('library-card'), { subjectIds: [String(kids[2]._id)] }, T); log(gi.status === 201 && gi.data.issued[0].serial, 'a teacher with the registrar grant can issue');
  await expect('but cannot design templates', call('POST', '/studio/templates', T, { name: 'X', family: 'idCard' }), [403]);
  await expect('and cannot run print batches', call('GET', '/studio/batches', T), [403]);
  await expect('and cannot see the families\' private lists', call('GET', '/studio/my/documents', T), [403]);
  const gr = await PermissionGrant.findOne({ schoolId: sid, action: 'documents.issue', granteeId: sara._id, revokedAt: null }); await expect('an administrator revokes the grant', call('POST', `/permissions/grants/${gr._id}/revoke`, A, { reason: 'Week over' }));
  await expect('the revoked registrar can no longer issue', issue(await bid('library-card'), { subjectIds: [String(kids[3]._id)] }, T), [403]);

  // ── print batches ──
  const idIds = []; for (const k of [ayesha, ...kids]) { const r = await issue(tplId, { subjectIds: [String(k._id)], replace: String(k._id) === String(ayesha._id), replaceReason: 'Reprint for batch' }); if (r.data.issued) idIds.push(r.data.issued[0]._id); }
  log(idIds.length === 6, 'six ID cards are ready for a batch');
  await expect('a batch needs a name', call('POST', '/studio/batches', A, { issuanceIds: idIds }), [400]); await expect('a batch needs documents', call('POST', '/studio/batches', A, { name: 'Empty', issuanceIds: [] }), [400]);
  const mixed = await call('POST', '/studio/batches', A, { name: 'Mixed', issuanceIds: [idIds[0], c1.issued[0]._id] }); log(mixed.status === 422 && /same paper size/.test(mixed.data.message), 'cards and A4 pages cannot share a batch');
  const toomany = await call('POST', '/studio/batches', A, { name: 'Wide', issuanceIds: idIds, sheet: { cols: 5, rows: 1 } }); log(toomany.status === 422 && /do not fit/.test(toomany.data.message), 'a sheet layout that does not fit the page is refused');
  const revokedCard = (await Issuance.find({ schoolId: sid, family: 'idCard', status: 'Superseded' }))[0]; const sup = await call('POST', '/studio/batches', A, { name: 'Old', issuanceIds: [String(revokedCard._id)] }); log(sup.status === 422 && /cannot be printed/.test(sup.data.message), 'a replaced card cannot be sent to print');
  await expect('a teacher without print rights cannot make a batch', call('POST', '/studio/batches', T, { name: 'X', issuanceIds: idIds }), [403]);
  const b = (await expect('make a print batch', call('POST', '/studio/batches', A, { name: 'Class 77 ID cards', issuanceIds: idIds }), [201])).data.batch;
  log(b.status === 'Draft' && b.counts.queued === 6 && b.sheet.perSheet === 8, 'eight ID cards fit on an A4 sheet, six are queued');
  const bp = await raw(`/studio/batches/${b._id}/pdf`, A); log(isPdf(bp) && pages(bp.buf) === 2, 'the sheet has a front page and a back page');
  await expect('results cannot be reported before the batch starts', call('POST', `/studio/batches/${b._id}/results`, A, { allOk: true }), [409]);
  await expect('start printing', call('POST', `/studio/batches/${b._id}/start`, A)); await expect('starting twice is refused', call('POST', `/studio/batches/${b._id}/start`, A), [409]);
  const items = (await call('GET', `/studio/batches/${b._id}`, A)).data.batch.items;
  await expect('a failure must say what went wrong', call('POST', `/studio/batches/${b._id}/results`, A, { results: [{ itemId: items[0]._id, ok: false, errorCode: 'bogus' }] }), [400]);
  const r1 = (await expect('report one jam and the rest printed', call('POST', `/studio/batches/${b._id}/results`, A, { results: [{ itemId: items[0]._id, ok: false, errorCode: 'paper-jam', error: 'Jammed at tray 2' }, ...items.slice(1).map((i) => ({ itemId: i._id, ok: true }))] }))).data.batch;
  log(r1.status === 'NeedsAttention' && r1.counts.failed === 1 && r1.counts.printed === 5, 'one failure puts the batch in needs-attention without losing the rest');
  log((await Issuance.findById(items[1].issuanceId)).printCount === 1 && (await Issuance.findById(items[0].issuanceId)).printCount === 0, 'only printed documents have their print count raised');
  await expect('an item cannot be reported twice', call('POST', `/studio/batches/${b._id}/results`, A, { results: [{ itemId: items[1]._id, ok: true }] }), [409]);
  const bp2 = await raw(`/studio/batches/${b._id}/pdf`, A); log(isPdf(bp2) && pages(bp2.buf) === 2, 'the recovery PDF holds only the failed card');
  log(r1.items[0].errorCode === 'paper-jam' && r1.log.some((l) => /1 failed/.test(l.text)), 'the failure and its reason are kept in the batch log');
  await expect('retry the failed card', call('POST', `/studio/batches/${b._id}/retry`, A, {})); await expect('retrying a printing batch is refused', call('POST', `/studio/batches/${b._id}/retry`, A, {}), [409]);
  const done = (await expect('the retry prints', call('POST', `/studio/batches/${b._id}/results`, A, { allOk: true }))).data.batch; log(done.status === 'Done' && done.round === 2 && done.counts.printed === 6, 'after the retry the batch is done on its second round');
  await expect('a finished batch cannot be cancelled', call('POST', `/studio/batches/${b._id}/cancel`, A, { reason: 'Whatever' }), [409]);
  // a card withdrawn before printing is dropped, not printed
  const b2 = (await call('POST', '/studio/batches', A, { name: 'Withdrawn mid-queue', issuanceIds: idIds.slice(0, 3) })).data.batch;
  await call('POST', `/studio/issuances/${idIds[1]}/revoke`, A, { reason: 'Student left the school' });
  const bp3 = await raw(`/studio/batches/${b2._id}/pdf`, A); log(isPdf(bp3), 'a batch still renders after one card was withdrawn');
  const b2n = (await call('GET', `/studio/batches/${b2._id}`, A)).data.batch; log(b2n.counts.cancelled === 1 && b2n.items.find((i) => i.issuanceId === idIds[1]).status === 'Cancelled', 'a card revoked before printing is cancelled in the batch');
  await expect('an item can be dropped with a reason', call('POST', `/studio/batches/${b2._id}/items/${b2n.items.find((i) => i.status === 'Queued')._id}/cancel`, A, { reason: 'Photo is wrong' }));
  await expect('the draft batch can be cancelled with a reason', call('POST', `/studio/batches/${b2._id}/cancel`, A, { reason: 'Redo after photo day' }));
  const v1r = (await pub(rep.token || (await Issuance.findById(idIds[1])).token)).data; log(v1r.status === 'Withdrawn' && v1r.valid === false, 'a revoked card shows as withdrawn on the check page, without saying why');

  // ── export, import and licensing ──
  const ex = await raw(`/studio/templates/${tplId}/versions/${v2._id}/export`, A); const pkg = JSON.parse(ex.buf.toString());
  log(ex.status === 200 && pkg.format === 'aulensia-template@1' && pkg.assets.length === 1 && pkg.provenance.license, 'a template exports with its pictures and its licence');
  const imp = (obj) => { const f = new FormData(); f.append('file', new Blob([JSON.stringify(obj)], { type: 'application/json' }), 'pkg.json'); return raw('/studio/templates/import', A, 'POST', f); };
  const noLic = clone(pkg); noLic.provenance = { source: 'somewhere' }; log((await imp(noLic)).status === 422, 'a package that does not state its licence is refused');
  log((await imp({ format: 'other' })).status === 400, 'an unknown package format is refused');
  const imported = await imp(pkg); const impd = JSON.parse(imported.buf.toString()); log(imported.status === 201 && impd.version.state === 'Draft' && impd.template.provenance.source === 'imported' && impd.assetsToClear === 1, 'an import becomes a draft with its provenance and pictures to clear');
  log(impd.version.report.errors.some((e) => /not cleared|no usage right/.test(e.message)), 'imported pictures must be cleared before the design can go live');
  const evil = clone(pkg); evil.layout.sides[0].layers[0].text = '<script>alert(1)</script>'; evil.layout.sides[0].layers[0].type = 'text'; evil.layout.sides[0].layers[0].onload = 'x'; const ev = JSON.parse((await imp(evil)).buf.toString());
  const evl = (await Version.findById(ev.version._id)).layout.sides[0].layers[0]; log(!('onload' in evl), 'unknown properties in an imported design are dropped');
  await expect('archive and restore a template', call('POST', `/studio/templates/${impd.template._id}/archive`, A, { archived: true }));
  log(!(await call('GET', '/studio/templates', A)).data.templates.some((t) => t._id === impd.template._id), 'an archived template leaves the gallery');
  await expect('an archived template cannot issue', issue(impd.template._id, { subjectIds: [String(ayesha._id)] }), [422]);
  await expect('a template with no approved version cannot issue', issue(ev.template._id, { subjectIds: [String(ayesha._id)] }), [422]);

  // ── sole administrator may approve their own work, and it is recorded ──
  await User.updateOne({ _id: adm2._id }, { $set: { isActive: false } });
  const solo = (await call('POST', `/studio/templates/${await bid('letterhead')}/duplicate`, A, { name: 'Solo letterhead' })).data; await call('POST', `/studio/templates/${solo.template._id}/versions/${solo.version._id}/submit`, A);
  await expect('a sole administrator can approve their own template', call('POST', `/studio/templates/${solo.template._id}/versions/${solo.version._id}/approve`, A));
  const al = await AuditLog.findOne({ schoolId: sid, action: 'studio.version.publish', 'detail.soleAdmin': true }); log(!!al, 'the sole-administrator exception is recorded in the audit trail');
  await User.updateOne({ _id: adm2._id }, { $set: { isActive: true } });

  // ── audit and isolation ──
  for (const act of ['studio.template.create', 'studio.version.publish', 'studio.issue', 'studio.replace', 'studio.revoke', 'studio.batch.create', 'studio.batch.results', 'studio.asset.add', 'studio.asset.verify', 'studio.template.import']) log(!!(await AuditLog.findOne({ schoolId: sid, action: act })), `audit trail has ${act}`);
  const other = await School.create({ name: 'Studio Other School', code: 'STUDIO2', adminId: adm2._id, email: 'o@studio2.test', phone: '0', address: 'x', isActive: true }); const otherAdmin = await User.create({ schoolId: other._id, name: 'Other Admin', email: 'oa@studio2.test', password: await hashPassword('Admin@1234'), role: 'admin' }); const OA = generateAccessToken(String(otherAdmin._id), String(other._id), 'admin');
  const olist = (await call('GET', '/studio/templates', OA)).data.templates; log(olist.length === 17 && olist.every((t) => t.isBase), 'another school starts with its own 17 originals and none of ours');
  await expect('another school cannot read our document', call('GET', `/studio/issuances/${c1.issued[0]._id}`, OA), [404]); log((await raw(`/studio/issuances/${c1.issued[0]._id}/pdf`, OA)).status === 404, 'another school cannot download our document');
  await expect('another school cannot issue from our template', call('POST', '/studio/issue', OA, { templateId: certId, subjectIds: [String(ayesha._id)], custom: { citation: 'x' } }), [404]);
  await expect('another school cannot see our print batch', call('GET', `/studio/batches/${b._id}`, OA), [404]);
  log((await call('GET', '/studio/issuances', OA)).data.total === 0, 'another school\'s list is empty');
  log((await pub(c1.issued[0]._id ? (await Issuance.findById(c1.issued[0]._id)).token : '')).data.school === school.name, 'the public check page works across schools by token and names the issuing school');

  // clean up what this suite added so the rest of the suite is untouched
  await Student.deleteMany({ schoolId: sid, email: /^studiokid/ }); await Marks.deleteMany({ schoolId: sid, examId: { $in: [exA._id, exB._id] } }); await Exam.deleteMany({ schoolId: sid, name: 'E12 Annual' }); await Subject.deleteMany({ schoolId: sid, code: { $in: ['E12E', 'E12M'] } }); await Class.deleteMany({ schoolId: sid, standard: '77' });
  await Student.updateOne({ _id: ayesha._id }, { $set: { classId: ayesha.classId, standard: ayesha.standard, division: ayesha.division, avatar: ayesha.avatar || '' } });
  await FeeInvoice.deleteMany({ schoolId: sid, number: 'E12-INV-1' }); await FeePayment.deleteMany({ schoolId: sid, receiptNo: 'E12-RC-1' }); await FeePayment.deleteMany({ schoolId: sid, amount: 100, status: 'Pending' }); await VisitorVisit.deleteMany({ schoolId: sid, visitorName: { $in: ['Bilal Ahmed', 'Nope'] } });
  await User.deleteMany({ schoolId: other._id }); await School.deleteOne({ _id: other._id }); for (const M of [DocTemplate, Version, Asset, Issuance, Batch, Counter]) await M.deleteMany({ schoolId: other._id });
};
