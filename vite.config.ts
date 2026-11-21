import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";
import { createReleaseContentPlan, isRemoteContent } from "./scripts/release-content.mjs";
import { copyBundledPublic, verifyPublishedPlan } from "./scripts/content-public.mjs";
import { rewriteModuleAccounts } from "./scripts/module-account-build.mjs";

const root = __dirname;
const previewTypes: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".woff": "font/woff", ".woff2": "font/woff2", ".wasm": "application/wasm",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
};
const modifiedAt = async (file: string) => {
  try {
    return (await stat(file)).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
};

const moduleAccountsDevelopment = (): Plugin => ({
  name: "shared-module-accounts",
  async configureServer(server) {
    const publicRoot = resolve(root, "public");
    const previewRoot = resolve(root, ".dev-cache/apps-preview");
    const importedRoot = resolve(publicRoot, "apps");
    const library = JSON.parse(await readFile(resolve(publicRoot, "app-library.json"), "utf8")) as { id: string; entry: string }[];
    const entries = new Map(library.map(({ id, entry }) => [id, entry]));
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url || "/", "http://localhost").pathname;
      if (request.method !== "GET" || !pathname.startsWith("/apps/")) return next();
      const relative = decodeURIComponent(pathname.slice("/apps/".length));
      const type = previewTypes[extname(relative)];
      if (!type) return next();
      const preview = resolve(previewRoot, relative);
      if (!preview.startsWith(previewRoot + sep)) return next();
      const imported = resolve(importedRoot, relative);
      if (!imported.startsWith(importedRoot + sep)) return next();
      const [appId, fileGroup] = relative.split("/");
      const entry = entries.get(appId);
      if (!entry) return next();
      try {
        let bytes: Buffer | null = null;
        if (fileGroup === "assets" || relative.endsWith(".html")) {
          // Entry pages are written after the bundles. Compare entry pages so all
          // requests for an app use the same build and a stale preview never wins.
          const [previewTime, importedTime] = await Promise.all([
            modifiedAt(resolve(previewRoot, appId, entry)),
            modifiedAt(resolve(importedRoot, appId, entry)),
          ]);
          if (previewTime > importedTime) {
            bytes = await readFile(preview).catch(error => {
              if (error.code === "ENOENT") return null;
              throw error;
            });
          }
        }
        if (!bytes && /\.(?:html|js)$/.test(relative)) bytes = await readFile(imported);
        if (!bytes) return next();
        response.setHeader("Content-Type", type);
        response.setHeader("Cache-Control", "no-store");
        response.end(rewriteModuleAccounts(pathname.slice(1), bytes));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return next();
        next(error);
      }
    });
  },
});
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
    server: { watch: { ignored: ["**/artifacts/**", "**/dist/**", "**/.dev-build/**", "**/.dev-cache/**", "**/.release-dist/**", "**/.sync-cache/**", "**/.content-cache/**", "**/projects/**"] } },
    ...(pinned ? { define: { "import.meta.env.VITE_CONTENT_BASE_URL": JSON.stringify(pinned.baseUrl) } } : {}),
    build: {
      // Overwolf holds the native DLL open while watch rebuilds the app.
      emptyOutDir: !process.argv.includes("--watch"),
      copyPublicDir: false,
      rollupOptions: { input: {
        main: resolve(root, "index.html"), background: resolve(root, "background.html"), uninstall: resolve(root, "uninstall.html"),
      } },
    },
    plugins: [react(), tailwindcss(), ...(development ? [moduleAccountsDevelopment()] : []), ...(pinned ? [cdnDevelopmentContent(pinned.baseUrl)] : []), {
      name: "bundled-app-public",
      async writeBundle(options) {
        if (!options.dir) throw new Error("App build requires an output directory.");
        await copyBundledPublic(resolve(options.dir));
      },
    }],
  };
});
