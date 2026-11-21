import { useEffect, useMemo, useState } from "react";
import { loadCachedMapJson } from "../map/map-data-cache";
import type { MapRegion } from "../map/types";
import { findQuestLocationName, questMapDefinitions, questRegionTargets,
  type QuestLocationTarget, type QuestMapMarkerCandidate } from "./quest-location-targets";
import type { ReferenceEntry } from "./reference-types";

const isRegion = (value: unknown): value is MapRegion => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const region = value as Record<string, unknown>;
  return typeof region.id === "string" && typeof region.name === "string"
    && typeof region.x === "number" && Number.isFinite(region.x)
    && typeof region.y === "number" && Number.isFinite(region.y);
};

const isNamedLocation = (value: unknown): value is { id: string; name: string; reference: { id: string } } => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const location = value as Record<string, unknown>;
  if (typeof location.reference !== "object" || location.reference === null) return false;
  return typeof location.id === "string" && typeof location.name === "string"
    && typeof (location.reference as Record<string, unknown>).id === "string";
};

interface QuestMapTargets {
  regions: QuestLocationTarget[];
  markers: QuestMapMarkerCandidate[];
}

export function useQuestMapTargets(entry: ReferenceEntry): QuestMapTargets {
  const maps = useMemo(() => questMapDefinitions(entry), [entry]);
  const linkedReferenceIds = useMemo(() => new Set(entry.sections
    .filter((section) => section.title === "reference.labels.objectives")
    .flatMap((section) => section.rows?.flatMap((row) => row.links ?? []) ?? [])
    .filter((link) => link.category === "creatures" || link.category === "exploration"
      || link.category === "travel")
    .map((link) => link.id)), [entry]);
  const texts = useMemo(() => [entry.description ?? "", ...entry.sections
    .filter((section) => section.title === "reference.labels.objectives")
    .flatMap((section) => section.rows?.map((row) => row.description ?? "") ?? [])], [entry]);
  const fallback = maps.flatMap((map) => questRegionTargets(map, map.regionLabels ?? []));
  const [loaded, setLoaded] = useState<{ entryId: string; targets: QuestMapTargets }>(() => (
    { entryId: entry.id, targets: { regions: fallback, markers: [] } }));
  useEffect(() => {
    let active = true;
    void Promise.allSettled(maps.map(async (map) => {
      const raw = await loadCachedMapJson<unknown>(`${map.dataUrl}/metadata.json`);
      if (typeof raw !== "object" || raw === null
        || !Array.isArray((raw as { regions?: unknown }).regions)
        || !Array.isArray((raw as { locations?: unknown }).locations)) {
        throw new Error(`Map locations or regions are unavailable for ${map.id}.`);
      }
      const metadata = raw as { regions: unknown[]; locations: unknown[] };
      const sourceRegions = metadata.regions.filter(isRegion);
      const sourceIds = new Set(sourceRegions.map((region) => region.id));
      const regions = questRegionTargets(map, [...sourceRegions, ...(map.regionLabels ?? []).filter((region) => !sourceIds.has(region.id))]);
      const namedLocations = metadata.locations.filter(isNamedLocation);
      const matchingNames = new Set([...new Set(namedLocations.map((location) => location.name.trim()))]
        .filter((name) => name.length >= 5
          && texts.some((text) => findQuestLocationName(text, name) >= 0)));
      const candidates: QuestMapMarkerCandidate[] = namedLocations
        .filter((location) => matchingNames.has(location.name.trim()) || linkedReferenceIds.has(location.reference.id))
        .map((location) => ({ name: location.name, mapId: map.id, markerId: location.id,
          referenceId: location.reference.id }));
      return { regions, candidates };
    })).then((results) => {
      if (!active) return;
      const byMap = results.map((result, index) => {
        if (result.status === "fulfilled") return result.value;
        console.error(`Quest map regions could not be loaded for ${maps[index]!.id}.`, result.reason);
        return { regions: questRegionTargets(maps[index]!, maps[index]!.regionLabels ?? []), candidates: [] };
      });
      setLoaded({ entryId: entry.id, targets: {
        regions: byMap.flatMap((result) => result.regions),
        markers: byMap.flatMap((result) => result.candidates),
      } });
    });
    return () => { active = false; };
  }, [entry.id, maps, texts, linkedReferenceIds]);
  return loaded.entryId === entry.id ? loaded.targets : { regions: fallback, markers: [] };
}
