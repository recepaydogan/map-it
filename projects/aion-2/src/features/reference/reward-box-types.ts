import type { ItemAcquisition } from "../database/item-database-types";
import type { ReferenceFact, ReferenceLink, ReferenceSection } from "./reference-types";

export interface RewardBoxVariant {
  id: string;
  facts: ReferenceFact[];
  sections: ReferenceSection[];
  flattened: boolean;
}

export interface RewardBoxFamily {
  id: string;
  name: string;
  icon?: string;
  kind: "gameplay" | "store" | "unknown";
  technical: boolean;
  preview: { name: string; quantity: number }[];
  items: ReferenceLink[];
  variants: RewardBoxVariant[];
  sources: ReferenceLink[];
  acquisition: ItemAcquisition;
}

export interface RewardBoxCatalog {
  version: 1;
  families: RewardBoxSummary[];
}

export type RewardBoxSummary = Pick<RewardBoxFamily, "id" | "name" | "icon" | "kind" | "technical" | "preview"> & {
  variantIds: string[];
  chunk: string;
};
