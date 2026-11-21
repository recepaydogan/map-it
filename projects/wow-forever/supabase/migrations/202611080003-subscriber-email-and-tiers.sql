begin;

alter table public.premium_subscribers
  add column tier smallint generated always as (
    case package_id when 7793904 then 1 when 7797990 then 2 when 7797992 then 3 else 0 end
  ) stored,
  add column checkout_email_event_at timestamptz;

-- The app owns entitlement state. Only signed Tebex events supply payer email.
-- Both arrival orders are supported; recurring agreements must match exactly.
create function public.enrich_app_subscriber_from_tebex()
returns trigger language plpgsql set search_path = '' as $$
declare payment public.premium_subscribers;
begin
  if new.overwolf_user_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.overwolf_user_id::text, 0));
  if new.source <> 'overwolf_app' then return new; end if;

  select * into payment from public.premium_subscribers event
  where event.source = 'tebex'
    and event.overwolf_user_id = new.overwolf_user_id
    and event.package_id = new.package_id
    and event.billing_type = new.billing_type
    and event.checkout_email is not null
    and (new.billing_type = 'one_time' or event.provider_reference = new.overwolf_recurring_payment_id)
  order by event.last_event_at desc, event.provider_reference desc limit 1;

  new.checkout_email := payment.checkout_email;
  new.checkout_email_event_at := payment.last_event_at;
  new.is_test := payment.is_test;
  new.latest_transaction_id := payment.latest_transaction_id;
  return new;
end;
$$;

create trigger premium_subscriber_enrich_before_write
before insert or update on public.premium_subscribers
for each row execute function public.enrich_app_subscriber_from_tebex();

create function public.refresh_app_subscriber_email()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source = 'tebex' and new.overwolf_user_id is not null and new.checkout_email is not null then
    -- The BEFORE trigger performs the trusted lookup; no entitlement fields change.
    update public.premium_subscribers set updated_at = now()
    where source = 'overwolf_app' and overwolf_user_id = new.overwolf_user_id
      and package_id = new.package_id and billing_type = new.billing_type
      and (billing_type = 'one_time' or overwolf_recurring_payment_id = new.provider_reference);
  end if;
  return null;
end;
$$;

create trigger premium_subscriber_email_after_webhook
after insert or update on public.premium_subscribers
for each row execute function public.refresh_app_subscriber_email();

revoke all on function public.enrich_app_subscriber_from_tebex() from public, anon, authenticated;
revoke all on function public.refresh_app_subscriber_email() from public, anon, authenticated;

-- One effective plan per user. Lower plans keep their provider state and billing.
create view public.premium_effective_subscriptions with (security_invoker = true) as
select distinct on (overwolf_user_id)
  overwolf_user_id, package_id, tier, billing_type, status, overwolf_state,
  checkout_email, overwolf_email, overwolf_recurring_payment_id, verified_at, updated_at
from public.premium_subscribers
where source = 'overwolf_app' and overwolf_user_id is not null and tier > 0
  and status in ('active', 'pending_cancellation')
order by overwolf_user_id, tier desc, (status = 'active') desc, package_id;

revoke all on public.premium_effective_subscriptions from public, anon, authenticated;
grant select on public.premium_effective_subscriptions to service_role;

comment on column public.premium_subscribers.tier is 'Application entitlement priority: Monthly 1, Annual 2, Lifetime 3. Does not change Tebex billing.';
comment on column public.premium_subscribers.checkout_email_event_at is 'Timestamp of the signed Tebex event supplying the app snapshot payer email. Not an Overwolf account email.';

-- Enrich existing snapshots if verified webhook records already exist.
update public.premium_subscribers set updated_at = updated_at where source = 'overwolf_app';
commit;
