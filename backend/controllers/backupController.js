const mongoose = require('../lib/pgdoc');
const backup = require('../utils/backup');

const cooldown = new Map(); // `${schoolId}:${action}` -> timestamp (stops accidental repeated heavy exports)
const tooSoon = (schoolId, action, ms) => {
  const k = `${schoolId}:${action}`; const now = Date.now();
  if (cooldown.get(k) && now - cooldown.get(k) < ms) return true;
  cooldown.set(k, now); return false;
};
const fail = (res, e) => res.status(e.status || 500).json({ message: e.message });
const validId = (id) => mongoose.isValidObjectId(id);

// `schoolOf(req)` differs between the school admin (own school) and the platform owner (school in the URL)
const make = (schoolOf, who) => ({
  list: async (req, res) => {
    try {
      const schoolId = schoolOf(req);
      const backups = await backup.listSnapshots(schoolId);
      res.json({ backups, retention: { auto: 4, manual: 3 }, schedule: 'Every week, automatically' });
    } catch (e) { fail(res, e); }
  },
  create: async (req, res) => {
    try {
      const schoolId = schoolOf(req);
      if (tooSoon(schoolId, 'snapshot', 15000)) return res.status(429).json({ message: 'Please wait a few seconds before making another backup.' });
      let name = who(req);
      if (req.user.role === 'admin') { const u = await require('../models/User').findById(req.user.userId).select('name'); if (u && u.name) name = u.name; }
      const b = await backup.createSnapshot(schoolId, { kind: 'manual', createdBy: req.user.userId, createdByName: name });
      res.status(201).json({ message: 'Backup created', backup: { _id: b._id, kind: b.kind, createdAt: b.createdAt, size: b.size, counts: b.counts, createdByName: b.createdByName } });
    } catch (e) { fail(res, e); }
  },
  download: async (req, res) => {
    try {
      const schoolId = schoolOf(req);
      if (tooSoon(schoolId, 'download', 20000)) return res.status(429).json({ message: 'A backup download was just started. Please wait a moment and try again.' });
      const out = await backup.buildArchive(schoolId, { includeFiles: req.query.includeFiles === '1' || req.query.includeFiles === 'true' });
      console.log(`[backup] export school=${schoolId} by=${req.user.role}:${req.user.userId} bytes=${out.buffer.length}`);
      send(res, out);
    } catch (e) { fail(res, e); }
  },
  downloadSnapshot: async (req, res) => {
    try {
      const schoolId = schoolOf(req);
      if (!validId(req.params.bid)) return res.status(400).json({ message: 'Invalid backup id' });
      const out = await backup.archiveFromSnapshot(schoolId, req.params.bid);
      if (!out) return res.status(404).json({ message: 'Backup not found' });
      console.log(`[backup] snapshot download school=${schoolId} backup=${req.params.bid} by=${req.user.role}:${req.user.userId}`);
      send(res, out);
    } catch (e) { fail(res, e); }
  },
  remove: async (req, res) => {
    try {
      const Backup = require('../models/Backup');
      if (!validId(req.params.bid)) return res.status(400).json({ message: 'Invalid backup id' });
      const r = await Backup.deleteOne({ _id: req.params.bid, schoolId: schoolOf(req) });
      if (!r.deletedCount) return res.status(404).json({ message: 'Backup not found' });
      res.json({ message: 'Backup deleted' });
    } catch (e) { fail(res, e); }
  },
});

function send(res, out) {
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${out.filename}"`,
    'Content-Length': out.buffer.length,
    'Cache-Control': 'no-store',
    'Access-Control-Expose-Headers': 'X-Backup-Notes, Content-Disposition',
    'X-Backup-Notes': encodeURIComponent((out.notes || []).join(' ')),
  });
  res.end(out.buffer);
}

exports.forAdmin = make((req) => req.user.schoolId, (req) => req.user.name || req.user.email || 'School admin');
exports.forOwner = make((req) => {
  if (!validId(req.params.id)) throw Object.assign(new Error('Invalid school id'), { status: 400 });
  return req.params.id;
}, () => 'Platform owner');

// Back up every school that has not had a copy this week
exports.runWeekly = async (req, res) => {
  try { res.json(await backup.runWeekly({ force: req.body && req.body.force === true })); } catch (e) { fail(res, e); }
};
