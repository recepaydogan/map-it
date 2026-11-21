import { useEffect, useMemo, useState } from "react";
import { attachEntityArtwork, loadEntityArtwork } from "../../lib/entity-artwork";
import { contentUrl } from "../../lib/content-url";
import type { BossPanelData, ReferenceEntry, ReferenceIndex, ReferenceSection, ReferenceSummary, SkillDamageRecord } from "./reference-types";
import type { RewardBoxCatalog, RewardBoxFamily, RewardBoxSummary } from "./reward-box-types";
import type { CompanionProgression } from "./companion-types";
import type { MapCompanionCatalog } from "../map/map-companion-sources";
import type { CraftServicesData } from "./craft-service-types";
import type { SpecialItemDetailsData } from "../intelligence/intelligence-types";
import { currentDungeonEntry, currentDungeonSummary } from "./current-dungeon-rules";

type LoadState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };
const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let request = cache.get(path);
  if (!request) {
    request = fetch(contentUrl(`data/reference/${path}`)).then(async (response) => {
      if (!response.ok) throw new Error(`Reference data ${path}: HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("version" in data) || data.version !== 1) throw new Error(`Invalid reference data: ${path}`);
      return attachEntityArtwork(data, await loadEntityArtwork());
    }).catch((error: unknown) => { cache.delete(path); throw error; });
    cache.set(path, request);
  }
  return request as Promise<T>;
}

export { load as loadReferenceData };

function useData<T>(path: string | null): LoadState<T> {
  const [result, setResult] = useState<{ path: string; state: LoadState<T> } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    load<T>(path).then((data) => {
      if (!cancelled) setResult({ path, state: { status: "ready", data } });
    }).catch((error: unknown) => {
      console.error("Failed to load reference data", error);
      if (!cancelled) setResult({ path, state: { status: "error" } });
    });
    return () => { cancelled = true; };
  }, [path]);
  return result?.path === path ? result.state : { status: "loading" };
}

export const useReferenceIndex = (enabled = true): LoadState<ReferenceIndex> => {
  const index = useData<ReferenceIndex>(enabled ? "index.json" : null);
  const visibility = useData<SpecialItemDetailsData>(enabled ? "intelligence/special-item-details.json" : null);
  const indexData = index.status === "ready" ? index.data : null;
  const visibilityData = visibility.status === "ready" ? visibility.data : null;
  const visibleIndex = useMemo(() => {
    if (!indexData || !visibilityData) return null;
    const hidden = new Set(visibilityData.hiddenRecipes);
    return { ...indexData, entries: indexData.entries.filter((entry) => !hidden.has(entry.id)).map(currentDungeonSummary) };
  }, [indexData, visibilityData]);
  if (index.status !== "ready") return index;
  if (visibility.status !== "ready") return visibility;
  return { status: "ready", data: visibleIndex! };
};
export const useIntelligenceData = <T,>(name: string, enabled = true) => useData<T>(enabled ? `intelligence/${name}.json` : null);
export const useCompanionProgression = () => useData<CompanionProgression>("companion-progression.json");
export const useCompanionSources = (enabled = true) => useData<MapCompanionCatalog>(enabled ? "map-companion-sources.json" : null);
export const useCraftServices = (enabled = true) => useData<CraftServicesData>(enabled ? "craft-services.json" : null);
export const useBossPanelData = (enabled = true) => useData<BossPanelData>(enabled ? "boss-panel-data.json" : null);
export interface ResurrectionServicesData {
  version: 1;
  npcs: string[];
  costs: { level: number; kinah: number; dia: number }[];
}
export const useResurrectionServices = () => useData<ResurrectionServicesData>("resurrection-services.json");
export const useRewardBoxCatalog = () => useData<RewardBoxCatalog>("box-catalog.json");
export function useRewardBoxFamily(summary: RewardBoxSummary): LoadState<RewardBoxFamily> {
  const result = useData<{ families: Record<string, RewardBoxFamily> }>(`box-details/${summary.chunk}.json`);
  if (result.status !== "ready") return result;
  const family = result.data.families[summary.id];
  return family ? { status: "ready", data: family } : { status: "error" };
}

export function useReferenceEntries(summaries: ReferenceSummary[], relatedCategory?: string | string[]): LoadState<ReferenceEntry[]> {
  const relatedCategories = typeof relatedCategory === "string" ? [relatedCategory] : relatedCategory ?? [];
  const key = JSON.stringify({ requests: summaries.map(({ id, category, chunk }) => ({ id, category, chunk })), relatedCategories });
  const [result, setResult] = useState<{ key: string; state: LoadState<ReferenceEntry[]> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const request = JSON.parse(key) as { requests: Pick<ReferenceSummary, "id" | "category" | "chunk">[]; relatedCategories: string[] };
    const resolve = async () => {
      const index = request.relatedCategories.length ? await load<ReferenceIndex>("index.json") : null;
      const summariesById = new Map(index?.entries.map((entry) => [entry.id, entry]));
      const entries = new Map<string, ReferenceEntry>();
      let pending = request.requests;
      while (pending.length && !cancelled) {
        const batch = await Promise.all(pending.map(async ({ id, category, chunk }) => {
          const data = await load<{ entries: Record<string, ReferenceEntry> }>(`${category}/${chunk}.json`);
          const entry = data.entries[id];
          if (!entry) throw new Error(`Missing reference entry: ${id}`);
          return entry;
        }));
        batch.forEach((entry) => entries.set(entry.id, entry));
        const related = new Set(batch.flatMap((entry) => entry.sections.flatMap((section) => section.links ?? []))
          .filter((link) => request.relatedCategories.includes(link.category) && !entries.has(link.id)).map((link) => link.id));
        pending = [...related].map((id) => {
          const summary = summariesById.get(id);
          if (!summary) throw new Error(`Missing related reference: ${id}`);
          return summary;
        });
      }
      return [...entries.values()].map(currentDungeonEntry);
    };
    void resolve().then((data) => {
      if (!cancelled) setResult({ key, state: { status: "ready", data } });
    }).catch((error: unknown) => {
      console.error("Failed to load reference entries", error);
      if (!cancelled) setResult({ key, state: { status: "error" } });
    });
    return () => { cancelled = true; };
  }, [key]);
  return result?.key === key ? result.state : { status: "loading" };
}

export function useReferenceEntry(summary: ReferenceSummary | undefined): LoadState<ReferenceEntry> {
  const result = useData<{ entries: Record<string, ReferenceEntry> }>(summary ? `${summary.category}/${summary.chunk}.json` : null);
  if (result.status !== "ready") return result;
  const entry = summary && result.data.entries[summary.id];
  return entry ? { status: "ready", data: currentDungeonEntry(entry) } : { status: "error" };
}

export function useSkillDamage(summary: ReferenceSummary | undefined): LoadState<SkillDamageRecord | null> {
  const result = useData<{ skills: Record<string, SkillDamageRecord> }>(summary?.category === "skills" ? `skill-damage/${summary.chunk}.json` : null);
  if (result.status !== "ready") return result;
  return { status: "ready", data: result.data.skills[summary!.id] ?? null };
}

export function useItemReference(itemId: string): LoadState<ReferenceSection[]> {
  const result = useData<{ items: Record<string, ReferenceSection[]> }>(`items/${itemId.slice(0, 3)}.json`);
  return result.status === "ready" ? { status: "ready", data: result.data.items[itemId] ?? [] } : result;
}

/** Resolve container reward-table IDs from the same cached item-reference chunks. */
export function useItemReferences(itemIds: string[]): LoadState<Record<string, ReferenceSection[]>> {
  const key = JSON.stringify([...new Set(itemIds)].sort());
  const [result, setResult] = useState<{ key: string; state: LoadState<Record<string, ReferenceSection[]>> } | null>(null);
  useEffect(() => {
    const ids = JSON.parse(key) as string[];
    if (!ids.length) return;
    let cancelled = false;
    const prefixes = [...new Set(ids.map((id) => id.slice(0, 3)))];
    void Promise.all(prefixes.map((prefix) => load<{ items: Record<string, ReferenceSection[]> }>(`items/${prefix}.json`)))
      .then((chunks) => {
        const data = Object.fromEntries(ids.map((id) => [id, chunks[prefixes.indexOf(id.slice(0, 3))].items[id] ?? []]));
        if (!cancelled) setResult({ key, state: { status: "ready", data } });
      }).catch((error: unknown) => {
        console.error("Failed to load container item references", error);
        if (!cancelled) setResult({ key, state: { status: "error" } });
      });
    return () => { cancelled = true; };
  }, [key]);
  return key === "[]" ? { status: "ready", data: {} } : result?.key === key ? result.state : { status: "loading" };
}
