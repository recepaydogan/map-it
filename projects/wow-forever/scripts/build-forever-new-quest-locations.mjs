/** Create one yellow quest pin for each giver/quest pair in the Forever-new map. */
import { readFile, writeFile } from "node:fs/promises";

const input = JSON.parse(await readFile("public/maps/world-atlas/locations-forever-new-quest-givers.json", "utf8"));
const questLocations = input.locations.flatMap((giver) => giver.questOffers.map((offer) => ({
  id: `forever-new-quest-${offer.id}-${giver.id}`,
  name: offer.name,
  category: giver.subtype === "dungeon-quest-giver" ? "dungeon-quest"
    : giver.subtype === "repeatable-quest-giver" ? "repeatable-quest" : "quest",
  label: "",
  subtype: "forever-new-quest",
  x: giver.x,
  y: giver.y,
  regionId: giver.regionId,
  region: giver.region,
  referenceCoordinates: giver.referenceCoordinates,
  questInfo: giver.questInfo,
  questId: offer.id,
  questLevel: offer.level,
  questGiverMarkerId: giver.id,
  questGiverName: giver.name,
})));

if (input.locations.length !== 170 || questLocations.length !== 394
  || new Set(questLocations.map((point) => point.questId)).size !== 386
  || new Set(questLocations.map((point) => point.id)).size !== questLocations.length
  || questLocations.some((point) => !["quest", "dungeon-quest", "repeatable-quest"].includes(point.category))) {
  throw new Error("Review changed Forever-new quest locations before publishing.");
}

await writeFile("public/maps/world-atlas/locations-forever-new-quests.json",
  `${JSON.stringify({ version: 1, projection: input.projection, locations: questLocations }, null, 2)}\n`);
console.log(`Created ${questLocations.length} linked quest pins for 386 quests.`);
