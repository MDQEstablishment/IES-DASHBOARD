/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  // The design system lives in src/index.css as CSS variables + component classes;
  // Tailwind preflight is disabled so it never fights those hand-tuned styles.
  corePlugins: { preflight: false },
  plugins: [],
}
