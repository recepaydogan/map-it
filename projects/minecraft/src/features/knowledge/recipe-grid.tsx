import { ArrowRight, Flame, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { cn } from "../../lib/cn";
import MapPointIcon from "../map/map-point-icon";
import type { RecipeSubjectDisplay } from "./recipe-subject-display";
import type { CatalogRecipe, IngredientChoice } from "./recipe-types";
import { recipeSlotLayout } from "./recipe-slot-layout";

export type { RecipeSubjectDisplay } from "./recipe-subject-display";

export const RecipeSlot = ({ choice, count = 1, display, compact = false }: {
  choice?: IngredientChoice; count?: number; display: RecipeSubjectDisplay; compact?: boolean;
}) => {
  const { t } = useTranslation();
  const appearance = choice ? display(choice.kind, choice.id) : null;
  return <Tooltip label={appearance?.name ?? ""} disabled={!appearance} side="top">
    <span role="img" aria-label={appearance ? `${appearance.name} × ${count}` : t("inspector.emptySlot")}
      className={cn("relative grid shrink-0 place-items-center border-2 border-b-white/60 border-l-black/60 border-r-white/60 border-t-black/60 bg-[#8b8b8b] text-white",
        compact ? "h-9 w-9" : "h-11 w-11")}>
      {appearance && <MapPointIcon source={appearance.image} fallback={Package} size={compact ? 26 : 32} className="guide-asset-icon [image-rendering:pixelated]" />}
      {appearance && count > 1 && <span className={cn("absolute bottom-0 right-0.5 font-bold [text-shadow:1px_1px_#000]", compact ? "text-[11px]" : "text-sm")}>{count}</span>}
    </span>
  </Tooltip>;
};

const RecipeGrid = ({ recipe, display, compact = false, onSelect }: {
  recipe: CatalogRecipe; display: RecipeSubjectDisplay; compact?: boolean;
  onSelect?: (choice: IngredientChoice) => void;
}) => {
  const { t } = useTranslation();
  const crafting = recipe.method === "shaped" || recipe.method === "shapeless";
  const slots = recipeSlotLayout(recipe);
  const slotSize = compact ? 36 : 44;
  return <div role="group" aria-label={t("inspector.recipePattern")} className={compact ? "space-y-1.5" : "space-y-2"}>
    <h3 className="text-xs font-semibold text-zinc-200">{t(recipe.method === "smithing" ? "inspector.smithingTitle" : `inspector.methods.${recipe.method}`)}</h3>
    <div className={cn("flex w-fit max-w-full items-center border-4 border-b-[#555] border-l-white/80 border-r-[#555] border-t-white/80 bg-[#c6c6c6]",
      compact ? "gap-2 p-2" : "gap-3 p-3")}>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${crafting || recipe.method === "smithing" && !recipe.legacySmithing ? 3
        : recipe.legacySmithing ? 2 : 1}, ${slotSize}px)` }}>
        {slots.map((choice, index) => onSelect && choice
          ? <button key={index} type="button" data-guide-item={choice.id}
              aria-label={`${t("inspector.openGuide")}: ${display(choice.kind, choice.id).name}`}
              onClick={() => onSelect(choice)}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <RecipeSlot choice={choice} display={display} compact={compact} />
            </button>
          : <RecipeSlot key={index} choice={choice} display={display} compact={compact} />)}
        {recipe.method === "cooking" && <Flame className="mx-auto text-orange-700" size={24} aria-hidden="true" />}
      </div>
      <ArrowRight size={compact ? 20 : 24} className="shrink-0 text-[#555]" aria-hidden="true" />
      <div className="flex flex-col gap-1">{recipe.smithingTrim
        ? <span className="text-[11px] font-semibold leading-4 text-[#333]">{t("inspector.smithingGuide.dynamicResult")}</span>
        : recipe.outputs.map((output, index) => onSelect
          ? <button key={index} type="button" data-guide-item={output.id}
              aria-label={`${t("inspector.openGuide")}: ${display("item", output.id).name}`}
              onClick={() => onSelect({ kind: "item", id: output.id })}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <RecipeSlot choice={{ kind: "item", id: output.id }} count={output.count} display={display} compact={compact} />
            </button>
          : <RecipeSlot key={index} choice={{ kind: "item", id: output.id }}
              count={output.count} display={display} compact={compact} />)}</div>
    </div>
    {recipe.method === "shapeless" && <p className="text-xs text-zinc-300">{t("inspector.shapelessPlacement")}</p>}
  </div>;
};
export default RecipeGrid;
