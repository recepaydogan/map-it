import { readFile, writeFile } from "node:fs/promises";
import { projectMapgenieAtlas } from "./lib/project-mapgenie-atlas.mjs";

const sourcePath = "data/client-research/mapgenie-profession-trainers-source.json";
const locationsPath = "public/maps/world-atlas/locations-profession-trainers.json";
const searchPath = "public/data/map-search/index.json";
const localePath = "src/i18n/locales/en.json";
const sourceUrl = "https://mapgenie.io/api/v1/maps/1027/data";
const inputPath = process.argv.find((argument) => argument.startsWith("--input="))?.slice("--input=".length) || sourcePath;

if (process.argv.includes("--refresh")) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`MapGenie request failed: ${response.status}`);
  const data = await response.json();
  const trainers = data.locations.filter((location) => location.category_id === 27628)
    .map(({ id, title, description, latitude, longitude }) => ({
      id, title, description, latitude, longitude,
    }));
  if (trainers.length !== 140) {
    throw new Error(`Expected 140 profession trainers; received ${trainers.length}. Review the source before updating.`);
  }
  await writeFile(sourcePath, `${JSON.stringify({ sourceUrl, mapId: 1027, categoryId: 27628,
    retrievedAt: new Date().toISOString(), locations: trainers }, null, 2)}\n`);
}

const source = JSON.parse(await readFile(inputPath, "utf8"));
const records = Array.isArray(source) ? source : source.locations;
if (!Array.isArray(records) || !records.length || (!Array.isArray(source)
  && (source.mapId !== 1027 || source.categoryId !== 27628))) {
  throw new Error("Unexpected MapGenie profession trainer source snapshot.");
}

const localeText = await readFile(localePath, "utf8");
const locale = JSON.parse(localeText);
const labels = {};
const seenIds = new Set();
const locations = records.map((record) => {
  const parsed = /^\*\*Trainer:\*\*\s+(.+?)(?:\s+\((Alliance|Horde)\))?$/.exec(record.rawDescription ?? record.description);
  const name = record.trainerName ?? parsed?.[1];
  const faction = record.faction ?? parsed?.[2];
  if (!parsed || !Number.isInteger(record.id) || seenIds.has(record.id)
    || (record.category !== undefined && record.category !== "profession")
    || !record.title?.trim() || !name?.trim()
    || name !== parsed[1] || faction !== parsed[2]) {
    throw new Error(`Unexpected profession trainer entry ${record.id}.`);
  }
  seenIds.add(record.id);
  const point = projectMapgenieAtlas(Number(record.latitude), Number(record.longitude));
  labels[record.id] = {
    name,
    title: record.title.trim(),
    role: [record.title.trim(), faction].filter(Boolean).join(" · "),
  };
  return {
    id: `mapgenie-profession-trainer-${record.id}`,
    name: "",
    nameKey: `map.professionTrainers.${record.id}.name`,
    category: "profession-trainer",
    label: "",
    labelKey: `map.professionTrainers.${record.id}.role`,
    detailLabelKey: `map.professionTrainers.${record.id}.role`,
    trainerTitleKey: `map.professionTrainers.${record.id}.title`,
    ...(faction ? { trainerFaction: faction } : {}),
    subtype: "profession-trainer",
    regionId: "",
    region: "",
    ...(point.continent === "zephras" ? { regionKey: "map.zephrasIsle" } : {}),
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
  };
});

await writeFile(locationsPath, `${JSON.stringify({ locations }, null, 2)}\n`);
locale.map.professionTrainers = labels;
const lineEnding = localeText.includes("\r\n") ? "\r\n" : "\n";
await writeFile(localePath, `${JSON.stringify(locale, null, 2).replace(/\n/g, lineEnding)}${lineEnding}`);
const search = JSON.parse(await readFile(searchPath, "utf8"));
search.locations = search.locations.filter((entry) => entry.mapId !== "azeroth"
  || !entry.point.id.startsWith("mapgenie-profession-trainer-"));
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
console.log(`Imported ${locations.length} MapGenie profession trainers: `
  + `${locations.filter((location) => location.regionKey === "map.zephrasIsle").length} Zephras, `
  + `${locations.filter((location) => location.x > 20000).length} Eastern Kingdoms, `
  + `${locations.filter((location) => location.x < 20000 && !location.regionKey).length} Kalimdor.`);
