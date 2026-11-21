-- Shared auth.users; independent game save tables. No solo project is queried.
begin;

do $migration$
declare entry record;
begin
  for entry in select * from (values
    ('map_it_aion_2_user_saved_data', 'data'),
    ('map_it_enshrouded_user_saved_state', 'state'),
    ('map_it_phantom_blade_user_saved_state', 'state'),
    ('map_it_wow_forever_user_saved_state', 'state')
  ) as games(table_name, payload_column) loop
    execute format('create table if not exists public.%I (
      user_id uuid primary key references auth.users(id) on delete cascade,
      %I jsonb not null default ''{}''::jsonb check(jsonb_typeof(%I) = ''object''),
      revision bigint not null default 1 check(revision > 0))', entry.table_name, entry.payload_column, entry.payload_column);
  end loop;
end $migration$;

create table if not exists public.map_it_baldurs_gate_3_map_saved_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check(revision > 0),
  updated_at timestamptz not null default now(),
  primary key(user_id, app_id)
);
create table if not exists public.map_it_elden_ring_user (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb check(jsonb_typeof(state) = 'object'),
  rev bigint not null default 1 check(rev > 0)
);
create table if not exists public.map_it_minecraft_user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb check(jsonb_typeof(state) = 'object'),
  rev bigint not null default 1 check(rev > 0)
);
create table if not exists public.map_it_minecraft_user_journey_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  world_id text not null,
  state jsonb not null default '{}'::jsonb check(jsonb_typeof(state) = 'object'),
  rev bigint not null default 1 check(rev > 0),
  primary key(user_id, world_id)
);
create table if not exists public.map_it_peak_expeditions (
  user_id uuid not null references auth.users(id) on delete cascade,
  scene text not null,
  started_at bigint not null,
  updated_at bigint not null,
  record jsonb not null check(jsonb_typeof(record) = 'object'),
  primary key(user_id, scene, started_at)
);

do $migration$
declare target text;
begin
  foreach target in array array[
    'map_it_aion_2_user_saved_data', 'map_it_enshrouded_user_saved_state',
    'map_it_phantom_blade_user_saved_state', 'map_it_wow_forever_user_saved_state',
    'map_it_baldurs_gate_3_map_saved_states', 'map_it_elden_ring_user',
    'map_it_minecraft_user_progress', 'map_it_minecraft_user_journey_progress', 'map_it_peak_expeditions'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('revoke all on public.%I from anon', target);
    execute format('grant select, insert, update, delete on public.%I to authenticated', target);
    execute format('drop policy if exists "own account saves" on public.%I', target);
    execute format('create policy "own account saves" on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', target);
  end loop;
end $migration$;

-- The original clients expect a compare-and-swap RPC returning the current row,
-- including on collision. Keep that contract for concurrent native windows.
create or replace function public.map_it_elden_ring_user_save(p_expected_rev bigint, p_state jsonb)
returns table(rev bigint, state jsonb) language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_rev is null then
    insert into public.map_it_elden_ring_user(user_id, state) values(auth.uid(), p_state) on conflict(user_id) do nothing;
  else
    update public.map_it_elden_ring_user as saved set state = p_state, rev = saved.rev + 1
      where saved.user_id = auth.uid() and saved.rev = p_expected_rev;
  end if;
  return query select saved.rev, saved.state from public.map_it_elden_ring_user saved where saved.user_id = auth.uid();
end $$;

create or replace function public.map_it_minecraft_user_progress_save(p_expected_rev bigint, p_state jsonb)
returns table(rev bigint, state jsonb) language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_rev is null then
    insert into public.map_it_minecraft_user_progress(user_id, state) values(auth.uid(), p_state) on conflict(user_id) do nothing;
  else
    update public.map_it_minecraft_user_progress as saved set state = p_state, rev = saved.rev + 1
      where saved.user_id = auth.uid() and saved.rev = p_expected_rev;
  end if;
  return query select saved.rev, saved.state from public.map_it_minecraft_user_progress saved where saved.user_id = auth.uid();
end $$;

create or replace function public.map_it_minecraft_user_journey_progress_save(p_world_id text, p_expected_rev bigint, p_state jsonb)
returns table(rev bigint, state jsonb) language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_rev is null then
    insert into public.map_it_minecraft_user_journey_progress(user_id, world_id, state)
      values(auth.uid(), p_world_id, p_state) on conflict(user_id, world_id) do nothing;
  else
    update public.map_it_minecraft_user_journey_progress as saved set state = p_state, rev = saved.rev + 1
      where saved.user_id = auth.uid() and saved.world_id = p_world_id and saved.rev = p_expected_rev;
  end if;
  return query select saved.rev, saved.state from public.map_it_minecraft_user_journey_progress saved
    where saved.user_id = auth.uid() and saved.world_id = p_world_id;
end $$;

revoke all on function public.map_it_elden_ring_user_save(bigint,jsonb) from public, anon;
revoke all on function public.map_it_minecraft_user_progress_save(bigint,jsonb) from public, anon;
revoke all on function public.map_it_minecraft_user_journey_progress_save(text,bigint,jsonb) from public, anon;
grant execute on function public.map_it_elden_ring_user_save(bigint,jsonb) to authenticated;
grant execute on function public.map_it_minecraft_user_progress_save(bigint,jsonb) to authenticated;
grant execute on function public.map_it_minecraft_user_journey_progress_save(text,bigint,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
