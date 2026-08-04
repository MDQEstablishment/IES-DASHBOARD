-- Murshid chat redesign — conversation history, owned per account.
--
-- WHY THIS EXISTS. The 9L(3) panel kept the thread in React state and said so:
-- "session memory only — nothing is persisted", on the reasoning that stored
-- questions and answers are a new sensitive surface nobody had asked for. The
-- owner has now asked for it. The panel is becoming a chat assistant in the
-- shape of the tools he actually uses, and those resume where you left off; a
-- thread that evaporates on reload is not that.
--
-- So the surface is being opened deliberately, with the controls named up
-- front rather than added later: ownership enforced in the database, no
-- organisational read-through, and a bounded retention window.
--
-- ---------------------------------------------------------------------------
-- SHAPE
--
--   murshid_conversations  one row per thread, owned by one profile
--   murshid_messages       the turns, ordered by created_at
--
-- MESSAGES DO NOT CARRY user_id, deliberately. Ownership is derived through
-- the conversation:
--
--     exists (select 1 from murshid_conversations c
--              where c.id = conversation_id and c.user_id = (select auth.uid()))
--
-- Denormalising the owner onto every message would put the same fact in two
-- places, and two places can disagree — a message whose user_id says one thing
-- and whose parent conversation says another is a row that no policy reads
-- correctly. One source of truth for who owns a thread. The extra join is paid
-- for by an index on murshid_messages (conversation_id, created_at), which the
-- read path needs anyway because it always fetches one thread in order.
--
-- ---------------------------------------------------------------------------
-- RLS, AND WHY IT DIFFERS FROM murshid_feedback ON PURPOSE
--
--   conversations  select / insert / update / delete, all gated on
--                  user_id = (select auth.uid()). You own your threads
--                  completely, including deleting them.
--   messages       select / insert through the exists() above. NO UPDATE
--                  POLICY: a message is a record of what was said, and editing
--                  it after the fact makes the history worthless as a record.
--                  Delete is allowed so that deleting a conversation is not
--                  blocked, and so a user can drop a thread's contents.
--
-- THERE IS NO pmo / admin READ OVERRIDE ON EITHER TABLE. THIS IS NOT AN
-- OMISSION — DO NOT "FIX" IT.
--
-- murshid_feedback gives pmo and admin full read because feedback is addressed
-- TO the organisation: someone writing "the Doc Tracker table is confusing" is
-- filing a ticket and expects it to be read by whoever can act on it. A
-- conversation with the assistant is not addressed to anyone. It is a person
-- working — asking what their own numbers mean, in their own words, sometimes
-- clumsily. Making that readable by role would be surveillance of how people
-- do their jobs, dressed as an admin feature, and it would change what people
-- are willing to ask. The value of the assistant depends on it being safe to
-- ask a stupid question.
--
-- If an operational need for aggregate visibility ever appears, the answer is
-- counts and costs — ai_runs already carries those, per user, with no content —
-- not the transcripts.
--
-- ---------------------------------------------------------------------------
-- RETENTION — 90-DAY ROLLING WINDOW, ANSWERED RATHER THAN DEFAULTED
--
-- Persisting answers converts a transient exposure into a durable one. The
-- assistant answers only from what the asker's own JWT can reach, so nothing
-- in a thread was ever secret from its owner — but a year of threads is a
-- standing extract of that person's working data, sitting in a table, long
-- after it stopped being useful to them. The window bounds the blast radius of
-- anything that later goes wrong: a leak reaches ninety days of conversation,
-- not the life of the deployment.
--
-- Ninety days because the point of resuming a thread is continuity of work in
-- progress, and work in progress does not span a quarter. Anyone who wants
-- something gone sooner has the delete policy and can drop the thread now.
--
-- public.purge_murshid_history(days int default 90) deletes conversations whose
-- updated_at is older than the cutoff; messages follow by cascade. Scheduled
-- daily at 03:15 UTC via pg_cron (installed on this project; the escalation
-- auto-close from 0122 already runs on it).
--
-- updated_at is maintained by a trigger on message insert, not by the client,
-- so "last activity" is a fact the database knows. Without it updated_at would
-- mean "created", and an actively used thread would be purged out from under
-- its owner on day ninety.

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.murshid_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- The first user message, trimmed. Set once, never regenerated — no model
  -- call, so it is produced with the chat flag off exactly as with it on.
  title       text check (title is null or length(btrim(title)) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.murshid_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.murshid_conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null check (length(btrim(content)) between 1 and 8000),
  created_at       timestamptz not null default now()
);

create index if not exists murshid_conversations_user_idx
  on public.murshid_conversations (user_id, updated_at desc);
create index if not exists murshid_messages_thread_idx
  on public.murshid_messages (conversation_id, created_at);

-- ── last-activity trigger ───────────────────────────────────────────────────
-- Invoker rights on purpose: the only caller that can insert a message is the
-- conversation's owner (the insert policy says so), and that same owner is the
-- only one the conversations UPDATE policy lets through. The trigger therefore
-- needs no elevation, and cannot be used to touch a thread you do not own.
create or replace function public.murshid_touch_conversation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  update public.murshid_conversations
     set updated_at = now()
   where id = NEW.conversation_id;
  return NEW;
end $$;

drop trigger if exists murshid_messages_touch_trg on public.murshid_messages;
create trigger murshid_messages_touch_trg
  after insert on public.murshid_messages
  for each row execute function public.murshid_touch_conversation();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.murshid_conversations enable row level security;
alter table public.murshid_messages      enable row level security;

drop policy if exists murshid_conversations_select on public.murshid_conversations;
create policy murshid_conversations_select on public.murshid_conversations
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists murshid_conversations_insert on public.murshid_conversations;
create policy murshid_conversations_insert on public.murshid_conversations
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists murshid_conversations_update on public.murshid_conversations;
create policy murshid_conversations_update on public.murshid_conversations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists murshid_conversations_delete on public.murshid_conversations;
create policy murshid_conversations_delete on public.murshid_conversations
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists murshid_messages_select on public.murshid_messages;
create policy murshid_messages_select on public.murshid_messages
  for select to authenticated using (
    exists (select 1 from public.murshid_conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

drop policy if exists murshid_messages_insert on public.murshid_messages;
create policy murshid_messages_insert on public.murshid_messages
  for insert to authenticated with check (
    exists (select 1 from public.murshid_conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

-- No UPDATE policy — see the header. Delete is the owner's, through the same
-- derivation, so dropping a thread's contents is possible and editing them is
-- not.
drop policy if exists murshid_messages_delete on public.murshid_messages;
create policy murshid_messages_delete on public.murshid_messages
  for delete to authenticated using (
    exists (select 1 from public.murshid_conversations c
             where c.id = conversation_id and c.user_id = (select auth.uid()))
  );

-- ── retention ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER because the scheduled caller must be able to delete rows it
-- does not own. EXECUTE IS REVOKED FROM THE CLIENT ROLES: a definer-rights
-- function that deletes by age is a wipe primitive if anyone can call it with
-- days => 0, and anon/authenticated have no business calling it at all.
create or replace function public.purge_murshid_history(days int default 90)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare n int;
begin
  if days is null or days < 1 then
    raise exception 'purge_murshid_history: days must be >= 1 (got %)', days;
  end if;
  delete from public.murshid_conversations
   where updated_at < now() - make_interval(days => days);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.purge_murshid_history(int) from public;
revoke all on function public.purge_murshid_history(int) from anon;
revoke all on function public.purge_murshid_history(int) from authenticated;

do $$
begin
  perform cron.unschedule('murshid-history-purge');
exception when others then
  null;  -- not scheduled yet; nothing to remove
end $$;

select cron.schedule(
  'murshid-history-purge',
  '15 3 * * *',
  'select public.purge_murshid_history(90)'
);

-- ── PROOF: the isolation is the database's, not the client's ────────────────
-- Two real profiles, A and B. A writes a thread under their own JWT. B then
-- tries every retrieval path there is — list both tables, filter messages by
-- conversation_id, fetch each row by its primary key — and must see nothing.
-- Then B tries to write into A's thread and must be refused.
--
-- The block runs as the `authenticated` role, not as the migration's owner:
-- the owner bypasses RLS, so a test that stayed as postgres would prove
-- nothing at all.
do $$
declare
  a uuid; b uuid;
  conv uuid; msg uuid;
  n int; blocked boolean;
begin
  select id into a from public.profiles where not archived order by created_at limit 1;
  select id into b from public.profiles where not archived and id <> a order by created_at limit 1;
  if a is null or b is null then
    raise notice 'SKIPPED — needs two profiles to prove isolation; found fewer';
    return;
  end if;

  -- ---- as A -------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.murshid_conversations (user_id, title)
    values (a, 'RLS proof thread') returning id into conv;
  insert into public.murshid_messages (conversation_id, role, content)
    values (conv, 'user', 'Which buildings are behind this week?') returning id into msg;

  select count(*) into n from public.murshid_conversations where id = conv;
  if n <> 1 then raise exception 'FAIL: owner A cannot see their own conversation'; end if;
  select count(*) into n from public.murshid_messages where conversation_id = conv;
  if n <> 1 then raise exception 'FAIL: owner A cannot see their own message'; end if;
  raise notice 'PASS: A wrote a conversation and a message and can read both back';

  reset role;

  -- ---- as B -------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.murshid_conversations;
  if n <> 0 then raise exception 'LEAK: B lists % conversation(s)', n; end if;

  select count(*) into n from public.murshid_conversations where id = conv;
  if n <> 0 then raise exception 'LEAK: B fetched A''s conversation by id'; end if;

  select count(*) into n from public.murshid_messages;
  if n <> 0 then raise exception 'LEAK: B lists % message(s)', n; end if;

  select count(*) into n from public.murshid_messages where conversation_id = conv;
  if n <> 0 then raise exception 'LEAK: B filtered A''s messages by conversation_id'; end if;

  select count(*) into n from public.murshid_messages where id = msg;
  if n <> 0 then raise exception 'LEAK: B fetched A''s message by id'; end if;

  raise notice 'PASS: B sees zero rows by list, by conversation_id and by direct id on both tables';

  blocked := false;
  begin
    insert into public.murshid_messages (conversation_id, role, content)
      values (conv, 'user', 'injected by B');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: B inserted a message into A''s conversation'; end if;

  blocked := false;
  begin
    insert into public.murshid_conversations (user_id, title) values (a, 'forged by B');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'LEAK: B created a conversation owned by A'; end if;

  raise notice 'PASS: B cannot write into A''s conversation, nor forge one in A''s name';

  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- ---- cleanup ----------------------------------------------------------
  delete from public.murshid_conversations where id = conv;   -- messages cascade
  select count(*) into n from public.murshid_conversations;
  if n <> 0 then raise exception 'FAIL: % conversation row(s) left behind', n; end if;
  select count(*) into n from public.murshid_messages;
  if n <> 0 then raise exception 'FAIL: % message row(s) left behind', n; end if;
  raise notice 'PASS: test rows removed — both tables empty';
end $$;
