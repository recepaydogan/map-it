import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "shar-entrance-puzzle.json"), "utf8"));
const mapIds = readRegisteredMapIds(fs.readFileSync(path.join(projectRoot, "src/features/map/map-registry.ts"), "utf8"));
const contents = mapIds.map((id) => JSON.parse(fs.readFileSync(path.join(projectRoot, "public/maps", id, "content.json"), "utf8")));
const profiles = contents.flatMap((content) => Object.values(content.entities).filter(({ sharEntrancePuzzle }) => sharEntrancePuzzle));
const expectedIds = [...catalog.braziers.map(({ brazier }) => brazier.objectId), catalog.centralSwitch.objectId,
  catalog.results.removesArcaneLockFrom.objectId, catalog.results.unlocksAndOpens.objectId];
assert.deepEqual(profiles.map(({ id }) => id).sort(), expectedIds.sort(),
  "Every source puzzle object must remain published exactly once across native floors");

assert.deepEqual(catalog.stats, { braziers: 8, corners: 4, lightDetectors: 16, barrierRings: 2, fireTrapPoints: 10 });
assert.equal(profiles.length, 11);
assert.equal(profiles.filter(({ sharEntrancePuzzle }) => sharEntrancePuzzle.role === "brazier").length, 8);
const northEastBrazier = profiles.find(({ id }) => id === "ce619660-f7f1-4dbc-9210-2f54fe67c836");
assert.equal(northEastBrazier.title, "Mystic Thurible");
assert.equal(northEastBrazier.localizedTitles.tr, "Mistik Tütsülük");
assert.equal(northEastBrazier.sharEntrancePuzzle.corner, "NE");
const central = profiles.find(({ sharEntrancePuzzle }) => sharEntrancePuzzle.role === "central-switch");
assert.ok(central, "The exact central ring switch must be mapped.");
assert.equal(central.id, catalog.centralSwitch.objectId);
assert.equal(central.sharEntrancePuzzle.results.length, 2);
assert.equal(profiles.filter(({ sharEntrancePuzzle }) => sharEntrancePuzzle.role === "result-door").length, 2);
assert.equal(central.sharEntrancePuzzle.hazards.ringPushbackDelayMs, 4000);
assert.equal(central.sharEntrancePuzzle.hazards.fireFloodTimer, 24000);

const links = contents.flatMap((content) => content.relationships).filter(({ kind, fromId }) => kind === "controls" && fromId === central.id);
assert.equal(links.length, 2);
for (const result of central.sharEntrancePuzzle.results) assert.ok(links.some(({ toId }) => toId === result.contentId));
const index = JSON.parse(fs.readFileSync(path.join(projectRoot, "public/maps/index.json"), "utf8"));
for (const id of expectedIds) assert.equal(index.locations.filter(({ contentId }) => contentId === id).length, 1,
  "Each puzzle endpoint must remain searchable after moving to its native floor");

console.log("Shar entrance puzzle: 8 braziers, 2 ring barriers, central switch, hazards, and both result doors verified.");
