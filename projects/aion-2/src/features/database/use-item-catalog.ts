import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";
import type { ItemCatalog } from "./item-database-types";

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: ItemCatalog }
  | { status: "error" };

const isCatalog = (value: unknown): value is ItemCatalog => {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<ItemCatalog>;
  return catalog.version === 2 && Array.isArray(catalog.items) && Array.isArray(catalog.recipes);
};

let catalogRequest: Promise<ItemCatalog> | null = null;
const loadCatalog = () => {
  catalogRequest ??= fetch(contentUrl("data/items/catalog.json")).then(async (response) => {
    if (!response.ok) throw new Error(`Item catalog: HTTP ${response.status}`);
    const value: unknown = await response.json();
    if (!isCatalog(value)) throw new Error("Item catalog has an invalid format");
    return value;
  }).catch((error: unknown) => { catalogRequest = null; throw error; });
  return catalogRequest;
};

export const useItemCatalog = (): CatalogState => {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    loadCatalog().then((catalog) => {
      if (!cancelled) setState({ status: "ready", catalog });
    }).catch((error: unknown) => {
      console.error("Failed to load the item catalog", error);
      if (!cancelled) setState({ status: "error" });
    });
    return () => { cancelled = true; };
  }, []);
  return state;
};
