import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const assets = resolve("dist/assets");
const workers = (await readdir(assets)).filter(name => /^biome\.worker-[\w-]+\.js$/.test(name));
if (workers.length !== 1) throw new Error(`Expected one packaged biome worker, found ${workers.length}`);

const worker = await readFile(resolve(assets, workers[0]), "utf8");
if (!worker.includes("biome-relief"))
  throw new Error("Packaged biome worker uses the obsolete single-pass protocol");

console.log(`Verified current biome worker protocol: ${workers[0]}`);
