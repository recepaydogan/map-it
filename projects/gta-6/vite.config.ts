import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";
import { createReleaseContentPlan, isRemoteContent } from "./scripts/release-content.mjs";
import { copyBundledPublic, verifyPublishedPlan } from "./scripts/content-public.mjs";

const root = __dirname;
const cdnDevelopmentContent = (baseUrl: string): Plugin => ({
  name: "cdn-development-content",
  configureServer(server) {
    const releasePath = resolve(root, "content-release.json");
    const releaseChanged = (file: string) => {
      if (resolve(file) === releasePath) void server.restart();
    };
    server.watcher.add(releasePath);
    server.watcher.on("change", releaseChanged);
    server.httpServer?.once("close", () => server.watcher.off("change", releaseChanged));
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (!isRemoteContent(url.pathname.replace(/^\/+/, ""))) { next(); return; }
      response.statusCode = 307;
      response.setHeader("Location", `${baseUrl}${url.pathname}${url.search}`);
      response.setHeader("Cache-Control", "no-store");
      response.end();
    });
  },
});

export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  const development = command === "serve";
  const release = JSON.parse(await readFile(resolve(root, "content-release.json"), "utf8")) as { baseUrl: string };
  const pinned = !release.baseUrl ? null : development
    ? JSON.parse(await readFile(resolve(root, "content-release.json"), "utf8")) as { baseUrl: string }
    : await verifyPublishedPlan(mode === "cdn" ? null : await createReleaseContentPlan(), loadEnv(mode, root, ""));
  return {
    publicDir: development ? resolve(root, "public") : false,
    optimizeDeps: { entries: ["index.html", "background.html", "uninstall.html"] },
    server: { watch: { ignored: ["**/artifacts/**", "**/dist/**", "**/.dev-build/**"] } },
    ...(pinned ? { define: { "import.meta.env.VITE_CONTENT_BASE_URL": JSON.stringify(pinned.baseUrl) } } : {}),
    build: {
      // Overwolf holds the native DLL open while watch rebuilds the app.
      emptyOutDir: !process.argv.includes("--watch"),
      copyPublicDir: false,
      rollupOptions: { input: {
        main: resolve(root, "index.html"), background: resolve(root, "background.html"), uninstall: resolve(root, "uninstall.html"),
      } },
    },
    plugins: [react(), tailwindcss(), ...(pinned ? [cdnDevelopmentContent(pinned.baseUrl)] : []), {
      name: "bundled-app-public",
      async writeBundle(options) {
        if (!options.dir) throw new Error("App build requires an output directory.");
        await copyBundledPublic(resolve(options.dir));
      },
    }],
  };
});
