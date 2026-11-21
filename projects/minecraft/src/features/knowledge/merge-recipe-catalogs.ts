import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";

/** Combine independently validated sources for the same release without rewriting recipe provenance. */
export const mergeRecipeCatalogs = (left: ValidatedRecipeCatalog | null, right: ValidatedRecipeCatalog | null): ValidatedRecipeCatalog | null => {
  if (!left) return right;
  if (!right) return left;
  if (left.source.edition !== right.source.edition || left.source.version !== right.source.version)
    throw new Error("Guide sources must describe the same edition and version");
  const recipes = [...left.recipes, ...right.recipes];
  if (new Set(recipes.map(recipe => recipe.id)).size !== recipes.length) throw new Error("Guide sources contain duplicate recipe identities");
  const merge = (a: Record<string, string[]>, b: Record<string, string[]>) => Object.fromEntries(
    [...new Set([...Object.keys(a), ...Object.keys(b)])].map(key => [key, [...new Set([...(a[key] ?? []), ...(b[key] ?? [])])]]));
  return { source: { ...left.source, revision: `${left.source.revision}+${right.source.revision}` }, recipes,
    index: { produces: merge(left.index.produces, right.index.produces), usesItem: merge(left.index.usesItem, right.index.usesItem),
      usesTag: merge(left.index.usesTag, right.index.usesTag), tagMembers: merge(left.index.tagMembers, right.index.tagMembers),
      unresolvedTags: { ...left.index.unresolvedTags, ...right.index.unresolvedTags } } };
};
