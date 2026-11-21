import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { createRuntimeMapDataPlugin } from "./scripts/vite-runtime-map-data";

const projectRoot = __dirname;

export default defineConfig(({ mode }) => ({
  define: {
    __PZIM_PROJECT_ROOT__: JSON.stringify(projectRoot),
    ...(mode === "local-map"
      ? { "import.meta.env.VITE_MAP_DATA_BASE_URL": JSON.stringify("/map-data/knox-country") }
      : {}),
  },
  server: {
    watch: {
      ignored: ["**/.render-cache/**", "**/.runtime-data/**", "**/dist/**"],
    },
  },
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "background.html"),
        // Headless page Overwolf runs during uninstall (data.uninstall_window).
        uninstall: resolve(__dirname, "uninstall.html"),
      },
    },
  },
  plugins: [react(), tailwindcss(), createRuntimeMapDataPlugin(projectRoot)],
}));
