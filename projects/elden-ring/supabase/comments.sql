-- Elden Ring Atlas — community notes on map markers.
--
-- Players leave notes on a marker (above all on bosses), and vote each other's
-- notes up or down so the useful ones rise. One flat list per marker: no replies,
-- because a note is advice, not a conversation — and a thread on 1900+ markers is
-- a moderation surface nobody can staff.
--
-- WRITING REQUIRES AN ACCOUNT; READING DOES NOT. This is the opposite trade from
-- supabase/support.sql, and deliberately so: support has to reach everyone, so it
-- proves ownership with a device token, whereas a public wall that anyone can
-- write to without an identity is a spam target with no lever to pull. Requiring
-- auth.uid() gives every note an owner, makes one-vote-per-person enforceable at
-- the primary key, and lets a ban actually mean something.
--
-- Consequences of that choice, and how they are handled:
--
--   • RLS here is deny-everything: the tables carry NO policies and NO client
--     privileges. Reads and writes are only possible through the SECURITY
--     DEFINER functions below, each of which authorises the caller first.
--
--   • Vote totals are DENORMALISED onto the comment row and maintained by
--     trigger. Listing notes is the hot path (it runs every time a panel with
--     notes opens, in two windows), and it must never aggregate a vote table.
--
--   • The author's name is NOT stored on the comment. It is resolved live from
--     auth.users on every read, so renaming yourself in the profile renames your
--     whole back catalogue at once, and a database dump of these tables carries
--     no identity at all. An account that has never chosen a name posts under
--     the local part of its e-mail address; the address itself is never
--     returned. See marker_comment_author_name() below.
--
--   • Reports are one-per-person and auto-hide a comment once enough distinct
--     people flag it (marker_comment_limits below). Hiding is reversible and
--     visible to staff; the author still sees their own hidden note, marked, so
--     "my comment vanished" never becomes a support ticket.
--
-- DEPENDS ON supabase/support.sql — it defines public.is_support_admin(), which
-- is the moderation gate here too. Run that one first; a second admin list would
-- be a second thing to keep in sync.
--
-- Run this ONCE in the Supabase SQL editor. Re-running is safe (idempotent).

-- ── Ceilings ─────────────────────────────────────────────────────────────────
-- One place to tune. The per-user numbers are generous for someone sharing real
-- advice and tight enough that a single account cannot paper a boss page.

create or replace function public.marker_comment_limits()
returns table (
  per_user_hour int,
  per_user_day int,
  per_user_marker int,
  max_body int,
  min_body int,
  page_size int,
  auto_hide_reports int
)
language sql
immutable
as $$
  select 10, 40, 3, 1500, 2, 20, 3;
$$;

grant execute on function public.marker_comment_limits() to anon, authenticated;

-- ── Tables ───────────────────────────────────────────────────────────────────
-- `marker_key` is the client's stable address for a marker. EVERY marker has
-- one; three namespaces, because the three kinds are identified by three
-- different things (see src/features/comments/marker-comment-key.ts):
--
--   er:er-boss-12345         Elden Ring, by marker id. Built so the same boss
--                            reached from either ER map lands on one key.
--   nr:church:Church - …     Nightreign, by category + name. Its ids are seed
--                            scoped and mean nothing across runs; the POI TYPE
--                            is the only thing that stays true between nights.
--   custom:abc-def           A player's own dropped pin, by its (random) id —
--                            unique to them, so those notes are theirs alone.
--
-- It is deliberately opaque to the server: validating it would mean shipping the
-- whole marker catalogue into Postgres and re-shipping it on every data rebuild.
-- A key nothing points at is simply a row nobody ever reads.
--
-- `score` is stored, not computed per query, so "top" can be ordered by an index
-- instead of a sort over the whole marker's notes.

create table if not exists public.marker_comments (
  id uuid primary key default gen_random_uuid(),
  marker_key text not null
    check (char_length(btrim(marker_key)) between 3 and 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 2 and 1500),
  /** Blurred until the reader asks for it — notes about a boss give the fight
   *  away by nature, and some players want the map without the spoilers. */
  is_spoiler boolean not null default false,
  like_count integer not null default 0,
  dislike_count integer not null default 0,
  report_count integer not null default 0,
  /** Auto-set once enough distinct people report it; staff can set it back. */
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  score integer generated always as (like_count - dislike_count) stored
);

create index if not exists marker_comments_top_idx
  on public.marker_comments (marker_key, score desc, created_at desc);
create index if not exists marker_comments_new_idx
  on public.marker_comments (marker_key, created_at desc);
create index if not exists marker_comments_author_idx
  on public.marker_comments (user_id, created_at desc);

-- One vote per person per comment — the primary key IS the rule, so a double
-- click cannot inflate a total no matter how the client behaves. Changing your
-- mind is an UPDATE of that row; taking it back is a DELETE.
create table if not exists public.marker_comment_votes (
  comment_id uuid not null references public.marker_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table if not exists public.marker_comment_reports (
  comment_id uuid not null references public.marker_comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text check (char_length(btrim(reason)) <= 300),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists marker_comment_reports_recent_idx
  on public.marker_comment_reports (created_at desc);

-- ── Denormalised totals ──────────────────────────────────────────────────────
-- The counters on the comment row are the ONLY numbers anyone reads; these
-- triggers are what keeps them true. They are the reason listing notes never
-- touches the vote table.

create or replace function public.marker_comment_vote_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.marker_comments c
       set like_count = c.like_count - (case when old.vote = 1 then 1 else 0 end),
           dislike_count = c.dislike_count - (case when old.vote = -1 then 1 else 0 end)
     where c.id = old.comment_id;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    update public.marker_comments c
       set like_count = c.like_count
             + (case when new.vote = 1 then 1 else 0 end)
             - (case when old.vote = 1 then 1 else 0 end),
           dislike_count = c.dislike_count
             + (case when new.vote = -1 then 1 else 0 end)
             - (case when old.vote = -1 then 1 else 0 end)
     where c.id = new.comment_id;
    return new;
  end if;

  update public.marker_comments c
     set like_count = c.like_count + (case when new.vote = 1 then 1 else 0 end),
         dislike_count = c.dislike_count + (case when new.vote = -1 then 1 else 0 end)
   where c.id = new.comment_id;
  return new;
end;
$$;

drop trigger if exists marker_comment_vote_totals on public.marker_comment_votes;
create trigger marker_comment_vote_totals
  after insert or update or delete on public.marker_comment_votes
  for each row execute function public.marker_comment_vote_sync();

/** Count the report and, at the ceiling, take the comment out of circulation.
 *  Distinct people only — the primary key on the reports table guarantees that,
 *  so the threshold means "N players", not "N clicks". */
create or replace function public.marker_comment_report_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits record;
begin
  select * into v_limits from public.marker_comment_limits();

  update public.marker_comments c
     set report_count = c.report_count + 1,
         hidden = c.hidden or (c.report_count + 1) >= v_limits.auto_hide_reports
   where c.id = new.comment_id;

  return new;
end;
$$;

drop trigger if exists marker_comment_report_totals on public.marker_comment_reports;
create trigger marker_comment_report_totals
  after insert on public.marker_comment_reports
  for each row execute function public.marker_comment_report_sync();

-- ── Internals ────────────────────────────────────────────────────────────────

/** The name to show above a note, resolved live from the account.
 *
 *  The chain is the account's chosen display name, then the local part of its
 *  e-mail address, then a last-resort constant — the SAME order as
 *  resolveDisplayName() in src/services/auth/auth-service.ts, so the name a
 *  player sees on their own profile is exactly the name strangers read here. If
 *  these two ever drift, the profile becomes a lie about what is published.
 *
 *  Note what the e-mail fallback means: an account that never sets a name posts
 *  under the local part of its address. That is the product decision (it is the
 *  behaviour the app has always had); change BOTH sides together if it is ever
 *  revisited. The address itself is never returned. */
create or replace function public.marker_comment_author_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
           nullif(btrim(split_part(u.email, '@', 1)), ''),
           'Tarnished'
         )
    from auth.users u
   where u.id = p_user_id;
$$;

-- ── Reads ────────────────────────────────────────────────────────────────────
-- Both are open to `anon`: reading notes is what makes the feature worth joining
-- for, so a signed-out player sees everything except their own vote state.

/** How many notes each marker has. Takes an ARRAY so a future map badge can ask
 *  about a screenful of markers in one round trip; the panel passes one key.
 *  Markers with nothing to say are simply absent from the result. */
create or replace function public.marker_comments_counts(p_marker_keys text[])
returns table (marker_key text, comment_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.marker_key, count(*)::integer
    from public.marker_comments c
   where c.marker_key = any (p_marker_keys)
     and not c.hidden
   group by c.marker_key;
$$;

/** One marker's notes.
 *
 *  `p_sort` is 'top' (score, then newest) or 'new'. `total_count` rides on every
 *  row via a window function so "showing 20 of 34" needs no second query.
 *
 *  A hidden comment is returned only to its author (marked, so they know why it
 *  stopped getting replies) and to staff. Everyone else gets an answer that is
 *  indistinguishable from it never having existed. */
create or replace function public.marker_comments_list(
  p_marker_key text,
  p_sort text default 'top',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  marker_key text,
  body text,
  is_spoiler boolean,
  like_count integer,
  dislike_count integer,
  hidden boolean,
  created_at timestamptz,
  edited_at timestamptz,
  author_name text,
  is_mine boolean,
  my_vote smallint,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         c.marker_key,
         c.body,
         c.is_spoiler,
         c.like_count,
         c.dislike_count,
         c.hidden,
         c.created_at,
         c.edited_at,
         public.marker_comment_author_name(c.user_id),
         c.user_id = auth.uid(),
         coalesce(v.vote, 0::smallint),
         count(*) over ()
    from public.marker_comments c
    left join public.marker_comment_votes v
      on v.comment_id = c.id and v.user_id = auth.uid()
   where c.marker_key = p_marker_key
     and (not c.hidden or c.user_id = auth.uid() or public.is_support_admin())
   order by
     -- 'new' flattens the score term to a constant and falls through to the
     -- date, so one ORDER BY serves both sorts without a branch in plpgsql.
     case when p_sort = 'new' then 0 else c.score end desc,
     c.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────
-- Every one of these requires a session. The ceilings are checked here rather
-- than in a trigger so the message the player sees can say which one they hit.

/** Leave a note. */
create or replace function public.marker_comment_post(
  p_marker_key text,
  p_body text,
  p_is_spoiler boolean default false
)
returns table (
  id uuid,
  marker_key text,
  body text,
  is_spoiler boolean,
  like_count integer,
  dislike_count integer,
  hidden boolean,
  created_at timestamptz,
  edited_at timestamptz,
  author_name text,
  is_mine boolean,
  my_vote smallint,
  total_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_key text := btrim(coalesce(p_marker_key, ''));
  v_limits record;
  v_count int;
  v_row public.marker_comments%rowtype;
begin
  if v_uid is null then
    raise exception 'comments: sign in to leave a note';
  end if;
  if char_length(v_key) < 3 then
    raise exception 'comments: that marker cannot take notes';
  end if;

  select * into v_limits from public.marker_comment_limits();

  if char_length(v_body) < v_limits.min_body then
    raise exception 'comments: the note is empty';
  end if;
  if char_length(v_body) > v_limits.max_body then
    raise exception 'comments: the note is too long';
  end if;

  if not public.is_support_admin() then
    select count(*) into v_count
      from public.marker_comments c
     where c.user_id = v_uid
       and c.marker_key = v_key;
    if v_count >= v_limits.per_user_marker then
      raise exception 'comments: you have already said your piece here — edit a note instead';
    end if;

    select count(*) into v_count
      from public.marker_comments c
     where c.user_id = v_uid
       and c.created_at > now() - interval '1 hour';
    if v_count >= v_limits.per_user_hour then
      raise exception 'comments: too many notes in a short time — try again later';
    end if;

    select count(*) into v_count
      from public.marker_comments c
     where c.user_id = v_uid
       and c.created_at > now() - interval '1 day';
    if v_count >= v_limits.per_user_day then
      raise exception 'comments: you have reached today''s limit — try again tomorrow';
    end if;

    -- The same words twice on the same marker is a double submit, not a second
    -- opinion. Swallowing it here keeps a flaky connection from doubling a note.
    select count(*) into v_count
      from public.marker_comments c
     where c.user_id = v_uid
       and c.marker_key = v_key
       and btrim(c.body) = v_body;
    if v_count > 0 then
      raise exception 'comments: you already posted that note here';
    end if;
  end if;

  insert into public.marker_comments (marker_key, user_id, body, is_spoiler)
  values (v_key, v_uid, v_body, coalesce(p_is_spoiler, false))
  returning * into v_row;

  return query
    select v_row.id, v_row.marker_key, v_row.body, v_row.is_spoiler,
           v_row.like_count, v_row.dislike_count, v_row.hidden,
           v_row.created_at, v_row.edited_at,
           public.marker_comment_author_name(v_row.user_id),
           true, 0::smallint, 1::bigint;
end;
$$;

/** Rewrite your own note. Editing does not reset its votes: the point of a note is
 *  the advice, and fixing a typo should not cost the author the standing that
 *  advice earned. A rewrite into something else entirely is what reporting is
 *  for — and `edited_at` is shown, so readers can see it changed. */
create or replace function public.marker_comment_edit(
  p_comment_id uuid,
  p_body text,
  p_is_spoiler boolean default null
)
returns table (
  id uuid,
  marker_key text,
  body text,
  is_spoiler boolean,
  like_count integer,
  dislike_count integer,
  hidden boolean,
  created_at timestamptz,
  edited_at timestamptz,
  author_name text,
  is_mine boolean,
  my_vote smallint,
  total_count bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_limits record;
  v_row public.marker_comments%rowtype;
begin
  if v_uid is null then
    raise exception 'comments: sign in first';
  end if;

  select * into v_limits from public.marker_comment_limits();
  if char_length(v_body) < v_limits.min_body then
    raise exception 'comments: the note is empty';
  end if;
  if char_length(v_body) > v_limits.max_body then
    raise exception 'comments: the note is too long';
  end if;

  update public.marker_comments c
     set body = v_body,
         is_spoiler = coalesce(p_is_spoiler, c.is_spoiler),
         edited_at = case when c.body is distinct from v_body then now() else c.edited_at end
   where c.id = p_comment_id
     and c.user_id = v_uid
   returning * into v_row;

  if not found then
    raise exception 'comments: that note is not yours to edit';
  end if;

  return query
    select v_row.id, v_row.marker_key, v_row.body, v_row.is_spoiler,
           v_row.like_count, v_row.dislike_count, v_row.hidden,
           v_row.created_at, v_row.edited_at,
           public.marker_comment_author_name(v_row.user_id),
           true,
           coalesce((select v.vote from public.marker_comment_votes v
                      where v.comment_id = v_row.id and v.user_id = v_uid), 0::smallint),
           1::bigint;
end;
$$;

/** Take your note back. Staff can delete anyone's. Votes and reports cascade. */
create or replace function public.marker_comment_delete(p_comment_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    return false;
  end if;

  delete from public.marker_comments c
   where c.id = p_comment_id
     and (c.user_id = v_uid or public.is_support_admin());
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

/** Vote a note up (1), down (-1), or take your vote back (0).
 *
 *  Returns the note's totals afterwards, so the client can settle its optimistic
 *  update against the server's own numbers instead of trusting its arithmetic —
 *  two windows of the same app can be voting on the same note at once. */
create or replace function public.marker_comment_vote(
  p_comment_id uuid,
  p_vote smallint
)
returns table (
  like_count integer,
  dislike_count integer,
  my_vote smallint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_vote smallint := coalesce(p_vote, 0::smallint);
  v_row public.marker_comments%rowtype;
begin
  if v_uid is null then
    raise exception 'comments: sign in to vote';
  end if;
  if v_vote not in (-1, 0, 1) then
    raise exception 'comments: unknown vote';
  end if;

  select * into v_row from public.marker_comments c where c.id = p_comment_id;
  if not found then
    raise exception 'comments: that note no longer exists';
  end if;

  if v_vote = 0 then
    delete from public.marker_comment_votes v
     where v.comment_id = p_comment_id and v.user_id = v_uid;
  else
    insert into public.marker_comment_votes (comment_id, user_id, vote)
    values (p_comment_id, v_uid, v_vote)
    on conflict (comment_id, user_id) do update set vote = excluded.vote;
  end if;

  -- Re-read: the totals are the trigger's work, not this function's.
  select * into v_row from public.marker_comments c where c.id = p_comment_id;

  return query select v_row.like_count, v_row.dislike_count, v_vote;
end;
$$;

/** Flag a note. One per person; reporting twice is a no-op rather than an error,
 *  because the honest client answer to "did it work?" is yes either way. */
create or replace function public.marker_comment_report(
  p_comment_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'comments: sign in to report a note';
  end if;

  if not exists (select 1 from public.marker_comments c where c.id = p_comment_id) then
    raise exception 'comments: that note no longer exists';
  end if;

  insert into public.marker_comment_reports (comment_id, user_id, reason)
  values (p_comment_id, v_uid, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (comment_id, user_id) do nothing;

  return true;
end;
$$;

/** Staff: put an auto-hidden note back, or take a bad one down without deleting
 *  it. Un-hiding also clears the reports, so the same three flags cannot bury it
 *  again the moment it is restored. */
create or replace function public.marker_comment_set_hidden(
  p_comment_id uuid,
  p_hidden boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_updated int;
begin
  if not public.is_support_admin() then
    raise exception 'comments: only staff can moderate';
  end if;

  if not p_hidden then
    delete from public.marker_comment_reports r where r.comment_id = p_comment_id;
  end if;

  update public.marker_comments c
     set hidden = p_hidden,
         report_count = case when p_hidden then c.report_count else 0 end
   where c.id = p_comment_id;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- ── Moderation queue ─────────────────────────────────────────────────────────
-- One person reads every note that gets written, so the queue has to remember
-- what they have already looked at. It is per-admin rather than a single global
-- flag: "I have read this" is a fact about a person, and a second moderator must
-- not inherit the first one's progress.

create table if not exists public.marker_comment_reviews (
  comment_id uuid not null references public.marker_comments (id) on delete cascade,
  admin_id uuid not null references auth.users (id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  primary key (comment_id, admin_id)
);

-- The earlier reported-only queue is superseded by the feed below, which does
-- the same job as one of its filters.
drop function if exists public.marker_comments_reported();

/** Staff: every note, worst first.
 *
 *  The ordering IS the workflow — reported notes ahead of everything (someone
 *  is waiting on a decision), then whatever has not been read yet, then newest.
 *  So the top of the list is always the next thing worth looking at, and no
 *  filter has to be touched to find it.
 *
 *  `p_filter` narrows to 'reported' or 'unreviewed' when the moderator wants to
 *  work one pile at a time. */
create or replace function public.marker_comments_admin_feed(
  p_filter text default 'all',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  marker_key text,
  body text,
  is_spoiler boolean,
  like_count integer,
  dislike_count integer,
  report_count integer,
  hidden boolean,
  created_at timestamptz,
  edited_at timestamptz,
  author_name text,
  reviewed boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         c.marker_key,
         c.body,
         c.is_spoiler,
         c.like_count,
         c.dislike_count,
         c.report_count,
         c.hidden,
         c.created_at,
         c.edited_at,
         public.marker_comment_author_name(c.user_id),
         r.comment_id is not null,
         count(*) over ()
    from public.marker_comments c
    left join public.marker_comment_reviews r
      on r.comment_id = c.id and r.admin_id = auth.uid()
   where public.is_support_admin()
     and (p_filter is distinct from 'reported' or c.report_count > 0)
     and (p_filter is distinct from 'unreviewed' or r.comment_id is null)
   order by
     (c.report_count > 0) desc,
     (r.comment_id is not null),
     c.created_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

/** The two numbers behind the moderation badge. Reported and unread are counted
 *  separately on purpose: one is someone waiting on a decision, the other is
 *  just reading to catch up, and a single merged total would train the reader to
 *  ignore both. */
create or replace function public.marker_comments_admin_counts()
returns table (reported integer, unreviewed integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where c.report_count > 0)::integer,
    count(*) filter (where r.comment_id is null)::integer
    from public.marker_comments c
    left join public.marker_comment_reviews r
      on r.comment_id = c.id and r.admin_id = auth.uid()
   where public.is_support_admin();
$$;

/** Mark a note read, or put it back on the pile. */
create or replace function public.marker_comment_mark_reviewed(
  p_comment_id uuid,
  p_reviewed boolean default true
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_support_admin() then
    raise exception 'comments: only staff can review';
  end if;

  if p_reviewed then
    insert into public.marker_comment_reviews (comment_id, admin_id)
    values (p_comment_id, auth.uid())
    on conflict (comment_id, admin_id) do nothing;
  else
    delete from public.marker_comment_reviews r
     where r.comment_id = p_comment_id and r.admin_id = auth.uid();
  end if;

  return true;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────
-- The tables are unreachable: RLS is on with no policies, and no client role
-- holds a privilege on them. (Supabase grants ALL on new public tables to anon +
-- authenticated by default, so the revoke matters.) Everything goes through the
-- functions above.
--
-- `anon` gets the two read functions and nothing else — a signed-out player can
-- read every note and write none.

alter table public.marker_comments enable row level security;
alter table public.marker_comment_votes enable row level security;
alter table public.marker_comment_reports enable row level security;
alter table public.marker_comment_reviews enable row level security;

revoke all on public.marker_comments from anon, authenticated;
revoke all on public.marker_comment_votes from anon, authenticated;
revoke all on public.marker_comment_reports from anon, authenticated;
revoke all on public.marker_comment_reviews from anon, authenticated;

grant execute on function public.marker_comments_counts(text[]) to anon, authenticated;
grant execute on function public.marker_comments_list(text, text, integer, integer) to anon, authenticated;

grant execute on function public.marker_comment_post(text, text, boolean) to authenticated;
grant execute on function public.marker_comment_edit(uuid, text, boolean) to authenticated;
grant execute on function public.marker_comment_delete(uuid) to authenticated;
grant execute on function public.marker_comment_vote(uuid, smallint) to authenticated;
grant execute on function public.marker_comment_report(uuid, text) to authenticated;
grant execute on function public.marker_comment_set_hidden(uuid, boolean) to authenticated;
grant execute on function public.marker_comments_admin_feed(text, integer, integer) to authenticated;
grant execute on function public.marker_comments_admin_counts() to authenticated;
grant execute on function public.marker_comment_mark_reviewed(uuid, boolean) to authenticated;

-- The author-name helper reads auth.users; it is called by the functions above
-- (which run as owner) and must not be callable directly, or it becomes a probe
-- for "does this uuid have an account".
revoke execute on function public.marker_comment_author_name(uuid) from anon, authenticated;
