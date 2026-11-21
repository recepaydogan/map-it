import { readFile, writeFile } from "node:fs/promises";
import { projectMapgenieAtlas } from "./lib/project-mapgenie-atlas.mjs";

const sourcePath = process.argv[2] ?? "all-quests.json";
const locationsPath = "public/maps/world-atlas/locations-quests.json";
const communityPath = "public/maps/world-atlas/locations-mapgenie-community.json";
const npcPath = "public/maps/world-atlas/locations-quest-npcs.json";
const localePath = "src/i18n/locales/en.json";
const searchPath = "public/data/map-search/index.json";

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const community = JSON.parse(await readFile(communityPath, "utf8"));
const npcs = JSON.parse(await readFile(npcPath, "utf8"));
const locale = JSON.parse(await readFile(localePath, "utf8"));
const search = JSON.parse(await readFile(searchPath, "utf8"));
if (!Array.isArray(source) || !Array.isArray(community.locations) || !Array.isArray(npcs.locations)) {
  throw new Error("Invalid quest or map source.");
}

const oldQuests = community.locations.filter((point) => ["quest", "repeatable-quest"].includes(point.category));
const oldIds = new Set(oldQuests.map((point) => point.id));
const records = {};
const locations = [];
const ids = new Set();
const normalize = (value) => value.trim().replace(/\s+/g, " ");
const cleanMarkup = (value) => normalize(value.replace(/\{\{[^}]+\}\}\s*/g, ""));

for (const record of source) {
  if (!Number.isSafeInteger(record.id) || ids.has(record.id)
    || !["quest", "repeatable"].includes(record.type) || !normalize(record.title ?? "")
    || typeof record.rawDescription !== "string") {
    throw new Error(`Invalid or duplicate quest: ${record.id}`);
  }
  ids.add(record.id);
  const profession = /\*\*Required Profession:\*\* ([^\n]+)/.exec(record.rawDescription)?.[1];
  const classText = record.requiredClass ? cleanMarkup(record.requiredClass) : undefined;
  const professionText = profession ? cleanMarkup(profession) : undefined;
  const faction = record.faction || undefined;
  if (faction && !["Alliance", "Horde", "Neutral"].includes(faction)) {
    throw new Error(`Invalid faction for quest ${record.id}.`);
  }
  const category = record.type === "repeatable" ? "repeatable-quest" : "quest";
  const id = `mapgenie-${category}-${record.id}`;
  const point = projectMapgenieAtlas(Number(record.latitude), Number(record.longitude));
  const textKey = `map.questMarkers.${record.id}`;
  records[record.id] = {
    name: normalize(record.title),
    ...(classText ? { requiredClass: classText } : {}),
    ...(professionText ? { requiredProfession: professionText } : {}),
    ...(record.startsAt ? { startsAt: normalize(record.startsAt) } : {}),
    ...(record.endsAt ? { endsAt: normalize(record.endsAt) } : {}),
  };
  locations.push({
    id, name: "", nameKey: `${textKey}.name`, category, label: "", subtype: category,
    regionId: "", region: "",
    ...(point.continent === "zephras" ? { regionKey: "map.zephrasIsle" } : {}),
    x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)),
    questInfo: {
      ...(faction ? { faction } : {}),
      ...(Number.isInteger(record.requiredLevel) ? { requiredLevel: record.requiredLevel } : {}),
      ...(classText ? { requiredClassKey: `${textKey}.requiredClass` } : {}),
      ...(professionText ? { requiredProfessionKey: `${textKey}.requiredProfession` } : {}),
      ...(record.startsAt ? { startsAtKey: `${textKey}.startsAt` } : {}),
      ...(record.endsAt ? { endsAtKey: `${textKey}.endsAt` } : {}),
    },
  });
}

const byId = new Map(locations.map((location) => [location.id, location]));
for (const oldQuest of oldQuests) {
  const replacement = byId.get(oldQuest.id);
  if (!replacement) throw new Error(`Missing replacement for ${oldQuest.id}.`);
}

let replacedNpcs = 0;
for (const npc of npcs.locations) {
  const slug = npc.id.replace(/^reported-quest-npc-/, "");
  const name = locale.map.questNpcs.names[slug];
  if (!name) throw new Error(`Missing quest NPC name: ${slug}`);
  const candidates = source.flatMap((record, index) =>
    record.startsAt === name || record.endsAt === name
      ? [{ record, location: locations[index] }] : []);
  const nearby = candidates.map(({ location }) => ({
    location, distance: Math.hypot(location.x - npc.x, location.y - npc.y),
  })).sort((left, right) => left.distance - right.distance);
  if (!nearby.length || nearby[0].distance > 20) continue;
  const replacement = nearby[0].location;
  replacement.aliasIds = [...(replacement.aliasIds ?? []), npc.id];
  replacement.questNpcDungeonIds = npc.questNpcDungeonIds;
  replacement.questNpcNameKey = npc.nameKey;
  replacedNpcs++;
}

community.locations = community.locations.filter((point) => !oldIds.has(point.id));
const aliases = new Set(locations.flatMap((location) => location.aliasIds ?? []));
const indexed = search.locations.filter(({ point }) => !byId.has(point.id) && !aliases.has(point.id));
for (const location of locations) {
  const title = records[Number(location.id.split("-").at(-1))].name;
  const labelKey = location.category === "quest" ? "quest" : "repeatableQuest";
  indexed.push({ mapId: "azeroth", mapName: "Azeroth", point: {
    ...location, name: title, label: locale.map.categories[labelKey],
    region: location.regionKey ? locale.map.zephrasIsle : "",
  }, count: 1 });
}
indexed.sort((left, right) => left.mapName.localeCompare(right.mapName)
  || left.point.name.localeCompare(right.point.name) || left.point.id.localeCompare(right.point.id));
search.locations = indexed;
search.source.markerCount = indexed.length;
locale.map.questMarkers = records;
await writeFile(locationsPath, `${JSON.stringify({ version: 1, locations }, null, 2)}\n`);
await writeFile(communityPath, `${JSON.stringify(community, null, 2)}\n`);
await writeFile(searchPath, `${JSON.stringify(search, null, 2)}\n`);
await writeFile(localePath, `${JSON.stringify(locale, null, 2)}\n`);
console.log(`Imported ${locations.length} quest markers (${source.filter((record) => record.type === "repeatable").length} repeatable); replaced ${oldQuests.length} old quest pins and ${replacedNpcs} nearby quest NPC pins.`);
