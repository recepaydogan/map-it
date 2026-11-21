import { DEFAULT_CONTENT_BASE_URL, DEFAULT_DUNGEON_CONTENT_BASE_URL } from "../game-config";

const contentBaseOverride = typeof import.meta.env?.VITE_CONTENT_BASE_URL === "string"
  ? import.meta.env.VITE_CONTENT_BASE_URL.trim() : undefined;

export const CONTENT_BASE_URL = (contentBaseOverride ?? DEFAULT_CONTENT_BASE_URL).replace(/\/+$/, "");

/** Use the selected CDN release by default in development and builds. */
export function contentUrl(path: string): string {
  if (/^(?:https?:)?\/\//.test(path) || /^(?:data|blob):/.test(path)) return path;

  const relativePath = path.replace(/^\/+/, "");
  if (CONTENT_BASE_URL && (relativePath.startsWith("data/") || relativePath.startsWith("maps/"))) {
    // Release packages pass the pinned general CDN URL explicitly to Vite.
    const base = CONTENT_BASE_URL === DEFAULT_CONTENT_BASE_URL && /^(?:data|maps)\/dungeons\//.test(relativePath)
      ? DEFAULT_DUNGEON_CONTENT_BASE_URL : CONTENT_BASE_URL;
    return `${base}/${relativePath}`;
  }
  return `${import.meta.env?.BASE_URL ?? "/"}${relativePath}`;
}
