// Offline roll call (PRD E08, CAP-0373): a queued save carries a client-made `mutationId`. The first arrival is applied and
// its answer remembered; any replay after reconnecting gets that same answer instead of writing twice.
// A save that fails is forgotten, so a corrected retry with the same id is allowed.
const AttendanceMutation = require('../models/AttendanceMutation');

module.exports = async function replayGuard(req, res, next) {
  const id = String(req.body?.mutationId || req.get('X-Mutation-Id') || '').trim();
  if (!id) return next();
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(id)) return res.status(400).json({ message: 'mutationId must be 8-80 letters, numbers or - _ . :' });
  const schoolId = req.user.schoolId;
  try {
    await AttendanceMutation.create({ schoolId, mutationId: id, userId: req.user.userId, route: `${req.method} ${req.baseUrl}${req.path}`, state: 'Running' });
  } catch (e) {
    if (e.code !== 11000) return res.status(500).json({ message: e.message });
    const prior = await AttendanceMutation.findOne({ schoolId, mutationId: id });
    if (prior && prior.state === 'Done') {
      res.set('X-Replayed', 'true');
      return res.status(prior.status || 200).json({ ...(prior.body || {}), replayed: true });
    }
    return res.status(409).json({ message: 'This save is already being processed. Wait a moment and check the register.' });
  }
  const json = res.json.bind(res);
  res.json = (body) => {
    const ok = res.statusCode < 400;
    const done = ok
      ? AttendanceMutation.updateOne({ schoolId, mutationId: id }, { $set: { state: 'Done', status: res.statusCode, body } })
      : AttendanceMutation.deleteOne({ schoolId, mutationId: id });
    // remember the answer before the client can possibly replay it
    Promise.resolve(done).catch(() => {}).then(() => json(body));
    return res;
  };
  next();
};
