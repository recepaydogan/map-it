import type { ClassCatalog } from "./class-types";

export interface ClassCatalogLocalePack {
  version: 1;
  translations: Record<string, string>;
}

export function localizeClassCatalog(catalog: ClassCatalog, pack: ClassCatalogLocalePack): ClassCatalog {
  if (pack.version !== 1 || !pack.translations || typeof pack.translations !== "object") {
    throw new Error("Invalid class catalog locale pack");
  }
  const output = structuredClone(catalog);
  const localize = (description: string) => {
    const text = pack.translations[description];
    if (!text) return description;
    if (typeof text !== "string" || !text.trim() || text === description) {
      throw new Error("Invalid class catalog translation");
    }
    return text;
  };
  for (const entry of output.classes) {
    for (const tree of entry.trees) for (const talent of tree.new) {
      talent.description = localize(talent.description);
    }
    for (const ability of entry.abilities.new) ability.description = localize(ability.description);
  }
  return output;
}
