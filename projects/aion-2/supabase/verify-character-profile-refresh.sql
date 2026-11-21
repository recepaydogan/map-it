-- Read-only operational checks. Never select Vault contents or cron commands.
select
  count(*) as linked_identities,
  count(*) filter (where p.info_payload is not null) as complete_profiles,
  count(*) filter (where p.info_payload is null and j.failures = 0) as awaiting_initial_refresh,
  count(*) filter (where j.failures > 0) as retrying_profiles,
  min(p.checked_at) filter (where p.info_payload is not null) as oldest_verified_at,
  max(p.checked_at) filter (where p.info_payload is not null) as newest_verified_at
from (select distinct region, server_id, character_id from public.user_characters) u
left join public.character_profiles p using (region, server_id, character_id)
left join public.character_profile_jobs j using (region, server_id, character_id);

select last_error, count(*) as profiles, min(next_refresh_at) as next_retry
from public.character_profile_jobs where failures > 0 group by last_error;

select jobname, schedule, active from cron.job where jobname = 'refresh-character-profiles';
select created, status_code, timed_out, error_msg, left(content, 200) as result
from net._http_response order by created desc limit 5;

select c.relname, c.relkind from pg_class c
where c.oid in ('public.character_profiles'::regclass, 'public.character_leaderboard_entries'::regclass);
