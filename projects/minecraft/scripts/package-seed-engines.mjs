import { readFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { GAME_BIOME_PREVIEWS, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

// Package only reviewed pinned binaries and complete notices, never the portable compiler or source caches.
await mkdir("public/seed-engines", { recursive: true });
for (const config of GAME_BIOME_PREVIEWS) {
  const base = `node_modules/.cache/seed-engines/${config.edition}`;
  let bytes;
  try { bytes = await readFile(`${base}.wasm`); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    // A copied app can build from already-packaged, hash-pinned assets without downloading a compiler.
    const packaged = await readFile(`public/${config.url}`), license = await readFile(`public/seed-engines/${config.edition}-license.txt`);
    if (packaged.length !== config.bytes || sha256(packaged) !== config.sha256 || sha256(license) !== config.licenseSha256)
      throw new Error(`Packaged seed engine integrity mismatch: ${config.edition}`);
    console.log(`Verified packaged ${config.edition} engine and notice; research cache not required.`); continue;
  }
  const manifest = JSON.parse(await readFile(`${base}.json`, "utf8"));
  if (bytes.length !== config.bytes || sha256(bytes) !== config.sha256 ||
    manifest.revision !== config.revision || JSON.stringify(manifest.profiles) !== JSON.stringify(config.profiles) ||
    JSON.stringify(manifest.structureTypes) !== JSON.stringify(GAME_STRUCTURE_TYPES.map(type => type.id)))
    throw new Error(`Unreviewed seed engine artifact: ${config.edition}`);
  const license = await readFile(`${base}-license.txt`);
  if (sha256(license) !== config.licenseSha256) throw new Error("Missing or changed engine license notice");
  await copyFile(`${base}.wasm`, `public/${config.url}`);
  await copyFile(`${base}-license.txt`, `public/seed-engines/${config.edition}-license.txt`);
  console.log(`Packaged pinned ${config.edition} biome engine (${bytes.length} bytes) and full notice.`);
}
