-- Elden Ring Atlas — the "user" table: what a signed-in player's account holds
-- for them. Found/cleared markers, bookmarks, favourited Nightreign patterns,
-- custom pins and the character build — so a reinstall or a second PC picks up
-- where they left off. ("user" is reserved in SQL, hence the quotes below; the
-- client is unaffected and reads it as plain `from("user")`.)
--
-- Device PREFERENCES are deliberately not here (zoom, map centre, category
-- filters, clustering, the "you are here" pin). Those describe the screen, not
-- the progress, and the desktop window and in-game overlay keep separate
-- cameras. They stay in localStorage exactly as before.
--
-- Shape: ONE row per account holding one jsonb blob. Nothing ever queries an
-- individual marker server-side — the client always wants the whole set at
-- once, so a blob is one request instead of thousands of rows.
--
-- Concurrency is the only hard part, and `rev` is the whole answer. Every write
-- states which revision it is replacing:
--
--   • rev matches   → the writer had the newest copy: a normal save. DELETES
--                     SURVIVE — un-finding a marker on your only PC is a real
--                     edit, not a gap to be back-filled.
--   • rev is stale  → another device saved in between. The push is REFUSED and
--                     the current row comes back instead, so the client unions
--                     the two copies and tries again. Nothing is clobbered.
--
-- The check-and-bump has to be atomic or two devices could both read rev 7 and
-- both write rev 8 — hence a function, and no client INSERT/UPDATE privilege at
-- all. Reads are a plain RLS-guarded select (`auth.uid() = user_id`).
--
-- Run this ONCE in the Supabase SQL editor. Re-running is safe (idempotent),
-- and it also migrates the short-lived `user_map_state` shape of this file.

-- The earlier cut of this feature named everything user_map_state. Nothing ever
-- reached that table (the client had a sync bug), so it is dropped, not copied.
drop function if exists public.user_map_state_push(bigint, jsonb);
drop function if exists public.user_map_state_forget();
drop function if exists public.user_map_state_max_bytes();
drop table if exists public.user_map_state;

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public."user" (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Bumped on every accepted write. The client sends the rev it is replacing.
  rev bigint not null default 1,
  -- { v, found[], bookmarks[], favoritePatterns[], customMarkers[], playerStats{} }
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Reads ────────────────────────────────────────────────────────────────────
-- A select, not a function: unlike support (where ownership is a device token
-- the database cannot see), the owner here IS the session, so RLS says it in
-- one line.

alter table public."user" enable row level security;

drop policy if exists "read own row" on public."user";
create policy "read own row" on public."user"
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Writing is the function's job — it is the only thing that can bump `rev`
-- atomically, and a client that could UPDATE directly could skip that check and
-- overwrite another device's save.
revoke all on public."user" from anon, authenticated;
grant select on public."user" to authenticated;

-- ── Writes ───────────────────────────────────────────────────────────────────

-- Save, if the caller still holds the newest revision.
--
-- ALWAYS returns the row that is now authoritative — whether that is the one
-- just written or the one that was already there. A refused push is therefore
-- not an error to handle but the newer copy to merge with, in the same round
-- trip that discovered the conflict.
--
-- p_expected_rev: the rev this write replaces. Null means "I have never synced"
-- and only creates a first revision — it never overwrites an existing row.
create or replace function public.user_save(
  p_expected_rev bigint,
  p_state jsonb
)
returns table (rev bigint, state jsonb, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public."user"%rowtype;
begin
  if v_uid is null then
    raise exception 'sync: sign in to save progress to your account';
  end if;
  if p_state is null or pg_catalog.jsonb_typeof(p_state) <> 'object' then
    raise exception 'sync: malformed payload';
  end if;
  -- 1 MiB ceiling. Custom markers may carry an uploaded image as a data URL — a
  -- handful of those must not turn every debounced save into megabytes. Far more
  -- than the id lists and short strings a real save contains.
  if pg_catalog.pg_column_size(p_state) > 1048576 then
    raise exception 'sync: this save is too large to store';
  end if;

  -- FOR UPDATE so a second device's push queues behind this one instead of
  -- reading the same rev and racing it.
  select * into v_row
    from public."user" u
   where u.user_id = v_uid
     for update;

  if not found then
    begin
      insert into public."user" (user_id, rev, state)
      values (v_uid, 1, p_state)
      returning * into v_row;
    exception when unique_violation then
      -- Another device created the first revision between our read and our
      -- write. Theirs stands; the caller merges against what comes back.
      select * into v_row
        from public."user" u where u.user_id = v_uid;
    end;
  elsif p_expected_rev is not null and v_row.rev = p_expected_rev then
    update public."user" u
       set state = p_state,
           rev = u.rev + 1,
           updated_at = now()
     where u.user_id = v_uid
     returning * into v_row;
  end if;
  -- Neither branch: the caller is writing against a revision that has already
  -- been replaced. Leave the row alone and hand it back — refusing is the point.

  return query select v_row.rev, v_row.state, v_row.updated_at;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────
-- Syncing needs an account, so `anon` gets nothing here (unlike support, which
-- has to work without one).

grant execute on function public.user_save(bigint, jsonb) to authenticated;
