// Platform operations (owner only): backup history, restore drills and health alerts (PRD E33).
const mongoose = require('../lib/pgdoc');
const BackupRun = require('../models/BackupRun');
const RestoreDrill = require('../models/RestoreDrill');
const SuperAdmin = require('../models/SuperAdmin');
const { audit } = require('../utils/audit');
const drills = require('../utils/restoreDrill');

const fail = (res, e) => res.status(e.status || 500).json({ message: e.message });
const paging = (q, def = 25) => {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 100);
  const p = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, skip: (p - 1) * limit, page: p };
};
const validId = (id) => mongoose.isValidObjectId(id);

exports.health = async (req, res) => { try { res.json(await drills.opsHealth()); } catch (e) { fail(res, e); } };

exports.backupRuns = async (req, res) => {
  try {
    const { limit, skip, page } = paging(req.query);
    const filter = {};
    if (['Succeeded', 'Failed', 'Running'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.schoolId && validId(req.query.schoolId)) filter.schoolId = new mongoose.Types.ObjectId(req.query.schoolId);
    const [rows, total] = await Promise.all([BackupRun.find(filter).sort({ startedAt: -1 }).skip(skip).limit(limit), BackupRun.countDocuments(filter)]);
    res.json({ runs: rows, pagination: { total, pages: Math.ceil(total / limit), currentPage: page } });
  } catch (e) { fail(res, e); }
};

exports.listDrills = async (req, res) => {
  try {
    const { limit, skip, page } = paging(req.query, 15);
    const filter = {};
    if (req.query.schoolId && validId(req.query.schoolId)) filter.schoolId = new mongoose.Types.ObjectId(req.query.schoolId);
    if (['Passed', 'Failed'].includes(req.query.status)) filter.status = req.query.status;
    const [rows, total] = await Promise.all([RestoreDrill.find(filter).sort({ startedAt: -1 }).skip(skip).limit(limit), RestoreDrill.countDocuments(filter)]);
    res.json({ drills: rows, pagination: { total, pages: Math.ceil(total / limit), currentPage: page } });
  } catch (e) { fail(res, e); }
};

exports.runDrill = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid school id' });
    if (req.body && req.body.backupId && !validId(req.body.backupId)) return res.status(400).json({ message: 'Invalid backup id' });
    const me = await SuperAdmin.findById(req.user.userId).select('name');
    req.actorName = me ? me.name : 'Owner';
    const d = await drills.runDrill(req.params.id, { backupId: req.body && req.body.backupId, actor: { userId: req.user.userId, name: req.actorName } });
    await audit(req, { action: 'restore-drill.run', entityType: 'RestoreDrill', entityId: d._id, schoolId: d.schoolId, detail: { status: d.status, backupId: d.backupId, rows: d.rowsRestored } });
    res.status(201).json({ message: d.status === 'Passed' ? 'Restore drill passed' : 'Restore drill FAILED', drill: d });
  } catch (e) { fail(res, e); }
};
