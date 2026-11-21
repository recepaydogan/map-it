-- Game Maps — in-app support (user reports + private admin replies).
--
-- A user opens ONE report thread from the app (how they want to be addressed +
-- what they want to tell us) and keeps talking in it. Nobody but the author and
-- the support admin can ever read a thread.
--
-- SIGNING IN IS NOT REQUIRED, AND NO SESSION IS CREATED EITHER. Support has to
-- reach the whole user base, so ownership is proven by a DEVICE TOKEN: a random
-- uuid the client keeps in its own storage and presents on every call. Supabase
-- anonymous sign-ins are deliberately NOT used — they would mint a permanent
-- auth user per device, count toward MAU, and make every `authenticated` policy
-- in this project reachable by anyone who asks for a session.
--
-- Consequences of that choice, and how they are handled:
--
--   • The token is a bearer secret, so the server stores only its SHA-256 —
--     support_token_hash(). A database dump therefore contains no usable key to
--     anyone's conversation, and the token itself only ever exists on the device
--     that generated it.
--
--   • RLS here is deny-everything: the tables carry NO policies and NO client
--     privileges. Reads and writes are only possible through the SECURITY
--     DEFINER functions below, each of which authorises the caller first
--     (matching token, owning account, or support staff) and returns nothing at
--     all otherwise — never "exists but forbidden", which would leak.
--
--   • With no auth in front of it, "file a report" is an open write endpoint.
--     Per-token ceilings are the polite limit; because a flood could just rotate
--     tokens, account-less thread creation also sits behind an hourly global
--     circuit breaker (SUPPORT_ANON_THREADS_PER_HOUR below). It can inconvenience
--     real users during an attack — that is the trade for keeping the inbox
--     alive, and it is the one number to raise if it ever misfires.
--
--   • A signed-in caller gets both: the thread is bound to their account too, so
--     it follows them to another device, and support_claim_threads() adopts the
--     reports they filed before signing in.
--
-- Run this ONCE in the Supabase SQL editor. Re-running is safe (idempotent), and
-- it also migrates an earlier install of this file. No edge function is needed.

-- ── Who counts as support staff ──────────────────────────────────────────────
-- The admin inbox is gated on membership in this table — the client's "am I an
-- admin?" check is cosmetic (it only decides whether a button renders), while
-- every function below calls is_support_admin() for the real answer.
--
-- Membership is seeded from a fixed e-mail list so there is one place to edit.
-- The list is a function (not a literal repeated three times) and the signup
-- trigger re-applies it, so an admin who registers later is still picked up.

create or replace function public.support_admin_emails()
returns text[]
language sql
immutable
as $$
  select array['recepaydogan209@gmail.com']::text[];
$$;

create table if not exists public.support_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- RLS on with NO policies at all: not even the admin can read this table from
-- the client. The only readers are the SECURITY DEFINER functions below.
alter table public.support_admins enable row level security;
revoke all on public.support_admins from anon, authenticated;

/** True when the caller is support staff. SECURITY DEFINER so it can read
 *  support_admins, which is unreadable to every client role. */
create or replace function public.is_support_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.support_admins a where a.user_id = auth.uid()
  );
$$;

grant execute on function public.is_support_admin() to anon, authenticated;

-- Promote any matching account that already exists…
insert into public.support_admins (user_id, email)
select u.id, u.email
from auth.users u
where lower(u.email) = any (select lower(e) from unnest(public.support_admin_emails()) e)
on conflict (user_id) do nothing;

-- …and any that registers from here on.
create or replace function public.handle_new_support_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = any (
    select lower(e) from unnest(public.support_admin_emails()) e
  ) then
    insert into public.support_admins (user_id, email)
    values (new.id, new.email)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_support_admin on auth.users;
create trigger on_auth_user_created_support_admin
  after insert on auth.users
  for each row execute function public.handle_new_support_admin();

-- ── Tables ───────────────────────────────────────────────────────────────────
-- `display_name` is what the user asked to be called in the reply — it is NOT an
-- account name and is theirs to change. `user_email` is filled from auth.users
-- when the author is signed in (the admin needs to know who wrote); it is null
-- for a report filed without an account, which is exactly why display_name
-- matters.
--
-- status: open      — waiting on us (the default, and what a user message sets)
--         answered  — the last word is ours
--         closed    — done; either side can reopen by writing again
-- The read stamps drive the unread dots on both sides.

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  /** SHA-256 of the device token that owns this thread. */
  client_token_hash bytea,
  /** Set when the author was signed in, or once they claim the thread later. */
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 40),
  user_email text,
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_sender text not null default 'user' check (last_sender in ('user', 'admin')),
  user_last_read_at timestamptz not null default now(),
  admin_last_read_at timestamptz
);

-- Migration from the earlier (anonymous-session) shape of this file: the token
-- column is new, ownership by account is now optional, and losing an account no
-- longer takes the conversation with it (the device token still owns it).
alter table public.support_threads
  add column if not exists client_token_hash bytea;
alter table public.support_threads
  alter column user_id drop not null;
alter table public.support_threads
  drop constraint if exists support_threads_user_id_fkey;
alter table public.support_threads
  add constraint support_threads_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

create index if not exists support_threads_token_idx
  on public.support_threads (client_token_hash, last_message_at desc);
create index if not exists support_threads_user_idx
  on public.support_threads (user_id, last_message_at desc);
create index if not exists support_threads_status_idx
  on public.support_threads (status, last_message_at desc);

-- Deleting a thread cascades its messages, so "delete this chat" is one DELETE.
-- `author_is_user` records which side wrote it without an identity to point at.
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  /** Staff author, when the message is ours. Null for the user's side — an
   *  account-less author has no id to record. */
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

-- Migration from the earlier shape: author_id was mandatory back when every
-- writer held a session, and deleting a staff account must not delete the
-- replies that account wrote.
alter table public.support_messages
  alter column author_id drop not null;
alter table public.support_messages
  drop constraint if exists support_messages_author_id_fkey;
alter table public.support_messages
  add constraint support_messages_author_id_fkey
  foreign key (author_id) references auth.users (id) on delete set null;

create index if not exists support_messages_thread_idx
  on public.support_messages (thread_id, created_at);

-- ── Ceilings ─────────────────────────────────────────────────────────────────
-- One place to tune. The per-token numbers are generous enough that a real
-- person filing real reports never meets them; the global one is the circuit
-- breaker described at the top of this file.

create or replace function public.support_limits()
returns table (
  threads_per_token int,
  threads_per_token_hour int,
  messages_per_token_hour int,
  messages_per_thread int,
  anon_threads_per_hour int
)
language sql
immutable
as $$
  select 20, 3, 40, 500, 120;
$$;

-- ── Internals ────────────────────────────────────────────────────────────────

/** The stored form of a device token. Only the digest ever reaches the table,
 *  so the database never holds a usable key to a conversation. */
create or replace function public.support_token_hash(p_token uuid)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.sha256(pg_catalog.convert_to(p_token::text, 'UTF8'));
$$;

/** Bookkeeping after every message: sort key, who spoke last, the status the
 *  inbox filters on, and the sender's own read stamp (your own message must
 *  never come back to you as unread). */
create or replace function public.support_thread_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_threads t
     set last_message_at = new.created_at,
         updated_at = now(),
         last_sender = new.sender,
         -- An admin reply answers the thread; a user message (re)opens it, even
         -- if it had been closed — replying is how you reopen a closed report.
         status = case when new.sender = 'admin' then 'answered' else 'open' end,
         user_last_read_at =
           case when new.sender = 'user' then new.created_at else t.user_last_read_at end,
         admin_last_read_at =
           case when new.sender = 'admin' then new.created_at else t.admin_last_read_at end
   where t.id = new.thread_id;
  return null;
end;
$$;

drop trigger if exists support_message_touch_thread on public.support_messages;
create trigger support_message_touch_thread
  after insert on public.support_messages
  for each row execute function public.support_thread_touch();

-- Triggers from the earlier (session-based) shape of this file: identity is now
-- stamped by the functions below, which know about tokens.
drop trigger if exists support_thread_insert on public.support_threads;
drop trigger if exists support_thread_update on public.support_threads;
drop trigger if exists support_thread_limits on public.support_threads;
drop trigger if exists support_message_insert on public.support_messages;
drop trigger if exists support_message_update on public.support_messages;
drop trigger if exists support_message_limits on public.support_messages;
drop function if exists public.support_thread_before_insert();
drop function if exists public.support_thread_before_update();
drop function if exists public.support_message_before_insert();
drop function if exists public.support_message_before_update();
drop function if exists public.support_thread_limits();
drop function if exists public.support_message_limits();
-- Same name and return type as before, but its parameter was renamed
-- (p_previous_uid -> p_token), and CREATE OR REPLACE cannot rename a parameter.
drop function if exists public.support_claim_threads(uuid);
-- These three changed shape after the first cut: posting now states which side
-- it speaks for, and the message rows dropped the `mine` column (the surface the
-- reader is on decides that, not the server). A changed signature or return type
-- cannot be replaced in place.
drop function if exists public.support_post_message(uuid, uuid, text);
drop function if exists public.support_thread_messages(uuid, uuid);
drop function if exists public.support_edit_message(uuid, uuid, text);

-- ── Reads ────────────────────────────────────────────────────────────────────
-- Every read takes the caller's device token and returns only what that token
-- (or the caller's account, or staff membership) is entitled to. A wrong or
-- missing token is not an error — it simply matches nothing.

/** The caller's own reports: filed from this device, or bound to their account. */
create or replace function public.support_list_threads(p_token uuid)
returns table (
  id uuid,
  display_name text,
  user_email text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_sender text,
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  has_account boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.display_name, t.user_email, t.status, t.created_at,
         t.last_message_at, t.last_sender, t.user_last_read_at,
         t.admin_last_read_at, t.user_id is not null
    from public.support_threads t
   where (p_token is not null
          and t.client_token_hash = public.support_token_hash(p_token))
      or (auth.uid() is not null and t.user_id = auth.uid())
   order by t.last_message_at desc;
$$;

/** Every report, for the inbox. Returns nothing to anyone but staff. */
create or replace function public.support_inbox_threads()
returns table (
  id uuid,
  display_name text,
  user_email text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_sender text,
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  has_account boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.display_name, t.user_email, t.status, t.created_at,
         t.last_message_at, t.last_sender, t.user_last_read_at,
         t.admin_last_read_at, t.user_id is not null
    from public.support_threads t
   where public.is_support_admin()
   order by t.last_message_at desc
   limit 500;
$$;

/** One conversation. Each message says which SIDE wrote it; whether that is
 *  "you" depends on the surface the reader is on (the support page or the
 *  inbox), which is the client's business, not the server's. */
create or replace function public.support_thread_messages(
  p_token uuid,
  p_thread_id uuid
)
returns table (
  id uuid,
  thread_id uuid,
  sender text,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_support_admin();
  v_owner boolean;
begin
  -- Every clause is coalesced to false ON ITS OWN. Without that, an ANONYMOUS
  -- thread (user_id null) read by a signed-in caller whose token does not match
  -- gives `false or (true and null)` = NULL, not false — and the old
  -- `v_owner is null` branch then read that as "no such thread" and returned
  -- empty BEFORE v_admin was ever consulted. That is exactly the admin inbox
  -- opening an account-less report and seeing a conversation with no messages
  -- in it. Row existence is `found`, which is what actually answers that
  -- question; ownership is a plain boolean.
  select
    coalesce(p_token is not null
             and t.client_token_hash = public.support_token_hash(p_token), false)
    or coalesce(auth.uid() is not null and t.user_id = auth.uid(), false)
    into v_owner
    from public.support_threads t
   where t.id = p_thread_id;

  if not found or not (v_owner or v_admin) then
    return; -- unknown thread, or not the caller's: same empty answer either way
  end if;

  return query
    select m.id, m.thread_id, m.sender, m.body, m.created_at, m.edited_at
      from public.support_messages m
     where m.thread_id = p_thread_id
     order by m.created_at;
end;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

/** File a report: the thread plus its first message. The token is the identity;
 *  a signed-in caller additionally gets the thread bound to their account. */
create or replace function public.support_start_thread(
  p_token uuid,
  p_display_name text,
  p_body text
)
returns table (
  id uuid,
  display_name text,
  user_email text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_sender text,
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  has_account boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash bytea;
  v_email text;
  v_limits record;
  v_count int;
  v_thread public.support_threads%rowtype;
begin
  if p_token is null then
    raise exception 'support: missing device token';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) = 0
     or char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'support: a name and a report are both required';
  end if;

  v_hash := public.support_token_hash(p_token);
  select * into v_limits from public.support_limits();

  if not public.is_support_admin() then
    select count(*) into v_count
      from public.support_threads t
     where t.client_token_hash = v_hash;
    if v_count >= v_limits.threads_per_token then
      raise exception 'support: too many reports open — delete an old one first';
    end if;

    select count(*) into v_count
      from public.support_threads t
     where t.client_token_hash = v_hash
       and t.created_at > now() - interval '1 hour';
    if v_count >= v_limits.threads_per_token_hour then
      raise exception 'support: too many new reports in a short time — try again later';
    end if;

    -- Circuit breaker: rotating tokens defeats the per-token count, so the
    -- account-less path is also capped as a whole.
    if v_uid is null then
      select count(*) into v_count
        from public.support_threads t
       where t.user_id is null
         and t.created_at > now() - interval '1 hour';
      if v_count >= v_limits.anon_threads_per_hour then
        raise exception 'support: too many reports are coming in right now — try again shortly';
      end if;
    end if;
  end if;

  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
  end if;

  insert into public.support_threads (client_token_hash, user_id, display_name, user_email)
  values (v_hash, v_uid, btrim(p_display_name), v_email)
  returning * into v_thread;

  insert into public.support_messages (thread_id, sender, body)
  values (v_thread.id, 'user', btrim(p_body));

  return query
    select t.id, t.display_name, t.user_email, t.status, t.created_at,
           t.last_message_at, t.last_sender, t.user_last_read_at,
           t.admin_last_read_at, t.user_id is not null
      from public.support_threads t
     where t.id = v_thread.id;
end;
$$;

/** Add to a conversation.
 *
 *  Which side the message speaks for is the CALLER'S declaration — the inbox
 *  replies as support, the support page writes as the user — and the server's
 *  job is to verify it, not to guess. Guessing was the first cut of this
 *  function and it was wrong: the one person who is both staff and a reporter
 *  (whoever tests the feature, filing from the same device they answer on) owns
 *  the thread, so "owner writes as user" made their replies come back labelled
 *  as the user's, leaving the report forever unanswered. */
create or replace function public.support_post_message(
  p_token uuid,
  p_thread_id uuid,
  p_body text,
  p_as_admin boolean default false
)
returns table (
  id uuid,
  thread_id uuid,
  sender text,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_support_admin();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
  v_thread public.support_threads%rowtype;
  v_owner boolean;
  v_sender text;
  v_limits record;
  v_count int;
  v_message public.support_messages%rowtype;
begin
  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'support: the message is empty';
  end if;

  select * into v_thread from public.support_threads t where t.id = p_thread_id;
  if not found then
    raise exception 'support: that conversation no longer exists';
  end if;

  -- Coalesced per clause: on an anonymous thread `v_thread.user_id = v_uid` is
  -- NULL, so an uncoalesced expression yields NULL — and `if not null` does not
  -- raise, which let any signed-in stranger write into any account-less report.
  v_owner := coalesce(v_hash is not null and v_thread.client_token_hash = v_hash, false)
             or coalesce(v_uid is not null and v_thread.user_id = v_uid, false);

  if p_as_admin then
    -- Replying as support: staff membership is the whole permission, and it is
    -- checked here rather than taken on trust.
    if not v_admin then
      raise exception 'support: only support staff can reply as support';
    end if;
    v_sender := 'admin';
  else
    if not v_owner then
      raise exception 'support: that conversation no longer exists';
    end if;
    v_sender := 'user';
  end if;

  select * into v_limits from public.support_limits();
  if not v_admin then
    select count(*) into v_count
      from public.support_messages m
      join public.support_threads t on t.id = m.thread_id
     where t.client_token_hash = v_hash
       and m.created_at > now() - interval '1 hour';
    if v_count >= v_limits.messages_per_token_hour then
      raise exception 'support: too many messages in a short time — try again later';
    end if;
  end if;

  select count(*) into v_count
    from public.support_messages m where m.thread_id = p_thread_id;
  if v_count >= v_limits.messages_per_thread then
    raise exception 'support: this conversation is full — start a new report';
  end if;

  insert into public.support_messages (thread_id, sender, author_id, body)
  values (
    p_thread_id,
    v_sender,
    case when v_sender = 'admin' then v_uid else null end,
    btrim(p_body)
  )
  returning * into v_message;

  return query
    select v_message.id, v_message.thread_id, v_message.sender, v_message.body,
           v_message.created_at, v_message.edited_at;
end;
$$;

/** Rewrite your own words. You may only edit the side you speak for: the owner
 *  edits user messages, staff edit support messages. */
create or replace function public.support_edit_message(
  p_token uuid,
  p_message_id uuid,
  p_body text
)
returns table (
  id uuid,
  thread_id uuid,
  sender text,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_support_admin();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
  v_message public.support_messages%rowtype;
  v_thread public.support_threads%rowtype;
  v_owner boolean;
begin
  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'support: the message is empty';
  end if;

  select * into v_message from public.support_messages m where m.id = p_message_id;
  if not found then
    raise exception 'support: that message no longer exists';
  end if;
  select * into v_thread
    from public.support_threads t where t.id = v_message.thread_id;

  -- Same NULL trap as support_post_message: coalesce each clause so a
  -- non-owner is `false`, never NULL, and the check below fails closed.
  v_owner := coalesce(v_hash is not null and v_thread.client_token_hash = v_hash, false)
             or coalesce(v_uid is not null and v_thread.user_id = v_uid, false);

  if not ((v_owner and v_message.sender = 'user')
          or (v_admin and v_message.sender = 'admin')) then
    raise exception 'support: that message is not yours to edit';
  end if;

  update public.support_messages m
     set body = btrim(p_body),
         edited_at = case when m.body is distinct from btrim(p_body)
                          then now() else m.edited_at end
   where m.id = p_message_id
   returning * into v_message;

  return query
    select v_message.id, v_message.thread_id, v_message.sender, v_message.body,
           v_message.created_at, v_message.edited_at;
end;
$$;

/** Delete the whole conversation — messages cascade with it. */
create or replace function public.support_delete_thread(
  p_token uuid,
  p_thread_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
  v_deleted int;
begin
  delete from public.support_threads t
   where t.id = p_thread_id
     and (
       (v_hash is not null and t.client_token_hash = v_hash)
       or (v_uid is not null and t.user_id = v_uid)
       or public.is_support_admin()
     );
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

/** Close or reopen. "answered" is staff vocabulary — a user closing their own
 *  report may not mark it answered and drop out of the needs-reply queue. */
create or replace function public.support_set_status(
  p_token uuid,
  p_thread_id uuid,
  p_status text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_support_admin();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
  v_updated int;
begin
  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'support: unknown status';
  end if;
  if p_status = 'answered' and not v_admin then
    raise exception 'support: only support staff can mark a thread answered';
  end if;

  update public.support_threads t
     set status = p_status,
         updated_at = now()
   where t.id = p_thread_id
     and (
       (v_hash is not null and t.client_token_hash = v_hash)
       or (v_uid is not null and t.user_id = v_uid)
       or v_admin
     );
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

/** Stamp this side's "seen it" marker. Which stamp moves depends on who is
 *  calling, and neither side can write the other's. */
create or replace function public.support_mark_read(
  p_token uuid,
  p_thread_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_support_admin();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
begin
  update public.support_threads t
     set user_last_read_at =
           case
             when (v_hash is not null and t.client_token_hash = v_hash)
               or (v_uid is not null and t.user_id = v_uid)
             then now()
             else t.user_last_read_at
           end,
         admin_last_read_at =
           case when v_admin then now() else t.admin_last_read_at end
   where t.id = p_thread_id
     and (
       (v_hash is not null and t.client_token_hash = v_hash)
       or (v_uid is not null and t.user_id = v_uid)
       or v_admin
     );
end;
$$;

-- The old signature took only a thread id; drop it so the new one is the only
-- support_mark_read in the schema.
drop function if exists public.support_mark_read(uuid);

/** Bind the reports filed from this device to the account that just signed in,
 *  so the conversation follows the account to other devices. Possession of the
 *  token is the proof of ownership; a thread that already belongs to an account
 *  is never taken over. Returns how many moved. */
create or replace function public.support_claim_threads(p_token uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_moved integer := 0;
begin
  if v_uid is null or p_token is null then
    return 0;
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid;

  update public.support_threads t
     set user_id = v_uid,
         user_email = v_email
   where t.client_token_hash = public.support_token_hash(p_token)
     and t.user_id is null;
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────
-- The tables themselves are unreachable: RLS is on with no policies, and no
-- client role holds a privilege on them. (Supabase grants ALL on new public
-- tables to anon + authenticated by default, so the revoke matters.) Everything
-- goes through the functions above, which are the only authorised path in.
--
-- `anon` — the role a client without a session uses — is granted the same
-- functions as `authenticated`, except the inbox: that one is staff-only, and
-- staff always sign in.

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "read own threads" on public.support_threads;
drop policy if exists "open own thread" on public.support_threads;
drop policy if exists "update own thread" on public.support_threads;
drop policy if exists "delete own thread" on public.support_threads;
drop policy if exists "read own messages" on public.support_messages;
drop policy if exists "user writes in own thread" on public.support_messages;
drop policy if exists "staff replies" on public.support_messages;
drop policy if exists "edit own message" on public.support_messages;

revoke all on public.support_threads from anon, authenticated;
revoke all on public.support_messages from anon, authenticated;

grant execute on function public.support_list_threads(uuid) to anon, authenticated;
grant execute on function public.support_thread_messages(uuid, uuid) to anon, authenticated;
grant execute on function public.support_start_thread(uuid, text, text) to anon, authenticated;
grant execute on function public.support_post_message(uuid, uuid, text, boolean) to anon, authenticated;
grant execute on function public.support_edit_message(uuid, uuid, text) to anon, authenticated;
grant execute on function public.support_delete_thread(uuid, uuid) to anon, authenticated;
grant execute on function public.support_set_status(uuid, uuid, text) to anon, authenticated;
grant execute on function public.support_mark_read(uuid, uuid) to anon, authenticated;
grant execute on function public.support_claim_threads(uuid) to authenticated;
grant execute on function public.support_inbox_threads() to authenticated;

