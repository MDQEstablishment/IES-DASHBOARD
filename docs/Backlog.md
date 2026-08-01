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
