import { Hammer } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MapCraftingData, MapItemCatalogEntry, MapLootIndexEntry } from "../types";
import CraftingRecipeDetail from "./crafting-recipe-detail";
import CraftingSearch from "./crafting-search";
import { createCraftingLookups, searchCraftRecipes } from "./crafting-utils";

const INITIAL_RECIPE_LIMIT = 30;
const RECIPE_PAGE_SIZE = 50;

interface CraftingPlannerProps {
  crafting: MapCraftingData;
  items?: MapItemCatalogEntry[];
  lootIndex?: MapLootIndexEntry[];
  onFindItem: (itemId: string) => void;
  showHeader?: boolean;
}

const CraftingPlanner = ({
  crafting,
  items,
  lootIndex,
  onFindItem,
  showHeader = true,
}: CraftingPlannerProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_RECIPE_LIMIT);
  const [recipePath, setRecipePath] = useState<string[]>([]);
  const lookups = useMemo(
    () => createCraftingLookups(items, lootIndex, crafting.recipes),
    [crafting.recipes, items, lootIndex],
  );
  const matchingRecipes = useMemo(
    () => searchCraftRecipes(crafting.recipes, query, lookups, Number.POSITIVE_INFINITY),
    [crafting.recipes, lookups, query],
  );
  const results = matchingRecipes.slice(0, visibleLimit);
  const selectedRecipeId = recipePath.at(-1);
  const selectedRecipe = selectedRecipeId
    ? crafting.recipes.find(({ id }) => id === selectedRecipeId)
    : undefined;

  if (selectedRecipe) {
    return (
      <CraftingRecipeDetail
        recipe={selectedRecipe}
        lookups={lookups}
        onBack={() => setRecipePath((current) => current.slice(0, -1))}
        onFindItem={onFindItem}
        onOpenRecipe={(recipe) => setRecipePath((current) => [...current, recipe.id])}
      />
    );
  }

  return (
    <section
      className="space-y-3"
      aria-labelledby={showHeader ? "crafting-planner-title" : undefined}
      aria-label={showHeader ? undefined : t("map.crafting.title")}
    >
      {showHeader && <header className="flex items-start gap-2.5 px-1">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent-soft text-accent">
          <Hammer size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <h2 id="crafting-planner-title" className="text-[13px] font-semibold text-white">
            {t("map.crafting.title")}
          </h2>
          <p className="mt-0.5 text-[10px] leading-4 text-white/75">
            {t("map.crafting.description")}
          </p>
        </span>
      </header>}
      <CraftingSearch
        query={query}
        recipes={results}
        totalRecipes={crafting.totalRecipes}
        onQueryChange={(value) => {
          setQuery(value);
          setVisibleLimit(INITIAL_RECIPE_LIMIT);
        }}
        onSelect={(recipe) => setRecipePath([recipe.id])}
        hasMore={results.length < matchingRecipes.length}
        onShowMore={() => setVisibleLimit((current) => current + RECIPE_PAGE_SIZE)}
      />
    </section>
  );
};

export default CraftingPlanner;
