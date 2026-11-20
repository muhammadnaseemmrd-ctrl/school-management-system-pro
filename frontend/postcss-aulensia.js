// Turns the app's fixed colours into theme variables (PRD E27). Every colour in the CSS becomes `rgb(var(--bg-R-G-B, R G B) / a)`:
// unchanged it renders exactly as before; a school theme or dark mode only has to set the variables. The list of colours in use is
// written to the CSS as --aul-colors so the browser can work out each replacement. Radii scale with --rs.
const CATS = [
  [/^(background|background-color|--tw-gradient-from|--tw-gradient-to|--tw-gradient-via|--tw-gradient-stops|--tw-ring-offset-color)$/, 'bg'],
  [/^(color|text-decoration-color|caret-color|accent-color|fill|stroke|-webkit-text-fill-color)$/, 'tx'],
  [/^(border(-top|-right|-bottom|-left|-inline|-block)?(-color)?|border-(top|right|bottom|left|inline|block)-(start|end)?-?color|outline|outline-color|--tw-ring-color|--tw-shadow-color)$/, 'bd'],
];
const catOf = (prop) => { for (const [re, c] of CATS) if (re.test(prop)) return c; return null; };
const COLOR = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*((?:var\([^()]*(?:\([^()]*\))?[^()]*\))|[\d.]+%?))?\s*\)/g;

export default function aulensiaTheme() {
  const used = new Set();
  return {
    postcssPlugin: 'aulensia-theme',
    Once(root) {
      root.walkDecls((d) => {
        if (/radius$/.test(d.prop) && !d.value.includes('var(--rs')) {
          const v = d.value.replace(/(^|\s)(\d*\.?\d+)(rem|px)\b/g, (m, sp, n, u) => (parseFloat(n) > 0 && parseFloat(n) <= (u === 'rem' ? 3 : 48) ? `${sp}calc(${n}${u} * var(--rs, 1))` : m));
          if (v !== d.value) d.value = v;
        }
        const cat = catOf(d.prop); if (!cat) return; if (d.value.includes('var(--bg-') || d.value.includes('var(--tx-') || d.value.includes('var(--bd-')) return;
        const eff = d.prop === '--tw-ring-offset-color' ? 'bg' : cat;
        d.value = d.value.replace(COLOR, (m, hex, r, g, b, a) => {
          let R; let G; let B; let A = null;
          if (hex) {
            let h = hex; if (h.length === 3) h = h.split('').map((c) => c + c).join('');
            R = parseInt(h.slice(0, 2), 16); G = parseInt(h.slice(2, 4), 16); B = parseInt(h.slice(4, 6), 16); if (h.length === 8) A = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 1000) / 1000;
          } else { R = Math.round(+r); G = Math.round(+g); B = Math.round(+b); A = a === undefined ? null : a; }
          if ([R, G, B].some((n) => Number.isNaN(n) || n > 255)) return m;
          if (R === 0 && G === 0 && B === 0) return m; // shadows and overlays stay black
          if (eff === 'tx' && R === 255 && G === 255 && B === 255) return m; // white text sits on coloured fills and stays white
          const key = `${eff}-${R}-${G}-${B}`; used.add(`${eff}:${R}-${G}-${B}`);
          return `rgb(var(--${key}, ${R} ${G} ${B})${A === null ? '' : ` / ${A}`})`;
        });
      });
      if (used.size) root.append(`:root{--aul-colors:"${[...used].sort().join(',')}"}`);
    },
  };
}
aulensiaTheme.postcss = true;
