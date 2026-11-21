import { DEFAULT_CONTENT_BASE_URL } from "../game-config";
import release from "../../content-release.json";
import policy from "../content-delivery.json";

const bundledPatterns = policy.bundledPatterns.map(pattern => new RegExp(pattern));

export const CONTENT_BASE_URL = (
  typeof import.meta.env?.VITE_CONTENT_BASE_URL === "string"
    ? import.meta.env.VITE_CONTENT_BASE_URL.trim()
    : release.baseUrl || DEFAULT_CONTENT_BASE_URL
).replace(/\/+$/, "");

/** Every app mode reads the selected CDN release; English packs stay local. */
export function contentUrl(path: string): string {
  if (/^(?:https?:)?\/\//.test(path) || /^(?:data|blob):/.test(path)) return path;

  const relativePath = path.replace(/^\/+/, "");
  const remote = policy.remoteRoots.some(prefix => relativePath.startsWith(prefix))
    && !bundledPatterns.some(pattern => pattern.test(relativePath));
  if (remote && CONTENT_BASE_URL) {
    return `${CONTENT_BASE_URL}/${relativePath}`;
  }
  return `${import.meta.env?.BASE_URL ?? "/"}${relativePath}`;
}
