import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    insert into auth.users values
      ('00000000-0000-0000-0000-000000000001'),
      ('00000000-0000-0000-0000-000000000002');
  `);
  await db.exec(fs.readFileSync("supabase/migrations/202609040001_saved_map_states.sql", "utf8"));
  const first = "00000000-0000-0000-0000-000000000001";
  const second = "00000000-0000-0000-0000-000000000002";
  const snapshot = JSON.stringify({ favoriteIds: ["one"], completedIds: [], markers: [], notes: {} });
  const asUser = async (id) => {
    await db.exec("reset role; set role authenticated;");
    await db.query("select set_config('test.user_id', $1, false)", [id]);
  };
  await asUser(first);
  await db.query("insert into public.map_saved_states (user_id, app_id, payload) values ($1, 'test-app', $2)", [first, snapshot]);
  assert.equal((await db.query("select * from public.map_saved_states")).rows.length, 1);
  await asUser(second);
  assert.equal((await db.query("select * from public.map_saved_states")).rows.length, 0, "Other users cannot read this state");
  await assert.rejects(db.query("insert into public.map_saved_states (user_id, app_id, payload) values ($1, 'other-app', $2)", [first, snapshot]), /row-level security/);
  assert.equal((await db.query("update public.map_saved_states set revision = 2 where user_id = $1 returning revision", [first])).rows.length, 0);
  await asUser(first);
  await assert.rejects(db.query("update public.map_saved_states set user_id = $1", [second]), /row-level security/);
  assert.equal((await db.query("update public.map_saved_states set revision = 2 where revision = 99 returning revision")).rows.length, 0, "Stale revision cannot overwrite a row");
  assert.equal((await db.query("update public.map_saved_states set revision = 2 where revision = 1 returning revision")).rows.length, 1);
  await assert.rejects(db.query("update public.map_saved_states set payload = '{}'::jsonb"), /check constraint/);
  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select * from public.map_saved_states"), /permission denied/);
  await assert.rejects(db.query("insert into public.map_saved_states (user_id, app_id, payload) values ($1, 'test-app', $2)", [second, snapshot]), /permission denied/);
  await db.exec("reset role;");
  await db.query("delete from auth.users where id = $1", [first]);
  assert.equal((await db.query("select * from public.map_saved_states")).rows.length, 0, "Account deletion removes cloud saves");
  console.log("Saved-map database passed: migration, own-account access, cross-account isolation, anonymous denial, revision guard, payload validation and deletion cascade.");
} finally {
  await db.close();
}
