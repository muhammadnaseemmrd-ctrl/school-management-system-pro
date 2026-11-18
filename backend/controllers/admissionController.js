// Admissions CRM (PRD E04). 403 not allowed · 404 not in this school · 409 changed by someone else · 422 not possible in the current state.
const mongoose = require('../lib/pgdoc');
const Inquiry = require('../models/AdmissionInquiry');
const App = require('../models/AdmissionApplication');
const Capacity = require('../models/AdmissionCapacity');
const Student = require('../models/Student'); const Parent = require('../models/Parent'); const Class = require('../models/Class'); const School = require('../models/School');
const FeeStructure = require('../models/FeeStructure'); const GuardianLink = require('../models/GuardianLink');
const A = require('../utils/admissions'); const N = require('../utils/notify'); const { audit } = require('../utils/audit');
const { hashPassword, strongTempPassword } = require('../utils/password');

const isId = (v) => mongoose.isValidObjectId(String(v || ''));
const fail = (res, e) => res.status(500).json({ message: e.message });
const SOURCES = ['walk-in', 'phone', 'website', 'referral', 'social', 'event', 'other'];
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const date = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d; };
const yearNow = () => { const d = new Date(); return d.getMonth() >= 6 ? `${d.getFullYear()}-${d.getFullYear() + 1}` : `${d.getFullYear() - 1}-${d.getFullYear()}`; };
const page = (q) => { const p = Math.max(1, parseInt(q.page, 10) || 1); const l = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25)); return { p, l }; };
const rx = (s) => ({ $regex: String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' });
const shapeApp = (a) => ({ _id: a._id, inquiryId: a.inquiryId, academicYear: a.academicYear, gradeSought: a.gradeSought, child: a.child, guardian: a.guardian, stage: a.stage, stageHistory: a.stageHistory,
  checklist: a.checklist, interviewAt: a.interviewAt, interviewNote: a.interviewNote, decisionNote: a.decisionNote, seatReserved: a.seatReserved, waitlistedAt: a.waitlistedAt, nextFollowUpOn: a.nextFollowUpOn,
  duplicateFlags: a.duplicateFlags, mergedIntoId: a.mergedIntoId, studentId: a.studentId, admissionNumber: a.admissionNumber, enrolledAt: a.enrolledAt, createdAt: a.createdAt, version: a.updatedAt });
const touch = (a, stage, req, note = '') => { a.stage = stage; a.stageHistory.push({ stage, at: new Date(), byName: req.actorName || '', note }); };

/* ───────── inquiries ───────── */
const makeInquiry = async (schoolId, b, byName) => {
  const contactName = str(b.contactName, 80); const phone = str(b.phone, 30); const email = str(b.email, 100).toLowerCase();
  if (!contactName) return { error: 'Enter the contact person\'s name.' };
  if (!phone && !email) return { error: 'Enter a phone number or an email so the school can reply.' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email.' };
  const fu = date(b.nextFollowUpOn); if (fu === undefined) return { error: 'Enter a valid follow-up date.' };
  const row = await Inquiry.create({ schoolId, source: SOURCES.includes(b.source) ? b.source : 'walk-in', sourceDetail: str(b.sourceDetail, 100), contactName, phone, email, note: str(b.note, 500), nextFollowUpOn: fu, createdByName: byName || '' });
  return { row };
};

exports.createInquiry = async (req, res) => {
  try {
    const r = await makeInquiry(req.user.schoolId, req.body || {}, req.actorName);
    if (r.error) return res.status(400).json({ message: r.error });
    await audit(req, { action: 'admissions.inquiry.create', entityType: 'AdmissionInquiry', entityId: r.row._id, schoolId: req.user.schoolId, detail: { source: r.row.source } });
    res.status(201).json({ inquiry: r.row });
  } catch (e) { fail(res, e); }
};

// Website form. Anyone can post, so it only creates an inquiry: no application, no student, nothing returned about the school.
exports.publicInquiry = async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ ok: true });                 // honeypot: bots fill the hidden field
    const school = await School.findOne({ code: str(req.params.code, 20).toUpperCase(), isActive: true }).select('_id');
    if (!school) return res.status(404).json({ message: 'School not found' });
    const r = await makeInquiry(school._id, { ...b, source: 'website', sourceDetail: 'Website form' }, 'Website');
    if (r.error) return res.status(400).json({ message: r.error });
    const admins = await N.admins(school._id);
    await N.notify({ schoolId: school._id, recipients: admins, title: 'New admission inquiry', body: `${r.row.contactName} asked about admission.`, link: '/admin/dashboard#/admissions', type: 'general' });
    res.status(201).json({ ok: true });
  } catch (e) { fail(res, e); }
};

exports.listInquiries = async (req, res) => {
  try {
    const { p, l } = page(req.query); const q = { schoolId: req.user.schoolId };
    if (req.query.status) q.status = String(req.query.status);
    if (req.query.search) q.$or = [{ contactName: rx(req.query.search) }, { phone: rx(req.query.search) }, { email: rx(req.query.search) }];
    const [rows, total] = await Promise.all([Inquiry.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), Inquiry.countDocuments(q)]);
    const counts = new Map(); (await App.find({ schoolId: req.user.schoolId, inquiryId: { $in: rows.map((r) => r._id) } }).select('inquiryId')).forEach((a) => counts.set(String(a.inquiryId), (counts.get(String(a.inquiryId)) || 0) + 1));
    res.json({ inquiries: rows.map((r) => ({ ...JSON.parse(JSON.stringify(r)), applications: counts.get(String(r._id)) || 0 })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
  } catch (e) { fail(res, e); }
};

exports.updateInquiry = async (req, res) => {
  try {
    const r = isId(req.params.id) ? await Inquiry.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null;
    if (!r) return res.status(404).json({ message: 'Inquiry not found' });
    const b = req.body || {};
    if (b.note !== undefined) r.note = str(b.note, 500);
    if (b.nextFollowUpOn !== undefined) { const d = date(b.nextFollowUpOn); if (d === undefined) return res.status(400).json({ message: 'Enter a valid follow-up date.' }); r.nextFollowUpOn = d; }
    if (b.status === 'Closed') {
      if (r.status === 'Applied') return res.status(422).json({ message: 'This inquiry already has an application. Close the application instead.' });
      if (str(b.closedReason).length < 3) return res.status(400).json({ message: 'Write why this inquiry is being closed.' });
      r.status = 'Closed'; r.closedReason = str(b.closedReason, 200); r.nextFollowUpOn = null;
    }
    await r.save();
    await audit(req, { action: 'admissions.inquiry.update', entityType: 'AdmissionInquiry', entityId: r._id, schoolId: req.user.schoolId, detail: { status: r.status } });
    res.json({ inquiry: r });
  } catch (e) { fail(res, e); }
};

/* ───────── applications ───────── */
exports.createApplication = async (req, res) => {
  try {
    const b = req.body || {}; const sid = req.user.schoolId;
    const childName = str(b.child?.name, 80); const grade = str(b.gradeSought, 20);
    if (!childName) return res.status(400).json({ message: 'Enter the child\'s name.' });
    if (!grade) return res.status(400).json({ message: 'Choose the grade applied for.' });
    const dob = date(b.child?.dateOfBirth); if (dob === undefined) return res.status(400).json({ message: 'Enter a valid date of birth.' });
    if (dob && dob > new Date()) return res.status(400).json({ message: 'Date of birth cannot be in the future.' });
    let inquiry = null;
    if (b.inquiryId) {
      inquiry = isId(b.inquiryId) ? await Inquiry.findOne({ _id: b.inquiryId, schoolId: sid }) : null;
      if (!inquiry) return res.status(404).json({ message: 'Inquiry not found' });
      if (inquiry.status === 'Closed') return res.status(422).json({ message: 'This inquiry was closed. Open a new inquiry for this family.' });
    } else {
      const g = b.guardian || {};
      const r = await makeInquiry(sid, { contactName: g.name || childName, phone: g.phone, email: g.email, source: b.source, sourceDetail: b.sourceDetail, note: '' }, req.actorName);
      if (r.error) return res.status(400).json({ message: r.error });
      inquiry = r.row;
    }
    const g = b.guardian || {};
    const guardian = { name: str(g.name || inquiry.contactName, 80), relationship: str(g.relationship || 'Guardian', 30), phone: str(g.phone || inquiry.phone, 30), email: str(g.email || inquiry.email, 100).toLowerCase() };
    const year = str(b.academicYear, 20) || yearNow();
    const dups = await A.findDuplicates(sid, { childName, dateOfBirth: dob, phone: guardian.phone, email: guardian.email });
    const app = await App.create({ schoolId: sid, inquiryId: inquiry._id, academicYear: year, gradeSought: grade,
      child: { name: childName, dateOfBirth: dob, gender: ['Male', 'Female', 'Other'].includes(b.child?.gender) ? b.child.gender : '', previousSchool: str(b.child?.previousSchool, 100) },
      guardian, stage: 'New', stageHistory: [{ stage: 'New', at: new Date(), byName: req.actorName || '', note: 'Application created' }],
      checklist: A.DEFAULT_CHECKLIST.map((c) => ({ ...c })), duplicateFlags: dups.map((d) => ({ ...d, resolution: 'pending' })), createdByName: req.actorName || '' });
    if (inquiry.status === 'Open') { inquiry.status = 'Applied'; await inquiry.save(); }
    await audit(req, { action: 'admissions.application.create', entityType: 'AdmissionApplication', entityId: app._id, schoolId: sid, detail: { grade, year, possibleDuplicates: dups.length } });
    res.status(201).json({ application: shapeApp(app), possibleDuplicates: dups.length });
  } catch (e) { fail(res, e); }
};

exports.listApplications = async (req, res) => {
  try {
    const { p, l } = page(req.query); const q = { schoolId: req.user.schoolId };
    if (req.query.stage && A.STAGES.includes(req.query.stage)) q.stage = req.query.stage;
    if (req.query.open === '1') q.stage = { $in: A.OPEN };
    if (req.query.grade) q.gradeSought = String(req.query.grade);
    if (req.query.year) q.academicYear = String(req.query.year);
    if (req.query.search) q.$or = [{ 'child.name': rx(req.query.search) }, { 'guardian.name': rx(req.query.search) }, { 'guardian.phone': rx(req.query.search) }];
    const [rows, total] = await Promise.all([App.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l), App.countDocuments(q)]);
    res.json({ applications: rows.map((a) => ({ ...shapeApp(a), pendingDuplicates: a.duplicateFlags.filter((d) => d.resolution === 'pending').length, missingDocs: a.checklist.filter((c) => c.required && !c.verifiedAt).length })), pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) } });
  } catch (e) { fail(res, e); }
};

const feePreview = async (schoolId, grade) => {
  const fs = await FeeStructure.findOne({ schoolId, standard: grade });
  if (!fs) return null;
  const n = fs.totalInstallments || 4;
  return { standard: grade, totalAmount: fs.totalAmount, installments: n, perInstallment: Math.round((fs.totalAmount / n) * 100) / 100 };
};

exports.getApplication = async (req, res) => {
  try {
    const a = isId(req.params.id) ? await App.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null;
    if (!a) return res.status(404).json({ message: 'Application not found' });
    const inquiry = await Inquiry.findOne({ _id: a.inquiryId, schoolId: req.user.schoolId });
    const seats = await A.seatsFor(req.user.schoolId, a.academicYear, a.gradeSought);
    const queue = seats.waiting.findIndex((w) => String(w._id) === String(a._id));
    res.json({ application: shapeApp(a), source: inquiry ? { _id: inquiry._id, source: inquiry.source, sourceDetail: inquiry.sourceDetail, contactName: inquiry.contactName, createdAt: inquiry.createdAt } : null,
      seats: { limited: seats.limited, seats: seats.seats, used: seats.used, available: seats.available, waiting: seats.waiting.length, queuePosition: queue >= 0 ? queue + 1 : null },
      nextStages: A.TRANSITIONS[a.stage] || [], feePreview: await feePreview(req.user.schoolId, a.gradeSought) });
  } catch (e) { fail(res, e); }
};

exports.updateApplication = async (req, res) => {
  try {
    const a = isId(req.params.id) ? await App.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null;
    if (!a) return res.status(404).json({ message: 'Application not found' });
    const b = req.body || {};
    if (b.version && new Date(b.version).getTime() !== new Date(a.updatedAt).getTime()) return res.status(409).json({ message: 'Someone else changed this application. Reload and try again.' });
    if (!A.OPEN.includes(a.stage)) return res.status(422).json({ message: `A ${a.stage.toLowerCase()} application cannot be edited.` });
    if (b.child) {
      if (b.child.name !== undefined) { if (!str(b.child.name)) return res.status(400).json({ message: 'Enter the child\'s name.' }); a.child.name = str(b.child.name, 80); }
      if (b.child.dateOfBirth !== undefined) { const d = date(b.child.dateOfBirth); if (d === undefined || (d && d > new Date())) return res.status(400).json({ message: 'Enter a valid date of birth.' }); a.child.dateOfBirth = d; }
      if (b.child.gender !== undefined && ['Male', 'Female', 'Other', ''].includes(b.child.gender)) a.child.gender = b.child.gender;
      if (b.child.previousSchool !== undefined) a.child.previousSchool = str(b.child.previousSchool, 100);
    }
    if (b.guardian) for (const k of ['name', 'relationship', 'phone', 'email']) if (b.guardian[k] !== undefined) a.guardian[k] = k === 'email' ? str(b.guardian[k], 100).toLowerCase() : str(b.guardian[k], 80);
    if (b.gradeSought !== undefined && b.gradeSought !== a.gradeSought) { if (a.seatReserved) return res.status(422).json({ message: 'This child holds a seat. Withdraw the offer before changing the grade.' }); a.gradeSought = str(b.gradeSought, 20); }
    if (b.nextFollowUpOn !== undefined) { const d = date(b.nextFollowUpOn); if (d === undefined) return res.status(400).json({ message: 'Enter a valid follow-up date.' }); a.nextFollowUpOn = d; }
    if (b.interviewNote !== undefined) a.interviewNote = str(b.interviewNote, 500);
    // identity changed: check again
    const dups = await A.findDuplicates(req.user.schoolId, { childName: a.child.name, dateOfBirth: a.child.dateOfBirth, phone: a.guardian.phone, email: a.guardian.email, excludeId: a._id });
    const known = new Set(a.duplicateFlags.map((d) => d.kind + d.refId));
    dups.filter((d) => !known.has(d.kind + d.refId)).forEach((d) => a.duplicateFlags.push({ ...d, resolution: 'pending' }));
    await a.save();
    await audit(req, { action: 'admissions.application.update', entityType: 'AdmissionApplication', entityId: a._id, schoolId: req.user.schoolId, detail: {} });
    res.json({ application: shapeApp(a) });
  } catch (e) { fail(res, e); }
};

exports.checklist = async (req, res) => {
  try {
    const a = isId(req.params.id) ? await App.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null;
    if (!a) return res.status(404).json({ message: 'Application not found' });
    if (!A.OPEN.includes(a.stage)) return res.status(422).json({ message: `A ${a.stage.toLowerCase()} application cannot be changed.` });
    const b = req.body || {};
    if (req.params.key === 'new') {
      const label = str(b.label, 80); if (!label) return res.status(400).json({ message: 'Name the document.' });
      const due = date(b.dueOn); if (due === undefined) return res.status(400).json({ message: 'Enter a valid due date.' });
      a.checklist.push({ key: `x${Date.now().toString(36)}`, label, required: b.required !== false, dueOn: due });
    } else {
      const it = a.checklist.find((c) => c.key === req.params.key);
      if (!it) return res.status(404).json({ message: 'Checklist item not found' });
      if (b.verified === false) { it.verifiedAt = null; it.verifiedByName = ''; } else { it.verifiedAt = new Date(); it.verifiedByName = req.actorName || ''; }
    }
    await a.save();
    await audit(req, { action: 'admissions.checklist', entityType: 'AdmissionApplication', entityId: a._id, schoolId: req.user.schoolId, detail: { key: req.params.key, verified: b.verified !== false } });
    res.json({ checklist: a.checklist });
  } catch (e) { fail(res, e); }
};

exports.resolveDuplicate = async (req, res) => {
  try {
    const a = isId(req.params.id) ? await App.findOne({ _id: req.params.id, schoolId: req.user.schoolId }) : null;
    if (!a) return res.status(404).json({ message: 'Application not found' });
    const b = req.body || {};
    if (!['duplicate', 'not-duplicate'].includes(b.resolution)) return res.status(400).json({ message: 'Choose whether this is the same child or a different child.' });
    if (str(b.note).length < 3) return res.status(400).json({ message: 'Write a short note about how you checked.' });
    const flag = a.duplicateFlags.find((d) => d.kind === b.kind && d.refId === String(b.refId));
    if (!flag) return res.status(404).json({ message: 'Duplicate flag not found' });
    if (flag.resolution !== 'pending') return res.status(422).json({ message: 'This match was already decided.' });
    flag.resolution = b.resolution; flag.resolvedByName = req.actorName || ''; flag.resolvedAt = new Date(); flag.note = str(b.note, 300);
    if (b.resolution === 'duplicate') {
      if (!A.OPEN.includes(a.stage)) return res.status(422).json({ message: `A ${a.stage.toLowerCase()} application cannot be merged.` });
      if (flag.kind === 'student') { touch(a, 'Withdrawn', req, `Merged: child is already a student (${flag.refName}). ${flag.note}`); }
      else {
        const target = isId(flag.refId) ? await App.findOne({ _id: flag.refId, schoolId: req.user.schoolId }) : null;
        if (!target) return res.status(404).json({ message: 'The other application no longer exists' });
        a.mergedIntoId = target._id; touch(a, 'Withdrawn', req, `Merged into the application for ${target.child.name}. ${flag.note}`);
      }
      a.seatReserved = false; a.waitlistedAt = null;
    }
    await a.save();
    await audit(req, { action: 'admissions.duplicate.resolve', entityType: 'AdmissionApplication', entityId: a._id, schoolId: req.user.schoolId, detail: { with: flag.refId, kind: flag.kind, resolution: b.resolution, note: flag.note } });
    res.json({ application: shapeApp(a) });
  } catch (e) { fail(res, e); }
};

exports.changeStage = async (req, res) => {
  try {
    const sid = req.user.schoolId;
    const a = isId(req.params.id) ? await App.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!a) return res.status(404).json({ message: 'Application not found' });
    const b = req.body || {}; const to = b.stage; const note = str(b.note, 300);
    if (!A.STAGES.includes(to) || to === 'Enrolled' || to === 'New') return res.status(400).json({ message: 'Choose a valid next stage. Use Enroll to finish an admission.' });
    if (b.version && new Date(b.version).getTime() !== new Date(a.updatedAt).getTime()) return res.status(409).json({ message: 'Someone else changed this application. Reload and try again.' });
    if (!(A.TRANSITIONS[a.stage] || []).includes(to)) return res.status(422).json({ message: `An application at "${a.stage}" cannot move to "${to}".` });
    if (['Rejected', 'Withdrawn'].includes(to) && note.length < 3) return res.status(400).json({ message: 'Write the reason.' });
    const freedSeat = a.seatReserved && ['Rejected', 'Withdrawn'].includes(to);

    if (to === 'Interview') {
      const at = date(b.interviewAt); if (at === undefined) return res.status(400).json({ message: 'Enter a valid interview time.' });
      if (at && at < new Date(Date.now() - 864e5)) return res.status(400).json({ message: 'The interview time is in the past.' });
      a.interviewAt = at;
    }
    if (to === 'Waitlisted') { a.waitlistedAt = new Date(); a.seatReserved = false; }
    if (to === 'Offered') {
      if (a.duplicateFlags.some((d) => d.resolution === 'pending')) return res.status(422).json({ message: 'Decide whether the possible duplicate is the same child before making an offer.' });
      const missing = a.checklist.filter((c) => c.required && !c.verifiedAt).map((c) => c.label);
      if (missing.length) return res.status(422).json({ message: `Verify these documents first: ${missing.join(', ')}.` });
      const seats = await A.seatsFor(sid, a.academicYear, a.gradeSought);
      if (seats.limited && seats.available <= 0) return res.status(422).json({ message: `Grade ${a.gradeSought} has no free seat for ${a.academicYear}. Put the child on the waitlist.` });
      if (a.stage === 'Waitlisted') {
        const first = seats.waiting[0];
        if (first && String(first._id) !== String(a._id)) {
          if (str(b.skipQueueReason).length < 5) return res.status(422).json({ message: `${first.child.name} has been waiting longer. Offer that child first, or write the reason for skipping the queue.` });
          a.queueSkipReason = str(b.skipQueueReason, 200);
        }
      }
      a.seatReserved = true; a.waitlistedAt = null;
    }
    if (freedSeat) a.seatReserved = false;
    touch(a, to, req, note);
    if (to === 'Accepted' || to === 'Rejected') a.decisionNote = note;
    await a.save();
    await audit(req, { action: 'admissions.stage', entityType: 'AdmissionApplication', entityId: a._id, schoolId: sid, detail: { to, note, skippedQueue: a.queueSkipReason || undefined } });

    let nextInLine = null;
    if (freedSeat) {
      const seats = await A.seatsFor(sid, a.academicYear, a.gradeSought);
      if (seats.waiting[0]) {
        nextInLine = seats.waiting[0].child.name;
        await N.notify({ schoolId: sid, recipients: await N.admins(sid), title: `A seat opened in grade ${a.gradeSought}`, body: `${seats.waiting[0].child.name} is next on the waitlist.`, link: '/admin/dashboard#/admissions', type: 'general' });
      }
    }
    res.json({ application: shapeApp(a), nextInLine });
  } catch (e) { fail(res, e); }
};

exports.enroll = async (req, res) => {
  try {
    const sid = req.user.schoolId;
    const a = isId(req.params.id) ? await App.findOne({ _id: req.params.id, schoolId: sid }) : null;
    if (!a) return res.status(404).json({ message: 'Application not found' });
    if (a.studentId) {                                              // idempotent: a second press returns the same student
      const s = await Student.findOne({ _id: a.studentId, schoolId: sid }).select('name admissionNumber');
      return res.json({ alreadyEnrolled: true, student: s && { _id: s._id, name: s.name, admissionNumber: s.admissionNumber } });
    }
    if (a.stage !== 'Accepted') return res.status(422).json({ message: 'Only an accepted application can be enrolled.' });
    if (a.duplicateFlags.some((d) => d.resolution === 'pending')) return res.status(422).json({ message: 'Decide whether the possible duplicate is the same child first.' });
    const limit = await require('../utils/plans').checkLimit(sid, 'student');
    if (!limit.ok) return res.status(402).json({ message: limit.message });

    const classes = await Class.find({ schoolId: sid, standard: a.gradeSought });
    let cls = null;
    if (req.body?.classId) { cls = classes.find((c) => String(c._id) === String(req.body.classId)); if (!cls) return res.status(422).json({ message: `That class is not a grade ${a.gradeSought} class.` }); }
    else cls = classes.sort((x, y) => (x.studentCount || 0) - (y.studentCount || 0))[0];
    if (!cls) return res.status(422).json({ message: `Create a class for grade ${a.gradeSought} first.` });

    const school = await School.findById(sid).select('code name');
    const count = await App.countDocuments({ schoolId: sid, academicYear: a.academicYear, admissionNumber: { $ne: '' } });
    const admissionNumber = `${a.academicYear.slice(0, 4)}-${String(count + 1).padStart(4, '0')}`;
    const temp = strongTempPassword(); const slug = A.norm(a.child.name).replace(/ /g, '.').slice(0, 24) || 'student';
    const email = `${slug}.${Math.random().toString(36).slice(2, 6)}@students.${String(school.code).toLowerCase()}.local`;
    const g = a.guardian;
    const student = await Student.create({ schoolId: sid, schoolCode: school.code, schoolName: school.name, name: a.child.name, email, password: await hashPassword(temp), role: 'student', admissionNumber,
      gender: a.child.gender || 'Male', dateOfBirth: a.child.dateOfBirth, classId: cls._id, division: cls.division, academicYear: a.academicYear, previousSchool: a.child.previousSchool || 'Fresh',
      guardian: { name: g.name, relationship: g.relationship, mobileNumber: g.phone }, phone: g.phone });
    await Class.findByIdAndUpdate(cls._id, { $inc: { studentCount: 1 } });

    // guardian account and rights, created together with the student
    let parent = g.email ? await Parent.findOne({ schoolId: sid, email: g.email }) : null; let parentTemp = null;
    if (!parent && g.email) {
      parentTemp = strongTempPassword();
      parent = await Parent.create({ schoolId: sid, name: g.name || 'Parent', email: g.email, phone: g.phone, password: await hashPassword(parentTemp), role: 'parent', relationship: ['Father', 'Mother'].includes(g.relationship) ? g.relationship : 'Guardian', children: [student._id] });
    } else if (parent && !(parent.children || []).map(String).includes(String(student._id))) { parent.children.push(student._id); await parent.save(); }
    if (parent) await GuardianLink.create({ schoolId: sid, studentId: student._id, parentId: parent._id, relationship: g.relationship || 'Guardian', isPrimary: true, note: 'Created at enrollment', createdBy: req.user.userId, createdByName: req.actorName || '' });

    a.studentId = student._id; a.admissionNumber = admissionNumber; a.enrolledAt = new Date(); a.seatReserved = true; touch(a, 'Enrolled', req, `Enrolled in ${cls.standard}-${cls.division}`);
    await a.save();
    await audit(req, { action: 'admissions.enroll', entityType: 'AdmissionApplication', entityId: a._id, schoolId: sid, detail: { studentId: student._id, admissionNumber, classId: cls._id, parentId: parent?._id || null } });
    res.status(201).json({ student: { _id: student._id, name: student.name, admissionNumber, class: `${cls.standard}-${cls.division}`, email, temporaryPassword: temp },
      guardian: parent ? { _id: parent._id, email: parent.email, temporaryPassword: parentTemp, existing: !parentTemp } : null, feePreview: await feePreview(sid, a.gradeSought) });
  } catch (e) { if (e.name === 'ValidationError') return res.status(400).json({ message: Object.values(e.errors).map((x) => x.message).join(', ') }); fail(res, e); }
};

/* ───────── seats, pipeline, follow-ups ───────── */
exports.capacity = async (req, res) => {
  try {
    const sid = req.user.schoolId; const year = str(req.query.year, 20) || yearNow();
    const [caps, apps, classes] = await Promise.all([Capacity.find({ schoolId: sid, academicYear: year }), App.find({ schoolId: sid, academicYear: year }), Class.find({ schoolId: sid }).select('standard')]);
    const grades = [...new Set([...caps.map((c) => c.gradeSought), ...apps.map((x) => x.gradeSought), ...classes.map((c) => c.standard)])].sort((x, y) => String(x).localeCompare(String(y), undefined, { numeric: true }));
    res.json({ year, grades: grades.map((g) => { const cap = caps.find((c) => c.gradeSought === g); const mine = apps.filter((x) => x.gradeSought === g); const used = mine.filter((x) => x.seatReserved).length;
      return { grade: g, seats: cap ? cap.seats : null, used, available: cap ? Math.max(0, cap.seats - used) : null, waiting: mine.filter((x) => x.stage === 'Waitlisted').length, open: mine.filter((x) => A.OPEN.includes(x.stage)).length }; }) });
  } catch (e) { fail(res, e); }
};

exports.setCapacity = async (req, res) => {
  try {
    const sid = req.user.schoolId; const b = req.body || {}; const year = str(b.academicYear, 20) || yearNow(); const grade = str(b.gradeSought, 20);
    const seats = Number(b.seats);
    if (!grade) return res.status(400).json({ message: 'Choose the grade.' });
    if (!Number.isInteger(seats) || seats < 0 || seats > 2000) return res.status(400).json({ message: 'Seats must be a whole number from 0 to 2000.' });
    const held = await App.countDocuments({ schoolId: sid, academicYear: year, gradeSought: grade, seatReserved: true });
    if (seats < held) return res.status(422).json({ message: `${held} seats are already offered or taken in grade ${grade}. You cannot set fewer.` });
    await Capacity.updateOne({ schoolId: sid, academicYear: year, gradeSought: grade }, { $set: { seats } }, { upsert: true });
    await audit(req, { action: 'admissions.capacity', entityType: 'AdmissionCapacity', entityId: `${year}:${grade}`, schoolId: sid, detail: { year, grade, seats } });
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
};

exports.summary = async (req, res) => {
  try {
    const sid = req.user.schoolId; const today = new Date(); today.setHours(23, 59, 59, 999);
    const [apps, inq] = await Promise.all([App.find({ schoolId: sid }).select('stage nextFollowUpOn child gradeSought guardian'), Inquiry.find({ schoolId: sid, status: 'Open' }).select('contactName nextFollowUpOn phone')]);
    const stages = Object.fromEntries(A.STAGES.map((s) => [s, apps.filter((x) => x.stage === s).length]));
    const due = [...apps.filter((x) => A.OPEN.includes(x.stage) && x.nextFollowUpOn && new Date(x.nextFollowUpOn) <= today).map((x) => ({ kind: 'application', id: x._id, name: x.child.name, phone: x.guardian.phone, due: x.nextFollowUpOn })),
      ...inq.filter((x) => x.nextFollowUpOn && new Date(x.nextFollowUpOn) <= today).map((x) => ({ kind: 'inquiry', id: x._id, name: x.contactName, phone: x.phone, due: x.nextFollowUpOn }))].sort((x, y) => new Date(x.due) - new Date(y.due));
    res.json({ stages, openInquiries: inq.length, followUpsDue: due });
  } catch (e) { fail(res, e); }
};
