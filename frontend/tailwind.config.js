// Aulensia design tokens (PRD V6 section 07).
// Old token names (primary, secondary, ink, gold, mint ...) are kept so existing screens re-theme in one place,
// but every value now comes from the paper / ink / blue / teal / clay palette.
const ink = '#1B2837';
const paper = '#F7F6F2';
const blue = '#2A5CAC';
const teal = '#2C776C';
const clay = '#B86650';

// Tints for semantic classes already used across the app (emerald/green = confirmed, amber/yellow = attention).
const tealRamp = {
  50: '#EDF5F3', 100: '#D6E8E4', 200: '#B3D3CC', 300: '#86B8AE', 400: '#4F9488',
  500: teal, 600: '#266A60', 700: '#215A52', 800: '#1C4A44', 900: '#173B37',
};
const clayRamp = {
  50: '#FBF0EC', 100: '#F5DDD4', 200: '#ECC7B9', 300: '#E3B4A4', 400: '#D9826A',
  500: clay, 600: '#A2543F', 700: '#8A4636', 800: '#6F382B', 900: '#552B22',
};

const blueRamp = {
  50: '#EEF2F8', 100: '#DCE5F2', 200: '#C9D6EA', 300: '#9FB6DC', 400: '#6F93CB',
  500: blue, 600: '#234C91', 700: '#1D3F79', 800: '#183463', 900: '#12294E', DEFAULT: blue,
};
const dangerRamp = {
  50: '#FFF1F2', 100: '#FDDDDF', 200: '#F6BDC0', 300: '#EC9296', 400: '#D95A5F',
  500: '#C43A3F', 600: '#B3261E', 700: '#9F1239', 800: '#7F1D2B', 900: '#611A25', DEFAULT: '#B3261E',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink,
        paper,
        blue: blueRamp,
        teal: { ...tealRamp, DEFAULT: teal },
        clay: { ...clayRamp, DEFAULT: clay },
        primary: blue,
        secondary: '#234C91',
        tertiary: '#C9D6EA',
        accent: blue,
        success: teal,
        danger: '#B3261E',
        warning: clay,
        light: '#EEF2F8',
        dark: ink,
        sage: '#5B6B7B',
        canvas: paper,
        surface: '#FFFFFF',
        panel: '#FFFFFF',
        line: '#E3E7E7',
        mint: teal,
        gold: clay,
        sky: blueRamp,
        rose: dangerRamp,
        red: dangerRamp,
        emerald: tealRamp,
        green: tealRamp,
        amber: clayRamp,
        yellow: clayRamp,
        violet: blueRamp,
        purple: blueRamp,
        indigo: blueRamp,
        lime: tealRamp,
        orange: clayRamp,
      },
      fontFamily: {
        sans: ['Inter', '"Noto Naskh Arabic"', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['Georgia', '"Times New Roman"', 'serif'],
        urdu: ['"Noto Naskh Arabic"', 'Tahoma', 'serif'],
      },
      // Interactive 6-8px, surfaces 11px: no pill-shaped task interfaces.
      borderRadius: { lg: '6px', xl: '8px', '2xl': '11px', '3xl': '11px' },
      // Flat surfaces: hairlines instead of heavy shadows.
      boxShadow: {
        sm: '0 1px 0 rgba(27,40,55,0.04)',
        DEFAULT: '0 1px 2px rgba(27,40,55,0.06)',
        md: '0 2px 8px rgba(27,40,55,0.07)',
        lg: '0 6px 18px rgba(27,40,55,0.09)',
        xl: '0 10px 26px rgba(27,40,55,0.11)',
        '2xl': '0 18px 40px rgba(27,40,55,0.16)',
      },
      fontWeight: { extrabold: '700', black: '700' },
      keyframes: {
        'ui-rise': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'ui-fade': { from: { opacity: '0' }, to: { opacity: '1' } },
        'ui-pop': { from: { opacity: '0', transform: 'translateY(8px) scale(0.985)' }, to: { opacity: '1', transform: 'none' } },
        'ui-slide-in': { from: { opacity: '0', transform: 'translateX(-10px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        rise: 'ui-rise 180ms cubic-bezier(0.2,0.7,0.2,1) both',
        fade: 'ui-fade 160ms ease-out both',
        pop: 'ui-pop 200ms cubic-bezier(0.2,0.7,0.2,1) both',
        'slide-in': 'ui-slide-in 200ms cubic-bezier(0.2,0.7,0.2,1) both',
      },
    },
  },
  plugins: [],
};
