# GitHub Support request — ready to send

Send from the account that owns `MDQEstablishment/IES-DASHBOARD`, via
https://support.github.com/contact — category **Account / repository data**.
Everything below the line is the message; the SHAs are real and current.

---

**Subject: Request to purge unreachable objects and confirm removal after a history rewrite — MDQEstablishment/IES-DASHBOARD**

Hello,

We have rewritten the history of `MDQEstablishment/IES-DASHBOARD` (public) to
remove confidential third-party material that should never have been
committed. The rewrite is complete and force-pushed to every branch we can
write. We need your help with what a force-push cannot reach.

**Our first and most important ask:**

**1. Please confirm in writing that the pre-rewrite commits listed below no
longer resolve — via the web UI, the REST/GraphQL API, and
`raw.githubusercontent.com`.** We understand a force-push makes objects
unreachable rather than deleting them, and that they can still be served to
anyone who knows the SHA. We need to state to the affected party whether the
data is *gone* or merely *unreachable*, and only you can tell us which. A
written confirmation naming these SHAs is what we are asking for.

Pre-rewrite ref tips (all should now be unreachable):

```
refs/heads/main                                       cddd16735f5c6568fa5a7657ac192371827ab8cb
refs/heads/claude/fable-5-plan-mode-design-fa5ipe     be2e4938c068ecf62cd954f05667c410042c1e24
refs/heads/claude/epic-hopper-no0dlu                  b48714fedbb02df36b3cbbee2f387e707b8ec9da
refs/heads/claude/fable-5-plan-c4g47d                 0cd5a3534191fc980c74b8d8b0828934124df0f6
refs/heads/claude/ies-dashboard-write-access-ypb5xd   d80105589e65ca509cb4617b54ea27cbf0803065
refs/heads/claude/8Q-projects-panorama                1efbff20e4099532d001980f948e24aac23727b1
refs/heads/claude/8S-coc-rebuild                      4c7a7ec7f9a287e04f62f42d51d55e03154b1456
refs/heads/claude/phase-3-frontend-q4w9               245d305c4555626dcb300434339c535c917d1685
refs/heads/claude/phase-3.5-visual-rebuild-vz8k       cb32f013a225c2089d63114c6e7a6bc8645378df
refs/heads/claude/phase-3.6-total-visual-rebuild-r3x7 6cc71f69c832978d59e71d62034aeac58a0ec75a
refs/heads/claude/phase-4-sprint1-feedback-fixes      21131c8fabe45b4893437886e2bcddc2b567735d
```

An earlier rewrite on this repository (2026-08-01) left objects still present
months later, which is why we are asking for confirmation rather than
assuming.

**2. Please run garbage collection on the repository** so those unreachable
objects are permanently removed. Post-rewrite ref tips, for comparison:

```
refs/heads/main                                       7bee938628d27c231754e62968ab2b63efd1e44a
refs/heads/claude/fable-5-plan-mode-design-fa5ipe     7bee938628d27c231754e62968ab2b63efd1e44a
refs/heads/claude/epic-hopper-no0dlu                  34d0af0ba89779a5202c78482f02bec73a2be019
refs/heads/claude/fable-5-plan-c4g47d                 15d319edb508e51aa281c593ab6ef7d3b36f706d
refs/heads/claude/ies-dashboard-write-access-ypb5xd   f93d70e1dbfae346b8174ab035c77120aa736842
refs/heads/claude/8Q-projects-panorama                657f1370531924a170d787671086a0359191503d
refs/heads/claude/8S-coc-rebuild                      d1c14734cfed90185a0e2096130bbf2025cd94ac
refs/heads/claude/phase-3-frontend-q4w9               a90267a500499d2ca028e7f55d9f731e176f5c1d
refs/heads/claude/phase-3.5-visual-rebuild-vz8k       ff4ee3a22a65e6872db7f9d35837e2a1350f1e3d
refs/heads/claude/phase-3.6-total-visual-rebuild-r3x7 9bcc855801f27fe2ca0107a9155d9ba626f4b2b7
refs/heads/claude/phase-4-sprint1-feedback-fixes      844caf532033325a5375222d951ce198b187070d
```

**3. Please expunge the pull-request head refs `refs/pull/1/head` through
`refs/pull/4/head`.** These are GitHub-owned refs that we cannot rewrite or
delete ourselves — closing the pull requests does not remove them. They
currently point at pre-rewrite commits and therefore still carry the
confidential files:

```
refs/pull/1/head  245d305c4555626dcb300434339c535c917d1685
refs/pull/2/head  cb32f013a225c2089d63114c6e7a6bc8645378df
refs/pull/3/head  6cc71f69c832978d59e71d62034aeac58a0ec75a
refs/pull/4/head  21131c8fabe45b4893437886e2bcddc2b567735d
```

All four pull requests are closed and unmerged. We do not need their history
retained.

**4. Please purge cached and indexed copies** of the removed content — the
code-search index and any `raw.githubusercontent.com` CDN caching for the
SHAs in ask 1.

Additional context that may help:

- The repository has **0 forks, 0 stars and 0 watchers**, so there is no fork
  network to clean up.
- We are not asking you to identify or read the removed files. The paths were:
  one `.csv`, two `.pdf`, ten root-level `.html`, two `.xlsx` under
  `templates/tarshid/`, and the directory `docs/ui-9J/`.
- One further item we could not complete ourselves: the annotated tag
  `9j-before` (`32ce4ee5e7008db99e59a6f8050841693b588b01`). Our pushes to
  update or delete it are refused with HTTP 403. If it still exists when you
  read this, please delete it — it points at pre-rewrite history.

Thank you.

---

## Notes for the owner (not part of the message)

- **Send this yourself from the repository-owning account.** Support will not
  act on a request from anyone else.
- **The tag is faster to fix yourself than to wait for Support.** Go to
  `https://github.com/MDQEstablishment/IES-DASHBOARD/tags`, find `9j-before`,
  and delete it. That takes about five seconds and removes the last ref
  serving the old history. Do it before sending, then delete the final
  bullet from the message above. If you delete it, tell me and I will
  re-verify from a fresh clone.
- Ask 1 is the one that matters. Until it is answered, the honest description
  of the data's status is **"unreachable, not proven gone"**, and that is what
  should be said to anyone who asks.
