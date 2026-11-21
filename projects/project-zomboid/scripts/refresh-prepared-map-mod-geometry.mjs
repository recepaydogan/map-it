import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { writePreparedMapModCatalog } from "./prepared-map-mod-catalog.mjs";

const root = resolve(process.argv.find((argument) => argument.startsWith("--root="))?.slice(7)
  || ".runtime-data/map-data/knox-country/isometric-mods");
let refreshed = 0;

for (const modEntry of readdirSync(root, { withFileTypes: true })) {
  if (!modEntry.isDirectory()) continue;
  const modRoot = join(root, modEntry.name);
  for (const mapEntry of readdirSync(modRoot, { withFileTypes: true })) {
    if (!mapEntry.isDirectory()) continue;
    const manifestPath = join(modRoot, mapEntry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const scale = 2 ** (manifest.mapInfo.skip ?? 0);
    const physicalFloor = manifest.floors[0];
    if (!physicalFloor) throw new Error(`${manifestPath} has no floor geometry.`);
    manifest.mapInfo = {
      ...manifest.mapInfo,
      w: physicalFloor.width * scale,
      h: physicalFloor.height * scale,
      scale,
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    refreshed += 1;
  }
}

writePreparedMapModCatalog(root);
console.log(`Refreshed ${refreshed} prepared map manifests.`);
