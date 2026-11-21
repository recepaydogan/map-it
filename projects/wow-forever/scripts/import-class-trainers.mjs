import { readFile, writeFile } from "node:fs/promises";
import { projectMapgenieAtlas } from "./lib/project-mapgenie-atlas.mjs";

const sourcePath = "class-trainers.json";
const locationsPath = "public/maps/world-atlas/locations-class-trainers.json";
const searchPath = "public/data/map-search/index.json";
const localePath = "src/i18n/locales/en.json";

const classIcons = new Map([
  ["Warrior", "warrior"], ["Paladin", "paladin"], ["Hunter", "hunter"],
  ["Rogue", "rogue"], ["Priest", "priest"], ["Shaman", "shaman"],
  ["Mage", "mage"], ["Warlock", "warlock"], ["Druid", "druid"],
  ["Weapon Master", "weapon-master"],
]);
const records = JSON.parse(await readFile(sourcePath, "utf8"));
if (!Array.isArray(records) || !records.length) throw new Error("Class trainers need a nonempty array.");

const localeText = await readFile(localePath, "utf8");
const locale = JSON.parse(localeText);
const labels = {};
const seenIds = new Set();
const locations = records.map((record) => {
  const parsed = /^\*\*Trainer:\*\*\s+(.+?)(?:\s+\((Alliance|Horde)\))?$/.exec(record.description);
  if (!Number.isInteger(record.id) || seenIds.has(record.id)
    || !classIcons.has(record.className) || !record.title?.trim()
    || !record.trainerName?.trim() || !parsed
    || record.trainerName !== parsed[1] || (record.faction ?? undefined) !== parsed[2]) {
    throw new Error(`Unexpected class trainer entry ${record.id}.`);
  }
  seenIds.add(record.id);
  const point = projectMapgenieAtlas(Number(record.latitude), Number(record.longitude));
  labels[record.id] = {
    name: record.trainerName,
    title: record.title.trim(),
    class: record.className,
  };
  return {
    id: `mapgenie-class-trainer-${record.id}`,
    name: "",
    nameKey: `map.classTrainers.${record.id}.name`,
    category: "class-trainer",
    label: "",
    labelKey: `map.classTrainers.${record.id}.title`,
    detailLabelKey: `map.classTrainers.${record.id}.title`,
    trainerTitleKey: `map.classTrainers.${record.id}.title`,
    trainerClassKey: `map.classTrainers.${record.id}.class`,
    ...(record.faction ? { trainerFaction: record.faction } : {}),
    iconPath: `maps/client-icons/class-trainers/${classIcons.get(record.className)}.svg`,
    subtype: "class-trainer",
    regionId: "",
    region: "",
    ...(point.continent === "zephras" ? { regionKey: "map.zephrasIsle" } : {}),
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
  };
});

await writeFile(locationsPath, `${JSON.stringify({ locations }, null, 2)}\n`);
locale.map.classTrainers = labels;
const lineEnding = localeText.includes("\r\n") ? "\r\n" : "\n";
await writeFile(localePath, `${JSON.stringify(locale, null, 2).replace(/\n/g, lineEnding)}${lineEnding}`);

const search = JSON.parse(await readFile(searchPath, "utf8"));
search.locations = search.locations.filter((entry) => entry.mapId !== "azeroth"
  || !entry.point.id.startsWith("mapgenie-class-trainer-"));
search.locations.push(...locations.map((point) => {
  const id = point.id.split("-").at(-1);
  return { mapId: "azeroth", mapName: "Azeroth", point: {
    ...point, name: labels[id].name, label: labels[id].title,
    region: point.regionKey === "map.zephrasIsle" ? "Zephras Isle" : point.region,
  }, count: 1 };
}));
search.locations.sort((a, b) => a.mapName.localeCompare(b.mapName)
  || a.point.name.localeCompare(b.point.name) || a.point.id.localeCompare(b.point.id));
search.source.markerCount = search.locations.length;
await writeFile(searchPath, `${JSON.stringify(search, null, 2)}\n`);
console.log(`Imported ${locations.length} class trainers: `
  + `${locations.filter((location) => location.regionKey === "map.zephrasIsle").length} Zephras, `
  + `${locations.filter((location) => location.x > 20000).length} Eastern Kingdoms, `
  + `${locations.filter((location) => location.x < 20000 && !location.regionKey).length} Kalimdor.`);
