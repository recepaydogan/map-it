import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const config = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "map-sources", "config", "placement-maps.json"),
  "utf8",
));
const heightBoundMaps = config.maps.filter((map) =>
  Number.isFinite(map.minHeight) || Number.isFinite(map.maxHeight));

for (const map of heightBoundMaps) {
  const forcedObjectIds = new Set((map.forcedObjectIds ?? [])
    .map((id) => id.toLocaleLowerCase("en-US")));
  const content = JSON.parse(fs.readFileSync(
    path.join(projectRoot, "public", "maps", map.id, "content.json"),
    "utf8",
  ));
  for (const entity of content.entities ?? []) {
    const height = entity.worldPosition?.y;
    assert.equal(Number.isFinite(height), true, `${map.id}:${entity.id} has an extracted height`);
    const forced = forcedObjectIds.has(entity.id.toLocaleLowerCase("en-US"));
    if (!forced && Number.isFinite(map.minHeight)) {
      assert.ok(height >= map.minHeight, `${map.id}:${entity.id} is above the minimum height`);
    }
    if (!forced && Number.isFinite(map.maxHeight)) {
      assert.ok(height <= map.maxHeight, `${map.id}:${entity.id} is below the maximum height`);
    }
    if (map.excludeNamePattern) {
      assert.equal(
        new RegExp(map.excludeNamePattern, "i").test(entity.internalName ?? ""),
        false,
        `${map.id}:${entity.id} matches its curated exclusion pattern`,
      );
    }
  }
  for (const [id, kind] of Object.entries(map.candidateKindOverrides ?? {})) {
    const entity = content.entities?.find((candidate) =>
      candidate.id.toLocaleLowerCase("en-US") === id.toLocaleLowerCase("en-US"));
    assert.ok(entity, `${map.id}:${id} is retained by its candidate override`);
    assert.equal(entity.kind, kind, `${map.id}:${id} uses its curated candidate kind`);
  }
  for (const [id, titles] of Object.entries(map.candidateTitleOverrides ?? {})) {
    const entity = content.entities?.find((candidate) =>
      candidate.id.toLocaleLowerCase("en-US") === id.toLocaleLowerCase("en-US"));
    assert.ok(entity, `${map.id}:${id} is retained by its title override`);
    assert.equal(entity.localizedTitles?.en, titles.en, `${map.id}:${id} uses its curated English title`);
    if (titles.tr) {
      assert.equal(entity.localizedTitles?.tr, titles.tr, `${map.id}:${id} uses its curated Turkish title`);
    }
    assert.equal(entity.confidence?.identity, "curated-exact-id", `${map.id}:${id} exposes its title source`);
  }
}

console.log(`Placement height tests passed for ${heightBoundMaps.length} maps.`);
