import { cp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { MAP_BUNDLED_ASSET_DIRS } from "./src/features/map/map-registry";

const bundledMapAssets = new Set<string>(MAP_BUNDLED_ASSET_DIRS);

const ocrRuntime = (): Plugin => ({
  name: "position-ocr-runtime",
  apply: "build",
  async buildStart() {
    const files = {
      "worker.min.js": "tesseract.js/dist/worker.min.js",
      "tesseract-core-lstm.wasm.js": "tesseract.js-core/tesseract-core-lstm.wasm.js",
      "eng.traineddata.gz": "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
      "tesseract-license.md": "tesseract.js/LICENSE.md",
      "tesseract-core-license.txt": "tesseract.js-core/LICENSE",
    };
    await Promise.all(Object.entries(files).map(async ([name, file]) => {
      const source = await readFile(resolve(__dirname, "node_modules", file));
      this.emitFile({ type: "asset", fileName: `assets/position-ocr/${name}`, source });
    }));
  },
});

const releaseContentResolver = (): Plugin => ({
  name: "release-content-resolver",
  apply: "build",
  buildStart() {
    // Keep the resolver importable so OPK validation runs the shipped code.
    this.emitFile({ type: "chunk", id: resolve(__dirname, "src/lib/content-url.ts"),
      name: "content-url", preserveSignature: "strict" });
  },
});

const excludeUnpublishedAddonLocale = (): Plugin => ({
  name: "exclude-unpublished-addon-locale",
  apply: "build",
  enforce: "pre",
  transform(source, id) {
    const file = id.split("?")[0].replaceAll("\\", "/");
    if (!/\/src\/i18n\/locales\/[^/]+\.json$/.test(file)) return;
    const locale = JSON.parse(source) as Record<string, unknown>;
    if (!Object.hasOwn(locale, "mapAddonPrototype")) return;
    delete locale.mapAddonPrototype;
    return JSON.stringify(locale);
  },
});

const watchPublicAssets = (): Plugin => {
  let publicDirectory = "";
  let outputDirectory = "";
  return {
    name: "watch-public-assets",
    apply: "build",
    config(config) {
      if (!config.build?.watch) return;
      // Set these before Vite creates its per-environment build options.
      return { build: { emptyOutDir: false, copyPublicDir: false } };
    },
    configResolved(config) {
      if (!config.build.watch || !config.publicDir) return;
      publicDirectory = config.publicDir;
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    async buildStart() {
      if (!publicDirectory) return;
      await cp(publicDirectory, outputDirectory, { recursive: true });
    },
  };
};

const englishOnlyRelease = (): Plugin => ({
  name: "english-only-release",
  apply: "build",
  enforce: "pre",
  transform(source, id) {
    const file = id.split("?")[0].replaceAll("\\", "/");
    if (file.endsWith("/src/game-config.ts")) {
      const pattern = /supportedAppLanguages:\s*\[[^\]]*\]/;
      if (!pattern.test(source)) throw new Error("Cannot select English for this release.");
      return source.replace(pattern, 'supportedAppLanguages: ["en"]');
    }
    if (file.endsWith("/src/i18n/index.ts")) {
      const pattern = '"./locales/*.json"';
      if (!source.includes(pattern)) throw new Error("Cannot select English UI resources for this release.");
      return source.replace(pattern, '"./locales/en.json"');
    }
  },
});

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
      // closeBundle also runs after a failed build; preserve the original error
      // when output assets have not been copied yet.
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "TEBEX_");
  const publicToken = env.TEBEX_PUBLIC_KEY?.trim() ?? "";
  if (mode !== "development" && !publicToken) {
    throw new Error("TEBEX_PUBLIC_KEY is required for subscription-enabled builds.");
  }
  return {
  define: {
    // Explicit allowlist: private and webhook keys must never reach the client.
    "import.meta.env.VITE_TEBEX_PUBLIC_TOKEN": JSON.stringify(publicToken),
  },
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
    ...(process.env.WOW_FOREVER_RELEASE === "1" ? [excludeUnpublishedAddonLocale(), releaseContentResolver()] : []),
    ...(process.env.WOW_FOREVER_ENGLISH_ONLY === "1" ? [englishOnlyRelease()] : []),
    react(), tailwindcss(), ocrRuntime(), watchPublicAssets(), keepBundledMapAssets(),
  ],
  };
});
