import { readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { MAP_BUNDLED_ASSET_DIRS } from "./src/features/map/map-registry";

const bundledMapAssets = new Set<string>(MAP_BUNDLED_ASSET_DIRS);

const keepBundledMapAssets = (): Plugin => {
  let outputMapsDirectory = "";
  return {
    name: "keep-bundled-map-assets",
    apply: "build",
    configResolved(config) {
      const root = resolve(config.root);
      const output = resolve(root, config.build.outDir);
      if (!output.startsWith(`${root}${sep}`)) {
        throw new Error("Map asset cleanup requires a build directory inside the project.");
      }
      outputMapsDirectory = join(output, "maps");
    },
    async closeBundle() {
      const entries = await readdir(outputMapsDirectory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      for (const entry of entries) {
        if (entry.isDirectory() && !bundledMapAssets.has(entry.name)) {
          await rm(join(outputMapsDirectory, entry.name), { recursive: true, force: true });
        }
      }
    },
  };
};

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "background.html"),
        // Headless page Overwolf runs during uninstall (data.uninstall_window).
        uninstall: resolve(__dirname, "uninstall.html"),
      },
    },
  },
  plugins: [react(), tailwindcss(), keepBundledMapAssets()],
});
