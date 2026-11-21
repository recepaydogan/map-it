import assert from "node:assert/strict";
import { build } from "esbuild";

const configStub = { name: "config-stub", setup(bundler) {
  bundler.onResolve({ filter: /game-config(?:\.ts)?$/ }, () => ({ path: "game-config", namespace: "stub" }));
  bundler.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: `export const CHARACTER_PROFILE_CONFIG = {
    locale: "en-US", regions: ["eu"], searchPageSize: 20,
    searchUrl: "https://official.example/search", serversUrl: "https://official.example/servers",
    profileImageBaseUrl: "https://profileimg.plaync.com",
    detailUrl: "https://official.example/detail",
  };` }));
} };

const compile = async (entryPoint, define = {}) => {
  const result = await build({
    entryPoints: [entryPoint], bundle: true, write: false, platform: "node", format: "esm",
    define, plugins: [configStub, { name: "supabase-stub", setup(bundler) {
      bundler.onResolve({ filter: /^npm:@supabase\/supabase-js@2$/ }, () => ({ path: "supabase-stub", namespace: "stub-db" }));
      bundler.onLoad({ filter: /.*/, namespace: "stub-db" }, () => ({ contents: "export const createClient = () => ({});" }));
    } }],
  });
  return `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
};

const sample = (id) => ({
  characterId: `${id}%3D`, name: `<strong>Alex</strong>${id}`,
  level: 45, pcId: 4, race: 1, serverId: 1001, serverName: "Test server",
});

globalThis.window = { location: { href: "http://localhost:5173/" } };
const clientUrls = [];
globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  clientUrls.push(parsed);
  if (parsed.pathname.endsWith("/servers")) return new Response(JSON.stringify({
    serverList: [{ serverId: 1301, serverName: "Siel" }],
  }));
  const page = Number(parsed.searchParams.get("page"));
  return new Response(JSON.stringify({
    list: [sample(page)], pagination: { page, size: 20, total: 41, endPage: 3 },
  }));
};

const clientUrl = await compile("src/features/character-profiles/character-profile-api.ts", { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://supabase.example") });
const { loadCharacterServers, searchCharacters } = await import(clientUrl);
const { characterProfileImageUrl } = await import(await compile("src/features/character-profiles/character-profile-image-url.ts"));
const signal = new AbortController().signal;
assert.equal(characterProfileImageUrl("/game_profile_images/aion2global/images?gameServerKey=1301&charKey=123"),
  "https://profileimg.plaync.com/game_profile_images/aion2global/images?gameServerKey=1301&charKey=123");
assert.equal(characterProfileImageUrl("https://profileimg.plaync.com/game_profile_images/existing"),
  "https://profileimg.plaync.com/game_profile_images/existing");
assert.equal(characterProfileImageUrl("javascript:alert(1)"), null);
assert.deepEqual(await loadCharacterServers("eu", signal), [{ serverId: 1301, serverName: "Siel" }]);
assert.equal(clientUrls[0].searchParams.get("lang"), "en-US");
const first = await searchCharacters("Alex", "eu", signal);
const second = await searchCharacters("Alex", "eu", signal, 2, 1301);
const last = await searchCharacters("Alex", "eu", signal, 3);
const clientSearchUrls = clientUrls.filter((url) => url.pathname.endsWith("/search"));
assert.deepEqual(clientSearchUrls.map((url) => url.searchParams.get("page")), ["1", "2", "3"]);
assert.ok(clientSearchUrls.every((url) => url.searchParams.get("size") === "20"));
assert.deepEqual(clientSearchUrls.map((url) => url.searchParams.get("serverId")), [null, "1301", null]);
assert.equal(first.results[0].characterId, "1=");
assert.equal(first.results[0].name, "Alex1");
assert.equal(second.results[0].characterId, "2=");
assert.equal(first.total, 41);
assert.equal(second.hasMore, true);
assert.equal(last.hasMore, false);

let handler;
globalThis.Deno = { serve: (callback) => { handler = callback; } };
const upstreamUrls = [];
globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  upstreamUrls.push(parsed);
  if (parsed.pathname.endsWith("/servers")) return new Response(JSON.stringify({
    serverList: [{ serverId: 1301, serverName: "Siel" }],
  }));
  const page = Number(parsed.searchParams.get("page"));
  return new Response(JSON.stringify({
    list: [sample(page)], pagination: { page, size: 20, total: 41, endPage: 3 },
  }));
};
await import(await compile("supabase/functions/character-profile/index.ts"));
const request = (page, serverId = null) => new Request(`http://localhost/functions/v1/character-profile/search?keyword=Alex&region=eu&page=${page}${serverId === null ? "" : `&serverId=${serverId}`}`);
const firstResponse = await handler(request(1));
const secondResponse = await handler(request(2, 1301));
const serversResponse = await handler(new Request("http://localhost/functions/v1/character-profile/servers?region=eu"));
assert.equal(firstResponse.status, 200);
assert.equal(secondResponse.status, 200);
assert.deepEqual((await serversResponse.json()).serverList, [{ serverId: 1301, serverName: "Siel" }]);
assert.notDeepEqual((await firstResponse.json()).list, (await secondResponse.json()).list);
const upstreamSearchUrls = upstreamUrls.filter((url) => url.pathname.endsWith("/search"));
assert.deepEqual(upstreamSearchUrls.map((url) => url.searchParams.get("page")), ["1", "2"]);
assert.ok(upstreamSearchUrls.every((url) => url.searchParams.get("size") === "20"));
assert.equal(upstreamSearchUrls[1].searchParams.get("serverId"), "1301");
assert.equal(upstreamUrls[2].searchParams.get("region"), "eu");
assert.equal((await handler(request(0))).status, 400);
assert.equal((await handler(request(1001))).status, 400);
assert.equal((await handler(request(1, "invalid"))).status, 400);
assert.equal(upstreamUrls.length, 3, "Invalid search filters must not reach the official API.");

console.log("Character search filtering and pagination tests passed.");
