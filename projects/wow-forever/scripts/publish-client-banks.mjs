/** Publish bank buildings identified by placed client WMO groups or bank sets. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/bank-wmo-group-trace.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
if (trace.source.build !== atlas.source.build) {
  throw new Error("The bank models and published atlas have different client builds.");
}

const specs = [
  { mapId: 0, model: 112803, uniqueId: 69547231,
    doodadSet: "set_GoblinBank", key: "powderfusePort",
    regionKey: "map.bankRegions.powderfusePort" },
  { mapId: 1, model: 112803, uniqueId: 357333,
    doodadSet: "set_GoblinBank", key: "gadgetzan",
    regionKey: "map.publishedSettlements.789" },
  { mapId: 0, model: 7116370, uniqueId: 65105198,
    group: 14, groupName: "bankinterior", key: "dalaranWest",
    regionKey: "map.bankRegions.dalaran" },
  { mapId: 0, model: 7116370, uniqueId: 65105198,
    group: 59, groupName: "bankexterior02", key: "dalaranEast",
    regionKey: "map.bankRegions.dalaran" },
  { mapId: 0, model: 7952254, uniqueId: 118213,
    group: 44, groupName: "banknew", key: "bootyBay",
    regionKey: "map.publishedSettlements.40" },
  { mapId: 0, model: 7801267, uniqueId: 7706,
    group: 40, groupName: "interior", district: "Vault of Ironforge",
    key: "ironforge", regionKey: "map.publishedSettlements.8" },
  { mapId: 0, model: 7962574, uniqueId: 10047,
    group: 85, groupName: "banklobby", district: "Trade District",
    key: "stormwindTrade", regionKey: "map.publishedSettlements.16" },
  { mapId: 0, model: 7962574, uniqueId: 10047,
    group: 215, groupName: "banklobby01", district: "Dwarven District",
    key: "stormwindDwarven", regionKey: "map.publishedSettlements.16" },
  { mapId: 1, model: 107917, uniqueId: 254174,
    group: 1, groupName: "bank", key: "ratchet",
    regionKey: "map.publishedSettlements.39" },
  { mapId: 1, model: 7964229, uniqueId: 165042,
    group: 131, groupName: "bank_int", district: "Valley of Strength",
    key: "orgrimmar", regionKey: "map.publishedSettlements.33" },
];

const locations = [];
const evidence = [];
for (const spec of specs) {
  const placement = trace.placements.find(({ mapId, fileDataId, uniqueId }) =>
    mapId === spec.mapId && fileDataId === spec.model
    && uniqueId === spec.uniqueId);
  if (!placement || english.map?.banks?.[spec.key] === undefined) {
    throw new Error(`Missing bank WMO placement or display name: ${spec.key}`);
  }
  if (typeof spec.regionKey.split(".").reduce((value, key) => value?.[key], english)
    !== "string") {
    throw new Error(`Missing bank region name: ${spec.regionKey}`);
  }
  const group = spec.group === undefined ? null
    : placement.groups.find(({ index }) => index === spec.group);
  if (spec.doodadSet && placement.selectedDoodadSet !== spec.doodadSet) {
    throw new Error(`${spec.key} does not select the bank-specific doodad set.`);
  }
  if (spec.group !== undefined
    && (!group || group.names[0] !== spec.groupName
      || (spec.district && group.names[1] !== spec.district))) {
    throw new Error(`${spec.key} does not have the expected bank group.`);
  }
  const { x, y } = group?.atlasPosition ?? placement.atlasPosition;
  const layer = atlas.terrainLayers.find(({ source }) =>
    source?.mapId === spec.mapId);
  if (!layer) throw new Error(`Missing terrain layer for ${spec.key}.`);
  const tileX = Math.floor((x - layer.originX) / layer.scaleX / layer.tileSize);
  const tileY = Math.floor((y - layer.originY) / layer.scaleY / layer.tileSize);
  if (!layer.tileCoverage[0].includes(`${tileX},${tileY}`)) {
    throw new Error(`${spec.key} projects outside published native terrain.`);
  }
  const id = `client-bank-wmo-${spec.mapId}-${spec.uniqueId}-${spec.group ?? "set"}`;
  locations.push({ id, name: "", nameKey: `map.banks.${spec.key}`,
    category: "bank", label: "", subtype: "bank-building",
    regionId: "", region: "", regionKey: spec.regionKey, x, y });
  evidence.push({ locationId: id, name: english.map.banks[spec.key],
    mapId: spec.mapId, modelFileDataId: spec.model,
    worldPlacementId: spec.uniqueId, adtFileDataId: placement.adtFileDataId,
    doodadSetIndex: placement.doodadSetIndex,
    selectedDoodadSet: placement.selectedDoodadSet,
    ...(group ? { groupIndex: group.index,
      groupFileDataId: group.groupFileDataId, groupNames: group.names,
      worldPosition: group.worldPosition } : {
      worldPosition: placement.worldPosition }),
    atlasPosition: { x, y }, nativeTile: [tileX, tileY] });
}

await writeFile(join(root, "public/maps/world-atlas/locations-banks.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-bank-evidence.json"),
  `${JSON.stringify({ source: trace.source,
    rule: "Exact placed WMO bank groups are transformed by their ADT orientation, or the placed WMO selects its bank-specific doodad set. Each point lands on covered native terrain. These are bank building locations, not identified banker NPC spawns.",
    markers: evidence }, null, 2)}\n`);
console.log(`Published ${locations.length} bank building locations from client WMO geometry.`);
