import { DEFAULT_CONTENT_BASE_URL } from "../game-config";

const defaultContentBaseUrl = import.meta.env?.DEV ? "" : DEFAULT_CONTENT_BASE_URL;
export const CONTENT_BASE_URL = (
  typeof import.meta.env?.VITE_CONTENT_BASE_URL === "string"
    ? import.meta.env.VITE_CONTENT_BASE_URL.trim()
    : defaultContentBaseUrl
).replace(/\/+$/, "");

/** Use local content in development and the selected CDN release in builds. */
export function contentUrl(path: string): string {
  if (/^(?:https?:)?\/\//.test(path) || /^(?:data|blob):/.test(path)) return path;

  const relativePath = path.replace(/^\/+/, "");
  if (CONTENT_BASE_URL && (relativePath.startsWith("data/") || relativePath.startsWith("maps/"))) {
    return `${CONTENT_BASE_URL}/${relativePath}`;
  }
  return `${import.meta.env?.BASE_URL ?? "/"}${relativePath}`;
}
