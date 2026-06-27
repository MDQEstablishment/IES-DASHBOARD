-- supabase/migrations/0063_warehouse_categories_variants.sql
-- Sprint 8E (1/3) — warehouse spine, part 1: the 3-tier catalog tables + the
-- delivery columns needed for batching, quantities and the delivery-note rename.
-- Additive only. Decision (after inspecting usage): `materials` BECOMES the
-- variants table — it is FK-referenced by building_item_scope.material_code, so
-- `code` is kept as the SKU/brand code (NOT renamed) and variant attributes are
-- added alongside. A material_categories table sits above it (tier 1=esm,
-- tier 2=category, tier 3=variant=materials row).

create table if not exists public.material_categories (
  id uuid primary key default gen_random_uuid(),
  esm_id uuid references public.esms(id),
  code text unique not null,
  name_en text not null,
  default_unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.material_categories enable row level security;
drop policy if exists material_categories_read on public.material_categories;
create policy material_categories_read on public.material_categories for select to public using (true);
drop policy if exists material_categories_write on public.material_categories;
create policy material_categories_write on public.material_categories for all to public
  using (public.auth_role() = any (array['admin','pmo','procm']::public.user_role[]))
  with check (public.auth_role() = any (array['admin','pmo','procm']::public.user_role[]));

-- materials = variants: add category + variant attributes (code stays the SKU).
alter table public.materials add column if not exists category_id uuid references public.material_categories(id);
alter table public.materials add column if not exists brand text;
alter table public.materials add column if not exists supplier text;
alter table public.materials add column if not exists part_number text;
alter table public.materials add column if not exists cost_per_unit numeric(12,2);

-- material_deliveries: batch grouping, quantity (for the stock ledger) and the
-- delivery-note number (8D never had an invoice_no column — it lived only inside
-- extracted_metadata — so backfill the new column from there).
alter table public.material_deliveries add column if not exists delivery_batch_id uuid;
alter table public.material_deliveries add column if not exists quantity numeric;
alter table public.material_deliveries add column if not exists delivery_note_no text;
update public.material_deliveries
  set delivery_note_no = nullif(extracted_metadata->'header'->>'invoice_no','')
  where delivery_note_no is null and extracted_metadata is not null;
-- backfill quantity from the PDF-extracted line where available
update public.material_deliveries
  set quantity = nullif(extracted_metadata->'line'->>'qty','')::numeric
  where quantity is null and extracted_metadata ? 'line';
