import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, "app.html"),
        background: resolve(__dirname, "background.html"),
        uninstall: resolve(__dirname, "uninstall.html"),
      },
    },
  },
  plugins: [react(), tailwindcss()],
});
