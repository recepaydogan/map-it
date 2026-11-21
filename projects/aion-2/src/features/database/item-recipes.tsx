import { getItemDisplayName } from "../../lib/item-display-name";
import { factionDisplayName } from "../../lib/faction-display-name";
import { useGameText } from "../../i18n/game-text";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import ReferenceSections, { ReferenceFacts, ReferenceLinks } from "../reference/reference-sections";
import type { ReferenceEntry, ReferenceLink, ReferenceSummary } from "../reference/reference-types";
import { useReferenceEntries, useReferenceIndex } from "../reference/use-reference-data";
import DatabaseSectionTitle from "./database-section-title";
import { groupItemRecipes } from "./group-item-recipes";
import type { DatabaseItem } from "./item-database-types";
import { withRecipeItemDetails } from "./recipe-item-details";
import RecipeBonusOutcome from "./recipe-bonus-outcome";
import { useItemCatalog } from "./use-item-catalog";

const Recipe = ({ entry, allEntries, itemId, itemsById }: {
  entry: ReferenceEntry;
  allEntries: Map<string, ReferenceEntry>;
  itemId: string;
  itemsById: Map<string, DatabaseItem>;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const ownOutput = entry.sections.find((section) => section.title === "reference.labels.produces")
    ?.links?.find((link) => link.category === "items" && link.id === itemId);
  const sections = withRecipeItemDetails(entry, entry.sections.filter((section) => ![
    "reference.labels.combo-recipe",
    "reference.labels.mastery-success-rates",
    "reference.labels.success-and-alternatives",
  ].includes(section.title)).map((section) => ({
    ...section, links: section.links?.filter((link) => link.category !== "recipes"
      && !(section.title === "reference.labels.produces" && link.category === "items" && link.id === itemId)),
  })).filter((section) => section.text || section.facts?.length || section.links?.length || section.rows?.length),
  itemsById, (level) => t("database.recipeRequiredEnhancement", { level }));
  const ingredients = sections.filter((section) => section.title === "reference.labels.ingredients");
  const otherSections = sections.filter((section) => !ingredients.includes(section));
  return <div className="space-y-4 border-l border-accent/25 pl-3">
    {!ownOutput && <h4 className="text-[13px] font-medium text-accent">{getItemDisplayName(entry.name, gameText(entry.name))}</h4>}
    {ingredients.length > 0 && <ReferenceSections sections={ingredients} />}
    <RecipeBonusOutcome entry={entry} allEntries={allEntries} />
    {entry.facts.length > 0 && <ReferenceFacts facts={entry.facts} />}
    {ownOutput?.quantity !== undefined && ownOutput.quantity > 1 && <p className="text-xs text-muted">{t("database.recipeYield", { count: ownOutput.quantity })}</p>}
    {otherSections.length > 0 && <ReferenceSections sections={otherSections} />}
  </div>;
};

const RecipeSelection = ({ entries, allEntries, itemId, initialRecipeId, itemsById }: {
  entries: ReferenceEntry[];
  allEntries: Map<string, ReferenceEntry>;
  itemId: string;
  initialRecipeId?: string;
  itemsById: Map<string, DatabaseItem>;
}) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [selected, setSelected] = useState(initialRecipeId ?? "");
  const recipes = groupItemRecipes(entries, allEntries);
  const current = recipes.find((entry) => entry.id === selected) ?? recipes[0];
  if (!current) return null;
  return <>
    {recipes.length > 1 && <div className="mb-4">
      <CategoryDropdown value={current.id} onChange={setSelected} ariaLabel={t("reference.labels.available-recipes")}
        options={recipes.map((entry, index) => ({ key: entry.id, label: [index + 1, getItemDisplayName(entry.name, gameText(entry.name)),
          ...entry.facts.filter((fact) => ["reference.labels.faction", "reference.labels.profession"].includes(fact.label))
            .map((fact) => fact.label === "reference.labels.faction"
              ? factionDisplayName(String(fact.value), t, gameText) : gameText(String(fact.value))),
        ].join(" · ") }))} />
    </div>}
    <Recipe key={current.id} entry={current} allEntries={allEntries} itemId={itemId} itemsById={itemsById} />
  </>;
};

const RecipeList = ({ links, summaries, itemId, outputsOnly, initialRecipeId, itemsById }: { links: ReferenceLink[]; summaries: Map<string, ReferenceSummary>; itemId: string; outputsOnly: boolean; initialRecipeId?: string; itemsById: Map<string, DatabaseItem> }) => {
  const { t } = useTranslation();
  const unique = [...new Map(links.map((link) => [link.id, link])).values()];
  const requested = unique.flatMap((link) => summaries.get(link.id) ?? []);
  const state = useReferenceEntries(requested, "recipes");
  if (requested.length !== unique.length || state.status === "error") return <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>;
  if (state.status !== "ready") return <p role="status" className="text-xs text-muted">{t("reference.loading")}</p>;
  const allEntries = new Map(state.data.map((entry) => [entry.id, entry]));
  const requestedIds = new Set(unique.map((link) => link.id));
  const entries = state.data.filter((entry) => requestedIds.has(entry.id));
  if (outputsOnly) {
    const outputs = groupItemRecipes(entries, allEntries).flatMap((entry) => withRecipeItemDetails(entry, entry.sections,
      itemsById, (level) => t("database.recipeRequiredEnhancement", { level }))
      .filter((section) => section.title === "reference.labels.produces")
      .flatMap((section) => section.links ?? [])
      .filter((link) => link.category === "items")
      .map((link) => ({ ...link, category: "recipes", id: entry.id })));
    return <ReferenceLinks links={outputs} />;
  }
  return <RecipeSelection entries={entries} allEntries={allEntries} itemId={itemId} initialRecipeId={initialRecipeId} itemsById={itemsById} />;
};

const ItemRecipes = ({ title, links, itemId, outputsOnly = false, initialRecipeId, hideTitle = false }: { title?: string; links: ReferenceLink[]; itemId: string; outputsOnly?: boolean; initialRecipeId?: string; hideTitle?: boolean }) => {
  const { t } = useTranslation();
  const index = useReferenceIndex();
  const catalogState = useItemCatalog();
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const itemsById = useMemo(() => new Map(catalog?.items.map((item) => [item.id, item]) ?? []), [catalog]);
  const summaries = new Map(index.status === "ready" ? index.data.entries.filter((entry) => entry.category === "recipes").map((entry) => [entry.id, entry]) : []);
  return <section className="max-w-[760px] space-y-5">
    {!hideTitle && <DatabaseSectionTitle>{t(title ?? "reference.labels.available-recipes")}</DatabaseSectionTitle>}
    {index.status !== "ready" || catalogState.status !== "ready" ? <p className="text-xs text-muted" role={index.status === "error" || catalogState.status === "error" ? "alert" : "status"}>{t(index.status === "error" ? "reference.error" : catalogState.status === "error" ? "database.error" : "reference.loading")}</p>
      : <RecipeList links={links.filter((link) => summaries.has(link.id))} summaries={summaries} itemId={itemId} outputsOnly={outputsOnly} initialRecipeId={initialRecipeId} itemsById={itemsById} />}
  </section>;
};

export default ItemRecipes;
