import { Boxes, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_CRAFTING_TARGET_ID } from "../../game-config";
import { cn } from "../../lib/cn";
import GuideSourceControls from "../knowledge/guide-source-controls";
import type { GuideSource } from "../knowledge/guide-source-controls";
import { gameKnowledgeSubjectDisplay } from "../knowledge/game-knowledge-subject-display";
import RecipeDiagram from "../knowledge/recipe-diagram";
import { createRecipeSubjectDisplay } from "../knowledge/recipe-subject-display";
import type { CatalogRecipe } from "../knowledge/recipe-types";
import MapPointIcon from "../map/map-point-icon";
import { calculateCraftingMaterials } from "./calculate-crafting-plan";
import CraftingItemPicker from "./crafting-item-picker";
import CraftingMaterialAlternatives from "./crafting-material-alternatives";
import CraftingMaterialGuideButton from "./crafting-material-guide-button";
import CraftingMaterialSources from "./crafting-material-sources";
import { addCraftingTarget, removeCraftingTarget, setCraftingQuantity, setCraftingTarget, useCraftingPlan } from "./crafting-store";
import { CRAFTING_GUIDE_SOURCES, useCraftingCatalog } from "./use-crafting-catalog";

const outputId = (recipe: CatalogRecipe) => recipe.outputs[0]?.id ?? "";
const displayItem = (id: string) => gameKnowledgeSubjectDisplay("item", id);

export default function CraftingPage({ onOpenGuideItem }: {
  onOpenGuideItem: (itemId: string, source: GuideSource) => void;
}) {
  const { t, i18n } = useTranslation();
  const { source, selectSource, catalogs, catalog, loading, error } = useCraftingCatalog();
  const plan = useCraftingPlan();
  const defaultTargetSeeded = useRef(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const targets = useMemo(() => catalog ? [...new Set(catalog.recipes.map(outputId).filter(Boolean))]
    .sort((left, right) => displayItem(left).name.localeCompare(displayItem(right).name, locale)) : [], [catalog, locale]);
  const plannedTargets = useMemo(() => plan.targets.filter(target => targets.includes(target.id)), [plan.targets, targets]);
  useEffect(() => {
    if (!loading && catalog && !plannedTargets.length && !defaultTargetSeeded.current && targets.includes(DEFAULT_CRAFTING_TARGET_ID)) {
      defaultTargetSeeded.current = true;
      addCraftingTarget(DEFAULT_CRAFTING_TARGET_ID);
    }
  }, [catalog, loading, plannedTargets.length, targets]);
  const addedIds = useMemo(() => new Set(plannedTargets.map(target => target.id)), [plannedTargets]);
  const targetId = plan.targetId && addedIds.has(plan.targetId) ? plan.targetId : plannedTargets[0]?.id ?? null;
  useEffect(() => {
    if (targetId && plan.targetId !== targetId) setCraftingTarget(targetId);
  }, [plan.targetId, targetId]);
  const recipe = catalog?.recipes.find(candidate => outputId(candidate) === targetId) ?? null;
  const quantity = plannedTargets.find(candidate => candidate.id === targetId)?.quantity ?? 1;
  const materials = calculateCraftingMaterials(recipe, quantity, null, catalog?.index.tagMembers ?? {});
  const target = targetId ? displayItem(targetId) : null;
  const recipeDisplay = useMemo(() => catalog
    ? createRecipeSubjectDisplay(catalog, gameKnowledgeSubjectDisplay)
    : gameKnowledgeSubjectDisplay, [catalog]);

  return <div className="flex h-full min-h-0 bg-background">
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-surface/70">
      {catalogOpen && catalog ? <CraftingItemPicker targets={targets} addedIds={addedIds} locale={locale}
        source={source} sources={CRAFTING_GUIDE_SOURCES}
        onSourceChange={selectSource}
        onAdd={addCraftingTarget} onClose={() => setCatalogOpen(false)} /> : <>
      <div className="space-y-3 border-b border-border p-3">
        <div>
          <h1 className="text-lg font-semibold text-white">{t("crafting.title")}</h1>
          <p className="mt-1 text-[11px] leading-4 text-zinc-400">{t("crafting.catalog", { edition: source.edition, version: source.version })}</p>
        </div>
        <GuideSourceControls source={source} sources={CRAFTING_GUIDE_SOURCES}
          onSourceChange={selectSource} />
        <button type="button" onClick={() => setCatalogOpen(true)} disabled={loading || Boolean(error) || !catalog}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-3 py-2.5 text-xs font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-60">
          <Plus size={15} aria-hidden="true" />{t("crafting.addItem")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading ? <div role="status" className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-accent" /></div>
          : error || !catalog ? <p role="alert" className="p-4 text-xs leading-5 text-danger-text">{t("crafting.catalogUnavailable")}</p>
          : plannedTargets.length ? plannedTargets.map(({ id }) => { const item = displayItem(id); return <div key={id}
            className={cn("group flex w-full items-center rounded-[var(--radius-md)] text-white hover:bg-white/5",
              id === targetId && "bg-accent-soft text-accent")}>
            <button type="button" onClick={() => setCraftingTarget(id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2.5 py-2 text-left">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-border bg-background">
                <MapPointIcon source={item.image} fallback={Boxes} size={28} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{item.name}</span>
            </button>
            <button type="button" aria-label={t("crafting.removeItem", { item: item.name })} onClick={() => removeCraftingTarget(id)}
              className="mr-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-zinc-400 opacity-0 hover:bg-white/8 hover:text-danger-text focus:opacity-100 group-hover:opacity-100">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>; }) : <div className="flex h-full flex-col items-center justify-center px-5 text-center">
            <Boxes size={28} className="text-zinc-500" aria-hidden="true" />
            <p className="mt-3 text-xs font-semibold text-white">{t("crafting.emptyList")}</p>
            <p className="mt-1 text-[11px] leading-4 text-zinc-400">{t("crafting.emptyListHint")}</p>
          </div>}
      </div>
      </>}
    </aside>
    <main className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
      {!target || !recipe ? <div className="grid h-full place-items-center"><div className="max-w-xs text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-[var(--radius-lg)] border border-border bg-surface"><Boxes className="text-zinc-400" /></span>
        <h2 className="mt-4 text-base font-semibold text-white">{t("crafting.emptyList")}</h2>
        <p className="mt-2 text-xs leading-5 text-zinc-400">{t("crafting.emptyListHint")}</p>
        {!loading && catalog && <button type="button" onClick={() => setCatalogOpen(true)}
          className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 py-2.5 text-xs font-semibold text-on-accent">
          <Plus size={15} aria-hidden="true" />{t("crafting.addItem")}
        </button>}
      </div></div> : <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center gap-4 border-b border-border pb-5">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-accent/30 bg-accent-soft">
            <MapPointIcon source={target.image} fallback={Boxes} size={56} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{t(`crafting.methods.${recipe.method}`)}</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">{target.name}</h2>
            <p className="mt-1 text-xs text-zinc-400">{recipe.stations.map(id => displayItem(id).name).join(" · ") || t("crafting.inventoryCrafting")}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">{t("crafting.quantity")}
            <input type="number" min={1} max={9999} value={quantity} onChange={event => setCraftingQuantity(Number(event.target.value))}
              className="h-9 w-20 rounded-[var(--radius-md)] border border-border bg-surface px-2 text-center text-white outline-none focus:border-accent/60" />
          </label>
        </header>

        <section className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface/55 p-4">
          <h3 className="text-sm font-semibold text-white">{t("crafting.pattern")}</h3>
          <div className="mt-4 overflow-x-auto pb-1">
            <RecipeDiagram recipe={recipe} display={recipeDisplay} />
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-white">{t("crafting.materials")}</h3>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            {materials.map((material, index) => { const item = displayItem(material.id); return <div key={`${material.id}:${index}`}
              className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5">
                <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] bg-background"><MapPointIcon source={item.image} fallback={Boxes} size={32} /></span>
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-white">
                    <span className="truncate">{item.name}</span>
                    <strong className="shrink-0 rounded-[var(--radius-sm)] bg-accent-soft px-1.5 py-0.5 text-[11px] tabular-nums text-accent">×{material.required}</strong>
                  </p>
                  <CraftingMaterialAlternatives itemIds={material.alternatives.slice(1)} />
                  <CraftingMaterialSources itemId={material.id} catalogs={catalogs} />
                </div>
                <CraftingMaterialGuideButton itemName={item.name} onClick={() => onOpenGuideItem(material.id, source)} />
            </div>; })}
          </div>
        </section>
      </div>}
    </main>
  </div>;
}
