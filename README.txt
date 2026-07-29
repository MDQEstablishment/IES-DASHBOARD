IES PROGRAMME CONTROL PLATFORM
==============================

Tarshid energy-retrofit programme control: projects, buildings, field survey,
materials, deliveries, doc tracker, COCs, reports.

Stack: React 18 + Vite 5, Supabase (Postgres + RLS + Edge Functions + Storage),
HashRouter, inline styles over CSS variables (src/index.css).

Run locally:
  npm install
  npm run dev

Build:  npm run build        (output in dist/)
Deploy: push to main — GitHub Actions builds and publishes to GitHub Pages at
        https://mdqestablishment.github.io/IES-DASHBOARD/

Database schema lives in supabase/migrations/ (applied via Supabase, not by the
app). Feature flags live in src/lib/constants.js (FEATURES) — the Saving Sheet
deliverable is currently parked behind FEATURES.savingSheet = false.

The *.html files at the repo root are the original static design mockups the
app was built from — reference only, not served.
