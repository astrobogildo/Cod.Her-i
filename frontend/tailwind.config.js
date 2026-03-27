/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hero: {
          50:  '#edf5ff',
          100: '#d6e8ff',
          200: '#b5d6ff',
          300: '#83bbff',
          400: '#4894ff',
          500: '#1e6aff',
          600: '#0648ff',
          700: '#0038f5',
          800: '#052fc6',
          900: '#0a2b9c',
          950: '#0c1a5e',
        },
      },
    },
  },
  plugins: [],
}
