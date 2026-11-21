-- Enable shared Map It feedback and account saves for the GTA 6 library entry.
begin;

alter table public.map_it_support_threads drop constraint if exists map_it_support_threads_game_id_check;
alter table public.map_it_support_threads add constraint map_it_support_threads_game_id_check
  check (game_id in ('aion-2', 'baldurs-gate-3', 'elden-ring', 'enshrouded', 'gta-6', 'minecraft', 'peak', 'phantom-blade', 'project-zomboid', 'valheim', 'wow-forever'));

create or replace function public.map_it_support_start_thread(
  p_token uuid,
  p_display_name text,
  p_body text,
  p_game_id text
)
returns table (
  id uuid,
  display_name text,
  user_email text,
  status text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_sender text,
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  has_account boolean,
  game_id text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash bytea;
  v_email text;
  v_limits record;
  v_count int;
  v_thread public.map_it_support_threads%rowtype;
begin
  if p_game_id is null or p_game_id not in ('aion-2', 'baldurs-gate-3', 'elden-ring', 'enshrouded', 'gta-6', 'minecraft', 'peak', 'phantom-blade', 'project-zomboid', 'valheim', 'wow-forever') then
    raise exception 'support: choose a valid game' using errcode = '22023';
  end if;
  if p_token is null then
    raise exception 'support: missing device token';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) = 0
     or char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'support: a name and a report are both required';
  end if;

  v_hash := public.map_it_support_token_hash(p_token);
  select * into v_limits from public.map_it_support_limits();

  if not public.map_it_is_support_admin() then
    select count(*) into v_count
      from public.map_it_support_threads t
     where (t.client_token_hash = v_hash or (v_uid is not null and t.user_id = v_uid));
    if v_count >= v_limits.threads_per_token then
      raise exception 'support: too many reports open — delete an old one first';
    end if;

    select count(*) into v_count
      from public.map_it_support_threads t
     where (t.client_token_hash = v_hash or (v_uid is not null and t.user_id = v_uid))
       and t.created_at > now() - interval '1 hour';
    if v_count >= v_limits.threads_per_token_hour then
      raise exception 'support: too many new reports in a short time — try again later';
    end if;

    -- Circuit breaker: rotating tokens defeats the per-token count, so the
    -- account-less path is also capped as a whole.
    if v_uid is null then
      select count(*) into v_count
        from public.map_it_support_threads t
       where t.user_id is null
         and t.created_at > now() - interval '1 hour';
      if v_count >= v_limits.anon_threads_per_hour then
        raise exception 'support: too many reports are coming in right now — try again shortly';
      end if;
    end if;
  end if;

  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
  end if;

  insert into public.map_it_support_threads (client_token_hash, user_id, display_name, user_email, game_id)
  values (v_hash, v_uid, btrim(p_display_name), v_email, p_game_id)
  returning * into v_thread;

  insert into public.map_it_support_messages (thread_id, sender, body)
  values (v_thread.id, 'user', btrim(p_body));

  return query
    select t.id, t.display_name, t.user_email, t.status, t.created_at,
           t.last_message_at, t.last_sender, t.user_last_read_at,
           t.admin_last_read_at, t.user_id is not null, t.game_id
      from public.map_it_support_threads t
     where t.id = v_thread.id;
end;
$$;

create table if not exists public.map_it_gta_6_user_saved_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  revision bigint not null default 1 check (revision > 0)
);

alter table public.map_it_gta_6_user_saved_state enable row level security;
revoke all on public.map_it_gta_6_user_saved_state from anon;
grant select, insert, update, delete on public.map_it_gta_6_user_saved_state to authenticated;
drop policy if exists "own account saves" on public.map_it_gta_6_user_saved_state;
create policy "own account saves" on public.map_it_gta_6_user_saved_state for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

commit;
