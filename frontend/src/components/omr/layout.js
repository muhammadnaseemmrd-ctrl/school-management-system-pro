// GENERATED from backend/utils/omr by backend/scripts/syncOmrClient.js. Edit the backend file, then run the script.
// Printed OMR sheet geometry (PRD E14, CAP-0320). Everything is in millimetres on an A4 page, y pointing down.
// The same file is copied to the browser so the printed sheet, the scanner and the review screen agree on where every bubble is.
const PAGE = { w: 210, h: 297 };
const ANCHOR = { size: 8, line: 1.6, centers: { tl: [14, 14], tr: [196, 14], bl: [14, 283], br: [196, 283] } }; // br is a hollow square: it tells the scanner which way up the sheet is
const BUBBLE = { r: 2.1, sample: 1.3, ringIn: 2.8, ringOut: 3.5 };
const MAX_Q = 100, PER_COL = 25, LETTERS = 'ABCDE';
const ID = { x0: 22, y0: 66, dx: 6.5, dy: 5.2 }; // candidate number grid: one column per digit, rows 0-9
const FORM = { x0: 150, y0: 66, dx: 6.5, dy: 5.2, digits: 4 }; // sheet code grid
const Q = { y0: 132, dy: 5.6, colX0: 16, colDx: 47, bubbleX: 11, bubbleDx: 6.4 };

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

function buildLayout({ questions, choices = 4, idDigits = 6 } = {}) {
  const nq = clampInt(questions, 1, MAX_Q); const nc = clampInt(choices, 2, 5); const nd = clampInt(idDigits, 3, 8);
  const bubbles = []; const idCols = []; const formCols = [];
  for (let p = 0; p < nd; p++) { const col = []; for (let d = 0; d < 10; d++) { const b = { t: 'i', p, d, x: ID.x0 + p * ID.dx, y: ID.y0 + d * ID.dy }; bubbles.push(b); col.push(b); } idCols.push(col); }
  for (let p = 0; p < FORM.digits; p++) { const col = []; for (let d = 0; d < 10; d++) { const b = { t: 'f', p, d, x: FORM.x0 + p * FORM.dx, y: FORM.y0 + d * FORM.dy }; bubbles.push(b); col.push(b); } formCols.push(col); }
  const rows = [];
  for (let q = 1; q <= nq; q++) {
    const col = Math.floor((q - 1) / PER_COL); const row = (q - 1) % PER_COL; const cx = Q.colX0 + col * Q.colDx; const y = Q.y0 + row * Q.dy; const r = { q, y, labelX: cx + 4, cols: [] };
    for (let c = 0; c < nc; c++) { const b = { t: 'q', q, c, x: cx + Q.bubbleX + c * Q.bubbleDx, y }; bubbles.push(b); r.cols.push(b); }
    rows.push(r);
  }
  return { page: PAGE, anchor: ANCHOR, bubble: BUBBLE, questions: nq, choices: nc, idDigits: nd, formDigits: FORM.digits, letters: LETTERS.slice(0, nc), bubbles, rows, idCols, formCols, id: ID, form: FORM, q: Q };
}

// A code like 7 becomes the four digits printed in the sheet-code grid (0007).
const formDigits = (n) => String(Math.max(0, Math.min(9999, Math.floor(Number(n) || 0)))).padStart(FORM.digits, '0');

export { PAGE, ANCHOR, BUBBLE, MAX_Q, PER_COL, LETTERS, buildLayout, formDigits };
