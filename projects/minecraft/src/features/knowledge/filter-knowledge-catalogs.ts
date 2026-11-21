import type { InspectorSubject } from "../inspector/inspector-controller.ts";
import type { KnowledgeSubjectRef, ValidatedMechanicsCatalog } from "./mechanics-types.ts";
import { buildRecipeIndex, type ResolvedRecipeTag } from "./recipe-index.ts";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";

const isItemSubject = (subject: Pick<InspectorSubject, "kind">) => subject.kind === "item" || subject.kind === "block";
const isAvailable = (subject: Pick<InspectorSubject, "kind" | "id">, items: ReadonlySet<string>) =>
  !isItemSubject(subject) || items.has(subject.id);

/** Fail closed at the catalog boundary so absent items cannot leak through diagrams, links or transactions. */
export const filterRecipeCatalogToItems = (catalog: ValidatedRecipeCatalog | null,
  items: ReadonlySet<string>): ValidatedRecipeCatalog | null => {
  if (!catalog) return null;
  const tagMembers = Object.fromEntries(Object.entries(catalog.index.tagMembers)
    .map(([tag, members]) => [tag, members.filter(item => items.has(item))]));
  const recipes = catalog.recipes.flatMap(recipe => {
    const outputs = recipe.outputs.filter(output => items.has(output.id));
    const ingredients = recipe.ingredients.map(ingredient => ({ ...ingredient, choices: ingredient.choices.filter(choice =>
      choice.kind === "item" ? items.has(choice.id) : Boolean(tagMembers[choice.id]?.length)) }));
    if ((!outputs.length && !recipe.smithingTrim) || ingredients.some(ingredient => !ingredient.choices.length)) return [];
    return [{ ...recipe, outputs, ingredients, stations: recipe.stations.filter(station => items.has(station)) }];
  });
  if (!recipes.length) return null;
  const resolveTag = (tag: string): ResolvedRecipeTag => ({ items: [...(tagMembers[tag] ?? [])], missing: [], cycles: [],
    complete: !Object.prototype.hasOwnProperty.call(catalog.index.unresolvedTags, tag) });
  return Object.freeze({ source: catalog.source, recipes: Object.freeze(recipes), index: buildRecipeIndex(recipes, resolveTag) });
};

const mechanicReferences = (mechanic: ValidatedMechanicsCatalog["mechanics"][number]): readonly KnowledgeSubjectRef[] =>
  [mechanic.subject, ...mechanic.requirements, ...mechanic.inputs, ...mechanic.outputs, ...mechanic.related];

export const filterMechanicsCatalogToItems = (catalog: ValidatedMechanicsCatalog | null,
  items: ReadonlySet<string>): ValidatedMechanicsCatalog | null => {
  if (!catalog) return null;
  const mechanics = catalog.mechanics.filter(mechanic => mechanicReferences(mechanic).every(subject => isAvailable(subject, items)));
  const mechanicIds = new Set(mechanics.map(mechanic => mechanic.id));
  const subjects = catalog.subjects.filter(subject => isAvailable(subject, items)).map(subject =>
    subject.image && !isAvailable(subject.image, items) ? Object.freeze({ ...subject, image: undefined }) : subject);
  const subjectKeys = new Set(subjects.map(subject => `${subject.kind}:${subject.id}`));
  const index = Object.freeze(Object.fromEntries(Object.entries(catalog.index)
    .filter(([key]) => subjectKeys.has(key))
    .map(([key, ids]) => [key, Object.freeze(ids.filter(id => mechanicIds.has(id)))])
    .filter(([, ids]) => ids.length)));
  return Object.freeze({ source: catalog.source, subjects: Object.freeze(subjects), mechanics: Object.freeze(mechanics), index });
};
