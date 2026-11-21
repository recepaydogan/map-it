import { contentUrl } from "../../lib/content-url";
import { useEffect, useState } from "react";
import type { DatabaseItem, ItemCatalog, ItemStat } from "./item-database-types";

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: ItemCatalog }
  | { status: "error" };

const isCatalog = (value: unknown): value is ItemCatalog => {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<ItemCatalog>;
  return catalog.version === 2 && Array.isArray(catalog.items) && Array.isArray(catalog.recipes);
};

const effectKey = (effect: NonNullable<DatabaseItem["siteEffects"]>[number]) => `${effect.kind}:${effect.text
  .toLocaleLowerCase("en")
  .replace(/\b(?:hours?|hrs?)\b/g, "hour")
  .replace(/\b(?:minutes?|mins?)\b/g, "minute")
  .replace(/\b(?:seconds?|secs?)\b/g, "second")
  .replace(/\s+/g, " ").trim()}`;

const mergeSiteEffects = (base: DatabaseItem["siteEffects"], addition: DatabaseItem["siteEffects"]) => {
  const unique = new Map<string, NonNullable<DatabaseItem["siteEffects"]>[number]>();
  for (const effect of [...base ?? [], ...addition ?? []]) unique.set(effectKey(effect), effect);
  return [...unique.values()];
};

let catalogRequest: Promise<ItemCatalog> | null = null;
const loadCatalog = () => {
  catalogRequest ??= fetch(contentUrl(`data/items/catalog.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Item catalog: HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!isCatalog(value)) throw new Error("Item catalog has an invalid format");
    const enrichment = await fetch(contentUrl("data/items/foreverdb-enrichment.json"))
      .then(async (enrichmentResponse) => {
        if (!enrichmentResponse.ok) throw new Error(`HTTP ${enrichmentResponse.status}`);
        const parsed = await enrichmentResponse.json() as {
          version: 2;
          entries: Record<string, {
            current?: {
              name?: string; itemLevel?: number; usageLevel?: number; allowedClasses?: string[];
              stats?: ItemStat[]; siteEffects?: DatabaseItem["siteEffects"];
              spellLinks?: DatabaseItem["spellLinks"]; itemSets?: DatabaseItem["itemSets"];
            };
            stats?: ItemStat[];
            siteEffects?: DatabaseItem["siteEffects"];
            spellLinks?: DatabaseItem["spellLinks"];
            clientDetails?: DatabaseItem["clientDetails"];
            description?: string;
            allowedClasses?: string[];
            itemLevel?: number;
            usageLevel?: number;
            forever?: boolean;
            previewReasons?: DatabaseItem["previewReasons"];
            itemSets?: DatabaseItem["itemSets"];
            classicChanges?: DatabaseItem["classicChanges"];
          }>;
          newItems: DatabaseItem[];
        };
        if (parsed.version !== 2 || !parsed.entries || typeof parsed.entries !== "object" || !Array.isArray(parsed.newItems)) {
          throw new Error("Invalid item enrichment format");
        }
        return parsed;
      })
      .catch((error: unknown) => {
        console.warn("Item enrichment is unavailable; showing the base catalog", error);
        return { entries: {}, newItems: [] } as {
          entries: Record<string, {
            current?: {
              name?: string; itemLevel?: number; usageLevel?: number; allowedClasses?: string[];
              stats?: ItemStat[]; siteEffects?: DatabaseItem["siteEffects"];
              spellLinks?: DatabaseItem["spellLinks"]; itemSets?: DatabaseItem["itemSets"];
            };
            stats?: ItemStat[]; siteEffects?: DatabaseItem["siteEffects"]; spellLinks?: DatabaseItem["spellLinks"];
            clientDetails?: DatabaseItem["clientDetails"]; description?: string; allowedClasses?: string[];
            itemLevel?: number; usageLevel?: number; forever?: boolean; previewReasons?: DatabaseItem["previewReasons"];
            itemSets?: DatabaseItem["itemSets"];
            classicChanges?: DatabaseItem["classicChanges"];
          }>;
          newItems: DatabaseItem[];
        };
      });
    const baseIds = new Set(value.items.map((item) => item.id));
    return { ...value, items: [...value.items.map((item) => {
      const addition = enrichment.entries[item.id];
      if (!addition) return item;
      const current = addition.current;
      const base = item.sections.find((section) => section.key === "base");
      const extraStats = current?.stats ? [] : addition.stats ?? [];
      return {
        ...item,
        name: current?.name ?? item.name,
        sections: current?.stats ? base
          ? item.sections.map((section) => section.key === "base" ? { ...section, stats: current.stats! } : section)
          : [{ key: "base", stats: current.stats }, ...item.sections]
          : extraStats.length ? base
          ? item.sections.map((section) => section.key === "base"
            ? { ...section, stats: [...section.stats, ...extraStats] } : section)
          : [{ key: "base", stats: extraStats }, ...item.sections] : item.sections,
        siteEffects: current?.siteEffects && current.siteEffects.length >= (item.siteEffects?.length ?? 0)
          ? current.siteEffects : mergeSiteEffects(item.siteEffects, addition.siteEffects),
        spellLinks: current?.spellLinks ?? [...item.spellLinks ?? [], ...addition.spellLinks ?? []],
        itemSets: current?.itemSets ?? [...item.itemSets ?? [], ...addition.itemSets ?? []],
        clientDetails: { ...item.clientDetails, ...addition.clientDetails },
        description: item.description ?? addition.description,
        allowedClasses: current?.allowedClasses ?? item.allowedClasses ?? addition.allowedClasses,
        itemLevel: current?.itemLevel ?? item.itemLevel ?? addition.itemLevel,
        usageLevel: current?.usageLevel ?? item.usageLevel ?? addition.usageLevel,
        forever: item.forever || addition.forever,
        previewReasons: addition.previewReasons,
        classicChanges: addition.classicChanges ?? item.classicChanges,
      };
    }), ...enrichment.newItems.filter((item) => !baseIds.has(item.id))] };
  }).catch((error: unknown) => { catalogRequest = null; throw error; });
  return catalogRequest;
};

export const useItemCatalog = (enabled = true): CatalogState => {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadCatalog().then((catalog) => {
      if (!cancelled) setState({ status: "ready", catalog });
    }).catch((error: unknown) => {
      console.error("Failed to load the item catalog", error);
      if (!cancelled) setState({ status: "error" });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
};
