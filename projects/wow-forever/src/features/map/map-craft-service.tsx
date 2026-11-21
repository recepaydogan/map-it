import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import CategoryDropdown from "../../components/category-dropdown";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLinks } from "../reference/reference-sections";
import { useCraftServices } from "../reference/use-reference-data";

const MapCraftService = ({ npcId }: { npcId?: string }) => {
  const { t, i18n } = useTranslation();
  const state = useCraftServices(Boolean(npcId));
  const [selectedTab, setSelectedTab] = useState("");
  if (!npcId || state.status === "loading") return null;
  if (state.status === "error") return <p role="alert" className="mt-4 text-xs text-danger-text">{t("reference.error")}</p>;
  const station = state.data.stations[npcId];
  if (!station) return null;
  const group = station.groups.find((item) => item.tab === selectedTab) ?? station.groups[0];
  const comboRecipes = station.groups.flatMap((item) => item.recipes).filter((recipe) => recipe.comboChance > 0);
  const chances = new Set(comboRecipes.map((recipe) => recipe.comboChance));
  const uniformChance = chances.size === 1 ? [...chances][0] : undefined;
  const outcomes = new Set(comboRecipes.map((recipe) => recipe.comboResult)
    .filter((result) => result && result !== "unlisted"));
  const onlyOutcome = comboRecipes.every((recipe) => recipe.comboResult !== "unlisted") && outcomes.size === 1
    ? [...outcomes][0] : undefined;
  const comboMeaning = outcomes.size === 0 ? "reference.craftService.comboMeaningUnlisted"
    : onlyOutcome === "higher-level" ? "reference.craftService.comboMeaning"
      : onlyOutcome === "extra-items" ? "reference.craftService.comboMeaningExtra"
        : onlyOutcome === "alternate" || onlyOutcome === "same-item" ? "reference.craftService.comboMeaningAlternate"
          : "reference.craftService.comboMeaningVaries";
  const recipesById = new Map(group?.recipes.map((recipe) => [recipe.id, recipe]));

  return <section className="mt-4 space-y-3 border-t border-border pt-4">
    {comboRecipes.length > 0 && <div className="space-y-1 text-[12px] leading-relaxed text-zinc-400">
      <p className="flex items-start gap-1.5">
        <Zap size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <span>{uniformChance === undefined
          ? t("reference.craftService.comboDescriptionVaries")
          : t("reference.craftService.comboDescription", { chance: uniformChance })}</span>
      </p>
      <p className="pl-5">{t(comboMeaning)}</p>
    </div>}
    <dl className="divide-y divide-border/50 rounded-[var(--radius-sm)] border border-border bg-surface px-3">
      <div className="flex items-center justify-between gap-4 py-2 text-[13px]">
        <dt className="text-zinc-400">{t("reference.craftService.unlockLevel")}</dt>
        <dd className="text-right font-medium tabular-nums text-zinc-100">{station.unlockLevel.toLocaleString(i18n.language)}</dd>
      </div>
    </dl>
    {group && <>
      <div>
        <DatabaseSectionTitle count={station.listedCount}>{t("reference.labels.available-recipes")}</DatabaseSectionTitle>
        {station.groups.length > 1 && <CategoryDropdown ariaLabel={t("reference.labels.available-recipes")} value={group.tab} onChange={setSelectedTab}
          options={station.groups.map((item) => ({
            key: item.tab,
            label: t(`reference.craftService.groups.${item.tab}`, { defaultValue: item.tab }),
            count: item.recipes.length,
          }))} />}
      </div>
      <ReferenceLinks key={group.tab} links={group.recipes.map((recipe) => ({
        id: recipe.id, name: recipe.name, icon: recipe.icon, category: "recipes",
        note: `${recipe.craftType === "Succession" && recipe.mastery === 0
          ? t("reference.craftService.transferRecipe")
          : t("database.masteryLevel", { level: recipe.mastery })}${recipe.comboResult === "unlisted"
            ? ` · ${t("reference.craftService.comboOutcomeUnlisted")}` : ""}`,
      }))} initialCount={10} trailing={(link) => {
        const recipe = recipesById.get(link.id);
        if (!recipe?.comboChance) return null;
        const label = t(recipe.comboResult === "unlisted"
          ? "reference.craftService.comboIndicatorUnlisted" : "reference.craftService.comboIndicator",
        { chance: recipe.comboChance });
        return <span role="img" aria-label={label} title={label} className="inline-flex shrink-0 items-center gap-0.5 text-accent">
          <Zap size={14} aria-hidden="true" />
          {uniformChance === undefined && <span className="text-[11px] tabular-nums" aria-hidden="true">{recipe.comboChance}%</span>}
        </span>;
      }} />
    </>}
  </section>;
};

export default MapCraftService;
