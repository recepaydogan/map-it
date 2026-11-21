import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "arcane-tower-transport.json"), "utf8"));
const mapIds = readRegisteredMapIds(fs.readFileSync(path.join(projectRoot, "src/features/map/map-registry.ts"), "utf8"));
const contents = mapIds.map((mapId) => ({ mapId,
  content: JSON.parse(fs.readFileSync(path.join(projectRoot, "public/maps", mapId, "content.json"), "utf8")) }));
const appearances = contents.flatMap(({ mapId, content }) => Object.values(content.entities)
  .filter(({ arcaneTowerTransport }) => arcaneTowerTransport).map((entity) => ({ mapId, entity })));
const profiles = appearances.map(({ entity }) => entity);
const expectedIds = [...catalog.routes.map(({ button }) => button.objectId),
  ...catalog.floors.map(({ destination }) => destination.objectId), catalog.generator.objectId, catalog.secretRing.objectId];
assert.deepEqual(profiles.map(({ id }) => id).sort(), expectedIds.sort(),
  "Every source transport endpoint must survive exactly once across the original tower floors");
const mapForLiftFloor = (floor) => floor === -1 ? "arcane-tower-basement" : `arcane-tower-level-${floor + 1}`;
for (const { floor, destination } of catalog.floors) {
  assert.equal(appearances.find(({ entity }) => entity.id === destination.objectId)?.mapId, mapForLiftFloor(floor),
    "The separate basement destination cannot be confused with the generator below lift level zero");
}
for (const { atFloor, button } of catalog.routes) {
  assert.equal(appearances.find(({ entity }) => entity.id === button.objectId)?.mapId, mapForLiftFloor(atFloor));
}
assert.equal(appearances.find(({ entity }) => entity.id === catalog.generator.objectId)?.mapId, "arcane-tower-level-0");

assert.deepEqual(catalog.stats, { floors: 6, routes: 12, hiddenButtons: 2, powerSources: 1 });
assert.equal(profiles.length, 20);
assert.equal(profiles.filter(({ arcaneTowerTransport }) => arcaneTowerTransport.role === "button").length, 12);
assert.equal(profiles.filter(({ arcaneTowerTransport }) => arcaneTowerTransport.role === "destination").length, 6);
assert.equal(profiles.filter(({ arcaneTowerTransport }) => arcaneTowerTransport.role === "generator").length, 1);
assert.equal(profiles.filter(({ arcaneTowerTransport }) => arcaneTowerTransport.role === "secret-ring").length, 1);

const generator = profiles.find(({ arcaneTowerTransport }) => arcaneTowerTransport.role === "generator").arcaneTowerTransport;
assert.equal(generator.powerIngredient, "Sussur Bloom");
assert.equal(generator.blockedArcanaDc, 10);
assert.equal(generator.secretRing.title, "Guiding Light");
assert.equal(generator.routes.length, 12);
assert.deepEqual(generator.routes.filter(({ hidden }) => hidden).map(({ atFloor, toFloor }) => [atFloor, toFloor]), [[0, -1], [4, -1]]);

const buttons = new Set(catalog.routes.map(({ button }) => button.objectId));
const routeLinks = contents.flatMap(({ content }) => content.relationships)
  .filter(({ kind, fromId }) => kind === "teleports-to" && buttons.has(fromId));
assert.equal(routeLinks.length, 12);
for (const route of generator.routes) {
  assert.ok(routeLinks.some(({ fromId, toId }) => fromId === route.buttonContentId && toId === route.destinationContentId));
}

console.log("Arcane Tower transport: 12 exact lift routes, 6 arrivals, power, and hidden Guiding Light buttons verified.");
