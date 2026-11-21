import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";

test("unavailable translations keep talent data and starter guides usable in English", async () => {
  const result = await build({
    stdin: { contents: `export { loadTalentCatalog } from "./src/features/classes/talent-catalog";
      export { loadStarterGuide, loadStarterGuideIndex } from "./src/features/guides/starter-guide-data";`,
      resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "unavailable-translations", setup(builder) {
      builder.onResolve({ filter: /(?:i18n\/app-language|i18n\/locale-content|lib\/content-url)$/ },
        (args) => ({ path: args.path.split("/").at(-1), namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({ contents:
        path === "app-language" ? `export const useAppLanguage = () => "fr";` :
        path === "content-url" ? `export const contentUrl = path => path;` :
        `export const fetchSupplementalLocalePack = async () => { throw new Error("CDN unavailable"); };`,
      }));
    } }],
  });
  const loaders = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (path) => {
    requested.push(path);
    const data = await readFile(new URL(`../../public/${path}`, import.meta.url), "utf8");
    return new Response(data, { headers: { "Content-Type": "application/json" } });
  };
  try {
    const [talents, index, guide] = await Promise.all([
      loaders.loadTalentCatalog("fr"), loaders.loadStarterGuideIndex("fr"),
      loaders.loadStarterGuide("getting-started", "fr"),
    ]);
    assert.equal(talents.length, 9);
    assert.equal(talents[0].n, "Warrior");
    assert.ok(index.length >= 14);
    assert.equal(guide.id, "getting-started");
    assert.ok(guide.html.length > 1000);
    assert.ok(requested.every((path) => !path.includes("/locales/")));
  } finally { globalThis.fetch = originalFetch; }
});
