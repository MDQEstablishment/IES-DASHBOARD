# Binary asset sweep — fonts, images, and the generated project template

Constraints #8 requires that every member a text scan cannot read be enumerated,
and that each one carry either the alternative method that cleared it or the
plain words *not cleared*. This document is the method half of that record for
the fonts, raster images and the one committed `.xlsx` in `public/`. The
machine-checked half is `docs/unreadable-manifest.json`, enforced by
`tests/unreadableList.test.mjs`.

A negative finding travels with its method or it does not travel, so the method
is stated first, including what it could not see.

## Method

Each file was read whole and decoded **three ways** — UTF-16BE, UTF-16LE and
latin1 — and each decoding searched for the client-identifier set
(`MOI`, `Asir`, `Faisal`, `DIP`, `Tarshid`, `PO-<digits>`, `INV-<digits>`),
case-insensitive. Separately, each file was scanned for embedded metadata
containers: PNG `tEXt` / `iTXt` / `zTXt` chunks, `Exif` blocks, and Adobe XMP
packets.

The three-way decode is the point. An ASCII-run scan alone would have missed
TrueType `name` table records, which are UTF-16BE — the same class of blind spot
that produced the mojibake failure recorded in Constraints #7, where an Arabic
detector read UTF-8 as latin1 and reported zero on a part holding hundreds of
Arabic strings.

**What this method could not see.** Compressed glyph data inside `woff2`
(Brotli) was not decompressed — the scan reads the container, not the
decompressed tables. For the two Inter faces this leaves compressed glyph
outlines unexamined. That is accepted here on provenance grounds rather than
scan grounds: they are unmodified upstream SIL OFL releases, not files that ever
passed through a client's hands. Stated rather than glossed, because a limit
that goes unmentioned is the failure this rule exists for.

## Results

| file | client hits | metadata chunks |
| --- | --- | --- |
| `public/fonts/Amiri-Regular.ttf` | none | none |
| `public/fonts/Amiri-Bold.ttf` | none | none |
| `public/fonts/inter-400.woff2` | none | none |
| `public/fonts/inter-600.woff2` | none | none |
| `public/murshid-avatar-192.png` | none | none |
| `public/murshid-avatar-384.png` | none | none |
| `public/murshid-avatar-192.webp` | none | none |
| `public/murshid-avatar-384.webp` | none | none |
| `public/tarshid-logo.png` | none | none |

The Amiri `name` tables were dumped and show the SIL Open Font License text and
`openfontlicense.org` — upstream provenance evidenced rather than asserted.
Amiri is required by Constraints #4 for the COC Arabic labels, so it stays.

## `public/templates/IES-Project-Template-v3.xlsx` — cleared, but it should not be here

Cleared on provenance: it is produced by `scripts/generate-project-template.js`
from values written in that script. No client file is an input, so there is no
client content to find.

It is nevertheless **the anti-pattern**: a build output committed as a binary,
reproducible from a committed generator yet stored beside it, reviewable in no
diff, and free to drift from the code that makes it. It is served statically
from `BASE_URL/templates/`, so deleting it requires a build step that generates
it into `dist/` first.

That change belongs to the queued Excel-import sprint, which replaces this
template outright — doing it here would mean doing it twice. Recorded here so
the reason it survived this pass is on the record rather than implied.

## What was removed by this sweep

`seeds/fixtures/sample-delivery-note.pdf` was **not a sample**. Decoded through
its content streams it carried a named client engagement (`MOI - Asir (DIP)`), a
real supplier, `PO-2026-0412`, `INV-88231`, and Arabic strings as subset-font
glyph IDs. Every string in it is hex-encoded, so a literal-string scan returned
zero characters and prior sweeps read it as synthetic because the filename said
so — failure mode #3 in Constraints #8, in the tree, months after that rule was
written to catch exactly it.

It is deleted from the working tree and replaced by
`scripts/make-delivery-note-fixture.mjs`, which generates a deterministic
synthetic delivery note (verified: two runs, identical sha256) into a gitignored
path, so no PDF is tracked at all.

**The file remains in history at `9bb5ac6`.** Removing it from history requires a
rewrite and force-push, which is the owner's decision and is not taken here.
