import { getCommunityMapAsset } from "./community-map-database";

const MAX_IDLE_TILES = 256;

interface TileCacheEntry {
  promise: Promise<string | null>;
  url: string | null;
  references: number;
  lastUsed: number;
}

const cache = new Map<string, TileCacheEntry>();

const pruneCache = () => {
  const idleEntries = [...cache.entries()]
    .filter(([, entry]) => entry.references === 0)
    .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
  for (const [key, entry] of idleEntries.slice(0, Math.max(0, idleEntries.length - MAX_IDLE_TILES))) {
    if (entry.url) URL.revokeObjectURL(entry.url);
    cache.delete(key);
  }
};

export const acquireCommunityMapTile = (packageKey: string, path: string) => {
  const key = `${packageKey}/${path}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = {
      url: null,
      references: 0,
      lastUsed: Date.now(),
      promise: getCommunityMapAsset(packageKey, path).then((blob) => {
        const current = cache.get(key);
        if (!blob || !current) return null;
        current.url = URL.createObjectURL(blob);
        pruneCache();
        return current.url;
      }),
    };
    cache.set(key, entry);
  }
  entry.references += 1;
  entry.lastUsed = Date.now();
  return entry.promise;
};

export const releaseCommunityMapTile = (packageKey: string, path: string) => {
  const entry = cache.get(`${packageKey}/${path}`);
  if (!entry) return;
  entry.references = Math.max(0, entry.references - 1);
  entry.lastUsed = Date.now();
  pruneCache();
};

export const clearCommunityMapTileCache = (packageKey: string) => {
  for (const [key, entry] of cache) {
    if (!key.startsWith(`${packageKey}/`) || entry.references > 0) continue;
    if (entry.url) URL.revokeObjectURL(entry.url);
    cache.delete(key);
  }
};
