import { ArrowRight, ChevronDown, ListFilter } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { cn } from "../../lib/cn.ts";
import GuideItemLink from "./guide-item-link.tsx";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import { fitsInventoryCrafting } from "./crafting-guide-data.ts";
import { resolveRecipeIngredientChoices } from "./recipe-ingredient-choices.ts";
import { RecipeSlot } from "./recipe-grid.tsx";
import { recipeSlotLayout } from "./recipe-slot-layout.ts";
import MapSelectDropdown from "../map/map-select-dropdown.tsx";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { IngredientChoice, RecipeIngredient, RecipeVisual } from "./recipe-types.ts";

const groupedIngredients = (recipe: RecipeVisual) => {
  const groups = new Map<string, RecipeIngredient>();
  for (const ingredient of recipe.ingredients) {
    const key = JSON.stringify(ingredient.choices), previous = groups.get(key);
    groups.set(key, { choices: ingredient.choices, count: ingredient.count + (previous?.count ?? 0) });
  }
  return [...groups.values()];
};

const CraftingSlot = ({ choice, catalog, display }: { choice?: IngredientChoice; catalog: ValidatedRecipeCatalog;
  display: RecipeSubjectDisplay }) => {
  const navigate = useGuideNavigation();
  const itemId = choice?.kind === "tag" ? catalog.index.tagMembers[choice.id]?.[0] : choice?.id;
  const shownChoice = itemId ? { kind: "item" as const, id: itemId } : choice;
  if (!choice) return <RecipeSlot display={display} compact />;
  return <button type="button" data-guide-item={itemId} aria-label={display(choice.kind, choice.id).name}
    onClick={() => navigate(itemId ? { kind: "item", id: itemId } : { kind: "tag", id: choice.id })}
    className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
    <RecipeSlot choice={shownChoice} display={display} compact />
  </button>;
};

const ChoiceList = ({ choices, display }: { choices: readonly IngredientChoice[]; display: RecipeSubjectDisplay }) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? choices : choices.slice(0, 8);
  return <div className="mt-2 ml-8">
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {visible.map(choice => <div key={`${choice.kind}:${choice.id}:${choice.data ?? ""}`} className="min-w-0">
        {choice.kind === "item" && <GuideItemLink id={choice.id} display={display} />}
        {choice.data !== undefined && choice.data !== 0 && <span className="text-[10px] text-muted">
          {t("inspector.variant", { value: choice.data })}</span>}
      </div>)}
    </div>
    {choices.length > 8 && <button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}
      className="mt-2 flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-accent hover:text-white">
      {showAll ? t("inspector.showLess") : t("inspector.showMoreCount", { count: choices.length - 8 })}
      <ChevronDown size={13} className={showAll ? "rotate-180" : ""} aria-hidden="true" />
    </button>}
  </div>;
};

const MaterialRow = ({ ingredient, catalog, display }: { ingredient: RecipeIngredient; catalog: ValidatedRecipeCatalog;
  display: RecipeSubjectDisplay }) => {
  const { t } = useTranslation();
  const choices = resolveRecipeIngredientChoices(ingredient, catalog.index.tagMembers);
  const primary = choices[0];
  const group = ingredient.choices.length === 1 && ingredient.choices[0].kind === "tag"
    ? display("tag", ingredient.choices[0].id).name : null;
  if (!primary) return null;
  return <div className="border-b border-border/70 py-2 first:pt-0">
    {group && <p className="mb-1 text-[10px] text-subtle">{t("inspector.craftingGuide.anyGroup", { group })}</p>}
    <div className="flex min-w-0 items-center justify-between gap-3">
      {primary.kind === "item" ? <GuideItemLink id={primary.id} display={display} />
        : <span className="text-[12px] text-zinc-200">{display(primary.kind, primary.id).name}</span>}
      {ingredient.count > 1 && <span className="shrink-0 text-[11px] font-semibold tabular-nums text-accent">×{ingredient.count}</span>}
    </div>
    {primary.data !== undefined && primary.data !== 0 && <p className="ml-8 text-[10px] text-muted">
      {t("inspector.variant", { value: primary.data })}</p>}
    {choices.length > 1 && <details className="group ml-8 mt-1.5">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[11px] text-subtle hover:text-white [&::-webkit-details-marker]:hidden">
        {t("inspector.craftingGuide.validItems", { count: choices.length })}
        <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ChoiceList choices={choices} display={display} />
    </details>}
  </div>;
};

const recipeOptionLabel = (recipe: RecipeVisual, index: number, display: RecipeSubjectDisplay, t: TFunction) => {
  const ingredients = groupedIngredients(recipe).slice(0, 2).map(ingredient => {
    const choice = ingredient.choices[0];
    return choice ? display(choice.kind, choice.id).name : "";
  }).filter(Boolean).join(" + ");
  return t("inspector.craftingGuide.recipeOption", { index: index + 1,
    method: t(`inspector.methods.${recipe.method}`), ingredients });
};

const CraftingGuideVisuals = ({ recipes, catalog, display, showOutputLink = false, embedded = false }: {
  recipes: readonly RecipeVisual[]; catalog: ValidatedRecipeCatalog; display: RecipeSubjectDisplay;
  showOutputLink?: boolean; embedded?: boolean;
}) => {
  const { t } = useTranslation();
  const navigate = useGuideNavigation();
  const [selectedId, setSelectedId] = useState(recipes[0]?.id ?? "");
  const recipe = recipes.find(variant => variant.id === selectedId) ?? recipes[0];
  if (!recipe) return null;
  const inventory = fitsInventoryCrafting(recipe);
  const cutting = recipe.method === "cutting";
  const allSlots = recipeSlotLayout(recipe);
  const slots = cutting ? allSlots : inventory && recipe.method === "shaped"
    ? [allSlots[0], allSlots[1], allSlots[3], allSlots[4]] : inventory ? allSlots.slice(0, 4) : allSlots;
  const ingredients = groupedIngredients(recipe);
  return <div>
    {recipes.length > 1 && <div className={cn("mb-4 flex items-center gap-4 border-b border-border/70 pb-3",
      embedded && "mx-4 mt-4")}>
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {t("inspector.craftingGuide.variants", { count: recipes.length })}
      </span>
      <MapSelectDropdown options={recipes.map((variant, index) => ({ id: variant.id,
        name: recipeOptionLabel(variant, index, display, t) }))} value={recipe.id} onSelect={setSelectedId}
        placeholder={t("inspector.craftingGuide.variants", { count: recipes.length })}
        ariaLabel={t("inspector.craftingGuide.variants", { count: recipes.length })}
        searchPlaceholder={t("inspector.craftingGuide.variants", { count: recipes.length })}
        noResultsLabel={t("worlds.noResults")} icon={ListFilter} className="min-w-0 max-w-[430px] flex-1"
        triggerClassName="bg-surface px-2.5 py-2 text-[12px] focus-visible:border-accent" />
    </div>}
    <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-6 py-4",
      embedded ? "px-4" : "border-y border-border/70")}>
      <div className="min-w-0">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          {cutting ? recipe.stations?.[0] ? display("item", recipe.stations[0]).name
            : t("inspector.methods.cutting")
            : t(inventory ? "inspector.craftingGuide.inventoryGrid" : "inspector.craftingGuide.tableGrid")}
        </p>
        <div role="group" aria-label={t("inspector.recipePattern")}
          className="flex w-fit items-center gap-3 border-4 border-b-[#555] border-l-white/80 border-r-[#555] border-t-white/80 bg-[#c6c6c6] p-3">
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cutting ? 1 : inventory ? 2 : 3}, 36px)` }}>
            {slots.map((choice, index) => <CraftingSlot key={index} choice={choice} catalog={catalog} display={display} />)}
          </div>
          <ArrowRight size={20} className="shrink-0 text-[#555]" aria-hidden="true" />
          <div className="flex flex-col gap-1">{recipe.outputs.map((output, index) =>
            <button key={`${output.id}:${index}`} type="button" data-guide-item={output.id}
              aria-label={`${t("inspector.openGuide")}: ${display("item", output.id).name}`}
              onClick={() => navigate({ kind: "item", id: output.id })}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <RecipeSlot choice={{ kind: "item", id: output.id }} count={output.count} display={display} compact />
            </button>)}</div>
        </div>
        {!embedded && !cutting && <p className="mt-2 max-w-[230px] text-[11px] leading-5 text-subtle">
          {t(recipe.method === "shapeless" ? "inspector.shapelessPlacement" : "inspector.craftingGuide.matchPattern")}
        </p>}
      </div>
      <div className="min-w-0">
        <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t(cutting ? "inspector.smeltingGuide.input" : "inspector.ingredients")}
          {!cutting && ` · ${ingredients.length}`}
        </h4>
        <div>{ingredients.map((ingredient, index) => <MaterialRow key={`${recipe.id}:${index}`} ingredient={ingredient}
          catalog={catalog} display={display} />)}</div>
        {showOutputLink && <div className="mt-3 border-t border-border/70 pt-3">
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">{t("inspector.outputs")}</h4>
          {recipe.outputs.map((output, index) => <GuideItemLink key={`${output.id}:${index}`} id={output.id}
            display={display} quantity={output.count} />)}
        </div>}
      </div>
    </div>
  </div>;
};

export default CraftingGuideVisuals;
