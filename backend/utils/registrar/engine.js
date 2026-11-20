// The deterministic parts of the registrar (PRD E16): grade scale, repeat policy, averages, prerequisites and the degree audit.
// Nothing here touches the database, so the same inputs always give the same answer and every rule can be tested on its own.
const crypto = require('crypto');

const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const secret = () => process.env.JWT_SECRET || 'aulensia-dev-secret';
const hmac = (x) => crypto.createHmac('sha256', secret()).update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const r2 = (n) => Math.round(n * 100) / 100;

// Starting values only: each school sets its own scale and policy. Letters not on the scale are refused.
const DEFAULT_SCALE = [
  { grade: 'A', points: 4, pass: true }, { grade: 'A-', points: 3.7, pass: true }, { grade: 'B+', points: 3.3, pass: true }, { grade: 'B', points: 3, pass: true },
  { grade: 'B-', points: 2.7, pass: true }, { grade: 'C+', points: 2.3, pass: true }, { grade: 'C', points: 2, pass: true }, { grade: 'C-', points: 1.7, pass: true },
  { grade: 'D+', points: 1.3, pass: true }, { grade: 'D', points: 1, pass: true }, { grade: 'F', points: 0, pass: false },
];
// Marks that carry no points. W = withdrew, I = incomplete, AU = audit, P / NP = pass / no pass (credit but no points).
const SPECIAL = { W: { pass: false, credit: false, attempt: false }, I: { pass: false, credit: false, attempt: false }, AU: { pass: false, credit: false, attempt: false }, P: { pass: true, credit: true, attempt: true }, NP: { pass: false, credit: false, attempt: true } };
const DEFAULT_POLICY = {
  repeat: 'latest',            // latest | best | average: which attempts count toward the average when a course is taken again
  repeatBelow: 'C',            // a course already passed with this grade or better cannot be taken again without a signed exception
  maxAttempts: 3,              // graded attempts at one course before a signed exception is needed
  maxCreditsPerTerm: 21,
  appealDays: 14,              // days after a term's grades are published during which a student can appeal
  minPassGrade: 'D',
};

const normScale = (s) => (Array.isArray(s) && s.length ? s : DEFAULT_SCALE).map((x) => ({ grade: String(x.grade), points: Number(x.points), pass: x.pass !== false && Number(x.points) > 0 || x.pass === true }));
const scaleMap = (scale) => new Map(normScale(scale).map((x) => [x.grade, x]));
const isGrade = (scale, g) => scaleMap(scale).has(g) || Object.prototype.hasOwnProperty.call(SPECIAL, g);
const info = (scale, g) => { const m = scaleMap(scale).get(g); if (m) return { points: m.points, pass: m.pass, gpa: true, credit: m.pass, attempt: true }; const s = SPECIAL[g]; return s ? { points: 0, pass: s.pass, gpa: false, credit: s.credit, attempt: s.attempt } : null; };
const pointsOf = (scale, g) => (scaleMap(scale).get(g) || { points: -1 }).points;

// final grades of one course in the order the terms were taken
const finals = (enr) => enr.filter((e) => e.gradeState === 'final' && e.grade && ['completed', 'withdrawn'].includes(e.status)).sort((a, b) => (a.termStart || '').localeCompare(b.termStart || '') || String(a._id).localeCompare(String(b._id)));

// Which attempts of one course count, and whether the course is passed (credit earned once).
function effective(attempts, scale, policy = DEFAULT_POLICY) {
  const list = finals(attempts); const graded = list.filter((e) => info(scale, e.grade)?.attempt);
  if (!graded.length) return { counted: [], passed: false, best: null, attempts: 0, credit: false };
  const withPts = graded.filter((e) => info(scale, e.grade).gpa);
  let counted = [];
  if (withPts.length) {
    if (policy.repeat === 'best') { const top = withPts.reduce((a, b) => (pointsOf(scale, b.grade) > pointsOf(scale, a.grade) ? b : a)); counted = [top]; }
    else if (policy.repeat === 'average') counted = withPts;
    else counted = [withPts[withPts.length - 1]];
  }
  const last = graded[graded.length - 1];
  const anyPass = graded.some((e) => info(scale, e.grade).pass);
  const passed = policy.repeat === 'latest' ? !!info(scale, last.grade).pass : anyPass;
  const best = graded.reduce((a, b) => (!a || pointsOf(scale, b.grade) > pointsOf(scale, a.grade) || (info(scale, b.grade).pass && !info(scale, a.grade).pass) ? b : a), null);
  return { counted, passed, best, last, attempts: graded.length, credit: passed };
}

const byCourse = (enrolls) => { const m = new Map(); for (const e of enrolls) { const k = e.courseCode; if (!m.has(k)) m.set(k, []); m.get(k).push(e); } return m; };

// Credit-weighted average over the attempts that count, plus credits earned (each course once).
function gpaOf(enrolls, scale, policy = DEFAULT_POLICY) {
  let pts = 0; let cr = 0; let earned = 0; const flags = new Map();
  for (const [code, list] of byCourse(enrolls)) {
    const eff = effective(list, scale, policy); const credits = list[0].credits || 0;
    const ids = new Set(eff.counted.map((e) => String(e._id)));
    for (const e of finals(list)) flags.set(String(e._id), { counts: ids.has(String(e._id)) });
    for (const e of eff.counted) { pts += pointsOf(scale, e.grade) * (e.credits || credits); cr += e.credits || credits; }
    if (eff.credit) earned += credits;
  }
  return { gpa: cr ? r2(pts / cr) : 0, creditsInAverage: cr, earned, points: r2(pts), flags };
}

// Average of one term on its own: the attempts of that term that still count after repeats.
function termGpa(enrolls, termId, scale, policy = DEFAULT_POLICY) {
  const all = gpaOf(enrolls, scale, policy); let pts = 0; let cr = 0; let earned = 0;
  for (const e of finals(enrolls).filter((x) => String(x.termId) === String(termId))) {
    const inf = info(scale, e.grade); if (inf?.credit && all.flags.get(String(e._id))?.counts !== false) earned += e.credits || 0;
    if (inf?.gpa && all.flags.get(String(e._id))?.counts) { pts += inf.points * (e.credits || 0); cr += e.credits || 0; }
  }
  return { gpa: cr ? r2(pts / cr) : 0, credits: cr, earned };
}

// Has the student met each prerequisite of this course? Returns the ones still missing.
function prereqCheck(course, enrolls, scale, policy, { concurrent = [], waived = false } = {}) {
  if (waived) return { ok: true, missing: [], waived: true };
  const by = byCourse(enrolls); const missing = [];
  for (const p of course.prerequisites || []) {
    const eff = by.has(p.code) ? effective(by.get(p.code), scale, policy) : null;
    const need = pointsOf(scale, p.minGrade || 'D');
    const got = eff && eff.passed && eff.best ? (info(scale, eff.best.grade).gpa ? pointsOf(scale, eff.best.grade) >= need : true) : false;
    if (!got) missing.push({ code: p.code, minGrade: p.minGrade || 'D', have: eff?.best?.grade || '' });
  }
  for (const c of course.corequisites || []) {
    const eff = by.has(c.code) ? effective(by.get(c.code), scale, policy) : null;
    if (!(eff && eff.passed) && !concurrent.includes(c.code)) missing.push({ code: c.code, minGrade: '', corequisite: true, have: '' });
  }
  return { ok: missing.length === 0, missing, waived: false };
}

// May this course be taken again? Returns a reason when not.
function repeatCheck(code, enrolls, scale, policy, { extraAttempt = false } = {}) {
  const list = (byCourse(enrolls).get(code) || []); if (!list.length) return { ok: true, attemptNo: 1 };
  const eff = effective(list, scale, policy); if (!eff.attempts) return { ok: true, attemptNo: 1 };
  const next = eff.attempts + 1;
  if (eff.passed && eff.best && info(scale, eff.best.grade).gpa && pointsOf(scale, eff.best.grade) >= pointsOf(scale, policy.repeatBelow)) return extraAttempt ? { ok: true, attemptNo: next, usedException: true } : { ok: false, reason: `Already passed with ${eff.best.grade}. Repeating a course at ${policy.repeatBelow} or better needs a signed exception.`, kind: 'repeat' };
  if (eff.attempts >= policy.maxAttempts) return extraAttempt ? { ok: true, attemptNo: next, usedException: true } : { ok: false, reason: `${eff.attempts} graded attempts already. Another attempt needs a signed exception.`, kind: 'attempts' };
  return { ok: true, attemptNo: next };
}

// The degree audit: compare one student's record with one catalogue year of one programme.
function audit({ version, catalog, enrolls, exceptions = [], scale, policy = DEFAULT_POLICY }) {
  const approved = exceptions.filter((x) => x.status === 'approved' || x.status === 'used');
  const subs = new Map(approved.filter((x) => x.kind === 'substitution').map((x) => [x.courseCode, x.substituteCode]));
  const waivers = new Set(approved.filter((x) => x.kind === 'requirement_waiver').map((x) => x.groupKey));
  const by = byCourse(enrolls); const minPts = pointsOf(scale, version.minGrade || 'D');
  const passed = new Map(); const taking = new Map(); const failedRecently = new Map();
  for (const [code, list] of by) {
    const eff = effective(list, scale, policy); const e0 = list[0];
    if (eff.passed && eff.best) { const gp = info(scale, eff.best.grade); passed.set(code, { code, title: e0.courseTitle || catalog.get(code)?.title || '', credits: e0.credits || 0, grade: eff.best.grade, points: gp.gpa ? gp.points : minPts, meets: !gp.gpa || gp.points >= minPts }); }
    else if (eff.attempts) failedRecently.set(code, eff.last.grade);
    const live = list.find((e) => e.status === 'enrolled'); if (live) taking.set(code, { code, title: e0.courseTitle || '', credits: e0.credits || 0 });
  }
  const claimed = new Set(); const groups = [];
  const item = (code, state, extra = {}) => ({ code, title: catalog.get(code)?.title || passed.get(code)?.title || '', credits: catalog.get(code)?.credits ?? passed.get(code)?.credits ?? 0, state, ...extra });
  const reqs = version.requirements || [];
  for (const g of reqs.filter((x) => x.rule === 'all')) {
    const items = []; let todo = 0; let prog = 0;
    for (const code of g.courses || []) {
      const p = passed.get(code); const sub = subs.get(code);
      if (p && p.meets) { claimed.add(code); items.push(item(code, 'done', { grade: p.grade })); }
      else if (sub && passed.get(sub)?.meets) { claimed.add(sub); items.push(item(sub, 'substituted', { grade: passed.get(sub).grade, replaces: code })); }
      else if (taking.has(code)) { prog += 1; items.push(item(code, 'inprogress')); }
      else { todo += 1; items.push(item(code, 'todo', failedRecently.has(code) ? { lastGrade: failedRecently.get(code) } : p ? { grade: p.grade, belowMinimum: true } : {})); }
    }
    const status = waivers.has(g.key) ? 'waived' : todo === 0 && prog === 0 ? 'met' : todo === 0 ? 'in_progress' : 'open';
    groups.push({ key: g.key, title: g.title, rule: 'all', status, items, remaining: items.filter((i) => i.state === 'todo').length });
  }
  for (const g of reqs.filter((x) => x.rule !== 'all')) {
    const fits = (code) => (g.courses || []).includes(code) || (g.prefixes || []).some((p) => code.startsWith(p));
    const cands = [...passed.values()].filter((p) => p.meets && !claimed.has(p.code) && fits(p.code)).sort((a, b) => b.points - a.points || a.code.localeCompare(b.code));
    const items = []; let credits = 0; let count = 0;
    const need = g.rule === 'credits' ? g.minCredits || 0 : g.minCount || 0;
    for (const c of cands) { if ((g.rule === 'credits' ? credits : count) >= need) break; claimed.add(c.code); credits += c.credits; count += 1; items.push(item(c.code, 'done', { grade: c.grade })); }
    const have = g.rule === 'credits' ? credits : count;
    let prog = 0; const progItems = [];
    for (const t of taking.values()) if (!claimed.has(t.code) && fits(t.code) && have + prog < need) { prog += g.rule === 'credits' ? t.credits : 1; progItems.push(item(t.code, 'inprogress')); }
    const left = Math.max(0, need - have);
    const status = waivers.has(g.key) ? 'waived' : left === 0 ? 'met' : left - prog <= 0 ? 'in_progress' : 'open';
    const options = left ? [...catalog.values()].filter((c) => c.status !== 'retired' && fits(c.code) && !passed.has(c.code) && !taking.has(c.code)).slice(0, 12).map((c) => ({ code: c.code, title: c.title, credits: c.credits })) : [];
    groups.push({ key: g.key, title: g.title, rule: g.rule, need, have, status, items: [...items, ...progItems], remaining: left, remainingUnit: g.rule === 'credits' ? 'credits' : 'courses', options });
  }
  const free = [...passed.values()].filter((p) => !claimed.has(p.code));
  const earned = [...passed.values()].reduce((s, p) => s + p.credits, 0);
  const avg = gpaOf(enrolls, scale, policy);
  const blockers = [];
  for (const g of groups) if (!['met', 'waived'].includes(g.status)) blockers.push(g.status === 'in_progress' ? `${g.title}: finish the courses in progress.` : `${g.title}: ${g.rule === 'all' ? `${g.remaining} required course${g.remaining === 1 ? '' : 's'} still to take` : `${g.remaining} more ${g.remainingUnit} needed`}.`);
  if (earned < (version.totalCredits || 0)) blockers.push(`Credits: ${earned} of ${version.totalCredits} earned.`);
  if (avg.gpa < (version.minCgpa || 0)) blockers.push(`Cumulative average ${avg.gpa} is below the ${version.minCgpa} the programme needs.`);
  const unknown = reqs.flatMap((g) => g.courses || []).filter((c) => !catalog.has(c));
  const body = { versionId: String(version._id || ''), catalogYear: version.catalogYear, groups: groups.map((g) => ({ k: g.key, s: g.status, i: g.items.map((i) => `${i.code}:${i.state}:${i.grade || ''}`) })), earned, cgpa: avg.gpa, free: free.map((f) => f.code).sort() };
  return {
    catalogYear: version.catalogYear, totalCredits: version.totalCredits, minCgpa: version.minCgpa, minGrade: version.minGrade,
    groups, electives: free.map((f) => ({ code: f.code, title: f.title, credits: f.credits, grade: f.grade })),
    credits: { earned, needed: version.totalCredits, inProgress: [...taking.values()].reduce((s, t) => s + t.credits, 0) },
    cgpa: avg.gpa, creditsInAverage: avg.creditsInAverage,
    eligible: blockers.length === 0, blockers, unknownCourses: [...new Set(unknown)],
    exceptionsApplied: approved.filter((x) => ['substitution', 'requirement_waiver'].includes(x.kind)).map((x) => ({ _id: x._id, kind: x.kind, courseCode: x.courseCode, substituteCode: x.substituteCode, groupKey: x.groupKey })),
    hash: sha(body),
  };
}

// the same input always yields the same text, so a signature made today can be checked later
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, c) => { a[c] = v[c]; return a; }, {}) : v));
const sign = (o) => hmac(canon(o));

module.exports = { DEFAULT_SCALE, DEFAULT_POLICY, SPECIAL, sha, hmac, sign, canon, r2, normScale, scaleMap, isGrade, info, pointsOf, effective, gpaOf, termGpa, prereqCheck, repeatCheck, audit, byCourse, finals };
