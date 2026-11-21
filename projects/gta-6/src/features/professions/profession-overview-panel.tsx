import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import { useReferenceNavigation } from "../reference/reference-navigation-context";
import type { ProfessionEntry, ProfessionFeature } from "./profession-types";
import type { ProfessionSourceRecipe } from "./use-profession-details";

const ProfessionOverviewPanel = ({ entry, sourceRecipes, onOpenRecipes }: { entry: ProfessionEntry; sourceRecipes: ProfessionSourceRecipe[]; onOpenRecipes: () => void }) => {
  const { t } = useTranslation();
  const openReference = useReferenceNavigation();
  const starterRecipes = entry.recipes.filter((recipe) => recipe.skill <= 25 && recipe.itemId && recipe.inItemCatalog)
    .sort((a, b) => a.skill - b.skill || Number(b.new) - Number(a.new) || a.name.localeCompare(b.name)).slice(0, 3);
  const feature = (item: ProfessionFeature) => {
    const recipe = entry.recipes.find((candidate) => candidate.itemId === item.itemId && candidate.name === item.name);
    const canOpen = Boolean(item.itemId && recipe?.inItemCatalog);
    const requiredSkill = sourceRecipes.find((source) => source.make?.[0] === Number(item.itemId))?.req;
    const content = <div className="flex items-center gap-2.5">
        {recipe?.icon && <ItemIcon icon={recipe.icon} name={item.name} size={29} />}
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-zinc-100">{item.name}</span>
          <span className="block text-[10px] text-subtle">{t("professions.skill", { value: requiredSkill ?? item.skill })}{requiredSkill === undefined && item.estimatedSkill && " ≈"}</span>
        </div>
        {canOpen && <ChevronRight size={12} className="shrink-0 text-subtle transition-colors group-hover:text-accent" aria-hidden="true" />}
      </div>;
    const className = "group min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-2 text-left";
    return canOpen ? <button key={`${item.itemId ?? item.name}-${item.skill}`} type="button"
      onClick={() => openReference({ category: "items", id: item.itemId!, name: item.name, initialItemTab: "acquisition" })}
      className={`${className} w-full cursor-pointer transition-colors hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent`}>{content}</button>
      : <div key={`${item.itemId ?? item.name}-${item.skill}`} className={className}>{content}</div>;
  };

  return <div className="space-y-7">
    {!!starterRecipes.length && <section className="rounded-[var(--radius-md)] border border-accent/25 bg-elevated p-4">
      <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">{t("professions.starter.eyebrow")}</p><h3 className="mt-0.5 font-display text-[17px] font-semibold text-zinc-100">{t("professions.starter.title")}</h3></div>
        <button type="button" onClick={onOpenRecipes} className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-semibold text-accent hover:text-white focus-visible:outline-2 focus-visible:outline-accent">{t("professions.starter.allRecipes")}<ChevronRight size={13} aria-hidden="true" /></button>
      </div>
      <div className="grid gap-1.5 @min-[760px]:grid-cols-3">{starterRecipes.map((recipe) => <button key={recipe.id} type="button"
        onClick={() => openReference({ category: "items", id: recipe.itemId!, name: recipe.name })}
        className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-2 text-left hover:border-accent/40 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent">
        {recipe.icon && <ItemIcon icon={recipe.icon} name={recipe.name} size={29} />}
        <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-zinc-100">{recipe.name}</span><span className="block text-[10px] text-subtle">{t("professions.skill", { value: recipe.skill })} · {t("professions.starter.materialCount", { count: recipe.reagents.length })}</span></span>
        <ChevronRight size={12} className="shrink-0 text-subtle" aria-hidden="true" />
      </button>)}</div>
    </section>}
    {entry.camping && <section className="rounded-[var(--radius-md)] border border-accent/35 bg-accent-soft/40 p-4">
      <p className="text-[13px] leading-5 text-zinc-200">{entry.camping.description}</p>
      <ul className="mt-3 grid gap-2 @min-[760px]:grid-cols-2">{entry.camping.features.map((line) => <li key={line} className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[12px] leading-5 text-zinc-300">{line}</li>)}</ul>
    </section>}
    {!!entry.changes.length && <section>
      <DatabaseSectionTitle>{t("professions.changes")}</DatabaseSectionTitle>
      <ul className="grid gap-2 @min-[760px]:grid-cols-2">{entry.changes.map((change) => <li key={change} className="flex gap-2.5 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-[12px] leading-5 text-zinc-200">
        <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />{change}
      </li>)}</ul>
    </section>}
    {entry.note && <p className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[11px] leading-5 text-subtle">{entry.note}</p>}
    {!!entry.featured.length && <section>
      <DatabaseSectionTitle count={entry.featured.length}>{t("professions.featuredRecipes")}</DatabaseSectionTitle>
      <div className="grid gap-2 @min-[760px]:grid-cols-2">{entry.featured.map(feature)}</div>
    </section>}
    {!!entry.fixtures.length && <section>
      <DatabaseSectionTitle count={entry.fixtures.length}>{t("professions.campFixtures")}</DatabaseSectionTitle>
      <div className="grid gap-2 @min-[760px]:grid-cols-2">{entry.fixtures.map(feature)}</div>
    </section>}
  </div>;
};

export default ProfessionOverviewPanel;
