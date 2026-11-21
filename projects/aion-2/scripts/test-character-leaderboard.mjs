import assert from "node:assert/strict";
import { build } from "esbuild";

const id = "aaaaaaaaaaaaaaaaaaaa";
const identity = { region: "eu", serverId: 1001, characterId: id };
const info = {
  profile: { characterName: "Test", serverName: "Server", className: "Ranger", characterLevel: 45, combatPower: 221338 },
  stat: { statList: [{ type: "ItemLevel", value: 3086 }] }, ranking: {}, title: {}, daevanion: {},
};
const equipment = { equipment: {}, skill: {}, petwing: {} };
const state = { profiles: new Map(), entries: new Map(), linked: new Set([id]),
  claims: [], busy: false, official: [], failures: [], pauses: [], failStatus: 0, invalidEquipment: false };
let clock = Date.now();
const realNow = Date.now;
const realTimeout = globalThis.setTimeout;
Date.now = () => clock;
globalThis.setTimeout = (callback, delay) => { state.pauses.push(delay); clock += delay; queueMicrotask(callback); return 0; };
let handler;
globalThis.Deno = {
  env: { get: (key) => ({ SUPABASE_URL: "https://supabase.example", SUPABASE_SERVICE_ROLE_KEY: "service-key",
    CHARACTER_PROFILE_REFRESH_SECRET: "worker-secret" })[key] },
  serve: (callback) => { handler = callback; },
};
globalThis.fetch = async (url) => {
  const action = new URL(url).pathname.split("/").at(-1);
  state.official.push(action);
  if (state.failStatus) return new Response(null, { status: state.failStatus, headers: { "Retry-After": "600" } });
  return Response.json(action === "info" ? info : state.invalidEquipment ? {} : equipment);
};
const ranked = () => [...state.entries.values()].filter((entry) => state.linked.has(entry.character_id))
  .sort((a, b) => b.gear_score - a.gear_score).map((entry, index) => ({ ...entry, rank: index + 1 }));
const admin = {
  auth: { getUser: async (token) => ({ data: { user: token === "valid-token" ? { id: "account-1" } : null }, error: null }) },
  from: (table) => {
    assert.equal(table, "user_characters");
    const filters = {};
    const query = {
      select: () => query,
      eq: (key, value) => { filters[key] = value; return query; },
      maybeSingle: async () => {
        assert.equal(filters.user_id, "account-1");
        return { data: state.linked.has(filters.character_id) ? { character_id: filters.character_id } : null, error: null };
      },
    };
    return query;
  },
  rpc: async (name, args) => {
    if (name === "read_character_profile") return { data: state.profiles.get(args.p_character_id) ?? null, error: null };
    if (name === "claim_character_profile_job") {
      if (state.busy) return { data: [], error: null };
      const selected = state.claims.findIndex((claim) => !args.p_character_id || claim.character_id === args.p_character_id);
      if (selected < 0) return { data: [], error: null };
      state.busy = state.claims.splice(selected, 1)[0];
      return { data: [state.busy], error: null };
    }
    if (name === "complete_character_profile_job") {
      assert.equal(args.p_token, state.busy.token);
      const checkedAt = new Date(clock).toISOString();
      state.profiles.set(state.busy.character_id, { info: args.p_info, equipment: args.p_equipment, snapshot: args.p_snapshot, checkedAt });
      state.entries.set(state.busy.character_id, { region: "eu", server_id: 1001, character_id: state.busy.character_id,
        ...args.p_summary, checked_at: checkedAt });
      state.busy = false;
      return { data: true, error: null };
    }
    if (name === "fail_character_profile_job") {
      state.failures.push(args); state.busy = false;
      return { data: null, error: null };
    }
    if (name === "character_leaderboard_seed_remaining") return { data: false, error: null };
    if (name === "character_leaderboard_page") return { data: ranked().map((entry) => ({ ...entry, total: ranked().length })), error: null };
    if (name === "character_leaderboard_my_entry") {
      assert.equal(args.p_user_id, "account-1");
      return { data: ranked(), error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  },
};
globalThis.__profileClient = admin;
const compile = async (entry) => {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "supabase-stub", setup(bundler) {
      bundler.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({ path: "stub", namespace: "stub" }));
      bundler.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const createClient = () => globalThis.__profileClient;" }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
};
const enqueue = (characterId = id) => state.claims.push({ region: "eu", server_id: 1001, character_id: characterId, token: characterId });
try {
  const shared = await compile("supabase/functions/_shared/character-profiles.ts");
  assert.equal(shared.retryAfterSeconds("600"), 600);
  assert.equal(shared.retryAfterSeconds("bad"), 60);
  assert.equal(shared.retryAfterSeconds(new Date(clock + 300000).toUTCString(), clock), 300);
  await compile("supabase/functions/character-profile/index.ts");
  const profileHandler = handler;
  const url = (action) => `https://supabase.example/functions/v1/character-profile/${action}?region=eu&serverId=1001&characterId=${id}`;
  enqueue();
  const [oldInfo, oldEquipment] = await Promise.all([profileHandler(new Request(url("info"))), profileHandler(new Request(url("equipment")))]);
  assert.equal(oldInfo.status, 200); assert.equal(oldEquipment.status, 200);
  assert.deepEqual(await oldInfo.json(), info); assert.deepEqual(await oldEquipment.json(), equipment);
  assert.deepEqual(state.official, ["info", "equipment"], "Concurrent old clients must share one complete upstream refresh.");
  assert.ok(state.pauses.includes(2000), "The two official requests must be spaced apart.");
  const stored = await (await profileHandler(new Request(url("snapshot")))).json();
  assert.equal(stored.stats[0].value, 3086);
  assert.equal(stored.profile.combatPower, 221338);
  const noFetchCount = state.official.length;
  await profileHandler(new Request(url("info") + `&_t=${clock}`));
  assert.equal(state.official.length, noFetchCount, "Legacy cache-busting parameters must not bypass the shared server cache.");

  await compile("supabase/functions/character-leaderboard/index.ts");
  const leaderboard = handler;
  const endpoint = "https://supabase.example/functions/v1/character-leaderboard";
  const board = await (await leaderboard(new Request(endpoint))).json();
  assert.equal(board.entries[0].gear_score, stored.stats[0].value);
  assert.equal(board.entries[0].combat_power, stored.profile.combatPower);
  assert.equal(board.entries[0].checked_at, state.profiles.get(id).checkedAt);
  assert.equal(state.official.length, noFetchCount, "Leaderboard views cannot issue official profile requests.");
  assert.equal((await leaderboard(new Request(endpoint + "?mine=1"))).status, 401);
  const mine = await (await leaderboard(new Request(endpoint + "?mine=1", { headers: { Authorization: "Bearer valid-token" } }))).json();
  assert.equal(mine.entries[0].rank, 1);
  const refresh = (body, token) => leaderboard(new Request(endpoint + "/refresh", { method: "POST", body: JSON.stringify(body),
    headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  assert.equal((await refresh(identity)).status, 401);
  assert.equal((await refresh(identity, "bad-token")).status, 401);
  assert.equal((await refresh({ ...identity, characterId: "bbbbbbbbbbbbbbbbbbbb" }, "valid-token")).status, 403);
  assert.deepEqual(await (await refresh({ ...identity, gearScore: 999999, userId: "forged" }, "valid-token")).json(), { updated: true });
  assert.equal(state.official.length, noFetchCount, "Old My Characters refresh must reuse the profile instead of fetching a separate score.");
  assert.equal(state.entries.get(id).gear_score, 3086);
  state.linked.delete(id);
  assert.deepEqual((await (await leaderboard(new Request(endpoint))).json()).entries, []);
  state.linked.add(id);

  enqueue(); state.invalidEquipment = true;
  const log = console.error; console.error = () => {};
  try { await assert.rejects(shared.refreshNextProfile(admin), /Incomplete official profile/); }
  finally { console.error = log; }
  assert.equal(state.profiles.get(id).snapshot.stats[0].value, 3086, "Partial upstream failures retain the entire previous profile and rank.");
  assert.equal(state.failures.at(-1).p_pause_all, false);
  state.invalidEquipment = false;
  enqueue(); state.failStatus = 429;
  await assert.rejects(shared.refreshNextProfile(admin), /429/);
  assert.equal(state.failures.at(-1).p_retry_after, 600);
  assert.equal(state.failures.at(-1).p_pause_all, true);
  state.failStatus = 0;

  await compile("supabase/functions/character-profile-refresh/index.ts");
  const worker = handler;
  assert.equal((await worker(new Request(endpoint, { method: "POST" }))).status, 401);
  assert.equal((await worker(new Request(endpoint))).status, 405);
  enqueue("bbbbbbbbbbbbbbbbbbbb");
  const response = await worker(new Request(endpoint, { method: "POST", headers: { Authorization: "Bearer worker-secret" } }));
  assert.deepEqual(await response.json(), { refreshed: 1, unavailable: 0 }, "A scheduled worker must refresh without a leaderboard visitor.");
  console.log("Shared profile HTTP tests passed: old endpoints, old refresh/auth, one fetch, same scores, partial failure, 429, and scheduled worker.");
} finally {
  Date.now = realNow; globalThis.setTimeout = realTimeout;
}
