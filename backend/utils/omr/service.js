// Shared helpers for the paper-exam (OMR) endpoints (PRD E14).
const S = require('../assess/service');
const Form = require('../../models/OmrForm');
const Key = require('../../models/OmrKey');
const Scan = require('../../models/OmrScan');
const Student = require('../../models/Student');
const E = require('./engine');
const { buildLayout } = require('./layout');

const { oid, sid, who, bad, wrap } = S;
const layoutOf = (f) => buildLayout({ questions: f.questions, choices: f.choices, idDigits: f.idDigits });
const canSeeForm = (scope, f) => scope.admin || S.covers(scope, f.classId, f.subjectId);

async function loadForm(req, id) {
  const schoolId = sid(req); const f = await Form.findOne({ _id: oid(id), schoolId }); if (!f) return { err: [404, 'Answer sheet not found.'] };
  const scope = await S.scopeOf(req); if (!canSeeForm(scope, f)) return { err: [404, 'Answer sheet not found.'] }; return { f, scope };
}
const currentKey = (f) => (f.keyVersion ? Key.findOne({ formId: f._id, version: f.keyVersion }) : null);

// What each sheet in a batch scores on the given key. Only sheets a person (or a clear reading) has settled count.
async function gradeBatch(batch, form, key, { save = true } = {}) {
  const scans = await Scan.find({ schoolId: batch.schoolId, batchId: batch._id, status: { $in: ['Ready', 'Graded'] } }).select('-image -rect -fills');
  const rows = []; const changed = [];
  for (const s of scans) {
    const finals = (s.answers || []).map((a) => E.finalOf(a)); const g = E.gradeAnswers(finals.map((x) => x ?? ''), { answers: key.answers, weights: key.weights }, form);
    const before = s.grade?.raw; const next = { ...g, keyVersion: key.version }; rows.push({ id: s._id, raw: g.raw, marks: g.marks });
    if (before !== undefined && before !== null && before !== g.raw) changed.push({ id: s._id, studentId: s.candidate?.studentId, before, after: g.raw });
    if (save) await Scan.updateOne({ _id: s._id }, { $set: { grade: next, status: 'Graded' } });
  }
  return { rows, changed, hash: E.resultsHash(rows), count: scans.length };
}

// Two sheets for the same candidate must never both be counted: both are held until one is rejected or reassigned.
async function refreshDuplicates(schoolId, batchId) {
  const scans = await Scan.find({ schoolId, batchId, status: { $in: ['Needs review', 'Ready', 'Graded'] } }).select('-image -rect -fills'); const by = new Map();
  for (const s of scans) { const k = s.candidate?.studentId ? String(s.candidate.studentId) : null; if (k) (by.get(k) || by.set(k, []).get(k)).push(s); }
  const dup = new Set([...by.values()].filter((l) => l.length > 1).flat().map((s) => String(s._id))); let touched = 0;
  for (const s of scans) {
    const has = (s.flags || []).some((f) => f.code === 'duplicate'); const want = dup.has(String(s._id)); if (has === want) continue;
    const flags = (s.flags || []).filter((f) => f.code !== 'duplicate').map((f) => (f.toObject ? f.toObject() : f)); if (want) flags.push({ code: 'duplicate', level: 'block', msg: 'Another sheet in this batch has the same candidate. Reject the extra one or correct the candidate.', resolved: false });
    const next = { ...s.toObject(), flags }; const status = E.statusOf(next) === 'Needs review' ? 'Needs review' : (s.grade && s.grade.keyVersion ? 'Graded' : 'Ready');
    await Scan.updateOne({ _id: s._id }, { $set: { flags, status } }); touched++;
  }
  return touched;
}

async function namesOf(schoolId, ids) { const rows = await Student.find({ schoolId, _id: { $in: ids.filter(Boolean) } }).select('name admissionNumber rollNumber'); return new Map(rows.map((s) => [String(s._id), s])); }

module.exports = { oid, sid, who, bad, wrap, layoutOf, canSeeForm, loadForm, currentKey, gradeBatch, refreshDuplicates, namesOf, S };
