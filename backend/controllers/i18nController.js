// A school's own wording and the list of labels that still have no Urdu (PRD E27 localization manager).
const T = require('../utils/theme/service');
const TranslationOverride = require('../models/TranslationOverride'); const MissingLabel = require('../models/MissingLabel');
const { audit } = require('../utils/audit');
const { oid, sid, bad, wrap } = T;

const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join('|');
const ARABIC = /[؀-ۿݐ-ݿ]/;
const cache = new Map();
const forget = (s) => cache.delete(String(s));
exports.overrides = wrap('overrides', async (req, res) => {
  const s = sid(req); const k = String(s); const hit = cache.get(k); let map = hit && Date.now() - hit.at < 15000 ? hit.map : null;
  if (!map) { map = {}; for (const r of await TranslationOverride.find({ schoolId: s, lang: 'ur' }).limit(3000)) map[r.source] = r.text; cache.set(k, { map, at: Date.now() }); }
  res.set('Cache-Control', 'private, no-cache'); res.json({ ur: map });
});
exports.manage = wrap('i18nManage', async (req, res) => {
  const s = sid(req); const q = String(req.query.q || '').trim().toLowerCase();
  const [over, missing, total] = await Promise.all([TranslationOverride.find({ schoolId: s, lang: 'ur' }).sort({ updatedAt: -1 }).limit(500), MissingLabel.find({ schoolId: s, lang: 'ur', status: 'Open' }).sort({ count: -1 }).limit(150), MissingLabel.countDocuments({ schoolId: s, lang: 'ur', status: 'Open' })]);
  const f = (x) => !q || x.source.toLowerCase().includes(q) || (x.text || '').toLowerCase().includes(q);
  res.json({ overrides: over.filter(f).map((o) => ({ _id: o._id, source: o.source, text: o.text, note: o.note, updatedByName: o.updatedByName, updatedAt: o.updatedAt })), missing: missing.filter(f).map((m) => ({ _id: m._id, source: m.source, count: m.count, lastSeenAt: m.lastSeenAt })), missingTotal: total });
});
exports.putOverride = wrap('putOverride', async (req, res) => {
  const s = sid(req); const b = req.body || {}; const source = String(b.source || '').trim(); const text = String(b.text || '').trim();
  if (source.length < 1 || source.length > 300) return bad(res, 422, 'Give the English label (up to 300 characters).'); if (text.length < 1 || text.length > 300) return bad(res, 422, 'Give the Urdu text (up to 300 characters).');
  if (/[<>]/.test(source + text)) return bad(res, 422, 'Plain text only: no < or >.'); if (ph(source) !== ph(text)) return bad(res, 422, 'Keep the same {placeholders} as the English label.');
  const warn = ARABIC.test(text) ? [] : ['This text has no Urdu letters. Is it the right language?'];
  await TranslationOverride.updateOne({ schoolId: s, lang: 'ur', source }, { $set: { text, note: String(b.note || '').slice(0, 200), updatedByName: req.actorName || '' } }, { upsert: true });
  await MissingLabel.deleteMany({ schoolId: s, lang: 'ur', source }); forget(s);
  await audit(req, { action: 'i18n.override', entityType: 'TranslationOverride', entityId: source.slice(0, 60), schoolId: s, detail: { source: source.slice(0, 120) } }); res.json({ ok: true, warnings: warn });
});
exports.deleteOverride = wrap('delOverride', async (req, res) => { const s = sid(req); const r = await TranslationOverride.deleteMany({ _id: oid(req.params.id), schoolId: s }); if (!r.deletedCount) return bad(res, 404, 'Not found.'); forget(s); res.json({ ok: true }); });

// Labels the screen could not translate. Counted by school, never by person. Looks like a label (short, no digits, not an address) or it is ignored.
const looksLikeLabel = (x) => typeof x === 'string' && x.length >= 2 && x.length <= 80 && /[A-Za-z]/.test(x) && !/\d/.test(x) && !/[@/\\<>=_]|https?:/i.test(x) && x.split(/\s+/).length <= 7 && !/^([A-Z][a-z]+\s+){1,3}[A-Z][a-z]+$/.test(x.trim()); // skips names like "Ayesha Khan"
const seen = new Map();
exports.reportMissing = wrap('reportMissing', async (req, res) => {
  const s = sid(req); const uid = String(req.user.userId); const now = Date.now(); const rec = seen.get(uid) || { at: now, n: 0 }; if (now - rec.at > 3600000) { rec.at = now; rec.n = 0; }
  const labels = [...new Set((Array.isArray(req.body && req.body.labels) ? req.body.labels : []).map((x) => String(x || '').trim()).filter(looksLikeLabel))].slice(0, 30);
  if (rec.n + labels.length > 120) return res.json({ ok: true, counted: 0 }); rec.n += labels.length; seen.set(uid, rec); if (seen.size > 5000) seen.clear();
  if (!labels.length) return res.json({ ok: true, counted: 0 });
  const have = new Set((await TranslationOverride.find({ schoolId: s, lang: 'ur', source: { $in: labels } })).map((o) => o.source)); const todo = labels.filter((l) => !have.has(l));
  if (todo.length && (await MissingLabel.countDocuments({ schoolId: s, lang: 'ur' })) >= 1500) return res.json({ ok: true, counted: 0 });
  for (const l of todo) await MissingLabel.updateOne({ schoolId: s, lang: 'ur', source: l }, { $inc: { count: 1 }, $set: { lastSeenAt: new Date() }, $setOnInsert: { status: 'Open' } }, { upsert: true });
  res.json({ ok: true, counted: todo.length });
});
exports.dismissMissing = wrap('dismissMissing', async (req, res) => { const r = await MissingLabel.updateOne({ _id: oid(req.params.id), schoolId: sid(req) }, { $set: { status: 'Dismissed' } }); if (!r.matchedCount) return bad(res, 404, 'Not found.'); res.json({ ok: true }); });
exports.looksLikeLabel = looksLikeLabel;
