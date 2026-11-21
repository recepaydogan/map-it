import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GAME_BIOME_PREVIEWS, GAME_STRUCTURE_TYPES } from "../src/game-config.ts";
import { createWasmBiomeEngine } from "../src/features/generation/wasm-biome-engine.ts";
import { curatedWorldPicksFor, curatedWorldPreviewPath } from "../src/features/worlds/world-curated-seeds.ts";
import { renderCuratedWorldPreview } from "./curated-preview-image.mjs";

const publicRoot = resolve("public");
await mkdir(resolve(publicRoot, "curated-worlds"), { recursive: true });

for (const config of GAME_BIOME_PREVIEWS) {
  const bytes = new Uint8Array(await readFile(resolve(publicRoot, config.url)));
  const engine = await createWasmBiomeEngine(bytes, { sha256: config.sha256, profiles: config.profiles,
    structures: GAME_STRUCTURE_TYPES.map(type => type.id) });
  try {
    for (const version of config.versions) for (const pick of curatedWorldPicksFor(config.edition, version, config.preset)) {
      const output = resolve(publicRoot, curatedWorldPreviewPath(pick, config.edition, version));
      const image = await renderCuratedWorldPreview(engine, pick, version);
      await writeFile(output, image);
      console.log(`Wrote ${curatedWorldPreviewPath(pick, config.edition, version)} (${image.length} bytes)`);
    }
  } finally { engine.dispose(); }
}
