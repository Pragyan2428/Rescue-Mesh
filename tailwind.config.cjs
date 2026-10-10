/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#07111B',
        surface: '#0D1B28',
        raised: '#13263A',
        line: '#1E3347',
        signal: '#61E6E0',
        amber: '#FF9E43',
        coral: '#FF6B5E',
        go: '#7BD88F',
        ink: '#EAF2F8',
        mist: '#8EA3B5',
        dim: '#5D7387',
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans: ['"Source Sans 3"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: { label: '0.14em' },
    },
  },
  plugins: [],
};
