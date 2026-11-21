// Shared pieces of the writing assistant (PRD E31): the school's rules, who may do what, the trail, numbering and the checks on the text.
const crypto = require('crypto');
const S = require('../analytics/service');
const AiPolicy = require('../../models/AiPolicy');
const AiAudit = require('../../models/AiAudit');
const DocCounter = require('../../models/DocCounter');
const Screen = require('./screen');
const { LIMITS } = require('./catalog');
const { can } = require('../permissions');

const { Fail, oid, sid } = S;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const OFF = { enabled: false, purposes: {}, provider: 'builtin', external: null, limits: { ...LIMITS } };

async function policyDoc(schoolId) {
  let d = await AiPolicy.findOne({ schoolId });
  if (!d) { try { d = await AiPolicy.create({ schoolId, version: 0, active: null, pending: null, history: [], glossary: [] }); } catch (e) { if (e.code !== 11000) throw e; d = await AiPolicy.findOne({ schoolId }); } }
  return d;
}
const activeOf = (d) => (d && d.active ? { ...OFF, ...d.active, limits: { ...LIMITS, ...(d.active.limits || {}) } } : { ...OFF });

// who is acting: admin | lead (a teacher with the ai.review grant) | teacher
async function levelOf(user) {
  if (!user) return null;
  if (user.role === 'admin') return 'admin';
  if (user.role === 'teacher') return (await can(user, 'ai.review')).allowed ? 'lead' : 'teacher';
  return null;
}
const staff = async (req, res, next) => { try { const lv = await levelOf(req.user); if (!lv) return S.bad(res, 403, 'The writing assistant is for staff.'); req.aiLevel = lv; return next(); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const adminOnly = async (req, res, next) => { try { if (req.user.role !== 'admin') return S.bad(res, 403, 'Only administrators can do this.'); return next(); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };
const reviewer = async (req, res, next) => { try { const lv = await levelOf(req.user); if (lv !== 'admin' && lv !== 'lead') return S.bad(res, 403, 'You cannot review assistant work.'); req.aiLevel = lv; return next(); } catch (e) { return res.status(500).json({ message: 'Something went wrong. Please try again.' }); } };

// the trail never throws: a problem writing it must not undo what was done
async function audit(ctx, f) {
  try { await AiAudit.create({ schoolId: ctx.schoolId, actorId: ctx.actor?.id, actorName: ctx.actor?.name || '', actorRole: ctx.role || ctx.actor?.role || '', ...f }); } catch (e) { console.warn('ai audit failed:', e.message); }
}
async function nextNo(schoolId) {
  const year = new Date().getUTCFullYear(); const key = `ai-${year}`;
  let row = await DocCounter.findOne({ schoolId, key });
  if (!row) { try { row = await DocCounter.create({ schoolId, key, n: 0 }); } catch (e) { if (e.code !== 11000) throw e; row = await DocCounter.findOne({ schoolId, key }); } }
  for (let i = 0; i < 10; i++) { const r = await DocCounter.updateOne({ _id: row._id, n: row.n }, { $set: { n: row.n + 1 } }); if (r.matchedCount) return `AI-${year}-${String(row.n + 1).padStart(5, '0')}`; row = await DocCounter.findOne({ _id: row._id }); }
  throw new Fail(503, 'Please try again in a moment.');
}

// what each piece of text in a draft is called, for the checks
function pieces(kind, content) {
  if (kind === 'question_set') return (content.questions || []).map((q) => ({ at: q.id, text: [q.stem, ...(q.options || []).map((o) => o.text), ...(q.accepted || [])].join(' \n ') }));
  return (content.sections || []).map((s) => ({ at: s.id, text: `${s.heading || ''} \n ${s.text || ''}` }));
}
const fid = (code, at) => sha(`${code}|${at}`).slice(0, 10);
// structural flags stay; the ones that come from reading the text are made again every time
async function flagsFor(schoolId, kind, content, keep = []) {
  const out = (keep || []).filter((f) => f.structural).map((f) => ({ ...f }));
  for (const p of pieces(kind, content)) for (const f of await Screen.outputFlags(schoolId, p.text)) out.push({ id: fid(f.code, p.at), code: f.code, severity: f.severity, message: f.message, at: p.at });
  const seen = new Set(); return out.filter((f) => { const k = `${f.code}|${f.at}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
const structural = (f) => ({ ...f, id: fid(f.code, f.at || ''), structural: true });
const hashOf = (draft) => sha(JSON.stringify({ t: draft.title, c: draft.content }));

// numbers: this hour, this day
async function usage(schoolId, actorId) {
  const now = Date.now(); const hour = new Date(now - 3600000); const day = new Date(now - 86400000);
  const [h, d] = await Promise.all([
    AiAudit.countDocuments({ schoolId, actorId, action: 'generate', at: { $gte: hour } }),
    AiAudit.countDocuments({ schoolId, action: 'generate', at: { $gte: day } }),
  ]);
  return { hour: h, day: d };
}
const maskKey = (e) => (e ? { baseUrl: e.baseUrl, model: e.model, keyHint: e.keyHint, termsConfirmedBy: e.termsConfirmedBy, termsConfirmedAt: e.termsConfirmedAt } : null);
const policyView = (a) => ({ enabled: !!a.enabled, purposes: a.purposes || {}, provider: a.provider, external: maskKey(a.external), limits: a.limits, trainingUse: 'excluded' });

module.exports = { S, Fail, oid, sid, sha, OFF, policyDoc, activeOf, levelOf, staff, adminOnly, reviewer, audit, nextNo, pieces, flagsFor, structural, fid, hashOf, usage, maskKey, policyView, Screen };
