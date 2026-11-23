// Fee management printing from the school's own designs: a challan, an invoice and a receipt that
// carry the school's layout, a serial and a page a parent can check them on.

module.exports = async ({ call, expect, log, tokens, base }) => {
  const A = tokens.admin;

  // Approving a design needs a second administrator, which is the studio's own rule. The demo
  // school has one administrator, so a colleague is made here to play the second pair of eyes.
  const User = require('../models/User');
  const School = require('../models/School');
  const { hashPassword } = require('../utils/password');
  const { generateAccessToken } = require('../utils/jwt');
  const me = (await call('GET', '/schools/my', A)).data.school;
  let mate = await User.findOne({ schoolId: me._id, role: 'admin', email: 'feedoc.mate@demo.school' });
  if (!mate) mate = await User.create({ schoolId: me._id, name: 'Fee Doc Colleague', email: 'feedoc.mate@demo.school', password: await hashPassword('Second@123'), role: 'admin', isActive: true });
  const A2 = generateAccessToken(mate._id, String(me._id), 'admin');

  /* ── what fee management can print from ── */
  const t0 = (await expect('the fee designs can be listed', call('GET', '/finance/document-templates', A))).data;
  const keys = (t0.families || []).map((f) => f.key);
  log(keys.includes('challan') && keys.includes('invoice') && keys.includes('receipt'), 'a challan, an invoice and a receipt can each have their own design');
  log(t0.families.every((f) => f.chosen === ''), 'nothing is chosen to begin with, so the plain page is used');

  /* ── a school that has not chosen one is told so, plainly ── */
  const inv = (await call('GET', '/finance/invoices?limit=1', A)).data.invoices || [];
  if (!inv.length) { log(false, 'there is an invoice to print (the finance checks run first)'); return; }
  const one = inv[0];
  const noTpl = await call('POST', `/finance/invoices/${one._id}/document`, A, {});
  log(noTpl.status === 422 && noTpl.data.code === 'NO_TEMPLATE', `without a design it says what to do: "${noTpl.data.message}"`);

  /* ── draw one, approve it, choose it ── */
  const made = (await expect('a challan design is made in the studio', call('POST', '/studio/templates', A, { name: 'Smoke fee challan', family: 'challan' }), [201])).data;
  const tplId = made.template._id;
  const got = (await expect('its draft opens', call('GET', `/studio/templates/${tplId}`, A))).data;
  const draft = (got.versions || []).find((v) => v.state === 'Draft') || got.versions[0];

  const half = await call('PUT', '/finance/settings', A, { templates: { challan: tplId } });
  log(half.status === 422 && /approved/i.test(half.data.message || ''), 'a design with no approved version cannot be chosen yet');

  await expect('the design is put forward', call('POST', `/studio/templates/${tplId}/versions/${draft._id}/submit`, A, {}));
  const sameEyes = await call('POST', `/studio/templates/${tplId}/versions/${draft._id}/approve`, A, { note: 'Looks right' });
  log(sameEyes.status === 403, 'the person who drew it cannot approve it alone');
  await expect('a colleague approves it', call('POST', `/studio/templates/${tplId}/versions/${draft._id}/approve`, A2, { note: 'Looks right' }));

  const wrong = await call('PUT', '/finance/settings', A, { templates: { receipt: tplId } });
  log(wrong.status === 422 && /not a receipt/i.test(wrong.data.message || ''), 'a challan design cannot be used as a receipt');

  const saved = (await expect('the challan design is chosen', call('PUT', '/finance/settings', A, { templates: { challan: tplId } }))).data;
  log(saved.settings.templates.challan === String(tplId), 'and it is remembered');
  const keep = (await expect('choosing a design leaves the late-fee settings alone', call('PUT', '/finance/settings', A, { graceDays: 3 }))).data;
  log(keep.settings.templates.challan === String(tplId) && keep.settings.graceDays === 3, 'both settings live together');

  /* ── printing ── */
  const doc = (await expect('a challan is printed from it', call('POST', `/finance/invoices/${one._id}/document`, A, {}), [201])).data;
  log(!!doc.document.serial && doc.document.family === 'challan', `it gets a serial of its own (${doc.document.serial})`);
  log(doc.pdfPath === `/api/studio/issuances/${doc.document._id}/pdf`, 'and a page to print');

  const again = (await expect('printing it again', call('POST', `/finance/invoices/${one._id}/document`, A, {}))).data;
  log(again.reused && again.document.serial === doc.document.serial, 'hands back the same document, not a new serial');

  const fresh = (await expect('a fresh one can be asked for on purpose', call('POST', `/finance/invoices/${one._id}/document`, A, { fresh: true }), [201])).data;
  log(fresh.document.serial !== doc.document.serial, 'and that one is a new document');

  /* ── it is a real document, not a dead end ── */
  const listed = (await expect('it shows up among the school\'s documents', call('GET', '/studio/issuances?family=challan', A))).data;
  log((listed.issuances || []).some((i) => i.serial === doc.document.serial), 'the documents studio lists it too');

  /* ── a void invoice has nothing to print ── */
  const open = ((await call('GET', '/finance/invoices?status=Open&limit=5', A)).data.invoices || []).filter((i) => i.paid === 0 && i._id !== one._id);
  if (open.length) {
    await expect('an invoice is voided', call('POST', `/finance/invoices/${open[0]._id}/void`, A, { reason: 'Issued in error' }));
    const v = await call('POST', `/finance/invoices/${open[0]._id}/document`, A, {});
    log(v.status === 422, 'a void invoice has nothing to print');
  }

  /* ── a receipt ── */
  const pays = ((await call('GET', '/finance/payments?status=Confirmed&limit=1', A)).data.payments || []);
  if (pays.length) {
    const noRcp = await call('POST', `/finance/payments/${pays[0]._id}/document`, A, {});
    log(noRcp.status === 422 && noRcp.data.code === 'NO_TEMPLATE', 'a receipt with no design says so too');
    const rmade = (await expect('a receipt design is made', call('POST', '/studio/templates', A, { name: 'Smoke fee receipt', family: 'receipt' }), [201])).data;
    const rGot = (await call('GET', `/studio/templates/${rmade.template._id}`, A)).data;
    const rDraft = (rGot.versions || [])[0];
    await call('POST', `/studio/templates/${rmade.template._id}/versions/${rDraft._id}/submit`, A, {});
    await call('POST', `/studio/templates/${rmade.template._id}/versions/${rDraft._id}/approve`, A2, { note: 'Fine' });
    await expect('and chosen', call('PUT', '/finance/settings', A, { templates: { challan: tplId, receipt: rmade.template._id } }));
    const rdoc = (await expect('a receipt is printed from it', call('POST', `/finance/payments/${pays[0]._id}/document`, A, {}), [201])).data;
    log(rdoc.document.family === 'receipt' && !!rdoc.document.serial, `the receipt carries its own serial (${rdoc.document.serial})`);
  }

  /* ── only the school's own designs ── */
  const strayer = await call('PUT', '/finance/settings', A, { templates: { challan: '000000000000000000000000' } });
  log(strayer.status === 404, 'a design that is not this school\'s cannot be chosen');
  const notAnId = await call('PUT', '/finance/settings', A, { templates: { challan: 'not-an-id' } });
  log(notAnId.status === 400, 'and nonsense is turned away');
};
