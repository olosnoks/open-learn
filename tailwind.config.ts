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
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { tile: '0.75rem' },
      boxShadow: {
        tile: '0 4px 0 0 rgba(8, 59, 16, 0.25)',
        'tile-pressed': '0 1px 0 0 rgba(8, 59, 16, 0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config;
