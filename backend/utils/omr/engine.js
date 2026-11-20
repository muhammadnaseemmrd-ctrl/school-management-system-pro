// Turning bubble darkness into answers, and answers into marks (PRD E14). Pure functions: the same input always gives the same output,
// which is what lets a revised answer key regrade a whole batch and get the same numbers every time it is run on the same key.
const crypto = require('crypto');

const DEFAULTS = { mark: 0.5, faint: 0.22, gap: 0.3, blurMm: 0.8, minContrast: 70, minPaper: 90, blankPct: 60, alignMm: 1.5 };
const thresholds = (form) => { const t = { ...DEFAULTS }; const own = form?.thresholds?.toObject ? form.thresholds.toObject() : (form?.thresholds || {}); for (const k of Object.keys(DEFAULTS)) if (Number.isFinite(own[k])) t[k] = own[k]; return t; };
const NEEDS_REVIEW = new Set(['multiple', 'faint', 'low']);

// One row of bubbles. `symbols` are the labels of the bubbles in order ("ABCD" or "0123456789").
function readRow(fills, symbols, th) {
  const f = fills.map((v) => Number(v) || 0); const order = f.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); const top = order[0]?.[0] || 0; const second = order[1]?.[0] || 0;
  const marked = f.map((v, i) => (v >= th.mark ? i : -1)).filter((i) => i >= 0); const faint = f.map((v, i) => (v >= th.faint && v < th.mark ? i : -1)).filter((i) => i >= 0);
  const round = (v) => Math.round(v * 100) / 100;
  if (!marked.length && !faint.length) return { det: '', state: 'blank', conf: round(Math.min(1, 1 - top / th.faint)) };
  if (marked.length >= 2) return { det: marked.map((i) => symbols[i]).join(''), state: 'multiple', conf: round(Math.max(0, 1 - (marked.length - 1) * 0.5)) };
  if (marked.length === 1) { const gap = top - second; const ok = gap >= th.gap; return { det: symbols[marked[0]], state: ok ? 'ok' : 'low', conf: round(Math.min(1, gap / 0.6)) }; }
  return { det: faint.map((i) => symbols[i]).join(''), state: 'faint', conf: round(Math.min(1, top / th.mark) * 0.5) };
}

// Every printed digit column must have exactly one clear mark for the number to be trusted without a person looking.
function readDigits(cols, th) {
  const rows = cols.map((c) => readRow(c, '0123456789', th)); const text = rows.map((r) => (r.state === 'ok' ? r.det : '?')).join(''); return { text, ok: rows.every((r) => r.state === 'ok'), rows };
}

const QUALITY = {
  blur: 'The photo is blurry. Retake it, or look at the page and accept it if every mark is clear.',
  dark: 'The photo is too dark to read reliably. Retake it in better light, or accept it after looking at the page.',
  contrast: 'The marks are too faint against the paper. Look at the page before accepting.',
  'mostly-blank': 'Most answers are blank. Check this is the right sheet and the marks are not too light.',
};

// Sheet-level problems found from the measurements. "block" must be settled by a person before grading; "warn" is shown only.
function qualityFlags(m, answers, th, opts = {}) {
  const out = []; const add = (code, level, msg) => out.push({ code, level, msg, resolved: false });
  if (m.edgeMm > th.blurMm) add('blur', 'block', QUALITY.blur);
  if (m.paper < th.minPaper) add('dark', 'block', QUALITY.dark);
  if (m.contrast < th.minContrast) add('contrast', 'block', QUALITY.contrast);
  const blank = answers.filter((a) => a.state === 'blank').length; if (answers.length && blank * 100 >= th.blankPct * answers.length) add('mostly-blank', 'block', QUALITY['mostly-blank']);
  if (m.alignMm > th.alignMm) add('misaligned', 'warn', 'The corner marks are slightly off where they were printed, so a mark near a bubble edge may be misread.');
  const turn = ((Math.abs(m.rotationDeg) % 90) + 90) % 90; if (Math.min(turn, 90 - turn) > 8) add('rotated', 'warn', 'The sheet was photographed at an angle. It was straightened, but a flatter photo is safer.');
  if (m.perspective > 0.15) add('tilted', 'warn', 'The phone was held at a steep angle. A photo taken from straight above is safer.');
  if (opts.formState === 'wrong') add('wrong-form', 'block', 'This is a different answer sheet from the one selected for this batch.');
  else if (opts.formState === 'unreadable') add('form-code', 'warn', 'The printed sheet code could not be read, so it was not checked against this batch.');
  return out;
}

// Final answer for each question: what a person decided if anyone did, otherwise what was read when the reading was clear.
const finalOf = (a) => (a.by === 'review' ? a.final : (a.state === 'ok' ? a.det : (a.state === 'blank' ? '' : null)));
const unsettled = (scan) => (scan.answers || []).filter((a) => NEEDS_REVIEW.has(a.state) && a.by !== 'review');

function statusOf(scan) {
  if ((scan.flags || []).some((f) => f.code === 'corners')) return 'Rescan';
  if (scan.status === 'Rescan' || scan.status === 'Superseded') return scan.status;
  const open = (scan.flags || []).some((f) => f.level === 'block' && !f.resolved); return open || unsettled(scan).length ? 'Needs review' : 'Ready';
}

// ── the key ──
function parseKey(input, questions, choices) {
  const letters = 'ABCDE'.slice(0, choices); let list;
  if (Array.isArray(input)) list = input.map((x) => String(x ?? '').trim().toUpperCase()); else list = String(input || '').toUpperCase().replace(/[\s,;]+/g, '').split('');
  // an array may hold "B|C"; a pasted string is read one letter per question, with (B|C) groups allowed
  if (!Array.isArray(input)) { list = []; const s = String(input || '').toUpperCase().replace(/[\s,;]+/g, ''); for (let i = 0; i < s.length;) { if (s[i] === '(') { const j = s.indexOf(')', i); if (j < 0) return { error: 'A bracket was not closed.' }; list.push(s.slice(i + 1, j).replace(/[^A-E]/g, '').split('').join('|')); i = j + 1; } else list.push(s[i++]); } }
  if (list.length !== questions) return { error: `The key has ${list.length} answers but the sheet has ${questions} questions.` };
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i]; if (v === '*' || v === '-') { out.push(v); continue; }
    const alts = v.split('|').filter(Boolean); if (!alts.length || alts.some((x) => !letters.includes(x) || x.length !== 1)) return { error: `Question ${i + 1}: use one of ${letters.split('').join(', ')} (or * to give everyone the marks, - to drop the question).` };
    out.push([...new Set(alts)].sort().join('|'));
  }
  return { answers: out };
}
const keyHash = (answers, weights) => crypto.createHash('sha256').update(JSON.stringify([answers, weights || []])).digest('hex').slice(0, 16);

function gradeAnswers(finals, key, form) {
  const marks = []; let raw = 0, max = 0, right = 0, wrong = 0, blank = 0; const per = form.marksPerQuestion ?? 1; const neg = form.negative || 0;
  for (let i = 0; i < key.answers.length; i++) {
    const k = key.answers[i]; const w = key.weights?.[i] ?? per; const f = finals[i] ?? '';
    if (k === '-') { marks.push('-'); continue; } max += w;
    if (k === '*') { raw += w; right++; marks.push('R'); continue; }
    if (f === '') { blank++; marks.push('B'); continue; }
    if (k.split('|').includes(f)) { raw += w; right++; marks.push('R'); } else { raw -= neg; wrong++; marks.push('W'); }
  }
  raw = Math.max(0, Math.round(raw * 100) / 100);
  return { raw, max: Math.round(max * 100) / 100, pct: max ? Math.round(raw / max * 1000) / 10 : 0, right, wrong, blank, marks: marks.join('') };
}
const resultsHash = (rows) => crypto.createHash('sha256').update(JSON.stringify(rows.map((r) => [String(r.id), r.raw, r.marks]).sort((a, b) => (a[0] < b[0] ? -1 : 1)))).digest('hex').slice(0, 16);

module.exports = { DEFAULTS, thresholds, NEEDS_REVIEW, readRow, readDigits, qualityFlags, finalOf, unsettled, statusOf, parseKey, keyHash, gradeAnswers, resultsHash };
