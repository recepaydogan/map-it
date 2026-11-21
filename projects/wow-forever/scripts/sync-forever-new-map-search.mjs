/** Add the published Forever-new map layers to the bundled search catalog. */
import { readFile, writeFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const indexPath = "public/data/map-search/index.json";
const index = await readJson(indexPath);
const gathering = await readJson("public/maps/world-atlas/locations-forever-new-gatherables.json");
const rare = await readJson("public/maps/world-atlas/locations-forever-new-rares.json");
const questGivers = await readJson("public/maps/world-atlas/locations-forever-new-quest-givers.json");
const quests = await readJson("public/maps/world-atlas/locations-forever-new-quests.json");
const english = await readJson("src/i18n/locales/en.json");
if (gathering.locations.length !== 933 || rare.locations.length !== 24
  || questGivers.locations.length !== 170
  || quests.locations.length !== 394
  || new Set(questGivers.locations.flatMap((point) => point.questOffers.map((offer) => offer.id))).size !== 386) {
  throw new Error("Review changed Forever-new pin counts before indexing.");
}
const locations = [...gathering.locations, ...rare.locations, ...questGivers.locations, ...quests.locations];
const newIds = new Set(locations.map((point) => point.id));
const entries = index.locations.filter(({ point }) => !newIds.has(point.id)
  && !point.id.startsWith("reported-rare-")
  && !(point.category === "quest" || point.category === "repeatable-quest"
    || point.category === "npc" && point.subtype === "quest-npc"));
for (const point of locations) {
  const key = point.category.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const label = english.map.categories[key] ?? point.label;
  entries.push({ mapId: "azeroth", mapName: "Azeroth",
    point: { ...point, label },
    ...(point.questOffers ? { names: [point.name, ...point.questOffers.map((offer) => offer.name)] } : {}),
    count: 1 });
}
entries.sort((a, b) => a.mapName.localeCompare(b.mapName)
  || a.point.name.localeCompare(b.point.name) || a.point.id.localeCompare(b.point.id));
await writeFile(indexPath, `${JSON.stringify({ ...index,
  source: { ...index.source, markerCount: entries.length }, locations: entries }, null, 2)}\n`);
console.log(`Indexed ${gathering.locations.length} gatherables, ${rare.locations.length} rare creatures, ${questGivers.locations.length} quest givers, and ${quests.locations.length} quest pins.`);
