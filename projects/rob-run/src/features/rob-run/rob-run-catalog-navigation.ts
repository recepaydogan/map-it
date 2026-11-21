import { createContext, useContext, type ReactNode } from "react";

export const ROB_RUN_CATALOG_EVENT = "rob-run:open-catalog-item";
export const ROB_RUN_WIKI_NAVIGATION = "rob-run:open-wiki-record";

export type RobRunWikiTarget = {
  page: "barters" | "shipments" | "loot" | "cargo" | "collections" | "vendors" | "heists";
  id: string;
  calculator?: boolean;
  realmVersion?: number;
};

export type RobRunPreviewTarget = {
  page: "items" | Exclude<RobRunWikiTarget["page"], "heists">;
  id: string;
  name: string;
  vendorItemId?: string;
  realmVersion?: number;
};

export const RobRunPreviewRendererContext = createContext<((target: RobRunPreviewTarget) => ReactNode) | null>(null);
export const RobRunPreviewContext = createContext<{
  target: RobRunPreviewTarget | null;
  open: (target: RobRunPreviewTarget) => void;
  close: () => void;
} | null>(null);

export function openRobRunPreviewAsPage({ page, id, realmVersion }: RobRunPreviewTarget) {
  if (page === "items") openRobRunCatalogItem(id);
  else openRobRunWikiRecord({ page, id, realmVersion });
}

export const useRobRunPreview = () => useContext(RobRunPreviewContext);

export function openRobRunCatalogItem(itemId: string) {
  window.dispatchEvent(new CustomEvent(ROB_RUN_CATALOG_EVENT, { detail: itemId }));
}

export function openRobRunWikiRecord(target: RobRunWikiTarget) {
  window.dispatchEvent(new CustomEvent(ROB_RUN_WIKI_NAVIGATION, { detail: target }));
}

