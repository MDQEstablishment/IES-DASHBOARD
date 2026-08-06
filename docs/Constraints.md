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

7. **Client-supplied documents are reference material only.** They are read to
   extract structure and formulas; neither the files nor any figure identifiable
   to a client enters the repository, the fixtures, or the commit history. If a
   test genuinely requires real values it uses anonymised or synthetic data, and
   the need is raised rather than solved quietly.

   **The one exception, and the price of it.** A client-supplied file may enter
   the repository only as a *de-identified derivative*, and only when all five
   of these hold:

   1. **Full-part cleaning.** Every member of the archive is enumerated and
      decided on individually — worksheet XML, the shared string table,
      comments and their VML shape parts, `docProps/core.xml`, `app.xml` and
      `custom.xml`, `customXml/*`, `docMetadata/*`, `xl/workbook.xml`, printer
      settings, media, and the relationship and content-type graphs that bind
      them. "The parts we thought were interesting" is not an enumeration.
   2. **A per-part proof, by the method of the last paragraph of this rule.**
      The proof lists every archive member, the detector categories run against
      it, the count per category before and after, and — for every hit that
      remains — the concrete sheet and cell that makes it the vendor's own
      format content. A remaining hit that cannot be attributed to a named cell
      is a failure, not a footnote. Binary members that no text scan can
      honestly clear are cleared by direct inspection instead, and the
      inspection is recorded.
   3. **The method is stated alongside the result.** How each part was decoded,
      what was searched for, and what the search could not have seen. A
      negative finding travels with its method or it does not travel.
   4. **Determinism and reproducibility.** The cleaning is performed by a
      script committed alongside the artefact, which produces byte-identical
      output from the same input on repeated runs. The input hash, the output
      hash and the exact list of members changed and removed are recorded, so a
      reviewer can re-run the clean and compare rather than take the result on
      trust.
   5. **The proof is stored with the file**, in the commit that introduces the
      artefact. An artefact whose proof has gone stale — the file changed and
      the proof did not — is treated as unproven.

   **What this exception is not.** It is not a licence to hold a client's
   project under another name. If cleaning cannot remove an element without
   destroying what makes the file useful, the file does not enter — the need is
   raised, per the paragraph above. And "cleaned" never means "we looked and
   found nothing": absence is established by the enumeration in (1) and the
   proof in (2), never by an inspection of what the file displays.

   The failure this rule exists for was not imperfect cleaning. It was a
   negative finding reported with confidence from a method that could only see
   part of the file: a visible-grid search of a stripped `.xlsx` found "zero
   client references" while 204 and 342 facility names sat in
   `xl/sharedStrings.xml`, with more in comments parts, `docProps/core.xml` and
   `customXml`. A negative finding is only as strong as the method that produced
   it, and for binary/compound formats a visible-layer search does not establish
   absence — unzip and search every part, or do not claim it is clean.

   **Evidence that (1) and (3) are load-bearing, from the first application of
   this exception.** Two findings, both recorded because they are the kind that
   a lighter method returns clean on:

   - The de-identification tooling's own scanner initially decoded UTF-8 parts
     as latin1. Arabic became mojibake and the Arabic detector reported **zero**
     on the very part holding hundreds of Arabic strings. This rule's failure
     mode reproduced itself *inside the verification tool*, and was caught only
     because the count was cross-checked against an independent parser.
   - Two identifier classes were found that no inventory had listed and no
     spreadsheet-level inspection could reach: an absolute filesystem path
     containing a person's name inside `xl/workbook.xml`, and internal
     print-server hostnames plus a Windows user-profile path inside the
     UTF-16-encoded binary `printerSettings*.bin` members. Both surfaced only by
     enumerating members and decoding each one more than one way.
