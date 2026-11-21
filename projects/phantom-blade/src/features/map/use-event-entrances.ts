import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";

export interface EventEntrance {
  eventId: string;
  mapId: number;
  autoCombatAllowed: boolean;
  destinationId: string | null;
  eventArea?: { mapId: string; regionId: string; nameKey: string };
  relatedInteriorMaps?: { mapId: string; insetId: string; nameKey: string }[];
  scheduleId: string;
  days: number[];
  starts: string[];
}

interface EventEntranceCatalog {
  version: 1;
  npcs: Record<string, EventEntrance>;
  bossMarkers: Record<string, { npcId: string; mapId: string; bosses: Record<string, string> }>;
}

let catalogPromise: Promise<EventEntranceCatalog> | null = null;

const loadCatalog = () => {
  catalogPromise ??= fetch(contentUrl(`data/event-entrances.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Event entrances: HTTP ${response.status}`);
    const data = await response.json() as EventEntranceCatalog;
    if (data.version !== 1 || !data.npcs || !data.bossMarkers) {
      throw new Error("Invalid event entrance catalog");
    }
    return data;
  }).catch((error: unknown) => {
    catalogPromise = null;
    throw error;
  });
  return catalogPromise;
};

export const useEventEntrance = (npcId?: string, entranceMarkerId?: string) => {
  const [result, setResult] = useState<{
    npcId: string;
    entranceMarkerId?: string;
    status: "ready" | "error";
    data?: EventEntrance;
    bossLocations?: Record<string, { mapId: string; markerId: string }>;
  } | null>(null);

  useEffect(() => {
    if (!npcId) return;
    let active = true;
    void loadCatalog().then((catalog) => {
      if (!catalog.npcs[npcId]) throw new Error(`Missing event entrance: ${npcId}`);
      const markers = Object.entries(catalog.bossMarkers).filter(([markerId, marker]) =>
        marker.npcId === npcId && (!entranceMarkerId || markerId === entranceMarkerId));
      const selected = markers.length === 1 ? markers[0][1] : undefined;
      const bossLocations = selected && Object.fromEntries(Object.entries(selected.bosses)
        .map(([bossId, markerId]) => [bossId, { mapId: selected.mapId, markerId }]));
      if (active) setResult({ npcId, entranceMarkerId, status: "ready", data: catalog.npcs[npcId], bossLocations });
    }).catch((error: unknown) => {
      console.error("Failed to load event entrance", error);
      if (active) setResult({ npcId, entranceMarkerId, status: "error" });
    });
    return () => { active = false; };
  }, [npcId, entranceMarkerId]);

  if (!npcId) return { status: "error" as const };
  return result?.npcId === npcId && result.entranceMarkerId === entranceMarkerId
    ? result : { status: "loading" as const };
};
