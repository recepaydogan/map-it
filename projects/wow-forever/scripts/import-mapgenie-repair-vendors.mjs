import { readFile, writeFile } from "node:fs/promises";
import { projectMapgenieAtlas } from "./lib/project-mapgenie-atlas.mjs";

const sourcePath = "data/client-research/mapgenie-repair-vendors-source.json";
const locationsPath = "public/maps/world-atlas/locations-repair-vendors.json";
const localePath = "src/i18n/locales/en.json";
const sourceUrl = "https://mapgenie.io/api/v1/maps/1027/data";

if (process.argv.includes("--refresh")) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`MapGenie request failed: ${response.status}`);
  const data = await response.json();
  const repairVendors = data.locations.filter((location) => location.category_id === 27630)
    .map(({ id, title, description, latitude, longitude }) => ({
      id, title, description, latitude, longitude,
    }));
  if (repairVendors.length !== 125) {
    throw new Error(`Expected 125 repair vendors; received ${repairVendors.length}. Review the source before updating.`);
  }
  await writeFile(sourcePath, `${JSON.stringify({ sourceUrl, mapId: 1027, categoryId: 27630,
    retrievedAt: new Date().toISOString(), locations: repairVendors }, null, 2)}\n`);
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (source.mapId !== 1027 || source.categoryId !== 27630 || source.locations.length !== 125) {
  throw new Error("Unexpected MapGenie repair vendor source snapshot.");
}

const locale = JSON.parse(await readFile(localePath, "utf8"));
const names = {};
const locations = source.locations.map((record) => {
  const parsed = /^\*\*Vendor:\*\*\s+(.+?)(?:\s+\((Alliance|Horde)\))?$/.exec(record.description);
  if (!parsed) throw new Error(`Unexpected vendor description for ${record.id}: ${record.description}`);
  const [, name, faction] = parsed;
  const point = projectMapgenieAtlas(Number(record.latitude), Number(record.longitude));
  names[record.id] = name;
  return {
    id: `mapgenie-repair-vendor-${record.id}`,
    name: "",
    nameKey: `map.repairVendors.${record.id}`,
    category: "repair-vendor",
    label: "",
    subtype: "repair-vendor",
    regionId: "",
    region: "",
    ...(point.continent === "zephras" ? { regionKey: "map.zephrasIsle" } : {}),
    ...(faction ? { detailLabelKey: `map.affiliations.${faction.toLowerCase()}` } : {}),
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
  };
});

if (!locations.some((location) => location.nameKey === "map.repairVendors.953753")) {
  throw new Error("Rarc is absent from the repair vendor source.");
}
await writeFile(locationsPath, `${JSON.stringify({ locations }, null, 2)}\n`);
locale.map.repairVendors = names;
await writeFile(localePath, `${JSON.stringify(locale, null, 2)}\n`);
console.log(`Imported ${locations.length} MapGenie repair vendors: `
  + `${locations.filter((location) => location.regionKey === "map.zephrasIsle").length} Zephras, `
  + `${locations.filter((location) => location.x > 20000).length} Eastern Kingdoms, `
  + `${locations.filter((location) => location.x < 20000 && !location.regionKey).length} Kalimdor.`);
console.log("Rarc:", locations.find((location) => location.nameKey === "map.repairVendors.953753"));
