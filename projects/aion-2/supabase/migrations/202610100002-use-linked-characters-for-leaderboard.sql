-- A linked character is eligible automatically. Scores are populated only
-- after the Edge Function checks the official public profile.
create index user_characters_leaderboard_identity_idx
  on public.user_characters (region, server_id, character_id);

create table public.character_leaderboard_seed_claims (
  region text not null,
  server_id integer not null,
  character_id text not null,
  claimed_at timestamptz not null,
  primary key (region, server_id, character_id)
);

alter table public.character_leaderboard_seed_claims enable row level security;
revoke all on public.character_leaderboard_seed_claims from anon, authenticated;

create or replace function public.claim_character_leaderboard_seed(p_limit integer default 5)
returns table (region text, server_id integer, character_id text)
language sql security definer
set search_path = ''
as $$
  with candidates as (
    select distinct u.region, u.server_id, u.character_id
    from public.user_characters u
    where not exists (
      select 1 from public.character_leaderboard_entries e
      where e.region = u.region and e.server_id = u.server_id
        and e.character_id = u.character_id
    )
    and not exists (
      select 1 from public.character_leaderboard_seed_claims c
      where c.region = u.region and c.server_id = u.server_id
        and c.character_id = u.character_id
        and c.claimed_at > now() - interval '15 minutes'
    )
    order by u.region, u.server_id, u.character_id
    limit least(greatest(coalesce(p_limit, 5), 1), 10)
  )
  insert into public.character_leaderboard_seed_claims as c
    (region, server_id, character_id, claimed_at)
  select candidates.region, candidates.server_id, candidates.character_id, now()
  from candidates
  on conflict (region, server_id, character_id) do update
    set claimed_at = excluded.claimed_at
    where c.claimed_at <= now() - interval '15 minutes'
  returning c.region, c.server_id, c.character_id;
$$;

revoke all on function public.claim_character_leaderboard_seed(integer) from public, anon, authenticated;
grant execute on function public.claim_character_leaderboard_seed(integer) to service_role;

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
    and not exists (
      select 1 from public.character_leaderboard_seed_claims c
      where c.region = u.region and c.server_id = u.server_id
        and c.character_id = u.character_id
        and c.claimed_at > now() - interval '15 minutes'
    )
  );
$$;

revoke all on function public.character_leaderboard_seed_remaining() from public, anon, authenticated;
grant execute on function public.character_leaderboard_seed_remaining() to service_role;

create or replace function public.character_leaderboard_page(
  p_region text default null,
  p_server_id integer default null,
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  rank bigint, region text, server_id integer, character_id text,
  name text, server_name text, class_name text, level integer,
  gear_score integer, combat_power integer, profile_image_url text,
  checked_at timestamptz, total bigint
)
language sql stable security definer
set search_path = ''
as $$
  with ranked as (
    select rank() over (order by e.gear_score desc) as rank,
      e.region, e.server_id, e.character_id, e.name, e.server_name,
      e.class_name, e.level, e.gear_score, e.combat_power,
      e.profile_image_url, e.checked_at
    from public.character_leaderboard_entries e
    where (p_region is null or e.region = p_region)
      and (p_server_id is null or e.server_id = p_server_id)
      and exists (
        select 1 from public.user_characters u
        where u.region = e.region and u.server_id = e.server_id
          and u.character_id = e.character_id
      )
  ), matched as (
    select r.*, count(*) over () as total
    from ranked r
    where p_query is null or strpos(lower(r.name), lower(left(trim(p_query), 80))) > 0
  )
  select m.* from matched m
  order by m.gear_score desc, m.region, m.server_id, m.character_id
  offset least(greatest(coalesce(p_offset, 0), 0), 10000)
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

create or replace function public.claim_character_leaderboard_refresh()
returns table (region text, server_id integer, character_id text)
language sql security definer
set search_path = ''
as $$
  update public.character_leaderboard_entries e
  set refresh_requested_at = now()
  where (e.region, e.server_id, e.character_id) in (
    select candidate.region, candidate.server_id, candidate.character_id
    from public.character_leaderboard_entries candidate
    where candidate.checked_at < now() - interval '24 hours'
      and (candidate.refresh_requested_at is null
        or candidate.refresh_requested_at < now() - interval '15 minutes')
      and exists (
        select 1 from public.user_characters u
        where u.region = candidate.region and u.server_id = candidate.server_id
          and u.character_id = candidate.character_id
      )
    order by candidate.checked_at
    for update of candidate skip locked
    limit 1
  )
  returning e.region, e.server_id, e.character_id;
$$;
