import type { LocaleCache } from "./locale-cache";

interface LocaleLoaderOptions {
  origin: string;
  fallbackBaseUrl: string;
  cache: LocaleCache;
  fetchJson?: (url: string) => Promise<unknown>;
  preferFallbackBaseUrl?: boolean;
}

function channelBase(origin: string, channel: unknown): string | undefined {
  if (!channel || typeof channel !== "object" ||
    !("version" in channel) || channel.version !== 1 ||
    !("fingerprint" in channel) || typeof channel.fingerprint !== "string" ||
    !/^[a-f0-9]{24}$/.test(channel.fingerprint)) return undefined;
  return `${origin}/releases/${channel.fingerprint}`;
}

const downloadJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal,
      ...(url.endsWith("/current.json") ? { cache: "no-store" as const } : {}) });
    if (!response.ok) throw new Error(`Locale request: HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid locale JSON");
    }
    return value;
  } finally { clearTimeout(timeout); }
};

/** Keep source arrays and translations on the same immutable snapshot. */
export function createLocaleLoader({ origin, fallbackBaseUrl, cache, fetchJson = downloadJson,
  preferFallbackBaseUrl = false }: LocaleLoaderOptions) {
  const channelUrl = `${origin}/locales/wow-forever/current.json`;
  let baseRequest: Promise<string> | undefined;
  const requests = new Map<string, Promise<unknown>>();
  const readCache = (key: string) => cache.read(key).catch(() => undefined);
  const writeCache = (key: string, value: unknown) => cache.write(key, value).catch(() => undefined);

  function getBase(): Promise<string> {
    if (preferFallbackBaseUrl) return Promise.resolve(fallbackBaseUrl);
    baseRequest ??= (async () => {
      try {
        const channel = await fetchJson(channelUrl);
        const base = channelBase(origin, channel);
        if (!base) throw new Error("Invalid locale channel");
        await writeCache(channelUrl, channel);
        return base;
      } catch {
        return channelBase(origin, await readCache(channelUrl)) ?? fallbackBaseUrl;
      }
    })();
    return baseRequest;
  }

  async function load<T>(path: string): Promise<T> {
    const url = `${await getBase()}/${path}`;
    let request = requests.get(url);
    if (!request) {
      request = (async () => {
        const cached = await readCache(url);
        if (cached !== undefined) return cached;
        const pack = await fetchJson(url);
        await writeCache(url, pack);
        return pack;
      })().catch((error: unknown) => { requests.delete(url); throw error; });
      requests.set(url, request);
    }
    return request as Promise<T>;
  }

  return { getBase, load };
}
