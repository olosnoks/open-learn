import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'var(--brand-50)', 100: 'var(--brand-100)', 200: 'var(--brand-200)',
          300: 'var(--brand-300)', 400: 'var(--brand-400)', 500: 'var(--brand-500)',
          600: 'var(--brand-600)', 700: 'var(--brand-700)', 800: 'var(--brand-800)',
          900: 'var(--brand-900)',
        },
        cream: { DEFAULT: 'var(--cream)', 100: 'var(--cream-100)', 200: 'var(--cream-200)' },
        ink: { DEFAULT: 'var(--ink)', muted: 'var(--ink-muted)' },
        answer: {
          red: 'var(--answer-red)', blue: 'var(--answer-blue)',
          yellow: 'var(--answer-yellow)', green: 'var(--answer-green)',
          purple: 'var(--answer-purple)', orange: 'var(--answer-orange)',
        },
        metal: { gold: 'var(--gold)', silver: 'var(--silver)', bronze: 'var(--bronze)' },
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { tile: '1rem' },
      boxShadow: {
        tile: '0 5px 0 0 rgba(0, 0, 0, 0.22)',
        'tile-pressed': '0 1px 0 0 rgba(0, 0, 0, 0.22)',
        'tile-selected': '0 5px 0 0 rgba(0, 0, 0, 0.22), inset 0 0 0 4px rgba(255, 255, 255, 0.95)',
        card: '0 1px 2px rgba(8, 59, 16, 0.06), 0 12px 32px -16px rgba(8, 59, 16, 0.35)',
        glow: '0 0 0 6px rgba(90, 163, 95, 0.35)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'none' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(0.8)' }, '70%': { transform: 'scale(1.04)' }, to: { opacity: '1', transform: 'none' } },
        'bar-grow': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
        rise: { from: { opacity: '0', transform: 'translateY(48px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.55' } },
        wiggle: { '0%, 100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-6deg)' }, '75%': { transform: 'rotate(6deg)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'pop-in': 'pop-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'bar-grow': 'bar-grow 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        rise: 'rise 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        shimmer: 'shimmer 1.2s ease-in-out infinite',
        wiggle: 'wiggle 0.5s ease-in-out 1',
      },
    },
  },
  plugins: [],
} satisfies Config;
