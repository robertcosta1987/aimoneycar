import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          50:  '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          500: '#16A34A',
          600: '#15803D',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          500: '#D97706',
          600: '#B45309',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          500: '#DC2626',
          600: '#B91C1C',
        },
        background: {
          DEFAULT:  'rgb(var(--bg) / <alpha-value>)',
          paper:    'rgb(var(--bg-paper) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
          hover:    'rgb(var(--bg-hover) / <alpha-value>)',
        },
        foreground: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted:   'rgb(var(--fg-muted) / <alpha-value>)',
          subtle:  'rgb(var(--fg-subtle) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          hover:   'rgb(var(--border-hover) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
        'display-md': ['2.5rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-sm': ['2rem',   { lineHeight: '1.2',  letterSpacing: '-0.015em' }],
      },
      boxShadow: {
        'glow-primary':   '0 0 0 1px rgb(var(--primary) / 0.3), 0 4px 24px rgb(var(--primary) / 0.2)',
        'glow-secondary': '0 0 0 1px rgb(var(--secondary) / 0.3), 0 4px 24px rgb(var(--secondary) / 0.2)',
        'glow-success':   '0 0 0 1px rgb(var(--success) / 0.3), 0 4px 24px rgb(var(--success) / 0.15)',
        'glow-accent':    '0 0 0 1px rgb(var(--accent) / 0.3), 0 4px 24px rgb(var(--accent) / 0.2)',
        'card':           '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)',
        'card-hover':     '0 4px 16px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-dark':      '0 1px 2px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        'inner-highlight':'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'gradient-radial':   'radial-gradient(var(--tw-gradient-stops))',
        'gradient-primary':  'linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--accent)) 100%)',
        'gradient-mesh':     'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 50%, #E8EFF8 100%)',
        'gradient-hero':     'linear-gradient(180deg, rgba(2,98,160,0.05) 0%, transparent 60%)',
        'gradient-dark':     'linear-gradient(180deg, rgba(56,189,248,0.04) 0%, transparent 60%)',
        'dot-grid':          'radial-gradient(rgb(var(--primary) / 0.07) 1px, transparent 1px)',
      },
      animation: {
        'pulse-slow':  'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float':       'float 6s ease-in-out infinite',
        'glow':        'glow 2s ease-in-out infinite alternate',
        'slide-up':    'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down':  'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in':     'fadeIn 0.35s ease-out',
        'scale-in':    'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer':     'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        glow: {
          '0%':   { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        slideDown: {
          '0%':   { transform: 'translateY(-16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',      opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%':   { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
    },
  },
  plugins: [],
};

export default config;
