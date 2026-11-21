import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { worldCheckCategories, worldCheckTargetKind } from "./lib/world-check-presentation.mjs";
import { labelByCandidateKind, publicCategoryByCandidateKind } from "./lib/placement-presentation.mjs";

// This refresh only changes presentation metadata in existing records. It never
// regenerates story destinations, positions, relationships or marker identities.
const root = path.resolve(import.meta.dirname, "..");
const write = process.argv.includes("--write");
assert(process.argv.slice(2).every((arg) => arg === "--write"), "Usage: refresh-world-check-presentation.mjs [--write]");
const pending = [];
const changes = [];
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const update = (file, original, value) => {
  if (!isDeepStrictEqual(original, value)) pending.push([file, `${JSON.stringify(value, null, 2)}\n`]);
};
for (const map of fs.readdirSync(path.join(root, "public/maps"))) {
  const contentPath = path.join(root, "public/maps", map, "content.json");
  const locationsPath = path.join(root, "public/maps", map, "locations.json");
  const placementPath = path.join(root, "map-sources/catalog", `${map}-placements.json`);
  if (![contentPath, locationsPath, placementPath].every((file) => fs.existsSync(file))) continue;
  const originalContent = read(contentPath), originalLocations = read(locationsPath), originalPlacement = read(placementPath);
  const content = structuredClone(originalContent), locations = structuredClone(originalLocations), placement = structuredClone(originalPlacement);
  const entities = new Map(Object.values(content.entities).map((entity) => [entity.id, entity]));
  const points = new Map(locations.locations.map((point) => [point.contentId, point]));
  for (const candidate of placement.candidates) {
    const entity = entities.get(candidate.id), point = points.get(candidate.id);
    if (!entity || !point) continue;
    const oldKind = candidate.candidateKind;
    const kind = worldCheckTargetKind(candidate);
    if (candidate.worldChecks) {
      assert(entity.worldChecks, `${map}:${candidate.id}: missing public checks`);
      assert.deepEqual(candidate.worldChecks.checks, entity.worldChecks.checks, `${map}:${candidate.id}: stale check data`);
      const categories = worldCheckCategories(candidate.worldChecks.checks);
      candidate.worldChecks.categories = categories;
      entity.worldChecks.categories = categories;
      if (point.categoryFacets) point.categoryFacets = point.categoryFacets.filter((facet) => facet !== "secret" || categories.includes("secret"));
    }
    candidate.candidateKind = kind;
    if (kind !== oldKind) {
      assert.equal(entity.kind, oldKind, `${map}:${candidate.id}: inconsistent kind`);
      entity.kind = kind;
      entity.tags = entity.tags.map((tag) => tag === oldKind ? kind : tag);
      point.subtype = kind;
      changes.push({ map, id: candidate.id, title: entity.title, from: oldKind, to: kind });
    }
    if (kind !== oldKind || kind === "secret" || kind === "point-of-interest") {
      point.category = publicCategoryByCandidateKind[kind];
      point.label = labelByCandidateKind[kind];
    }
  }
  // Assert conservation outside the explicitly allowed presentation fields.
  const strip = (value) => JSON.parse(JSON.stringify(value, (key, entry) =>
    ["candidateKind", "kind", "category", "categoryFacets", "categories", "label", "subtype", "tags"].includes(key) ? undefined : entry));
  assert.deepEqual(strip(content), strip(originalContent), `${map}: content changed beyond presentation`);
  assert.deepEqual(strip(locations), strip(originalLocations), `${map}: locations changed beyond presentation`);
  assert.deepEqual(strip(placement), strip(originalPlacement), `${map}: source records changed beyond presentation`);
  update(contentPath, originalContent, content);
  update(locationsPath, originalLocations, locations);
  update(placementPath, originalPlacement, placement);
}
console.log(JSON.stringify({ write, files: pending.length, reclassified: changes.length, changes }, null, 2));
if (write) for (const [file, value] of pending) fs.writeFileSync(file, value);
