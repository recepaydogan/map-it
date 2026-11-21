import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readIsometricOutput } from "./isometric-output.mjs";
import { writePreparedMapModCatalog } from "./prepared-map-mod-catalog.mjs";

const root = resolve(
  process.argv.find((argument) => argument.startsWith("--root="))?.slice("--root=".length)
    || ".runtime-data/map-data/knox-country/isometric-mods",
);

let refreshed = 0;
for (const modEntry of readdirSync(root, { withFileTypes: true })) {
  if (!modEntry.isDirectory()) continue;
  const modRoot = join(root, modEntry.name);
  for (const mapEntry of readdirSync(modRoot, { withFileTypes: true })) {
    if (!mapEntry.isDirectory()) continue;
    const mapRoot = join(modRoot, mapEntry.name);
    const manifestPath = join(mapRoot, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const { floors } = readIsometricOutput(mapRoot);
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, floors }, null, 2)}\n`);
    refreshed += 1;
  }
}

const catalog = writePreparedMapModCatalog(root);
console.log(JSON.stringify({ refreshed, catalogMods: catalog.mods.length }, null, 2));
