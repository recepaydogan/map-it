import { DEFAULT_CONTENT_BASE_URL, DEFAULT_LOCALE_CONTENT_BASE_URL, GAME_CONFIG,
  USE_PINNED_LOCALE_RELEASE } from "../game-config";
import { localeCache } from "./locale-cache";
import { createLocaleLoader } from "./locale-loader";

const loader = createLocaleLoader({
  origin: new URL(DEFAULT_CONTENT_BASE_URL).origin,
  fallbackBaseUrl: import.meta.env?.VITE_LOCALE_CONTENT_BASE_URL?.trim() || DEFAULT_LOCALE_CONTENT_BASE_URL,
  preferFallbackBaseUrl: USE_PINNED_LOCALE_RELEASE,
  cache: localeCache,
});

export const getLocaleContentBase = loader.getBase;

export function fetchGameLocalePack<T>(file: string): Promise<T> {
  const directory = GAME_CONFIG.gameLocaleDirectory;
  if (!directory || !/^[a-zA-Z0-9-]+\.json$/.test(file)) {
    return Promise.reject(new Error(`Invalid game locale pack: ${file}`));
  }
  return loader.load<T>(`${directory.replace(/^\/+|\/+$/g, "")}/${file}`);
}

export async function fetchAppLocalePack(language: string): Promise<Record<string, unknown> | undefined> {
  if (!/^[a-zA-Z-]+$/.test(language)) return undefined;
  try {
    return await loader.load<Record<string, unknown>>(`data/locales/app/${language}.json`);
  } catch { return undefined; }
}

/** Missing translations leave the original English content available to callers. */
export function fetchSupplementalLocalePack<T>(path: string): Promise<T> {
  if (!/^data\/(?:classes\/(?:guides\/)?locales|guides\/locales|spells\/writeups\/locales)\/[a-zA-Z0-9/_-]+\.json$/.test(path)) {
    return Promise.reject(new Error(`Invalid supplemental locale path: ${path}`));
  }
  return loader.load<T>(path);
}
