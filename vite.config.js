import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed to GitHub Pages at https://mdqestablishment.github.io/IES-DASHBOARD/
// HashRouter handles client-side routing so deep links survive a static host.
export default defineConfig({
  plugins: [react()],
  base: '/IES-DASHBOARD/',
  // target es2022: harfbuzzjs self-initializes its WASM via top-level await,
  // which the default es2020 target rejects at build time.
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
})
