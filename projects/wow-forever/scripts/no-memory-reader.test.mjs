import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);

test("the app manifest and public assets contain no native reader", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.json", root), "utf8"));
  assert.deepEqual(manifest.data["extra-objects"] ?? {}, {});
  const plugins = await readdir(new URL("public/plugins/", root)).catch(error => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  assert.deepEqual(plugins.filter(name => /\.dll$/i.test(name)), []);
});

test("the background cannot read process memory while saved-file addon sync is available", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("src/background/background-controller.tsx", root))],
    bundle: true, write: false, metafile: true, packages: "external", platform: "browser", format: "esm",
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.deepEqual(inputs.filter(name => /native\/|forever-position-reader|character-reader-bridge|character-live-sync/.test(name)), []);
  assert.doesNotMatch(result.outputFiles[0].text,
    /ReadProcessMemory|getExtraObject|getCharacterSnapshot|wow-forever-position-reader/);
});
