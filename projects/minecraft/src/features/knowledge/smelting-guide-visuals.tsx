import { ArrowRight, ArrowUpRight, ChevronDown, Flame } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_GUIDE_COOKING_TIME_RULES } from "../../game-config.ts";
import { cn } from "../../lib/cn.ts";
import InspectorSubjectIcon from "../inspector/inspector-subject-icon.tsx";
import GuideItemLink from "./guide-item-link.tsx";
import { useGuideNavigation } from "./guide-navigation-context.ts";
import { resolveRecipeIngredientChoices } from "./recipe-ingredient-choices.ts";
import { RecipeSlot } from "./recipe-grid.tsx";
import { cookingTimeSeconds } from "./smelting-guide-data.ts";
import type { ValidatedRecipeCatalog } from "./recipe-catalog-artifact.ts";
import type { RecipeSubjectDisplay } from "./recipe-subject-display.ts";
import type { CatalogRecipe } from "./recipe-types.ts";

interface CookingMethod { key: string; recipe: CatalogRecipe; station: string }
interface CookingInput { key: string; methods: CookingMethod[] }

const SmeltingGuideVisuals = ({ recipes, catalog, display, stationIds }: { recipes: readonly CatalogRecipe[];
  catalog: ValidatedRecipeCatalog; display: RecipeSubjectDisplay; stationIds: readonly string[] | null }) => {
  const { t, i18n } = useTranslation();
  const navigate = useGuideNavigation();
  const methods: CookingMethod[] = recipes.flatMap(recipe => recipe.stations
    .filter(station => !stationIds || stationIds.includes(station)).map(station => ({
      key: `${recipe.id}:${station}`, recipe, station,
    })));
  const byInput = new Map<string, CookingInput>();
  for (const method of methods) {
    const key = JSON.stringify(method.recipe.ingredients[0]);
    const group = byInput.get(key) ?? { key, methods: [] };
    group.methods.push(method);
    byInput.set(key, group);
  }
  const inputs = [...byInput.values()];
  const [inputKey, setInputKey] = useState(inputs[0]?.key ?? "");
  const [methodKey, setMethodKey] = useState(methods[0]?.key ?? "");
  const [showAll, setShowAll] = useState(false);
  const activeInput = byInput.get(inputKey) ?? inputs[0];
  const selected = activeInput?.methods.find(method => method.key === methodKey) ?? activeInput?.methods[0];
  if (!selected) return null;
  const { recipe } = selected;
  const ingredient = recipe.ingredients[0];
  const choices = resolveRecipeIngredientChoices(ingredient, catalog.index.tagMembers);
  const primary = choices[0];
  const inputId = primary?.kind === "item" ? primary.id : undefined;
  const output = recipe.outputs[0];
  const { seconds, defaultFuelSpeed } = cookingTimeSeconds(recipe, GAME_GUIDE_COOKING_TIME_RULES);
  const experience = recipe.cooking?.experience;
  const number = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language ?? "en", { maximumFractionDigits: 2 });
  const multipleInputs = inputs.length > 1;
  const visibleInputs = showAll ? inputs : inputs.slice(0, 6);
  const openInput = (choice: typeof primary) => {
    if (!choice) return;
    navigate({ kind: choice.kind, id: choice.id });
  };
  return <div className="smelting-guide max-w-[760px] overflow-hidden rounded-[var(--radius-md)] border border-border bg-white/[0.02]">
    <div className={cn("smelting-guide-layout grid", multipleInputs && "smelting-guide-layout-multiple")}>
      {multipleInputs && <div className="smelting-guide-inputs min-w-0 border-r border-border/70 p-3">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
          {t("inspector.smeltingGuide.input")} · {inputs.length}
        </p>
        <div className="space-y-1">
          {visibleInputs.map(input => {
            const choice = resolveRecipeIngredientChoices(input.methods[0].recipe.ingredients[0],
              catalog.index.tagMembers)[0];
            const item = choice ? display(choice.kind, choice.id) : null;
            const isSelected = input.key === activeInput.key;
            return <div key={input.key} className={cn("flex min-w-0 items-center rounded-[var(--radius-sm)] border",
              isSelected ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-white/[0.05]")}>
              <button type="button" aria-pressed={isSelected}
                onClick={() => { setInputKey(input.key); setMethodKey(input.methods[0].key); }}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1.5 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-accent">
                <span className="shrink-0"><InspectorSubjectIcon image={item?.image} size={24} /></span>
                <span className="min-w-0 break-words text-[11px] font-medium leading-4 text-zinc-100">
                  {item?.name}
                  {choice?.data !== undefined && choice.data !== 0 && <span className="block text-[10px] text-subtle">
                    {t("inspector.variant", { value: choice.data })}</span>}
                </span>
              </button>
              {choice && <button type="button" onClick={() => openInput(choice)}
                aria-label={`${t("inspector.openGuide")}: ${item?.name}`}
                className="grid h-8 w-7 shrink-0 cursor-pointer place-items-center text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>}
            </div>;
          })}
        </div>
        {inputs.length > 6 && <button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}
          className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 border-t border-border/70 py-2 text-[11px] font-medium text-accent hover:text-white">
          {showAll ? t("inspector.showLess") : t("inspector.showMoreCount", { count: inputs.length - 6 })}
          <ChevronDown size={13} className={showAll ? "rotate-180" : ""} aria-hidden="true" />
        </button>}
      </div>}
      <div className="min-w-0 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
          {t("inspector.smeltingGuide.station")}
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {activeInput.methods.map(method => {
            const item = display("item", method.station);
            const isSelected = method.key === selected.key;
            return <div key={method.key} className={cn("flex items-center overflow-hidden rounded-[var(--radius-sm)] border",
              isSelected ? "border-accent/45 bg-accent-soft" : "border-border bg-surface")}>
              <button type="button" aria-pressed={isSelected} onClick={() => setMethodKey(method.key)}
                className="flex min-w-0 cursor-pointer items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-zinc-100 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                <InspectorSubjectIcon image={item.image} size={18} /><span className="min-w-0 break-words">{item.name}</span>
              </button>
              <button type="button" onClick={() => navigate({ kind: "item", id: method.station })}
                aria-label={`${t("inspector.openGuide")}: ${item.name}`}
                className="grid h-7 w-6 cursor-pointer place-items-center border-l border-border/70 text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                <ArrowUpRight size={12} aria-hidden="true" />
              </button>
            </div>;
          })}
        </div>
        <div className="flex min-w-0 flex-wrap items-start gap-5 border-t border-border/70 pt-3">
          <div role="group" aria-label={t("inspector.smeltingGuide.process")}
            className="flex h-fit w-fit items-center gap-2 border-4 border-b-[#555] border-l-white/80 border-r-[#555] border-t-white/80 bg-[#c6c6c6] p-2.5">
              {primary && <button type="button" data-guide-item={inputId} aria-label={display(primary.kind, primary.id).name}
                onClick={() => openInput(primary)}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <RecipeSlot choice={inputId ? { kind: "item", id: inputId } : primary} display={display} compact />
              </button>}
            <div className="flex flex-col items-center gap-1">
              <ArrowRight size={20} className="shrink-0 text-[#555]" aria-hidden="true" />
              <Flame size={17} className="text-[#7c421f]" aria-hidden="true" />
            </div>
            {output && <RecipeSlot choice={{ kind: "item", id: output.id }} count={output.count} display={display} compact />}
          </div>
          <dl className="smelting-guide-facts grid min-w-0 flex-1 basis-[400px] grid-cols-[minmax(0,1fr)_104px_90px] items-start gap-3">
            <div className="min-w-0"><dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
              {t("inspector.smeltingGuide.input")}</dt>
              <dd>{inputId ? <GuideItemLink id={inputId} display={display} quantity={ingredient.count} />
                : primary && <span className="text-[12px] text-zinc-200">{display(primary.kind, primary.id).name}</span>}</dd>
            {choices.length > 1 && <details className="group mt-1.5">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[11px] text-subtle hover:text-white [&::-webkit-details-marker]:hidden">
                {t("inspector.smeltingGuide.alternatives", { count: choices.length - 1 })}
                <ChevronDown size={12} className="transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {choices.slice(1).filter(choice => choice.kind === "item").map(choice =>
                  <GuideItemLink key={`${choice.id}:${choice.data ?? ""}`} id={choice.id} display={display} />)}
              </div>
            </details>}</div>
              {seconds !== null && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
                {t("inspector.smeltingGuide.time")}</dt><dd className="mt-1 text-[13px] font-semibold text-zinc-100">
                  {t("inspector.smeltingGuide.seconds", { value: number.format(seconds) })}</dd>
                {defaultFuelSpeed && <p className="mt-0.5 text-[10px] leading-4 text-subtle">
                  {t("inspector.smeltingGuide.defaultFuelSpeed")}</p>}</div>}
              {experience !== null && experience !== undefined && <div><dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">
                {t("inspector.smeltingGuide.experience")}</dt><dd className="mt-1 text-[13px] font-semibold text-zinc-100">
                  {number.format(experience)}</dd></div>}
          </dl>
        </div>
      </div>
    </div>
  </div>;
};

export default SmeltingGuideVisuals;
