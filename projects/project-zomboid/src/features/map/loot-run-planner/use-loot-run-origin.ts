import { useEffect, useMemo } from "react";
import type { LivePositionState } from "../../live-position/live-position-types";
import type { MapCoordinate, MapMetadata } from "../types";

const LAST_LOOT_RUN_POSITION_KEY_PREFIX = "pzim:last-loot-run-position";

export type LootRunOriginSource = "live" | "last-known" | "unavailable";

interface StoredLootRunPosition extends MapCoordinate {
  mapId: string;
  updatedAt: number;
}

const isInsideBounds = (position: MapCoordinate, bounds: MapMetadata["bounds"]) => (
  Number.isFinite(position.x)
  && Number.isFinite(position.y)
  && position.x >= bounds.minX
  && position.x <= bounds.maxX
  && position.y >= bounds.minY
  && position.y <= bounds.maxY
);

const readLastPosition = (data: MapMetadata | null | undefined): MapCoordinate | null => {
  if (!data) return null;
  try {
    const value = JSON.parse(
      localStorage.getItem(`${LAST_LOOT_RUN_POSITION_KEY_PREFIX}:${data.id}`) ?? "null",
    ) as Partial<StoredLootRunPosition> | null;
    if (!value || value.mapId !== data.id) return null;
    const position = { x: Number(value.x), y: Number(value.y) };
    return isInsideBounds(position, data.bounds) ? position : null;
  } catch {
    return null;
  }
};

const useLootRunOrigin = (
  data: MapMetadata | null | undefined,
  livePosition: LivePositionState,
) => {
  const storedPosition = useMemo(() => readLastPosition(data), [data]);

  useEffect(() => {
    if (!data || !livePosition.position) return;
    const position = { x: livePosition.position.x, y: livePosition.position.y };
    if (!isInsideBounds(position, data.bounds)) return;
    localStorage.setItem(`${LAST_LOOT_RUN_POSITION_KEY_PREFIX}:${data.id}`, JSON.stringify({
      ...position,
      mapId: data.id,
      updatedAt: Date.now(),
    } satisfies StoredLootRunPosition));
  }, [data, livePosition.position]);

  return useMemo(() => {
    const live = livePosition.status === "live" && livePosition.position
      ? { x: livePosition.position.x, y: livePosition.position.y }
      : null;
    if (live && data && isInsideBounds(live, data.bounds)) {
      return { position: live, source: "live" as const };
    }
    const latestKnown = livePosition.position
      ? { x: livePosition.position.x, y: livePosition.position.y }
      : storedPosition;
    if (latestKnown && data && isInsideBounds(latestKnown, data.bounds)) {
      return { position: latestKnown, source: "last-known" as const };
    }
    return { position: null, source: "unavailable" as const };
  }, [data, livePosition.position, livePosition.status, storedPosition]);
};

export default useLootRunOrigin;
