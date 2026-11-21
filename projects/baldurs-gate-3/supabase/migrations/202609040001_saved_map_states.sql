-- Run once in this application's Supabase SQL editor.
begin;

create table public.map_saved_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null check (length(app_id) between 1 and 100),
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['favoriteIds', 'completedIds', 'markers', 'notes']
    and jsonb_typeof(payload->'favoriteIds') = 'array'
    and jsonb_typeof(payload->'completedIds') = 'array'
    and jsonb_typeof(payload->'markers') = 'array'
    and jsonb_typeof(payload->'notes') = 'object'
    and octet_length(payload::text) <= 8388608
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, app_id)
);

alter table public.map_saved_states enable row level security;
revoke all on public.map_saved_states from anon, authenticated;
grant select, insert, update on public.map_saved_states to authenticated;

create policy "Read own map state" on public.map_saved_states for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Insert own map state" on public.map_saved_states for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Update own map state" on public.map_saved_states for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
