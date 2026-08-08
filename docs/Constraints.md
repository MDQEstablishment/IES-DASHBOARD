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

   **The worked example — why conditions (2) and (3) are not bureaucracy.**
   During the first application of this exception, the de-identification
   tooling's own scanner decoded UTF-8 parts as latin1. Arabic became mojibake,
   and the Arabic detector reported **zero on the very part holding hundreds of
   Arabic strings**. *This rule's failure mode reproduced itself inside the tool
   written to prevent it.* It was caught only because the count was
   cross-checked against an independent parser.

   That is the whole argument. A verification tool can fail in precisely the way
   it exists to catch, and it will report success while doing so. Therefore a
   clean result is worth nothing on its own: the method must be stated so it can
   be judged, and cross-checked so a single tool's blind spot cannot pass for
   absence. "The checker said clean" is not evidence — it is the claim awaiting
   evidence.

8. **THE UNREADABLE LIST — a sweep without one is invalid.**
*This is a rule, not advice. A confidentiality sweep that does not carry
this list is not a weak sweep; it is not a sweep, and its result may not
be reported, relied on, or recorded as a finding.*

Every sweep must publish, alongside its result, an explicit enumeration of
**every member it could not read**, and for each one either the alternative
method that cleared it or the plain words *not cleared*. Categories that
must appear by name whenever present: compressed archives (`.xlsx`,
`.docx`, `.zip`); raster and vector images; fonts; PDFs — **especially
PDFs whose text is hex-encoded against subset fonts, where a literal-string
scan returns zero characters from a page full of text**; binary members
detected by NUL bytes; anything skipped by size; and anything skipped by
file extension.

A result reported without that list is **invalid on its face**, regardless
of how thorough the readable part was. "We scanned everything we could
read" is not a finding — it is the shape of the last three failures.

The count now stands at three, each the same shape, each costing a cycle:

1. A visible-grid scan of a stripped `.xlsx` reported "zero client
   references" while 204 and 342 facility names sat in `sharedStrings`.
2. The de-identification scanner decoded UTF-8 as latin-1 and reported
   **zero Arabic on the part holding hundreds of Arabic strings** — the
   rule's own failure mode, inside the tool written to prevent it.
3. A whole-object-database sweep reported two `Client_*.pdf` files clean
   because their text is hex-encoded against subset fonts and the
   literal-string scan returned **zero characters**. Decoded through their
   `ToUnicode` CMaps, they carry a named client engagement, asset counts
   and the contract value — and their own footers say *Confidential*. They
   were caught **only** because they appeared on the unreadable list and
   the list was worked through instead of waved past.

Every one of the three was a *confident negative from a method that could
not see the whole file*. The unreadable list is the only mechanism that
turns "I found nothing" into a claim a reviewer can actually judge, because
it states where the method's eyes were shut. Enumerate what you could not
   read, or do not report a result.

   **Enforced, since 2026-08-08, by `tests/unreadableList.test.mjs`.** The rule
   lived here alone for weeks and was therefore enforced by whoever remembered
   it; the gate reads the tracked tree on every CI run and fails unless every
   member a text scan cannot read is declared in `docs/unreadable-manifest.json`
   with its method. Its first run found `seeds/fixtures/sample-delivery-note.pdf`
   — hex-encoded, named client engagement, read as synthetic by every prior
   sweep because the filename said "sample". That is a fourth instance of the
   shape above, and the first one caught by a machine instead of a cycle.

**A second finding, on the breadth of what to search for.** Two identifier
classes were found that no inventory had listed and no spreadsheet-level
inspection could reach: an absolute filesystem path containing a person's
name inside `xl/workbook.xml`, and internal print-server hostnames plus a
Windows user-profile path inside the UTF-16-encoded binary
`printerSettings*.bin` members. Both surfaced only by enumerating members and
decoding each one more than one way. The general form: an office document
carries authorship infrastructure — people, hostnames, paths, tenant
identifiers, protection labels — that nobody puts there deliberately and no
category list written from the *expected* content will name.
