/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Page backgrounds → light theme
        dark: {
          900: '#FFFFFF',   // page bg
          800: '#EFEDE6',   // surface / cards
          700: '#E8E6DF',   // input bg
          600: '#C2CCC6',   // visible border
          500: '#B0BDB7',   // lighter border
        },
        // Primary brand — teal (mental performance)
        brand: {
          50:  '#F0FAF6',
          100: '#CBE9DD',
          200: '#97D4BC',
          300: '#5BB89A',
          400: '#2D9575',
          500: '#0B6E4F',
          600: '#095E42',
          700: '#074F38',
        },
        // Action accent — amber (CTAs, streaks)
        fire: {
          300: '#F5B97A',
          400: '#EE9041',
          500: '#E2711D',
          600: '#C95B0D',
        },
        // Success — achievements, completed
        win: {
          300: '#5BCE85',
          400: '#35B05E',
          500: '#18733B',
          600: '#135E30',
        },
        // Semantic text tokens
        ink:   '#15211C',   // primary text
        slt:   '#41524A',   // secondary text
        alert: '#B83227',   // errors / alerts
        // Keep calm for backwards compat (charts etc.)
        calm: {
          50:  '#F0FAF6',
          100: '#CBE9DD',
          500: '#18733B',
          600: '#135E30',
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
