-- Keep the last official profile response with each linked character.
alter table public.user_characters
  add column if not exists profile_snapshot jsonb,
  add column if not exists profile_refreshed_at timestamptz;

drop policy if exists "Users update their character profiles" on public.user_characters;
create policy "Users update their character profiles" on public.user_characters
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update (profile_snapshot, profile_refreshed_at) on public.user_characters to authenticated;
