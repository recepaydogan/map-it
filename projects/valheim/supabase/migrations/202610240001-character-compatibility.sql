-- Run in the Valheim project's Supabase SQL Editor. No Edge Function needed.
begin;

create table if not exists public.valheim_character_compatibility (
  id text primary key default 'default' check (id = 'default'),
  schema_version integer not null default 1 check (schema_version = 1),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  parser_profile text not null default 'grouped-stats-v1'
    check (parser_profile = 'grouped-stats-v1'),
  compatible_versions integer[] not null default array[47]
    check (cardinality(compatible_versions) <= 128
      and array_position(compatible_versions, null) is null
      and 47 <= all(compatible_versions)),
  updated_at timestamptz not null default now()
);

alter table public.valheim_character_compatibility enable row level security;
revoke all on public.valheim_character_compatibility from public, anon, authenticated;
grant select on public.valheim_character_compatibility to anon, authenticated;
drop policy if exists character_compatibility_public_read on public.valheim_character_compatibility;
create policy character_compatibility_public_read on public.valheim_character_compatibility
  for select to anon, authenticated using (id = 'default');

-- Re-running setup preserves any compatibility decisions already published.
insert into public.valheim_character_compatibility (id)
values ('default') on conflict (id) do nothing;

commit;

select schema_version, revision, parser_profile, compatible_versions
from public.valheim_character_compatibility where id = 'default';
