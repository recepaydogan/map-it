import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const runtimeMapRoot = resolve(projectRoot, ".runtime-data", "map-data", "knox-country");
const distMapRoot = resolve(projectRoot, "dist", "map-data", "knox-country");
const assetDirectories = [
  { sourceName: "isometric", publicName: "isometric" },
  { sourceName: "isometric-optimized", publicName: "isometric-optimized" },
  { sourceName: "isometric-mods", publicName: "isometric-mods" },
  { sourceName: "isometric-mods", publicName: "isometric-mods-v2" },
];
const preparedModCatalogRoot = join(runtimeMapRoot, "isometric-mods");
const preparedModCatalogPath = join(preparedModCatalogRoot, "catalog.json");
const unlinkOnly = process.argv.includes("--unlink");

const assertWithin = (parent, target, label) => {
  const childPath = relative(parent, target);
  if (childPath.startsWith("..") || resolve(parent, childPath) !== target) {
    throw new Error(`${label} must stay inside ${parent}.`);
  }
};

mkdirSync(distMapRoot, { recursive: true });
if (!unlinkOnly) mkdirSync(preparedModCatalogRoot, { recursive: true });
if (!unlinkOnly && !existsSync(preparedModCatalogPath)) {
  writeFileSync(preparedModCatalogPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    mods: [],
  }, null, 2)}\n`);
}

for (const { sourceName, publicName } of assetDirectories) {
  const source = join(runtimeMapRoot, sourceName);
  const link = join(distMapRoot, publicName);
  assertWithin(runtimeMapRoot, source, "Runtime map source");
  assertWithin(distMapRoot, link, "Runtime map link");

  if (unlinkOnly) {
    if (!existsSync(link)) continue;
    if (!lstatSync(link).isSymbolicLink()) {
      throw new Error(`Refusing to remove non-link runtime map directory: ${link}`);
    }
    rmSync(link, { recursive: true, force: true });
    console.log(`Removed runtime map link: ${link}`);
    continue;
  }

  if (!existsSync(source)) {
    console.log(`Runtime map directory is not available yet: ${source}`);
    continue;
  }

  if (existsSync(link)) {
    const stats = lstatSync(link);
    if (stats.isSymbolicLink()) {
      const currentTarget = realpathSync(resolve(dirname(link), readlinkSync(link)));
      if (currentTarget === realpathSync(source)) {
        console.log(`Runtime map link is ready: ${link}`);
        continue;
      }
    }
    rmSync(link, { recursive: true, force: true });
  }

  symlinkSync(source, link, process.platform === "win32" ? "junction" : "dir");
  console.log(`Linked ${link} -> ${source}`);
}
