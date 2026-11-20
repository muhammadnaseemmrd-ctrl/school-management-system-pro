import aulensiaTheme from './postcss-aulensia.js'

// Tailwind first, then the theme plugin that turns its colours and radii into theme variables (see postcss-aulensia.js)
export default {
  plugins: [
    (await import('tailwindcss')).default(),
    (await import('autoprefixer')).default(),
    aulensiaTheme(),
  ],
}
