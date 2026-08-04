-- Murshid chat redesign — per-message reactions on murshid_feedback.
--
-- WHY. 0119 built this table for one shape of input: a written note, filed from
-- a form, in one of three categories. The panel is being rebuilt as a chat, and
-- a chat's most common piece of feedback is not a paragraph — it is a thumb on
-- one reply. Today that cannot be recorded at all:
--
--   * `category` accepts only the three Arabic labels the 0119 form offered, so
--     there is no value that means "this answer helped";
--   * `message` is NOT NULL with a 1..4000 length check, so a bare thumb with
--     no body is rejected;
--   * nothing on the row says WHICH reply is being rated, so even if a thumb
--     could be stored it would be unattributable.
--
-- This migration widens the table to carry both shapes. It is additive in
-- effect: no column is dropped, no row is rewritten, and every write the old
-- form could make still succeeds (in its English category).
--
-- THE TABLE IS EMPTY. Verified before applying — `select count(*)` returned 0.
-- There is no data to migrate and no row that the new CHECK could orphan.
--
-- 1. CATEGORY — Arabic labels replaced by English ones, DELIBERATELY.
--    The old constraint listed the three Arabic strings the old form rendered.
--    They are not being translated in place and kept as a legacy alias set;
--    they are GONE. The three concepts survive in English —
--    suggestion / problem / question — and the two chat reactions are added
--    alongside them: helpful / not_helpful.
--
--    This is the last Arabic text held in the database. Removing it satisfies
--    docs/Constraints.md #1 (zero Arabic in UI source / DB / locale) outright,
--    rather than by carrying a documented exception. The two sanctioned
--    exceptions in that document (the COC PDF's fixed field labels, and
--    buildings.name_ar as a data identifier) are untouched and still stand.
--
--    Dropping and re-adding a CHECK is not a destructive op under
--    Constraints.md #5: no data is lost because there is no data, and the new
--    constraint is a strict superset of the old one's INTENT (three concepts
--    plus two more), only spelled in the platform's language.
--
-- 2. MESSAGE — nullable, but still bounded when present.
--    A thumb has no body, so NOT NULL has to go. The length check does not:
--    it is re-expressed as "NULL is fine, but if you send text it must be
--    1..4000 characters after trimming". A NULL passes; an empty string, or a
--    string of only whitespace, still fails exactly as it did before. That
--    distinction is the point — absent is a valid reaction, blank is a bug.
--
-- 3. REPLY_TO — what the thumb is about.
--    Nullable text holding the assistant reply (or the question that produced
--    it) the reaction refers to, so a thumb read in Settings is legible without
--    the reader having to reconstruct the conversation. Nullable because
--    ordinary written feedback is not about any particular reply and leaves it
--    empty. Bounded 1..4000 like `message`, and the client truncates to that
--    length before writing, so a very long answer degrades to a clipped excerpt
--    rather than a failed insert.
--
-- RLS — NOT TOUCHED, and it does not need to be.
--    INSERT: the existing `murshid_feedback_insert` policy is
--            `with check (user_id = (select auth.uid()))`. It constrains WHO a
--            row may be filed as and says nothing about the row's shape, so the
--            new reaction write is already covered by it — a thumb is just an
--            insert of a row the caller owns. No new policy, no policy edit.
--    SELECT: unchanged — pmo and admin read everything, everyone else reads
--            only their own rows.
--    UPDATE/DELETE: still no policy at all, so RLS denies both. KNOWN AND
--            ACCEPTED CONSEQUENCE, not an oversight: a reaction is write-once
--            and cannot be retracted or flipped. Someone who thumbs-down a
--            reply by mistake cannot take it back, and the UI is built to be
--            honest about that — once a thumb is sent both thumbs go inert
--            rather than pretending the choice is still live. Making reactions
--            editable would mean a new UPDATE policy and a decision about who
--            may rewrite whose feedback; that is the owner's call, not a side
--            effect of this migration.

-- 1 ────────────────────────────────────────────────────────────────────────
alter table public.murshid_feedback
  drop constraint if exists murshid_feedback_category_check;

alter table public.murshid_feedback
  add constraint murshid_feedback_category_check
  check (category in ('suggestion', 'problem', 'question', 'helpful', 'not_helpful'));

-- 2 ────────────────────────────────────────────────────────────────────────
alter table public.murshid_feedback
  alter column message drop not null;

alter table public.murshid_feedback
  drop constraint if exists murshid_feedback_message_check;

alter table public.murshid_feedback
  add constraint murshid_feedback_message_check
  check (message is null or length(btrim(message)) between 1 and 4000);

-- 3 ────────────────────────────────────────────────────────────────────────
alter table public.murshid_feedback
  add column if not exists reply_to text;

alter table public.murshid_feedback
  drop constraint if exists murshid_feedback_reply_to_check;

alter table public.murshid_feedback
  add constraint murshid_feedback_reply_to_check
  check (reply_to is null or length(btrim(reply_to)) between 1 and 4000);

comment on column public.murshid_feedback.reply_to is
  'The assistant reply (or the question that produced it) a helpful / not_helpful reaction refers to. NULL for written feedback, which is not about a particular message.';

comment on column public.murshid_feedback.category is
  'suggestion | problem | question — written feedback. helpful | not_helpful — a thumb on one assistant reply, in which case message may be NULL and reply_to carries the excerpt.';
