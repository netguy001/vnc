/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic surface/text/border tokens — backed by CSS variables so both
        // themes share one class vocabulary (bg-app, bg-panel, text-primary, etc).
        // Defined in index.css under :root and [data-theme="light"].
        app: 'rgb(var(--color-app) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        'panel-alt': 'rgb(var(--color-panel-alt) / <alpha-value>)',
        'panel-inset': 'rgb(var(--color-panel-inset) / <alpha-value>)',
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          strong: 'rgb(var(--color-border-strong) / <alpha-value>)',
        },
        content: {
          primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        },
        background: '#090d16',
        surface: {
          50: '#1e293b',
          100: '#151e2e',
          200: '#0f172a',
          300: '#0b1120',
          border: '#1e293b',
          hover: '#1e293b80'
        },
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        terminal: {
          bg: '#0a0f1d',
          fg: '#e2e8f0',
          cursor: '#38bdf8',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
