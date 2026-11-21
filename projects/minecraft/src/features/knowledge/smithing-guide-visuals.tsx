import { ArrowRight, ListFilter } from "lucide-react";
import { useState } from "react";
import type { TFunction } from "i18next";
import CraftingGuideVisuals from "./crafting-guide-visuals.tsx";
import GuideItemLink from "./guide-item-link.tsx";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import { RecipeSlot } from "./recipe-grid.tsx";
import MapSelectDropdown from "../map/map-select-dropdown.tsx";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { CatalogRecipe } from "./recipe-types.ts";

const SmithingSlot = ({ id, display, t }: { id: string; display: RecipeSubjectDisplay; t: TFunction }) => {
  const navigate = useGuideNavigation();
  const slot = <RecipeSlot choice={{ kind: "item", id }} display={display} compact />;
  return <button type="button" data-guide-item={id}
    aria-label={`${t("inspector.openGuide")}: ${display("item", id).name}`}
    onClick={() => navigate({ kind: "item", id })}
    className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{slot}</button>;
};

const SmithingIngredient = ({ id, label, options, onChange, display, t }: { id: string; label: string;
  options?: readonly string[]; onChange?: (id: string) => void; display: RecipeSubjectDisplay; t: TFunction }) => {
  const selectable = Boolean(options && options.length > 1 && onChange);
  return <div className="smithing-process-row grid min-w-0 items-center gap-3 border-b border-border/70 py-2.5 first:pt-0">
    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">{label}</span>
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <GuideItemLink id={id} display={display} />
      {selectable && <MapSelectDropdown options={options!.map(option => ({ id: option,
        name: display("item", option).name }))} value={id} onSelect={onChange!}
        placeholder={t("inspector.smithingGuide.changeSelection")}
        ariaLabel={`${t("inspector.smithingGuide.changeSelection")}: ${label}`}
        searchPlaceholder={t("inspector.smithingGuide.changeSelection")}
        noResultsLabel={t("worlds.noResults")} icon={ListFilter} searchable
        className="w-[180px] max-w-full shrink-0"
        triggerClassName="h-8 bg-background px-2.5 text-[11px] hover:border-accent/50" />}
    </div>
  </div>;
};

export const SmithingProcess = ({ template, base, addition, result, baseOptions, additionOptions, display, t }: {
  template?: string; base: string; addition: string; result?: string;
  baseOptions: readonly string[]; additionOptions: readonly string[];
  display: RecipeSubjectDisplay; t: TFunction;
}) => {
  const [selectedBase, setSelectedBase] = useState(base);
  const [selectedAddition, setSelectedAddition] = useState(addition);
  const output = result ?? selectedBase;
  return <div role="group" aria-label={t("inspector.smithingGuide.process")}
    className="smithing-process w-full max-w-[760px] rounded-[var(--radius-md)] border border-border bg-surface">
    <div className="smithing-process-layout grid">
      <div className="smithing-process-preview flex min-w-0 flex-col justify-center border-r border-border/70 bg-black/20 p-4">
        <span className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("inspector.smithingGuide.tablePreview")}
        </span>
        <div role="group" aria-label={t("inspector.recipePattern")}
          className="flex h-fit w-fit items-center gap-2 border-4 border-b-[#555] border-l-white/80 border-r-[#555] border-t-white/80 bg-[#c6c6c6] p-2.5">
          <div className="flex gap-0.5">
            {template && <SmithingSlot id={template} display={display} t={t} />}
            <SmithingSlot id={selectedBase} display={display} t={t} />
            <SmithingSlot id={selectedAddition} display={display} t={t} />
          </div>
          <ArrowRight size={18} className="shrink-0 text-[#555]" aria-hidden="true" />
          <SmithingSlot id={output} display={display} t={t} />
        </div>
        {!result && <p className="mt-3 text-[11px] leading-[1.5] text-subtle">
          {t("inspector.smithingGuide.dynamicPreview")}
        </p>}
      </div>
      <div className="min-w-0 px-4 py-2">
        {template && <SmithingIngredient id={template} label={t("inspector.smithingGuide.templateSlot")}
          display={display} t={t} />}
        <SmithingIngredient id={selectedBase} label={t("inspector.smithingGuide.gearSlot")}
          options={baseOptions} onChange={setSelectedBase} display={display} t={t} />
        <SmithingIngredient id={selectedAddition} label={t("inspector.smithingGuide.materialSlot")}
          options={additionOptions} onChange={setSelectedAddition} display={display} t={t} />
        <div className="smithing-process-row grid items-center gap-3 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
            {t("inspector.smithingGuide.resultSlot")}</span>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <GuideItemLink id={output} display={display} />
            {!result && <span className="shrink-0 rounded-[var(--radius-full)] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
              {t("inspector.smithingGuide.dynamicResult")}</span>}
          </div>
        </div>
      </div>
    </div>
  </div>;
};

export const CopyRecipes = ({ recipes, catalog, display }: { recipes: readonly CatalogRecipe[];
  catalog: ValidatedRecipeCatalog; display: RecipeSubjectDisplay }) => <div className="max-w-[760px]">
  <CraftingGuideVisuals recipes={recipes} catalog={catalog} display={display} embedded showOutputLink />
</div>;
