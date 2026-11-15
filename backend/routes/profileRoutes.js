// Self-service profile and documents for every role + admin view of documents.
const express = require('express');
const router = express.Router();
const mongoose = require('../lib/pgdoc');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

const MODELS = { admin: 'User', teacher: 'Teacher', student: 'Student', parent: 'Parent' };
const modelOf = (role) => (MODELS[role] ? require(`../models/${MODELS[role]}`) : null);
const trustedUrl = (u) => typeof u === 'string' && (/^\/api\/files\/stored\/[a-f0-9]{24}\/[a-f0-9]+$/.test(u) || /^https:\/\/res\.cloudinary\.com\//.test(u) || /^https?:\/\/[^/]+\/api\/files\/stored\/[a-f0-9]{24}\/[a-f0-9]+$/.test(u));
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const CATEGORIES = ['ID card', 'Birth certificate', 'Certificate', 'Marksheet', 'Medical', 'Address proof', 'CV / Resume', 'Photo', 'Other'];

const shape = (doc, role) => {
  const o = doc.toObject ? doc.toObject() : doc;
  return {
    role,
    _id: o._id,
    name: o.name,
    email: o.email,
    phone: o.phone || '',
    avatar: o.avatar || o.photo || '',
    canEditName: role === 'admin' || role === 'parent',
    extra: { about: '', address: '', city: '', emergencyName: '', emergencyPhone: '', ...(o.profileExtra || {}) },
    documents: (o.uploadedDocuments || []).slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)),
    info: {
      rollNumber: o.rollNumber, admissionNumber: o.admissionNumber, employeeId: o.employeeId,
      relationship: o.relationship, designation: o.designation,
    },
  };
};

router.get('/me', async (req, res) => {
  try {
    const Model = modelOf(req.user.role);
    if (!Model) return res.status(400).json({ message: 'Not available for this account' });
    const doc = await Model.findById(req.user.userId).select('-password -refreshTokens');
    if (!doc) return res.status(404).json({ message: 'Profile not found' });
    res.json({ profile: shape(doc, req.user.role), categories: CATEGORIES });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put('/me', async (req, res) => {
  try {
    const Model = modelOf(req.user.role);
    if (!Model) return res.status(400).json({ message: 'Not available for this account' });
    const b = req.body || {};
    const set = {};
    if (b.phone !== undefined) set.phone = clip(b.phone, 25);
    if ((req.user.role === 'admin' || req.user.role === 'parent') && b.name !== undefined) {
      if (!clip(b.name, 80)) return res.status(400).json({ message: 'Name cannot be empty' });
      set.name = clip(b.name, 80);
    }
    if (b.avatar !== undefined) {
      if (b.avatar && !trustedUrl(b.avatar)) return res.status(400).json({ message: 'Invalid photo' });
      set.avatar = b.avatar || null;
      if (req.user.role === 'student') set.photo = b.avatar || '';
    }
    const x = b.extra || {};
    [['about', 500], ['address', 200], ['city', 60], ['emergencyName', 80], ['emergencyPhone', 25]].forEach(([k, n]) => {
      if (x[k] !== undefined) set[`profileExtra.${k}`] = clip(x[k], n);
    });
    const doc = await Model.findByIdAndUpdate(req.user.userId, { $set: set }, { new: true, runValidators: false }).select('-password -refreshTokens');
    res.json({ message: 'Profile saved', profile: shape(doc, req.user.role) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post('/me/documents', async (req, res) => {
  try {
    const Model = modelOf(req.user.role);
    const { title, category = 'Other', url, fileName = '' } = req.body || {};
    if (!clip(title, 80)) return res.status(400).json({ message: 'Give the document a name' });
    if (!trustedUrl(url)) return res.status(400).json({ message: 'Please upload the file first' });
    const doc = await Model.findById(req.user.userId).select('uploadedDocuments');
    if ((doc.uploadedDocuments || []).length >= 25) return res.status(400).json({ message: 'You can keep up to 25 documents. Delete an old one first.' });
    doc.uploadedDocuments.push({ title: clip(title, 80), category: CATEGORIES.includes(category) ? category : 'Other', url, fileName: clip(fileName, 120) });
    await doc.save({ validateBeforeSave: false });
    res.status(201).json({ message: 'Document saved', documents: shape(doc, req.user.role).documents });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete('/me/documents/:docId', async (req, res) => {
  try {
    const Model = modelOf(req.user.role);
    const doc = await Model.findById(req.user.userId).select('uploadedDocuments');
    doc.uploadedDocuments = (doc.uploadedDocuments || []).filter((d) => String(d._id) !== req.params.docId);
    await doc.save({ validateBeforeSave: false });
    res.json({ message: 'Document deleted', documents: shape(doc, req.user.role).documents });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── admin: look at people's documents ── */
router.get('/people', authorize('admin'), async (req, res) => {
  try {
    const q = clip(req.query.q, 40);
    if (q.length < 2) return res.json({ people: [] });
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const out = [];
    for (const role of ['student', 'teacher', 'parent']) {
      const rows = await modelOf(role).find({ schoolId: req.user.schoolId, name: rx }).select('name uploadedDocuments').limit(8);
      rows.forEach((r) => out.push({ role, _id: r._id, name: r.name, documents: (r.uploadedDocuments || []).length }));
    }
    res.json({ people: out });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get('/documents/:role/:id', authorize('admin'), async (req, res) => {
  try {
    const Model = ['student', 'teacher', 'parent'].includes(req.params.role) ? modelOf(req.params.role) : null;
    if (!Model || !mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid request' });
    const doc = await Model.findOne({ _id: req.params.id, schoolId: req.user.schoolId }).select('name uploadedDocuments profileExtra phone');
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json({ name: doc.name, phone: doc.phone, extra: doc.profileExtra, documents: doc.uploadedDocuments || [] });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
