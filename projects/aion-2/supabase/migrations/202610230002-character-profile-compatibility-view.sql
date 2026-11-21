-- Apply ONLY after deploying both new HTTP functions, warming initial profiles,
-- and verifying cold reads. API paths and leaderboard RPC types stay unchanged.
-- Preserve the verified records and foreign keys by renaming, not copying.
alter table public.character_leaderboard_entries rename to character_profiles;
create view public.character_leaderboard_entries with (security_invoker = true) as
  select * from public.character_profiles;
revoke all on public.character_leaderboard_entries from public, anon, authenticated;
grant all on public.character_leaderboard_entries to service_role;

-- A retained old edge instance must not start a parallel legacy refresh loop.
create or replace function public.claim_character_leaderboard_refresh()
returns table (region text, server_id integer, character_id text)
language sql security definer set search_path = '' as $$
  select null::text, null::integer, null::text where false;
$$;
create or replace function public.claim_character_leaderboard_seed(p_limit integer default 5)
returns table (region text, server_id integer, character_id text)
language sql security definer set search_path = '' as $$
  select null::text, null::integer, null::text where false;
$$;
create or replace function public.character_leaderboard_seed_remaining()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_characters u
    where not exists (
      select 1 from public.character_profiles p
      where p.region = u.region and p.server_id = u.server_id and p.character_id = u.character_id
    ) and exists (
      select 1 from public.character_profile_jobs j
      where j.region = u.region and j.server_id = u.server_id and j.character_id = u.character_id
        and (j.next_refresh_at <= now() or j.lease_until > now())
    )
  );
$$;
