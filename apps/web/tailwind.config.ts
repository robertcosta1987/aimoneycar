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
        // Primary - Deep Blue-Black with Electric Accents
        primary: {
          DEFAULT: '#00D9FF',
          50: '#E6FCFF',
          100: '#B3F5FF',
          200: '#80EEFF',
          300: '#4DE7FF',
          400: '#1AE0FF',
          500: '#00D9FF',
          600: '#00ADD9',
          700: '#0082A3',
          800: '#00566D',
          900: '#002B37',
        },
        // Secondary - Warm Gold for highlights
        secondary: {
          DEFAULT: '#FFB800',
          50: '#FFF8E6',
          100: '#FFEBB3',
          200: '#FFDE80',
          300: '#FFD14D',
          400: '#FFC41A',
          500: '#FFB800',
          600: '#D99C00',
          700: '#A37500',
          800: '#6D4E00',
          900: '#372700',
        },
        // Success Green
        success: {
          DEFAULT: '#00E676',
          500: '#00E676',
          600: '#00C853',
        },
        // Warning Orange
        warning: {
          DEFAULT: '#FF9100',
          500: '#FF9100',
          600: '#FF6D00',
        },
        // Danger Red
        danger: {
          DEFAULT: '#FF5252',
          500: '#FF5252',
          600: '#FF1744',
        },
        // Background Colors
        background: {
          DEFAULT: '#0A0E14',
          paper: '#111820',
          elevated: '#1A2332',
          hover: '#243044',
        },
        // Text Colors
        foreground: {
          DEFAULT: '#FFFFFF',
          muted: '#8B9EB3',
          subtle: '#5A6B7D',
        },
        // Border
        border: {
          DEFAULT: '#1E2A3A',
          hover: '#2E4058',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-lg': ['3.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['2.5rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        'display-sm': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      boxShadow: {
        'glow-primary': '0 0 40px rgba(0, 217, 255, 0.3)',
        'glow-secondary': '0 0 40px rgba(255, 184, 0, 0.3)',
        'glow-success': '0 0 40px rgba(0, 230, 118, 0.3)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.6)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #0A0E14 0%, #111820 50%, #1A2332 100%)',
        'gradient-hero': 'linear-gradient(180deg, rgba(0, 217, 255, 0.1) 0%, transparent 50%)',
        'noise': "url('/images/noise.png')",
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.5s ease-out',
        'fade-in': 'fadeIn 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%': { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
