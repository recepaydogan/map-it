-- Account-owned progress. The client merges anonymous local changes with the
-- latest row after authentication, then uses revision as an optimistic lock.
create table if not exists public.user_saved_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 1 check (revision > 0)
);

alter table public.user_saved_data enable row level security;

drop policy if exists "Users read their saved data" on public.user_saved_data;
drop policy if exists "Users create their saved data" on public.user_saved_data;
drop policy if exists "Users update their saved data" on public.user_saved_data;
create policy "Users read their saved data" on public.user_saved_data
  for select to authenticated using (auth.uid() = user_id);
create policy "Users create their saved data" on public.user_saved_data
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update their saved data" on public.user_saved_data
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_saved_data to authenticated;
