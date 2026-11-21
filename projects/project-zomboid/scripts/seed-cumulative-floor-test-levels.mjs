import { copyFile, link, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(".runtime-data/map-data/knox-country/isometric-optimized/global");
const sourceRoot = join(root, "cumulative/layer29_files");
const targetRoot = join(root, "cumulative-reverse/layer29_files");
let linked = 0;

for (let level = 11; level <= 21; level += 1) {
  const sourceLevelRoot = join(sourceRoot, String(level));
  const targetLevelRoot = join(targetRoot, String(level));
  await mkdir(targetLevelRoot, { recursive: true });
  for (const fileName of await readdir(sourceLevelRoot)) {
    const sourcePath = join(sourceLevelRoot, fileName);
    const targetPath = join(targetLevelRoot, fileName);
    try {
      await link(sourcePath, targetPath);
      linked += 1;
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      await copyFile(sourcePath, targetPath);
      linked += 1;
    }
  }
}

console.log(JSON.stringify({ linked }, null, 2));
