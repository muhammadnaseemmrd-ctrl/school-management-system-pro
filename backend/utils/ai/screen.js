// The filter in front of the assistant and behind it (PRD E31): nothing about a child, a parent or a care matter goes in; nothing
// unchecked comes out. It is best effort, and it says so: a name can be written many ways. The words people type are checked here,
// the teaching sources are checked when they are added, and what comes back is checked again before a person sees it.
const Student = require('../../models/Student');

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]*[^\s.,;:!?)\]]/gi;
const CNIC = /(?<!\d)\d{5}-?\d{7}-?\d(?!\d)/g;
const PHONE = /(?<!\d)(?:\+?\d{1,3}[\s-]?)?(?:0?3\d{2}|0\d{2,3})[\s-]?\d{6,8}(?!\d)|(?<!\d)(?:\d[\s-]?){10,13}(?!\d)/g;
// a matter about one child's care, health or discipline is not for this assistant
const CARE = [
  /\b(?:his|her|their|child'?s|student'?s|pupil'?s)\s+(?:diagnos\w*|medical|medication|medicine|allerg\w*|disciplin\w*|suspension|counsell?ing|safeguarding|custody|behaviou?r(?:al)?\s+(?:record|issue|problem))/i,
  /\b(?:safeguarding|bullying|abuse|self[- ]harm)\s+(?:concern|case|report|disclosure|incident)\b/i,
  /\b(?:was|were|is|been|got|being)\s+(?:suspended|expelled|diagnosed|punished|caned)\b/i,
  /\bdiagnosed\s+with\b/i, /\bcourt\s+order\b/i,
  /(?:معطل|خارج)\s*(?:کر|کیا|کیے)|(?:تشدد|سزا)\s*(?:دی|کا)|خودکشی|بیماری\s*کی\s*تشخیص/,
];
const INJECTION = [
  /\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(?:previous|above|prior|earlier|all|any|your)\b[^.\n]{0,30}\b(?:instruction|prompt|rule|message|direction|guideline)s?\b/gi,
  /\b(?:system|developer)\s+(?:prompt|message|instruction)s?\b/gi,
  /\byou\s+are\s+(?:now|no\s+longer)\b/gi,
  /\b(?:pretend|behave|act)\s+(?:to\s+be|as\s+(?:if|though)?|like)\b/gi,
  /\b(?:reveal|print|show|repeat|output)\b[^.\n]{0,30}\b(?:prompt|instruction|secret|api\s*key|password|token)s?\b/gi,
  /<\|[^|]{0,40}\|>|\[\/?INST\]|<\/?(?:system|assistant|user)>/gi,
  /\bdo\s+not\s+(?:tell|mention|inform|reveal)\b[^.\n]{0,40}/gi,
  /(?:پچھلی|تمام|اوپر کی)\s*ہدایات\s*(?:کو\s*)?(?:نظر\s*انداز|بھول)/g,
];
const HIGH_STAKES = /\b(?:failed|will\s+fail|has\s+passed|passed\s+with|expelled|suspended|scored\s+\d+|got\s+\d+\s*(?:marks|%)|grade\s+[A-F]\b|ranked\s+\w+|top\s+student)\b/i;
const TAGS = /<\/?[a-z][^>]*>/gi;
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const COMMON_FIRST = new Set(['muhammad', 'mohammad', 'mohammed', 'muhammed', 'syed', 'sayed', 'sheikh', 'shaikh', 'malik', 'mian', 'hafiz', 'qari', 'abdul', 'abdur', 'ali', 'ahmed', 'ahmad', 'hassan', 'hussain', 'fatima', 'ayesha', 'mr', 'mrs', 'miss', 'dr']);

/* ───────── who the school's children and parents are (kept a minute) ───────── */
const cache = new Map();
async function nameIndex(schoolId) {
  const key = String(schoolId); const hit = cache.get(key); if (hit && Date.now() - hit.at < 60000) return hit;
  const rows = await Student.find({ schoolId }).select('name admissionNumber father.name mother.name guardian.name').lean();
  const full = new Set(); const pair = new Set(); const ids = new Set();
  const add = (n) => {
    const t = norm(n).split(' ').filter(Boolean); if (t.length < 2 || t.join('').length < 6) return;
    full.add(t.join(' '));
    if (t.length >= 3 && !COMMON_FIRST.has(t[0]) && t[0].length >= 3 && t[1].length >= 3) pair.add(`${t[0]} ${t[1]}`);
  };
  for (const r of rows) {
    add(r.name); add(r.father?.name); add(r.mother?.name); add(r.guardian?.name);
    const a = norm(r.admissionNumber).replace(/\s/g, ''); if (a.length >= 5) ids.add(a);
  }
  const out = { at: Date.now(), full, pair, ids }; cache.set(key, out); return out;
}
const forget = (schoolId) => { if (schoolId) cache.delete(String(schoolId)); else cache.clear(); };

function namesIn(text, idx) {
  const n = ` ${norm(text)} `; const hits = [];
  for (const f of idx.full) if (n.includes(` ${f} `)) hits.push('name');
  if (!hits.length) for (const p of idx.pair) if (n.includes(` ${p} `)) { hits.push('name'); break; }
  const compact = n.replace(/\s/g, '');
  for (const id of idx.ids) if (compact.includes(id)) { hits.push('id'); break; }
  return hits;
}
const careHit = (text) => CARE.some((r) => r.test(String(text || '')));

/* ───────── what a person types ───────── */
function redact(text) {
  const removed = {}; let t = String(text || '').replace(CTRL, '');
  const take = (re, kind) => { t = t.replace(re, () => { removed[kind] = (removed[kind] || 0) + 1; return '[removed]'; }); };
  take(EMAIL, 'email'); take(URL_RE, 'link'); take(CNIC, 'id_number'); take(PHONE, 'phone');
  return { text: t.replace(/\s+\[removed\]/g, ' [removed]').trim(), removed };
}
const merge = (a, b) => { for (const [k, v] of Object.entries(b || {})) a[k] = (a[k] || 0) + v; return a; };

// fields: { key: text }. -> { clean, removed, blocked: [{ field, code, message }] }
async function inputs(schoolId, fields, { checkCare = true } = {}) {
  const idx = await nameIndex(schoolId); const clean = {}; const removed = {}; const blocked = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === '') { clean[k] = ''; continue; }
    const raw = String(v);
    const hits = namesIn(raw, idx);
    if (hits.length) { blocked.push({ field: k, code: hits[0] === 'id' ? 'student_id' : 'person_name', message: hits[0] === 'id' ? 'This looks like a student number. Take it out: the assistant never sees information about a child.' : 'This seems to name a child or a parent. Take the name out: the assistant never sees information about a child.' }); continue; }
    if (checkCare && careHit(raw)) { blocked.push({ field: k, code: 'care_matter', message: 'This looks like a care, health or discipline matter about a person. The assistant does not handle those.' }); continue; }
    const r = redact(raw); clean[k] = r.text; merge(removed, r.removed);
  }
  return { clean, removed, blocked };
}

/* ───────── teaching sources: words that tell the model what to do are removed ───────── */
function scanSource(text) {
  let t = String(text || '').replace(CTRL, '').replace(TAGS, ' '); const hits = [];
  for (const re of INJECTION) t = t.replace(re, (m) => { hits.push(m.slice(0, 60)); return '[text removed]'; });
  return { text: t.replace(/[ \t]{2,}/g, ' ').trim(), hits };
}
async function sourceCheck(schoolId, text) {
  const idx = await nameIndex(schoolId); const hits = namesIn(text, idx);
  if (hits.length) return { ok: false, message: 'This text seems to name a child or a parent. Teaching sources must not contain information about children.' };
  const r = redact(text); const total = Object.values(r.removed).reduce((a, b) => a + b, 0);
  if (total > 3) return { ok: false, message: 'This text has several phone numbers, emails, links or id numbers. Teaching sources should not.' };
  return { ok: true, text: r.text, removed: r.removed };
}

/* ───────── what comes back ───────── */
const plain = (s) => String(s || '').replace(CTRL, '').replace(TAGS, ' ').replace(/[ \t]{2,}/g, ' ').trim();
// -> [{ code, severity, message }] for one piece of text
async function outputFlags(schoolId, text) {
  const idx = await nameIndex(schoolId); const t = String(text || ''); const f = [];
  if (EMAIL.test(t)) f.push({ code: 'email', severity: 'block', message: 'It contains an email address.' }); EMAIL.lastIndex = 0;
  if (URL_RE.test(t)) f.push({ code: 'link', severity: 'block', message: 'It contains a web link.' }); URL_RE.lastIndex = 0;
  if (CNIC.test(t) || PHONE.test(t)) f.push({ code: 'number', severity: 'block', message: 'It contains a phone or id number.' }); CNIC.lastIndex = 0; PHONE.lastIndex = 0;
  if (namesIn(t, idx).length) f.push({ code: 'person_name', severity: 'block', message: 'It seems to name a child or a parent.' });
  if (careHit(t)) f.push({ code: 'care_matter', severity: 'block', message: 'It touches a care, health or discipline matter about a person.' });
  for (const re of INJECTION) { re.lastIndex = 0; if (re.test(t)) { f.push({ code: 'instruction_text', severity: 'block', message: 'It contains words that look like instructions to a machine.' }); break; } }
  if (HIGH_STAKES.test(t)) f.push({ code: 'high_stakes', severity: 'warn', message: 'It talks about marks, grades, passing, failing or punishment. Only a person decides those.' });
  if (/\[removed\]/.test(t)) f.push({ code: 'removed_text', severity: 'warn', message: 'Some details were taken out before sending; read the sentence around it.' });
  return f;
}

module.exports = { inputs, redact, scanSource, sourceCheck, outputFlags, plain, nameIndex, forget, namesIn, careHit, norm, CTRL };
