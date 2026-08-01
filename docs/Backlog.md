# Backlog — named items awaiting an owner decision

Items that were **found and measured** but deliberately **not changed**, because
the change is the owner's call rather than the sprint's. Each entry states what
was measured, why it was not acted on, and what deciding either way would cost.

Named so they can be referred to without re-deriving them. Nothing here is a
commitment to build; some of these should stay unbuilt.

---

## ROLE_AVATAR_CONTRAST — role-coloured avatar initials fall short of AA

**Status:** open · logged, not changed · owner decision

**Measurement.** `Avatar` (`src/components/ui.jsx`) paints white initials
(`--surface-1`, `#FFFFFF`) on a solid role colour from `ROLE_COLOR`
(`src/lib/constants.js`). Contrast, WCAG 2.1 relative-luminance formula, white
against each role colour as shipped:

| role | colour | white-on-colour | AA normal text (4.5:1) |
| --- | --- | --- | --- |
| `progm` — Program Manager | `#0891B2` | **3.68:1** | ✗ |
| **`pmo` — PMO** | **`#A0762B`** | **4.10:1** | ✗ |
| `plane` — Planning Engineer | `#DB2777` | 4.60:1 | ✓ |
| `projm` / `proje` | `#B45309` | 5.02:1 | ✓ |
| `proco` | `#9333EA` | 5.38:1 | ✓ |
| `ceo` | `#0F766E` | 5.47:1 | ✓ |
| `procm` | `#6D5A8E` | 5.99:1 | ✓ |
| `admin` | `#56534B` | 7.68:1 | ✓ |
| *(no role — `--avatar-bg` default)* | `#666670` | 5.68:1 | ✓ |

Two of the nine fail AA for normal text: **PMO brass at 4.10:1** — the one the
owner sees on his own avatar in the shell every session — and **Program Manager
cyan at 3.68:1**, which is actually the worse of the two. Both clear AA-large
(3:1); neither clears 4.5:1.

Whether 4.5:1 is even the right bar is part of what there is to decide. The
initials are 700-weight at `size × 0.38` — 11px at the 28px avatar, 15px at the
40px Settings avatar. AA-large's 3:1 applies at 18.66px bold and up, so the
large-text exemption does **not** cover these at any size the app actually uses.
The 4.5:1 bar is the applicable one, and both colours miss it.

**Why it is not being changed here.**

1. **It is inherited, not introduced.** `ROLE_COLOR` has carried these exact nine
   hexes since v1.5, where the comment records them as *"identical to the
   design's `people{}` colors (and our DB profiles)"*. 9J recoloured the whole
   application and did not touch this map — verified: the map is unchanged
   across every 9J commit. So this is not a regression the reskin introduced,
   and fixing it is not reskin clean-up.

2. **The colours are load-bearing outside the avatar.** They are the design's
   people palette and are mirrored in the DB profiles. Darkening PMO brass to
   reach 4.5:1 moves it away from `--accent` (`#A0762B` — the same brass), which
   is the application's primary accent. The avatar and the accent are currently
   the same value on purpose.

3. **There is more than one honest fix, and they are not equivalent.** Darken
   the two failing colours; or keep the colours and change the initials (a dark
   ink on a tinted fill, which is the 9K(3) H3 move applied a second time); or
   accept the ratio and record the exemption. The first changes brand colour,
   the second changes the avatar's visual weight everywhere, the third changes
   nothing. That is a design call.

**Deliberately not conflated with 9K(3) H3.** That defect was different in kind:
`Avatar` was defaulting its fill to `--text-3`, a **40 %-alpha** ink meant for
de-emphasised text, so the fill composited against whatever was behind it and
the result was unpredictable. It was fixed with a solid `--avatar-bg` at 5.68:1
and it is fixed. This item is about the *role* colours passed explicitly at 11
call sites, which H3 never touched.

**Call sites affected** (11, all passing `roleColor(...)` explicitly):
`Shell.jsx` ×2, `Settings.jsx` ×4, `Escalations.jsx` ×2, `Tasks.jsx`,
`BuildingChat.jsx`. The three `<Avatar>` uses that pass no colour take
`--avatar-bg` and are not affected.

**Cost of deciding.** Option 1 is a two-hex edit in `ROLE_COLOR` plus a check
that nothing else keys off those literals. Option 3 is a comment. Neither is
large. What is not cheap is doing it twice because the palette was changed
without the owner.

---

## ESCALATION_AGE_VISIBILITY — an old escalation should get louder, not quieter

**Status:** open · logged, not built · owner decision · raised by 9N

**The problem.** An escalation that has been open a long time is the most
important row on the Attention List and on the Escalations page, and today it is
presented identically to one raised an hour ago. `Dashboard.jsx` colours the AGE
cell by **severity** (`critical` red, `high` amber, everything else grey) and
orders escalations by severity descending. Age is rendered as text and is
otherwise inert: nothing sorts by it, nothing marks it, nothing escalates it.
So a `medium` escalation open for six weeks sits below a `critical` raised this
morning, in grey.

**Why this is logged rather than built.** It came out of 9N as the *correct*
answer to a problem whose *incorrect* answer — auto-closing escalations by age —
was refused outright (`docs/9N-decisions.md` N4). Auto-closing by age deletes
precisely the signal the escalation exists to raise. Making it more visible is
the opposite move and the right one, but it is a presentation change with real
design questions the schema sprint has no business answering:

- **What threshold?** Flat (e.g. 7 days), or per severity — a `critical`
  unanswered for 24 hours is arguably worse than a `low` unanswered for a month.
- **Sort, badge, or both?** Sorting by age subordinates severity, which is the
  current primary key of the list and was chosen deliberately. A badge preserves
  the severity order and adds a second axis. Both is possible and busier.
- **Which surfaces?** The Dashboard's Attention List, the Escalations page, or
  both. The Escalations page is tabbed by status and has its own conventions.
- **Does it feed notifications?** A threshold crossing is a natural notification
  trigger (`escalation_ageing`), which would be a seventh notification type and
  needs its own opinion about who is told and how often.

**Not the same as the escalation chain.** `escalations_derive_chain` (0015) and
`level` already model escalating *up the hierarchy*, which is a person's
deliberate act. This item is about time passing while nobody acts, which is the
thing nothing currently represents.

**Cost of deciding.** Any variant is a small change confined to `Dashboard.jsx`
and/or `Escalations.jsx` — the age is already computed and rendered at both
sites, so it is a threshold constant plus a style branch, and a comparator if
sorting changes. Deciding the threshold is the expensive part, and it is a
judgement about how this programme is actually run, which is the owner's.
