// The deterministic parts of online assessment (PRD E13): seeded variants, marking, blueprint selection, statistics and signatures.
const crypto = require('crypto');

const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const secret = () => process.env.JWT_SECRET || 'aulensia-dev-secret';
const hmac = (x) => crypto.createHmac('sha256', secret()).update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const round025 = (n) => Math.round(n * 4) / 4;

// small seeded generator so the same seed always makes the same paper (CAP-0313)
function rng(seedHex) {
  let a = parseInt(String(seedHex).slice(0, 8), 16) >>> 0; const b = parseInt(String(seedHex).slice(8, 16), 16) >>> 0; a = (a ^ b) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, rand) { const a = [...arr]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const seedFor = ({ assessmentId, studentId, attemptNo, salt }) => sha(`${assessmentId}|${studentId}|${attemptNo}|${salt}`).slice(0, 32);

// items: map of ref -> item. Returns what the student saw, in a form that can be stored and rebuilt.
function buildVariant(assessment, itemsByRef, seed) {
  const rand = rng(seed); const s = assessment.settings || {}; const refs = assessment.items.map((i) => String(i.ref));
  const order = s.shuffleQuestions === false ? refs : shuffle(refs, rand);
  const v = { order, options: {}, right: {}, sequence: {} };
  for (const ref of order) {
    const it = itemsByRef.get(ref); if (!it) continue;
    if (['mcq', 'multi'].includes(it.kind)) v.options[ref] = s.shuffleOptions === false ? it.options.map((o) => o.id) : shuffle(it.options.map((o) => o.id), rand);
    else if (it.kind === 'tf') v.options[ref] = it.options.map((o) => o.id);                                  // true/false keep their order
    else if (it.kind === 'match') v.right[ref] = shuffle(it.pairs.map((p) => p.id), rand);                   // right-hand column shuffled
    else if (it.kind === 'order') { let o = shuffle(it.sequence.map((x) => x.id), rand); if (o.join() === it.sequence.map((x) => x.id).join() && o.length > 1) o = [...o.slice(1), o[0]]; v.sequence[ref] = o; }
  }
  return v;
}
const variantHash = (v) => sha(v).slice(0, 24);

// ── marking ──
const norm = (s, cs) => { let t = String(s ?? '').normalize('NFKC').replace(/[ً-ٰٟ]/g, '').replace(/\s+/g, ' ').trim(); if (!cs) t = t.toLowerCase(); return t.replace(/[.,;:!?]+$/, ''); };
function gradeItem(it, ans) {
  const max = it.marks; const blank = ans === undefined || ans === null || ans === '' || (Array.isArray(ans) && !ans.length) || (typeof ans === 'object' && !Array.isArray(ans) && !Object.keys(ans).length);
  if (it.kind === 'essay') return { auto: null, needsReview: !blank, blank };
  if (blank) return { auto: 0, needsReview: false, blank: true };
  let score = 0;
  if (it.kind === 'mcq' || it.kind === 'tf') { const ok = it.options.find((o) => o.correct); score = ok && String(ans) === String(ok.id) ? max : -(it.negativeMarks || 0); }
  else if (it.kind === 'multi') {
    const right = new Set(it.options.filter((o) => o.correct).map((o) => String(o.id))); const picked = new Set((Array.isArray(ans) ? ans : [ans]).map(String)); let good = 0; let wrong = 0;
    picked.forEach((p) => { if (right.has(p)) good += 1; else wrong += 1; });
    score = it.partialCredit ? max * Math.max(0, (good - wrong) / right.size) : (good === right.size && wrong === 0 ? max : 0);
  } else if (it.kind === 'short') {
    const hit = (it.accepted || []).some((a) => norm(a, it.caseSensitive) === norm(ans, it.caseSensitive)); return { auto: hit ? max : 0, needsReview: !hit, blank: false };
  } else if (it.kind === 'numeric') {
    const n = Number(String(ans).replace(/,/g, '').trim()); score = Number.isFinite(n) && Math.abs(n - it.numAnswer) <= (it.numTolerance || 0) + 1e-9 ? max : 0;
  } else if (it.kind === 'match') {
    const a = ans && typeof ans === 'object' ? ans : {}; const good = it.pairs.filter((p) => String(a[p.id]) === String(p.id)).length; score = it.partialCredit ? max * (good / it.pairs.length) : (good === it.pairs.length ? max : 0);
  } else if (it.kind === 'order') {
    const want = it.sequence.map((x) => x.id); const got = Array.isArray(ans) ? ans.map(String) : []; const good = want.filter((id, i) => got[i] === id).length; score = it.partialCredit ? max * (good / want.length) : (good === want.length ? max : 0);
  }
  return { auto: round025(score), needsReview: false, blank: false };
}

// a student-facing view of an item: never carries the key
function publicItem(it, variant, ref, locale) {
  const o = { ref: String(ref), kind: it.kind, stem: locale === 'ur' && it.stemUr ? it.stemUr : it.stem, stemSpeech: it.stemSpeech, marks: it.marks, unit: it.unit || '', multi: it.kind === 'multi', partial: !!it.partialCredit };
  if (['mcq', 'multi', 'tf'].includes(it.kind)) { const by = new Map(it.options.map((x) => [x.id, x])); o.options = (variant.options[ref] || it.options.map((x) => x.id)).map((id) => ({ id, text: locale === 'ur' && by.get(id)?.textUr ? by.get(id).textUr : by.get(id)?.text })); }
  if (it.kind === 'match') { const by = new Map(it.pairs.map((p) => [p.id, p])); o.left = it.pairs.map((p) => ({ id: p.id, text: p.left })); o.right = (variant.right[ref] || it.pairs.map((p) => p.id)).map((id) => ({ id, text: by.get(id)?.right })); }
  if (it.kind === 'order') { const by = new Map(it.sequence.map((x) => [x.id, x])); o.sequence = (variant.sequence[ref] || it.sequence.map((x) => x.id)).map((id) => ({ id, text: by.get(id)?.text })); }
  return o;
}

// ── blueprint ──
// rules: [{topic, difficulty, kind, bloom, count}]. Deterministic for a given salt. Returns picked item refs and what could not be filled.
function pickBlueprint(rules, pool, salt) {
  const rand = rng(sha(`${salt}|bp`).slice(0, 16)); const used = new Set(); const picked = []; const short = [];
  for (const r of rules) {
    const want = Math.max(0, Math.floor(Number(r.count) || 0));
    const ok = pool.filter((p) => !used.has(String(p._id)) && (!r.topic || p.topic === r.topic) && (!r.difficulty || p.difficulty === r.difficulty) && (!r.kind || p.kind === r.kind) && (!r.bloom || p.bloom === r.bloom));
    const take = shuffle(ok, rand).slice(0, want); take.forEach((t) => { used.add(String(t._id)); picked.push(t); });
    if (take.length < want) short.push({ rule: r.id, topic: r.topic || '', difficulty: r.difficulty || '', wanted: want, found: take.length });
  }
  return { picked, short };
}

// ── statistics (CAP-0319) ──
function wilson(k, n, z = 1.96) { if (!n) return [0, 1]; const p = k / n; const d = 1 + (z * z) / n; const c = p + (z * z) / (2 * n); const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n)); return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]; }
// rows: [{total, scores: {ref: {score, max, answer}}}]. Discrimination uses the top and bottom 27% by total score.
function analyse(items, rows) {
  const sorted = [...rows].sort((a, b) => b.total - a.total); const g = Math.max(1, Math.round(sorted.length * 0.27)); const hi = sorted.slice(0, g); const lo = sorted.slice(-g);
  return items.map((it) => {
    const ref = String(it.ref); const got = rows.map((r) => r.scores[ref]).filter(Boolean); const n = got.length; const full = got.filter((x) => x.score >= x.max - 1e-9).length;
    const mean = n ? got.reduce((s, x) => s + x.score / (x.max || 1), 0) / n : 0; const [lo95, hi95] = wilson(full, n);
    const pass = (grp) => { const v = grp.map((r) => r.scores[ref]).filter(Boolean); return v.length ? v.filter((x) => x.score >= x.max - 1e-9).length / v.length : 0; };
    const disc = n >= 10 && sorted.length >= 10 ? Math.round((pass(hi) - pass(lo)) * 100) / 100 : null;
    const dist = {}; if (it.options) got.forEach((x) => { const a = Array.isArray(x.answer) ? x.answer : (x.answer === undefined || x.answer === null || x.answer === '' ? ['(blank)'] : [x.answer]); a.forEach((v) => { dist[v] = (dist[v] || 0) + 1; }); });
    const flags = []; if (n < 30) flags.push('Few answers: treat as a hint, not a verdict'); if (n >= 10 && full / n < 0.2) flags.push('Very hard'); if (n >= 10 && full / n > 0.9) flags.push('Very easy'); if (disc !== null && disc < 0) flags.push('Weaker students did better than stronger ones: check the key'); else if (disc !== null && disc < 0.1 && n >= 30) flags.push('Does not tell strong and weak students apart');
    return { ref, n, facility: n ? Math.round((full / n) * 1000) / 1000 : null, meanFraction: Math.round(mean * 1000) / 1000, interval: n ? [Math.round(lo95 * 100) / 100, Math.round(hi95 * 100) / 100] : null, discrimination: disc, distractors: dist, flags };
  });
}

// ── signed receipts and results ──
const saveReceipt = (attemptId, seq, answers) => { const hash = sha(answers || {}).slice(0, 24); return { seq, hash, sig: hmac(`save|${attemptId}|${seq}|${hash}`).slice(0, 32) }; };
const verifyReceipt = (attemptId, r) => !!(r && Number.isInteger(r.seq) && r.hash && r.sig && hmac(`save|${attemptId}|${r.seq}|${r.hash}`).slice(0, 32) === r.sig);
const resultSignature = (attempt) => hmac(`result|${attempt._id}|${attempt.resultVersion}|${attempt.total}|${sha((attempt.items || []).map((i) => [String(i.ref), i.final ?? i.auto ?? 0]))}`);
// invigilator code: six digits that change each day, so a teacher can read it out in the room and it expires by itself
const invigilatorCode = (assessmentId, day = new Date().toISOString().slice(0, 10)) => String(parseInt(hmac(`inv|${assessmentId}|${day}`).slice(0, 8), 16) % 1000000).padStart(6, '0');

module.exports = { sha, hmac, rng, shuffle, seedFor, buildVariant, variantHash, gradeItem, publicItem, pickBlueprint, analyse, wilson, saveReceipt, verifyReceipt, resultSignature, invigilatorCode, round025, norm };
