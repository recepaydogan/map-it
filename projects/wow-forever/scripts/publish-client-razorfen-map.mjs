/** Verify the complete native Razorfen Kraul terrain before exposing the map. */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/razorfen-graveyard-client-trace.json");
const identities = await readJson("data/client-research/wdt-map-identities.json");
const terrain = await readJson("public/maps/wdt-790640/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const identity = identities.records.find(({ wdtFileDataId }) =>
  wdtFileDataId === terrain.source.wdtFileDataId);
if (trace.source.product !== terrain.source.product
  || trace.source.build !== terrain.source.build
  || identities.source.build !== terrain.source.build
  || trace.map.mapId !== 47 || trace.map.name !== english.map.instanceMaps.razorfenKraul
  || trace.map.wdtFileDataId !== terrain.source.wdtFileDataId
  || identity?.maps.length !== 1 || identity.maps[0].mapId !== 47
  || identity.maps[0].name !== trace.map.name
  || identity.tileCount !== terrain.source.tileCount
  || terrain.source.missingFileDataIds.length
  || terrain.tileCoverage[0].length !== identity.tileCount) {
  throw new Error("Razorfen Kraul map records or native terrain are incomplete.");
}
for (const tile of terrain.tileCoverage[0]) {
  const [x, y] = tile.split(",");
  if (!existsSync(join(root, "public/maps/wdt-790640/tiles/0", `tile${x}x${y}.webp`))) {
    throw new Error(`Missing Razorfen Kraul native tile ${tile}.`);
  }
}
await writeFile(join(root, "data/client-research/published-razorfen-map-evidence.json"),
  `${JSON.stringify({ source: { product: terrain.source.product,
    build: terrain.source.build, mapId: 47, name: trace.map.name,
    mapTable: trace.source.tables.find(({ name }) => name === "Map"),
    wdtFileDataId: terrain.source.wdtFileDataId,
    wdtSha256: terrain.source.wdtSha256 },
  nativeTileCount: identity.tileCount,
  rule: "Exact client Map 47 WDT FileDataID joins to a complete local tile set.",
  caveat: "This selectable terrain map does not establish a graveyard or an exact world entrance." }, null, 2)}\n`);
console.log(`Verified Razorfen Kraul terrain with ${identity.tileCount} native tiles.`);
