import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed to GitHub Pages at https://mdqestablishment.github.io/IES-DASHBOARD/
// HashRouter handles client-side routing so deep links survive a static host.
export default defineConfig({
  plugins: [react()],
  base: '/IES-DASHBOARD/',
  build: { outDir: 'dist', sourcemap: true },
})
