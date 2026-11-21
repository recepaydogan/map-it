-- Disposable verification: every test row is rolled back, no email is sent.
begin;
insert into auth.users(id,email) values
 ('d9635f18-9876-4cae-a193-4b1b23400001','map-it-audit-a@example.invalid'),
 ('d9635f18-9876-4cae-a193-4b1b23400002','map-it-audit-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','d9635f18-9876-4cae-a193-4b1b23400001',true);
insert into public.map_it_wow_forever_user_saved_state(user_id,state)
 values ('d9635f18-9876-4cae-a193-4b1b23400001','{"audit":true}');
do $audit$
declare row record;
begin
 select * into row from public.map_it_elden_ring_user_save(null,'{"audit":1}');
 if row.rev <> 1 then raise exception 'Revision setup failed'; end if;
 select * into row from public.map_it_elden_ring_user_save(0,'{"audit":2}');
 if row.rev <> 1 or row.state <> '{"audit":1}'::jsonb then raise exception 'Stale save overwrote current state'; end if;
 begin
  perform public.map_it_support_start_thread('e9635f18-9876-4cae-a193-4b1b23400001','Audit','Uncommitted verification','');
  raise exception 'Empty game accepted';
 exception when sqlstate '22023' then null; end;
 begin
  perform public.map_it_support_start_thread('e9635f18-9876-4cae-a193-4b1b23400001','Audit','Uncommitted verification','unknown');
  raise exception 'Invalid game accepted';
 exception when sqlstate '22023' then null; end;
 select * into row from public.map_it_support_start_thread('e9635f18-9876-4cae-a193-4b1b23400001','Audit','Uncommitted verification','minecraft');
 if row.game_id <> 'minecraft' then raise exception 'Game not retained'; end if;
end;
$audit$;
select set_config('request.jwt.claim.sub','d9635f18-9876-4cae-a193-4b1b23400002',true);
do $audit$
begin
 if exists(select 1 from public.map_it_wow_forever_user_saved_state) then raise exception 'Cross-account save visible'; end if;
 if exists(select 1 from public.map_it_support_list_threads('e9635f18-9876-4cae-a193-4b1b23400001')) then raise exception 'Account support exposed by device token'; end if;
 if exists(select 1 from public.map_it_support_inbox_threads()) then raise exception 'Inbox exposed to non-admin'; end if;
 begin
  insert into public.map_it_wow_forever_user_saved_state(user_id,state) values ('d9635f18-9876-4cae-a193-4b1b23400001','{}');
  raise exception 'Cross-account write allowed';
 exception when insufficient_privilege then null; end;
end;
$audit$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $audit$
begin
 if exists(select 1 from public.map_it_support_list_threads('e9635f18-9876-4cae-a193-4b1b23400001')) then raise exception 'Signed-out visitor can read account support'; end if;
 begin
  perform 1 from public.map_it_support_threads;
  raise exception 'Direct support table access allowed';
 exception when insufficient_privilege then null; end;
end;
$audit$;
reset role;
rollback;
select 'PASS - all test rows rolled back' as backend_checks,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'map_it_%' and c.relkind='r' and c.relrowsecurity) as protected_tables,
 (select public.map_it_support_admin_emails()) as support_admin,
 (select count(*) from auth.users where id in ('d9635f18-9876-4cae-a193-4b1b23400001','d9635f18-9876-4cae-a193-4b1b23400002')) as remaining_audit_users;
