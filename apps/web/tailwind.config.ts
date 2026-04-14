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
        // Primary — deep sky blue, readable on white
        primary: {
          DEFAULT: '#0369A1',
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
        // Secondary — warm amber (darkened for white bg)
        secondary: {
          DEFAULT: '#B45309',
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
        // Success
        success: {
          DEFAULT: '#15803D',
          500: '#16A34A',
          600: '#15803D',
        },
        // Warning
        warning: {
          DEFAULT: '#B45309',
          500: '#D97706',
          600: '#B45309',
        },
        // Danger
        danger: {
          DEFAULT: '#B91C1C',
          500: '#DC2626',
          600: '#B91C1C',
        },
        // Backgrounds — white-based
        background: {
          DEFAULT: '#FFFFFF',
          paper:   '#F8FAFC',
          elevated:'#F1F5F9',
          hover:   '#E2E8F0',
        },
        // Text — dark on white
        foreground: {
          DEFAULT: '#0F172A',
          muted:   '#64748B',
          subtle:  '#94A3B8',
        },
        // Border — light gray
        border: {
          DEFAULT: '#E2E8F0',
          hover:   '#CBD5E1',
        },
      },
      fontFamily: {
        sans:    ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['2.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'display-sm': ['2rem',   { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      boxShadow: {
        'glow-primary':   '0 0 24px rgba(3, 105, 161, 0.15)',
        'glow-secondary': '0 0 24px rgba(180, 83, 9, 0.15)',
        'glow-success':   '0 0 24px rgba(21, 128, 61, 0.15)',
        'card':           '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)',
        'card-hover':     '0 4px 8px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh':   'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 50%, #E2E8F0 100%)',
        'gradient-hero':   'linear-gradient(180deg, rgba(3,105,161,0.06) 0%, transparent 50%)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float':      'float 6s ease-in-out infinite',
        'glow':       'glow 2s ease-in-out infinite alternate',
        'slide-up':   'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'fade-in':    'fadeIn 0.5s ease-out',
        'scale-in':   'scaleIn 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%':   { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        slideDown: {
          '0%':   { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',      opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%':   { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
