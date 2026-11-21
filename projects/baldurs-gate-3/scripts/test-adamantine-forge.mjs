import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "adamantine-forge.json"), "utf8"));
const mapsRoot = path.join(projectRoot, "public", "maps");
const mapped = new Map();

assert.equal(fs.existsSync(path.join(mapsRoot, "adamantine-forge")), false,
  "Adamantine Forge must be part of Grymforge, not a separate public map.");
const grymforgeContent = JSON.parse(fs.readFileSync(path.join(mapsRoot, "grymforge", "content.json"), "utf8"));
const grymforgeEntities = new Map(grymforgeContent.entities.map((entity) => [entity.id, entity]));
const grymforgeLocations = new Set(JSON.parse(
  fs.readFileSync(path.join(mapsRoot, "grymforge", "locations.json"), "utf8"),
).locations.map(({ contentId }) => contentId));

assert.equal(catalog.stats.recipes, 6);
assert.equal(catalog.stats.moldTemplates, 6);
assert.equal(catalog.stats.mithralVeins, 2);
assert.equal(new Set(catalog.recipes.map(({ resultTemplateId }) => resultTemplateId)).size, 6);
assert.equal(new Set(catalog.recipes.map(({ moldTemplateId }) => moldTemplateId)).size, 6);

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  for (const entity of Object.values(content.entities ?? {})) {
    if (entity.adamantineForge) mapped.set(entity.id, { mapId: directory.name, entity });
  }
}

const forgeAnchor = mapped.get(catalog.mapAnchor.objectId);
assert.ok(forgeAnchor, "The exact Ancient Forge waypoint anchor must be mapped.");
assert.equal(forgeAnchor.mapId, "grymforge");
assert.equal(forgeAnchor.entity.adamantineForge.role, "forge");
assert.equal(forgeAnchor.entity.adamantineForge.recipes.length, 6);
assert.ok(forgeAnchor.entity.adamantineForge.recipes.every(({ gameplay }) => gameplay));

for (const [id, title] of [
  ["2a5997fc-5f2a-4a13-b309-bed16da3b255", "Grym"],
  ["1c47b089-3e59-41ca-a300-47dfd941b5a0", "Lava Elemental"],
  ["de2ea5a9-943a-4794-9ef7-208be7747178", "Sentient Amulet"],
  [catalog.forge.objectId, "Crucible"],
  [catalog.forgeAnchor.objectId, "Lava Valve"],
  [catalog.moldChamber.objectId, "Mould Chamber"],
]) {
  assert.ok(grymforgeEntities.has(id), `${title} must have Grymforge content.`);
  assert.ok(grymforgeLocations.has(id), `${title} must have a Grymforge marker.`);
}

const mappedMolds = [...mapped.values()].filter(({ entity }) => entity.adamantineForge.role === "mold");
assert.equal(mappedMolds.length, 5);
assert.ok(mappedMolds.every(({ mapId }) => mapId === "grymforge"));
for (const { entity } of mappedMolds) assert.equal(entity.adamantineForge.recipes.length, 1);
const shieldMouldContainer = [...grymforgeEntities.values()].find((entity) => entity.containerLoot?.items
  .some(({ statsId }) => statsId === "UNI_LOOT_AdamantineForge_ShieldMold"));
assert.ok(shieldMouldContainer, "The sixth mould must resolve through its exact skeleton container.");
assert.ok(grymforgeLocations.has(shieldMouldContainer.id));

const mappedVeins = [...mapped.values()].filter(({ entity }) => entity.adamantineForge.role === "ore");
assert.equal(mappedVeins.length, 2, "Both exact veins must be mapped on the unified Grymforge raster.");
assert.ok(mappedVeins.every(({ mapId }) => mapId === "grymforge"));

console.log("Adamantine Forge: 6 exact recipes, all 6 mould sources, and 2 Mithral Veins on Grymforge verified.");
