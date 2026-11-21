import { useEffect, useState } from "react";
import { loadCachedMapJson } from "./map-data-cache";
import { MAP_DATA_BASE_URL } from "./map-data-url";

export interface MapItemSprite {
  atlas: string;
  u1: number;
  u2: number;
  v1: number;
  v2: number;
}

/** The few item-database fields a marker and its panel header need, without
 * pulling in the full 18 MB item catalog. Built by build-map-item-visuals.mjs. */
export interface MapItemVisual {
  itemId: string;
  sprite?: MapItemSprite;
  group: string;
  category: string;
  rarity: string;
  unique?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSprite = (value: unknown): MapItemSprite | undefined => {
  if (!isRecord(value) || typeof value.atlas !== "string") return undefined;
  const bounds = (["u1", "u2", "v1", "v2"] as const).map((key) => value[key]);
  if (!bounds.every((bound): bound is number => typeof bound === "number" && Number.isFinite(bound))) {
    return undefined;
  }
  const [u1, u2, v1, v2] = bounds;
  return { atlas: value.atlas, u1, u2, v1, v2 };
};

const parseVisuals = (value: unknown): Map<string, MapItemVisual> => {
  const visuals = new Map<string, MapItemVisual>();
  if (!isRecord(value) || !isRecord(value.items)) return visuals;
  for (const [contentId, entry] of Object.entries(value.items)) {
    if (!isRecord(entry) || typeof entry.itemId !== "string") continue;
    visuals.set(contentId, {
      itemId: entry.itemId,
      sprite: parseSprite(entry.sprite),
      group: typeof entry.group === "string" ? entry.group : "",
      category: typeof entry.category === "string" ? entry.category : "",
      rarity: typeof entry.rarity === "string" ? entry.rarity : "Common",
      ...(entry.unique === true ? { unique: true } : {}),
    });
  }
  return visuals;
};

const EMPTY_VISUALS: ReadonlyMap<string, MapItemVisual> = new Map();

let parsedVisuals: ReadonlyMap<string, MapItemVisual> | null = null;

/**
 * Item marker artwork and grouping. Every consumer shares one fetch and one
 * parse, so calling this from each marker surface stays cheap.
 */
export const useMapItemVisuals = (): ReadonlyMap<string, MapItemVisual> => {
  const [visuals, setVisuals] = useState(parsedVisuals ?? EMPTY_VISUALS);

  useEffect(() => {
    if (parsedVisuals) return;
    let cancelled = false;
    void loadCachedMapJson<unknown>(`${MAP_DATA_BASE_URL}/item-visuals.json`)
      .then((payload) => {
        parsedVisuals = parseVisuals(payload);
        if (!cancelled) setVisuals(parsedVisuals);
      })
      .catch((error: unknown) => {
        // Markers stay on their category glyph when the lookup is unavailable.
        console.error("Map item visuals could not be loaded.", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return visuals;
};

/** The item artwork for a point, or undefined when it is not a catalogued item. */
export const getMapItemVisual = (
  visuals: ReadonlyMap<string, MapItemVisual>,
  contentId: string | undefined,
) => (contentId ? visuals.get(contentId) : undefined);
