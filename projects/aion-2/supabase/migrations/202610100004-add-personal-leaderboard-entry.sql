-- Return only the signed-in account's best linked character in the current
-- leaderboard scope. The Edge Function validates the access token first.
create function public.character_leaderboard_my_entry(
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
  with mine as (
    select e.region, e.server_id, e.character_id, e.name, e.server_name,
      e.class_name, e.level, e.gear_score, e.combat_power,
      e.profile_image_url, e.checked_at
    from public.character_leaderboard_entries e
    where (p_region is null or e.region = p_region)
      and (p_server_id is null or e.server_id = p_server_id)
      and (p_query is null or strpos(lower(e.name), lower(left(trim(p_query), 80))) > 0)
      and exists (
        select 1 from public.user_characters linked
        where linked.user_id = p_user_id and linked.region = e.region
          and linked.server_id = e.server_id and linked.character_id = e.character_id
      )
    order by e.gear_score desc, e.region, e.server_id, e.character_id
    limit 1
  )
  select (
      select count(*) + 1 from public.character_leaderboard_entries other
      where other.gear_score > mine.gear_score
        and (p_region is null or other.region = p_region)
        and (p_server_id is null or other.server_id = p_server_id)
        and exists (
          select 1 from public.user_characters linked
          where linked.region = other.region and linked.server_id = other.server_id
            and linked.character_id = other.character_id
        )
    ), mine.region, mine.server_id, mine.character_id, mine.name, mine.server_name,
    mine.class_name, mine.level, mine.gear_score, mine.combat_power,
    mine.profile_image_url, mine.checked_at
  from mine;
$$;

revoke all on function public.character_leaderboard_my_entry(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.character_leaderboard_my_entry(uuid, text, integer, text) to service_role;
