// Colour maths for school themes (PRD E27: ThemeVersion, CAP-0437). Pure functions so the browser can run the same checks
// while a brand admin picks colours. Edit this file, then run backend/scripts/syncThemeClient.js (smoke fails if the copy is stale).
const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULTS = { primary: '#2A5CAC', accent: '#A8523D', mode: 'light', radius: 'soft', font: 'sans', showName: true };
const MODES = ['light', 'dark', 'system']; const RADII = ['square', 'soft', 'round']; const FONTS = ['sans', 'serif', 'humanist'];
const WHITE = '#FFFFFF'; const PAPER = '#F7F6F2'; const DARK_SURFACE = '#16202B'; const DARK_PAPER = '#0F1720';

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const to2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const rgbToHex = (r, g, b) => `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
const lum = (hex) => { const v = hexToRgb(hex).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgbToHsl = (r, g, b) => {
  const R = r / 255; const G = g / 255; const B = b / 255; const mx = Math.max(R, G, B); const mn = Math.min(R, G, B); const l = (mx + mn) / 2; let h = 0; let s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; h *= 60; }
  return [h, s, l];
};
const hslToRgb = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};
const hslHex = (h, s, l) => rgbToHex(...hslToRgb(((h % 360) + 360) % 360, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))));
const mix = (a, b, t) => { const x = hexToRgb(a); const y = hexToRgb(b); return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
const gray = (hex) => { const [r, g, b] = hexToRgb(hex); const y = 0.299 * r + 0.587 * g + 0.114 * b; return rgbToHex(y, y, y); };

// The nearest colour (same hue) that reads on white at the given ratio: darken until it does.
function suggest(hex, min = 4.5, bg = WHITE) {
  if (!HEX.test(hex)) return DEFAULTS.primary; if (ratio(hex, bg) >= min) return hex.toUpperCase();
  const [r, g, b] = hexToRgb(hex); const [h, s, l] = rgbToHsl(r, g, b);
  for (let i = 1; i <= 100; i += 1) { const c = hslHex(h, s, l - i * 0.005); if (ratio(c, bg) >= min) return c; }
  return '#1B2837';
}
// A colour that reads on the dark surface: lighten until it does.
function lighten(hex, min = 4.5, bg = DARK_SURFACE) {
  if (ratio(hex, bg) >= min) return hex.toUpperCase();
  const [r, g, b] = hexToRgb(hex); const [h, s, l] = rgbToHsl(r, g, b);
  for (let i = 1; i <= 120; i += 1) { const c = hslHex(h, s, l + i * 0.005); if (ratio(c, bg) >= min) return c; }
  return '#FFFFFF';
}

const clean = (t = {}) => {
  const hex = (v, d) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toUpperCase() : d);
  return { primary: hex(t.primary, DEFAULTS.primary), accent: hex(t.accent, DEFAULTS.accent), mode: MODES.includes(t.mode) ? t.mode : DEFAULTS.mode, radius: RADII.includes(t.radius) ? t.radius : DEFAULTS.radius, font: FONTS.includes(t.font) ? t.font : DEFAULTS.font, showName: t.showName !== false };
};
// Every check a brand admin must pass before publishing. `min` is the WCAG AA ratio for body text.
function evaluate(t) {
  const checks = [];
  const add = (id, label, fg, bg, min, why) => { const r = ratio(fg, bg); checks.push({ id, label, fg, bg, ratio: Math.round(r * 100) / 100, min, pass: r >= min, why }); };
  add('primary-white', 'Primary colour as text on white', t.primary, WHITE, 4.5, 'Links, headings and icons use the primary colour on white cards.');
  add('white-primary', 'White text on a primary button', WHITE, t.primary, 4.5, 'Buttons are filled with the primary colour and carry white text.');
  add('primary-paper', 'Primary colour on the page background', t.primary, PAPER, 4.5, 'Text sits on the warm page background too.');
  add('accent-white', 'Accent colour on white', t.accent, WHITE, 3, 'The accent is used for document headings and large marks.');
  const gp = gray(t.primary); add('print-primary', 'Primary colour printed in black and white', gp, WHITE, 4.5, 'Many schools print in black and white: the primary colour must stay readable.');
  const ga = gray(t.accent); const sep = ratio(gp, ga); checks.push({ id: 'print-distinct', label: 'Primary and accent are different shades when printed in black and white', fg: gp, bg: ga, ratio: Math.round(sep * 100) / 100, min: 1.3, pass: sep >= 1.3, why: 'Otherwise a printed page loses the difference between them.' });
  const dark = lighten(t.primary); const dr = ratio(dark, DARK_SURFACE);
  checks.push({ id: 'dark-primary', label: 'Primary colour as text in dark mode (lightened automatically)', fg: dark, bg: DARK_SURFACE, ratio: Math.round(dr * 100) / 100, min: 4.5, pass: dr >= 4.5, why: 'Dark mode uses a lighter shade of your colour for text.' });
  const errors = checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.ratio}:1, needs ${c.min}:1.`);
  return { tokens: t, checks, errors, ok: errors.length === 0, darkPrimary: dark };
}
function check(tokens) {
  const t = clean(tokens); const r = evaluate(t); if (r.ok) return { ...r, suggestion: t.primary };
  // the nearest darker shade of the primary colour that passes every check
  const [h, sat, l] = rgbToHsl(...hexToRgb(t.primary)); let sg = suggest(t.primary);
  for (let i = 0; i <= 120; i += 1) { const c = hslHex(h, sat, l - i * 0.005); if (evaluate({ ...t, primary: c }).ok) { sg = c; break; } }
  return { ...r, suggestion: sg };
}

// ── Variables for the whole app. The build rewrites every colour in the CSS into `rgb(var(--bg-R-G-B, R G B))`; a theme is the
//    list of replacements for those variables. `manifest` is the "bg:255-255-255,tx:...,bd:..." list the CSS carries. ──
const FAMILY = (h, s) => s > 0.2 && h >= 205 && h <= 232; // the blue ramp the app was designed with
const BASE_PRIMARY = '#2A5CAC';
const key = (hex) => hexToRgb(hex).join('-');
const parseKey = (k) => rgbToHex(...k.split('-').map(Number));
function variables(tokens, mode, manifest) {
  const t = clean(tokens); const dark = mode === 'dark'; const out = {}; const [bh, bs] = rgbToHsl(...hexToRgb(BASE_PRIMARY)); const [nh, ns] = rgbToHsl(...hexToRgb(t.primary));
  const sat = bs ? ns / bs : 1; const brandFg = dark ? lighten(t.primary) : t.primary;
  for (const item of manifest.split(',').filter(Boolean)) {
    const [cat, k] = item.split(':'); const hex = parseKey(k); const rgb = hexToRgb(hex); const [h, s, l] = rgbToHsl(...rgb); let to = hex; const chroma = Math.max(...rgb) - Math.min(...rgb); const neutral = chroma <= 6;
    const inFamily = FAMILY(h, s);
    if (inFamily) { // recolour the ramp keeping its lightness
      if (key(hex) === key(BASE_PRIMARY)) to = cat === 'tx' ? brandFg : t.primary; else to = hslHex(nh + (h - bh), Math.min(1, s * (sat || 1)), l);
    }
    if (dark) {
      if (cat === 'bg') {
        if (l > 0.55 && !(inFamily && key(hex) === key(BASE_PRIMARY))) to = neutral ? hslHex(212, 0.28, l > 0.985 ? 0.135 : Math.max(0.06, 0.135 - (0.985 - l) * 1.3)) : hslHex(inFamily ? nh + (h - bh) : h, Math.min(1, s * (inFamily ? sat || 1 : 1) * 0.7), 0.2 + (0.97 - Math.min(l, 0.97)) * 0.45);
      } else if (cat === 'tx') {
        if (l < 0.62 && !(inFamily && key(hex) === key(BASE_PRIMARY))) to = hslHex(inFamily ? nh + (h - bh) : h, s * 0.85, Math.min(0.88, 0.98 - 0.62 * l + (s > 0.3 ? 0.06 : 0)));
        else if (inFamily && key(hex) !== key(BASE_PRIMARY) && l >= 0.62) to = hex;
      } else if (cat === 'bd') {
        if (l > 0.55) to = neutral ? hslHex(212, 0.24, Math.max(0.2, 0.27 - (0.95 - Math.min(l, 0.95)) * 0.5)) : hslHex(inFamily ? nh + (h - bh) : h, s * 0.6, 0.3);
      }
    }
    if (to.toUpperCase() !== hex.toUpperCase()) out[`--${cat}-${k}`] = hexToRgb(to).join(' ');
  }
  return out;
}
const RADIUS = { square: 0.25, soft: 1, round: 1.6 };
const FONT_STACK = { sans: null, serif: "Georgia, 'Noto Naskh Arabic', 'Times New Roman', serif", humanist: "'Segoe UI', Candara, Optima, 'Noto Naskh Arabic', system-ui, sans-serif" };
const cssFor = (tokens, mode, manifest) => {
  const t = clean(tokens); const v = variables(t, mode, manifest || '');
  const lines = Object.entries(v).map(([k, val]) => `${k}:${val}`); lines.push(`--rs:${RADIUS[t.radius]}`);
  if (FONT_STACK[t.font]) lines.push(`--font-main:${FONT_STACK[t.font]}`);
  lines.push(`--brand:${t.primary}`, `--brand-fg:${mode === 'dark' ? lighten(t.primary) : t.primary}`);
  return `:root{${lines.join(';')}}`;
};
module.exports = { HEX, DEFAULTS, MODES, RADII, FONTS, WHITE, PAPER, DARK_SURFACE, DARK_PAPER, hexToRgb, rgbToHex, lum, ratio, rgbToHsl, hslToRgb, hslHex, mix, gray, suggest, lighten, clean, check, variables, cssFor };
