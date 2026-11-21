-- Run after migrations and deploying character-profile-refresh. Provision
-- character_profile_project_url and character_profile_refresh_secret in Vault;
-- set the same secret as CHARACTER_PROFILE_REFRESH_SECRET on Edge Functions.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'character_profile_project_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'character_profile_refresh_secret') then
    raise exception 'Provision the character profile scheduler Vault secrets first';
  end if;
end;
$$;
select cron.schedule('refresh-character-profiles', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'character_profile_project_url')
      || '/functions/v1/character-profile-refresh',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'character_profile_refresh_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 80000
  );
$job$);
