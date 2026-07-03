/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg:      '#0F172A',
        surface: '#1E293B',
        card:    '#334155',
        brand:   '#1769AA',
        saffron: '#F29B38',
      },
    },
  },
  plugins: [],
};
