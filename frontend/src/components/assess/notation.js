// Plain-text notation for maths and chemistry that anyone can type, with a spoken form for screen readers (PRD E13, CAP-0310).
// x^2  x_1  x^{n+1}  H_2O  \frac{a}{b}  \sqrt{x}  \pi  \alpha  \times  \le  \ge  \neq  \pm  \degree
const SYMBOLS = { alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', theta: 'theta', lambda: 'lambda', mu: 'mu', pi: 'pi', sigma: 'sigma', omega: 'omega', Delta: 'delta', Omega: 'omega', times: 'times', div: 'divided by', pm: 'plus or minus', le: 'is less than or equal to', ge: 'is greater than or equal to', neq: 'is not equal to', approx: 'is approximately', infty: 'infinity', degree: 'degrees', rightarrow: 'gives', leftrightarrow: 'is in equilibrium with', sum: 'the sum of', int: 'the integral of', cdot: 'times' };
const GLYPH = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', omega: 'ω', Delta: 'Δ', Omega: 'Ω', times: '×', div: '÷', pm: '±', le: '≤', ge: '≥', neq: '≠', approx: '≈', infty: '∞', degree: '°', rightarrow: '→', leftrightarrow: '⇌', sum: '∑', int: '∫', cdot: '·' };
const ORD = { 2: 'squared', 3: 'cubed' };

// Take one {group} or a single character starting at i; return [text, nextIndex]
function arg(s, i) {
  if (s[i] === '{') { let d = 1; let j = i + 1; while (j < s.length && d) { if (s[j] === '{') d += 1; else if (s[j] === '}') d -= 1; j += 1; } return [s.slice(i + 1, j - 1), j]; }
  const m = /^(\\[a-zA-Z]+|[+-]?\d+(?:\.\d+)?|[+-]?[A-Za-z])/.exec(s.slice(i)); if (m) return [m[0], i + m[0].length]; return [s[i] || '', i + 1];   // like LaTeX: one symbol, or a whole number
}

// → array of tokens: {t:'text'|'sup'|'sub'|'frac'|'sqrt'|'sym', ...} that a screen can draw
function parse(src) {
  const s = String(src || ''); const out = []; let i = 0; let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  while (i < s.length) {
    const c = s[i];
    if (c === '^' || c === '_') { flush(); const [a, n] = arg(s, i + 1); out.push({ t: c === '^' ? 'sup' : 'sub', v: parse(a) }); i = n; continue; }
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
      if (m) {
        const name = m[1]; i += m[0].length;
        if (name === 'frac') { flush(); const [a, n1] = arg(s, i); const [b, n2] = arg(s, n1); out.push({ t: 'frac', n: parse(a), d: parse(b) }); i = n2; continue; }
        if (name === 'sqrt') { flush(); const [a, n1] = arg(s, i); out.push({ t: 'sqrt', v: parse(a) }); i = n1; continue; }
        if (GLYPH[name]) { flush(); out.push({ t: 'sym', v: GLYPH[name], name }); continue; }
        buf += `\\${name}`; continue;
      }
    }
    buf += c; i += 1;
  }
  flush(); return out;
}

function speakTokens(tokens) {
  const parts = [];
  tokens.forEach((k, idx) => {
    if (k.t === 'text') parts.push(k.v.replace(/\+/g, ' plus ').replace(/(?<=\w)-(?=\w)|(?<=\s)-(?=\s)/g, ' minus ').replace(/=/g, ' equals ').replace(/\*/g, ' times ').replace(/\//g, ' over '));
    else if (k.t === 'sym') parts.push(` ${SYMBOLS[k.name] || k.v} `);
    else if (k.t === 'sup') { const inner = speakTokens(k.v).trim(); parts.push(ORD[inner] ? ` ${ORD[inner]} ` : ` to the power ${inner} `); }
    else if (k.t === 'sub') parts.push(` sub ${speakTokens(k.v).trim()} `);
    else if (k.t === 'frac') parts.push(` the fraction ${speakTokens(k.n).trim()} over ${speakTokens(k.d).trim()} `);
    else if (k.t === 'sqrt') parts.push(` the square root of ${speakTokens(k.v).trim()} `);
  });
  return parts.join('').replace(/\s+/g, ' ').trim();
}
const speak = (src) => speakTokens(parse(src));
const hasNotation = (src) => /[\^_]|\\[a-zA-Z]+/.test(String(src || ''));
// plain text with unicode sub/superscripts, used where a layout cannot draw tokens (printed papers, notifications)
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' }; const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const flatten = (tokens) => tokens.map((k) => {
  if (k.t === 'text') return k.v; if (k.t === 'sym') return k.v;
  if (k.t === 'sup') return [...flatten(k.v)].map((ch) => SUP[ch] || ch).join(''); if (k.t === 'sub') return [...flatten(k.v)].map((ch) => SUB[ch] || ch).join('');
  if (k.t === 'frac') return `(${flatten(k.n)})/(${flatten(k.d)})`; if (k.t === 'sqrt') return `√(${flatten(k.v)})`; return '';
}).join('');
const plain = (src) => flatten(parse(src));
export { parse, speak, plain, hasNotation };
