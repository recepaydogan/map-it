import { cp } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/** Copy public assets without shipping duplicate imagery in CDN-enabled builds. */
export const cdnMapImages = (): Plugin => {
  let config: ResolvedConfig;
  return {
    name: "cdn-map-images",
    apply: "build",
    configResolved(resolved) { config = resolved; },
    async writeBundle() {
      const source = resolve(config.root, "public");
      const destination = resolve(config.root, config.build.outDir);
      await cp(source, destination, {
        recursive: true,
        filter: (filename) => {
          const asset = relative(source, filename).replaceAll("\\", "/");
          return !/^maps\/[^/]+\/(?:tiles(?:\/|$)|overview\.webp$)/.test(asset);
        },
      });
    },
  };
};
