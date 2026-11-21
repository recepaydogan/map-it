/** Check published battleground positions against their current native tiles. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const maps = [
  { id: "alterac-valley", wdtId: 790112,
    files: ["locations-flight.json", "locations-graveyards.json", "locations-objectives.json"] },
  { id: "arathi-basin", wdtId: 790377, files: ["locations-objectives.json"] },
  { id: "darkspear-islands", wdtId: 7251908, files: ["locations-objectives.json"] },
  { id: "hyjal-crater", wdtId: 7245741, files: ["locations-signs.json"] },
];
const records = [];
const tiles = new Map();
let build;
for (const map of maps) {
  const base = `public/maps/wdt-${map.wdtId}`;
  const metadata = await readJson(`${base}/metadata.json`);
  if (build && build !== metadata.source.build) throw new Error("Battleground tile builds differ.");
  build = metadata.source.build;
  for (const file of map.files) {
    const layer = await readJson(`${base}/${file}`);
    for (const marker of layer.locations) {
      const tileX = Math.floor(marker.x / metadata.tileSize);
      const tileY = Math.floor(marker.y / metadata.tileSize);
      const tileKey = `${tileX},${tileY}`;
      if (!metadata.tileCoverage[0].includes(tileKey)) {
        throw new Error(`Battleground marker ${map.id}:${marker.id} lacks a native tile.`);
      }
      const path = join(root, base, "tiles/0", `tile${tileX}x${tileY}.webp`);
      if (!tiles.has(path)) tiles.set(path, await sharp(path).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true }));
      const { data, info } = tiles.get(path);
      const x = Math.floor(marker.x - tileX * metadata.tileSize);
      const y = Math.floor(marker.y - tileY * metadata.tileSize);
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha === 0) {
        throw new Error(`Battleground marker ${map.id}:${marker.id} is on transparent terrain.`);
      }
      records.push({ mapId: map.id, markerId: marker.id, tileKey, alpha });
    }
  }
}
await writeFile(join(root, "data/client-research/published-battleground-tile-coverage.json"),
  `${JSON.stringify({ source: { product: "wow_classic_beta", build },
    rule: "Every published battleground flight, graveyard, or objective pin must sample an opaque pixel of its current native tile.",
    records }, null, 2)}\n`);
console.log(`Verified ${records.length} battleground pins on opaque native terrain.`);
