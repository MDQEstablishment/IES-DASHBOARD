// src/lib/buckets.js — the storage buckets, named once.
//
// WHY THIS IS CODE AND NOT A DATABASE TABLE, unlike everything else A3 moved.
// A bucket name is a DEPLOYMENT COORDINATE, not configuration: it is created by
// a migration, it is baked into RLS policies (`bucket_id = 'building-photos'`),
// and reading it from a row at runtime would mean the app could point itself at
// a bucket whose policies do not exist. The single source of truth is therefore
// this module plus the migration that creates each bucket — and the test in
// tests/buckets.test.mjs asserts the two lists match.
//
// WHAT IT REPLACED: twelve bucket names as bare string literals across the UI,
// the lib layer, the template generator and one Edge Function, with no central
// list. That cost two things. First, a typo is a runtime 404 nobody sees until
// a user hits it. Second — and this is what actually forced the module — the
// backup scoping (§15 / A5) needs an AUTHORITATIVE list of what to back up, and
// "grep the source for anything that looks like a bucket" is not one.
//
// THE ONE LITERAL THIS MODULE CANNOT REACH. `src/lib/cocPdf.js:256` writes to
// 'coc-pdfs' as a literal. cocPdf.js is FROZEN (a deliverable generator held
// byte-identical by the census), so it keeps its literal and the test below
// asserts that literal still equals COC_PDFS. A frozen file cannot import, but
// it can be watched.

export const BUCKETS = {
  /** Building progress/evidence photographs, attached to building_photos rows. */
  BUILDING_PHOTOS: 'building-photos',
  /** Generated Certificate-of-Completion PDFs. */
  COC_PDFS: 'coc-pdfs',
  /** TARSHID's signed response documents against a COC. */
  COC_RESPONSES: 'coc-responses',
  /** Daily install-progress photographs, keyed <building_id>/<date>/<uuid>. */
  DAILY_PROGRESS_PHOTOS: 'daily-progress-photos',
  /** Supplier delivery-note PDFs, read by the extract-delivery-pdf function. */
  DELIVERY_NOTES: 'delivery-notes',
  /** The original general-purpose image bucket (legacy; db.js signed reads). */
  IMAGES: 'images',
  /** Project document submittals (MIR/WIR/RFI/NCR and uploads). */
  PROJECT_DOCS: 'project-docs',
  /** One cover photograph per project. */
  PROJECT_PHOTOS: 'project-photos',
  /** PUBLIC. The downloadable project-import workbook template. */
  PROJECT_TEMPLATES: 'project-templates',
  /** The progress-report .xlsx template artefacts. */
  REPORT_TEMPLATES: 'report-templates',
  /** TARSHID's blank saving-sheet workbooks, one active per kind. */
  SAVING_SHEET_TEMPLATES: 'saving-sheet-templates',
  /** Generated saving sheets, one object per revision. */
  SAVING_SHEETS: 'saving-sheets',
  /**
   * U5 / COMMIT B — survey nameplate, room and indoor photographs.
   *
   * These were written to DAILY_PROGRESS_PHOTOS under a `survey/` prefix. Two
   * lifecycles in one bucket: a daily-progress photo is evidence of a day's
   * install and ages out with the report it belongs to, while a survey
   * nameplate photograph is the ONLY record of what a unit actually was and
   * must survive as long as the saving sheet derived from it. A retention
   * policy keyed on the bucket could not tell them apart, so the longer-lived
   * class was hostage to the shorter one.
   */
  SURVEY_PHOTOS: 'survey-photos',
}

/**
 * Every bucket, as a flat list. The backup scoping reads THIS — adding a bucket
 * to the object above is what puts it in the backup, and forgetting to is what
 * the migration-parity test catches.
 */
export const ALL_BUCKETS = Object.values(BUCKETS)

/**
 * Buckets holding user-uploaded photographs. Kept apart because they share a
 * compression path, an image/* content type and (from this commit) two
 * different retention lifetimes.
 */
export const PHOTO_BUCKETS = [
  BUCKETS.BUILDING_PHOTOS,
  BUCKETS.DAILY_PROGRESS_PHOTOS,
  BUCKETS.PROJECT_PHOTOS,
  BUCKETS.SURVEY_PHOTOS,
  BUCKETS.IMAGES,
]

/** The only bucket that is public. Stated so a reader does not have to guess. */
export const PUBLIC_BUCKETS = [BUCKETS.PROJECT_TEMPLATES]
