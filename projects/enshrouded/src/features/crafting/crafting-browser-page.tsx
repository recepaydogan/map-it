import { useGameText } from "../../i18n/game-text";
import { matchesContentSearch } from "../../i18n/content-search";
import EnshroudedWikiProse from "../map/enshrouded-wiki-prose";
import { DEFAULT_MAP_ID } from "../map/map-registry";
import { requestMapPointInMain } from "../map/map-window-bridge";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { BUILDING_NAVIGATION_EVENT, hasBuildingPage } from "../knowledge/building-navigation";
import { WIKI_NAVIGATION_EVENT, hasWikiPage } from "../knowledge/wiki-navigation";
import CraftingItemImage from "./crafting-item-image";
import CraftingSidebarNavigation, { type CraftingSection } from "./crafting-sidebar-navigation";
import { ItemCatalogCategory } from "../../components/layout/item-catalog";
import EnshroudedCatalog from "../knowledge/enshrouded-catalog";
import { CRAFTING_CATALOG, craftedAt, craftingKey, findCraftingItem, recipesFor, usedInCrafting } from "./enshrouded-crafting-catalog";
import type { CraftingRecipe } from "./enshrouded-crafting-types";
import EnshroudedItemRow from "../knowledge/enshrouded-item-row";
import { getCraftingObtaining } from "./enshrouded-crafting-obtaining";

const PAGE_SIZE = 100;
const allEntries = [...CRAFTING_CATALOG.stations, ...CRAFTING_CATALOG.materials];
const stationNames = new Set(CRAFTING_CATALOG.stations.map((entry) => craftingKey(entry.name)));
const entryGroup = (entry: (typeof allEntries)[number]) =>
  stationNames.has(craftingKey(entry.name)) ? entry.group ?? entry.type ?? "" : entry.type ?? entry.group ?? "";

const SectionHeading = ({ children }: { children: ReactNode }) =>
  {
  return (<h3 className="mb-3 flex items-center gap-3 text-base font-semibold leading-6 text-white">
    <span className="h-4 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />{children}
  </h3>);
};

export default function CraftingBrowserPage({ initialPage }: { initialPage?: string | null }) {
  const contentText = useGameText();
  const { t, i18n } = useTranslation();
  const initial = initialPage ? findCraftingItem(initialPage) : undefined;
  const [history, setHistory] = useState<string[]>(() => initial ? [initial.name] : []);
  const [section, setSection] = useState<CraftingSection>(() => initial
    ? stationNames.has(craftingKey(initial.name)) ? "stations" : "materials" : "all");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const selected = findCraftingItem(history.at(-1) ?? "") ?? allEntries[0]!;
  const kind = stationNames.has(craftingKey(selected.name)) ? "stations" : "materials";
  const obtaining = getCraftingObtaining(selected);
  const entries = section === "all" ? allEntries : CRAFTING_CATALOG[section];
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const name = entryGroup(entry);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].sort(([left], [right]) => left.localeCompare(right));
  }, [entries]);
  const filtered = useMemo(() => entries.filter((entry) =>
    (!group || entryGroup(entry) === group)
      && matchesContentSearch(query, [entry.name, entry.description, entry.type, entry.group], contentText),
  ), [entries, group, query, contentText]);
  const resetResults = () => { setHistory([]); setLimit(PAGE_SIZE); };
  const selectSection = (next: CraftingSection) => {
    setSection(next);
    setGroup("");
    resetResults();
  };

  const selfRecipes = recipesFor(selected.name);
  const recipeTimes = [...new Set(selfRecipes.filter((recipe) => recipe.craftTime)
    .map((recipe) => `${recipe.craftTime}${selfRecipes.some((other) => other.craftTime !== recipe.craftTime)
      ? ` (${recipe.stations.map(name => contentText(name)).join(", ") || t("craftingGuide.manual")})` : ""}`))];
  const associated = kind === "stations" ? craftedAt(selected.name) : usedInCrafting(selected.name);
  const related = [...new Map(associated.map((recipe) => [craftingKey(recipe.output.name), recipe])).values()];
  const shown = expanded ? related : related.slice(0, 40);

  const navigate = (name: string) => {
    const target = findCraftingItem(name);
    if (target) {
      setHistory((current) => {
        const index = current.findIndex((page) => craftingKey(page) === craftingKey(name));
        return index >= 0 ? current.slice(0, index + 1) : [...current, target.name].slice(-32);
      });
      setExpanded(false);
    } else if (hasBuildingPage(name)) window.dispatchEvent(new CustomEvent(BUILDING_NAVIGATION_EVENT, { detail: name }));
    else if (hasWikiPage(name)) window.dispatchEvent(new CustomEvent(WIKI_NAVIGATION_EVENT, { detail: name }));
  };

  const Link = ({ name, quantity }: { name: string; quantity?: number }) => {
    const target = findCraftingItem(name);
    const linked = Boolean(target || hasBuildingPage(name) || hasWikiPage(name));
    return <EnshroudedItemRow name={name} quantity={quantity}
      onClick={linked ? () => navigate(name) : undefined} />;
  };

  const Recipe = ({ recipe }: { recipe: CraftingRecipe }) => <div className="py-1">
    <div className="grid gap-3">
      <div className="min-w-0"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("craftingGuide.ingredients")}</p>
        <div className="grid gap-x-5 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))" }}>
          {recipe.ingredients.map((part, index) => <Link key={`${part.name}:${index}`} name={part.name} quantity={part.quantity} />)}
        </div></div>
      <div className="w-full max-w-[380px]"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("craftingGuide.workstation")}</p>
        {recipe.stations.length ? recipe.stations.map((name) => <Link key={name} name={name} />)
          : <p className="text-xs text-zinc-400">{t("craftingGuide.manual")}</p>}</div>
    </div>
  </div>;

  const facts: [string, string | number | null][] = [
    [t("craftingGuide.type"), selected.type], [t("craftingGuide.rarity"), selected.rarity],
    [t("craftingGuide.stackSize"), selected.stackSize], [t("craftingGuide.craftTime"), recipeTimes.join(" · ") || null],
    [t("craftingGuide.level"), selected.level],
    [t("craftingGuide.biomes"), selected.biomes],
  ];

  return <EnshroudedCatalog
    label={t("craftingGuide.title")}
    search={{ query, label: t("craftingGuide.search"), clearLabel: t("craftingGuide.clearSearch"),
      onChange: (value) => { setQuery(value); resetResults(); } }}
    categories={<CraftingSidebarNavigation activeSection={section} onSelect={selectSection}>
      {groups.map(([name, count]) => <ItemCatalogCategory key={name} label={contentText(name)}
        count={count.toLocaleString(i18n.language)} active={group === name}
        onSelect={() => { setGroup(group === name ? "" : name); resetResults(); }} />)}
    </CraftingSidebarNavigation>}
    columns={[{ label: t("itemCatalog.categories") }]}
    rows={filtered.slice(0, limit).map((entry) => ({
      id: entry.name, label: contentText(entry.name), subtitle: contentText(entryGroup(entry)),
      icon: <CraftingItemImage name={entry.name} size={30} />, cells: [contentText(entryGroup(entry))],
    }))}
    onOpen={navigate} onBack={() => setHistory([])} backLabel={t("reference.backToList")}
    emptyMessage={t("craftingGuide.noResults")}
    afterRows={filtered.length > limit && <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)}>
      {t("reference.showMore", { count: filtered.length - limit })}
    </button>}
    detail={history.length > 0 && <article key={selected.name} className="@container h-full overflow-y-auto px-5 py-6 sm:px-6">
      {history.length > 1 && <button type="button"
        onClick={() => { setHistory((trail) => trail.slice(0, -1)); setExpanded(false); }}
        className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white">
        <ArrowLeft size={15} aria-hidden="true" />
        {t("craftingGuide.backTo", { name: contentText(history.at(-2)) })}
      </button>}
        <div className="flex flex-wrap items-start gap-4 border-b border-border pb-6">
          <div className="grid h-20 w-20 shrink-0 place-items-center"><CraftingItemImage name={selected.name} size={64} /></div>
          <div className="min-w-[200px] flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">{t(`craftingGuide.${kind}`)}{contentText(selected.group ? ` · ${selected.group}` : "")}</p>
            <h2 className="mt-1 text-[25px] font-semibold leading-[1.15] text-white">{contentText(selected.name)}</h2>
          </div>
        </div>
        <div className="max-w-[760px] space-y-7 py-6">
          {facts.some(([, value]) => value !== null && value !== undefined && value !== "") &&
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-border/70 py-4 @min-[660px]:grid-cols-3">
              {facts.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) =>
                <div key={label} className={cn("min-w-0", label === t("craftingGuide.craftTime") && recipeTimes.length > 1
                  && "col-span-2 @min-[660px]:col-span-3")}><dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
                  <dd className="mt-1 text-[13px] text-zinc-100">{contentText(value)}</dd></div>)}</dl>}
          {contentText(selected.description && <section><SectionHeading>{t("craftingGuide.description")}</SectionHeading>
            <p className="text-[13px] leading-relaxed text-zinc-300">{contentText(selected.description)}</p></section>)}
          {contentText(obtaining && <section><SectionHeading>{t("craftingGuide.obtaining")}</SectionHeading>
            <p className="text-[13px] leading-relaxed text-zinc-300"><EnshroudedWikiProse text={obtaining} name={selected.name}
              onOpenEntry={target => navigate(target.page)} onOpenMap={id => requestMapPointInMain(id, DEFAULT_MAP_ID)} /></p></section>)}
          {selfRecipes.length > 0 && <section><SectionHeading>{t("craftingGuide.crafting", { name: contentText(selected.name) })}</SectionHeading>
            <div className="grid gap-3">{selfRecipes.map((recipe) => <Recipe key={recipe.id} recipe={recipe} />)}</div></section>}
          {related.length > 0 && <section><SectionHeading>{t(kind === "stations" ? "craftingGuide.craftedHere" : "craftingGuide.usedIn", { count: related.length })}</SectionHeading>
            <div className="grid gap-1 @min-[660px]:grid-cols-2">{shown.map((recipe) =>
              <Link key={recipe.id} name={recipe.output.name} />)}</div>
            {related.length > shown.length && <button type="button" onClick={() => setExpanded(true)}
              className="mt-2 text-xs font-semibold text-accent hover:underline">{t("craftingGuide.showAll", { count: related.length })}</button>}
          </section>}
          {hasBuildingPage(selected.name) && <button type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(BUILDING_NAVIGATION_EVENT, { detail: selected.name }))}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
            {t("craftingGuide.openBuilding")}<ChevronRight size={13} /></button>}
        </div>
    </article>}
  />;
}
