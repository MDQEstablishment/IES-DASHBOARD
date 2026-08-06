# IES Dashboard — Cards Reference

A plain-English guide to every card on the executive Dashboard: what it shows,
where the number comes from, and which action changes it. This mirrors the in-app
**“?”** help drawer (Dashboard header → `?`).

| Card | What it shows | Data source | What changes it |
|------|---------------|-------------|-----------------|
| **Total Projects** | Count of non-deleted projects. | `projects` table | Add Project / Delete Project actions |
| **Portfolio Progress** | Weighted average of installed ÷ planned across active projects. With **no planned scope anywhere** there is no ratio, so the card reads **“—”**, not 0%. | `install_log` ÷ `building_item_scope` | Engineer install entries |
| **S-Curve** | Cumulative installed quantity against the contracted plan, sampled weekly. **Planned** is each project’s scope spread linearly over its own start date + duration; **actual** is installs to date, capped per scope at the planned quantity and drawn **only up to today**. A project with scope but no schedule is excluded and counted under the chart. When the curve cannot be computed the panel names the missing input — no scope, no schedule, or nothing logged — and draws nothing. | `install_log.entry_date` vs `building_item_scope.planned_qty` over `projects.start_date` + `total_weeks` (`lib/progressReport.js` → `sCurveSeries`) | Daily Report submissions; a project’s start date + duration |
| **COCs Signed** | Certified **(building × ESM) pairs** out of every pair with planned scope, across active projects. A pair counts once the certificate claiming it is **approved** or **accepted with comments** by TARSHID. | `v_project_doc_progress` — `approved_count ÷ expected_count` (`doc_type = 'coc'`), pair-grained from `coc_pool` + `coc_claims` | Logging TARSHID feedback on a certificate (COCs screen). Scope and installation move the denominator. |
| **Progress by Project** | Per-project weighted % complete. A project with no planned scope reads **“—”**, not 0%. | `install_log` + `building_item_scope` | Engineer log entries |
| **Progress by ESM** | One bar per row in the ESM catalogue, aggregated across the whole portfolio. An ESM with no planned scope reads **“—”**. Scope that resolves to no ESM is counted under the card rather than dropped. | `install_log` grouped by `building_item_scope.project_esm_id` → `esms`; name and order from `esms` (a project’s `custom_name` wins where every project agrees) | Engineer log entries; the ESM catalogue under Materials |
| **Attention List** | Open escalations plus blocked/overdue tasks. | `escalations` + `tasks` | Auto-detected blockers + manually raised escalations |
| **Recent Activity** | Writes across the programme **in the last 24 hours**, newest first, up to six. The query carries the 24-hour filter the heading claims. | `audit_log` (`created_at` within 24h) | Any write action (install, approval, material movement, etc.) |
| **Critical Materials** | **CRITICAL** is stock below its reorder threshold. **LOW** is stock below threshold × `low_stock_multiplier`; with that constant row absent there is no LOW band at all. | `materials` (`received` vs `threshold`) × `tarshid_constants.low_stock_multiplier` | Material receipts + install activity; the constant itself, editable by PMO/Admin |

> **COCs Signed changed provenance in migration 0132.** It previously divided
> `default_coc_plan` (the legacy layout × bundle expansion) by a join of
> `project_documents` to `coc_esms` — a table with no writer since migration
> 0079. Both halves were therefore always zero and the card could never move,
> whatever TARSHID approved. It now reads the certificate pool and the claims
> ledger, and is pair-grained on both sides of the ratio.

## How progress is computed

`progress = SUM(approved installed quantity, capped at planned) ÷ SUM(planned)`
across every building scope, weighted by scope size. Each scope row
(`building_item_scope`) carries a `planned_qty`; each install entry
(`install_log`) adds to the installed total once it passes QA (`qa_status =
'approved'`). Because everything is derived from these two tables, the same number
recomputes consistently on the Dashboard, the Project Detail, and the Building
Detail.

## Where the numbers are written

- **Installs** are logged from Daily Progress (Quick / Batch) or the Building
  Detail “Add today’s install” modal → `install_log` (append-only; quantity is
  immutable, only QA status changes).
- **COC approvals** move a building’s `status_override` and surface on the COCs
  card.
- **Material receipts/requests** are recorded in `material_movements`; consumption
  is derived from installs.
- **Every mutation** is captured in `audit_log` by a database trigger, which feeds
  Recent Activity.

## Why several cards read “—” rather than 0%

A percentage needs a denominator. Portfolio Progress, Progress by Project,
Progress by ESM and the Employee Performance ON-TIME column all used to print a
number when there was nothing to divide by — 0% for a project with no scope,
and 100% in green for an employee who had completed no task at all. Those are
not measurements, they are the absence of one, and on a screen the owner walks
to confirm the system is correct they are worse than a blank: a fabricated
figure cannot be distinguished from a real one. Each of them now renders an em
dash, and the S-Curve renders an empty state naming the input it is waiting for.

## Thresholds live in the database, not in the code

`low_stock_multiplier` (Critical Materials) and `perf_ontime_good_pct` /
`perf_ontime_warn_pct` (Employee Performance colour bands) are rows in
`tarshid_constants`, seeded by migration 0138 and editable by PMO/Admin. The
readers carry **no** built-in default: if a row is missing the UI shows the
neutral case — no LOW classification, no colour — rather than falling back to a
number nobody approved.
