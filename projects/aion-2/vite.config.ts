import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import posthog from "@posthog/rollup-plugin";
import react from "@vitejs/plugin-react";
import type { OutputOptions } from "rollup";
import { defineConfig, loadEnv } from "vite";
import { createReleaseContentPlan } from "./scripts/release-content.mjs";
import { releaseContentBaseUrl } from "./scripts/upload-release-content.mjs";
import { CHARACTER_PROFILE_CONFIG } from "./src/game-config";
import { copyBuildPublic } from "./scripts/copy-build-public";

const root = __dirname;
const publicRoot = resolve(root, "public");
const appPublicRoot = resolve(root, ".vite-public");

export default defineConfig(async ({ command, mode }) => {
  if (command === "serve") {
    const searchUrl = new URL(CHARACTER_PROFILE_CONFIG.searchUrl);
    const serversUrl = new URL(CHARACTER_PROFILE_CONFIG.serversUrl);
    const detailUrl = new URL(CHARACTER_PROFILE_CONFIG.detailUrl);
    return {
      publicDir: publicRoot,
      plugins: [react(), tailwindcss()],
      server: {
        proxy: {
          "/api/character-profile/search": {
            target: searchUrl.origin,
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api\/character-profile\/search/, searchUrl.pathname),
          },
          "/api/character-profile/servers": {
            target: serversUrl.origin,
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api\/character-profile\/servers/, serversUrl.pathname),
          },
          "/api/character-profile/info": {
            target: detailUrl.origin,
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api\/character-profile\/info/, `${detailUrl.pathname}/info`),
          },
          "/api/character-profile/equipment": {
            target: detailUrl.origin,
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api\/character-profile\/equipment/, `${detailUrl.pathname}/equipment`),
          },
        },
      },
    };
  }

  const env = loadEnv(mode, root, "");
  const sourceMapApiKey = env.POSTHOG_API_KEY?.trim();
  const sourceMapProjectId = env.POSTHOG_PROJECT_ID?.trim();
  const sourceMapHost = env.POSTHOG_HOST?.trim()
    || (env.VITE_POSTHOG_HOST?.trim() === "https://eu.i.posthog.com" ? "https://eu.posthog.com" : undefined);
  if (Boolean(sourceMapApiKey) !== Boolean(sourceMapProjectId)) {
    throw new Error("PostHog source map upload requires both POSTHOG_API_KEY and POSTHOG_PROJECT_ID.");
  }
  const plan = await createReleaseContentPlan(publicRoot);
  const fingerprint = plan.fingerprint;
  const contentBaseUrl = releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN?.trim(), fingerprint);
  const response = await fetch(`${contentBaseUrl}/release-manifest.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`CDN content is not published at ${contentBaseUrl} (HTTP ${response.status}). Run npm run publish:content to publish it.`);
  }
  const manifest = await response.json() as { fingerprint?: string; files?: unknown[] };
  if (manifest.fingerprint !== fingerprint || !Array.isArray(manifest.files)
    || manifest.files.length !== plan.files.length) {
    throw new Error(`CDN content manifest does not match the expected release at ${contentBaseUrl}.`);
  }

  // Vite serves and copies only the app shell. Content is always fetched from the CDN.
  if (resolve(appPublicRoot, "..") !== root) throw new Error("Unsafe app public directory.");
  rmSync(appPublicRoot, { recursive: true, force: true });
  mkdirSync(appPublicRoot);
  for (const entry of readdirSync(publicRoot, { withFileTypes: true })) {
    if (entry.name === "data" || entry.name === "maps") continue;
    cpSync(resolve(publicRoot, entry.name), resolve(appPublicRoot, entry.name), { recursive: true });
  }

  return {
    publicDir: appPublicRoot,
    define: { "import.meta.env.VITE_CONTENT_BASE_URL": JSON.stringify(contentBaseUrl) },
    build: {
      // The unpacked Overwolf app keeps dist files open while it runs. Release
      // packaging passes --emptyOutDir explicitly for a clean archive.
      emptyOutDir: false,
      // Copy after bundling with byte comparison so an open Overwolf DLL is
      // never overwritten merely because Vite is rebuilding the web UI.
      copyPublicDir: false,
      rollupOptions: {
        input: {
          main: resolve(root, "index.html"),
          background: resolve(root, "background.html"),
          // Headless page Overwolf runs during uninstall (data.uninstall_window).
          uninstall: resolve(root, "uninstall.html"),
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "copy-unchanged-public-assets",
        writeBundle(options: OutputOptions) {
          if (!options.dir) throw new Error("App build requires an output directory.");
          const result = copyBuildPublic(appPublicRoot, resolve(root, options.dir));
          console.info(`[app-public] ${result.copied} copied, ${result.unchanged} unchanged`);
        },
      },
      ...(sourceMapApiKey && sourceMapProjectId ? [posthog({
        personalApiKey: sourceMapApiKey,
        projectId: sourceMapProjectId,
        host: sourceMapHost,
        sourcemaps: { releaseName: "game-maps", deleteAfterUpload: true },
      })] : []),
    ],
  };
});
