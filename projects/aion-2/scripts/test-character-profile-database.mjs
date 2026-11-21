import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const one = async (sql, args = []) => (await rows(sql, args))[0];
const migrate = async (name) => db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const a = "aaaaaaaaaaaaaaaaaaaa";
const b = "bbbbbbbbbbbbbbbbbbbb";
const c = "cccccccccccccccccccc";
const link = (id, account = user) => db.query(`insert into public.user_characters
  (user_id, region, server_id, character_id, name, server_name, profile_snapshot)
  values ($1, 'eu', 1001, $2, 'Test', 'Server', '{"forgedScore":999999}')`, [account, id]);
const claim = (id) => one("select * from public.claim_character_profile_job($1, $2, $3)",
  id ? ["eu", 1001, id] : [null, null, null]);
const releaseCooldown = () => db.exec("update public.character_profile_worker set next_request_at = now() - interval '1 second'");
const info = (score) => ({ profile: { characterName: "Test", serverName: "Server", className: "Ranger", characterLevel: 45, combatPower: score * 10 }, stat: { statList: [{ type: "ItemLevel", value: score }] } });
const equipment = { equipment: { equipmentList: [] }, skill: { skillList: [] }, petwing: {} };
const snapshot = (score) => ({ profile: info(score).profile, stats: info(score).stat.statList, equipment: [] });
const save = (token, score = 3000) => one("select public.complete_character_profile_job($1, $2, $3, $4, $5) as saved", [
  token, info(score), equipment, snapshot(score),
  { name: "Test", server_name: "Server", class_name: "Ranger", level: 45, gear_score: score, combat_power: score * 10, profile_image_url: null },
]);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth to authenticated;
    create table public.user_saved_data (user_id uuid, data jsonb);
    insert into auth.users values ('${user}'), ('${other}');
  `);
  for (const name of [
    "202610050001-create-user-characters", "202610050002-add-character-profile-snapshots",
    "202610100001-create-character-leaderboard", "202610100002-use-linked-characters-for-leaderboard",
    "202610100003-background-linked-character-backfill", "202610100004-add-personal-leaderboard-entry",
    "202610140001-rank-leaderboard-characters-uniquely",
  ]) await migrate(name);
  await link(a); await link(a, other); await link(b);
  await db.query(`insert into public.character_leaderboard_entries
    (region, server_id, character_id, name, server_name, class_name, level, gear_score, combat_power, checked_at)
    values ('eu', 1001, $1, 'Old', 'Server', 'Ranger', 45, 1000, 10000, now() - interval '2 days')`, [a]);
  await migrate("202610230001-unify-character-profiles");
  assert.equal((await one("select count(*)::integer as n from public.character_profile_jobs")).n, 2, "Shared account links must queue only one character.");
  assert.equal((await one("select public.read_character_profile('eu', 1001, $1) as data", [a])).data, null,
    "Client-written snapshots must never seed the verified store.");
  assert.equal((await one("select * from public.character_leaderboard_page()")).gear_score, 1000, "Old rows survive the additive rollout.");

  const first = await claim(a);
  assert.ok(first.token);
  assert.equal(await claim(b), undefined, "Another character must share the same global upstream limiter.");
  assert.equal(await claim(a), undefined, "Parallel legacy info/equipment calls cannot claim the same profile twice.");
  assert.equal((await save(first.token)).saved, true);
  assert.equal((await save(first.token, 1)).saved, false, "A used lease cannot publish again.");
  const due = await one("select extract(epoch from next_refresh_at - now())::integer as seconds from public.character_profile_jobs where character_id = $1", [a]);
  assert.ok(due.seconds > 10790 && due.seconds <= 10800, "Successful profiles become due after three hours.");
  assert.equal((await one("select * from public.character_leaderboard_page()")).gear_score, 3000);
  await db.query("update public.character_leaderboard_entries set gear_score = 999999 where character_id = $1", [a]);
  assert.equal((await one("select * from public.character_leaderboard_page()")).gear_score, 3000,
    "An old edge function writing only score columns cannot diverge from the shared profile during rollout.");
  for (const row of await rows("select profile_snapshot from public.user_characters where character_id = $1", [a])) {
    assert.deepEqual(row.profile_snapshot, snapshot(3000), "All old account snapshots receive the same verified update.");
  }
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${user}'`);
  await db.query("update public.user_characters set profile_snapshot = '{\"forgedScore\":1}' where character_id = $1", [a]);
  assert.deepEqual((await one("select profile_snapshot from public.user_characters where character_id = $1", [a])).profile_snapshot, snapshot(3000),
    "Legacy writes succeed but cannot overwrite verified data.");
  await assert.rejects(db.query("select public.read_character_profile('eu', 1001, $1)", [a]), /permission denied/);
  await assert.rejects(db.query("select * from public.claim_character_profile_job()"), /permission denied/);
  await db.exec("reset role");
  await releaseCooldown();
  assert.equal(await claim(a), undefined, "Page refreshes cannot bypass the three-hour due time.");
  const failed = await claim(b);
  await db.query("select public.fail_character_profile_job($1, 'upstream-429', 600, true)", [failed.token]);
  assert.equal(await claim(a), undefined);
  assert.ok((await one("select extract(epoch from next_request_at - now()) as seconds from public.character_profile_worker")).seconds > 590,
    "Retry-After pauses all upstream requests.");
  assert.equal((await one("select * from public.character_profile_jobs where character_id = $1", [b])).failures, 1);

  await releaseCooldown();
  await link(c);
  const crashed = await claim(c);
  await db.exec("update public.character_profile_worker set lease_until = now() - interval '1 second'; update public.character_profile_jobs set lease_until = now() - interval '1 second' where lease_token is not null");
  const recovered = await claim(c);
  assert.notEqual(recovered.token, crashed.token);
  assert.equal((await save(crashed.token)).saved, false, "An expired worker cannot overwrite its replacement.");
  await save(recovered.token, 3000);

  await migrate("202610230002-character-profile-compatibility-view");
  assert.equal((await one("select relkind from pg_class where oid = 'public.character_leaderboard_entries'::regclass")).relkind, "v");
  assert.equal((await one("select relkind from pg_class where oid = 'public.character_profiles'::regclass")).relkind, "r");
  assert.equal((await rows("select * from public.character_leaderboard_page()")).length, 2);
  await releaseCooldown();
  await db.query("update public.character_profile_jobs set next_refresh_at = now() where character_id = $1", [a]);
  await save((await claim(a)).token, 3500);
  const after = await one("select public.read_character_profile('eu', 1001, $1) as data", [a]);
  assert.equal(after.data.info.stat.statList[0].value, 3500, "Publication still works after the table becomes a compatibility view.");
  assert.equal((await one("select * from public.character_leaderboard_page()")).gear_score, 3500);
  assert.deepEqual((await rows("select * from public.character_leaderboard_my_entry($1)", [other])).map((r) => r.character_id), [a]);
  assert.deepEqual(await rows("select * from public.claim_character_leaderboard_refresh()"), []);
  assert.deepEqual(await rows("select * from public.claim_character_leaderboard_seed()"), []);
  await db.query("delete from public.user_characters where user_id = $1 and character_id = $2", [user, a]);
  assert.equal((await rows("select * from public.character_leaderboard_page()")).length, 2, "Another account's link keeps the character ranked.");
  await db.query("delete from public.user_characters where character_id = $1", [a]);
  assert.deepEqual((await rows("select * from public.character_leaderboard_page()")).map((r) => r.character_id), [c]);
  await releaseCooldown();
  await db.exec("update public.character_profile_jobs set next_refresh_at = now()");
  const next = await claim();
  assert.notEqual(next.character_id, a, "Unlinked characters must not consume scheduled refreshes.");
  await save(next.token, 0);
  assert.equal((await one("select public.read_character_profile('eu',1001,$1) as data", [next.character_id])).data.info.stat.statList[0].value, 0);
  assert.equal((await rows("select * from public.character_leaderboard_page()")).some((r) => r.character_id === next.character_id), false,
    "A zero-score profile stays viewable without appearing in the ranking.");
  console.log("Profile SQL integration passed: migration, shared identity, leases, pacing, 3h cadence, retry, old writes, ranking, unlink, and permissions.");
} finally { await db.close(); }
