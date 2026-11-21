create table if not exists public.mod_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  request_text text not null check (char_length(btrim(request_text)) between 1 and 1000),
  source text not null default 'mod-library' check (source = 'mod-library'),
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'declined', 'shipped')),
  created_at timestamptz not null default now()
);

alter table public.mod_requests enable row level security;

create policy "Anyone can submit mod requests"
  on public.mod_requests
  for insert
  to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and char_length(btrim(request_text)) between 1 and 1000
    and source = 'mod-library'
    and status = 'new'
  );

grant insert on public.mod_requests to anon, authenticated;

comment on table public.mod_requests is
  'Project Zomboid map mod requests submitted from the Mod Library panel.';
