-- Only server-verified public character fields are exposed by the leaderboard.
-- A submission records interest in a character, not proof of ownership.
create table public.character_leaderboard_entries (
  region text not null,
  server_id integer not null,
  character_id text not null,
  name text not null,
  server_name text not null,
  class_name text not null,
  level integer not null,
  gear_score integer not null check (gear_score > 0),
  combat_power integer not null check (combat_power >= 0),
  profile_image_url text,
  checked_at timestamptz not null,
  refresh_requested_at timestamptz,
  primary key (region, server_id, character_id)
);

create index character_leaderboard_score_idx
  on public.character_leaderboard_entries (gear_score desc, region, server_id, character_id);
create index character_leaderboard_checked_idx
  on public.character_leaderboard_entries (checked_at);

create table public.character_leaderboard_submissions (
  user_id uuid not null,
  region text not null,
  server_id integer not null,
  character_id text not null,
  submitted_at timestamptz not null default now(),
  primary key (user_id, region, server_id, character_id),
  foreign key (user_id, region, server_id, character_id)
    references public.user_characters (user_id, region, server_id, character_id) on delete cascade,
  foreign key (region, server_id, character_id)
    references public.character_leaderboard_entries (region, server_id, character_id) on delete cascade
);

create index character_leaderboard_submissions_character_idx
  on public.character_leaderboard_submissions (region, server_id, character_id);

alter table public.character_leaderboard_entries enable row level security;
alter table public.character_leaderboard_submissions enable row level security;

-- Users can see only which of their own linked characters they submitted.
create policy "Users read their leaderboard submissions"
  on public.character_leaderboard_submissions for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.character_leaderboard_entries from anon, authenticated;
revoke all on public.character_leaderboard_submissions from anon, authenticated;
grant select on public.character_leaderboard_submissions to authenticated;

-- Compute rank before applying the name search, so search results retain their
-- rank within the selected region/server scope. Ties share the same rank.
create or replace function public.character_leaderboard_page(
  p_region text default null,
  p_server_id integer default null,
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  rank bigint,
  region text,
  server_id integer,
  character_id text,
  name text,
  server_name text,
  class_name text,
  level integer,
  gear_score integer,
  combat_power integer,
  profile_image_url text,
  checked_at timestamptz,
  total bigint
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
        select 1 from public.character_leaderboard_submissions s
        where s.region = e.region and s.server_id = e.server_id
          and s.character_id = e.character_id
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

revoke all on function public.character_leaderboard_page(text, integer, text, integer, integer) from public;
grant execute on function public.character_leaderboard_page(text, integer, text, integer, integer) to anon, authenticated;

-- A single board request can claim one overdue character for background
-- refresh. The claim interval prevents concurrent requests from hammering the
-- official profile service, including after a failed refresh.
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
        select 1 from public.character_leaderboard_submissions s
        where s.region = candidate.region and s.server_id = candidate.server_id
          and s.character_id = candidate.character_id
      )
    order by candidate.checked_at
    for update of candidate skip locked
    limit 1
  )
  returning e.region, e.server_id, e.character_id;
$$;

revoke all on function public.claim_character_leaderboard_refresh() from public, anon, authenticated;
grant execute on function public.claim_character_leaderboard_refresh() to service_role;
