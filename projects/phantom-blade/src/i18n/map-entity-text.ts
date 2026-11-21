export interface MapEntitySource {
  version: number;
  keys: string[];
  values: (string | null)[];
}

export interface MapEntityPack {
  version: number;
  values: (string | null)[];
}

export interface MapEntityEntry {
  english: string;
  localized: string;
}

export function createMapEntityDictionary(
  source: MapEntitySource,
  translated: MapEntityPack,
  fallbacks: Record<string, string> = {},
) {
  if (source.version !== 1 || !Array.isArray(source.keys) || !Array.isArray(source.values) ||
    source.keys.length !== source.values.length || translated.version !== 1 ||
    !Array.isArray(translated.values) || translated.values.length !== source.keys.length) {
    throw new Error("Invalid map entity locale pack");
  }
  const entries = new Map<string, MapEntityEntry>();
  const seen = new Set<string>();
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    const english = source.values[index];
    const localized = translated.values[index];
    if (!/^(?:Quest|Creature):\d+:0$/.test(key) || !english || seen.has(key)) {
      throw new Error(`Invalid map entity key: ${key}`);
    }
    seen.add(key);
    const fallback = fallbacks[key];
    if (fallback !== undefined &&
      (typeof fallback !== "string" || !fallback.trim() || fallback === english || localized)) {
      throw new Error(`Invalid map entity fallback: ${key}`);
    }
    if (localized || fallback) entries.set(key, { english, localized: localized || fallback });
  }
  for (const key of Object.keys(fallbacks)) {
    if (!seen.has(key)) throw new Error(`Unknown map entity fallback: ${key}`);
  }
  return entries;
}

export function getMapEntityText(
  entries: Map<string, MapEntityEntry> | undefined,
  english: string,
  key: string | undefined,
) {
  const entry = key ? entries?.get(key) : undefined;
  return entry?.english === english ? entry.localized : undefined;
}
