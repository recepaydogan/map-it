import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { cdnMapImages } from "./build/cdn-map-images";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const useImageCdn = command === "build" && Boolean(env.VITE_MAP_IMAGE_BASE_URL?.trim());
  return {
    publicDir: useImageCdn ? false : "public",
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          background: resolve(__dirname, "background.html"),
          // Headless page Overwolf runs during uninstall (data.uninstall_window).
          uninstall: resolve(__dirname, "uninstall.html"),
        },
        output: {
          // Keep the map shell responsive on Overwolf's Chromium runtime: large,
          // independently cached services should not delay parsing the app code.
          manualChunks: {
            "vendor-react": ["react", "react-dom"],
            "vendor-i18n": ["i18next", "react-i18next"],
            "vendor-analytics": ["posthog-js"],
            "vendor-icons": ["lucide-react"],
          },
        },
      },
    },
    plugins: [react(), tailwindcss(), ...(useImageCdn ? [cdnMapImages()] : [])],
  };
});
