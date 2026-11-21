import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const token = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const admin = '00000000-0000-4000-8000-000000000003';
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users (id uuid primary key, email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated;`);
 const sql = fs.readFileSync('supabase/migrations/202609100001-create-support.sql','utf8');
 await db.exec(sql); await db.exec(sql);
 const isolation = fs.readFileSync("supabase/migrations/202609100002-support-account-isolation.sql", "utf8");
 await db.exec(isolation); await db.exec(isolation);
 await db.query('insert into auth.users values ($1,(public.support_admin_emails())[1])',[admin]);
 await db.exec('set role anon');
 const thread = (await db.query('select * from public.support_start_thread($1,$2,$3)',[token,'Player','Test report'])).rows[0];
 assert.ok(thread.id);
 assert.equal((await db.query('select * from public.support_list_threads($1)',[other])).rows.length,0);
 await assert.rejects(db.query('select * from public.support_threads'),/permission denied/);
 await assert.rejects(db.query('select * from public.support_post_message($1,$2,$3,true)',[other,thread.id,'Impersonation']),/support:/);
 await db.exec('reset role; set role authenticated');
 await db.query("select set_config('test.user_id',$1,false)",[admin]);
 assert.equal((await db.query('select * from public.support_inbox_threads()')).rows.length,1);
 const reply=(await db.query('select * from public.support_post_message($1,$2,$3,true)',[other,thread.id,'Reply'])).rows[0];
 await db.query('select * from public.support_edit_message($1,$2,$3)',[other,reply.id,'Edited reply']);
 await db.query('select public.support_set_status($1,$2,$3)',[other,thread.id,'closed']);
 await db.query("select set_config('test.user_id','',false)");
 await db.exec('reset role; set role anon');
 await db.query('select * from public.support_post_message($1,$2,$3,false)',[token,thread.id,'Follow up']);
 assert.equal((await db.query('select * from public.support_list_threads($1)',[token])).rows[0].status,'open');
 assert.equal((await db.query('select * from public.support_thread_messages($1,$2)',[token,thread.id])).rows.length,3);
 await db.query('select public.support_delete_thread($1,$2)',[token,thread.id]);
 assert.equal((await db.query('select * from public.support_list_threads($1)',[token])).rows.length,0);
 // Reproduce account A -> signed out -> account B/admin on the SAME device token.
 await db.exec('reset role');
 await db.query('insert into auth.users values ($1,$2)',[token,'reporter@example.test']);
 await db.query('insert into auth.users values ($1,$2)',[other,'other@example.test']);
 const asAccount = async (id) => {
   await db.exec('reset role; set role authenticated');
   await db.query("select set_config('test.user_id',$1,false)",[id]);
 };
 await asAccount(token);
 const owned = (await db.query('select * from public.support_start_thread($1,$2,$3)',[token,'Reporter','Account report'])).rows[0];
 const originalMessage = (await db.query('select * from public.support_thread_messages($1,$2)',[token,owned.id])).rows[0];
 for (const id of ['', other, admin]) {
   await asAccount(id);
   assert.equal((await db.query('select * from public.support_list_threads($1)',[token])).rows.length,0,'Same token must not make another account the reporter');
   assert.equal((await db.query('select public.support_claim_threads($1) as count',[token])).rows[0].count,0,'Claim must never move an account-bound report');
   await assert.rejects(db.query('select * from public.support_post_message($1,$2,$3,false)',[token,owned.id,'Wrong author']),/no longer exists/);
   await assert.rejects(db.query('select * from public.support_edit_message($1,$2,$3)',[token,originalMessage.id,'Wrong edit']),/not yours/);
   if (id !== admin) {
     assert.equal((await db.query('select * from public.support_thread_messages($1,$2)',[token,owned.id])).rows.length,0);
     assert.equal((await db.query('select public.support_delete_thread($1,$2) as deleted',[token,owned.id])).rows[0].deleted,false);
     assert.equal((await db.query('select public.support_set_status($1,$2,$3) as changed',[token,owned.id,'closed'])).rows[0].changed,false);
   }
 }
 const inboxThread = (await db.query('select * from public.support_inbox_threads()')).rows.find(t=>t.id===owned.id);
 assert.equal(inboxThread.user_email,'reporter@example.test');
 const staffReply=(await db.query('select * from public.support_post_message($1,$2,$3,true)',[token,owned.id,'Staff reply'])).rows[0];
 assert.equal(staffReply.sender,'admin');
 await asAccount(token);
 assert.equal((await db.query('select * from public.support_list_threads($1)',[other])).rows[0].id,owned.id,'Owner can return from a new device');
 console.log('Support database passed: idempotent migration, anonymous reports, private ownership, staff replies, editing, closing, reopening and deletion.');
} finally { await db.close(); }
