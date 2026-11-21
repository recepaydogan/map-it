import type { ValidatedItemCatalog } from "./item-catalog-artifact.ts";
import type { ValidatedMechanicsCatalog } from "./mechanics-types.ts";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { ValidatedBiomeGuideCatalog } from "./biome-guide-artifact.ts";

export interface KnowledgeCatalogs {
  readonly items?: ValidatedItemCatalog | null;
  readonly recipes: ValidatedRecipeCatalog | null;
  readonly mechanics: ValidatedMechanicsCatalog | null;
  readonly biomes?: ValidatedBiomeGuideCatalog | null;
}

export const EMPTY_KNOWLEDGE_CATALOGS: KnowledgeCatalogs = Object.freeze({ items: null, recipes: null, mechanics: null });

/** Inspector history is valid only while all validated catalog revisions stay unchanged. */
export const knowledgeCatalogRevision = (catalogs: KnowledgeCatalogs) =>
  `items:${catalogs.items?.source.revision ?? "none"}|recipes:${catalogs.recipes?.source.revision ?? "none"}|mechanics:${catalogs.mechanics?.source.revision ?? "none"}|biomes:${catalogs.biomes?.source.revision ?? "none"}`;

export const availableKnowledgeItemIds = (catalogs: KnowledgeCatalogs): Set<string> => {
  const ids = new Set(catalogs.items?.items ?? []);
  for (const id of Object.keys(catalogs.recipes?.index.produces ?? {})) ids.add(id);
  for (const id of Object.keys(catalogs.recipes?.index.usesItem ?? {})) ids.add(id);
  for (const subject of catalogs.mechanics?.subjects ?? [])
    if (subject.kind === "item" || subject.kind === "block") ids.add(subject.id);
  return ids;
};
