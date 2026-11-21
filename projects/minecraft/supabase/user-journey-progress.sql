-- Account-owned journey history is stored per world so full routes do not
-- consume the small map/world progress payload. Safe to run again.

create table if not exists public.user_journey_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  world_id text not null check (char_length(world_id) between 1 and 512),
  rev bigint not null default 1,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, world_id)
);

alter table public.user_journey_progress enable row level security;

drop policy if exists "Users read their own journeys" on public.user_journey_progress;
create policy "Users read their own journeys"
  on public.user_journey_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.user_journey_progress from anon, authenticated;
grant select on public.user_journey_progress to authenticated;

create or replace function public.user_journey_progress_save(
  p_world_id text,
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
  v_row public.user_journey_progress%rowtype;
begin
  if v_uid is null then
    raise exception 'sync: sign in to save journeys';
  end if;
  if p_world_id is null or pg_catalog.char_length(p_world_id) not between 1 and 512 then
    raise exception 'sync: invalid world identity';
  end if;
  if p_state is null or pg_catalog.jsonb_typeof(p_state) <> 'object' then
    raise exception 'sync: malformed journey payload';
  end if;
  if pg_catalog.pg_column_size(p_state) > 4194304 then
    raise exception 'sync: journey payload is too large';
  end if;

  select * into v_row
    from public.user_journey_progress progress
   where progress.user_id = v_uid and progress.world_id = p_world_id
     for update;

  if not found then
    begin
      insert into public.user_journey_progress (user_id, world_id, rev, state)
      values (v_uid, p_world_id, 1, p_state)
      returning * into v_row;
    exception when unique_violation then
      select * into v_row
        from public.user_journey_progress progress
       where progress.user_id = v_uid and progress.world_id = p_world_id;
    end;
  elsif p_expected_rev is not null and v_row.rev = p_expected_rev then
    update public.user_journey_progress progress
       set state = p_state,
           rev = progress.rev + 1,
           updated_at = now()
     where progress.user_id = v_uid and progress.world_id = p_world_id
     returning * into v_row;
  end if;

  return query select v_row.rev, v_row.state, v_row.updated_at;
end;
$$;

revoke all on function public.user_journey_progress_save(text, bigint, jsonb) from public, anon;
grant execute on function public.user_journey_progress_save(text, bigint, jsonb) to authenticated;
