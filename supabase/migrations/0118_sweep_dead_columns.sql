-- 9K(5) — drop four columns nothing reads.
--
-- Each was checked against the live database and the whole of src/ before being
-- listed here. Dropping a column is irreversible in the sense that matters —
-- the DATA goes with it — so "nothing references it" was established by search
-- rather than by memory of what the feature was meant to do.
--
-- coc_project_settings.esco_signatory
-- coc_project_settings.tarshid_spm
-- coc_project_settings.tarshid_technical
--   Three jsonb columns, each with a plausible default sitting in it —
--   '{"org":"IES",...}', 'Sultan Al Ruwais / SPM', 'Dr Mohammad Muaafa /
--   Technical Department'. They read as live configuration, which is exactly why
--   they are worth removing: they are not. Zero references anywhere in the
--   application. The certificate's approval grid auto-fills ONE cell, the ESCO
--   column, and it takes the name from the PROFILE of whoever generates the
--   document (fetchCocContext -> currentUserName); the TARSHID and ENTITY
--   columns are deliberately left blank for wet signature. So the defaults above
--   have never appeared on a certificate. Leaving them invites someone to
--   "correct" a name here and wonder why no document changes.
--
--   NO HUMAN-ENTERED DATA IS LOST, and this was checked rather than assumed:
--   both live rows hold {"org": "IES"} and {} — LESS than the column defaults,
--   not more. Nobody has ever typed a signatory into them.
--
-- profiles.color
--   Every avatar in the app takes its colour from roleColor(role), a map in
--   src/lib/constants.js. Nothing reads profiles.color — rbac.jsx selects the
--   whole profile row but uses role, name, job title and manager only.
--
--   Nine rows carry a value, so this one does drop data; it is exactly one
--   distinct colour per role (admin #475569, ceo #0F766E, plane #DB2777,
--   pmo #2563EB, procm #7C3AED, proco #9333EA, progm #0891B2, proje #CA8A04,
--   projm #D97706), i.e. a per-role constant copied onto every profile. It is
--   fully derivable from `role`, recorded here in the migration if it is ever
--   wanted, and superseded by the client-side map the UI actually renders.
--
-- The other coc_project_settings columns STAY and are in active use:
-- layout_mode, esm_groupings and default_attachments are all read by the COC
-- wizard and the plan RPC.

alter table public.coc_project_settings
  drop column if exists esco_signatory,
  drop column if exists tarshid_spm,
  drop column if exists tarshid_technical;

alter table public.profiles
  drop column if exists color;
