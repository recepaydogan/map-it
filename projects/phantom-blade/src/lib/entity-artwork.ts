import { contentUrl } from "./content-url";
import { ENTITY_ARTWORK_FALLBACKS, GAME_CONFIG } from "../game-config";


export interface EntityArtwork {
  version: 1;
  icons: Record<string, string>;
  items: Record<string, string>;
}

let request: Promise<EntityArtwork> | undefined;

/** One verified identity-to-artwork catalog shared by maps and reference panels. */
export function loadEntityArtwork(): Promise<EntityArtwork> {
  if (!GAME_CONFIG.entityArtworkPath) return Promise.resolve({ version: 1, icons: {}, items: {} });
  request ??= fetch(contentUrl(`${GAME_CONFIG.entityArtworkPath}`))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Entity artwork: HTTP ${response.status}`);
      const data = await response.json() as EntityArtwork;
      const validPaths = (value: unknown): value is Record<string, string> => !!value
        && typeof value === "object" && !Array.isArray(value)
        && Object.values(value).every((path) => typeof path === "string" && path.startsWith("data/") && !path.includes(".."));
      if (data.version !== 1 || !validPaths(data.icons) || !validPaths(data.items)) {
        throw new Error("Invalid entity artwork catalog");
      }
      return data;
    }).catch((error: unknown) => { request = undefined; throw error; });
  return request;
}

/** Enrich summaries, entries and nested navigation links without rewriting source data. */
export function attachEntityArtwork<T>(data: T, artwork: EntityArtwork): T {
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string" && typeof record.name === "string" && !record.icon) {
      const icon = artwork.icons[record.id] ?? ENTITY_ARTWORK_FALLBACKS[record.id];
      if (icon) record.icon = icon;
    }
    Object.values(record).forEach(visit);
  };
  visit(data);
  return data;
}
