-- supabase/migrations/0069_building_chat.sql
-- Sprint 8L — per-building Chat (flat thread, v1). Additive. The old right-rail
-- "Comments" placeholder becomes a real persistent message thread.

create table if not exists public.building_chat_messages (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  user_id uuid references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists building_chat_building_idx on public.building_chat_messages (building_id, created_at desc);

alter table public.building_chat_messages enable row level security;

-- Members (any authenticated app user) can read the thread.
drop policy if exists bcm_read on public.building_chat_messages;
create policy bcm_read on public.building_chat_messages for select to authenticated using (true);

-- A user may only post as themselves.
drop policy if exists bcm_insert on public.building_chat_messages;
create policy bcm_insert on public.building_chat_messages for insert to authenticated
  with check (user_id = auth.uid());

-- Authors may edit / soft-delete (set deleted_at) their own messages. The 15-minute
-- edit window is enforced in the UI; soft-delete stays available afterwards.
drop policy if exists bcm_update on public.building_chat_messages;
create policy bcm_update on public.building_chat_messages for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.building_chat_messages to authenticated;
