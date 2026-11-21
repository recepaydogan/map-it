import { ArrowLeft, ArrowRight, Hammer } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CatalogRow, CatalogSearch, CatalogTable } from "../../components/catalog-workspace";
import { contentUrl } from "../../lib/content-url";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import { useItemCatalog } from "../database/use-item-catalog";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import SpellLink from "../spells/spell-link";
import ProfessionResultItem from "./profession-result-item";
import type { ProfessionEntry, ProfessionRecipe } from "./profession-types";
import type { ProfessionSourceRecipe, ProfessionTrainer } from "./use-profession-details";

const PAGE_SIZE = 40;
const SKILL_THRESHOLD_COLORS = ["text-orange-400", "text-yellow-300", "text-green-400", "text-zinc-400"] as const;

const materialKey = (materials: [number | string, number][]) => materials
  .map(([id, count]) => `${id}:${count}`).sort().join("|");

const RecipeIcon = ({ recipe, source, size = 36, transparentBackground = false }: { recipe: ProfessionRecipe; source?: ProfessionSourceRecipe; size?: number; transparentBackground?: boolean }) => {
  if (recipe.icon) return <ItemIcon icon={recipe.icon} name={recipe.name} size={size} />;
  const matchingSpellIcon = source?.ic && source.ic !== 136235
    && source.n.toLocaleLowerCase() === recipe.name.toLocaleLowerCase()
    && recipe.itemId && String(source.make?.[0]) === recipe.itemId;
  return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-border text-subtle${transparentBackground ? "" : " bg-black/30"}`} style={{ width: size, height: size }}>
    {matchingSpellIcon ? <img src={contentUrl(`data/spells/icons/${source.ic}.webp`)} alt="" className="h-full w-full object-contain" /> : <Hammer size={Math.round(size * 0.46)} aria-hidden="true" />}
  </span>;
};

const ProfessionRecipesPanel = ({ entry, sourceRecipes, sourceItems, trainers, classicRecipeTrainers, classicTrainerNames, selectedRecipeId, onBack, backLabel, onShowTrainers }: {
  entry: ProfessionEntry;
  sourceRecipes: ProfessionSourceRecipe[];
  sourceItems: Record<string, [string, number, number]>;
  trainers: ProfessionTrainer[];
  classicRecipeTrainers: Record<string, number[]>;
  classicTrainerNames: Record<string, string>;
  selectedRecipeId?: string;
  onBack?: () => void;
  backLabel?: string;
  onShowTrainers?: () => void;
}) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const itemCatalog = useItemCatalog(Boolean(selectedRecipeId));
  const itemsById = useMemo(() => new Map(itemCatalog.status === "ready"
    ? itemCatalog.catalog.items.map((item) => [item.id, item] as const) : []), [itemCatalog]);
  const [query, setQuery] = useState("");
  const [newOnly, setNewOnly] = useState(false);
  const [skillLimit, setSkillLimit] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sourceByItem = useMemo(() => {
    const index = new Map<string, ProfessionSourceRecipe[]>();
    for (const recipe of sourceRecipes) if (recipe.make?.[0]) {
      const key = String(recipe.make[0]);
      index.set(key, [...(index.get(key) ?? []), recipe]);
    }
    return index;
  }, [sourceRecipes]);
  const sourceByName = useMemo(() => {
    const index = new Map<string, ProfessionSourceRecipe[]>();
    for (const recipe of sourceRecipes) {
      const key = recipe.n.toLocaleLowerCase();
      index.set(key, [...(index.get(key) ?? []), recipe]);
    }
    return index;
  }, [sourceRecipes]);
  const sourceFor = useCallback((recipe: ProfessionRecipe) => {
    const candidates = [...new Map([
      ...(recipe.itemId ? sourceByItem.get(recipe.itemId) ?? [] : []),
      ...(sourceByName.get(recipe.name.toLocaleLowerCase()) ?? []),
    ].map((source) => [source.s, source])).values()];
    if (candidates.length <= 1) return candidates[0];
    const key = materialKey(recipe.reagents.map((item) => [item.id, item.quantity]));
    return candidates.find((source) => source.r && materialKey(source.r) === key)
      ?? candidates.find((source) => source.n.toLocaleLowerCase() === recipe.name.toLocaleLowerCase())
      ?? candidates[0];
  }, [sourceByItem, sourceByName]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const limit = Number(skillLimit);
    return entry.recipes.filter((recipe) => {
      const source = sourceFor(recipe);
      const materialNames = source?.r?.map(([id]) => sourceItems[String(id)]?.[0]
        ?? recipe.reagents.find((item) => item.id === String(id))?.name ?? "")
        ?? recipe.reagents.map((item) => item.name);
      return (!newOnly || recipe.new)
        && (!skillLimit || (source?.req ?? recipe.clientSkill ?? recipe.skill) <= limit)
        && (!term || recipe.name.toLocaleLowerCase().includes(term)
          || materialNames.some((name) => name.toLocaleLowerCase().includes(term)));
    });
  }, [entry.recipes, query, newOnly, skillLimit, sourceFor, sourceItems]);
  const showItem = (id: string, name: string) => openReference({ category: "items", id, name });
  const selectedRecipe = selectedRecipeId ? entry.recipes.find((recipe) => recipe.id === selectedRecipeId) : undefined;

  const renderDetail = (recipe: ProfessionRecipe) => {
    const source = sourceFor(recipe);
    const resultItem = recipe.itemId ? itemsById.get(recipe.itemId) : undefined;
    const materials = source?.r?.map(([id, quantity]) => {
      const item = recipe.reagents.find((reagent) => reagent.id === String(id));
      return { id: String(id), name: sourceItems[String(id)]?.[0] ?? item?.name ?? `Item #${id}`,
        quantity, inItemCatalog: item?.inItemCatalog ?? false };
    }) ?? recipe.reagents;
    const learnedFromItemIds = source?.src?.items?.length ? source.src.items.map(String)
      : recipe.sourceItemId && recipe.sourceItemAvailable ? [recipe.sourceItemId] : [];
    const classicTrainerIds = source?.src?.trainer?.classic ? classicRecipeTrainers[String(source.s)] ?? [] : [];
    const classicTrainers = classicTrainerIds.map((id) => {
      const trainer = trainers.find((candidate) => candidate.npc === id);
      return { id, name: trainer?.n ?? classicTrainerNames[String(id)], side: trainer?.side, zone: trainer?.zone };
    }).filter((trainer) => trainer.name);
    const previewTrainers = [classicTrainers.find((trainer) => trainer.side === "Alliance"),
      classicTrainers.find((trainer) => trainer.side === "Horde")].filter((trainer) => trainer !== undefined);
    if (!previewTrainers.length) previewTrainers.push(...classicTrainers.slice(0, 2));
    const hasKnownSource = learnedFromItemIds.length > 0 || Boolean(source?.src?.auto || source?.src?.trainer?.classic);
    return <div className="w-full space-y-5">
    <button type="button" onClick={() => { if (onBack) onBack(); else openReference({ category: "professions", id: entry.id, name: entry.name }); }}
      className="flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-zinc-300 hover:text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent">
      <ArrowLeft size={15} aria-hidden="true" />{backLabel ?? t("professions.backToRecipes")}
    </button>
    <header className="flex items-start gap-4 border-b border-border pb-5">
      <RecipeIcon recipe={recipe} source={source} size={54} transparentBackground />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">{entry.name} · {t("professions.recipeDetail")}</p>
        <h3 className="mt-1 font-display text-xl font-semibold leading-tight text-white">{recipe.name}{recipe.quantity && recipe.quantity > 1 ? ` ×${recipe.quantity}` : ""}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-[var(--radius-sm)] border border-border px-2 py-1 font-medium text-zinc-200">{t("professions.skill", { value: source?.req ?? recipe.clientSkill ?? recipe.skill })}{source?.req === undefined && recipe.clientSkill === undefined && recipe.estimatedSkill && " ≈"}</span>
          {recipe.new && <span className="rounded-[var(--radius-sm)] border border-accent/30 px-2 py-1 font-semibold text-accent">{t("professions.new")}</span>}
          {recipe.campProfession && <span className="text-subtle">{recipe.campProfession}</span>}
        </div>
      </div>
    </header>
    {resultItem && <ProfessionResultItem item={resultItem} />}
    {recipe.inItemCatalog && recipe.itemId && !resultItem && <section className="rounded-[var(--radius-md)] border border-border p-4">
      <p className="text-[12px] text-subtle" role={itemCatalog.status === "error" ? "alert" : "status"}>{t(itemCatalog.status === "error" ? "database.error" : "database.loading")}</p>
    </section>}
    <section className="rounded-[var(--radius-md)] border border-border p-4">
      <DatabaseSectionTitle count={materials.length}>{t("professions.materials")}</DatabaseSectionTitle>
      <div className="mt-2 grid gap-1.5 @min-[560px]:grid-cols-2">{materials.length ? materials.map((item) => {
        const catalogItem = itemsById.get(item.id);
        const content = <>{catalogItem?.icon ? <ItemIcon icon={catalogItem.icon} name={item.name} size={30} />
          : <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border text-subtle"><Hammer size={14} aria-hidden="true" /></span>}
          <span className="min-w-0 flex-1 truncate">{/^Item #\d+$/.test(item.name) ? t("professions.unidentifiedMaterial") : item.name}</span>
          <span className="shrink-0 tabular-nums text-subtle">×{item.quantity}</span></>;
        return item.inItemCatalog || catalogItem
          ? <button key={`${recipe.id}-${item.id}`} type="button" onClick={() => showItem(item.id, item.name)}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-left text-[12px] text-zinc-100 transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent">{content}</button>
          : <div key={`${recipe.id}-${item.id}`} className="flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-border px-2 py-1 text-[12px] text-zinc-300">{content}</div>;
      })
        : <p className="text-[12px] text-subtle">{t("professions.noneListed")}</p>}</div>
    </section>
    <section className="rounded-[var(--radius-md)] border border-border p-4">
      <DatabaseSectionTitle>{t("professions.recipeInformation")}</DatabaseSectionTitle>
      <dl className="mt-2 grid gap-2 @min-[520px]:grid-cols-2">
        <div className="min-w-0 rounded-[var(--radius-sm)] border border-border p-3"><dt className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">{t("professions.learnedFrom")}</dt>
          <dd className="space-y-1.5 text-[12px] text-zinc-200">{learnedFromItemIds.length > 0 && <div className="flex flex-wrap gap-x-2 gap-y-1">{learnedFromItemIds.map((itemId) => {
              const name = sourceItems[itemId]?.[0] ?? itemsById.get(itemId)?.name ?? recipe.source;
              return itemsById.has(itemId) || (recipe.sourceItemId === itemId && recipe.sourceItemAvailable)
                ? <button key={itemId} type="button" onClick={() => showItem(itemId, name)}
                  className="cursor-pointer text-left font-medium text-accent underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">{name}</button>
                : <span key={itemId}>{name}</span>;
            })}</div>}
            {source?.src?.auto && <span>{t("professions.learnedAutomatically")}</span>}
            {source?.src?.trainer?.classic && <div>
              <span className="font-medium text-zinc-100">{t("professions.trainer")}</span>
              {classicTrainers.length > 0 && <details className="mt-1.5 rounded-[var(--radius-sm)] border border-border px-2.5 py-2">
                <summary className="cursor-pointer text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                  {previewTrainers.map((trainer) => trainer.name).join(", ")}
                  {classicTrainers.length > previewTrainers.length && <span className="ml-1.5 text-subtle">{t("professions.trainers.count", { count: classicTrainers.length })}</span>}
                </summary>
                <ul className="scroll-slim mt-2 max-h-44 space-y-1 overflow-y-auto border-t border-border pt-2 text-zinc-300">
                  {classicTrainers.map((trainer) => <li key={trainer.id}>{trainer.name}{trainer.side ? ` · ${trainer.side}` : ""}{trainer.zone ? ` · ${trainer.zone}` : ""}</li>)}
                </ul>
              </details>}
              {onShowTrainers && <button type="button" onClick={onShowTrainers}
                className="mt-1.5 inline-flex cursor-pointer items-center gap-1 font-medium text-accent underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                {t("professions.viewTrainers", { profession: entry.name })}<ArrowRight size={13} aria-hidden="true" />
              </button>}
            </div>}
            {!hasKnownSource && (source ? t("professions.sourceUnknown")
              : recipe.source === "source unknown" ? t("professions.sourceUnknown")
              : recipe.source === "recipe item" ? t("professions.recipeItemUnverified")
              : recipe.source === "trainer" && onShowTrainers ? <button type="button" onClick={onShowTrainers}
                className="inline-flex cursor-pointer items-center gap-1 font-medium text-accent underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
                {t("professions.viewTrainers", { profession: entry.name })}<ArrowRight size={13} aria-hidden="true" />
              </button>
                : recipe.source === "trainer" ? t("professions.trainer") : recipe.source)}</dd>
        </div>
        {source?.s && <div className="min-w-0 rounded-[var(--radius-sm)] border border-border p-3"><dt className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">{t("professions.craftingSpell")}</dt>
          <dd className="text-[12px] text-zinc-200"><SpellLink id={source.s} name={recipe.name} /></dd></div>}
        {source?.rl && <div className="min-w-0 rounded-[var(--radius-sm)] border border-border p-3"><dt className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">{t("professions.playerLevel")}</dt>
          <dd className="text-[12px] font-medium text-zinc-200">{source.rl}</dd></div>}
        {recipe.favorPrice !== undefined && recipe.favorVendor && <div className="min-w-0 rounded-[var(--radius-sm)] border border-border p-3"><dt className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">{t("professions.favorVendorLabel")}</dt>
          <dd className="text-[12px] text-zinc-200">{recipe.favorVendor} · {t("professions.favorPrice", { price: recipe.favorPrice })}</dd>
          {recipe.favorCheckedDate && <p className="mt-1 text-[10px] text-subtle">{t("professions.favorReported", { date: recipe.favorCheckedDate })}</p>}</div>}
      </dl>
      {!!recipe.skillThresholds?.length && <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-border pt-3 @min-[520px]:grid-cols-4 text-[11px] tabular-nums">
        {recipe.skillThresholds.map((value, index) => <span key={index} className={`flex justify-between gap-2 rounded-[var(--radius-sm)] border border-border px-2.5 py-2 ${SKILL_THRESHOLD_COLORS[index] ?? "text-subtle"}`}>{t(`professions.thresholds.${index}`)} <span className="font-semibold">{value}</span></span>)}
      </div>}
    </section>
  </div>;
  };

  if (selectedRecipe) return renderDetail(selectedRecipe);

  return <section aria-label={t("professions.recipes")} className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
    <div className="catalog-toolbar">
      <CatalogSearch label={t("professions.searchRecipes")} value={query} onChange={(value) => { setQuery(value); setVisible(PAGE_SIZE); }} />
      <input type="number" min="1" max="300" value={skillLimit} onChange={(event) => { setSkillLimit(event.target.value); setVisible(PAGE_SIZE); }} placeholder={t("professions.skillLimit")}
        aria-label={t("professions.skillLimit")} className="h-[38px] w-28 rounded-[var(--radius-sm)] border border-border bg-background px-3 text-[12px] text-white outline-none placeholder:text-muted focus:border-accent" />
      <label className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 text-[12px] text-zinc-300"><input type="checkbox" checked={newOnly}
        onChange={(event) => { setNewOnly(event.target.checked); setVisible(PAGE_SIZE); }} />{t("professions.newOnly")}</label>
      <span role="status" className="text-[11px] text-subtle">{t("professions.recipeCount", { count: filtered.length })}</span>
    </div>
    {(entry.id === "camping" || entry.recipes.some((recipe) => recipe.estimatedSkill)) && <div className="space-y-1 px-3 pb-2 text-[11px] text-subtle">
      {entry.id === "camping" && <p>{t("professions.campingRecipeNote")}</p>}
      {entry.recipes.some((recipe) => recipe.estimatedSkill) && <p>{t("professions.estimatedSkillNote")}</p>}
    </div>}
    <div className="rounded-[var(--radius-sm)] border border-border bg-background mx-3 mb-3 overflow-hidden">
      <CatalogTable label={t("professions.recipes")} columns={[
        { label: t("catalog.recipe") }, { label: t("catalog.requiredSkill"), width: "23%", align: "end" },
        { label: t("catalog.materialTypes"), width: "23%", align: "end" },
      ]}>
        {filtered.slice(0, visible).map((recipe) => {
          const source = sourceFor(recipe);
          const skill = source?.req ?? recipe.clientSkill ?? recipe.skill;
          const estimated = source?.req === undefined && recipe.clientSkill === undefined && recipe.estimatedSkill;
          const materials = new Set(source?.r?.map(([id]) => String(id)) ?? recipe.reagents.map((reagent) => reagent.id));
          return <CatalogRow key={recipe.id} title={recipe.name + (recipe.quantity && recipe.quantity > 1 ? " ×" + recipe.quantity : "")}
            icon={<RecipeIcon recipe={recipe} source={source} size={30} transparentBackground />}
            description={recipe.campProfession}
            badge={recipe.new ? <span className="ml-1 text-[10px] text-accent">{t("professions.new")}</span> : undefined}
            onOpen={() => openReference({ category: "professions", id: entry.id, group: "recipe:" + recipe.id, name: recipe.name })}>
            <td className="catalog-number">{estimated ? "≈ " : ""}{skill}</td><td className="catalog-number">{materials.size}</td>
          </CatalogRow>;
        })}
      </CatalogTable>
      {!filtered.length && <p className="catalog-empty">{t("professions.noMatches")}</p>}
      {filtered.length > visible && <button type="button" onClick={() => setVisible((current) => current + PAGE_SIZE)} className="catalog-more">{t("professions.showMore", { count: filtered.length - visible })}</button>}
    </div>
  </section>;
};

export default ProfessionRecipesPanel;
