/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        devanagari: ['"Noto Sans Devanagari"', 'ui-serif', 'system-ui', 'sans-serif']
      },
      /* Palette aligned with src/assets/bg.avif: deep navy, royal blue, gold accent */
      colors: {
        brand: {
          deep: '#060d1a',
          navy: '#0d2d7f',
          royal: '#1e4a9e',
          sky: '#3b6fb8',
          gold: '#c9a43a',
          'gold-bright': '#e8c547',
          surface: '#f4f7fb'
        },
        primary: '#1e4a9e',
        ink: '#0f1a2e',
        muted: '#5c6b7a'
      },
      boxShadow: {
        soft: '0 18px 50px rgba(13, 45, 127, 0.12)',
        card: '0 20px 50px rgba(5, 15, 40, 0.18)'
      }
    }
  },
  plugins: []
};
