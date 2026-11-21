-- Operational ledger. App entitlement checks continue to use the Overwolf API.
create table public.premium_subscribers (
  provider_reference text not null,
  package_id bigint not null check (package_id > 0),
  billing_type text not null check (billing_type in ('recurring', 'one_time')),
  overwolf_user_id uuid,
  checkout_email text,
  overwolf_email text,
  status text not null check (status in (
    'active', 'overdue', 'pending_cancellation', 'pending_downgrade',
    'expired', 'cancelled', 'ended', 'refunded', 'disputed', 'chargeback'
  )),
  provider_status_id integer,
  started_at timestamptz,
  next_billing_at timestamptz,
  latest_transaction_id text,
  is_test boolean,
  last_event_id text not null,
  last_event_type text not null,
  last_event_at timestamptz not null,
  last_event_priority smallint not null,
  updated_at timestamptz not null default now(),
  primary key (provider_reference, package_id)
);

comment on column public.premium_subscribers.checkout_email is 'Payer email reported by Tebex. May differ from the Overwolf account email.';
comment on column public.premium_subscribers.overwolf_email is 'Reserved for email from an authorized Overwolf OIDC flow. Never populated by the Tebex webhook.';
comment on column public.premium_subscribers.is_test is 'NULL when Tebex supplied no payment method. True for Test Payments.';

create index premium_subscribers_overwolf_user_idx on public.premium_subscribers (overwolf_user_id)
  where overwolf_user_id is not null;
create index premium_subscribers_status_idx on public.premium_subscribers (status, last_event_at desc);

alter table public.premium_subscribers enable row level security;
revoke all on table public.premium_subscribers from public, anon, authenticated;
grant select, insert, update on table public.premium_subscribers to service_role;

-- Process all eligible products in the same transaction. Ignore retries and
-- deliveries older than the last known state for each provider reference.
create function public.apply_tebex_subscriber_event(p_rows jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.premium_subscribers as subscriber (
    provider_reference, package_id, billing_type, overwolf_user_id, checkout_email,
    status, provider_status_id, started_at, next_billing_at, latest_transaction_id,
    is_test, last_event_id, last_event_type, last_event_at, last_event_priority
  )
  select
    event.provider_reference, event.package_id, event.billing_type, event.overwolf_user_id, event.checkout_email,
    event.status, event.provider_status_id, event.started_at, event.next_billing_at, event.latest_transaction_id,
    event.is_test, event.last_event_id, event.last_event_type, event.last_event_at, event.last_event_priority
  from jsonb_to_recordset(p_rows) as event (
    provider_reference text, package_id bigint, billing_type text, overwolf_user_id uuid, checkout_email text,
    status text, provider_status_id integer, started_at timestamptz, next_billing_at timestamptz,
    latest_transaction_id text, is_test boolean, last_event_id text, last_event_type text,
    last_event_at timestamptz, last_event_priority smallint
  )
  on conflict (provider_reference, package_id) do update set
    overwolf_user_id = coalesce(subscriber.overwolf_user_id, excluded.overwolf_user_id),
    checkout_email = coalesce(excluded.checkout_email, subscriber.checkout_email),
    status = excluded.status,
    provider_status_id = excluded.provider_status_id,
    started_at = least(subscriber.started_at, excluded.started_at),
    next_billing_at = case
      when excluded.status in ('expired', 'cancelled', 'ended', 'refunded', 'chargeback') then null
      else coalesce(excluded.next_billing_at, subscriber.next_billing_at)
    end,
    latest_transaction_id = coalesce(excluded.latest_transaction_id, subscriber.latest_transaction_id),
    is_test = coalesce(subscriber.is_test, excluded.is_test),
    last_event_id = excluded.last_event_id,
    last_event_type = excluded.last_event_type,
    last_event_at = excluded.last_event_at,
    last_event_priority = excluded.last_event_priority,
    updated_at = now()
  where subscriber.last_event_id <> excluded.last_event_id
    and (subscriber.last_event_at, subscriber.last_event_priority) < (excluded.last_event_at, excluded.last_event_priority)
    and subscriber.billing_type = excluded.billing_type
    and (subscriber.overwolf_user_id is null or excluded.overwolf_user_id is null
      or subscriber.overwolf_user_id = excluded.overwolf_user_id);
$$;

revoke all on function public.apply_tebex_subscriber_event(jsonb) from public, anon, authenticated;
grant execute on function public.apply_tebex_subscriber_event(jsonb) to service_role;
