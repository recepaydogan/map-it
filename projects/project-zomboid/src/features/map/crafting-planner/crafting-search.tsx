import { ChevronDown, Hammer, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapCraftRecipe } from "../types";

interface CraftingSearchProps {
  query: string;
  recipes: MapCraftRecipe[];
  totalRecipes: number;
  onQueryChange: (query: string) => void;
  onSelect: (recipe: MapCraftRecipe) => void;
  hasMore: boolean;
  onShowMore: () => void;
}

const CraftingSearch = ({
  query,
  recipes,
  totalRecipes,
  onQueryChange,
  onSelect,
  hasMore,
  onShowMore,
}: CraftingSearchProps) => {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-black/30 px-2.5 py-2 transition-colors focus-within:border-accent">
        <Search size={14} className="shrink-0 text-white/80" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("map.crafting.searchPlaceholder")}
          aria-label={t("map.crafting.searchLabel")}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/70"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label={t("map.crafting.clearSearch")}
            className="grid h-5 w-5 cursor-pointer place-items-center rounded-[var(--radius-full)] text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </label>
      <div className="flex items-center justify-between px-1 text-[10px] text-white/75">
        <span>{query ? t("map.crafting.results") : t("map.crafting.allRecipes")}</span>
        <span className="tabular-nums">{t("map.crafting.recipeCount", {
          count: totalRecipes.toLocaleString(i18n.language),
        })}</span>
      </div>
      <ul className="space-y-1" aria-label={t("map.crafting.results")}>
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              onClick={() => onSelect(recipe)}
              className="group flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-white/5"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
                <Hammer size={14} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[12px] font-semibold text-white">{recipe.name}</strong>
                <small className="block truncate text-[10px] text-white/70">{recipe.category}</small>
              </span>
              <span className="shrink-0 text-[9px] text-white/70">
                {t("map.crafting.inputCount", { count: recipe.inputs.length })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={onShowMore}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-white/5 py-2 text-[10px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
        >
          <ChevronDown size={12} aria-hidden="true" />
          {t("map.crafting.showMoreRecipes")}
        </button>
      )}
      {recipes.length === 0 && (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-white/3 px-3 py-5 text-center">
          <Hammer size={18} className="mx-auto text-white/70" aria-hidden="true" />
          <p className="mt-2 text-[11px] text-white/75">{t("map.crafting.noRecipes")}</p>
        </div>
      )}
    </div>
  );
};

export default CraftingSearch;
