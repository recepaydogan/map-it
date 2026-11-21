import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const dungeonImage = "maps/dungeons/the-deadmines-1.webp";
const dungeonGuide = "data/dungeons/boss-guides.json";

async function loadContentUrls(contentBase) {
  const { outputFiles } = await build({
    stdin: {
      contents: 'export * from "./src/lib/content-url"; export { DEFAULT_CONTENT_BASE_URL, DEFAULT_DUNGEON_CONTENT_BASE_URL } from "./src/game-config";',
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, platform: "node", format: "esm",
    define: { "import.meta.env": JSON.stringify({ VITE_CONTENT_BASE_URL: contentBase, BASE_URL: "/" }) },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
}

test("the general CDN pin passed by OPK builds still uses the separate dungeon release", async () => {
  const defaults = await loadContentUrls();
  const { contentUrl, DEFAULT_CONTENT_BASE_URL, DEFAULT_DUNGEON_CONTENT_BASE_URL } =
    await loadContentUrls(defaults.DEFAULT_CONTENT_BASE_URL);

  assert.equal(contentUrl(dungeonImage), `${DEFAULT_DUNGEON_CONTENT_BASE_URL}/${dungeonImage}`);
  assert.equal(contentUrl(dungeonGuide), `${DEFAULT_DUNGEON_CONTENT_BASE_URL}/${dungeonGuide}`);
  assert.equal(contentUrl("maps/world-atlas/metadata.json"), `${DEFAULT_CONTENT_BASE_URL}/maps/world-atlas/metadata.json`);
});

test("custom content releases and local builds still use their own dungeon assets", async () => {
  const customBase = "https://cdn.example/releases/custom";
  const [custom, local] = await Promise.all([loadContentUrls(customBase), loadContentUrls("")]);

  assert.equal(custom.contentUrl(dungeonImage), `${customBase}/${dungeonImage}`);
  assert.equal(local.contentUrl(dungeonImage), `/${dungeonImage}`);
});
