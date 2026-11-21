import { GAME_GUIDE_ITEM_ALIASES } from "../../game-config.ts";
import english from "./guide-names.json" with { type: "json" };

const englishNames: Readonly<Record<string, string>> = english;

export const gameKnowledgeCanonicalItemId = (id: string): string => {
  const [namespace, path] = id.split(":");
  if (!namespace || !path) return id;
  const [item, variant] = path.split("/");
  const aliasedItem = GAME_GUIDE_ITEM_ALIASES[item] ?? item;
  return `${namespace}:${variant ? `${aliasedItem}/${variant}` : aliasedItem}`;
};

/** Recipe catalogs store placeable blocks and ordinary items in one item registry. */
export const gameKnowledgeRecipeSubjectKind = (id: string): "block" | "item" => {
  const [namespace, path] = id.split(":");
  const canonicalPath = gameKnowledgeCanonicalItemId(id).split(":")[1];
  return namespace && path && (englishNames[`block.${namespace}.${path}`]
    || canonicalPath && englishNames[`block.${namespace}.${canonicalPath}`]) ? "block" : "item";
};
