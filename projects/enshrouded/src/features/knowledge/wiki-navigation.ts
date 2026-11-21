import pages from "../../../public/data/enshrouded/wiki-page-index.json";
import pageCatalogs from "../../../public/data/enshrouded/wiki-page-catalog-index.json";

export const WIKI_NAVIGATION_EVENT = "enshrouded:open-wiki";
export const WIKI_CATALOGS = ["collectibles", "comfort", "decorations", "equipment"] as const;
export type WikiCatalog = typeof WIKI_CATALOGS[number];
export const isWikiCatalogPage = (page: string): page is WikiCatalog =>
  WIKI_CATALOGS.some((catalog) => catalog === page);

const normalizedPages = new Set(pages.map((page) => page.replace(/_/g, " ").toLocaleLowerCase("en")));
const normalizedCatalogs = new Map(Object.entries(pageCatalogs).map(([page, catalog]) =>
  [page.replace(/_/g, " ").toLocaleLowerCase("en"), catalog as WikiCatalog]));

export const hasWikiPage = (name: string | null | undefined): boolean => Boolean(name
  && normalizedPages.has(name.replace(/_/g, " ").toLocaleLowerCase("en")));
export const wikiCatalogForPage = (name: string | null | undefined): WikiCatalog | undefined => name
  ? normalizedCatalogs.get(name.replace(/_/g, " ").toLocaleLowerCase("en")) : undefined;
