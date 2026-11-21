-- Phase 1 is additive so the currently deployed functions keep working.
-- The existing verified rows become the canonical profile store. Phase 2 only
-- renames it after the new functions are deployed; it never copies scores from
-- client-writable user_characters.profile_snapshot.
alter table public.character_leaderboard_entries
  add column info_payload jsonb,
  add column equipment_payload jsonb,
  add column profile_snapshot jsonb;

create table public.character_profile_jobs (
  region text not null,
  server_id integer not null,
  character_id text not null,
  next_refresh_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  priority_until timestamptz,
  failures integer not null default 0,
  last_error text,
  primary key (region, server_id, character_id)
);
create index character_profile_jobs_due_idx on public.character_profile_jobs(next_refresh_at);

create table public.character_profile_worker (
  id boolean primary key default true check (id),
  lease_token uuid,
  lease_until timestamptz,
  next_request_at timestamptz not null default now()
);
insert into public.character_profile_worker (id) values (true);
alter table public.character_profile_jobs enable row level security;
alter table public.character_profile_worker enable row level security;
revoke all on public.character_profile_jobs, public.character_profile_worker from public, anon, authenticated;

insert into public.character_profile_jobs (region, server_id, character_id)
select distinct region, server_id, character_id from public.user_characters;

create function public.queue_linked_character_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.character_profile_jobs (region, server_id, character_id)
  values (new.region, new.server_id, new.character_id)
  on conflict (region, server_id, character_id) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_linked_character_profile() from public, anon, authenticated;
create trigger queue_linked_character_profile after insert on public.user_characters
for each row execute function public.queue_linked_character_profile();

-- Retain the old writable snapshot contract, but once verified data exists an
-- old client cannot replace it with a stale or forged snapshot. No write fails.
create function public.use_verified_character_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare verified record;
begin
  select e.profile_snapshot, e.checked_at into verified
  from public.character_leaderboard_entries e
  where e.region = new.region and e.server_id = new.server_id and e.character_id = new.character_id
    and e.profile_snapshot is not null;
  if found then
    new.profile_snapshot := verified.profile_snapshot;
    new.profile_refreshed_at := verified.checked_at;
  end if;
  return new;
end;
$$;
revoke all on function public.use_verified_character_snapshot() from public, anon, authenticated;
create trigger use_verified_character_snapshot before insert or update of profile_snapshot, profile_refreshed_at
on public.user_characters for each row execute function public.use_verified_character_snapshot();

create function public.read_character_profile(p_region text, p_server_id integer, p_character_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('info', e.info_payload, 'equipment', e.equipment_payload,
    'snapshot', e.profile_snapshot, 'checkedAt', e.checked_at)
  from public.character_leaderboard_entries e
  where e.region = p_region and e.server_id = p_server_id and e.character_id = p_character_id
    and e.info_payload is not null and e.equipment_payload is not null and e.profile_snapshot is not null;
$$;

-- One global lease serializes upstream traffic across cron runs, edge instances,
-- and concurrent legacy /info + /equipment requests. Failed workers expire.
create function public.claim_character_profile_job(
  p_region text default null, p_server_id integer default null, p_character_id text default null
)
returns table (region text, server_id integer, character_id text, token uuid)
language plpgsql security definer set search_path = '' as $$
declare worker public.character_profile_worker%rowtype;
declare job public.character_profile_jobs%rowtype;
declare claim_token uuid := gen_random_uuid();
begin
  -- All queue operations lock the global worker before a job to avoid deadlocks.
  select * into worker from public.character_profile_worker where id for update;
  if p_region is not null then
    insert into public.character_profile_jobs as requested (region, server_id, character_id, priority_until)
    values (p_region, p_server_id, p_character_id, now() + interval '60 seconds')
    on conflict on constraint character_profile_jobs_pkey do update
      set priority_until = case when requested.priority_until > now() then requested.priority_until
        else now() + interval '60 seconds' end;
  end if;
  if worker.next_request_at > now() or worker.lease_until > now() then return; end if;
  select j.* into job from public.character_profile_jobs j
  where j.next_refresh_at <= now() and (j.lease_until is null or j.lease_until <= now())
    and (p_region is null or (j.region = p_region and j.server_id = p_server_id and j.character_id = p_character_id))
    and (p_region is not null or exists (
      select 1 from public.user_characters u
      where u.region = j.region and u.server_id = j.server_id and u.character_id = j.character_id
    ))
  order by case when j.priority_until > now() then 0 else 1 end,
    j.priority_until nulls last, j.next_refresh_at, j.region, j.server_id, j.character_id
  limit 1 for update skip locked;
  if not found then return; end if;
  update public.character_profile_jobs j set lease_token = claim_token, lease_until = now() + interval '90 seconds'
  where j.region = job.region and j.server_id = job.server_id and j.character_id = job.character_id;
  update public.character_profile_worker set lease_token = claim_token, lease_until = now() + interval '90 seconds' where id;
  return query select job.region, job.server_id, job.character_id, claim_token;
end;
$$;

create function public.complete_character_profile_job(
  p_token uuid, p_info jsonb, p_equipment jsonb, p_snapshot jsonb, p_summary jsonb
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.character_profile_jobs%rowtype;
begin
  perform 1 from public.character_profile_worker
    where id and lease_token = p_token and lease_until > now() for update;
  if not found then return false; end if;
  select * into job from public.character_profile_jobs where lease_token = p_token for update;
  if not found then return false; end if;
  -- UPDATE + INSERT works with both the phase-1 table and the phase-2 compatibility
  -- view. The global lease prevents a competing insert for this identity.
  update public.character_leaderboard_entries set
    name = p_summary->>'name', server_name = p_summary->>'server_name', class_name = p_summary->>'class_name',
    level = (p_summary->>'level')::integer, gear_score = (p_summary->>'gear_score')::integer,
    combat_power = (p_summary->>'combat_power')::integer, profile_image_url = p_summary->>'profile_image_url',
    checked_at = now(), info_payload = p_info, equipment_payload = p_equipment, profile_snapshot = p_snapshot
  where region = job.region and server_id = job.server_id and character_id = job.character_id;
  if not found then
    insert into public.character_leaderboard_entries (
      region, server_id, character_id, name, server_name, class_name, level, gear_score, combat_power,
      profile_image_url, checked_at, info_payload, equipment_payload, profile_snapshot
    ) values (
      job.region, job.server_id, job.character_id, p_summary->>'name', p_summary->>'server_name',
      p_summary->>'class_name', (p_summary->>'level')::integer, (p_summary->>'gear_score')::integer,
      (p_summary->>'combat_power')::integer, p_summary->>'profile_image_url', now(), p_info, p_equipment, p_snapshot
    );
  end if;
  -- This mirror is only for installed clients that read user_characters directly.
  update public.user_characters set profile_snapshot = p_snapshot, profile_refreshed_at = now()
  where region = job.region and server_id = job.server_id and character_id = job.character_id;
  update public.character_profile_jobs set next_refresh_at = now() + interval '3 hours',
    lease_token = null, lease_until = null, priority_until = null, failures = 0, last_error = null
  where lease_token = p_token;
  update public.character_profile_worker set lease_token = null, lease_until = null,
    next_request_at = now() + interval '2 seconds' where id;
  return true;
end;
$$;

create function public.fail_character_profile_job(p_token uuid, p_error text, p_retry_after integer, p_pause_all boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.character_profile_worker where id and lease_token = p_token for update;
  if not found then return; end if;
  update public.character_profile_jobs set failures = failures + 1, last_error = left(p_error, 120),
    next_refresh_at = now() + make_interval(secs => greatest(
      least(greatest(coalesce(p_retry_after, 60), 60), 86400),
      least(60 * power(2, least(failures, 8)), 10800)::integer)),
    lease_token = null, lease_until = null where lease_token = p_token;
  update public.character_profile_worker set lease_token = null, lease_until = null,
    next_request_at = now() + make_interval(secs => case when p_pause_all
      then least(greatest(coalesce(p_retry_after, 60), 60), 86400) else 2 end) where id;
end;
$$;

revoke all on function public.read_character_profile(text, integer, text) from public, anon, authenticated;
revoke all on function public.claim_character_profile_job(text, integer, text) from public, anon, authenticated;
revoke all on function public.complete_character_profile_job(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_character_profile_job(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.read_character_profile(text, integer, text) to service_role;
grant execute on function public.claim_character_profile_job(text, integer, text) to service_role;
grant execute on function public.complete_character_profile_job(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.fail_character_profile_job(uuid, text, integer, boolean) to service_role;


-- Characters with no Gear Score remain viewable but are not ranked.
alter table public.character_leaderboard_entries
  drop constraint character_leaderboard_entries_gear_score_check,
  add constraint character_profiles_gear_score_check check (gear_score >= 0);

-- During rollout an old edge function may still write only the score columns.
-- Once a complete profile exists, keep its projection tied to that snapshot.
create function public.align_character_profile_summary()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.info_payload is not null and new.profile_snapshot is not null then
    new.name := new.profile_snapshot->'profile'->>'characterName';
    new.server_name := new.profile_snapshot->'profile'->>'serverName';
    new.class_name := new.profile_snapshot->'profile'->>'className';
    new.level := (new.profile_snapshot->'profile'->>'characterLevel')::integer;
    new.combat_power := (new.profile_snapshot->'profile'->>'combatPower')::integer;
    new.profile_image_url := new.profile_snapshot->'profile'->>'profileImage';
    new.gear_score := coalesce((select (stat->>'value')::integer
      from jsonb_array_elements(new.profile_snapshot->'stats') stat where stat->>'type' = 'ItemLevel' limit 1), 0);
  end if;
  return new;
end;
$$;
revoke all on function public.align_character_profile_summary() from public, anon, authenticated;
create trigger align_character_profile_summary before insert or update on public.character_leaderboard_entries
for each row execute function public.align_character_profile_summary();

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
    where e.gear_score > 0 and (p_region is null or e.region = p_region)
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
    where e.gear_score > 0 and (p_region is null or e.region = p_region)
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
