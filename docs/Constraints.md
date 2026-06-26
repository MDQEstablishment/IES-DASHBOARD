# IES Platform — standing hard constraints

These hold every sprint unless the owner explicitly amends them.

1. **Zero Arabic in UI source / DB / locale.** No Arabic text or Arabic-Indic
   numerals in component source, seed data, or user-facing strings. Enforced by
   the doc-name sanitize migrations (0045 / 0047 / 0051) and a per-sprint grep
   gate over `src/`.

   **Sanctioned exceptions (do not flag these):**
   - `src/lib/docPdf.js` — the COC bilingual template renders fixed Arabic field
     labels (Amiri font, RTL) to stay pixel-faithful to the Tarshid form.
   - `public.buildings.name_ar` — the original Arabic site name from the tender
     source, stored as a **data identifier** (so a bulk import maps cleanly to
     the DIP/TDS), not as a UI string. It is shown only as a small grey,
     RTL subtitle under the English building name. Approved in Sprint 8B (#21);
     the Excel template carries it as the optional `arabic_name` column.

2. **Zero dead buttons.** Every control does something or is visibly disabled.
3. **Zero broken PDFs.** Visual JPG inspection before claiming a PDF change done.
4. **Tarshid templates pixel-faithful.** Helvetica (StandardFonts) for English
   MIR/WIR; Amiri (subset:false) for the COC Arabic labels.
5. **Additive migrations only** — no destructive ops without explicit owner sign-off.
6. **Run every test / build before claiming done; live-site smoke after deploy.**
