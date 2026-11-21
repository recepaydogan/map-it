-- Account-owned map and world progress. Run once in the app's Supabase project;
-- the statements are safe to run again.

create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rev bigint not null default 1,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

drop policy if exists "Users read their own progress" on public.user_progress;
create policy "Users read their own progress"
  on public.user_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.user_progress from anon, authenticated;
grant select on public.user_progress to authenticated;

create or replace function public.user_progress_save(
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
  v_row public.user_progress%rowtype;
begin
  if v_uid is null then
    raise exception 'sync: sign in to save progress';
  end if;
  if p_state is null or pg_catalog.jsonb_typeof(p_state) <> 'object' then
    raise exception 'sync: malformed progress payload';
  end if;
  if pg_catalog.pg_column_size(p_state) > 4194304 then
    raise exception 'sync: progress payload is too large';
  end if;

  select * into v_row
    from public.user_progress progress
   where progress.user_id = v_uid
     for update;

  if not found then
    begin
      insert into public.user_progress (user_id, rev, state)
      values (v_uid, 1, p_state)
      returning * into v_row;
    exception when unique_violation then
      select * into v_row
        from public.user_progress progress
       where progress.user_id = v_uid;
    end;
  elsif p_expected_rev is not null and v_row.rev = p_expected_rev then
    update public.user_progress progress
       set state = p_state,
           rev = progress.rev + 1,
           updated_at = now()
     where progress.user_id = v_uid
     returning * into v_row;
  end if;

  return query select v_row.rev, v_row.state, v_row.updated_at;
end;
$$;

revoke all on function public.user_progress_save(bigint, jsonb) from public, anon;
grant execute on function public.user_progress_save(bigint, jsonb) to authenticated;
