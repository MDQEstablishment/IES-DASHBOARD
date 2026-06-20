-- supabase/migrations/0016_rls_enable.sql
-- IES Programme Control Platform v2 — Phase 2, migration 16
-- Enable RLS (deny-by-default) on every public table. Policies follow in 0017–0019.
-- NOT forced: the table owner (postgres/migrations) and SECURITY DEFINER functions
-- (audit writer, helpers) intentionally bypass RLS so seeds + audit keep working.

alter table public.profiles            enable row level security;
alter table public.projects            enable row level security;
alter table public.buildings           enable row level security;
alter table public.rooms               enable row level security;
alter table public.esms                enable row level security;
alter table public.project_esms        enable row level security;
alter table public.materials           enable row level security;
alter table public.building_item_scope enable row level security;
alter table public.room_items          enable row level security;
alter table public.install_log         enable row level security;
alter table public.tasks               enable row level security;
alter table public.escalations         enable row level security;
alter table public.documents           enable row level security;
alter table public.esm_doc_status      enable row level security;
alter table public.photos              enable row level security;
alter table public.building_engineers  enable row level security;
alter table public.audit_log           enable row level security;
