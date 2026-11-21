const remoteBaseUrl = import.meta.env.VITE_CONTENT_BASE_URL?.trim().replace(/\/+$/, "");

/** Resolve release content from the CDN in every app mode. */
export function contentUrl(path: string): string {
  if (/^(?:https?:)?\/\//.test(path) || /^(?:data|blob):/.test(path)) return path;

  const relativePath = path.replace(/^\/+/, "");
  if (relativePath === "data" || relativePath.startsWith("data/") || relativePath === "maps" || relativePath.startsWith("maps/")) {
    if (import.meta.env.DEV) return `${import.meta.env.BASE_URL}${relativePath}`;
    if (!remoteBaseUrl) throw new Error("VITE_CONTENT_BASE_URL is required for CDN content.");
    return `${remoteBaseUrl}/${relativePath}`;
  }
  return `${import.meta.env.BASE_URL}${relativePath}`;
}
