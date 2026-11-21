import { filterMechanicsCatalogToItems, filterRecipeCatalogToItems } from "./filter-knowledge-catalogs.ts";
import { ITEM_CATALOG_FILE_LIMIT, parseItemCatalogArtifact, type ItemCatalogIdentity } from "./item-catalog-artifact.ts";
import { MECHANICS_CATALOG_FILE_LIMIT, parseMechanicsCatalogArtifact } from "./mechanics-catalog-artifact.ts";
import { parseRecipeCatalogArtifact, RECIPE_CATALOG_FILE_LIMIT, type RecipeCatalogIdentity } from "./recipe-catalog-artifact.ts";
import type { KnowledgeCatalogs } from "./knowledge-catalogs.ts";
import { mergeRecipeCatalogs } from "./merge-recipe-catalogs.ts";
import { BIOME_GUIDE_FILE_LIMIT, parseBiomeGuideArtifact } from "./biome-guide-artifact.ts";

export interface RemoteKnowledgeCatalogRequest {
  readonly baseUrl: string;
  readonly edition: string;
  readonly version: string;
  readonly itemIdentity?: ItemCatalogIdentity | null;
  readonly recipeIdentity: RecipeCatalogIdentity | null;
  readonly brewingIdentity?: RecipeCatalogIdentity;
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
}

const catalogUrl = (baseUrl: string, edition: string, version: string, file: string) =>
  `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(edition)}/${encodeURIComponent(version)}/${file}`;

const readJson = async (response: Response, limit: number): Promise<unknown | null> => {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Knowledge catalog request failed with ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > limit) throw new Error("Knowledge catalog exceeds the size limit.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 2 || bytes.byteLength > limit) throw new Error("Knowledge catalog has an invalid size.");
  return JSON.parse(new TextDecoder().decode(bytes));
};

/** Fetches exact edition/version catalogs without cookies and validates every relationship before use. */
export const loadRemoteKnowledgeCatalogs = async ({ baseUrl, edition, version, itemIdentity, recipeIdentity, brewingIdentity, signal,
  fetcher = fetch }: RemoteKnowledgeCatalogRequest): Promise<KnowledgeCatalogs> => {
  const request = (file: string) => fetcher(catalogUrl(baseUrl, edition, version, file), {
    method: "GET", credentials: "omit", cache: "no-cache", redirect: "error", signal,
    headers: { Accept: "application/json" },
  });
  const [itemResponse, recipeResponse, mechanicsResponse, brewingResponse, biomeResponse] = await Promise.all([
    itemIdentity ? request("items.json") : null,
    recipeIdentity ? request("recipes.json") : null,
    request("mechanics.json"),
    brewingIdentity ? request("brewing.json") : null,
    request("biomes.json"),
  ]);
  const [itemArtifact, recipeArtifact, mechanicsArtifact, biomeArtifact] = await Promise.all([
    itemResponse ? readJson(itemResponse, ITEM_CATALOG_FILE_LIMIT) : null,
    recipeResponse ? readJson(recipeResponse, RECIPE_CATALOG_FILE_LIMIT) : null,
    readJson(mechanicsResponse, MECHANICS_CATALOG_FILE_LIMIT),
    readJson(biomeResponse, BIOME_GUIDE_FILE_LIMIT),
  ]);
  if (itemIdentity && !itemArtifact) throw new Error("The selected version's item catalog is unavailable.");
  const items = itemArtifact && itemIdentity ? parseItemCatalogArtifact(itemArtifact, itemIdentity) : null;
  const availableItems = items ? new Set(items.items) : null;
  const catalog = recipeArtifact && recipeIdentity ? parseRecipeCatalogArtifact(recipeArtifact, recipeIdentity) : null;
  const brewingArtifact = brewingResponse ? await readJson(brewingResponse, RECIPE_CATALOG_FILE_LIMIT) : null;
  const brewing = brewingArtifact && brewingIdentity ? parseRecipeCatalogArtifact(brewingArtifact, brewingIdentity) : null;
  const mechanics = mechanicsArtifact ? parseMechanicsCatalogArtifact(mechanicsArtifact, { edition, version }) : null;
  const biomes = biomeArtifact ? parseBiomeGuideArtifact(biomeArtifact, { edition, version }) : null;
  return Object.freeze({
    items,
    recipes: mergeRecipeCatalogs(availableItems ? filterRecipeCatalogToItems(catalog, availableItems) : catalog,
      availableItems ? filterRecipeCatalogToItems(brewing, availableItems) : brewing),
    mechanics: availableItems ? filterMechanicsCatalogToItems(mechanics, availableItems) : mechanics,
    biomes,
  });
};
