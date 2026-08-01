-- 9H(1) — "other installed items" for the COC.
--
-- The certificate has always PRINTED the table «أنواع وكميات البنود الأخرى التي
-- تم تركيبها» (docPdf.js renders it for both the lighting and the AC layout,
-- padding to 4-5 blank rows when there is nothing to show). What it never had
-- was anywhere to read the rows FROM: assembleCocPdfData pinned
-- `installedOther: []`, so every certificate ever generated printed that table
-- empty. This is the storage the renderer has been waiting for.
--
-- These are the consumables that are installed but are not a replacement pair —
-- cable runs, G-13 lamp holders, A/C connecting switches, copper pipe, window
-- frame closures. They deliberately do NOT live in project_installed_items:
-- everything in that table is half of a paired new<->old replacement (the
-- orphan warning in ProjectItems exists to enforce exactly that), and these
-- items replace nothing.
--
-- esm_code + building_id mean the existing COC scoping filter routes these rows
-- to the right certificate with no change: an item is in scope when its ESM is
-- on the certificate AND it is either project-wide or belongs to a covered
-- building.

create table if not exists public.project_other_installed_items (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id)  on delete cascade,
  building_id      uuid          references public.buildings(id) on delete cascade,
  esm_code         text not null,
  item_description text,
  qty              integer,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists project_other_installed_items_project_esm_idx
  on public.project_other_installed_items (project_id, esm_code);

alter table public.project_other_installed_items enable row level security;

-- Mirrored EXACTLY from project_installed_items: the same people who maintain
-- the replacement pairs maintain these rows. No new authority is granted.
drop policy if exists project_other_installed_items_read on public.project_other_installed_items;
create policy project_other_installed_items_read
  on public.project_other_installed_items for select using (true);

drop policy if exists project_other_installed_items_write on public.project_other_installed_items;
create policy project_other_installed_items_write
  on public.project_other_installed_items for all
  using      (public.auth_role() = any (array['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role]))
  with check (public.auth_role() = any (array['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role]));
