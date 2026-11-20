// Leads, quotes, invoices and proof for the website (PRD E28). The platform owner runs the pipeline; buyers use a private link.
const S = require('../utils/sales/service');
const Lead = require('../models/Lead'); const Quote = require('../models/Quote'); const SaaSInvoice = require('../models/SaaSInvoice'); const Testimonial = require('../models/Testimonial');
const School = require('../models/School'); const User = require('../models/User'); const Agent = require('../models/Agent'); const SuperAdmin = require('../models/SuperAdmin'); const SubscriptionPayment = require('../models/SubscriptionPayment');
const billing = require('../utils/billing'); const { getPlansMap } = require('../utils/plans');
const { hashPassword, strongTempPassword } = require('../utils/password'); const { audit } = require('../utils/audit');
const { oid, validId, sha, newToken, TOKEN_RE, wrap, bad, clean, cleanBlock, EMAIL, PHONE, addDays, money } = S;

const owner = async (req) => { if (!req.actorName) { const a = await SuperAdmin.findById(req.user.userId).select('name'); req.actorName = (a && a.name) || 'Owner'; } return req.actorName; };
const note = (by, action, text = '') => ({ at: new Date(), by, action, note: String(text).slice(0, 300) });
const page = (q, def = 25) => { const limit = Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 100); const p = Math.max(parseInt(q.page, 10) || 1, 1); return { limit, skip: (p - 1) * limit, p }; };
const rx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CONSENT = 'I agree that Aulensia may contact me about this request and keep these details to follow it up.';

/* ───────────── public: ask for a demo or a quote ───────────── */
exports.publicLead = wrap('publicLead', async (req, res) => {
  const b = req.body || {};
  if (b.website || b.company_url) return res.json({ ok: true }); // hidden field filled in by a robot: look as if it worked
  const name = clean(b.name, 120); const email = clean(b.email, 160).toLowerCase(); const phone = clean(b.phone, 30); const schoolName = clean(b.schoolName, 160);
  if (name.length < 2) return bad(res, 422, 'Please tell us your name.'); if (!EMAIL.test(email)) return bad(res, 422, 'Please give an email address we can reach you on.');
  if (phone && !PHONE.test(phone)) return bad(res, 422, 'That phone number does not look right.'); if (schoolName.length < 2) return bad(res, 422, 'Please tell us the name of your school.');
  if (b.consent !== true) return bad(res, 422, 'Please tick the box so we may contact you.');
  const interest = ['demo', 'quote', 'question'].includes(b.interest) ? b.interest : 'demo'; const students = Math.max(0, Math.min(100000, parseInt(b.students, 10) || 0));
  const refCode = clean(b.refCode, 20).toUpperCase(); let agentId = null; if (refCode.length >= 4) { const a = await Agent.findOne({ referralCode: refCode, isActive: true }).select('_id email'); if (a && a.email !== email) agentId = a._id; }
  const ipHash = S.hashIp(req);
  if ((await Lead.countDocuments({ ipHash, createdAt: { $gte: new Date(Date.now() - 3600000) } })) >= 5) return bad(res, 429, 'Too many requests from this address. Please try again later.');
  // the same person asking again is one lead, not two
  const phoneKey = phone.replace(/\D/g, '').slice(-10); const or = [{ email }]; if (phoneKey.length >= 9) or.push({ phoneKey });
  const open = (await Lead.find({ $or: or, status: { $nin: ['Lost', 'Spam'] }, createdAt: { $gte: addDays(new Date(), -90) } }).sort({ createdAt: -1 }).limit(1))[0];
  if (open) {
    await Lead.updateOne({ _id: open._id }, { $inc: { requests: 1 }, $set: { message: cleanBlock(b.message, 1000) || open.message, interest: interest === 'demo' ? open.interest : interest, ...(open.status === 'Contacted' ? {} : {}) }, $push: { history: note('Website', 'asked-again', `Asked again (${interest})`) } });
    return res.status(200).json({ ok: true, message: 'Thank you. We have your request and will be in touch.' });
  }
  const lead = await Lead.create({ name, email, phone, phoneKey: phoneKey.length >= 9 ? phoneKey : '', schoolName, city: clean(b.city, 80), role: clean(b.role, 60), students, interest, message: cleanBlock(b.message, 1000), preferredTime: clean(b.preferredTime, 80),
    source: clean(b.source, 60) || clean(b.utmSource, 60).toLowerCase() || 'website', utmSource: clean(b.utmSource, 60), utmMedium: clean(b.utmMedium, 60), utmCampaign: clean(b.utmCampaign, 80), refCode: agentId ? refCode : '', agentId, consentText: CONSENT, ipHash, history: [note('Website', 'created', `Asked for ${interest}`)] });
  res.status(201).json({ ok: true, message: interest === 'quote' ? 'Thank you. We will send you a quote soon.' : 'Thank you. We will contact you to arrange the demo.', reference: String(lead._id).slice(-6).toUpperCase() });
});

/* ───────────── owner: pipeline ───────────── */
const leadView = (l) => ({ _id: l._id, name: l.name, email: l.email, phone: l.phone, schoolName: l.schoolName, city: l.city, role: l.role, students: l.students, interest: l.interest, message: l.message, preferredTime: l.preferredTime, source: l.source, utm: { source: l.utmSource, medium: l.utmMedium, campaign: l.utmCampaign }, refCode: l.refCode, agentId: l.agentId, status: l.status, lostReason: l.lostReason, ownerNote: l.ownerNote, demoAt: l.demoAt, demoNotes: l.demoNotes, firstContactedAt: l.firstContactedAt, lastContactedAt: l.lastContactedAt, convertedSchoolId: l.convertedSchoolId, requests: l.requests, createdAt: l.createdAt, history: l.history });
exports.listLeads = wrap('listLeads', async (req, res) => {
  const { limit, skip, p } = page(req.query); const f = {};
  if (['New', 'Contacted', 'DemoBooked', 'Quoted', 'Won', 'Lost', 'Spam'].includes(req.query.status)) f.status = req.query.status; else if (req.query.status === 'open') f.status = { $in: ['New', 'Contacted', 'DemoBooked', 'Quoted'] };
  if (req.query.q) { const r = new RegExp(rx(String(req.query.q).slice(0, 60)), 'i'); f.$or = [{ name: r }, { email: r }, { schoolName: r }, { phone: r }]; }
  if (validId(req.query.agentId)) f.agentId = oid(req.query.agentId);
  const [rows, total] = await Promise.all([Lead.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), Lead.countDocuments(f)]);
  const agents = rows.some((r) => r.agentId) ? await Agent.find({ _id: { $in: [...new Set(rows.filter((r) => r.agentId).map((r) => String(r.agentId)))].map(oid) } }).select('name') : []; const an = Object.fromEntries(agents.map((a) => [String(a._id), a.name]));
  res.json({ leads: rows.map((l) => ({ ...leadView(l), history: undefined, agentName: an[String(l.agentId)] || '' })), pagination: { total, pages: Math.ceil(total / limit), currentPage: p } });
});
exports.getLead = wrap('getLead', async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 404, 'Lead not found'); const l = await Lead.findById(req.params.id); if (!l) return bad(res, 404, 'Lead not found');
  const [quotes, invoices, agent] = await Promise.all([Quote.find({ leadId: l._id }).sort({ createdAt: -1 }), SaaSInvoice.find({ leadId: l._id }).sort({ createdAt: -1 }), l.agentId ? Agent.findById(l.agentId).select('name referralCode') : null]);
  res.json({ lead: { ...leadView(l), agentName: agent ? agent.name : '' }, quotes: quotes.map(quoteView), invoices: invoices.map(invoiceView) });
});
exports.updateLead = wrap('updateLead', async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 404, 'Lead not found'); const l = await Lead.findById(req.params.id); if (!l) return bad(res, 404, 'Lead not found'); const by = await owner(req); const b = req.body || {}; const set = {}; const push = [];
  if (b.status !== undefined && b.status !== l.status) {
    if (!['New', 'Contacted', 'DemoBooked', 'Quoted', 'Lost', 'Spam'].includes(b.status)) return bad(res, 422, b.status === 'Won' ? 'A lead becomes Won when its invoice is paid.' : 'Unknown status.');
    if (l.status === 'Won') return bad(res, 409, 'This lead already became a customer.');
    if (b.status === 'Lost') { const r = clean(b.lostReason, 200); if (r.length < 3) return bad(res, 422, 'Say why it was lost (at least 3 characters).'); set.lostReason = r; }
    if (b.status === 'DemoBooked') { const d = b.demoAt ? new Date(b.demoAt) : l.demoAt; if (!d || Number.isNaN(d.getTime())) return bad(res, 422, 'Choose the demo date and time.'); set.demoAt = d; }
    if (b.status !== 'New' && !l.firstContactedAt && b.status !== 'Spam') set.firstContactedAt = new Date(); if (b.status === 'Contacted' || b.status === 'DemoBooked') set.lastContactedAt = new Date();
    set.status = b.status; push.push(note(by, 'status', `${l.status} to ${b.status}${set.lostReason ? `: ${set.lostReason}` : ''}`));
  }
  if (b.ownerNote !== undefined) set.ownerNote = cleanBlock(b.ownerNote, 2000); if (b.demoNotes !== undefined) set.demoNotes = cleanBlock(b.demoNotes, 1000);
  if (b.demoAt !== undefined && b.status === undefined) { const d = new Date(b.demoAt); if (Number.isNaN(d.getTime())) return bad(res, 422, 'That date does not look right.'); set.demoAt = d; push.push(note(by, 'demo', d.toISOString())); }
  if (b.logContact) { set.lastContactedAt = new Date(); if (!l.firstContactedAt) set.firstContactedAt = new Date(); if (l.status === 'New') { set.status = 'Contacted'; } push.push(note(by, 'contact', clean(b.logContact === true ? '' : b.logContact, 300))); }
  if (!Object.keys(set).length && !push.length) return res.json({ lead: leadView(l) });
  await Lead.updateOne({ _id: l._id }, { $set: set, ...(push.length ? { $push: { history: { $each: push } } } : {}) });
  await audit(req, { action: 'lead.update', entityType: 'Lead', entityId: l._id, detail: { status: set.status } }); res.json({ lead: leadView(await Lead.findById(l._id)) });
});
exports.pipeline = wrap('pipeline', async (req, res) => {
  const now = Date.now(); const all = await Lead.find({}).select('status createdAt firstContactedAt updatedAt source agentId'); const by = {}; for (const l of all) by[l.status] = (by[l.status] || 0) + 1;
  const open = ['New', 'Contacted', 'DemoBooked', 'Quoted']; const uncontacted = all.filter((l) => l.status === 'New' && now - new Date(l.createdAt).getTime() > 24 * 3600000).length;
  const recent = all.filter((l) => now - new Date(l.createdAt).getTime() <= 90 * 86400000); const won = recent.filter((l) => l.status === 'Won').length; const lost = recent.filter((l) => l.status === 'Lost').length;
  const sources = {}; for (const l of recent) sources[l.source] = (sources[l.source] || 0) + 1;
  const [quotes, invoices, tickets] = await Promise.all([Quote.find({ status: 'Sent' }).select('totalPKR validUntil'), SaaSInvoice.find({ status: 'Issued' }).select('totalPKR dueAt'), require('../models/SupportCase').countDocuments({ status: 'Open' })]);
  res.json({ counts: Object.fromEntries(['New', 'Contacted', 'DemoBooked', 'Quoted', 'Won', 'Lost', 'Spam'].map((k) => [k, by[k] || 0])), openLeads: open.reduce((n, k) => n + (by[k] || 0), 0), uncontactedOver24h: uncontacted, newLast7d: all.filter((l) => now - new Date(l.createdAt).getTime() <= 7 * 86400000).length,
    conversion90d: won + lost ? Math.round((won / (won + lost)) * 100) : null, won90d: won, lost90d: lost, sources: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([source, count]) => ({ source, count })),
    openQuotes: quotes.length, openQuoteValuePKR: quotes.reduce((n, q) => n + q.totalPKR, 0), unpaidInvoices: invoices.length, unpaidValuePKR: invoices.reduce((n, i) => n + i.totalPKR, 0), overdueInvoices: invoices.filter((i) => new Date(i.dueAt).getTime() < now).length, supportOpen: tickets });
});

// A lead becomes a school (so the invoice has someone to apply the plan to). The temporary password is shown once.
const codeFrom = async (name) => { const base = String(name).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) || 'SCH'; for (let i = 0; i < 30; i++) { const c = `${base}${String(Math.floor(Math.random() * 900) + 100)}`; if (!(await School.findOne({ code: c }))) return c; } return `${base}${Date.now().toString().slice(-5)}`; };
exports.convertLead = wrap('convertLead', async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 404, 'Lead not found'); const l = await Lead.findById(req.params.id); if (!l) return bad(res, 404, 'Lead not found');
  if (l.convertedSchoolId) return bad(res, 409, 'A school was already created for this lead.'); if (['Lost', 'Spam'].includes(l.status)) return bad(res, 409, 'Reopen the lead before creating a school.');
  const b = req.body || {}; const code = b.code ? String(b.code).trim().toUpperCase() : await codeFrom(l.schoolName); if (!/^[A-Z0-9]{3,12}$/.test(code)) return bad(res, 422, 'The school code is 3 to 12 letters or numbers.');
  if (await School.findOne({ code })) return bad(res, 409, 'That school code is taken.'); const email = String(b.email || l.email).toLowerCase(); if (await School.findOne({ email })) return bad(res, 409, 'A school with this email already exists.');
  const plans = await getPlansMap(); const free = plans.free || Object.values(plans).sort((a, c) => a.pricePKR - c.pricePKR)[0]; const adminId = oid(new (require('../lib/pgdoc').Types.ObjectId)()); const schoolId = oid(new (require('../lib/pgdoc').Types.ObjectId)());
  let agentFields = {}; if (l.agentId) { const a = await Agent.findById(l.agentId); if (a && a.isActive && a.email !== email) agentFields = { agentId: a._id, agentCommissionPercent: a.commissionPercent, referredAt: new Date(), referralSource: 'link' }; }
  const temp = strongTempPassword(); const phone = l.phone || '+92-300-0000000';
  await School.create({ _id: schoolId, name: l.schoolName, code, adminId, email, phone, principalName: l.name, principalEmail: l.email, isActive: true, plan: free.slug, studentLimit: free.studentLimit, teacherLimit: free.teacherLimit, createdVia: 'superadmin', ...agentFields });
  await User.create({ _id: adminId, name: l.name, email: l.email, password: await hashPassword(temp), phone, role: 'admin', schoolId });
  const by = await owner(req); await Lead.updateOne({ _id: l._id }, { $set: { convertedSchoolId: schoolId }, $push: { history: note(by, 'school-created', `School ${code} created`) } });
  await Quote.updateMany({ leadId: l._id, schoolId: null }, { $set: { schoolId } }); await SaaSInvoice.updateMany({ leadId: l._id, schoolId: null }, { $set: { schoolId } });
  await audit(req, { action: 'lead.convert', entityType: 'Lead', entityId: l._id, schoolId, detail: { code } });
  res.status(201).json({ message: 'School created', school: { _id: schoolId, name: l.schoolName, code }, admin: { email: l.email, name: l.name }, temporaryPassword: temp });
});

/* ───────────── quotes ───────────── */
const planOf = async (slug) => { const p = (await getPlansMap())[String(slug || '').toLowerCase()]; return p || null; };
const quoteView = (q) => ({ _id: q._id, number: q.number, leadId: q.leadId, schoolId: q.schoolId, buyerName: q.buyerName, buyerEmail: q.buyerEmail, schoolName: q.schoolName, planSlug: q.planSlug, planLabel: q.planLabel, billingPeriod: q.billingPeriod, lines: q.lines, subtotalPKR: q.subtotalPKR, discountPercent: q.discountPercent, discountReason: q.discountReason, discountPKR: q.discountPKR, totalPKR: q.totalPKR, validUntil: q.validUntil, terms: q.terms, note: q.note, status: q.status, sentAt: q.sentAt, acceptedAt: q.acceptedAt, acceptedByName: q.acceptedByName, acceptedByEmail: q.acceptedByEmail, declinedAt: q.declinedAt, declineReason: q.declineReason, invoiceId: q.invoiceId, createdByName: q.createdByName, createdAt: q.createdAt, history: q.history });
async function priced(b, plan) {
  const listPrice = b.billingPeriod === 'yearly' ? plan.yearlyPricePKR : plan.pricePKR;
  if (!listPrice || listPrice < 1) throw S.httpError(422, b.billingPeriod === 'yearly' && plan.pricePKR ? `${plan.label} has no yearly price. Choose monthly or set a yearly price on the plan.` : `${plan.label} is free, so there is nothing to quote.`);
  const lines = [{ label: `${plan.label} plan, ${b.billingPeriod}`, amountPKR: listPrice }];
  for (const x of Array.isArray(b.extraLines) ? b.extraLines.slice(0, 6) : []) { const amt = Math.round(Number(x.amountPKR)); const label = clean(x.label, 160); if (!label || !Number.isFinite(amt) || amt < 1 || amt > 10000000) throw S.httpError(422, 'Each extra line needs a label and an amount from 1 upwards.'); lines.push({ label, amountPKR: amt }); }
  const subtotal = lines.reduce((n, x) => n + x.amountPKR, 0); const pct = b.discountPercent === undefined || b.discountPercent === '' ? 0 : Number(b.discountPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw S.httpError(422, 'A discount is from 0 to 50 percent.'); const reason = clean(b.discountReason, 200); if (pct > 0 && reason.length < 5) throw S.httpError(422, 'Say why the discount is given (at least 5 characters).');
  const discount = Math.round((subtotal * pct) / 100); return { lines, subtotalPKR: subtotal, discountPercent: pct, discountReason: pct > 0 ? reason : '', discountPKR: discount, totalPKR: subtotal - discount };
}
exports.createQuote = wrap('createQuote', async (req, res) => {
  const b = req.body || {}; const plan = await planOf(b.planSlug); if (!plan) return bad(res, 422, 'Choose a plan.'); if (!['monthly', 'yearly'].includes(b.billingPeriod)) return bad(res, 422, 'Choose monthly or yearly.');
  let lead = null; let school = null; if (b.leadId) { lead = validId(b.leadId) ? await Lead.findById(b.leadId) : null; if (!lead) return bad(res, 404, 'Lead not found'); } if (b.schoolId) { school = validId(b.schoolId) ? await School.findById(b.schoolId) : null; if (!school) return bad(res, 404, 'School not found'); }
  if (!lead && !school) return bad(res, 422, 'A quote is for a lead or for an existing school.');
  if (lead && ['Lost', 'Spam'].includes(lead.status)) return bad(res, 409, 'Reopen the lead before quoting it.');
  const p = await priced(b, plan); const set = await S.settings(); const days = Math.min(90, Math.max(1, parseInt(b.validDays, 10) || set.quoteValidDays)); const by = await owner(req);
  const q = await Quote.create({ number: await S.nextNumber('Q'), leadId: lead ? lead._id : null, schoolId: school ? school._id : (lead && lead.convertedSchoolId) || null, buyerName: lead ? lead.name : (school.principalName || ''), buyerEmail: lead ? lead.email : (school.principalEmail || school.email), schoolName: lead ? lead.schoolName : school.name,
    planSlug: plan.slug, planLabel: plan.label, billingPeriod: b.billingPeriod, ...p, validUntil: addDays(new Date(), days), terms: cleanBlock(b.terms, 4000) || set.terms, note: cleanBlock(b.note, 1000), createdByName: by, history: [note(by, 'created', `${money(p.totalPKR)}`)] });
  await audit(req, { action: 'quote.create', entityType: 'Quote', entityId: q._id, schoolId: q.schoolId, detail: { number: q.number, total: q.totalPKR } }); res.status(201).json({ quote: quoteView(q) });
});
exports.listQuotes = wrap('listQuotes', async (req, res) => { const { limit, skip, p } = page(req.query); const f = {}; if (['Draft', 'Sent', 'Accepted', 'Declined', 'Expired', 'Withdrawn'].includes(req.query.status)) f.status = req.query.status; if (validId(req.query.leadId)) f.leadId = oid(req.query.leadId); const [rows, total] = await Promise.all([Quote.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), Quote.countDocuments(f)]); res.json({ quotes: rows.map(quoteView), pagination: { total, pages: Math.ceil(total / limit), currentPage: p } }); });
async function myQuote(req, res) { if (!validId(req.params.id)) { bad(res, 404, 'Quote not found'); return null; } const q = await Quote.findById(req.params.id); if (!q) { bad(res, 404, 'Quote not found'); return null; } return q; }
exports.getQuote = wrap('getQuote', async (req, res) => { const q = await myQuote(req, res); if (!q) return; const inv = q.invoiceId ? await SaaSInvoice.findById(q.invoiceId) : null; res.json({ quote: quoteView(q), invoice: inv ? invoiceView(inv) : null }); });
exports.updateQuote = wrap('updateQuote', async (req, res) => {
  const q = await myQuote(req, res); if (!q) return; if (q.status !== 'Draft') return bad(res, 409, 'Only a draft can be changed. Withdraw it and make a new one.'); const b = { planSlug: q.planSlug, billingPeriod: q.billingPeriod, discountPercent: q.discountPercent, discountReason: q.discountReason, ...(req.body || {}) }; const plan = await planOf(b.planSlug); if (!plan) return bad(res, 422, 'Choose a plan.');
  if (!['monthly', 'yearly'].includes(b.billingPeriod)) return bad(res, 422, 'Choose monthly or yearly.'); const p = await priced({ ...b, extraLines: req.body && req.body.extraLines !== undefined ? req.body.extraLines : q.lines.slice(1) }, plan); const set = { planSlug: plan.slug, planLabel: plan.label, billingPeriod: b.billingPeriod, ...p };
  if (req.body.validDays) set.validUntil = addDays(new Date(), Math.min(90, Math.max(1, parseInt(req.body.validDays, 10) || 14))); if (req.body.terms !== undefined) set.terms = cleanBlock(req.body.terms, 4000) || q.terms; if (req.body.note !== undefined) set.note = cleanBlock(req.body.note, 1000);
  const by = await owner(req); await Quote.updateOne({ _id: q._id, status: 'Draft' }, { $set: set, $push: { history: note(by, 'edited') } }); res.json({ quote: quoteView(await Quote.findById(q._id)) });
});
const linkFor = (req, token) => `${req.protocol}://${req.get('host')}/proposal/${token}`;
exports.sendQuote = wrap('sendQuote', async (req, res) => {
  const q = await myQuote(req, res); if (!q) return; if (!['Draft', 'Sent'].includes(q.status)) return bad(res, 409, `A ${q.status.toLowerCase()} quote cannot be sent.`); if (new Date(q.validUntil) < new Date()) return bad(res, 409, 'This quote has already expired. Make a new one.');
  const token = newToken(); const by = await owner(req); await Quote.updateOne({ _id: q._id }, { $set: { status: 'Sent', tokenHash: sha(token), sentAt: q.sentAt || new Date() }, $push: { history: note(by, q.status === 'Sent' ? 'link-renewed' : 'sent') } });
  if (q.leadId) await Lead.updateOne({ _id: q.leadId, status: { $in: ['New', 'Contacted', 'DemoBooked'] } }, { $set: { status: 'Quoted', lastContactedAt: new Date() }, $push: { history: note(by, 'quoted', q.number) } });
  await audit(req, { action: 'quote.send', entityType: 'Quote', entityId: q._id, schoolId: q.schoolId, detail: { number: q.number } }); res.json({ quote: quoteView(await Quote.findById(q._id)), link: linkFor(req, token), note: 'Copy this link now: it is shown once. Send a new link if it is lost.' });
});
exports.withdrawQuote = wrap('withdrawQuote', async (req, res) => {
  const q = await myQuote(req, res); if (!q) return; if (!['Draft', 'Sent'].includes(q.status)) return bad(res, 409, 'Only a draft or sent quote can be withdrawn.'); const reason = clean(req.body && req.body.reason, 200); if (reason.length < 3) return bad(res, 422, 'Say why (at least 3 characters).');
  const by = await owner(req); await Quote.updateOne({ _id: q._id }, { $set: { status: 'Withdrawn', tokenHash: '' }, $push: { history: note(by, 'withdrawn', reason) } }); res.json({ quote: quoteView(await Quote.findById(q._id)) });
});

/* ───────────── what the buyer sees ───────────── */
async function byToken(token) { if (!TOKEN_RE.test(String(token))) return null; const q = await Quote.findOne({ tokenHash: sha(token) }); if (!q) return null; if (q.status === 'Sent' && new Date(q.validUntil) < new Date()) { await Quote.updateOne({ _id: q._id, status: 'Sent' }, { $set: { status: 'Expired' }, $push: { history: note('System', 'expired') } }); q.status = 'Expired'; } return q; }
const payBlock = (s) => ({ bankName: s.bankName, accountTitle: s.accountTitle, accountNumber: s.accountNumber, iban: s.iban, jazzcash: s.jazzcash, easypaisa: s.easypaisa, note: s.paymentNote });
exports.proposal = wrap('proposal', async (req, res) => {
  const q = await byToken(req.params.token); if (!q) return bad(res, 404, 'This link is not valid. Ask for a new one.'); const s = await S.settings(); const inv = q.invoiceId ? await SaaSInvoice.findById(q.invoiceId) : null;
  res.set('Cache-Control', 'no-store');
  res.json({ seller: { name: s.companyName, address: s.address, email: s.email, phone: s.phone }, quote: { number: q.number, schoolName: q.schoolName, buyerName: q.buyerName, planLabel: q.planLabel, billingPeriod: q.billingPeriod, lines: q.lines, subtotalPKR: q.subtotalPKR, discountPercent: q.discountPercent, discountPKR: q.discountPKR, totalPKR: q.totalPKR, validUntil: q.validUntil, terms: q.terms, note: q.note, status: q.status, acceptedAt: q.acceptedAt, acceptedByName: q.acceptedByName, declinedAt: q.declinedAt, createdAt: q.createdAt },
    invoice: inv && inv.status !== 'Void' ? { number: inv.number, status: inv.status, totalPKR: inv.totalPKR, issuedAt: inv.issuedAt, dueAt: inv.dueAt, paidAt: inv.paidAt, overdue: inv.status === 'Issued' && new Date(inv.dueAt) < new Date() } : null, payment: inv && inv.status === 'Issued' ? payBlock(s) : null });
});
exports.acceptProposal = wrap('acceptProposal', async (req, res) => {
  const q = await byToken(req.params.token); if (!q) return bad(res, 404, 'This link is not valid. Ask for a new one.'); const b = req.body || {};
  if (q.status === 'Accepted') return res.json({ ok: true, already: true }); if (q.status !== 'Sent') return bad(res, 409, q.status === 'Expired' ? 'This quote has expired. Ask us for a new one.' : `This quote is ${q.status.toLowerCase()}.`);
  const name = clean(b.name, 120); const email = clean(b.email, 160).toLowerCase(); if (name.length < 2) return bad(res, 422, 'Please type your full name.'); if (!EMAIL.test(email)) return bad(res, 422, 'Please type your email address.'); if (b.agree !== true) return bad(res, 422, 'Please tick the box to accept the terms.');
  // taking the quote is a conditional write: two clicks make one acceptance
  const won = await Quote.updateOne({ _id: q._id, status: 'Sent' }, { $set: { status: 'Accepted', acceptedAt: new Date(), acceptedByName: name, acceptedByEmail: email, acceptedIpHash: S.hashIp(req), acceptedTermsHash: sha(q.terms) }, $push: { history: note(name, 'accepted', email) } });
  if (!won.matchedCount) return res.json({ ok: true, already: true });
  const s = await S.settings(); let inv = await SaaSInvoice.findOne({ quoteId: q._id });
  if (!inv) { try { inv = await SaaSInvoice.create({ number: await S.nextNumber('AI'), quoteId: q._id, leadId: q.leadId, schoolId: q.schoolId, buyerName: name, buyerEmail: email, schoolName: q.schoolName, planSlug: q.planSlug, planLabel: q.planLabel, billingPeriod: q.billingPeriod, lines: [...q.lines, ...(q.discountPKR ? [{ label: `Discount ${q.discountPercent}%`, amountPKR: -q.discountPKR }] : [])], totalPKR: q.totalPKR, dueAt: addDays(new Date(), s.invoiceDueDays), createdByName: 'Accepted by buyer' }); } catch (e) { if (e.code !== 11000) throw e; inv = await SaaSInvoice.findOne({ quoteId: q._id }); } }
  await Quote.updateOne({ _id: q._id }, { $set: { invoiceId: inv._id } });
  res.json({ ok: true, invoice: { number: inv.number, totalPKR: inv.totalPKR, dueAt: inv.dueAt }, payment: payBlock(s) });
});
exports.declineProposal = wrap('declineProposal', async (req, res) => {
  const q = await byToken(req.params.token); if (!q) return bad(res, 404, 'This link is not valid.'); if (q.status !== 'Sent') return bad(res, 409, `This quote is ${q.status.toLowerCase()}.`); const reason = clean(req.body && req.body.reason, 300);
  await Quote.updateOne({ _id: q._id, status: 'Sent' }, { $set: { status: 'Declined', declinedAt: new Date(), declineReason: reason }, $push: { history: note('Buyer', 'declined', reason) } }); res.json({ ok: true });
});

/* ───────────── invoices ───────────── */
const invoiceView = (i) => ({ _id: i._id, number: i.number, quoteId: i.quoteId, leadId: i.leadId, schoolId: i.schoolId, buyerName: i.buyerName, buyerEmail: i.buyerEmail, schoolName: i.schoolName, planSlug: i.planSlug, planLabel: i.planLabel, billingPeriod: i.billingPeriod, lines: i.lines, totalPKR: i.totalPKR, issuedAt: i.issuedAt, dueAt: i.dueAt, status: i.status, overdue: i.status === 'Issued' && new Date(i.dueAt) < new Date(), paidAt: i.paidAt, paymentId: i.paymentId, method: i.method, reference: i.reference, voidReason: i.voidReason });
exports.invoiceView = invoiceView;
exports.listInvoices = wrap('listInvoices', async (req, res) => { const { limit, skip, p } = page(req.query); const f = {}; if (['Issued', 'Paid', 'Void'].includes(req.query.status)) f.status = req.query.status; if (req.query.overdue === '1') { f.status = 'Issued'; f.dueAt = { $lt: new Date() }; } const [rows, total] = await Promise.all([SaaSInvoice.find(f).sort({ issuedAt: -1 }).skip(skip).limit(limit), SaaSInvoice.countDocuments(f)]); res.json({ invoices: rows.map(invoiceView), pagination: { total, pages: Math.ceil(total / limit), currentPage: p } }); });
exports.payInvoice = wrap('payInvoice', async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 404, 'Invoice not found'); const inv = await SaaSInvoice.findById(req.params.id); if (!inv) return bad(res, 404, 'Invoice not found'); if (inv.status === 'Void') return bad(res, 409, 'This invoice was cancelled.');
  const b = req.body || {}; if (!['bank', 'jazzcash', 'easypaisa', 'cash', 'other'].includes(b.method)) return bad(res, 422, 'Choose how the money was received.');
  let schoolId = inv.schoolId; if (!schoolId && inv.leadId) { const l = await Lead.findById(inv.leadId); if (l && l.convertedSchoolId) schoolId = l.convertedSchoolId; }
  if (!schoolId) return bad(res, 409, 'Create the school first (on the lead), then record the payment.');
  const by = await owner(req); const actor = { userId: req.user.userId, name: by };
  // the same payment path as every other subscription payment: ledger, plan, expiry and commission. The invoice id is the idempotency key, so a retry never counts twice.
  const { payment, duplicate } = await billing.recordPayment({ schoolId, planSlug: inv.planSlug, billingPeriod: inv.billingPeriod, amountPKR: inv.totalPKR, method: b.method, reference: clean(b.reference, 120), paidAt: b.paidAt, note: `Invoice ${inv.number}`, idempotencyKey: `saasinv:${inv._id}` }, actor);
  await SaaSInvoice.updateOne({ _id: inv._id }, { $set: { status: 'Paid', schoolId, paidAt: payment.paidAt, paymentId: payment._id, method: payment.method, reference: payment.reference } });
  if (inv.quoteId) await Quote.updateOne({ _id: inv.quoteId }, { $push: { history: note(by, 'paid', inv.number) } });
  if (inv.leadId) await Lead.updateOne({ _id: inv.leadId, status: { $ne: 'Won' } }, { $set: { status: 'Won', convertedSchoolId: schoolId }, $push: { history: note(by, 'won', `${inv.number} paid`) } });
  await audit(req, { action: 'saasinvoice.pay', entityType: 'SaaSInvoice', entityId: inv._id, schoolId, detail: { number: inv.number, amountPKR: inv.totalPKR, duplicate } });
  const school = await School.findById(schoolId).select('plan subscriptionExpiresAt'); res.status(duplicate ? 200 : 201).json({ message: duplicate ? 'This invoice was already paid.' : 'Payment recorded and plan applied', invoice: invoiceView(await SaaSInvoice.findById(inv._id)), school: { plan: school.plan, subscriptionExpiresAt: school.subscriptionExpiresAt } });
});
exports.voidInvoice = wrap('voidInvoice', async (req, res) => {
  if (!validId(req.params.id)) return bad(res, 404, 'Invoice not found'); const inv = await SaaSInvoice.findById(req.params.id); if (!inv) return bad(res, 404, 'Invoice not found'); if (inv.status !== 'Issued') return bad(res, 409, inv.status === 'Paid' ? 'A paid invoice is reversed by refunding the payment.' : 'Already cancelled.');
  const reason = clean(req.body && req.body.reason, 200); if (reason.length < 5) return bad(res, 422, 'Say why (at least 5 characters).'); const by = await owner(req);
  await SaaSInvoice.updateOne({ _id: inv._id, status: 'Issued' }, { $set: { status: 'Void', voidReason: reason, voidedAt: new Date() } }); if (inv.quoteId) await Quote.updateOne({ _id: inv.quoteId }, { $push: { history: note(by, 'invoice-void', reason) } });
  await audit(req, { action: 'saasinvoice.void', entityType: 'SaaSInvoice', entityId: inv._id, schoolId: inv.schoolId, detail: { reason } }); res.json({ invoice: invoiceView(await SaaSInvoice.findById(inv._id)) });
});

/* ───────────── settings and proof ───────────── */
exports.getSettings = wrap('getSettings', async (req, res) => { res.json({ settings: await S.settings() }); });
exports.putSettings = wrap('putSettings', async (req, res) => {
  const b = req.body || {}; const cur = await S.settings(); const t = (k, n) => (b[k] === undefined ? cur[k] : clean(b[k], n)); const num = (k, lo, hi) => (b[k] === undefined ? cur[k] : Math.min(hi, Math.max(lo, parseInt(b[k], 10) || cur[k])));
  const hours = (k) => { if (b[k] === undefined) return cur[k]; const o = {}; for (const p of ['low', 'normal', 'high', 'urgent']) { const v = Number(b[k] && b[k][p]); o[p] = Number.isFinite(v) && v > 0 && v <= 720 ? v : cur[k][p]; } return o; };
  const terms = b.terms === undefined ? cur.terms : cleanBlock(b.terms, 4000) || cur.terms;
  const next = { ...cur, companyName: t('companyName', 80) || cur.companyName, address: t('address', 200), email: t('email', 120), phone: t('phone', 40), bankName: t('bankName', 80), accountTitle: t('accountTitle', 80), accountNumber: t('accountNumber', 40), iban: t('iban', 40), jazzcash: t('jazzcash', 40), easypaisa: t('easypaisa', 40), paymentNote: t('paymentNote', 300), quoteValidDays: num('quoteValidDays', 1, 90), invoiceDueDays: num('invoiceDueDays', 1, 60), terms, termsVersion: terms === cur.terms ? cur.termsVersion : (cur.termsVersion || 1) + 1, firstResponseHours: hours('firstResponseHours'), resolveHours: hours('resolveHours') };
  await S.saveSettings(next); await audit(req, { action: 'sales.settings', entityType: 'AppSetting', entityId: S.DEFAULTS.companyName }); res.json({ settings: next });
});
const proofView = (t) => ({ _id: t._id, quote: t.quote, personName: t.personName, personRole: t.personRole, schoolName: t.schoolName, schoolId: t.schoolId, evidenceKind: t.evidenceKind, evidenceNote: t.evidenceNote, wordsAsGiven: t.wordsAsGiven, editApprovedOn: t.editApprovedOn, consentGiven: t.consentGiven, consentOn: t.consentOn, consentContact: t.consentContact, status: t.status, publishedAt: t.publishedAt, reviewBy: t.reviewBy, withdrawnAt: t.withdrawnAt, withdrawnReason: t.withdrawnReason, createdAt: t.createdAt });
function proofFields(b, base = {}) {
  const set = {}; const quote = b.quote !== undefined ? cleanBlock(b.quote, 600) : base.quote; const personName = b.personName !== undefined ? clean(b.personName, 100) : base.personName; const schoolName = b.schoolName !== undefined ? clean(b.schoolName, 140) : base.schoolName;
  if (!quote || quote.length < 20) throw S.httpError(422, 'Type the words as the person gave them (at least 20 characters).'); if (!personName) throw S.httpError(422, 'Who said it?'); if (!schoolName) throw S.httpError(422, 'Which school?');
  Object.assign(set, { quote, personName, schoolName }); if (b.personRole !== undefined) set.personRole = clean(b.personRole, 80); if (b.evidenceKind !== undefined) { if (!['email', 'signed-form', 'recorded-call', 'survey', 'other'].includes(b.evidenceKind)) throw S.httpError(422, 'Choose what kind of record you hold.'); set.evidenceKind = b.evidenceKind; }
  if (b.evidenceNote !== undefined) set.evidenceNote = cleanBlock(b.evidenceNote, 500); if (b.wordsAsGiven !== undefined) set.wordsAsGiven = !!b.wordsAsGiven; if (b.editApprovedOn !== undefined) set.editApprovedOn = b.editApprovedOn ? new Date(b.editApprovedOn) : null;
  if (b.consentGiven !== undefined) set.consentGiven = b.consentGiven === true; if (b.consentOn !== undefined) set.consentOn = b.consentOn ? new Date(b.consentOn) : null; if (b.consentContact !== undefined) set.consentContact = clean(b.consentContact, 160); return set;
}
exports.listProof = wrap('listProof', async (req, res) => { res.json({ proof: (await Testimonial.find({}).sort({ createdAt: -1 }).limit(100)).map(proofView) }); });
exports.createProof = wrap('createProof', async (req, res) => { const set = proofFields(req.body || {}); if (req.body.schoolId) { if (!validId(req.body.schoolId) || !(await School.findById(req.body.schoolId).select('_id'))) return bad(res, 404, 'School not found'); set.schoolId = oid(req.body.schoolId); } const t = await Testimonial.create({ ...set, createdByName: await owner(req) }); res.status(201).json({ proof: proofView(t) }); });
async function myProof(req, res) { if (!validId(req.params.id)) { bad(res, 404, 'Not found'); return null; } const t = await Testimonial.findById(req.params.id); if (!t) { bad(res, 404, 'Not found'); return null; } return t; }
exports.updateProof = wrap('updateProof', async (req, res) => { const t = await myProof(req, res); if (!t) return; if (t.status === 'Published') return bad(res, 409, 'Withdraw it from the website before changing it.'); await Testimonial.updateOne({ _id: t._id }, { $set: proofFields(req.body || {}, t) }); res.json({ proof: proofView(await Testimonial.findById(t._id)) }); });
// Publishing is the only door to the website, and it needs a person's consent and a record of their words.
exports.publishProof = wrap('publishProof', async (req, res) => {
  const t = await myProof(req, res); if (!t) return; if (t.status === 'Published') return bad(res, 409, 'Already on the website.');
  const why = []; if (!t.consentGiven) why.push('The person has not given consent.'); if (!t.consentOn || Number.isNaN(new Date(t.consentOn).getTime())) why.push('Record the date they consented.'); else if (new Date(t.consentOn) > new Date()) why.push('The consent date is in the future.'); else if (new Date(t.consentOn) < addDays(new Date(), -365)) why.push('The consent is more than a year old. Ask again.');
  if (String(t.consentContact).trim().length < 5) why.push('Say how the person can be reached (their email or phone).'); if (String(t.evidenceNote).trim().length < 10) why.push('Say where the original words are kept (at least 10 characters).'); if (!t.wordsAsGiven && !t.editApprovedOn) why.push('You edited the words: record the date the person approved the edit.');
  if (why.length) return bad(res, 422, why[0], { problems: why }); const by = await owner(req); const now = new Date();
  await Testimonial.updateOne({ _id: t._id }, { $set: { status: 'Published', publishedAt: now, publishedByName: by, reviewBy: addDays(now, 365), withdrawnAt: null, withdrawnReason: '' } }); await audit(req, { action: 'proof.publish', entityType: 'Testimonial', entityId: t._id, detail: { school: t.schoolName } }); res.json({ proof: proofView(await Testimonial.findById(t._id)) });
});
exports.withdrawProof = wrap('withdrawProof', async (req, res) => { const t = await myProof(req, res); if (!t) return; if (t.status !== 'Published') return bad(res, 409, 'It is not on the website.'); const reason = clean(req.body && req.body.reason, 200); if (reason.length < 3) return bad(res, 422, 'Say why (at least 3 characters).'); await Testimonial.updateOne({ _id: t._id }, { $set: { status: 'Withdrawn', withdrawnAt: new Date(), withdrawnReason: reason } }); await audit(req, { action: 'proof.withdraw', entityType: 'Testimonial', entityId: t._id, detail: { reason } }); res.json({ proof: proofView(await Testimonial.findById(t._id)) }); });
exports.deleteProof = wrap('deleteProof', async (req, res) => { const t = await myProof(req, res); if (!t) return; if (t.status === 'Published') return bad(res, 409, 'Withdraw it first.'); await Testimonial.deleteMany({ _id: t._id }); res.json({ ok: true }); });
// The website shows only published words whose consent is still within the year
exports.publicProof = wrap('publicProof', async (req, res) => { const rows = await Testimonial.find({ status: 'Published', reviewBy: { $gt: new Date() } }).sort({ publishedAt: -1 }).limit(6); res.set('Cache-Control', 'public, max-age=0, s-maxage=30'); res.json({ proof: rows.map((t) => ({ quote: t.quote, personName: t.personName, personRole: t.personRole, schoolName: t.schoolName })) }); });

/* ───────────── daily housekeeping ───────────── */
exports.sweep = async () => {
  const now = new Date(); const ex = await Quote.find({ status: 'Sent', validUntil: { $lt: now } }); for (const q of ex) await Quote.updateOne({ _id: q._id, status: 'Sent' }, { $set: { status: 'Expired' }, $push: { history: note('System', 'expired') } });
  const late = await SaaSInvoice.find({ status: 'Issued', dueAt: { $lt: now } }); let reminded = 0; for (const i of late) if (!i.reminderAt || now - new Date(i.reminderAt) > 7 * 86400000) { await SaaSInvoice.updateOne({ _id: i._id }, { $set: { reminderAt: now }, $inc: { reminders: 1 } }); reminded += 1; }
  return { expiredQuotes: ex.length, overdueInvoices: late.length, reminded };
};
