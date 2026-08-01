-- 9H(2) — lighting-control mapping.
--
-- Like 9H(1), the certificate has always DRAWN this table: docPdf.js renders
-- «أنواع وكميات بنود التحكم بالإنارة الداخلية التي تم تركيبها» with all six
-- columns, and cocPdf.js has always split control items out of the lighting
-- table by ESM name. What it could not do was say WHICH lighting item each
-- controller controls: ctrlRefNo / ctrlRefDesc / ctrlTotal were hardcoded to
-- ''. So the table printed the controllers with three empty columns.
--
-- The missing fact is a relationship, not an attribute — "this LEDVANCE sensor
-- controls those 40 LED panels" — so it gets its own link table rather than
-- three more columns on project_installed_items.
--
-- The same rows feed the WIR's ESM2 content block in 9H(7): entered once here,
-- printed on both documents.

create table if not exists public.project_control_links (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id)                on delete cascade,
  esm_code           text not null,
  control_item_id    uuid not null references public.project_installed_items(id) on delete cascade,
  controlled_item_id uuid not null references public.project_installed_items(id) on delete cascade,
  controlled_qty     integer,
  notes              text,
  created_at         timestamptz not null default now(),
  constraint project_control_links_distinct check (control_item_id <> controlled_item_id),
  constraint project_control_links_unique unique (control_item_id, controlled_item_id)
);

create index if not exists project_control_links_project_esm_idx
  on public.project_control_links (project_id, esm_code);

-- A link whose two ends live in different projects would print a reference
-- number pointing at a row from another project's certificate. The FKs cannot
-- express that, so a trigger does.
create or replace function public.control_links_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ctrl uuid;
  v_tgt  uuid;
begin
  select project_id into v_ctrl from public.project_installed_items where id = NEW.control_item_id;
  select project_id into v_tgt  from public.project_installed_items where id = NEW.controlled_item_id;

  if v_ctrl is distinct from NEW.project_id or v_tgt is distinct from NEW.project_id then
    raise exception 'A control link must join two items from the same project'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists control_links_guard_trg on public.project_control_links;
create trigger control_links_guard_trg
  before insert or update on public.project_control_links
  for each row execute function public.control_links_guard();

alter table public.project_control_links enable row level security;

-- Mirrored exactly from project_installed_items, as in 9H(1).
drop policy if exists project_control_links_read on public.project_control_links;
create policy project_control_links_read
  on public.project_control_links for select using (true);

drop policy if exists project_control_links_write on public.project_control_links;
create policy project_control_links_write
  on public.project_control_links for all
  using      (public.auth_role() = any (array['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role]))
  with check (public.auth_role() = any (array['admin'::user_role, 'pmo'::user_role, 'projm'::user_role, 'proje'::user_role]));
