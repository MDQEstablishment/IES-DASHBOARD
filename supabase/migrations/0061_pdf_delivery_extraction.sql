-- supabase/migrations/0061_pdf_delivery_extraction.sql
-- Sprint 8D — PDF delivery-note auto-extraction. Additive only; the existing
-- material_deliveries table is kept as-is (status stays plain text — no enum).
--
-- Adapted to the real schema (owner-approved): the feature lands on
-- material_deliveries (there is no `deliveries` table). The catalog match is
-- stored via a new material_id FK; status uses the text values
-- 'pending_approval' / 'delivered' / 'rejected'. Access is role-based (the app's
-- model), not per-project membership.

-- 1) material_deliveries — additive columns -----------------------------------
alter table public.material_deliveries add column if not exists source text not null default 'manual';
alter table public.material_deliveries add column if not exists extracted_metadata jsonb;
alter table public.material_deliveries add column if not exists pdf_path text;
alter table public.material_deliveries add column if not exists approved_at timestamptz;
alter table public.material_deliveries add column if not exists approved_by uuid references public.profiles(id);
alter table public.material_deliveries add column if not exists rejection_reason text;
alter table public.material_deliveries add column if not exists material_id uuid references public.materials(id);

-- Approver intent (#2): engineers (proje) can add + approve/reject alongside the
-- existing write roles. Widen the write policy to include 'proje'.
drop policy if exists material_deliveries_write on public.material_deliveries;
create policy material_deliveries_write on public.material_deliveries
  for all to public
  using (public.auth_role() = any (array['admin','pmo','projm','progm','procm','proco','proje']::public.user_role[]))
  with check (public.auth_role() = any (array['admin','pmo','projm','progm','procm','proco','proje']::public.user_role[]));

-- 2) pdf_extraction_log — monthly cap + cost audit (one row per extraction) ----
create table if not exists public.pdf_extraction_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid references public.projects(id),
  created_by uuid references public.profiles(id),
  pages int,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10,5),
  success boolean not null default false,
  error text
);
alter table public.pdf_extraction_log enable row level security;
-- Settings counter (PMO/admin) reads it; the edge function writes via service role.
drop policy if exists pdf_extraction_log_read on public.pdf_extraction_log;
create policy pdf_extraction_log_read on public.pdf_extraction_log
  for select to public
  using (public.auth_role() = any (array['admin','pmo']::public.user_role[]));

-- 3) delivery-notes private bucket + role-based storage RLS --------------------
insert into storage.buckets (id, name, public) values ('delivery-notes', 'delivery-notes', false)
  on conflict (id) do nothing;

drop policy if exists delivery_notes_read on storage.objects;
create policy delivery_notes_read on storage.objects
  for select to authenticated
  using (bucket_id = 'delivery-notes');

drop policy if exists delivery_notes_write on storage.objects;
create policy delivery_notes_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'delivery-notes'
    and public.auth_role() = any (array['admin','pmo','projm','progm','procm','proco','proje']::public.user_role[]));
