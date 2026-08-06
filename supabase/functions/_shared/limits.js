// supabase/functions/_shared/limits.js
//
// CEILINGS THAT TARSHID'S OWN TEMPLATE IMPOSES ON US. Not preferences, not
// tuning knobs — shapes of the deliverable. They live here because they are
// asserted in three different runtimes and were, until this commit, written out
// three times:
//
//   · src/lib/savingSheet.js:394           `MAX_SELECTION_ROWS = 20`
//   · src/lib/savingSheetGen.js:175        `s.row_no > 20` (the write guard)
//   · saving-sheet-agent/index.ts:178      "Hard ceiling: at most 20 models"
//                                          — PROSE, inside the model's prompt
//
// The prose copy is the dangerous one: if the template's VLOOKUP range ever
// changes, two code sites would be fixed and the sentence the model actually
// reads would keep asking for the old number. It is now interpolated from here.
//
// Same rules as _shared/compliance.js: plain dependency-free ESM, importable by
// Deno, by Vite and by `node --test`.

// TARSHID's 'Aprvd Project Unit' sheet: the payback VLOOKUP range is fixed at
// B2:N21, so row 21 is the last row a lookup can reach. Twenty models.
export const MAX_SELECTION_ROWS = 20

// The sheet row a selection row_no lands on (row_no 1 -> sheet row 2), stated
// once so the "+1" and the "21" cannot drift apart.
export const SELECTION_HEADER_ROW = 1
export const SELECTION_LAST_SHEET_ROW = SELECTION_HEADER_ROW + MAX_SELECTION_ROWS   // 21
