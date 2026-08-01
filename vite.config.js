import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed to GitHub Pages at https://mdqestablishment.github.io/IES-DASHBOARD/
// HashRouter handles client-side routing so deep links survive a static host.
export default defineConfig({
  plugins: [react()],
  base: '/IES-DASHBOARD/',
  // target es2022: harfbuzzjs self-initializes its WASM via top-level await,
  // which the default es2020 target rejects at build time.
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    // 9K(4) — split the vendor libraries out of the page chunks. Without this,
    // a library used by two lazy pages is COPIED into both, so route splitting
    // alone can make the total download larger. Each group below is a library
    // whose cost is worth isolating and caching on its own:
    //   react     — needed by every route, so it should be one long-lived file
    //   supabase  — same, the client is imported app-wide
    //   pdf       — pdf-lib + harfbuzzjs: reached only when someone actually
    //               produces a COC/MIR/WIR, and imported ONLY via await import()
    //   xlsx      — the spreadsheet reader/writer, imports and reports only
    //   leaflet   — the map, one screen
    // Anything not listed stays with the page that imports it.
    //
    // fflate is deliberately NOT grouped with pdf-lib, even though they are both
    // "document" libraries. It is imported STATICALLY (CocGenerateWizard,
    // ProgressReportCard, xlsxPatch), so putting it in the pdf chunk made that
    // whole 479 kB chunk a static dependency — the browser downloaded pdf-lib
    // and the Arabic shaper just to render the LOGIN screen. Measured, not
    // assumed: the smoke test fetches the chunk list, and vendor-pdf was in it.
    // Ungrouped, fflate rides along with whichever page imports it.
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vite's __vitePreload helper is a VIRTUAL module, so it matches none
          // of the rules below and Rollup is free to park it anywhere. It chose
          // vendor-pdf — which made that 479 kB chunk a STATIC import of the
          // entry, so the login screen downloaded pdf-lib and the Arabic shaper
          // to obtain a one-line helper. Caught by the smoke test reading the
          // network log, not by the bundle report, which showed a perfectly
          // reasonable chunk list either way. Pin it to the always-loaded chunk.
          if (id.includes('preload-helper')) return 'vendor-react'
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (/[\\/]node_modules[\\/](pdf-lib|harfbuzzjs)[\\/]/.test(id)) return 'vendor-pdf'
          if (/[\\/]node_modules[\\/]xlsx[\\/]/.test(id)) return 'vendor-xlsx'
          if (/[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) return 'vendor-leaflet'
        },
      },
    },
  },
  // 9K(4) M5 — and the SAME target has to be set again here, because the dev
  // dependency pre-bundler does not read build.target. It runs esbuild with its
  // own default browser list (chrome87/edge88/firefox78/safari14 + es2020), which
  // rejects harfbuzzjs's top-level await — so `npm run dev` died the moment
  // anything imported the PDF stack, while `npm run build` was always fine.
  // Nobody could run the app locally without the `vite preview` workaround.
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
})
