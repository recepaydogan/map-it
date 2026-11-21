import type { ReferenceLink } from "../reference/reference-types";

const OPERATIONS = {
  Enchant: "enchant",
  ExceedEnchant: "amplification",
  ItemSurpass: "potential",
  ItemSoulAdd: "awakening",
  ItemSuccession: "transfer",
  SoulBindCost: "binding",
} as const;

export type UpgradeOperation = typeof OPERATIONS[keyof typeof OPERATIONS] | "reset";
export interface UpgradeOption { id: string; operation: UpgradeOperation; link: ReferenceLink }

export const getUpgradeOperation = (link: ReferenceLink) =>
  OPERATIONS[link.id.split(":")[0] as keyof typeof OPERATIONS];

export const getUpgradeOptions = (links: ReferenceLink[]): UpgradeOption[] => {
  const options: UpgradeOption[] = [];
  for (const link of links) {
    const operation = getUpgradeOperation(link);
    if (!operation) continue;
    options.push({ id: link.id, operation, link });
    if (operation === "binding") options.push({ id: `${link.id}:reset`, operation: "reset", link });
  }
  return options;
};
