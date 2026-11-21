import { ArrowLeft, BookOpen, Hammer, PackageCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapCraftRecipe } from "../types";
import CraftingIngredientRow from "./crafting-ingredient-row";
import type { CraftingLookups } from "./crafting-utils";

interface CraftingRecipeDetailProps {
  recipe: MapCraftRecipe;
  lookups: CraftingLookups;
  onBack: () => void;
  onFindItem: (itemId: string) => void;
  onOpenRecipe: (recipe: MapCraftRecipe) => void;
}

const CraftingRecipeDetail = ({
  recipe,
  lookups,
  onBack,
  onFindItem,
  onOpenRecipe,
}: CraftingRecipeDetailProps) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 animate-fade-in">
      <button
        type="button"
        onClick={onBack}
        className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-white/75 hover:text-white"
      >
        <ArrowLeft size={12} aria-hidden="true" />
        {t("map.crafting.back")}
      </button>
      <header className="rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft p-3">
        <div className="flex items-start gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-accent text-on-accent">
            <Hammer size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">{recipe.category}</span>
            <h2 className="mt-0.5 text-[14px] font-semibold leading-5 text-white">{recipe.name}</h2>
          </span>
        </div>
        {(recipe.skills.length > 0 || recipe.requiresLearning) && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {recipe.skills.map((skill) => (
              <span key={skill.id} className="rounded-[6px] border border-white/10 bg-black/15 px-1.5 py-1 text-[9px] text-white/80">
                {skill.id} {skill.level}
              </span>
            ))}
            {recipe.requiresLearning && (
              <span className="flex items-center gap-1 rounded-[6px] border border-white/10 bg-black/15 px-1.5 py-1 text-[9px] text-white/80">
                <BookOpen size={10} aria-hidden="true" />
                {t("map.crafting.mustLearn")}
              </span>
            )}
          </div>
        )}
      </header>
      <section>
        <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/80">
          {t("map.crafting.ingredients")}
        </h3>
        <ol className="space-y-1.5">
          {recipe.inputs.map((ingredient, index) => (
            <CraftingIngredientRow
              key={`${ingredient.kind}-${ingredient.options.join(";")}-${index}`}
              ingredient={ingredient}
              index={index}
              lookups={lookups}
              onFindItem={onFindItem}
              onOpenRecipe={onOpenRecipe}
            />
          ))}
        </ol>
        {recipe.dynamicIngredients && (
          <p className="mt-2 rounded-[var(--radius-sm)] border border-white/8 bg-white/4 px-2.5 py-2 text-[9px] leading-4 text-white/75">
            {t("map.crafting.dynamicIngredients")}
          </p>
        )}
      </section>
      <section className="rounded-[var(--radius-md)] border border-border bg-white/3 p-2.5">
        <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/80">
          <PackageCheck size={12} className="text-accent" aria-hidden="true" />
          {t("map.crafting.outputs")}
        </h3>
        {recipe.outputs.length > 0 ? (
          <div className="mt-2 space-y-1">
            {recipe.outputs.map((output) => (
              <div key={output.itemId} className="flex items-center justify-between gap-2 text-[11px] text-white/80">
                <span className="truncate">{lookups.itemById.get(output.itemId)?.name ?? output.itemId}</span>
                <strong className="shrink-0 text-white">×{output.amountMax ? `${output.amount}–${output.amountMax}` : output.amount}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[10px] leading-4 text-white/70">{t("map.crafting.dynamicOutput")}</p>
        )}
      </section>
    </div>
  );
};

export default CraftingRecipeDetail;
