// Colour tokens and contrast (WCAG 2.x), so a school's theme can be checked before anything is printed (CAP-0437).
const DEFAULT_THEME = { primary: '#2A5CAC', accent: '#A8523D', ink: '#1B2837', paper: '#FFFFFF', soft: '#F7F6F2' };
const HEX = /^#[0-9a-fA-F]{6}$/;
const resolveColor = (c, theme = {}) => {
  const t = { ...DEFAULT_THEME, ...theme };
  if (!c) return null;
  if (typeof c === 'string' && c.startsWith('theme.')) return t[c.slice(6)] || null;
  return HEX.test(c) ? c : null;
};
const lum = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const isLarge = (sizePt, bold) => sizePt >= 18 || (bold && sizePt >= 14);
module.exports = { DEFAULT_THEME, HEX, resolveColor, lum, ratio, isLarge };
