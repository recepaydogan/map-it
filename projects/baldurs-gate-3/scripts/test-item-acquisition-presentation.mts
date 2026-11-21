import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  presentItemAcquisitions,
  uniqueAcquisitionLocations,
} from "../src/features/items/item-acquisition-presentation.ts";
import type { ItemAcquisition, ItemAcquisitionKind } from "../src/features/items/types.ts";

const acquisition = (
  id: string,
  sourceId: string,
  kind: ItemAcquisitionKind,
  mapId: string,
  locationId: string,
): ItemAcquisition => ({
  id,
  sourceId,
  kind,
  certainty: "guaranteed",
  source: "Source",
  localizedSources: { en: "Source" },
  mapId,
  mapName: mapId,
  locationId,
  region: mapId,
});

const alternativeLocations = [
  acquisition("drop-a", "character-a", "drop", "map-a", "location-a"),
  acquisition("drop-b", "character-a", "drop", "map-b", "location-b"),
  acquisition("pick-a", "character-a", "pickpocket", "map-a", "location-a"),
  acquisition("pick-b", "character-a", "pickpocket", "map-b", "location-b"),
];
const combined = presentItemAcquisitions(alternativeLocations);
assert.equal(combined.length, 1);
assert.equal(combined[0].kind, "carried");
assert.deepEqual(combined[0].methods, ["drop", "pickpocket"]);
assert.equal(uniqueAcquisitionLocations(combined[0].acquisitions).length, 2);

const carriedDuplicate = presentItemAcquisitions([
  acquisition("drop", "character-a", "drop", "map-a", "location-a"),
  acquisition("pickpocket", "character-a", "pickpocket", "map-a", "location-a"),
  acquisition("carried", "character-a", "carried", "map-a", "location-a"),
]);
assert.equal(carriedDuplicate.length, 1, "The same inventory owner must only be presented once.");
assert.deepEqual(carriedDuplicate[0].methods, ["drop", "pickpocket"]);

const sameDisplayName = presentItemAcquisitions([
  acquisition("first", "character-a", "drop", "map-a", "location-a"),
  acquisition("second", "character-b", "drop", "map-a", "location-a"),
]);
assert.equal(sameDisplayName.length, 2, "Distinct source identities must not merge by display name.");

const catalog = JSON.parse(fs.readFileSync(
  path.resolve(import.meta.dirname, "../public/data/item-database.json"),
  "utf8",
));
const detectThoughtsScroll = catalog.items.find(({ statsId }: { statsId: string }) =>
  statsId === "OBJ_Scroll_DetectThoughts");
const detectThoughtsSources = presentItemAcquisitions(detectThoughtsScroll.acquisitions);
assert.equal(detectThoughtsSources.length, 2);
const shadowheart = detectThoughtsSources.find(({ methods }) => methods.length === 2);
assert.deepEqual(shadowheart?.methods, ["drop", "pickpocket"]);
assert.equal(uniqueAcquisitionLocations(shadowheart?.acquisitions ?? []).length, 4);
assert.deepEqual(
  detectThoughtsSources.find(({ kind }) => kind === "container")?.acquisitions.map(({ source }) => source),
  ["Stacks of Scrolls"],
);

console.log("Item acquisition presentation: source methods and locations verified.");
