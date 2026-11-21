import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { GAME_CONFIG } from "./src/game-config";

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
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "app-document-title",
      transformIndexHtml(html) {
        return html.replace(/<title>[^<]*<\/title>/, `<title>${GAME_CONFIG.appName}</title>`);
      },
    },
  ],
});
