// Where the building-list template comes from.
//
// It is a BUILD OUTPUT, generated into dist/templates by
// scripts/generate-building-template.js after the bundle. It is never committed:
// a binary in the tree cannot be reviewed in a diff and drifts from the code
// that produced it, and the Constraints #8 gate fails the build if one appears.
//
// BASE_URL rather than a bare path, so it resolves correctly under the GitHub
// Pages sub-path as well as at the root in dev.
export const TEMPLATE_FILENAME = 'IES-Building-List-Template.xlsx'
export const TEMPLATE_URL = `${import.meta.env.BASE_URL}templates/${TEMPLATE_FILENAME}`

import { toast } from './toast'

export async function downloadTemplate() {
  // A plain <a download> would silently save the 404 HTML page as an .xlsx if
  // the build step ever stopped running — a file that opens to an error and
  // looks like our fault. Fetch first, check, then save.
  let blob
  try {
    const res = await fetch(TEMPLATE_URL)
    if (!res.ok) throw new Error(String(res.status))
    blob = await res.blob()
  } catch {
    // Say so out loud. A button that appears to do nothing is worse than one
    // that reports a failure, and this is the only way the user learns the
    // build step did not run.
    toast('The template could not be downloaded. Please tell us — the file is missing from this build.', 'err')
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = TEMPLATE_FILENAME
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
