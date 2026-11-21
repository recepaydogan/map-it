/** Publish only the repair-named places positioned by the installed client. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const audit = await readJson("data/client-research/repair-vendor-client-audit.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
if (audit.source.build !== atlas.source.build) {
  throw new Error("Repair objects and published terrain belong to different builds.");
}
const layer = atlas.terrainLayers.find(({ source }) => source?.mapId === 1);
if (!layer) throw new Error("Kalimdor terrain is missing.");
const byId = new Map(audit.placedRepairObjects.map((object) => [object.objectId, object]));
const groups = [
  { ids: [631221, 631224], key: "west" },
  { ids: [631223, 631225], key: "east" },
];
const locations = [];
const evidence = [];
for (const { ids, key } of groups) {
  const objects = ids.map((id) => byId.get(id));
  if (objects.some((object) => !object || object.name !== "Tent Rugged Repairs"
    || object.mapId !== 1 || object.displayId !== 112219
    || object.modelFileDataId !== 950751)) {
    throw new Error(`Repair tent source records changed: ${ids.join(",")}.`);
  }
  const distance = Math.hypot(...[0, 1].map((axis) =>
    objects[0].worldPosition[axis] - objects[1].worldPosition[axis]));
  if (distance > 4) throw new Error(`Repair tent pair ${key} no longer overlaps.`);
  if (english.map?.repairSites?.[key] !== "Rugged Repairs tent") {
    throw new Error(`Missing repair site name for ${key}.`);
  }
  const { x, y } = objects[0].atlasPosition;
  const tileX = Math.floor((x - layer.originX) / layer.scaleX / layer.tileSize);
  const tileY = Math.floor((y - layer.originY) / layer.scaleY / layer.tileSize);
  if (!layer.tileCoverage[0].includes(`${tileX},${tileY}`)) {
    throw new Error(`Repair tent ${key} is outside native terrain.`);
  }
  const id = `client-repair-tent-${key}`;
  locations.push({ id, name: "", nameKey: `map.repairSites.${key}`,
    category: "repair-site", label: "", subtype: "repair-tent",
    regionId: "", region: "", descriptionKey: "map.repairSites.description", x, y });
  evidence.push({ locationId: id, objectIds: ids,
    worldPositions: objects.map((object) => object.worldPosition),
    displayId: 112219, modelFileDataId: 950751,
    atlasPosition: { x, y }, nativeTile: [tileX, tileY] });
}
const siteDistance = Math.hypot(...[0, 1].map((axis) =>
  byId.get(groups[0].ids[0]).worldPosition[axis]
  - byId.get(groups[1].ids[0]).worldPosition[axis]));
if (siteDistance < 20) throw new Error("Repair tent sites merged unexpectedly.");
await writeFile(join(root, "public/maps/world-atlas/locations-repair-sites.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-repair-site-evidence.json"),
  `${JSON.stringify({ source: audit.source,
    rule: "Four placed repair-named GameObjects form two physical tents. These are named places, not verified repair-vendor NPCs or interactions.",
    markers: evidence }, null, 2)}\n`);
console.log(`Published ${locations.length} repair-named tent locations from ${byId.size} client objects.`);
