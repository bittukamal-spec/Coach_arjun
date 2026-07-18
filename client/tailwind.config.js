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
          900: 'rgb(var(--dark-900) / <alpha-value>)', // page background
          800: 'rgb(var(--dark-800) / <alpha-value>)', // surface / section bg
          700: 'rgb(var(--dark-700) / <alpha-value>)', // elevated surface / inputs
          600: 'rgb(var(--dark-600) / <alpha-value>)', // border
          500: 'rgb(var(--dark-500) / <alpha-value>)', // soft border
          400: 'rgb(var(--dark-400) / <alpha-value>)', // card
          300: 'rgb(var(--dark-300) / <alpha-value>)', // card muted / alternate card
          200: 'rgb(var(--dark-200) / <alpha-value>)', // hover states
          100: 'rgb(var(--dark-100) / <alpha-value>)', // active/selected
        },

        // Primary brand — deep blue
        brand: {
          50:  'rgb(var(--brand-50) / <alpha-value>)', // active bg (tab pills, icon bg)
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
        ink:   'rgb(var(--ink)   / <alpha-value>)', // primary text
        slt:   'rgb(var(--slt)   / <alpha-value>)', // secondary text
        muted: 'rgb(var(--muted) / <alpha-value>)', // muted text
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
      // ── Stage 3 foundation: minimal type scale ─────────────────────────────
      // Size + line-height (+ tracking) only; weight stays a per-use utility.
      fontSize: {
        display: ['1.875rem', { lineHeight: '1.1' }],   // big stat numbers
        title:   ['1.25rem',  { lineHeight: '1.3' }],   // card/hero titles
        heading: ['1rem',     { lineHeight: '1.4' }],   // page header titles
        body:    ['0.875rem', { lineHeight: '1.5' }],   // default copy
        caption: ['0.75rem',  { lineHeight: '1.4' }],   // secondary copy
        micro:   ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.1em' }], // section labels
      },
      // ── Stage 3 foundation: semantic spacing ───────────────────────────────
      spacing: {
        page: '1rem',      // horizontal page gutter
        section: '1.75rem', // vertical rhythm between page sections
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
