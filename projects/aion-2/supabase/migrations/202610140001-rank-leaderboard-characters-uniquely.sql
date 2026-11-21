-- Give every eligible character a stable position. Name resolves equal Gear
-- Scores, and identity resolves characters with the same name.
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
    select row_number() over (
      order by e.gear_score desc, lower(e.name) collate "C", e.name collate "C",
        e.region, e.server_id, e.character_id
    ) as rank,
      e.region, e.server_id, e.character_id, e.name, e.server_name,
      e.class_name, e.level, e.gear_score, e.combat_power,
      e.profile_image_url, e.checked_at
    from public.character_leaderboard_entries e
    where (p_region is null or e.region = p_region)
      and (p_server_id is null or e.server_id = p_server_id)
      and exists (
        select 1 from public.user_characters linked
        where linked.region = e.region and linked.server_id = e.server_id
          and linked.character_id = e.character_id
      )
  ), matched as (
    select r.*, count(*) over () as total
    from ranked r
    where p_query is null or strpos(lower(r.name), lower(left(trim(p_query), 80))) > 0
  )
  select m.* from matched m
  order by m.rank
  offset least(greatest(coalesce(p_offset, 0), 0), 10000)
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

-- Rank in the full filtered board before selecting the account's characters.
create or replace function public.character_leaderboard_my_entry(
  p_user_id uuid,
  p_region text default null,
  p_server_id integer default null,
  p_query text default null
)
returns table (
  rank bigint, region text, server_id integer, character_id text,
  name text, server_name text, class_name text, level integer,
  gear_score integer, combat_power integer, profile_image_url text,
  checked_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  with ranked as (
    select row_number() over (
      order by e.gear_score desc, lower(e.name) collate "C", e.name collate "C",
        e.region, e.server_id, e.character_id
    ) as rank,
      e.region, e.server_id, e.character_id, e.name, e.server_name,
      e.class_name, e.level, e.gear_score, e.combat_power,
      e.profile_image_url, e.checked_at
    from public.character_leaderboard_entries e
    where (p_region is null or e.region = p_region)
      and (p_server_id is null or e.server_id = p_server_id)
      and exists (
        select 1 from public.user_characters linked
        where linked.region = e.region and linked.server_id = e.server_id
          and linked.character_id = e.character_id
      )
  )
  select r.rank, r.region, r.server_id, r.character_id, r.name, r.server_name,
    r.class_name, r.level, r.gear_score, r.combat_power,
    r.profile_image_url, r.checked_at
  from ranked r
  where (p_query is null or strpos(lower(r.name), lower(left(trim(p_query), 80))) > 0)
    and exists (
      select 1 from public.user_characters mine
      where mine.user_id = p_user_id and mine.region = r.region
        and mine.server_id = r.server_id and mine.character_id = r.character_id
    )
  order by r.rank;
$$;
