import { readFile, writeFile } from "node:fs/promises";
import { projectMapgenieAtlas } from "./lib/project-mapgenie-atlas.mjs";

const sourcePath = "data/client-research/mapgenie-community-markers-source.json";
const locationsPath = "public/maps/world-atlas/locations-mapgenie-community.json";
const instancesPath = "public/maps/world-atlas/locations-instances.json";
const localePath = "src/i18n/locales/en.json";
const sourceUrl = "https://mapgenie.io/api/v1/maps/1027/data";
const categories = [
  { id: 27616, category: "auctioneer", count: 20, actor: "Auctioneer" },
  { id: 27617, category: "banker", count: 17, actor: "Banker" },
  { id: 27618, category: "barber-shop", count: 3 },
  { id: 27622, category: "graveyard", count: 30 },
  { id: 27624, category: "innkeeper", count: 9, actor: "Innkeeper" },
  { id: 27625, category: "dungeon", count: 29 },
  { id: 27627, category: "mailbox", count: 49, actor: "Mailbox" },
  { id: 27631, category: "stable-master", count: 9, actor: "Stable Master" },
  { id: 27634, category: "transmogrifier", count: 2, actor: "Transmogrifier" },
  { id: 27647, category: "repeatable-quest", count: 1 },
  { id: 27648, category: "quest", count: 190 },
  { id: 27653, category: "treasure", count: 1 },
  { id: 27926, category: "merchant", count: 148, actor: "Merchant" },
  { id: 27927, category: "battlemaster", count: 8, actor: "Battlemaster" },
];
const expectedById = new Map(categories.map((category) => [category.id, category]));

if (process.argv.includes("--refresh")) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`MapGenie request failed: ${response.status}`);
  const data = await response.json();
  const locations = data.locations.filter((location) => expectedById.has(location.category_id))
    .map(({ id, category_id, title, description, latitude, longitude }) => ({
      id, category_id, title, description, latitude, longitude,
    }));
  for (const category of categories) {
    const found = locations.filter((location) => location.category_id === category.id).length;
    if (found !== category.count) throw new Error(`Expected ${category.count} ${category.category} records; got ${found}.`);
  }
  await writeFile(sourcePath, `${JSON.stringify({ sourceUrl, mapId: 1027,
    retrievedAt: new Date().toISOString(), locations }, null, 2)}\n`);
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (source.mapId !== 1027 || source.locations.length !== categories.reduce((sum, category) => sum + category.count, 0)) {
  throw new Error("Unexpected MapGenie community marker source snapshot.");
}
for (const category of categories) {
  const found = source.locations.filter((location) => location.category_id === category.id).length;
  if (found !== category.count) throw new Error(`Unexpected ${category.category} source count: ${found}.`);
}

const locale = JSON.parse(await readFile(localePath, "utf8"));
const labels = {};
const locations = [];
const dungeonRecords = [];
for (const record of source.locations) {
  const category = expectedById.get(record.category_id);
  if (!category || !record.title?.trim()) throw new Error(`Invalid source entry ${record.id}.`);
  if (category.category === "dungeon") {
    dungeonRecords.push(record);
    continue;
  }
  // Quest pins are published from the fuller all-quests snapshot.
  if (category.category === "quest" || category.category === "repeatable-quest") continue;

  const point = projectMapgenieAtlas(Number(record.latitude), Number(record.longitude));
  const keys = {};
  let name = record.title.trim();
  let detail;
  let description;
  if (category.actor && record.description) {
    const match = new RegExp(`^\\*\\*${category.actor}:\\*\\*\\s+(.+?)(?:\\s+\\((Alliance|Horde)\\))?$`).exec(record.description.trim());
    if (!match) throw new Error(`Unexpected ${category.category} description at ${record.id}: ${record.description}`);
    if (category.category === "merchant" || category.category === "battlemaster") {
      name = record.title.trim();
      detail = [match[1], match[2]].filter(Boolean).join(" · ");
    } else {
      name = match[1];
      detail = match[2];
    }
  } else if (record.description?.trim()) {
    throw new Error(`Unexpected ${category.category} description at ${record.id}: ${record.description}`);
  }
  keys.name = name;
  if (detail) keys.detail = detail;
  if (description) keys.description = description;
  labels[record.id] = keys;
  locations.push({
    id: `mapgenie-${category.category}-${record.id}`,
    name: "", nameKey: `map.mapgenieCommunity.${record.id}.name`,
    category: category.category,
    label: "", subtype: category.category,
    ...(detail ? { detailLabelKey: `map.mapgenieCommunity.${record.id}.detail` } : {}),
    ...(description ? { descriptionKey: `map.mapgenieCommunity.${record.id}.description` } : {}),
    regionId: "", region: "",
    ...(point.continent === "zephras" ? { regionKey: "map.zephrasIsle" } : {}),
    x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)),
  });
}

const instances = JSON.parse(await readFile(instancesPath, "utf8"));
const resolveLocaleKey = (key) => key.split(".").reduce((value, part) => value?.[part], locale);
const matched = new Set();
for (const record of dungeonRecords) {
  const normalizedName = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const instance = instances.locations.find((entry) => entry.id === `mapgenie-instance-${record.id}`
    || normalizedName(resolveLocaleKey(entry.nameKey) ?? entry.name) === normalizedName(record.title));
  if (!instance || matched.has(instance.id)) throw new Error(`Missing or duplicate existing dungeon: ${record.title} (${record.id}).`);
  matched.add(instance.id);

  const match = /^(?:\{\{(?:dungeon|raid) width=32\}\}\s*)?(\d+)-Man (Dungeon|Raid)(?: \(Level (\d+)-(\d+)\))?$/.exec(record.description ?? "");
  if (!match) throw new Error(`Unexpected dungeon description: ${record.title}: ${record.description}`);
  const [, groupSize, , low, high] = match;
  if (instance.instanceFacts?.groupSize && instance.instanceFacts.groupSize !== Number(groupSize)) {
    throw new Error(`Conflicting client group size for ${record.title}.`);
  }
  instance.instanceFacts = { ...instance.instanceFacts, groupSize: Number(groupSize) };
  const validRange = low && high && Number(low) <= Number(high);
  labels[record.id] = { name: record.title };
  if (validRange) {
    labels[record.id].description = `Suggested levels: ${low}–${high}`;
    instance.descriptionKey = `map.mapgenieCommunity.${record.id}.description`;
  } else {
    delete instance.descriptionKey;
  }
}
if (matched.size !== dungeonRecords.length) throw new Error("Not all MapGenie dungeons were matched.");
for (const instance of instances.locations) {
  if (!matched.has(instance.id) && instance.descriptionKey?.endsWith("PositionNotice")) {
    delete instance.descriptionKey;
  }
}

await writeFile(locationsPath, `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(instancesPath, `${JSON.stringify(instances, null, 2)}\n`);
locale.map.mapgenieCommunity = labels;
await writeFile(localePath, `${JSON.stringify(locale, null, 2)}\n`);
console.log(`Imported ${locations.length} markers and enriched ${matched.size} existing dungeons.`);
