import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2937',
        canvas: '#f7f5f2',
        panel: '#fffdf8',
        sand: '#ece5dc',
        accent: '#2f6c5d',
        accentSoft: '#deeee8',
        gold: '#c48b45',
        danger: '#c46452',
      },
      boxShadow: {
        card: '0 18px 45px rgba(59, 47, 34, 0.08)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        sans: ['"Avenir Next"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [forms],
}
