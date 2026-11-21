import { useEffect, useMemo, useState } from "react";
import { hasUnrevealedName, nativeEntryName } from "./native-wiki-presentation";
import { contentUrl } from "../../lib/content-url";
import { useAppLanguage } from "../../i18n/app-language";
import { getGameTextRevision, useGameText } from "../../i18n/game-text";
import { localizeNativeDocument } from "../../i18n/native-wiki-localization";
import i18n from "../../i18n";

export interface NativeWikiTarget { id: string; category: string; name: string; icon?: string }
export interface NativeWikiSummary extends NativeWikiTarget { nativeId: string; group: string; unnamed: boolean; lootPreview?: string; locationMapIds?: string[] }
export interface NativeWikiLocation { mapId: string; markerId: string; name: string; kind?: "authored-spawn-anchor"; spawnId?: string }
export interface NativeSpawnAnchor {
  id: string; kind: string; source: string; source_pointer: string; evidence_file: string;
  world_location: { X: number; Y: number; Z: number };
  native_conditions?: { ShouldSpawn?: boolean; [key: string]: unknown };
  native_domain_fields?: Record<string, unknown>; native_fields?: Record<string, unknown>;
  map_record_ids?: string[];
}
export interface NativeAcquisition {
  spawn_ids?: string[];
  containerId?: string;
  id: string; kind: string; record: string; native_item_id: string | null; source: string; source_pointer: string;
  native: Record<string, unknown>; enemy_level?: number; item_level?: string; loot_item_id?: string;
  actor?: NativeWikiTarget; actors?: NativeWikiTarget[]; items?: NativeWikiTarget[];
}
export interface NativeWikiEntry extends NativeWikiSummary {
  quest?: { type?: string; stages: { id: string; title?: string; description?: string; initial: boolean; markers: { id: string; kind: "acceptance" | "objective" }[] }[] };
  canonicalTarget?: NativeWikiTarget;
  sceneEvents?: { id: string; kind: string; target_spawn_ids: string[]; source: string; source_pointer: string }[];
  encounterRules?: { id: string; kind: string; target_spawn_ids: string[]; sourceActors: NativeWikiTarget[]; source: string; source_pointer: string }[];
  combatLoot?: { file: string; record: string }[];
  build: string; artwork?: string; source: string; sourcePointer?: string; boss?: boolean; mapId?: string;
  regionMaps?: { mapId: string; name: string }[];
  noticeKey?: string; regionMapsTitleKey?: string;
  spawnAnchors?: NativeSpawnAnchor[];
  containerAnchors?: NativeSpawnAnchor[];
  locationResolution?: { targetId: string; identityKeys: string[]; originalMapId: string; targetMapId: string };
  facts: Record<string, unknown>; attributes?: Record<string, { fields?: Record<string, unknown>; native_value?: unknown; native_type?: string }>;
  sections: { label: string; value: unknown }[]; descriptions: { label: string; text: string }[];
  links: NativeWikiTarget[]; locations: NativeWikiLocation[]; acquisition?: NativeAcquisition[]; drops?: NativeAcquisition[];
  combatRewards?: NativeAcquisition[];
  sceneAcquisition?: NativeAcquisition[];
  flowRewards?: NativeAcquisition[];
  markerRewards?: NativeAcquisition[];
  markerPresentation?: { kind: "chest" | "pickup" | "dust" | "encounter" | "quest"; category: string; nameKey: string; labelKey: string; containerIds: string[] };
  assets: { field: string; asset: string }[]; native: unknown;
}
export interface NativeWikiIndex { version: 1; build: string; entries: NativeWikiSummary[]; redirects?: Record<string, NativeWikiTarget>; categories: Record<string, number>; itemsByNativeId: Record<string, NativeWikiTarget[]>; assetBase: string }
type State<T> = { status: "loading" } | { status: "error" } | { status: "ready"; data: T };
const requests = new Map<string, Promise<unknown>>();
const localizedDocuments = new WeakMap<object, Map<string, unknown>>();
const presentedIndexes = new WeakMap<NativeWikiIndex, NativeWikiIndex>();
export function useNativeJson<T>(path: string | undefined): State<T> {
  const language = useAppLanguage();
  const gameText = useGameText();
  const [state, setState] = useState<{ path?: string; value: State<T> }>({ path, value: { status: "loading" } });
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let request = requests.get(path);
    if (!request) {
      request = fetch(contentUrl(path)).then(response => {
        if (!response.ok) throw new Error(`Wiki request failed: ${response.status}`);
        return response.json() as Promise<unknown>;
      });
      requests.set(path, request);
      void request.catch(() => requests.delete(path));
    }
    void request.then(data => { if (!cancelled) setState({ path, value: { status: "ready", data: data as T } }); },
      () => { if (!cancelled) setState({ path, value: { status: "error" } }); });
    return () => { cancelled = true; };
  }, [path]);
  if (state.path !== path) return { status: "loading" };
  if (state.value.status !== "ready" || language === "en" || !path || !state.value.data || typeof state.value.data !== "object") return state.value;
  let cached = localizedDocuments.get(state.value.data);
  if (!cached) { cached = new Map(); localizedDocuments.set(state.value.data, cached); }
  const key = `${language}:${getGameTextRevision()}`;
  if (!cached.has(key)) cached.set(key, localizeNativeDocument(path, state.value.data, gameText, (name, values) => String(i18n.t(name, values ?? {}))));
  return { status: "ready", data: cached.get(key) as T };
}
export const useNativeWikiIndex = () => {
  const state = useNativeJson<NativeWikiIndex>("data/wiki/index.json");
  return useMemo((): State<NativeWikiIndex> => {
    if (state.status !== "ready") return state;
    let data = presentedIndexes.get(state.data);
    if (!data) {
      data = { ...state.data,
      entries: state.data.entries.map(entry => ({ ...entry, unnamed: hasUnrevealedName(entry), name: nativeEntryName(entry) })),
      itemsByNativeId: Object.fromEntries(Object.entries(state.data.itemsByNativeId).map(([key, entries]) => [key, entries.map(entry => ({ ...entry, name: nativeEntryName(entry) }))])),
      };
      // Unreal item IDs are FNames: references can use different letter casing.
      for (const [id, targets] of Object.entries(data.itemsByNativeId)) {
        const folded = id.toLowerCase();
        data.itemsByNativeId[folded] ??= targets;
      }
      presentedIndexes.set(state.data, data);
    }
    return { status: "ready", data };
  }, [state]);
};
export const NATIVE_WIKI_CATEGORIES = new Set(["items", "creatures", "world-bosses", "npcs", "discoveries", "quests"]);
