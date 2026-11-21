-- Apply after support.sql and comments.sql, before releasing the new client.
-- One bounded response replaces periodic support lists and moderation RPCs.
create or replace function public.notification_summary(p_token uuid)
returns table (
  is_admin boolean,
  unread_replies bigint,
  inbox_pending bigint,
  reported integer,
  unreviewed integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  is_admin := public.is_support_admin();
  select count(*) into unread_replies
    from public.support_threads t
   where ((p_token is not null and t.client_token_hash = public.support_token_hash(p_token))
          or (auth.uid() is not null and t.user_id = auth.uid()))
     and t.last_sender = 'admin'
     and (t.user_last_read_at is null or t.last_message_at > t.user_last_read_at);

  inbox_pending := 0;
  reported := 0;
  unreviewed := 0;
  if is_admin then
    select count(*) into inbox_pending
      from public.support_threads t
     where t.last_sender = 'user'
       and (t.admin_last_read_at is null or t.last_message_at > t.admin_last_read_at);
    select c.reported, c.unreviewed into reported, unreviewed
      from public.marker_comments_admin_counts() c;
  end if;
  return next;
end;
$$;

revoke all on function public.notification_summary(uuid) from public;
grant execute on function public.notification_summary(uuid) to anon, authenticated;
