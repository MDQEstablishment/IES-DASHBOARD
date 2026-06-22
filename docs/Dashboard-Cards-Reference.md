# IES Dashboard — Cards Reference

A plain-English guide to every card on the executive Dashboard: what it shows,
where the number comes from, and which action changes it. This mirrors the in-app
**“?”** help drawer (Dashboard header → `?`).

| Card | What it shows | Data source | What changes it |
|------|---------------|-------------|-----------------|
| **Total Projects** | Count of non-deleted projects. | `projects` table | Add Project / Delete Project actions |
| **Portfolio Progress** | Weighted average of installed ÷ planned across active projects. | `install_log` ÷ `building_item_scope` | Engineer install entries |
| **S-Curve** | Planned vs actual progress over time. | `install_log` aggregated by week | Daily Report submissions |
| **COCs Signed** | Signed completion certificates out of the **expected** total — one COC per building in **active** projects (archived buildings excluded). | `buildings.status_override = 'signed'` ÷ buildings in active projects | COC approval flow |
| **Progress by Project** | Per-project weighted % complete. | `install_log` + `building_item_scope` | Engineer log entries |
| **Progress by ESM** | Per-ESM aggregated % across the whole portfolio. | `install_log` grouped by ESM | Engineer log entries |
| **Attention List** | Open escalations plus blocked/overdue tasks. | `escalations` + `tasks` | Auto-detected blockers + manually raised escalations |
| **Recent Activity** | The most recent write actions across the programme (last 24h). | `audit_log` | Any write action (install, approval, material movement, etc.) |
| **Critical Materials** | Materials at or below their reorder threshold. | `materials` — in-stock (`received` − consumed) vs `threshold` | Material receipts + install activity |

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
