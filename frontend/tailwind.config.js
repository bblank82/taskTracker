/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#1a1a2e',
        surface: '#252538',
        elevated: '#2d2d42',
        border: '#3a3a52',
        'text-primary': '#e2e2f0',
        'text-secondary': '#9999b0',
        'text-muted': '#666680',
        accent: '#6366f1',
        overdue: {
          bg: '#3d1515',
          text: '#ff6b6b',
        },
        upcoming: {
          bg: '#2e2510',
          text: '#ffb347',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
