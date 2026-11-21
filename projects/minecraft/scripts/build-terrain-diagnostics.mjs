import { build } from "vite";
import { resolve } from "node:path";
import { mkdir, readdir, copyFile } from "node:fs/promises";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// Isolated development verification, never an app release or a production route.
await build({
  configFile: false,
  plugins: [tailwindcss(), react()],
  build: {
    outDir: resolve("node_modules/.cache/terrain-diagnostics"),
    emptyOutDir: false,
    rollupOptions: { input: {
      renderer: resolve("scripts/terrain-renderer-check.html"),
      workers: resolve("scripts/terrain-worker-pool-check.html"),
      biomes: resolve("scripts/biome-worker-check.html"),
      player: resolve("scripts/world-map-player-check.html"),
      structures: resolve("scripts/structure-worker-check.html"),
      knowledge: resolve("scripts/world-knowledge-check.html"),
      builtInKnowledge: resolve("scripts/world-built-in-knowledge-check.html"),
      seedSearch: resolve("scripts/world-seed-search-check.html"),
      structureArtwork: resolve("scripts/structure-artwork-check.html"),
      worldPreview: resolve("scripts/world-preview-check.html"),
      worldGeneratorExport: resolve("scripts/world-generator-export-check.html"),
    } },
  },
});

// Preserve full upstream notices beside any compiled engines in this isolated output.
const licenses = resolve("node_modules/.cache/terrain-diagnostics/licenses");
await mkdir(licenses, { recursive: true });
for (const name of await readdir(resolve("node_modules/.cache/seed-engines"))) {
  if (/^[a-z0-9-]+-license\.txt$/.test(name))
    await copyFile(resolve("node_modules/.cache/seed-engines", name), resolve(licenses, name));
}
