# Removal plan — `seed/moi-asir-buildings.csv` and the sibling sweep

**Status: PLAN ONLY. Nothing in this document has been executed.**
Owner approved removal of `seed/moi-asir-buildings.csv`. Section 3 lists
**newly found siblings the owner has not yet ruled on** — they are recommended
for the same rewrite, and each is marked `NEEDS RULING`.

**Standing prohibition, honoured throughout.** No byte of
`seed/moi-asir-buildings.csv` has been read at any point in preparing this
plan, and none is read by any command in it. The file is identified
**only** by path and by blob hash. Every verification step below is a
hash-or-path existence test; not one of them decodes the object.

---

## 1. Identity of the artefact

| property | value |
|---|---|
| path | `seed/moi-asir-buildings.csv` |
| blob sha1 | `79da3ffd438a876cbb58c5ce233a55535a51d139` |
| size | 46,475 bytes |
| content evidence | Recorded before the prohibition: ~700 rows of a Entity A (Asir) facility register — Arabic facility names and coordinates. Not re-derived here. |
| loaded by the app? | **No.** Zero references in `src/`, `scripts/`, `supabase/`, `.github/`. Named only in two design docs as an inert fixture. Not copied into `dist/` — the Pages site never served it. Exposure is repository browsing, not the deployed site. |

### 1.1 Why every commit is affected

`97afc96` is the **root commit of both `main` and the working branch** — the
August purge squash-rebuilt history to that point, and the file was already
in that root tree. Therefore:

- `origin/main`: **82 of 82** commits contain the blob.
- `claude/fable-5-plan-mode-design-fa5ipe`: **98 of 98** commits contain it.

A rewrite consequently changes **every commit SHA on both refs**. There is no
partial-depth option.

### 1.2 Every ref that carries the blob (verified individually)

Tested by walking each ref's full commit list and matching the blob hash at
the path — no content read.

| ref | tip SHA before rewrite | commits | carries blob |
|---|---|---|---|
| `refs/heads/main` | `cddd16735f5c6568fa5a7657ac192371827ab8cb` | 82 | **YES** |
| `refs/heads/claude/fable-5-plan-mode-design-fa5ipe` | `5f76216ad66c7c4bcfe52cddd48e2860f3cfb9cd` | 98 | **YES** |
| `refs/heads/claude/epic-hopper-no0dlu` | `b48714fedbb02df36b3cbbee2f387e707b8ec9da` | 25 | **YES** |
| `refs/heads/claude/fable-5-plan-c4g47d` | `0cd5a3534191fc980c74b8d8b0828934124df0f6` | 49 | **YES** |
| `refs/heads/claude/ies-dashboard-write-access-ypb5xd` | `d80105589e65ca509cb4617b54ea27cbf0803065` | 32 | **YES** |
| `refs/tags/9j-before` | `32ce4ee5e7008db99e59a6f8050841693b588b01` (peels to `622ff7177e7eb22a4d6067a087a358ac8880ec97`) | 22 | **YES** |
| `refs/heads/claude/8Q-projects-panorama` | `1efbff20e4099532d001980f948e24aac23727b1` | 123 | no |
| `refs/heads/claude/8S-coc-rebuild` | `4c7a7ec7f9a287e04f62f42d51d55e03154b1456` | 129 | no |
| `refs/heads/claude/phase-3-frontend-q4w9` | `245d305c4555626dcb300434339c535c917d1685` | 29 | no |
| `refs/heads/claude/phase-3.5-visual-rebuild-vz8k` | `cb32f013a225c2089d63114c6e7a6bc8645378df` | 31 | no |
| `refs/heads/claude/phase-3.6-total-visual-rebuild-r3x7` | `6cc71f69c832978d59e71d62034aeac58a0ec75a` | 45 | no |
| `refs/heads/claude/phase-4-sprint1-feedback-fixes` | `21131c8fabe45b4893437886e2bcddc2b567735d` | 52 | no |
| `refs/pull/1..4/head` | (= the four phase-* tips above) | — | **no** |

**Six refs carry it. The four PR refs do not** — which matters, because PR
refs are the one class a force-push cannot touch (§7.3).

Repository state at the time of writing: **public**, **0 forks, 0 stars,
0 watchers**, Pages enabled, 4 closed-unmerged PRs.

---

## 2. THE ENUMERATED PATH LIST

The August purge's lesson, stated by the owner: *anything not named survives
it.* This is the complete list. Nothing is implied, nothing is "and related
files".

### Tier A — APPROVED, execute

```
seed/moi-asir-buildings.csv
```

That is the entire approved list: one path, one blob,
`79da3ffd438a876cbb58c5ce233a55535a51d139`.

### Tier B — NEW FINDINGS, `NEEDS RULING` before inclusion

Found by re-running the enumeration across the whole object database (§3).
Each is client-identifying by the owner's own test. **Recommendation: rule on
these before the rewrite runs, so one rewrite covers everything** — a second
rewrite later doubles the SHA churn, doubles the collaborator disruption, and
requires a second GitHub Support request.

```
Client_Proposal.pdf
Client_Review.pdf
Building-Detail.html
Dashboard.html
Login.html
Materials.html
My-Escalation.html
My-Tasks.html
Project-Detail.html
Projects.html
Reports.html
Settings.html
```

Two files are string-redactions rather than deletions (the files must stay —
they are a migration in an applied chain and a live generator):

```
supabase/migrations/0024_business_seed.sql      → redact, do not delete
scripts/generate-project-template.js            → redact, do not delete
```

Both are **already gutted on the working branch** — merging the branch fixes
the *tree*. Redaction only matters for *history*.

---

## 3. THE SIBLING SWEEP — does anything else carry client data?

### 3.1 Method, stated before the result (Constraints #7 condition 3)

- **Population:** every blob in the object database, not the working tree —
  `git cat-file --batch-all-objects` after fetching **all** remote branches,
  all tags, and `refs/pull/*/head`. **1,169 blobs total.**
- **Names resolved** via `git rev-list --objects --all` so each hit reports
  its path(s).
- **Exclusion:** blob `79da3ffd…` skipped **by hash, before any read** — it
  is never opened, so it appears in no result below.
- **Decoding:** each candidate decoded as UTF-8, and where that failed, as
  UTF-16LE and latin-1. Multi-encoding is deliberate: the de-identification
  scanner's latin-1 assumption is the worked example in Constraints #7, and
  a single-encoding scan is exactly how a false negative is produced.
- **Detector categories:** Arabic script (`U+0600–U+06FF`); DMS coordinates
  (`\d+[d°]\d+['′]\d+(\.\d+)?["″]?[NSEW]`); decimal coordinates at
  KSA-plausible latitudes with ≥5 decimal places; entity words
  (ministry / وزارة / amanah / أمانة / municipal); SharePoint tenant hosts;
  Windows user-profile paths.
- **Scanned: 1,015 blobs. Hit: 209.** Each hit was then read line-by-line and
  given a verdict — a category label alone is not a finding.

### 3.2 What the method could NOT see — stated, not glossed

A negative finding is only as strong as its method. This one is blind to:

| not scanned | count | why | how it was cleared instead |
|---|---|---|---|
| `.png` | 29 paths | raster | UI screenshots under `docs/ui-9J/` — **not cleared by this scan.** Direct inspection required before any claim of absence. Flagged in §3.5. |
| `.xlsx` | 4 paths | compressed | The two TARSHID de-identified templates are covered by their own per-part proofs (`docs/proofs/`); the two IES project templates were proven identifier-free during the determinism work. |
| `.pdf` | 3 paths | compressed | **Opened and decoded — see §3.4. This is where the second finding came from.** |
| `.ttf`/`.woff2`/`.webp` | 4 paths | fonts/images | Amiri + Inter fonts, Murshid avatar. Cleared by provenance, not by scan. |
| 2 unnamed ZIP blobs | 2 | binary | Identified in §3.6. |

### 3.3 Verdicts — the 209 hits

**Sanctioned / not client data** (the large majority): Arabic in
`src/lib/docPdf.js` and `cocPdf.js` (COC bilingual labels, Constraints #1
exception); Arabic-Indic digit-folding regexes in `format.js`, `search.js`,
`AiAssistPanel.jsx`, `EntryForm.jsx`, `saving-sheet-agent`,
`extract-delivery-pdf`; the `[؀-ۿ]` character classes inside the sanitize
migrations 0045/0047/0051 and 0033/0098; COC table captions quoted in
migrations 0106/0107/0108/0084; the Murshid Arabic corpus in
`murshid-chat/core.ts` + `index.ts`, migrations 0119/0120/0121, and the
red-team patterns — all **already rewritten to English on the working
branch**; method notes about transliteration in `docs/9Q-decisions.md`,
`docs/Backlog.md`, `docs/9J-progress.md`, `docs/9L-decisions.md`;
`.claude/launch.json` Windows path (a developer path, not a client's).

**`seed/tds-ac.csv`, `seed/tds-lighting.csv`, `seed/tds-misc.csv`: ZERO hits
in every category** — no Arabic, no coordinates, no entity names. They are
equipment technical-data sheets, not a client register. **They stay.** Stated
with its method: a six-category multi-encoding scan of the full blob, which
would have caught a facility name or a coordinate had one been present.

### 3.4 SECOND FINDING — `Client_Proposal.pdf` and `Client_Review.pdf`

**These are not demo material.** Both are 11-page documents whose own footer
reads *Confidential*, present in **every branch, the tag, and all four PR
refs**, added in `458523b` alongside the prototype HTMLs.

The literal-string scan of both returned **zero characters** — the text is
hex-encoded against subset fonts. Decoding through their `ToUnicode` CMaps
(89 and 81 glyphs mapped) yields the real content: the **Project A
engagement**, named as such, with **72 buildings, 5,292 air-conditioning
units, ~1,700 LED fixtures, SAR 12.4M contract value**, delivery dates, and
follow-on regions named.

*This is the Constraints #7 failure mode reproducing itself again.* A
plain-text scan of these two files reports them clean. They are not clean.
They were caught only because the extension list flagged them as unscanned
and the unscanned list was worked through rather than waved past.

**Verdict: client-identifying commercial data, marked confidential, in a
public repository.** It is the owner's own document — which is why it is a
ruling and not an action — but the client is named and the contract value is
in it.

### 3.5 THIRD FINDING — the ten prototype HTMLs carry the same figures

Still present in `main`'s tree (the branch deletes them; the branch is not
merged) and in all history. `Projects.html:1230–1233` and its nine siblings
carry `client: "Entity A"`, `region: "Asir"`,
`contractValue: 12_400_000`, and `5292` — the same engagement as the PDFs,
not invented demo values.

Also unresolved: `docs/ui-9J/**/*.png` are screenshots of this prototype. If
they depict those screens, they are images of the same data. **Not cleared —
they need visual inspection before anyone claims otherwise.**

### 3.6 FOURTH FINDING — the original workbooks survive as loose objects

Two unreferenced ZIP blobs sit in the local object store:

| blob | size | identity |
|---|---|---|
| `589a92f4698f02618f9e1942049da7790c2faedf` | 2,105,977 B | original MOH-TU workbook |
| `dae8f6a62bfdd1485dddd5abe301d2f350251fb4` | 668,799 B | original MOH-TU workbook |

Added in `3bc757a`, removed in `26b99f0` ("Confidentiality remediation").
Unreachable from any ref — reachable only via the local reflog. They are
**not** served by GitHub through any ref, but the pre-purge commits that
contained them **were pushed before the August force-push**, so they fall
under the same old-SHA residual as everything else (§7).

Local cleanup is in step 8. **This is also the direct evidence for §7's
central claim:** a force-push does not destroy objects. It has already
happened once on this repository, and the objects are still here.

---

## 4. Preconditions

1. Owner has ruled on Tier B (§2). If the ruling is "Tier A only", delete the
   Tier B lines from the paths file and proceed — nothing else changes.
2. **Branch protection on `main` is off** for the duration, and GitHub Actions
   is expected to re-run the Pages deploy on the force-push. Confirm the
   deploy is green afterwards (step 9) — deploy-green means green on main.
3. No other session is pushing. Every SHA on every rewritten ref changes;
   concurrent work would be silently orphaned.
4. `git-filter-repo` is present (verified: `/usr/local/bin/git-filter-repo`).
5. Working tree clean; nothing uncommitted worth keeping.

---

## 5. THE COMMANDS

Run in order. `$WORK` is a scratch directory **outside** the repository.
Stop at the first unexpected result and report — do not improvise past a
failed check.

### Step 1 — safety mirror (never pushed, destroyed at step 10)

```bash
export WORK=/tmp/purge-work && mkdir -p "$WORK" && cd "$WORK"
git clone --mirror https://github.com/MDQEstablishment/IES-DASHBOARD.git backup-before-purge.git
git -C backup-before-purge.git for-each-ref --format='%(refname) %(objectname)' > "$WORK/refs-before.txt"
cat "$WORK/refs-before.txt"
```

Compare `refs-before.txt` against the table in §1.2. **Any tip that differs
means someone pushed since this plan was written — STOP and re-verify.**

### Step 2 — the working mirror

```bash
cd "$WORK"
git clone --mirror https://github.com/MDQEstablishment/IES-DASHBOARD.git purge.git
cd purge.git
```

`git-filter-repo` requires a fresh clone; do not reuse `/home/user/IES-DASHBOARD`.

### Step 3 — the paths file (the enumeration, verbatim)

Tier A only. **If the owner approved Tier B, append those lines exactly as
listed in §2 — one `literal:` line per path, no globs, no wildcards.**

```bash
cat > "$WORK/purge-paths.txt" <<'EOF'
literal:seed/moi-asir-buildings.csv
EOF
wc -l "$WORK/purge-paths.txt" && cat "$WORK/purge-paths.txt"
```

`literal:` is required — a bare line is a prefix match, which could take
neighbours silently. Explicit is the whole point of this list.

### Step 4 — rewrite every ref

```bash
cd "$WORK/purge.git"
git filter-repo --force --invert-paths --paths-from-file "$WORK/purge-paths.txt"
```

If Tier B string-redaction was approved, run this **as well**, after the
above (it rewrites blob *contents*, not paths):

```bash
cat > "$WORK/redact.txt" <<'EOF'
PROJECT-A==>PROJECT-A
Project A==>Project A
Entity A==>Entity A
PROJECT-B==>PROJECT-B
Project B==>Project B
Entity B==>Entity B
EOF
git filter-repo --force --replace-text "$WORK/redact.txt"
```

### Step 5 — verify inside the rewritten mirror (hash and path only)

```bash
cd "$WORK/purge.git"
BLOB=79da3ffd438a876cbb58c5ce233a55535a51d139

git cat-file -e "$BLOB" 2>/dev/null && echo "FAIL: blob still present" || echo "PASS: blob absent from object db"
test -z "$(git rev-list --objects --all | grep "$BLOB")" && echo "PASS: unreferenced by every ref" || echo "FAIL"
test -z "$(git log --all --oneline -- seed/moi-asir-buildings.csv)" && echo "PASS: path in no commit" || echo "FAIL"
git for-each-ref --format='%(refname) %(objectname)' > "$WORK/refs-after.txt"
diff "$WORK/refs-before.txt" "$WORK/refs-after.txt" | head -30
```

Expected: three PASS lines, and every tip changed on the six refs of §1.2.
`git cat-file -e` tests **existence**; it prints nothing and decodes nothing.

### Step 6 — push

```bash
cd "$WORK/purge.git"
git push --force --mirror https://github.com/MDQEstablishment/IES-DASHBOARD.git
```

Retry on network failure only, backing off 2s / 4s / 8s / 16s. A rejection
that is **not** a network error (branch protection) is a STOP — report it.

`--mirror` deletes remote refs absent locally. The mirror was cloned from
this same remote, so the ref sets match. It does not touch `refs/pull/*`
(GitHub does not advertise them for cloning, and they are not rewritable —
§7.3).

### Step 7 — verify from a clone that has never seen the old history

```bash
cd "$WORK" && rm -rf verify && git clone https://github.com/MDQEstablishment/IES-DASHBOARD.git verify
cd verify
git fetch origin '+refs/heads/*:refs/remotes/origin/*' --tags --prune
BLOB=79da3ffd438a876cbb58c5ce233a55535a51d139

git cat-file -e "$BLOB" 2>/dev/null && echo "FAIL" || echo "PASS: origin/main no longer serves the blob"
test -z "$(git rev-list --objects --all | grep "$BLOB")" && echo "PASS: absent from all fetched refs" || echo "FAIL"
test -z "$(git log --all --oneline -- seed/moi-asir-buildings.csv)" && echo "PASS: path gone from all history" || echo "FAIL"
git ls-tree -r origin/main --name-only | grep '^seed/' || echo "PASS: seed/ listing checked"
```

A fresh clone is the point: it proves what **GitHub serves**, not what the
local repository happens to have pruned.

Then, through the GitHub API — **metadata only, no content request**:

```
mcp__github__get_file_contents  path=seed/moi-asir-buildings.csv  → expect 404
mcp__github__get_commit         sha=cddd16735f5c6568fa5a7657ac192371827ab8cb  → see §7.2
```

The blobs API is deliberately **not** used: it returns the file body, and
that is prohibited. Existence is established by the path 404 and by
`cat-file -e` in a fresh clone.

### Step 8 — destroy the loose workbook blobs locally

```bash
cd /home/user/IES-DASHBOARD
git reflog expire --expire=now --all && git gc --prune=now
git cat-file -e 589a92f4698f02618f9e1942049da7790c2faedf 2>/dev/null && echo "FAIL: workbook blob survives" || echo "PASS"
git cat-file -e dae8f6a62bfdd1485dddd5abe301d2f350251fb4 2>/dev/null && echo "FAIL: workbook blob survives" || echo "PASS"
```

### Step 9 — restore the working clone and confirm deploy

The local repository is now on abandoned SHAs. Re-point it:

```bash
cd /home/user/IES-DASHBOARD
git fetch origin --prune --tags --force
git checkout main && git reset --hard origin/main
git checkout claude/fable-5-plan-mode-design-fa5ipe && git reset --hard origin/claude/fable-5-plan-mode-design-fa5ipe
git log --oneline -3
```

Then confirm the Pages deploy triggered by step 6 is **green on main**, and
smoke the live site. Green on main is the bar.

### Step 10 — destroy the safety mirror

Only after the owner confirms the verification output:

```bash
rm -rf "$WORK/backup-before-purge.git" "$WORK/purge.git" "$WORK/verify"
```

The mirror contains the very data being removed. It must not outlive the
sign-off, and it must never be pushed anywhere.

---

## 6. Stale branches — a cheaper alternative for six of them

`8Q-projects-panorama`, `8S-coc-rebuild`, and the four `phase-*` branches
carry none of Tier A. Four of them are the heads of closed, unmerged PRs.
They **do** carry the Tier B PDFs and HTMLs.

**Recommendation: delete these six branch refs outright** rather than rewrite
them. Deleting a ref is cheaper and more complete than rewriting one. It does
**not** remove the PR refs (§7.3) — nothing the owner can do removes those.

```bash
git push origin --delete claude/8Q-projects-panorama claude/8S-coc-rebuild \
  claude/phase-3-frontend-q4w9 claude/phase-3.5-visual-rebuild-vz8k \
  claude/phase-3.6-total-visual-rebuild-r3x7 claude/phase-4-sprint1-feedback-fixes
```

`NEEDS RULING` — this discards abandoned history the owner may want kept.

---

## 7. What remains reachable afterwards — the honest part

**A force-push does not delete anything. It makes objects unreachable.**
This is not a theoretical caveat: §3.6 documents the two original workbook
blobs still sitting in the object store months after the August purge
supposedly removed them.

### 7.1 What stays, and for how long

After step 6, every pre-rewrite commit becomes unreachable on GitHub but is
**not deleted**. GitHub continues to serve unreachable commits **to anyone
who knows the SHA**, at:

- `https://github.com/MDQEstablishment/IES-DASHBOARD/commit/<old-sha>`
- `https://github.com/MDQEstablishment/IES-DASHBOARD/blob/<old-sha>/seed/moi-asir-buildings.csv`
- `https://raw.githubusercontent.com/MDQEstablishment/IES-DASHBOARD/<old-sha>/seed/moi-asir-buildings.csv`

**For how long: there is no published guarantee and no time limit the owner
can rely on.** GitHub garbage-collects opportunistically, not on a schedule
and not on request through the API. Unreachable objects can persist
indefinitely. *Treat the data as still exposed to anyone holding a SHA until
GitHub confirms otherwise in writing.*

### 7.2 Who plausibly holds those SHAs

Every full pre-rewrite ref tip is listed in §1.2 of this document, which is
itself committed to a public repository. Beyond that: anyone who cloned or
fetched before the rewrite; Actions run logs; the Pages deployment history;
any external mirror or scraper. The set is not enumerable and should not be
assumed small.

A useful post-rewrite check, metadata-only: `mcp__github__get_commit` against
`cddd16735f5c6568fa5a7657ac192371827ab8cb`. **If it still resolves, the old
history is still being served, and §7.4 is required.** This asks for commit
metadata, never file content.

### 7.3 What a force-push structurally cannot reach

`refs/pull/1/head` … `refs/pull/4/head` are **GitHub-owned refs**. The
repository owner cannot rewrite or delete them; closing or deleting a PR does
not remove them; they survive branch deletion. Verified: **they do not carry
Tier A**, so the approved removal is unaffected. **They do carry
`Client_Proposal.pdf`, `Client_Review.pdf`, and the prototype HTMLs.** If
Tier B is approved, these four refs are the part that only GitHub can fix.

### 7.4 The GitHub Support request — exactly what to ask for

Repository: `MDQEstablishment/IES-DASHBOARD` (public; 0 forks, 0 stars,
0 watchers — no fork network to chase, which is the one favourable fact
here). Ask for, in these terms:

1. **Garbage-collect the repository** to permanently remove objects left
   unreachable by the force-push, citing the before/after ref tips from
   `refs-before.txt` and `refs-after.txt`.
2. **Confirm in writing** that the specific pre-rewrite commit SHAs (§1.2)
   no longer resolve via the web UI, the API, or `raw.githubusercontent.com`.
   Ask for confirmation, not assurance.
3. **Only if Tier B is approved — expunge `refs/pull/1..4/head`**, stating
   plainly that these carry confidential client material and that the owner
   has no mechanism to remove them.
4. **Purge cached and indexed copies** — code search index and raw CDN.

Point 2 is the one that matters. Without it the answer to "is it gone?" is
"unreachable, not gone", and that should be said to whoever asks.

### 7.5 What the owner should assume regardless

The data was in a public repository for a period. Removal narrows future
exposure; it cannot retract past access, and no repository operation can. If
disclosure obligations exist toward the entity concerned, they turn on that
past exposure and are unaffected by anything in this plan.

---

## 8. Preventing the third occurrence

Two incidents, same class, one root cause: **there is no gate**. Recommended
as a follow-up unit (not part of this removal):

1. Commit the §3.1 sweep as `scripts/client-data-sweep.mjs` — the enumeration
   is already written and has now found what two narrower passes missed.
2. Run it in CI on every push, failing on a new hit in a non-allowlisted
   path, with the allowlist naming each sanctioned exception and its reason.
3. **The scan must open compressed and binary formats**, and must fail loudly
   on any member it could not decode rather than passing it. Both incidents
   were false negatives from scans that could not see the whole file — the
   xlsx sharedStrings in August, the CMap-encoded PDFs today.

---

## 9. Execution summary for the implementer

Do steps 1–10 in order. Stop and report at the first FAIL. Do not add paths
that are not in §2. Do not read `seed/moi-asir-buildings.csv` — not the data,
not the header row, not a byte; every check in this plan is satisfied by
hash-or-path existence tests that decode nothing. Do not rewrite, force-push,
or merge anything not named here. Report what was **proven**, quoting the
actual command output — not what was written.
