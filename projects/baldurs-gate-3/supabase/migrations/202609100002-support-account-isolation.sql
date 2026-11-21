-- Account-bound reports require the owning session. Device tokens only authorize
-- unclaimed reports; staff retain inbox access without becoming the reporter.
-- No existing author, email, or message is rewritten.

create or replace function public.support_list_threads(p_token uuid)
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
  has_account boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.display_name, t.user_email, t.status, t.created_at,
         t.last_message_at, t.last_sender, t.user_last_read_at,
         t.admin_last_read_at, t.user_id is not null
    from public.support_threads t
   where (t.user_id is null and p_token is not null
          and t.client_token_hash = public.support_token_hash(p_token))
      or (auth.uid() is not null and t.user_id = auth.uid())
   order by t.last_message_at desc;
$$;

create or replace function public.support_thread_messages(
  p_token uuid,
  p_thread_id uuid
)
returns table (
  id uuid,
  thread_id uuid,
  sender text,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_support_admin();
  v_owner boolean;
begin
  -- Every clause is coalesced to false ON ITS OWN. Without that, an ANONYMOUS
  -- thread (user_id null) read by a signed-in caller whose token does not match
  -- gives `false or (true and null)` = NULL, not false — and the old
  -- `v_owner is null` branch then read that as "no such thread" and returned
  -- empty BEFORE v_admin was ever consulted. That is exactly the admin inbox
  -- opening an account-less report and seeing a conversation with no messages
  -- in it. Row existence is `found`, which is what actually answers that
  -- question; ownership is a plain boolean.
  select
    coalesce(t.user_id is null and p_token is not null
             and t.client_token_hash = public.support_token_hash(p_token), false)
    or coalesce(auth.uid() is not null and t.user_id = auth.uid(), false)
    into v_owner
    from public.support_threads t
   where t.id = p_thread_id;

  if not found or not (v_owner or v_admin) then
    return; -- unknown thread, or not the caller's: same empty answer either way
  end if;

  return query
    select m.id, m.thread_id, m.sender, m.body, m.created_at, m.edited_at
      from public.support_messages m
     where m.thread_id = p_thread_id
     order by m.created_at;
end;
$$;

create or replace function public.support_post_message(
  p_token uuid,
  p_thread_id uuid,
  p_body text,
  p_as_admin boolean default false
)
returns table (
  id uuid,
  thread_id uuid,
  sender text,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_support_admin();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
  v_thread public.support_threads%rowtype;
  v_owner boolean;
  v_sender text;
  v_limits record;
  v_count int;
  v_message public.support_messages%rowtype;
begin
  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'support: the message is empty';
  end if;

  select * into v_thread from public.support_threads t where t.id = p_thread_id;
  if not found then
    raise exception 'support: that conversation no longer exists';
  end if;

  -- Coalesced per clause: on an anonymous thread `v_thread.user_id = v_uid` is
  -- NULL, so an uncoalesced expression yields NULL — and `if not null` does not
  -- raise, which let any signed-in stranger write into any account-less report.
  v_owner := coalesce(v_thread.user_id is null and v_hash is not null and v_thread.client_token_hash = v_hash, false)
             or coalesce(v_uid is not null and v_thread.user_id = v_uid, false);

  if p_as_admin then
    -- Replying as support: staff membership is the whole permission, and it is
    -- checked here rather than taken on trust.
    if not v_admin then
      raise exception 'support: only support staff can reply as support';
    end if;
    v_sender := 'admin';
  else
    if not v_owner then
      raise exception 'support: that conversation no longer exists';
    end if;
    v_sender := 'user';
  end if;

  select * into v_limits from public.support_limits();
  if not v_admin then
    select count(*) into v_count
      from public.support_messages m
      join public.support_threads t on t.id = m.thread_id
     where t.client_token_hash = v_hash
       and m.created_at > now() - interval '1 hour';
    if v_count >= v_limits.messages_per_token_hour then
      raise exception 'support: too many messages in a short time — try again later';
    end if;
  end if;

  select count(*) into v_count
    from public.support_messages m where m.thread_id = p_thread_id;
  if v_count >= v_limits.messages_per_thread then
    raise exception 'support: this conversation is full — start a new report';
  end if;

  insert into public.support_messages (thread_id, sender, author_id, body)
  values (
    p_thread_id,
    v_sender,
    case when v_sender = 'admin' then v_uid else null end,
    btrim(p_body)
  )
  returning * into v_message;

  return query
    select v_message.id, v_message.thread_id, v_message.sender, v_message.body,
           v_message.created_at, v_message.edited_at;
end;
$$;

create or replace function public.support_edit_message(
  p_token uuid,
  p_message_id uuid,
  p_body text
)
returns table (
  id uuid,
  thread_id uuid,
  sender text,
  body text,
  created_at timestamptz,
  edited_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_support_admin();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
  v_message public.support_messages%rowtype;
  v_thread public.support_threads%rowtype;
  v_owner boolean;
begin
  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'support: the message is empty';
  end if;

  select * into v_message from public.support_messages m where m.id = p_message_id;
  if not found then
    raise exception 'support: that message no longer exists';
  end if;
  select * into v_thread
    from public.support_threads t where t.id = v_message.thread_id;

  -- Same NULL trap as support_post_message: coalesce each clause so a
  -- non-owner is `false`, never NULL, and the check below fails closed.
  v_owner := coalesce(v_thread.user_id is null and v_hash is not null and v_thread.client_token_hash = v_hash, false)
             or coalesce(v_uid is not null and v_thread.user_id = v_uid, false);

  if not ((v_owner and v_message.sender = 'user')
          or (v_admin and v_message.sender = 'admin')) then
    raise exception 'support: that message is not yours to edit';
  end if;

  update public.support_messages m
     set body = btrim(p_body),
         edited_at = case when m.body is distinct from btrim(p_body)
                          then now() else m.edited_at end
   where m.id = p_message_id
   returning * into v_message;

  return query
    select v_message.id, v_message.thread_id, v_message.sender, v_message.body,
           v_message.created_at, v_message.edited_at;
end;
$$;

create or replace function public.support_delete_thread(
  p_token uuid,
  p_thread_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
  v_deleted int;
begin
  delete from public.support_threads t
   where t.id = p_thread_id
     and (
       (t.user_id is null and v_hash is not null and t.client_token_hash = v_hash)
       or (v_uid is not null and t.user_id = v_uid)
       or public.is_support_admin()
     );
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.support_set_status(
  p_token uuid,
  p_thread_id uuid,
  p_status text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_support_admin();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
  v_updated int;
begin
  if p_status not in ('open', 'answered', 'closed') then
    raise exception 'support: unknown status';
  end if;
  if p_status = 'answered' and not v_admin then
    raise exception 'support: only support staff can mark a thread answered';
  end if;

  update public.support_threads t
     set status = p_status,
         updated_at = now()
   where t.id = p_thread_id
     and (
       (t.user_id is null and v_hash is not null and t.client_token_hash = v_hash)
       or (v_uid is not null and t.user_id = v_uid)
       or v_admin
     );
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.support_mark_read(
  p_token uuid,
  p_thread_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.is_support_admin();
  v_hash bytea := case when p_token is null then null
                       else public.support_token_hash(p_token) end;
begin
  update public.support_threads t
     set user_last_read_at =
           case
             when (t.user_id is null and v_hash is not null and t.client_token_hash = v_hash)
               or (v_uid is not null and t.user_id = v_uid)
             then now()
             else t.user_last_read_at
           end,
         admin_last_read_at =
           case when v_admin then now() else t.admin_last_read_at end
   where t.id = p_thread_id
     and (
       (t.user_id is null and v_hash is not null and t.client_token_hash = v_hash)
       or (v_uid is not null and t.user_id = v_uid)
       or v_admin
     );
end;
$$;
