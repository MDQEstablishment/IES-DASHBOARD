-- 8W: @mentions in building chat + bell notifications.
-- v1 flat chat: mentions live as a uuid[] on the message (no join table).
alter table public.building_chat_messages
  add column if not exists mentions uuid[] not null default '{}';

-- Notifications: one row per recipient. type left open for future kinds.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null default 'mention',
  project_id uuid references public.projects(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete cascade,
  message_id uuid references public.building_chat_messages(id) on delete cascade,
  body_preview text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;
-- A user only ever sees / marks-read their own notifications.
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
-- No client INSERT policy: delivery is the SECURITY DEFINER trigger below, so
-- notifications can never be spoofed and are written even if the client dies
-- right after posting. (Editing a message deliberately does NOT re-notify in v1.)
grant select, update on public.notifications to authenticated;

create or replace function public.fanout_chat_mentions()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project uuid;
begin
  if new.mentions is null or array_length(new.mentions, 1) is null then
    return new;
  end if;
  select project_id into v_project from public.buildings where id = new.building_id;
  insert into public.notifications (recipient_id, actor_id, type, project_id, building_id, message_id, body_preview)
  select distinct m, new.user_id, 'mention', v_project, new.building_id, new.id, left(new.body, 120)
  from unnest(new.mentions) as m
  where m is not null and m <> new.user_id;   -- never notify yourself
  return new;
end;
$function$;

drop trigger if exists trg_fanout_chat_mentions on public.building_chat_messages;
create trigger trg_fanout_chat_mentions
  after insert on public.building_chat_messages
  for each row execute function public.fanout_chat_mentions();

-- Realtime so the bell badge updates live (bell UI also keeps a poll fallback).
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null;
end $$;
