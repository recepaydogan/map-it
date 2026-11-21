import { ChevronDown, Hammer, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MapCraftIngredient, MapCraftRecipe } from "../types";
import { resolveCraftIngredientItems, type CraftingLookups } from "./crafting-utils";

const INITIAL_OPTION_LIMIT = 3;
const OPTION_PAGE_SIZE = 30;

interface CraftingIngredientRowProps {
  ingredient: MapCraftIngredient;
  index: number;
  lookups: CraftingLookups;
  onFindItem: (itemId: string) => void;
  onOpenRecipe: (recipe: MapCraftRecipe) => void;
}

const humanizeTag = (tag: string) => tag
  .replace(/^.*:/, "")
  .replace(/([a-z])([A-Z])/g, "$1 $2")
  .replace(/_/g, " ");

const CraftingIngredientRow = ({
  ingredient,
  index,
  lookups,
  onFindItem,
  onOpenRecipe,
}: CraftingIngredientRowProps) => {
  const { t } = useTranslation();
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_OPTION_LIMIT);
  const resolvedItems = useMemo(
    () => resolveCraftIngredientItems(ingredient, lookups),
    [ingredient, lookups],
  );
  const visibleItems = resolvedItems.slice(0, visibleLimit);
  const findable = resolvedItems.find(({ loot }) => (loot?.locationCount ?? 0) > 0);
  const craftable = resolvedItems.find(({ recipes }) => recipes.length > 0);
  const amount = ingredient.amountMax
    ? `${ingredient.amount}–${ingredient.amountMax}`
    : String(ingredient.amount);

  return (
    <li className="rounded-[var(--radius-md)] border border-white/8 bg-black/15 p-2.5">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/7 text-[10px] font-bold text-white/80">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[11px] font-semibold text-white">
            {t("map.crafting.amount", { amount })}
          </strong>
          <small className="block text-[9px] text-white/70">
            {ingredient.consumed ? t("map.crafting.consumed") : t("map.crafting.keptTool")}
          </small>
        </span>
        {craftable && (
          <button
            type="button"
            onClick={() => onOpenRecipe(craftable.recipes[0]!)}
            className="flex min-h-7 cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-white/5 px-2 text-[9px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Hammer size={11} aria-hidden="true" />
            {t("map.crafting.craft")}
          </button>
        )}
        {findable && (
          <button
            type="button"
            onClick={() => onFindItem(findable.item.id)}
            className="flex min-h-7 cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] bg-accent px-2 text-[9px] font-bold text-on-accent hover:bg-[var(--gold-bright)]"
          >
            <MapPin size={11} aria-hidden="true" />
            {t("map.crafting.find")}
          </button>
        )}
      </div>
      {visibleItems.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {visibleItems.map(({ item, loot, recipes }) => (
            <span
              key={item.id}
              title={item.name}
              className="max-w-full truncate rounded-[6px] border border-white/7 bg-white/5 px-1.5 py-1 text-[9px] text-white/80"
            >
              {item.name}
              {(loot?.locationCount ?? 0) > 0 && ` · ${loot!.locationCount}`}
              {recipes.length > 0 && ` · ${t("map.crafting.craftable")}`}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-white/75">
          {ingredient.kind === "fluid"
            ? ingredient.options.join(" / ")
            : ingredient.options.map(humanizeTag).join(" / ")}
        </p>
      )}
      {visibleLimit < resolvedItems.length && (
        <button
          type="button"
          onClick={() => setVisibleLimit((current) => current + OPTION_PAGE_SIZE)}
          className="mt-2 flex cursor-pointer items-center gap-1 text-[9px] font-medium text-white/70 hover:text-white"
        >
          <ChevronDown size={10} aria-hidden="true" />
          {t("map.crafting.moreAlternatives", {
            count: Math.min(OPTION_PAGE_SIZE, resolvedItems.length - visibleLimit),
          })}
        </button>
      )}
    </li>
  );
};

export default CraftingIngredientRow;
