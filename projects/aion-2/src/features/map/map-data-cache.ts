type JsonLoader = (url: string) => Promise<unknown>;

const jsonCache = new Map<string, Promise<unknown>>();

export class MapDataRequestError extends Error {
  readonly url: string;
  readonly status: number;

  constructor(url: string, status: number) {
    super(`Map data request failed with status ${status}: ${url}`);
    this.url = url;
    this.status = status;
  }
}

const fetchJson: JsonLoader = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new MapDataRequestError(url, response.status);
  return response.json() as Promise<unknown>;
};

/** Cache immutable hosted map payloads by their versioned URL. Failed requests
 * are evicted so a temporary network/CDN error remains retryable. */
export const loadCachedMapJson = <T,>(
  url: string,
  loader: JsonLoader = fetchJson,
): Promise<T> => {
  const cached = jsonCache.get(url);
  if (cached) return cached as Promise<T>;

  const request = loader(url).catch((error: unknown) => {
    if (jsonCache.get(url) === request) jsonCache.delete(url);
    throw error;
  });
  jsonCache.set(url, request);
  return request as Promise<T>;
};

export const clearMapDataCache = () => jsonCache.clear();
