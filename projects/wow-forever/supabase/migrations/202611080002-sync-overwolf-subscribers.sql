-- App-triggered snapshots, verified with Overwolf on the server.
begin;
alter table public.premium_subscribers
  add column source text not null default 'tebex' check (source in ('tebex', 'overwolf_app')),
  add column overwolf_state text,
  add column overwolf_recurring_payment_id text,
  add column verified_at timestamptz;

alter table public.premium_subscribers drop constraint premium_subscribers_status_check;
alter table public.premium_subscribers add constraint premium_subscribers_status_check check (status in (
  'active', 'overdue', 'pending_cancellation', 'pending_downgrade', 'expired',
  'cancelled', 'ended', 'refunded', 'disputed', 'chargeback', 'inactive', 'unknown'
));

-- Empty successful snapshots mark previously observed plans inactive. Failed
-- API calls never reach this function. No records are created for non-buyers.
create function public.sync_overwolf_subscriber_snapshot(p_user_id uuid, p_observed_at timestamptz, p_rows jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if exists (select 1 from public.premium_subscribers
    where source = 'overwolf_app' and overwolf_user_id = p_user_id and verified_at >= p_observed_at) then
    return;
  end if;

  insert into public.premium_subscribers as subscriber (
    provider_reference, package_id, billing_type, overwolf_user_id, status,
    last_event_id, last_event_type, last_event_at, last_event_priority,
    source, overwolf_state, overwolf_recurring_payment_id, verified_at
  ) select
    'overwolf:' || p_user_id::text, item.package_id, item.billing_type, p_user_id, item.status,
    p_observed_at::text, 'overwolf.app_sync', p_observed_at, 0,
    'overwolf_app', item.overwolf_state, item.recurring_payment_id, p_observed_at
  from jsonb_to_recordset(p_rows) as item (
    package_id bigint, billing_type text, status text, overwolf_state text, recurring_payment_id text
  )
  on conflict (provider_reference, package_id) do update set
    status = excluded.status, overwolf_state = excluded.overwolf_state,
    overwolf_recurring_payment_id = excluded.overwolf_recurring_payment_id,
    verified_at = excluded.verified_at, last_event_id = excluded.last_event_id,
    last_event_type = excluded.last_event_type, last_event_at = excluded.last_event_at, updated_at = now();

  update public.premium_subscribers set
    status = 'inactive', overwolf_state = null, verified_at = p_observed_at,
    last_event_id = p_observed_at::text, last_event_type = 'overwolf.app_sync',
    last_event_at = p_observed_at, updated_at = now()
  where source = 'overwolf_app' and overwolf_user_id = p_user_id
    and not exists (select 1 from jsonb_array_elements(p_rows) item
      where (item->>'package_id')::bigint = package_id);
end;
$$;

revoke all on function public.sync_overwolf_subscriber_snapshot(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.sync_overwolf_subscriber_snapshot(uuid, timestamptz, jsonb) to service_role;

comment on column public.premium_subscribers.verified_at is 'Last successful server-side Overwolf check, triggered by the app. NULL for webhook records.';
comment on column public.premium_subscribers.overwolf_state is 'Exact Overwolf API state. NULL when the plan was absent from a successful snapshot.';
commit;
