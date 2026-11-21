import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type { Plugin } from "vite";

const MAP_URL_PREFIX = "/map-data/knox-country/";
const RUNTIME_DIRECTORY_MAPPINGS = [
  { publicPrefix: "isometric/", sourcePrefix: "isometric/" },
  { publicPrefix: "isometric-optimized/", sourcePrefix: "isometric-optimized/" },
  { publicPrefix: "isometric-mods/", sourcePrefix: "isometric-mods/" },
  { publicPrefix: "isometric-mods-v2/", sourcePrefix: "isometric-mods/" },
];
const CONTENT_TYPES: Record<string, string> = {
  ".dzi": "application/xml",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const createRuntimeMapDataPlugin = (projectRoot: string): Plugin => {
  const runtimeMapRoot = resolve(projectRoot, ".runtime-data", "map-data", "knox-country");

  return {
    name: "runtime-map-data",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") return next();
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
        } catch {
          return next();
        }
        if (!pathname.startsWith(MAP_URL_PREFIX)) return next();
        const assetPath = pathname.slice(MAP_URL_PREFIX.length);
        const directoryMapping = RUNTIME_DIRECTORY_MAPPINGS.find(({ publicPrefix }) =>
          assetPath.startsWith(publicPrefix));
        if (!directoryMapping) return next();

        const sourceAssetPath = `${directoryMapping.sourcePrefix}${assetPath.slice(directoryMapping.publicPrefix.length)}`;
        const filePath = resolve(runtimeMapRoot, sourceAssetPath);
        const relativePath = relative(runtimeMapRoot, filePath);
        if (relativePath.startsWith("..") || isAbsolute(relativePath)) return next();
        if (!existsSync(filePath) || !statSync(filePath).isFile()) return next();

        response.statusCode = 200;
        response.setHeader("Content-Type", CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream");
        response.setHeader("Cache-Control", "no-cache");
        if (request.method === "HEAD") return response.end();
        createReadStream(filePath).pipe(response);
      });
    },
  };
};
