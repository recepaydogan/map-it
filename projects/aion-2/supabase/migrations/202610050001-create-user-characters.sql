-- Public character profiles saved by an account. Profile details remain on the
-- official game service; this table stores only the identity needed to reload.
create table if not exists public.user_characters (
  user_id uuid not null references auth.users (id) on delete cascade,
  region text not null check (length(region) between 2 and 8),
  server_id integer not null check (server_id > 0),
  character_id text not null check (length(character_id) between 1 and 200),
  name text not null check (length(name) between 1 and 100),
  server_name text not null check (length(server_name) between 1 and 100),
  level integer not null default 0 check (level >= 0),
  pc_id integer not null default 0,
  race integer not null default 0,
  profile_image_url text,
  linked_at timestamptz not null default now(),
  primary key (user_id, region, server_id, character_id)
);

create index if not exists user_characters_recent_idx
  on public.user_characters (user_id, linked_at desc);

alter table public.user_characters enable row level security;

drop policy if exists "Users read their characters" on public.user_characters;
drop policy if exists "Users add their characters" on public.user_characters;
drop policy if exists "Users remove their characters" on public.user_characters;
create policy "Users read their characters" on public.user_characters
  for select to authenticated using (auth.uid() = user_id);
create policy "Users add their characters" on public.user_characters
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users remove their characters" on public.user_characters
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.user_characters from anon;
grant select, insert, delete on public.user_characters to authenticated;

-- Import the single previously remembered character for existing accounts.
-- Both the wrapped and early unwrapped JSON formats were used by the client.
with legacy as (
  select user_id,
    case when jsonb_typeof(data->'lastCharacter'->'character') = 'object'
      then data->'lastCharacter'->'character' else data->'lastCharacter' end as character,
    case when (data->'lastCharacter'->>'viewedAt') ~ '^[0-9]{10,13}$'
      then to_timestamp((data->'lastCharacter'->>'viewedAt')::double precision / 1000)
      else now() end as linked_at
  from public.user_saved_data
  where data ? 'lastCharacter'
)
insert into public.user_characters (
  user_id, region, server_id, character_id, name, server_name,
  level, pc_id, race, profile_image_url, linked_at
)
select user_id, character->>'region', (character->>'serverId')::integer,
  character->>'characterId', character->>'name', character->>'serverName',
  case when (character->>'level') ~ '^[0-9]{1,3}$' then (character->>'level')::integer else 0 end,
  case when (character->>'pcId') ~ '^[0-9]{1,9}$' then (character->>'pcId')::integer else 0 end,
  case when (character->>'race') ~ '^[0-9]{1,9}$' then (character->>'race')::integer else 0 end,
  nullif(character->>'profileImageUrl', ''), linked_at
from legacy
where jsonb_typeof(character) = 'object'
  and length(character->>'region') between 2 and 8
  and (character->>'serverId') ~ '^[0-9]{1,9}$'
  and length(character->>'characterId') between 1 and 200
  and length(character->>'name') between 1 and 100
  and length(character->>'serverName') between 1 and 100
on conflict (user_id, region, server_id, character_id) do nothing;
