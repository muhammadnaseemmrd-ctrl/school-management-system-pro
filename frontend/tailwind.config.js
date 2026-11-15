export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f6b4f',
        secondary: '#1f8a68',
        tertiary: '#a9d6c0',
        accent: '#2f8f6f',
        success: '#2a8a5c',
        danger: '#a8392d',
        warning: '#c98410',
        light: '#edf5f0',
        dark: '#0c2f25',
        sage: '#4d7262',
        canvas: '#e9f2ed',
        surface: '#f7fbf8',
        panel: '#fbfdfb',
        line: '#d3e4da',
        ink: '#0c2f25',
        mint: '#2f9e6a',
        gold: '#d99a1b',
        sky: '#2f8f6f',
        rose: '#c0483a',
      },
      backgroundImage: {
        'gradient-soft': 'linear-gradient(135deg, #0f6b4f 0%, #1f8a68 100%)',
        'gradient-pastel': 'linear-gradient(135deg, #e9f2ed 0%, #d9e8df 100%)',
        'gradient-hero': 'linear-gradient(135deg, #edf5f0 0%, #e1eee6 50%, #cfe0d6 100%)',
        'gradient-card': 'linear-gradient(180deg, #fbfdfb 0%, #edf5f0 100%)',
      },
    },
  },
  plugins: [],
}
