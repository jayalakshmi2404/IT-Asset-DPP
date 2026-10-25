/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Midnight-navy scale. Lower numbers are the darkest surfaces; higher numbers are text.
        ink: {
          50: '#070b17',
          100: '#101a2f',
          200: '#1b2742',
          300: '#2b3a5c',
          400: '#8190b0',
          500: '#a2acc8',
          600: '#c1c8dc',
          700: '#d7dcea',
          800: '#e8ecf6',
          900: '#f5f7fc',
          950: '#040712',
        },
        surface: {
          DEFAULT: '#0c1426',
          raised: '#111c35',
        },
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          300: '#93b4fd',
          400: '#608bfa',
          500: '#3b66f5',
          600: '#2547ea',
          700: '#1e37d6',
          800: '#1f2fad',
          900: '#1f2c88',
          950: '#161a52',
        },
        cyan: {
          glow: '#22d3ee',
        },
        violet: {
          glow: '#8b5cf6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(59,130,246,0.35), 0 0 28px -4px rgba(59,130,246,0.45)',
        popover: '0 24px 60px -12px rgba(0,0,0,0.8)',
      },
      // Motion tokens. Durations stay short so the UI never feels slow; reduced-motion is handled in index.css.
      transitionTimingFunction: {
        cinematic: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        fast: '160ms',
        base: '240ms',
        slow: '420ms',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        rise: 'rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
