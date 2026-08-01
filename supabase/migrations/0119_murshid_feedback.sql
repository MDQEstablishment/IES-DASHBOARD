-- 9L(1b) — مُرشد feedback.
--
-- The panel's fourth tab: a suggestion / problem / question box that records
-- which SCREEN the person was on when they wrote it, because "the table is
-- confusing" is unactionable and "the table on Doc Tracker is confusing" is a
-- ticket. The screen comes from the same data-screen-label the panel already
-- reads, so it is captured without asking.
--
-- No e-mail dependency, by decision: rows surface in Settings for pmo/admin.
-- The platform has no mail provider and standing one up is infrastructure the
-- owner approves, not a side effect of a sprint — the same call made for
-- notifications in 9G and for the escalation auto-close.
--
-- RLS, deliberately asymmetric:
--   INSERT — any authenticated user, for themselves only. user_id is forced to
--            equal auth.uid() by the policy, so a caller cannot file feedback
--            under someone else's name.
--   SELECT — pmo and admin see everything; everyone else sees only their own
--            rows. People should be able to re-read what they sent; nobody
--            should be able to read a colleague's complaint.
--   UPDATE/DELETE — nobody, through no policy at all. Feedback is a record of
--            what someone said at a moment; editing it away is not a feature.
--            (Deliberate: RLS denies by default, so the absence of a policy IS
--            the rule, not an oversight.)
--
-- `category` is constrained to the three Arabic values the panel offers rather
-- than left free text, so the Settings view can group without normalising
-- whatever arrives.

create table if not exists public.murshid_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  screen      text,
  category    text not null check (category in ('اقتراح', 'مشكلة', 'استفسار')),
  message     text not null check (length(btrim(message)) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index if not exists murshid_feedback_created_idx on public.murshid_feedback (created_at desc);
create index if not exists murshid_feedback_user_idx on public.murshid_feedback (user_id);

alter table public.murshid_feedback enable row level security;

drop policy if exists murshid_feedback_insert on public.murshid_feedback;
create policy murshid_feedback_insert on public.murshid_feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists murshid_feedback_read on public.murshid_feedback;
create policy murshid_feedback_read on public.murshid_feedback
  for select to authenticated
  using (
    public.auth_role() = ANY (ARRAY['pmo'::user_role, 'admin'::user_role])
    or user_id = (select auth.uid())
  );
