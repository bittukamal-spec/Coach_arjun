/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Dark athletic theme ────────────────────────────────────────────────
        // These map the existing `dark-*` tokens to the new dark navy palette.
        // All redesigned screens use bg-dark-900 for page, bg-dark-400/300 for cards.
        dark: {
          900: '#07131F', // page background
          800: '#0B1B2A', // surface / section bg
          700: '#102538', // elevated surface / inputs
          600: '#2B4157', // border
          500: '#1F3448', // soft border
          400: '#132334', // card
          300: '#1B3044', // card muted / alternate card
          200: '#22384F', // hover states
          100: '#2E4D69', // active/selected
        },

        // Primary brand — deep blue
        brand: {
          50:  '#0D2A4A', // dark active bg (tab pills, icon bg)
          100: '#0F3357', // dark subtle accent
          200: '#1A4E80', // medium dark blue
          300: '#2A72B5', // medium blue
          400: '#1F85D0', // bright blue (links, highlights)
          500: '#1769AA', // primary action
          600: '#0C4D85', // pressed
          700: '#083869', // darkest brand
        },

        // Amber / saffron — streaks, XP, fire
        fire: {
          300: '#FAD08A',
          400: '#F59E0B',
          500: '#F29B38',
          600: '#D97F1E',
        },
        saffron: {
          300: '#FAD08A',
          400: '#F5A62E',
          500: '#F29B38',
          600: '#D97F1E',
        },

        // Teal — check-ins, calm, recovery
        teal: {
          300: '#7AE8E0',
          400: '#4ADDD2',
          500: '#22D3C5',
          600: '#18B0A5',
        },

        // Purple — visualization, mental skills
        purple: {
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
        },

        // Green — success, streaks done, achievements
        win: {
          300: '#4ADE80',
          400: '#22C55E',
          500: '#16A34A',
          600: '#15803D',
        },

        // Semantic text tokens
        ink:   '#F8FAFC', // primary text (light on dark)
        slt:   '#AAB7C4', // secondary text
        muted: '#7E8A99', // muted text
        alert: '#EF4444', // errors
        success: '#22C55E',

        // Bright blue accent (active states, glow)
        navy: {
          bright: '#19A7FF',
          glow:   '#1769AA',
        },

        // Backwards compat
        calm: {
          50:  '#0B2A20',
          100: '#0F3827',
          500: '#16A34A',
          600: '#15803D',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(23, 105, 170, 0.35)',
        'glow-saffron': '0 0 20px rgba(242, 155, 56, 0.3)',
        'glow-teal': '0 0 20px rgba(34, 211, 197, 0.3)',
        'card': '0 2px 12px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-in':      'fadeIn 0.4s ease-out',
        'badge-pop':    'badgePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'flame-pulse':  'flamePulse 2s ease-in-out infinite',
        'xp-float':     'xpFloat 1s ease-out forwards',
        'slide-up':     'slideUp 0.3s ease-out',
        'pulse-slow':   'pulse 3s ease-in-out infinite',
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
