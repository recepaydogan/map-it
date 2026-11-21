-- Account-backed player data. The client keeps a local copy for offline use and
-- updates this row with a revision check so another device's edits are merged.
create table if not exists public.user_saved_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  constraint user_saved_state_object check (jsonb_typeof(state) = 'object')
);

alter table public.user_saved_state enable row level security;

drop policy if exists "read own saved state" on public.user_saved_state;
drop policy if exists "create own saved state" on public.user_saved_state;
drop policy if exists "update own saved state" on public.user_saved_state;

create policy "read own saved state" on public.user_saved_state
  for select to authenticated using (user_id = (select auth.uid()));
create policy "create own saved state" on public.user_saved_state
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own saved state" on public.user_saved_state
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.user_saved_state to authenticated;
