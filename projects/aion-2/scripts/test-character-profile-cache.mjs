import assert from "node:assert/strict";
import { build } from "esbuild";

globalThis.window = { location: { href: "http://localhost:5173/" } };
let requestCount = 0;
globalThis.fetch = async (url) => {
  requestCount += 1;
  assert.equal(new URL(url).pathname.split("/").at(-1), "snapshot");
  const body = {
    profile: { characterName: "Tadas", characterLevel: 45, className: "Ranger", combatPower: 1 },
    stats: [], rankings: [], titles: [], boards: [], equipment: [], skins: [], skills: [], petWing: {},
  };
  return { ok: true, json: async () => body };
};

const compiled = await build({
  entryPoints: ["src/features/character-profiles/character-profile-api.ts"],
  bundle: true, write: false, platform: "node", format: "esm",
  define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://supabase.example") },
  plugins: [{ name: "config-stub", setup(bundler) {
    bundler.onResolve({ filter: /game-config$/ }, () => ({ path: "game-config", namespace: "stub" }));
    bundler.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const CHARACTER_PROFILE_CONFIG = { locale: 'en', regions: ['eu'] };" }));
  } }],
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`;
const { loadCharacterProfile, readCachedCharacterProfile } = await import(moduleUrl);
const character = { characterId: "one", serverId: 1001, region: "eu" };
const signal = new AbortController().signal;

const first = await loadCharacterProfile(character, signal);
assert.equal(requestCount, 1);
assert.equal(readCachedCharacterProfile(character), first);
assert.equal(await loadCharacterProfile(character, signal), first);
assert.equal(requestCount, 1, "Reopening a profile should not request it again.");

const refreshed = await loadCharacterProfile(character, signal, true);
assert.equal(requestCount, 2, "Explicit refresh should request fresh profile data.");
assert.equal(await loadCharacterProfile(character, signal), refreshed);
assert.equal(requestCount, 2);

await loadCharacterProfile({ ...character, characterId: "two" }, signal);
assert.equal(requestCount, 3, "Different character IDs must have separate cache entries.");

const restartedApi = await import(`${moduleUrl}#restart`);
await restartedApi.loadCharacterProfile(character, signal);
assert.equal(requestCount, 4, "A new app session should refresh the official profile once.");

const originalNow = Date.now;
Date.now = () => originalNow() + 60_001;
assert.equal(readCachedCharacterProfile(character), null, "Expired UI caches cannot hide scheduled profile updates.");
await loadCharacterProfile(character, signal);
assert.equal(requestCount, 5);
Date.now = originalNow;
console.log("Character profile atomic fetch and cache expiry tests passed.");
