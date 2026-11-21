import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("game saves enforce account ownership, game isolation and revision collisions", async () => {
  const db = new PGlite();
  const first = "00000000-0000-0000-0000-000000000001";
  const second = "00000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
      grant usage on schema auth, public to authenticated, anon;
      insert into auth.users values ('${first}'),('${second}');`);
    const sql = await fs.readFile(new URL("../supabase/migrations/202611040001-map-it-game-saves.sql", import.meta.url), "utf8");
    await db.exec(sql); await db.exec(sql); // Safe to run setup again.
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${first}';`);
    await db.query("insert into public.map_it_wow_forever_user_saved_state(user_id,state) values($1,$2)", [first, { favorites: ["wow-marker"] }]);
    assert.equal((await db.query("select * from public.map_it_enshrouded_user_saved_state")).rows.length, 0);
    await db.exec(`set request.jwt.claim.sub='${second}';`);
    assert.equal((await db.query("select * from public.map_it_wow_forever_user_saved_state")).rows.length, 0);
    await assert.rejects(db.query("insert into public.map_it_wow_forever_user_saved_state(user_id,state) values($1,$2)", [first, {}]), /row-level security/);
    await db.exec(`set request.jwt.claim.sub='${first}';`);
    const initial = (await db.query("select * from public.map_it_elden_ring_user_save(null,$1)", [{ found: ["first"] }])).rows[0];
    assert.equal(Number(initial.rev), 1);
    const updated = (await db.query("select * from public.map_it_elden_ring_user_save(1,$1)", [{ found: ["second"] }])).rows[0];
    assert.equal(Number(updated.rev), 2);
    const collision = (await db.query("select * from public.map_it_elden_ring_user_save(1,$1)", [{ found: ["stale"] }])).rows[0];
    assert.equal(Number(collision.rev), 2); assert.deepEqual(collision.state, { found: ["second"] });
    const progress = (await db.query("select * from public.map_it_minecraft_user_progress_save(null,$1)", [{ v: 1, worlds: [] }])).rows[0];
    assert.equal(Number(progress.rev), 1);
    await db.query("select * from public.map_it_minecraft_user_journey_progress_save($1,null,$2)", ["world-a", { v: 1, points: [] }]);
    await db.query("select * from public.map_it_minecraft_user_journey_progress_save($1,null,$2)", ["world-b", { v: 1, points: [] }]);
    assert.equal((await db.query("select * from public.map_it_minecraft_user_journey_progress")).rows.length, 2);
    await db.exec(`set request.jwt.claim.sub='${second}';`);
    assert.equal((await db.query("select * from public.map_it_minecraft_user_journey_progress")).rows.length, 0);
    await db.exec("reset role; set role anon;");
    await assert.rejects(db.query("select * from public.map_it_wow_forever_user_saved_state"), /permission denied/);
    await assert.rejects(db.query("select * from public.map_it_elden_ring_user_save(null,$1)", [{}]), /permission denied/);
  } finally { await db.close(); }
});
