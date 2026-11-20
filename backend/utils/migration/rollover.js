// Year rollover (PRD E29, section 5.15). Freeze results, check readiness, plan every learner's move as a dry run, review, commit in batches
// from a journal that remembers where each learner was, and take it all back if needed. Classes stay the same records from year to year,
// so a move is a change of class, not a copy of the learner.
const crypto = require('crypto');
const mongoose = require('../../lib/pgdoc');
const Student = require('../../models/Student');
const Class = require('../../models/Class');
const School = require('../../models/School');
const Teacher = require('../../models/Teacher');
const RolloverRun = require('../../models/RolloverRun');

const EPOCH = () => new Date(0);
const sha = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const stdKey = (s) => String(s || '').toLowerCase().replace(/\b(grade|class|std|standard)\b/g, '').replace(/[^a-z0-9]/g, '');
const divKey = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const clean = (v, n = 300) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const oid = (x) => new mongoose.Types.ObjectId(String(x));
const OPEN = ['Draft', 'Reviewed', 'Committing'];

// "2025-2026", "2025-26", "2025/26" -> { start, end, label }
function parseYear(s) {
  const m = String(s || '').trim().match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/); if (!m) return null;
  const start = +m[1]; const end = m[2].length === 2 ? Math.floor(start / 100) * 100 + +m[2] : +m[2]; if (end !== start + 1) return null;
  return { start, end, label: `${start}-${end}` };
}
const nextYearLabel = (s) => { const y = parseYear(s); return y ? `${y.end}-${y.end + 1}` : ''; };

// Order standards: pre-school stages first, then by the number in the name, then by name.
function standardRank(s) {
  const t = String(s || '').toLowerCase().trim();
  if (/play|pre.?(k|school)/.test(t)) return -4; if (/nurs/.test(t)) return -3; if (/lkg|junior|kg ?1|kg-?i$/.test(t)) return -2; if (/ukg|senior|kg ?2|prep|kg|kinder/.test(t)) return -1;
  const n = t.match(/\d+/); if (n) return parseInt(n[0], 10); return 1000;
}
const defaultLadder = (classes) => { const seen = new Map(); for (const c of classes) { const k = stdKey(c.standard); if (!seen.has(k)) seen.set(k, c.standard); } return [...seen.values()].sort((a, b) => standardRank(a) - standardRank(b) || String(a).localeCompare(String(b), undefined, { numeric: true })); };

async function freezeOf(schoolId) {
  const run = await RolloverRun.findOne({ schoolId, status: { $in: ['Draft', 'Reviewed', 'Committing', 'Committed'] }, 'frozen.at': { $ne: null } }).sort({ 'frozen.at': -1 }).select('frozen toYear status');
  return run ? { at: new Date(run.frozen.at), runId: String(run._id), toYear: run.toYear } : null;
}
// Results of exams made on or before the freeze are not changed. Exams made afterwards (the new year) are free.
async function frozenExam(schoolId, exam) {
  const f = await freezeOf(schoolId); if (!f) return null;
  const made = exam && (exam.createdAt || exam.date); if (made && new Date(made) > f.at) return null; return f;
}
const FROZEN_MESSAGE = (f) => `Results are frozen for the ${f.toYear} year-end rollover. Ask an administrator to cancel or roll back the rollover first.`;

async function readiness(run, ctx) {
  const schoolId = run.schoolId; const blockers = []; const warnings = []; const info = {};
  const to = parseYear(run.toYear); const from = parseYear(ctx.school.academicYear);
  if (!to) blockers.push({ code: 'year-format', message: 'The new year should look like 2026-2027.' });
  else if (from && to.start !== from.start + 1) blockers.push({ code: 'year-order', message: `The new year must follow the current year (${from.label}), so ${nextYearLabel(from.label)}.` });
  const hist = (ctx.school.academicYearHistory || []).some((h) => h.year === (to && to.label) && !h.rolledBack); if (hist) blockers.push({ code: 'year-done', message: `The ${to.label} year was already opened by an earlier rollover.` });
  const other = await RolloverRun.findOne({ schoolId, _id: { $ne: run._id }, status: { $in: OPEN } }).select('toYear status'); if (other) blockers.push({ code: 'other-open', message: `Another rollover to ${other.toYear} is still ${other.status.toLowerCase()}. Finish or cancel it first.` });
  if (!ctx.classes.length) blockers.push({ code: 'no-classes', message: 'There are no classes to roll over.' });
  // marks still being processed
  try { const OmrBatch = require('../../models/OmrBatch'); const open = await OmrBatch.find({ schoolId, status: { $in: ['Scanning', 'Graded', 'Moderation'] } }).select('title name status'); info.unresolvedBatches = open.length; if (open.length) blockers.push({ code: 'unresolved-grades', message: `${open.length} scanned marking batch(es) are not published yet.`, items: open.slice(0, 10).map((b) => ({ id: String(b._id), label: b.title || b.name || 'Batch', status: b.status })) }); } catch (e) { /* OMR not in use */ }
  // duplicate enrolments
  const act = ctx.students; const byAdm = new Map(); const byNd = new Map();
  for (const s of act) { if (s.admissionNumber) { const k = String(s.admissionNumber).trim().toLowerCase(); byAdm.set(k, [...(byAdm.get(k) || []), s]); } if (s.dateOfBirth) { const k = `${String(s.name).toLowerCase().replace(/[^a-z0-9]/g, '')}|${new Date(s.dateOfBirth).toISOString().slice(0, 10)}`; byNd.set(k, [...(byNd.get(k) || []), s]); } }
  const ack = new Set((run.config?.acknowledgedDuplicates || []).map(String)); const dups = [];
  for (const [k, list] of byAdm) if (list.length > 1) dups.push({ key: `adm:${k}`, why: `Admission number ${list[0].admissionNumber} is used by ${list.length} learners`, students: list.map((s) => ({ id: String(s._id), name: s.name })) });
  for (const [k, list] of byNd) if (list.length > 1) dups.push({ key: `nd:${k}`, why: `${list[0].name} appears ${list.length} times with the same date of birth`, students: list.map((s) => ({ id: String(s._id), name: s.name })) });
  const open = dups.filter((d) => !ack.has(d.key)); info.duplicates = dups.length; info.duplicatesAcknowledged = dups.length - open.length;
  if (open.length) blockers.push({ code: 'duplicate-enrolments', message: `${open.length} duplicate enrolment(s) must be resolved or marked as checked.`, items: open.slice(0, 20) });
  // teachers
  const teachers = new Map((await Teacher.find({ schoolId }).select('isActive name')).map((t) => [String(t._id), t]));
  const noTeacher = ctx.classes.filter((c) => !c.classTeacherId || !teachers.get(String(c.classTeacherId)) || teachers.get(String(c.classTeacherId)).isActive === false);
  if (noTeacher.length) warnings.push({ code: 'class-teachers', message: `${noTeacher.length} class(es) have no active class teacher: ${noTeacher.slice(0, 8).map((c) => `${c.standard}-${c.division}`).join(', ')}.` });
  const noClass = ctx.students.filter((s) => !s.classId); if (noClass.length) warnings.push({ code: 'no-class', message: `${noClass.length} learner(s) are not in a class and are left out.` });
  // freeze
  if (!run.frozen?.at) blockers.push({ code: 'not-frozen', message: 'Results are not frozen yet. Freeze them so the year\'s marks cannot change during the rollover.' });
  // dues carried forward
  try { const FI = require('../../models/FeeInvoice'); const inv = await FI.find({ schoolId, status: { $in: ['Open', 'PartiallyPaid'] } }).select('studentId total amount paid balance'); info.openInvoices = inv.length; info.outstanding = inv.reduce((a, i) => a + Math.max(0, (i.balance != null ? i.balance : (i.total || i.amount || 0) - (i.paid || 0))), 0); info.studentsWithDues = new Set(inv.map((i) => String(i.studentId))).size; } catch (e) { /* ignore */ }
  info.timetablesKept = await require('../../models/Timetable').countDocuments({ schoolId }).catch(() => 0);
  return { blockers, warnings, info, duplicates: dups, checkedAt: new Date() };
}

async function buildPlan(run, ctx) {
  const cfg = run.config || {}; const ladder = (cfg.ladder && cfg.ladder.length ? cfg.ladder : defaultLadder(ctx.classes)).map((x) => String(x));
  const rank = new Map(ladder.map((x, i) => [stdKey(x), i])); const byKey = new Map(); const byStd = new Map();
  for (const c of ctx.classes) { byKey.set(`${stdKey(c.standard)}|${divKey(c.division)}`, c); const k = stdKey(c.standard); byStd.set(k, [...(byStd.get(k) || []), c]); }
  const newClasses = new Map(); const students = []; const warnings = [];
  const dues = new Set(); if (cfg.holdOnDues) { try { const FI = require('../../models/FeeInvoice'); for (const i of await FI.find({ schoolId: run.schoolId, status: { $in: ['Open', 'PartiallyPaid'] } }).select('studentId')) dues.add(String(i.studentId)); } catch (e) { /* ignore */ } }
  const classOf = new Map(ctx.classes.map((c) => [String(c._id), c]));
  const sorted = [...ctx.students].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  for (const s of sorted) {
    const c = classOf.get(String(s.classId)); if (!c) continue;
    const from = { classId: String(s.classId), division: s.division || c.division, academicYear: s.academicYear || '', studentStatus: s.studentStatus || 'Active', isActive: s.isActive !== false };
    const entry = { id: String(s._id), name: s.name, admissionNumber: s.admissionNumber || '', fromLabel: `${c.standard}-${c.division}`, from, action: 'promote', reason: '' };
    const idx = rank.get(stdKey(c.standard));
    const ov = (cfg.overrides || {})[entry.id];
    if (idx === undefined) { entry.action = 'skip'; entry.reason = `${c.standard} is not on the class ladder`; }
    else if (ov && ['promote', 'repeat', 'graduate'].includes(ov.action)) { entry.action = ov.action; entry.reason = clean(ov.reason, 200) || 'Set by an administrator'; entry.manual = true; }
    else if (dues.has(entry.id)) { entry.action = 'repeat'; entry.reason = 'Held back for unpaid dues (rollover setting)'; }
    else if (idx === ladder.length - 1) { entry.action = 'graduate'; entry.reason = 'Top of the class ladder'; }
    if (entry.action === 'promote' && idx === ladder.length - 1) { entry.action = 'graduate'; entry.reason = entry.reason || 'Top of the class ladder'; }
    if (entry.action === 'promote') {
      const nextStd = ladder[idx + 1]; const nk = stdKey(nextStd); const same = byKey.get(`${nk}|${divKey(c.division)}`); const any = (byStd.get(nk) || []).sort((a, b) => String(a.division).localeCompare(String(b.division)))[0];
      const t = same || any;
      if (t) { entry.toClassId = String(t._id); entry.toLabel = `${t.standard}-${t.division}`; entry.to = { classId: entry.toClassId, division: t.division, academicYear: run.toYear, studentStatus: 'Active', isActive: true }; }
      else { const key = `${nk}|${divKey(c.division)}`; newClasses.set(key, { key, standard: nextStd, division: c.division, capacity: c.capacity || 40, room: '', fromClassId: String(c._id) }); entry.toKey = key; entry.toLabel = `${nextStd}-${c.division} (new)`; entry.to = { classId: null, division: c.division, academicYear: run.toYear, studentStatus: 'Active', isActive: true }; }
    } else if (entry.action === 'repeat') { entry.toClassId = entry.from.classId; entry.toLabel = entry.fromLabel; entry.to = { classId: entry.from.classId, division: from.division, academicYear: run.toYear, studentStatus: 'Active', isActive: true }; }
    else if (entry.action === 'graduate') { entry.toLabel = 'Graduated'; entry.to = { classId: entry.from.classId, division: from.division, academicYear: from.academicYear, studentStatus: 'Graduated', isActive: false }; }
    students.push(entry);
  }
  // seats: how many end up in each class compared with its capacity
  const seats = new Map(); for (const e of students) if (e.action !== 'graduate' && e.action !== 'skip') { const k = e.toClassId || `new:${e.toKey}`; seats.set(k, (seats.get(k) || 0) + 1); }
  const over = []; for (const [k, n] of seats) { if (k.startsWith('new:')) { const nc = newClasses.get(k.slice(4)); if (nc && n > nc.capacity) over.push(`${nc.standard}-${nc.division} (${n} of ${nc.capacity})`); } else { const c = classOf.get(k); if (c && c.capacity && n > c.capacity) over.push(`${c.standard}-${c.division} (${n} of ${c.capacity})`); } }
  if (over.length) warnings.push({ code: 'capacity', message: `Over capacity after the move: ${over.slice(0, 8).join(', ')}.` });
  if (!ladder.length) warnings.push({ code: 'ladder', message: 'The class ladder is empty.' });
  const counts = { learners: students.length, promote: 0, repeat: 0, graduate: 0, skip: 0, manual: 0, newClasses: newClasses.size };
  for (const e of students) { counts[e.action]++; if (e.manual) counts.manual++; }
  const byClass = {}; for (const e of students) { const k = `${e.fromLabel} → ${e.toLabel}`; byClass[k] = (byClass[k] || 0) + 1; }
  const classRows = Object.entries(byClass).map(([route, n]) => ({ route, n })).sort((a, b) => a.route.localeCompare(b.route, undefined, { numeric: true }));
  const plan = { ladder, counts, students, newClasses: [...newClasses.values()], routes: classRows, warnings, classYears: Object.fromEntries(ctx.classes.map((c) => [String(c._id), c.academicYear || ''])) };
  const planHash = sha({ y: run.toYear, s: students.map((e) => [e.id, e.action, e.from.classId, e.toClassId || e.toKey || '', e.from.academicYear]), n: plan.newClasses.map((c) => c.key) });
  return { plan, planHash };
}

async function load(schoolId) {
  const [school, classes, students] = await Promise.all([School.findById(schoolId), Class.find({ schoolId }), Student.find({ schoolId, isActive: { $ne: false } }).select('name admissionNumber dateOfBirth classId division academicYear studentStatus isActive')]);
  return { school, classes, students: students.filter((s) => !s.studentStatus || s.studentStatus === 'Active') };
}

async function previewRun(run) {
  const ctx = await load(run.schoolId); const { plan, planHash } = await buildPlan(run, ctx); const r = await readiness(run, ctx);
  const set = { plan, planHash, readiness: r, review: null, status: run.status === 'Reviewed' ? 'Draft' : run.status };
  await RolloverRun.updateOne({ _id: run._id }, { $set: set });
  return { plan, planHash, readiness: r };
}

async function recount(schoolId, ids) { for (const id of ids) { const n = await Student.countDocuments({ schoolId, classId: oid(id), isActive: { $ne: false } }); await Class.updateOne({ _id: id, schoolId }, { $set: { studentCount: n } }); } }

async function commit({ run, user, batch = 200 }) {
  const schoolId = run.schoolId; const now = new Date();
  if (run.status === 'Committed') return { status: 200, body: { done: true, alreadyCommitted: true } };
  if (!['Reviewed', 'Committing'].includes(run.status)) return { status: 409, body: { message: run.status === 'Draft' ? 'Review the dry run before committing.' : `This rollover is ${run.status.toLowerCase()}.` } };
  if (run.status === 'Reviewed') {
    // the data may have moved since the dry run
    const ctx = await load(schoolId); const { planHash } = await buildPlan(run, ctx); const r = await readiness(run, ctx);
    if (planHash !== run.review?.planHash || planHash !== run.planHash) return { status: 409, body: { message: 'Learners or classes changed since the dry run. Run the preview again and review it.', stale: true } };
    if (r.blockers.length) return { status: 422, body: { message: 'The rollover is blocked.', blockers: r.blockers } };
  }
  const got = await RolloverRun.updateOne({ _id: run._id, schoolId, status: { $in: ['Reviewed', 'Committing'] }, lockUntil: { $lt: now } }, { $set: { status: 'Committing', lockUntil: new Date(now.getTime() + 90000) } });
  if (!got.matchedCount) return { status: 423, body: { message: 'This rollover is being processed. Wait a moment and try again.' } };
  const r = await RolloverRun.findById(run._id); const plan = r.plan; const school = await School.findById(schoolId);
  try {
    const journal = { ...(r.journal || {}) }; const progress = { ...(r.progress || {}) };
    if (!journal.started) {
      const before = {}; for (const c of await Class.find({ schoolId }).select('academicYear')) before[String(c._id)] = c.academicYear || '';
      Object.assign(journal, { started: now, schoolBefore: { academicYear: school.academicYear || '' }, classYearsBefore: before, createdClassIds: [], classKeyToId: {} });
      const existing = await Class.find({ schoolId }).select('standard division');
      for (const nc of plan.newClasses) { const f = existing.find((c) => stdKey(c.standard) === stdKey(nc.standard) && divKey(c.division) === divKey(nc.division)); let id; if (f) id = String(f._id); else { const c = await Class.create({ schoolId, standard: nc.standard, division: nc.division, capacity: nc.capacity || 40, room: nc.room || undefined, academicYear: r.toYear, rolloverRunId: String(r._id) }); id = String(c._id); journal.createdClassIds.push(id); } journal.classKeyToId[nc.key] = id; }
      progress.cursor = 0; progress.total = plan.students.length;
    }
    const slice = plan.students.slice(progress.cursor, progress.cursor + Math.max(1, Math.min(500, parseInt(batch, 10) || 200)));
    // learners going to the same place are written together
    const groups = new Map();
    for (const e of slice) { if (e.action === 'skip') continue; const cid = e.toClassId || journal.classKeyToId[e.toKey] || null; const k = `${e.action}|${cid}|${e.to.division}`; const g = groups.get(k) || { ids: [], set: null }; g.ids.push(oid(e.id)); g.set = { ...(cid ? { classId: oid(cid) } : {}), division: e.to.division, academicYear: e.to.academicYear, studentStatus: e.to.studentStatus, isActive: e.to.isActive }; groups.set(k, g); }
    for (const g of groups.values()) await Student.updateMany({ schoolId, _id: { $in: g.ids } }, { $set: g.set });
    progress.cursor += slice.length; progress.done = progress.cursor;
    const finished = progress.cursor >= plan.students.length;
    const set = { journal, progress, lockUntil: EPOCH() };
    if (finished) {
      const ids = new Set(); for (const e of plan.students) { ids.add(e.from.classId); if (e.toClassId) ids.add(e.toClassId); } for (const id of Object.values(journal.classKeyToId)) ids.add(id); await recount(schoolId, [...ids]);
      await Class.updateMany({ schoolId }, { $set: { academicYear: r.toYear } });
      const entry = { year: school.academicYear || r.fromYear || '', closedAt: now, closedBy: user.name, runId: String(r._id), counts: plan.counts };
      await School.updateOne({ _id: schoolId }, { $set: { academicYear: r.toYear }, $push: { academicYearHistory: entry } });
      Object.assign(set, { status: 'Committed', committedAt: now, committedByName: user.name });
    }
    await RolloverRun.updateOne({ _id: run._id }, { $set: set });
    return { status: 200, body: { done: finished, processed: slice.length, cursor: progress.cursor, total: plan.students.length, counts: plan.counts } };
  } catch (e) { await RolloverRun.updateOne({ _id: run._id }, { $set: { lockUntil: EPOCH() } }); throw e; }
}

async function rollback({ run, user, reason }) {
  const schoolId = run.schoolId; const now = new Date();
  if (!['Committed', 'Committing'].includes(run.status)) return { status: 409, message: 'Only a rollover that has started can be rolled back.' };
  const got = await RolloverRun.updateOne({ _id: run._id, schoolId, status: { $in: ['Committed', 'Committing'] }, lockUntil: { $lt: now } }, { $set: { lockUntil: new Date(now.getTime() + 120000) } });
  if (!got.matchedCount) return { status: 423, message: 'This rollover is being processed. Try again in a moment.' };
  const plan = run.plan; const j = run.journal || {}; const out = { restored: 0, conflicts: [], classesRemoved: 0, classesKept: [] };
  const groups = new Map(); const cur = new Map((await Student.find({ schoolId, _id: { $in: plan.students.map((e) => oid(e.id)) } }).select('classId academicYear studentStatus isActive')).map((s) => [String(s._id), s]));
  const upto = Math.min(run.progress?.cursor || 0, plan.students.length);
  for (const e of plan.students.slice(0, upto)) {
    if (e.action === 'skip') continue; const s = cur.get(e.id); if (!s) continue;
    const cid = e.toClassId || (j.classKeyToId && j.classKeyToId[e.toKey]) || e.from.classId;
    // only learners still where the rollover put them are moved back
    const there = String(s.classId) === String(cid) && (s.academicYear || '') === e.to.academicYear && (s.studentStatus || 'Active') === e.to.studentStatus && (s.isActive !== false) === e.to.isActive;
    if (!there) { out.conflicts.push({ id: e.id, name: e.name, reason: 'Changed after the rollover, so it was left as it is' }); continue; }
    const k = `${e.from.classId}|${e.from.division}|${e.from.academicYear}|${e.from.studentStatus}|${e.from.isActive}`; const g = groups.get(k) || { ids: [], set: { classId: oid(e.from.classId), division: e.from.division, academicYear: e.from.academicYear, studentStatus: e.from.studentStatus, isActive: e.from.isActive } }; g.ids.push(oid(e.id)); groups.set(k, g); out.restored++;
  }
  for (const g of groups.values()) await Student.updateMany({ schoolId, _id: { $in: g.ids } }, { $set: g.set });
  for (const id of j.createdClassIds || []) { const n = await Student.countDocuments({ schoolId, classId: oid(id) }); if (!n) { await Class.deleteOne({ _id: id, schoolId }); out.classesRemoved++; } else out.classesKept.push(id); }
  for (const [id, y] of Object.entries(j.classYearsBefore || {})) await Class.updateOne({ _id: id, schoolId }, { $set: { academicYear: y } });
  if (run.status === 'Committed') { const sc = await School.findById(schoolId); const hist = (sc.academicYearHistory || []).filter((h) => h.runId !== String(run._id)); await School.updateOne({ _id: schoolId }, { $set: { academicYear: (j.schoolBefore && j.schoolBefore.academicYear) || '', academicYearHistory: hist } }); }
  const ids = new Set(plan.students.map((e) => e.from.classId)); for (const e of plan.students) if (e.toClassId) ids.add(e.toClassId); await recount(schoolId, [...ids].filter((id) => !((j.createdClassIds || []).includes(id) && !out.classesKept.includes(id))));
  await RolloverRun.updateOne({ _id: run._id }, { $set: { status: 'RolledBack', rolledBackAt: now, rolledBackByName: user.name, rollbackReason: clean(reason, 300), rollbackResult: out, lockUntil: EPOCH() } });
  return { status: 200, result: out };
}

module.exports = { parseYear, nextYearLabel, defaultLadder, standardRank, freezeOf, frozenExam, FROZEN_MESSAGE, readiness, buildPlan, previewRun, load, commit, rollback, OPEN };
