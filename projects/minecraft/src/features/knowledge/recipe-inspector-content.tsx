import type { TFunction } from "i18next";
import type { InspectorSubject } from "../inspector/inspector-controller";
import type { InspectorContent, InspectorLink, InspectorSection } from "../inspector/inspector-types";
import RecipeDiagram from "./recipe-diagram";
import { resolveRecipeIngredientChoices } from "./recipe-ingredient-choices";
import { createRecipeSubjectDisplay, type RecipeSubjectDisplay } from "./recipe-subject-display";
import type { CatalogRecipe, RecipeIngredient } from "./recipe-types";
import type { RecipeIndex } from "./recipe-index";

export interface RecipeInspectorCatalog { recipes: readonly CatalogRecipe[]; index: RecipeIndex }

const USED_IN_PREVIEW_SIZE = 4;

/** A guide-only view adapter. Recipes never acquire coordinates, found state or live marker status. */
export const createRecipeInspectorResolver = (catalog: RecipeInspectorCatalog, fallback: RecipeSubjectDisplay, t: TFunction) => {
  const byId = new Map(catalog.recipes.map(recipe => [recipe.id, recipe]));
  const display = createRecipeSubjectDisplay(catalog, fallback);
  const link = (kind: "item" | "recipe" | "tag", id: string, key: string, quantity?: number, note?: string): InspectorLink =>
    ({ key, subject: { kind, id }, ...display(kind, id), quantity, note });
  const recipeLinks = (ids: readonly string[], prefix: string) => ids.map(id => {
    const recipe = byId.get(id); if (!recipe) throw new Error("Recipe index contains an unresolved relationship");
    return link("recipe", id, `${prefix}:${id}`, undefined, t(recipe.method === "smithing" ? "inspector.smithingTitle" : `inspector.methods.${recipe.method}`));
  });
  const recipeDetails = (recipe: CatalogRecipe): Pick<InspectorContent, "body" | "bodyUnframed" | "category" | "contextLabel" | "sections"> => {
    const groups = new Map<string, RecipeIngredient>();
    for (const ingredient of recipe.ingredients) {
      const key = JSON.stringify(ingredient.choices), previous = groups.get(key);
      groups.set(key, { choices: ingredient.choices, count: ingredient.count + (previous?.count ?? 0) });
    }
    const singles: InspectorLink[] = [], alternatives: InspectorSection[] = [];
    [...groups.values()].forEach((ingredient, index) => {
      const choices = resolveRecipeIngredientChoices(ingredient, catalog.index.tagMembers)
        .map((choice, option) => link(choice.kind, choice.id, `input:${index}:${option}`, ingredient.count,
        choice.data === undefined ? undefined : t("inspector.variant", { value: choice.data })));
      const [primary, ...acceptedAlternatives] = choices;
      if (primary) singles.push(primary);
      if (acceptedAlternatives.length) alternatives.push({ key: `choice:${index}`,
        title: t("crafting.alternatives", { count: acceptedAlternatives.length }), links: acceptedAlternatives, collapsed: true });
    });
    return {
      category: t(recipe.method === "smithing" ? "inspector.smithingTitle" : `inspector.methods.${recipe.method}`),
      contextLabel: `${recipe.source.edition} · ${recipe.source.version}`,
      body: <RecipeDiagram recipe={recipe} display={display} />,
      bodyUnframed: true,
      sections: [
        ...(singles.length ? [{ key: "ingredients", title: t("inspector.ingredients"), links: singles }] : []),
        ...alternatives,
        ...(recipe.stations.length ? [{ key: "stations", title: t("inspector.stations"),
          links: recipe.stations.map(id => link("item", id, `station:${id}`, undefined, t("inspector.stationNote"))) }] : []),
      ],
    };
  };
  return (subject: InspectorSubject): InspectorContent | null => {
    if (subject.kind === "recipe") {
      const recipe = byId.get(subject.id); if (!recipe) return null;
      return { ...display("recipe", recipe.id), ...recipeDetails(recipe) };
    }
    if (subject.kind === "item" || subject.kind === "block") {
      const outputs = catalog.index.produces[subject.id] ?? [], uses = catalog.index.usesItem[subject.id] ?? [];
      if (!outputs.length && !uses.length) return null;
      const primaryRecipe = outputs.length ? byId.get(outputs[0]) : undefined;
      if (outputs.length && !primaryRecipe) throw new Error("Recipe index contains an unresolved output relationship");
      const primary = primaryRecipe ? recipeDetails(primaryRecipe) : null;
      return { ...display(subject.kind, subject.id), category: primary?.category ?? t(`inspector.${subject.kind}`),
        ...(primary?.contextLabel ? { contextLabel: primary.contextLabel } : {}), body: primary?.body, sections: [
        ...(primary?.sections?.filter(section => section.key !== "outputs") ?? []),
        ...(uses.length ? [{ key: "uses", title: t("inspector.usedIn"), links: recipeLinks(uses, "uses"),
          previewSize: USED_IN_PREVIEW_SIZE }] : []),
      ] };
    }
    if (subject.kind === "tag") {
      const uses = catalog.index.usesTag[subject.id] ?? [];
      if (!uses.length) return null;
      const members = catalog.index.tagMembers[subject.id] ?? [];
      return { ...display("tag", subject.id), category: t("inspector.ingredientGroup"),
        description: t(catalog.index.unresolvedTags[subject.id] ? "inspector.unresolvedGroup" : "inspector.groupDescription"),
        sections: [
          ...(members.length ? [{ key: "members", title: t("inspector.knownMembers"), links: members.map(id => link("item", id, `member:${id}`)) }] : []),
          { key: "uses", title: t("inspector.usedIn"), links: recipeLinks(uses, "group"), previewSize: USED_IN_PREVIEW_SIZE },
        ] };
    }
    return null;
  };
};
