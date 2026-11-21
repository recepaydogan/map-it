import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writePreparedMapModCatalog } from "./prepared-map-mod-catalog.mjs";

test("catalog excludes navigation manifests and still rejects broken map metadata", (context) => {
  const root = mkdtempSync(join(tmpdir(), "pzim-catalog-test-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const modRoot = join(root, "example-mod");
  const mapRoot = join(modRoot, "example-map");
  const navigationRoot = join(modRoot, "navigation");
  mkdirSync(mapRoot, { recursive: true });
  mkdirSync(navigationRoot);
  const manifestPath = join(mapRoot, "manifest.json");
  const manifest = {
    id: "example-mod:example-map",
    sourceFingerprint: "sha256:test",
    generatedAt: "2026-08-31T00:00:00.000Z",
    preparedMod: {
      key: "example-mod",
      modId: "ExampleMod",
      displayName: "Example Mod",
      workshopId: "1234",
      builds: ["42"],
      kind: "add-on",
      mapFolder: "Example Map",
      cells: ["1,2"],
    },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(join(modRoot, "data.json"), "{}");
  writeFileSync(join(navigationRoot, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    encoding: "gzip-cell-region-grid-v1",
    regions: [],
  }));

  const catalog = writePreparedMapModCatalog(root);
  assert.equal(catalog.mods.length, 1);
  assert.equal(catalog.mods[0].dataPath, "example-mod/data.json");
  assert.equal(catalog.mods[0].overlays.length, 1);
  assert.equal(catalog.mods[0].overlays[0].source.basePath, "example-mod/example-map");
  const previousCatalog = readFileSync(join(root, "catalog.json"), "utf8");
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, preparedMod: undefined }));
  assert.throws(() => writePreparedMapModCatalog(root), /has no metadata/);
  assert.equal(readFileSync(join(root, "catalog.json"), "utf8"), previousCatalog);
});
