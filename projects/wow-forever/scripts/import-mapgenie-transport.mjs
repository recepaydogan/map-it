import { readFile, writeFile } from "node:fs/promises";
import { projectMapgenieAtlas } from "./lib/project-mapgenie-atlas.mjs";

const sourceUrl = "https://mapgenie.io/api/v1/maps/1027/data";
const sourcePath = "data/client-research/mapgenie-transport-source.json";
const locationsPath = "public/maps/world-atlas/locations-mapgenie-transport.json";
const localePath = "src/i18n/locales/en.json";
const categoryId = 27642;
const expectedCount = 28;

if (process.argv.includes("--refresh")) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`MapGenie request failed: ${response.status}`);
  const data = await response.json();
  const locations = data.locations.filter((location) => location.category_id === categoryId)
    .map(({ id, title, description, latitude, longitude }) => ({
      id, title, description, latitude, longitude,
    }));
  if (locations.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} transport records; received ${locations.length}.`);
  }
  await writeFile(sourcePath, `${JSON.stringify({ sourceUrl, mapId: 1027, categoryId,
    retrievedAt: new Date().toISOString(), locations }, null, 2)}\n`);
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (source.mapId !== 1027 || source.categoryId !== categoryId || source.locations.length !== expectedCount) {
  throw new Error("Unexpected MapGenie transport source snapshot.");
}

const byId = new Map(source.locations.map((record) => [record.id, record]));
if (byId.size !== expectedCount) throw new Error("Duplicate MapGenie transport ID.");
const labels = {};
const locations = source.locations.map((record) => {
  const title = record.title?.trim();
  const kind = /^(Boat|Zeppelin|Tram) to /.exec(title ?? "")?.[1]?.toLowerCase();
  const destination = /^\*\*Destination:\*\* \[([^\]]+)\]\(https:\/\/mapgenie\.io\/world-of-warcraft-forever\/maps\/azeroth\?locationIds=(\d+)(?:#L)?\)$/.exec(record.description ?? "");
  if (!kind || !destination) throw new Error(`Unexpected transport entry ${record.id}.`);
  const destinationId = Number(destination[2]);
  if (!byId.has(destinationId) || destinationId === record.id) {
    throw new Error(`Missing transport destination ${destinationId} for ${record.id}.`);
  }
  const point = projectMapgenieAtlas(Number(record.latitude), Number(record.longitude));
  labels[record.id] = { name: title, destination: destination[1] };
  return {
    id: `mapgenie-transport-${record.id}`,
    name: "",
    nameKey: `map.mapgenieTransport.${record.id}.name`,
    category: "transport",
    label: "",
    subtype: kind,
    regionId: "",
    region: "",
    ...(point.continent === "zephras" ? { regionKey: "map.zephrasIsle" } : {}),
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
    linkedMarkerGroups: [{ titleKey: "map.transportStops.routeStops", links: [{
      mapId: "azeroth",
      markerId: `mapgenie-transport-${destinationId}`,
      nameKey: `map.mapgenieTransport.${record.id}.destination`,
    }] }],
  };
});

const locale = JSON.parse(await readFile(localePath, "utf8"));
locale.map.mapgenieTransport = labels;
await writeFile(locationsPath, `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(localePath, `${JSON.stringify(locale, null, 2)}\n`);
console.log(`Imported ${locations.length} MapGenie transport stops with destination links.`);
