/** Prefer the selected immutable CDN release; bundled text remains usable offline. */
export async function fetchLocaleJson<T>(primaryUrl: string, bundledUrl: string, fetcher: typeof fetch = fetch): Promise<T> {
  const errors: unknown[] = [];
  for (const url of new Set([primaryUrl, bundledUrl])) {
    try {
      const response = await fetcher(url);
      if (!response.ok) throw new Error(`Locale request failed: HTTP ${response.status} (${url})`);
      return await response.json() as T;
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, "Neither the selected CDN locale nor its bundled copy could be loaded");
}

export function validateAppLocalePack(value: unknown, language: string, sourceSha256: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("Invalid app locale pack");
  const pack = value as Record<string, unknown>;
  if (pack.version !== 1 || pack.language !== language || pack.sourceSha256 !== sourceSha256
      || !pack.translation || typeof pack.translation !== "object" || Array.isArray(pack.translation)) {
    throw new Error("App locale does not match this app's English source");
  }
  return pack.translation as Record<string, unknown>;
}
