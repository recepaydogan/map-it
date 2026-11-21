import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("shared feedback requires a game and isolates guests, accounts and the admin inbox", async () => {
  const db = new PGlite();
  const owner = "00000000-0000-0000-0000-000000000001", stranger = "00000000-0000-0000-0000-000000000002", admin = "00000000-0000-0000-0000-000000000003";
  const token = "10000000-0000-0000-0000-000000000001", otherToken = "10000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      grant usage on schema auth, public to anon, authenticated;
      insert into auth.users values ('${owner}','owner@example.invalid'),('${stranger}','stranger@example.invalid'),('${admin}','recepaydogan209@gmail.com');`);
    const sql = await fs.readFile(new URL("../supabase/migrations/202611040002-shared-support.sql", import.meta.url), "utf8");
    await db.exec(sql); await db.exec(sql);
    const gta = await fs.readFile(new URL("../supabase/migrations/202611180001-map-it-gta-6.sql", import.meta.url), "utf8");
    await db.exec(gta);
    const robRun = await fs.readFile(new URL("../supabase/migrations/202611190001-map-it-rob-run.sql", import.meta.url), "utf8");
    await db.exec(robRun);
    await db.exec("set role anon");
    for (const game of [null, "", "unknown", "valheim "]) {
      await assert.rejects(db.query("select * from public.map_it_support_start_thread($1,'Tester','Test body',$2)", [token, game]), /choose a valid game/);
    }
    await assert.rejects(db.query("select * from public.map_it_support_start_thread($1,'Tester','Test body')", [token]), /does not exist/);
    const apps = JSON.parse(await fs.readFile(new URL("../src/features/app-library/map-apps.json", import.meta.url), "utf8"));
    for (let i = 0; i < apps.length; i++) {
      const id = `20000000-0000-0000-0000-${String(i).padStart(12,"0")}`;
      const result = await db.query("select * from public.map_it_support_start_thread($1,'Tester','Test body',$2)", [id, apps[i].id]);
      assert.equal(result.rows[0].game_id, apps[i].id);
    }
    const thread = (await db.query("select * from public.map_it_support_start_thread($1,'Tester','Test body','valheim')", [token])).rows[0];
    assert.equal((await db.query("select * from public.map_it_support_list_threads($1)", [token])).rows.length, 1);
    assert.equal((await db.query("select * from public.map_it_support_thread_messages($1,$2)", [otherToken, thread.id])).rows.length, 0);
    await assert.rejects(db.query("select * from public.map_it_support_threads"), /permission denied/);
    await assert.rejects(db.query("select * from public.map_it_support_inbox_threads()"), /permission denied/);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${stranger}';`);
    await assert.rejects(db.query("select * from public.map_it_support_post_message($1,$2,'Intrusion',false)", [otherToken, thread.id]), /no longer exists/);
    assert.equal((await db.query("select * from public.map_it_support_inbox_threads()")).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub='${owner}';`);
    assert.equal((await db.query("select public.map_it_support_claim_threads($1) as count", [token])).rows[0].count, 1);
    assert.equal((await db.query("select * from public.map_it_support_list_threads($1)", [otherToken])).rows.length, 1);
    await db.exec(`set request.jwt.claim.sub='${stranger}';`);
    assert.equal((await db.query("select * from public.map_it_support_list_threads($1)", [token])).rows.length, 0);
    assert.equal((await db.query("select * from public.map_it_support_thread_messages($1,$2)", [token,thread.id])).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub='${admin}';`);
    assert.equal((await db.query("select public.map_it_is_support_admin() as admin")).rows[0].admin, true);
    assert.equal((await db.query("select * from public.map_it_support_inbox_threads()")).rows.length, apps.length + 1);
    const reply = await db.query("select * from public.map_it_support_post_message($1,$2,'Test response',true)", [otherToken, thread.id]);
    assert.equal(reply.rows[0].sender, "admin");
    await db.exec("reset role; set request.jwt.claim.sub=''; set role anon;");
    assert.equal((await db.query("select * from public.map_it_support_list_threads($1)", [token])).rows.length, 0);
    assert.equal((await db.query("select * from public.map_it_support_thread_messages($1,$2)", [token,thread.id])).rows.length, 0);
  } finally { await db.close(); }
});
