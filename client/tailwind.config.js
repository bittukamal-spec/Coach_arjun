/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark backgrounds
        dark: {
          900: '#0A0A15',
          800: '#12122A',
          700: '#1E1E3F',
          600: '#2A2A50',
          500: '#3A3A60',
        },
        // Primary brand — purple (mental focus)
        brand: {
          50:  '#F5F3FF',
          100: '#EDE9FE',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
        },
        // Energy — streaks, XP, fire
        fire: {
          400: '#FBBF24',
          500: '#F97316',
          600: '#EA580C',
        },
        // Success — achievements, completed
        win: {
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
        },
        // Keep calm for backwards compat (charts etc.)
        calm: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#059669',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':      'fadeIn 0.4s ease-out',
        'badge-pop':    'badgePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'flame-pulse':  'flamePulse 2s ease-in-out infinite',
        'xp-float':     'xpFloat 1s ease-out forwards',
        'slide-up':     'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        badgePop: {
          '0%':   { transform: 'scale(0) rotate(-10deg)', opacity: '0' },
          '70%':  { transform: 'scale(1.15) rotate(3deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        flamePulse: {
          '0%, 100%': { transform: 'scale(1)', filter: 'brightness(1)' },
          '50%':      { transform: 'scale(1.12)', filter: 'brightness(1.3)' },
        },
        xpFloat: {
          '0%':   { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-40px) scale(1.4)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
