-- Only one Edge Function instance may backfill linked characters at a time.
-- The lease expires if the instance stops before releasing it.
create table public.character_leaderboard_backfill_lease (
  id boolean primary key default true check (id),
  token uuid not null,
  expires_at timestamptz not null
);

alter table public.character_leaderboard_backfill_lease enable row level security;
revoke all on public.character_leaderboard_backfill_lease from anon, authenticated;

create function public.claim_character_leaderboard_backfill()
returns uuid
language sql security definer
set search_path = ''
as $$
  insert into public.character_leaderboard_backfill_lease as lease (id, token, expires_at)
  values (true, gen_random_uuid(), now() + interval '110 seconds')
  on conflict (id) do update
    set token = excluded.token, expires_at = excluded.expires_at
    where lease.expires_at <= now()
  returning token;
$$;

revoke all on function public.claim_character_leaderboard_backfill() from public, anon, authenticated;
grant execute on function public.claim_character_leaderboard_backfill() to service_role;

create function public.release_character_leaderboard_backfill(p_token uuid)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.character_leaderboard_backfill_lease
  where token = p_token;
$$;

revoke all on function public.release_character_leaderboard_backfill(uuid) from public, anon, authenticated;
grant execute on function public.release_character_leaderboard_backfill(uuid) to service_role;

-- A recent failed verification is retried after 15 minutes, while an active
-- worker keeps the UI in the checking state until its current run finishes.
create or replace function public.character_leaderboard_seed_remaining()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_characters u
    where not exists (
      select 1 from public.character_leaderboard_entries e
      where e.region = u.region and e.server_id = u.server_id
        and e.character_id = u.character_id
    )
    and (
      not exists (
        select 1 from public.character_leaderboard_seed_claims c
        where c.region = u.region and c.server_id = u.server_id
          and c.character_id = u.character_id
          and c.claimed_at > now() - interval '15 minutes'
      )
      or exists (
        select 1 from public.character_leaderboard_backfill_lease lease
        where lease.expires_at > now()
      )
    )
  );
$$;
