// The built-in drafter (PRD E31). It is not a language model: it builds structure from what the person typed and quotes sentences from
// the approved sources they chose, each with its source number. Anything it cannot get from those two places it leaves as a prompt for the
// person to fill in, and says so. Same input, same output.
const crypto = require('crypto');
const { STOP, BUILTIN_GLOSSARY } = require('./catalog');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const sid = (n) => `s${n}`;
const sentences = (text) => String(text || '').split(/(?<=[.!?۔])\s+|\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 25 && s.length <= 260);
const words = (s) => String(s || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const keyWords = (s) => words(s).filter((w) => w.length >= 4 && !STOP.has(w));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// every usable sentence from the chosen sources, ranked by how many topic words it shares
function pool(sources, topicText) {
  const want = new Set(keyWords(topicText)); const out = [];
  sources.forEach((src, i) => sentences(src.text).forEach((t, j) => { const w = keyWords(t); const score = w.filter((x) => want.has(x)).length; out.push({ n: i + 1, src: src.id, idx: j, text: t, score, w }); }));
  return out.sort((a, b) => b.score - a.score || a.n - b.n || a.idx - b.idx);
}
const take = (rows, n, cb = () => true) => { const picked = rows.filter(cb).slice(0, n); return picked.sort((a, b) => a.n - b.n || a.idx - b.idx); };
const cite = (rows) => [...new Set(rows.map((r) => `S${r.n}`))];

function lessonPlan(req, sources) {
  const m = req.minutes; const t = (p) => Math.max(2, Math.round(m * p));
  const rows = pool(sources, `${req.topic} ${req.objectives.join(' ')}`); const teach = take(rows, 5, (r) => r.score > 0 || sources.length === 1);
  const flags = []; const sec = []; let n = 0; const add = (heading, text, kind, cites = []) => { n += 1; sec.push({ id: sid(n), heading, text, kind, cites }); return sec[sec.length - 1]; };
  add('Learning aims', req.objectives.length ? `By the end of the lesson students can:\n${req.objectives.map((o) => `• ${o}`).join('\n')}` : 'Write two or three things students will be able to do by the end of the lesson.', req.objectives.length ? 'teacher' : 'scaffold');
  if (!req.objectives.length) flags.push({ code: 'no_objectives', severity: 'note', message: 'No aims were given, so this section is a prompt.', at: 's1' });
  add('Prior knowledge to check', `Ask two or three quick questions to find out what students already know about ${req.topic}.`, 'scaffold');
  add(`Starter (about ${t(0.1)} minutes)`, `Show one real example, object or picture linked to ${req.topic} and ask what students notice.`, 'scaffold');
  if (teach.length) add('Teaching points', teach.map((r) => `• ${r.text} [S${r.n}]`).join('\n'), 'sourced', cite(teach));
  else { const s = add('Teaching points', 'No approved source was chosen, so no facts are written here. Add the teaching points yourself, or choose a source and make the plan again.', 'scaffold'); flags.push({ code: 'no_sources', severity: 'warn', message: 'No source was used: every fact in this plan has to come from you.', at: s.id }); }
  const terms = [...new Set(teach.flatMap((r) => r.w))].slice(0, 6);
  add(`Practice (about ${t(0.35)} minutes)`, `Students work in pairs on short tasks about ${req.topic}${terms.length ? `, using these words: ${terms.join(', ')}` : ''}. Move around the room and listen.`, terms.length ? 'sourced' : 'scaffold', terms.length ? cite(teach) : []);
  const checks = take(rows, 3, (r) => r.score > 0 && r.w.length);
  if (checks.length) add('Check for understanding', checks.map((r, i) => { const k = r.w.sort((a, b) => b.length - a.length)[0]; return `${i + 1}. Complete: ${r.text.replace(new RegExp(k, 'i'), '______')} [S${r.n}]`; }).join('\n'), 'sourced', cite(checks));
  else add('Check for understanding', `Ask three short questions that show whether students reached the aims. Write them here.`, 'scaffold');
  add('Support and stretch', 'Support: give sentence starters or a worked example. Stretch: ask students to explain the idea to a partner or apply it to a new case.', 'scaffold');
  add(`Plenary and homework (about ${t(0.1)} minutes)`, `Ask each student to say one thing they learned. Set a short task linked to ${req.topic}.`, 'scaffold');
  return { title: `${req.topic} (${req.grade || 'class'} ${req.subject || ''})`.replace(/\s+/g, ' ').trim(), content: { sections: sec }, flags };
}

function notice(req) {
  const f = req.facts; const sec = []; let n = 0; const add = (heading, text, kind = 'teacher') => { n += 1; sec.push({ id: sid(n), heading, text, kind, cites: [] }); };
  const kind = { general: 'Notice', event: 'Event', reminder: 'Reminder', closure: 'Closure', exam: 'Exam' }[req.noticeType] || 'Notice';
  const to = { All: 'Dear all,', Students: 'Dear students,', Teachers: 'Dear teachers,', 'Class Specific': 'Dear students and parents,' }[req.audience] || 'Dear all,';
  const lines = [to, ''];
  if (f.what) lines.push(cap(f.what.replace(/[.\s]+$/, '')) + '.');
  const when = [f.date, f.time].filter(Boolean).join(' at '); if (when) lines.push(`When: ${when}.`);
  if (f.place) lines.push(`Where: ${f.place}.`);
  if (f.who) lines.push(`Who: ${f.who}.`);
  if (f.action) lines.push(`${cap(f.action.replace(/[.\s]+$/, ''))}${f.deadline ? ` by ${f.deadline}` : ''}.`);
  else if (f.deadline) lines.push(`Please note the date: ${f.deadline}.`);
  lines.push('', f.contact ? `For questions, please contact ${f.contact}.` : 'For questions, please contact the school office.', 'Thank you.');
  add('Title', req.title || `${kind}: ${cap(f.what || '').slice(0, 60)}`); add('Notice text', lines.join('\n'));
  return { title: sec[0].text, content: { sections: sec }, flags: [] };
}

// questions from sentences: the blanked word is the answer, wrong choices are other words from the sources
function questionSet(req, sources) {
  const rows = pool(sources, req.topic).filter((r) => r.w.length >= 3); const freq = {}; rows.forEach((r) => new Set(r.w).forEach((w) => { freq[w] = (freq[w] || 0) + 1; }));
  const termOf = (r) => [...new Set(r.w)].filter((w) => w.length >= 5).sort((a, b) => (freq[a] - freq[b]) || (b.length - a.length) || (a < b ? -1 : 1))[0];
  const bank = [...new Set(rows.map(termOf).filter(Boolean))]; const out = []; const used = new Set(); const kinds = req.kinds; const flags = [];
  for (const r of rows) {
    if (out.length >= req.count) break; const term = termOf(r); if (!term || used.has(term)) continue; used.add(term);
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'); if (!re.test(r.text)) continue;
    const kind = kinds[out.length % kinds.length]; const id = sid(out.length + 1); const seed = parseInt(sha(r.text).slice(0, 6), 16);
    const base = { id, marks: 1, difficulty: req.difficulty, topic: req.topic, cites: [`S${r.n}`], verified: false };
    const wrong = bank.filter((w) => w !== term && w.length >= 4).sort((a, b) => ((sha(a + seed) < sha(b + seed)) ? -1 : 1));
    if (kind === 'mcq' && wrong.length >= 3) {
      const opts = [term, ...wrong.slice(0, 3)].sort((a, b) => ((sha(a + seed) < sha(b + seed)) ? -1 : 1));
      out.push({ ...base, kind: 'mcq', stem: `Complete the sentence: ${r.text.replace(re, '______')}`, options: opts.map((o, i) => ({ id: `o${i + 1}`, text: o, correct: o === term })) });
    } else if (kind === 'tf' && wrong.length) {
      const makeTrue = seed % 2 === 0;
      out.push({ ...base, kind: 'tf', stem: makeTrue ? r.text : r.text.replace(re, wrong[0]), answerTrue: makeTrue });
    } else out.push({ ...base, kind: 'short', stem: `Complete the sentence: ${r.text.replace(re, '______')}`, accepted: [term] });
  }
  if (out.length < req.count) flags.push({ code: 'fewer_questions', severity: 'note', message: `Only ${out.length} of ${req.count} questions could be made from these sources.` });
  return { title: `Questions: ${req.topic}`, content: { questions: out }, flags };
}

function rubricFeedback(req, rubric) {
  const sec = []; let n = 0; const add = (heading, text, kind, cites = []) => { n += 1; sec.push({ id: sid(n), heading, text, kind, cites }); };
  const open = { encouraging: 'Thank you for your effort on this piece of work. Here is how it matches the rubric.', neutral: 'Here is how this piece of work matches the rubric.' }[req.tone] || 'Here is how this piece of work matches the rubric.';
  add('Opening', open, 'scaffold');
  for (const c of rubric.criteria) {
    const levels = [...c.levels].sort((a, b) => a.points - b.points); const i = Math.min(levels.length - 1, Math.max(0, req.levels[c.id] ?? 0)); const here = levels[i]; const next = levels[i + 1];
    add(c.name, `${here.descriptor}${next ? `\nTo move forward: ${next.descriptor}` : '\nThis is the top level for this part.'}`, 'sourced', ['rubric']);
  }
  if (req.strengths) add('What went well (your words)', req.strengths, 'teacher');
  if (req.nextSteps) add('Next steps (your words)', req.nextSteps, 'teacher');
  add('Closing', 'Please read this and ask if anything is unclear. Marks are decided by your teacher and are not part of this note.', 'scaffold');
  return { title: `Feedback: ${rubric.name}`, content: { sections: sec }, flags: [] };
}

function translation(req, glossary) {
  const all = [...glossary, ...BUILTIN_GLOSSARY].filter((g) => g.en && g.ur); const seen = new Set(); const terms = [];
  for (const g of all) { const k = `${req.from === 'en' ? g.en : g.ur}`.toLowerCase(); if (!seen.has(k)) { seen.add(k); terms.push({ from: req.from === 'en' ? g.en : g.ur, to: req.from === 'en' ? g.ur : g.en }); } }
  terms.sort((a, b) => b.from.length - a.from.length);
  let partial = req.text; const found = [];
  for (const t of terms) { const re = new RegExp(req.from === 'en' ? `\\b${t.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b` : t.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); if (re.test(partial)) { found.push(t); partial = partial.replace(re, `⟦${t.to}⟧`); } }
  const sec = []; let n = 0; const add = (heading, text, kind, cites = []) => { n += 1; sec.push({ id: sid(n), heading, text, kind, cites }); };
  add('Your text', req.text, 'teacher');
  add('Suggested terms', found.length ? found.map((t) => `${t.from} → ${t.to}`).join('\n') : 'No term in this text is in the glossary.', found.length ? 'sourced' : 'scaffold', found.length ? ['glossary'] : []);
  add('Partly translated (terms only)', partial.replace(/[⟦⟧]/g, ''), 'sourced', found.length ? ['glossary'] : []);
  const left = [...new Set(words(partial.replace(/⟦[^⟧]*⟧/g, ' ')).filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 30);
  add('Words with no suggestion', left.length ? left.join(', ') : 'None.', 'scaffold');
  return { title: `Terms: ${req.text.slice(0, 40)}`, content: { sections: sec }, flags: [{ code: 'partial_translation', severity: 'warn', message: 'Only the listed terms were translated. A person who reads the target language must write the rest and check it.', at: 's3' }] };
}

function run(kind, req, ctx) {
  if (kind === 'lesson_plan') return lessonPlan(req, ctx.sources);
  if (kind === 'notice') return notice(req);
  if (kind === 'question_set') return questionSet(req, ctx.sources);
  if (kind === 'rubric_feedback') return rubricFeedback(req, ctx.rubric);
  return translation(req, ctx.glossary);
}
module.exports = { run, sha, sentences, keyWords };
