import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { CatalogSearch } from "../../components/catalog-workspace";
import DatabaseSectionTitle from "../database/database-section-title";
import ItemIcon from "../database/item-icon";
import type { ProfessionEntry, ProfessionRecipe } from "./profession-types";

const PAGE_SIZE = 40;

const ProfessionFinderPanel = ({ professions, onSelect }: {
  professions: ProfessionEntry[];
  onSelect: (profession: ProfessionEntry, recipe: ProfessionRecipe) => void;
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [professionId, setProfessionId] = useState("");
  const [skillLimit, setSkillLimit] = useState("");
  const [favorLimit, setFavorLimit] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const maxSkill = Number(skillLimit);
    const maxFavor = Number(favorLimit);
    return professions.flatMap((profession) => profession.recipes
      .filter((recipe) => (!professionId || profession.id === professionId)
        && (!skillLimit || (recipe.clientSkill ?? recipe.skill) <= maxSkill)
        && (!favorLimit || (recipe.favorPrice !== undefined && recipe.favorPrice <= maxFavor))
        && (!term || recipe.name.toLocaleLowerCase().includes(term)
          || profession.name.toLocaleLowerCase().includes(term)
          || recipe.reagents.some((reagent) => reagent.name.toLocaleLowerCase().includes(term))))
      .map((recipe) => ({ profession, recipe })));
  }, [professions, professionId, skillLimit, favorLimit, query]);
  const resetPage = () => setVisible(PAGE_SIZE);

  return <div className="space-y-4">
    <div className="catalog-toolbar rounded-[var(--radius-md)] border border-border bg-(--color-surface)">
      <CatalogSearch label={t("professions.searchRecipes")} value={query} onChange={(value) => { setQuery(value); resetPage(); }} />
      <CategoryDropdown neutral value={professionId} onChange={(value) => { setProfessionId(value); resetPage(); }}
        ariaLabel={t("professions.finderProfession")} triggerClassName="h-[38px] w-auto text-[12px]"
        options={[{ key: "", label: t("professions.finderAllProfessions") },
          ...professions.map((profession) => ({ key: profession.id, label: profession.name }))]} />
      <input type="number" min="1" max="300" value={skillLimit} onChange={(event) => { setSkillLimit(event.target.value); resetPage(); }}
        placeholder={t("professions.skillLimit")} aria-label={t("professions.skillLimit")}
        className="h-[38px] w-28 rounded-[var(--radius-sm)] border border-border bg-background px-3 text-[12px] text-white outline-none placeholder:text-muted focus:border-accent" />
      <input type="number" min="1" value={favorLimit} onChange={(event) => { setFavorLimit(event.target.value); resetPage(); }}
        placeholder={t("professions.maxFavor")} aria-label={t("professions.maxFavor")}
        className="h-[38px] w-28 rounded-[var(--radius-sm)] border border-border bg-background px-3 text-[12px] text-white outline-none placeholder:text-muted focus:border-accent" />
    </div>
    <p className="text-[12px] leading-relaxed text-subtle">{t("professions.finderIntro")}</p>
    {favorLimit && <p className="text-[11px] text-subtle">{t("professions.favorFilterNote")}</p>}
    <DatabaseSectionTitle count={results.length}>{t("professions.finderResults")}</DatabaseSectionTitle>
    <div className="grid gap-2 @min-[760px]:grid-cols-2">{results.slice(0, visible).map(({ profession, recipe }) => <button
      key={`${profession.id}:${recipe.id}`} type="button" onClick={() => onSelect(profession, recipe)}
      className="group flex min-h-[66px] w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-left hover:border-accent/45 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent">
      {recipe.icon && <ItemIcon icon={recipe.icon} name={recipe.name} size={36} />}
      <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-zinc-100 group-hover:text-white">{recipe.name}</span>
        <span className="mt-0.5 block text-[11px] text-subtle">{profession.name} · {t("professions.skill", { value: recipe.clientSkill ?? recipe.skill })}{recipe.clientSkill === undefined && recipe.estimatedSkill ? " ≈" : ""}{recipe.favorPrice !== undefined ? ` · ${t("professions.favorPrice", { price: recipe.favorPrice })}` : ""}</span></span>
      <span className="flex shrink-0 items-center gap-2">{recipe.new && <span className="rounded-[var(--radius-sm)] bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{t("professions.new")}</span>}
        <ArrowRight size={15} className="text-subtle group-hover:text-accent" aria-hidden="true" /></span>
    </button>)}</div>
    {!results.length && <p className="py-8 text-center text-[12px] text-subtle">{t("professions.noMatches")}</p>}
    {results.length > visible && <button type="button" onClick={() => setVisible((count) => count + PAGE_SIZE)}
      className="w-full cursor-pointer rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5 text-[12px] font-medium text-accent hover:border-accent/50">{t("professions.showMore", { count: results.length - visible })}</button>}
  </div>;
};

export default ProfessionFinderPanel;
