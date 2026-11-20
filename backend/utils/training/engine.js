// Rules for training courses (PRD E17) kept apart from the database so they can be tested alone: prices, coupons, instalments,
// course content checks, what a learner may open, the evidence a lesson needs and when a course counts as finished.
const crypto = require('crypto');
const R = require('../registrar/engine');

const DAY = 86400000;
const id = () => crypto.randomBytes(4).toString('hex');
const int = (n, d = 0) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? v : d; };
const txt = (v, n = 300) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const slugOf = (s) => txt(s, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const httpsUrl = (u) => { const s = txt(u, 500); if (!s) return ''; try { const x = new URL(s); return x.protocol === 'https:' ? x.toString() : null; } catch (e) { return null; } };

/* ───────── money ───────── */
// Whole currency units only. Tax is added on top of the price after the discount.
function priceOrder({ list, discount = 0, taxPercent = 0 }) {
  const l = Math.max(0, int(list)); const d = Math.min(l, Math.max(0, int(discount)));
  const net = l - d; const tax = Math.round((net * Math.max(0, Number(taxPercent) || 0)) / 100);
  return { list: l, discount: d, net, tax, total: net + tax };
}
// Is this code usable now, and what does it take off?
function couponCheck(c, { courseId, list, used = 0, now = new Date() }) {
  if (!c || !c.active) return { ok: false, reason: 'That code is not valid.' };
  if (c.validFrom && now < new Date(c.validFrom)) return { ok: false, reason: 'That code is not open yet.' };
  if (c.validTo && now > new Date(c.validTo)) return { ok: false, reason: 'That code has ended.' };
  if (c.maxUses > 0 && c.used >= c.maxUses) return { ok: false, reason: 'That code has been used up.' };
  if (c.oncePerLearner && used > 0) return { ok: false, reason: 'You have already used that code.' };
  if ((c.courseIds || []).length && courseId && !c.courseIds.map(String).includes(String(courseId))) return { ok: false, reason: 'That code does not apply to this course.' };
  const off = c.kind === 'percent' ? Math.round((list * Math.min(100, c.value)) / 100) : int(c.value);
  return { ok: true, discount: Math.min(list, Math.max(0, off)) };
}
// Split a total into instalments, the remainder going on the first. The first is due on `start`, then every `every` days.
function split(total, n, start = new Date(), every = 30) {
  const k = Math.min(12, Math.max(1, int(n, 1))); const t = Math.max(0, int(total)); const base = Math.floor(t / k); const rest = t - base * k;
  return Array.from({ length: k }, (_, i) => ({ no: i + 1, amount: base + (i === 0 ? rest : 0), due: new Date(new Date(start).getTime() + i * every * DAY), status: 'due' }));
}

/* ───────── course content ───────── */
const KINDS = ['reading', 'video', 'check', 'assignment'];
const LIMITS = { modules: 30, lessonsPerModule: 60, lessons: 300 };

// Clean what an author typed. Returns the cleaned modules and the problems that stop saving.
function normalizeContent(input, previous = []) {
  const errors = []; const modules = []; const seen = new Set(); let total = 0;
  const old = new Set(); for (const m of previous || []) for (const l of m.lessons || []) old.add(l.id);
  const src = Array.isArray(input) ? input.slice(0, LIMITS.modules) : [];
  src.forEach((m, mi) => {
    const mod = { id: /^[a-f0-9]{8}$/.test(m?.id || '') ? m.id : id(), title: txt(m?.title, 120), requiresPrevious: !!m?.requiresPrevious, lessons: [] };
    if (!mod.title) errors.push(`Module ${mi + 1} needs a title.`);
    (Array.isArray(m?.lessons) ? m.lessons.slice(0, LIMITS.lessonsPerModule) : []).forEach((l, li) => {
      total += 1; const where = `Module ${mi + 1}, lesson ${li + 1}`;
      const kind = KINDS.includes(l?.kind) ? l.kind : 'reading';
      const les = { id: /^[a-f0-9]{8}$/.test(l?.id || '') ? l.id : id(), title: txt(l?.title, 140), kind, body: txt(l?.body, 12000), minutes: Math.min(600, Math.max(0, int(l?.minutes))), required: l?.required !== false, preview: !!l?.preview, dripDays: Math.min(365, Math.max(0, int(l?.dripDays))), requires: /^[a-f0-9]{8}$/.test(l?.requires || '') ? l.requires : '' };
      if (!les.title) errors.push(`${where} needs a title.`);
      if (seen.has(les.id)) les.id = id(); seen.add(les.id);
      if (kind === 'video') { const u = httpsUrl(l?.url); if (u === null) errors.push(`${where}: the video address must start with https://`); else les.url = u; }
      if (kind === 'reading' || kind === 'video') les.url = les.url || '';
      if (kind === 'check' || (Array.isArray(l?.check) && l.check.length)) {
        les.check = (Array.isArray(l.check) ? l.check.slice(0, 10) : []).map((q, qi) => {
          const opts = (Array.isArray(q?.options) ? q.options : []).slice(0, 6).map((o) => txt(o, 160)).filter(Boolean);
          const correct = [...new Set((Array.isArray(q?.correct) ? q.correct : []).map((x) => int(x, -1)).filter((x) => x >= 0 && x < opts.length))];
          if (!txt(q?.q)) errors.push(`${where}, question ${qi + 1} needs wording.`);
          if (opts.length < 2) errors.push(`${where}, question ${qi + 1} needs at least two answers.`);
          if (!correct.length) errors.push(`${where}, question ${qi + 1} needs a correct answer marked.`);
          return { id: /^[a-f0-9]{8}$/.test(q?.id || '') ? q.id : id(), q: txt(q?.q, 300), options: opts, correct, why: txt(q?.why, 300) };
        });
        les.passPercent = Math.min(100, Math.max(1, int(l?.passPercent, 70)));
        if (kind === 'check' && !les.check.length) errors.push(`${where}: a check needs at least one question.`);
      }
      if (kind === 'assignment') {
        les.rubric = (Array.isArray(l?.rubric) ? l.rubric.slice(0, 8) : []).map((c) => ({ id: /^[a-f0-9]{8}$/.test(c?.id || '') ? c.id : id(), title: txt(c?.title, 120), max: Math.min(100, Math.max(1, int(c?.max, 10))) }));
        if (!les.rubric.length) errors.push(`${where}: an assignment needs at least one rubric criterion.`);
        if (les.rubric.some((c) => !c.title)) errors.push(`${where}: every rubric criterion needs a name.`);
        les.passPercent = Math.min(100, Math.max(1, int(l?.passPercent, 60))); les.maxAttempts = Math.min(10, Math.max(1, int(l?.maxAttempts, 3)));
      }
      mod.lessons.push(les);
    });
    modules.push(mod);
  });
  if (total > LIMITS.lessons) errors.push(`A course can have at most ${LIMITS.lessons} lessons.`);
  // a lesson may only wait for one that comes before it
  const order = new Map(); modules.forEach((m) => m.lessons.forEach((l) => order.set(l.id, order.size)));
  modules.forEach((m) => m.lessons.forEach((l) => { if (l.requires) { if (l.requires === l.id || !order.has(l.requires) || order.get(l.requires) > order.get(l.id)) { errors.push(`"${l.title || 'A lesson'}" waits for a lesson that does not come before it.`); l.requires = ''; } } }));
  return { modules, errors, lessons: total };
}
const flat = (modules) => { const out = []; (modules || []).forEach((m, mi) => (m.lessons || []).forEach((l, li) => out.push({ ...l, moduleId: m.id, moduleTitle: m.title, mi, li, requiresPrevious: m.requiresPrevious }))); return out; };

// What an author must fix (block) or should look at (warn) before a course can go live.
function courseChecks(course, instructors = [], draft = course.draft) {
  const out = []; const mods = draft?.modules || []; const ls = flat(mods);
  const block = (text) => out.push({ level: 'block', text }); const warn = (text) => out.push({ level: 'warn', text });
  if (!txt(course.title)) block('The course needs a title.');
  if (!txt(course.summary, 400)) block('Write a short summary so buyers know what the course is.');
  if (!ls.length) block('Add at least one lesson.');
  if (ls.length && !ls.some((l) => l.required)) block('At least one lesson must be required, or nobody can finish.');
  if (!(course.landing?.outcomes || []).filter(Boolean).length) block('List what a learner will be able to do at the end (outcomes).');
  if (!(course.landing?.requirements || []).filter(Boolean).length) warn('Say what a learner needs before starting (requirements), even if the answer is "nothing".');
  if (!instructors.length) block('Choose at least one instructor.');
  else if (!instructors.some((i) => i.status === 'verified')) block('No instructor on this course has been verified yet.');
  if (Number(course.price) > 0 && !ls.some((l) => l.preview)) warn('A paid course should show buyers a free preview lesson.');
  if (Number(course.price) > 0 && Number(course.installments?.max) > 1 && !['first', 'full'].includes(course.installments?.accessAfter)) block('Say when access starts for instalments (after the first or after all).');
  if ((course.skills || []).some((s) => !txt(s.code) || !txt(s.name))) block('Every skill needs a code and a name.');
  const empty = mods.filter((m) => !(m.lessons || []).length); if (empty.length) warn(`${empty.length} module(s) have no lessons.`);
  const long = ls.filter((l) => l.kind === 'video' && !l.minutes); if (long.length) warn(`${long.length} video lesson(s) have no length, so no watching time can be checked.`);
  return out;
}

/* ───────── what a learner may open ───────── */
// A learner's view of a lesson never carries the answers.
function learnerLesson(l, full = false) {
  const o = { id: l.id, title: l.title, kind: l.kind, minutes: l.minutes, required: l.required, preview: l.preview, dripDays: l.dripDays, requires: l.requires, moduleId: l.moduleId };
  if (full) {
    o.body = l.body; o.url = l.url || '';
    if (l.check) o.check = l.check.map((q) => ({ id: q.id, q: q.q, options: q.options, multi: q.correct.length > 1 })); o.passPercent = l.passPercent;
    if (l.rubric) { o.rubric = l.rubric; o.maxAttempts = l.maxAttempts; }
  }
  return o;
}
const entState = (e, now = new Date()) => (!e ? 'none' : e.status === 'revoked' ? 'revoked' : e.expiresAt && now > new Date(e.expiresAt) ? 'expired' : e.status === 'paused' ? 'paused' : 'active');
const needsEvidence = (l) => (l.kind === 'video' || l.kind === 'reading') && l.minutes > 0;
// seconds of real attention required: most of the stated length, never more than half an hour
const activeNeeded = (l) => (needsEvidence(l) ? Math.min(1800, Math.ceil(l.minutes * 60 * 0.6)) : 0);

// Can this learner open this lesson now? `done` is the set of finished lesson ids, `ent` the entitlement, `unlocked` whether the learning path allows this course yet.
function lessonAccess({ lessons, lesson, done, ent, preview, now = new Date(), startedAt, unlocked = true }) {
  if (lesson.preview) return { ok: true, why: '' };
  const st = entState(ent, now);
  if (st === 'none') return { ok: false, code: 'locked', why: 'Buy or join this course to open this lesson.' };
  if (st === 'revoked') return { ok: false, code: 'revoked', why: 'Access to this course has ended.' };
  if (st === 'expired') return { ok: false, code: 'expired', why: 'Your access to this course has ended.' };
  if (st === 'paused') return { ok: false, code: 'paused', why: 'Access is paused because an instalment is overdue. Pay it and ask the office to confirm.' };
  if (!unlocked) return { ok: false, code: 'path', why: 'Finish the previous course in this learning path first.' };
  const idx = lessons.findIndex((l) => l.id === lesson.id);
  if (lesson.dripDays > 0) { const opens = new Date(new Date(startedAt || ent.grantedAt).getTime() + lesson.dripDays * DAY); if (now < opens) return { ok: false, code: 'drip', why: `Opens on ${opens.toISOString().slice(0, 10)}.`, opensAt: opens }; }
  if (lesson.requires && !done.has(lesson.requires)) { const need = lessons.find((l) => l.id === lesson.requires); return { ok: false, code: 'requires', why: `Finish "${need?.title || 'the earlier lesson'}" first.` }; }
  if (lesson.requiresPrevious && lesson.li === 0 && lesson.mi > 0) {
    const before = lessons.filter((l) => l.mi === lesson.mi - 1 && l.required && !done.has(l.id));
    if (before.length) return { ok: false, code: 'module', why: 'Finish the required lessons of the previous module first.' };
  }
  return { ok: true, why: '', idx };
}

// Add the seconds a page was really in front of the learner. A report counts only when the tab is visible, the last one was recent and they are not sent faster than every 5 seconds.
function beat(rec, nowMs, visible) {
  const r = { active: Number(rec?.active) || 0, lastBeat: Number(rec?.lastBeat) || 0, passed: !!rec?.passed, best: rec?.best ?? null, done: !!rec?.done, doneAt: rec?.doneAt || null, pos: rec?.pos || 0 };
  if (!visible) { r.lastBeat = 0; return { rec: r, added: 0 }; }
  const gap = r.lastBeat ? (nowMs - r.lastBeat) / 1000 : 0;
  if (r.lastBeat && gap < 5) return { rec: r, added: 0, tooFast: true };
  const added = r.lastBeat && gap <= 40 ? Math.min(20, Math.round(gap)) : 0;
  r.active += added; r.lastBeat = nowMs;
  return { rec: r, added };
}
// Mark a check: every question must have exactly the right set of answers.
function gradeCheck(lesson, answers) {
  const qs = lesson.check || []; const wrong = []; let right = 0;
  qs.forEach((q) => { const given = [...new Set((answers?.[q.id] || []).map((x) => int(x, -1)))].sort(); const want = [...q.correct].sort(); if (given.length === want.length && given.every((v, i) => v === want[i])) right += 1; else wrong.push(q.id); });
  const percent = qs.length ? Math.round((right * 100) / qs.length) : 100;
  return { percent, passed: percent >= (lesson.passPercent || 70), wrong, right, total: qs.length };
}
// Can this lesson be marked done? Returns what is still missing.
function lessonMissing(lesson, rec, submissionAccepted) {
  const miss = []; const r = rec || {};
  if (needsEvidence(lesson) && (r.active || 0) < activeNeeded(lesson)) miss.push(`Spend about ${Math.max(1, Math.ceil((activeNeeded(lesson) - (r.active || 0)) / 60))} more minute(s) on this lesson with the page in view.`);
  if (lesson.check && lesson.check.length && !r.passed) miss.push(`Pass the questions (${lesson.passPercent || 70}% needed).`);
  if (lesson.kind === 'assignment' && !submissionAccepted) miss.push('Hand in your work and have it accepted.');
  return miss;
}
function rubricPercent(lesson, scores) {
  const rub = lesson.rubric || []; if (!rub.length) return { ok: false, reason: 'This lesson has no rubric.' };
  let got = 0; let max = 0;
  for (const c of rub) { const s = Number(scores?.[c.id]); if (!Number.isFinite(s) || s < 0 || s > c.max) return { ok: false, reason: `Give "${c.title}" a score from 0 to ${c.max}.` }; got += s; max += c.max; }
  return { ok: true, percent: Math.round((got * 100) / max), got, max };
}

// Is the whole course finished and ready for an instructor to review?
function readiness({ lessons, progress, accepted, cohort, userId }) {
  const missing = []; const req = lessons.filter((l) => l.required);
  for (const l of req) { const done = !!progress?.[l.id]?.done; if (!done) missing.push(`${l.title || 'A lesson'}`); }
  const percent = req.length ? Math.round((req.filter((l) => progress?.[l.id]?.done).length * 100) / req.length) : 0;
  let attendance = null;
  if (cohort && cohort.mode === 'led' && cohort.minAttendance > 0) {
    const held = (cohort.sessions || []).filter((s) => s.marked); const came = held.filter((s) => ['present', 'late'].includes((s.attendance || {})[userId])).length;
    attendance = held.length ? Math.round((came * 100) / held.length) : 0;
    if (!held.length || attendance < cohort.minAttendance) missing.push(`Attend at least ${cohort.minAttendance}% of live sessions (now ${attendance}%)`);
  }
  return { ready: !missing.length && req.length > 0, missing, percent, attendance };
}

// Refunds: inside the course's window anyone can ask; later only with an administrator's written reason.
const refundOpen = (order, days, now = new Date()) => { const paid = (order.installments || []).filter((i) => i.status === 'paid' && i.paidAt).map((i) => new Date(i.paidAt).getTime()); if (!paid.length) return false; return now.getTime() <= Math.min(...paid) + days * DAY; };

const maskName = (n) => String(n || '').trim().split(/\s+/).map((w, i) => (i === 0 ? w : `${w.charAt(0)}.`)).join(' ');
const keyOf = (prefix) => `${prefix}${crypto.randomBytes(24).toString('hex')}`;

module.exports = { DAY, id, int, txt, slugOf, httpsUrl, priceOrder, couponCheck, split, KINDS, LIMITS, normalizeContent, flat, courseChecks, learnerLesson, entState, needsEvidence, activeNeeded, lessonAccess, beat, gradeCheck, lessonMissing, rubricPercent, readiness, refundOpen, maskName, keyOf, sha: R.sha, sign: R.sign, canon: R.canon };
