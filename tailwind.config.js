/** @type {import('tailwindcss').Config} */
// Sprint 8M — IES Control Visual Redesign tokens (additive). NOTE: the live
// design system is CSS variables + inline styles in src/index.css; these theme
// extensions mirror the same tokens so any future Tailwind usage stays on-palette.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        chrome: { navy: '#10273B', elevated: '#1B3A53' },
        brass: { DEFAULT: '#A0762B', hover: '#8A6524', bright: '#C29A4B' },
        paper: { canvas: '#F5F3ED', raised: '#FBFAF6', hover: '#FAF8F2' },
        ink: { DEFAULT: '#1A2530', display: '#16222D' },
        muted: { DEFAULT: '#8A8577', faint: '#A39D8E' },
        edge: { DEFAULT: '#E3DFD3', soft: '#F0EDE4', control: '#DCD6C7' },
        track: '#EDEAE0',
        ok: { DEFAULT: '#217A54', bg: '#E9F3EE' },
        warn: { DEFAULT: '#B45309', bg: '#FAF3E3' },
        bad: { DEFAULT: '#B3362B', bg: '#F9ECEA' },
        info: { DEFAULT: '#3E5C8A', bg: '#EBF0F7' },
        esm1: { DEFAULT: '#3E5C8A', bg: '#EBF0F7' },
        esm2: { DEFAULT: '#6D5A8E', bg: '#F0EDF6' },
        esm3: { DEFAULT: '#2A7A72', bg: '#E8F3F1' },
        chromeText: { DEFAULT: '#F0EDE3', idle: '#8DA0B1', sub: '#6E8093' },
        live: '#5FA987',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '10px', control: '6px', modal: '12px', badge: '4px', pill: '20px', progress: '2px' },
      boxShadow: {
        card: '0 1px 2px rgba(22,29,36,0.05)',
        modal: '0 24px 60px rgba(16,24,32,0.32)',
        ring: '0 0 0 3px rgba(160,118,43,0.12)',
      },
    },
  },
  // The design system lives in src/index.css as CSS variables + component classes;
  // Tailwind preflight is disabled so it never fights those hand-tuned styles.
  corePlugins: { preflight: false },
  plugins: [],
}
