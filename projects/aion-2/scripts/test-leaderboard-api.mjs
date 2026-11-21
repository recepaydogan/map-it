import assert from "node:assert/strict";
import { build } from "esbuild";

const entry = (id, rank) => ({
  rank, region: "eu", server_id: 1001, character_id: id,
  name: id, server_name: "Siel", class_name: "Ranger", level: 45,
  gear_score: 2000 - rank, combat_power: 100000,
  profile_image_url: null, checked_at: "2026-10-14T00:00:00.000Z",
});
let current = [entry("first", 1), entry("second", 2)];
let requests = 0;
globalThis.mockSupabaseClient = {
  auth: { getSession: async () => ({
    data: { session: { user: { id: "account-1" }, access_token: "test-token" } }, error: null,
  }) },
};
globalThis.fetch = async (input) => {
  requests += 1;
  const url = new URL(input);
  return Response.json(url.searchParams.get("mine") === "1"
    ? { entries: current }
    : { entries: current, total: current.length, syncing: false });
};

const result = await build({
  entryPoints: ["src/features/leaderboard/leaderboard-api.ts"],
  bundle: true, write: false, platform: "node", format: "esm",
  define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://supabase.example") },
  plugins: [{ name: "leaderboard-dependencies", setup(bundler) {
    bundler.onResolve({ filter: /supabase-client$/ }, () => ({ path: "supabase-client", namespace: "stub" }));
    bundler.onResolve({ filter: /game-config$/ }, () => ({ path: "game-config", namespace: "stub" }));
    bundler.onLoad({ filter: /supabase-client/, namespace: "stub" }, () => ({
      contents: "export const getSupabaseClient = () => globalThis.mockSupabaseClient;",
    }));
    bundler.onLoad({ filter: /game-config/, namespace: "stub" }, () => ({
      contents: 'export const CHARACTER_PROFILE_CONFIG = { regions: ["eu"] };',
    }));
  } }],
});
const { loadLeaderboardPage, loadMyLeaderboardEntries } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const filters = { region: null, serverId: null, query: "" };
const signal = new AbortController().signal;
assert.deepEqual((await loadLeaderboardPage({ ...filters, offset: 0 }, signal)).entries.map((value) => value.characterId),
  ["first", "second"]);
assert.deepEqual((await loadMyLeaderboardEntries(filters, "account-1", signal)).map((value) => value.characterId),
  ["first", "second"]);

current = [entry("second", 1)];
assert.deepEqual((await loadLeaderboardPage({ ...filters, offset: 0 }, signal)).entries.map((value) => value.characterId),
  ["second"], "The public board must not reuse a page containing an unlinked character.");
assert.deepEqual((await loadMyLeaderboardEntries(filters, "account-1", signal)).map((value) => value.characterId),
  ["second"], "The personal board must not restore an unlinked character from a cache.");
assert.equal(requests, 4, "Each new load must read the current server response.");

console.log("Leaderboard page and personal entry freshness tests passed.");
