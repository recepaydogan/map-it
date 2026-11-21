import { useGameText } from "../../i18n/game-text";
import { matchesContentSearch } from "../../i18n/content-search";
import { ArrowLeft, BookOpen, ChevronRight, Package, Search, Sparkles, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import rawCatalog from "../../../public/data/enshrouded/progression-catalog.json";
import { ItemCatalogCategory } from "../../components/layout/item-catalog";
import ProgressiveList from "../../components/progressive-list";
import EnshroudedCatalog from "./enshrouded-catalog";
import DatabaseSectionTitle from "../database/database-section-title";
import EnshroudedItemImage from "./enshrouded-item-image";
import LinkedText from "./inline-linked-text";
import { CRAFTING_CATALOG, craftingKey } from "../crafting/enshrouded-crafting-catalog";
import { contentUrl } from "../../lib/content-url";
import { CRAFTING_NAVIGATION_EVENT, craftingSectionFor, hasCraftingPage } from "../crafting/crafting-navigation";
import { BUILDING_NAVIGATION_EVENT, hasBuildingPage } from "./building-navigation";
import { WIKI_NAVIGATION_EVENT, hasWikiPage } from "./wiki-navigation";
import { findProgressionPage, type ProgressionCatalog } from "./progression-navigation";

const PAGE_SIZE = 100;
type EntryKind = ProgressionCatalog | "set-items";
interface ContentLink { page: string; label: string; markerId?: string }
interface ContentCell { text: string; links: ContentLink[] }
interface ContentBlock {
  kind: "text" | "list" | "table";
  text?: string;
  links?: ContentLink[];
  items?: ContentCell[];
  headers?: string[];
  rows?: ContentCell[][];
}
interface ContentSection { title: string; blocks: ContentBlock[] }
interface Quest { id: string; name: string; group: string; sections: ContentSection[] }
interface SetRecord {
  id: string; name: string; group: string; region?: string | null; reward: string; declaredCount: string;
  items: { name: string; page: string | null; image: string | null }[];
}
interface SetItem {
  id: string; name: string; group: string; image: string | null; description?: string | null;
  relatedSets: string[];
  facts: { name: string; value: string; links: ContentLink[] }[];
  sections: ContentSection[];
}
interface Npc {
  id: string; name: string; role: string; group: "craftspeople" | "assistants" | "villagers";
  image: string | null; description: string | null;
  facts: { name: string; value: string; links: ContentLink[] }[];
  sections: ContentSection[];
  quests?: string[];
}
const catalog = rawCatalog as { questIcon?: string | null; rewardIcons: Record<string, string>;
  quests: Quest[]; sets: SetRecord[]; setItems: SetItem[]; npcs: Npc[] };
const keyOf = (kind: EntryKind, id: string) => `${kind}:${id}`;
const entries = [
  ...catalog.quests.map((entry) => ({ kind: "quests" as const, entry, key: keyOf("quests", entry.id) })),
  ...catalog.sets.map((entry) => ({ kind: "sets" as const, entry, key: keyOf("sets", entry.id) })),
  ...catalog.setItems.map((entry) => ({ kind: "set-items" as const, entry, key: keyOf("set-items", entry.id) })),
  ...catalog.npcs.map((entry) => ({ kind: "npcs" as const, entry, key: keyOf("npcs", entry.id) })),
];
const byKey = new Map(entries.map((entry) => [entry.key, entry]));
const questById = new Map(catalog.quests.map((entry) => [entry.id, entry]));
const questByName = new Map(catalog.quests.map((entry) => [entry.name.toLocaleLowerCase("en"), entry]));
const npcByName = new Map(catalog.npcs.flatMap((entry) => [entry.id, entry.name, entry.role]
  .map((name) => [name.toLocaleLowerCase("en"), entry] as const)));
const imageFor = (entry: (typeof entries)[number]) => entry.kind === "npcs" ? entry.entry.image
  : entry.kind === "sets" ? entry.entry.items.find((item) => item.image)?.image
    : entry.kind === "set-items" ? entry.entry.image : catalog.questIcon;

function InlineLinkedText({ value, links, onOpenPage, isLinked }: {
  value: string; links: ContentLink[];
  onOpenPage: (link: ContentLink) => void;
  isLinked: (link: ContentLink) => boolean;
}) {
  return <LinkedText value={value} links={links.map((link) => ({
    label: link.label, onClick: isLinked(link) ? () => onOpenPage(link) : undefined,
  }))} />;
}

function NpcCraftingSection({ section, role, onOpenPage }: {
  section: ContentSection;
  role: string;
  onOpenPage: (link: ContentLink) => void;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const searchId = useId();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const crafter = role.replace(/ Assistant$/, "");
  const recipes = CRAFTING_CATALOG.recipes.filter((recipe) => recipe.stations.some((station) =>
    craftingKey(station) === craftingKey(crafter)));
  const matchingRecipes = query.trim()
    ? recipes.filter((recipe) => matchesContentSearch(query, [recipe.output.name], contentText)) : recipes;
  return <section className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex min-w-0 items-center gap-3 text-base font-semibold text-white">
        <span className="h-4 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
        {contentText(section.title)}<span className="whitespace-nowrap text-xs font-normal text-zinc-500">· {t("progressionGuide.craftingRecipes", { count: recipes.length })}</span>
      </h3>
      <button type="button" aria-label={searchOpen ? t("progressionGuide.clearSearch") : t("progressionGuide.searchCraftedItems")}
        aria-expanded={searchOpen} aria-controls={searchOpen ? searchId : undefined}
        onClick={() => { setSearchOpen((open) => !open); setQuery(""); }}
        className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-border text-zinc-400 hover:border-accent/50 hover:bg-accent-soft hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        {searchOpen ? <X size={15} aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
      </button>
    </div>
    {searchOpen && <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 focus-within:border-accent/60">
      <Search size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />
      <input id={searchId} autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)}
        aria-label={t("progressionGuide.searchCraftedItems")} placeholder={t("progressionGuide.searchCraftedItems")}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500" />
      {contentText(query && <button type="button" onClick={() => setQuery("")} aria-label={t("progressionGuide.clearSearch")}
        className="text-zinc-500 hover:text-white"><X size={14} aria-hidden="true" /></button>)}
    </div>}
    <ProgressiveList key={query} initialCount={24} pageSize={24} className="grid gap-2 @min-[580px]:grid-cols-2">
      {matchingRecipes.map((recipe) => <button key={recipe.id} type="button"
        onClick={() => onOpenPage({ page: recipe.output.name, label: recipe.output.name })}
        className="group flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface/45 px-3 py-2 text-left hover:border-accent/40 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <EnshroudedItemImage name={recipe.output.name} size={36} />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium text-zinc-100">{contentText(recipe.output.name)}</span>
          <span className="shrink-0 rounded-[var(--radius-sm)] bg-accent-soft px-2 py-1 text-xs font-semibold tabular-nums text-accent">
            ×{recipe.output.quantity}
          </span>
        </span>
        <ChevronRight size={15} className="shrink-0 text-zinc-500 group-hover:text-accent" aria-hidden="true" />
      </button>)}</ProgressiveList>
    {matchingRecipes.length === 0 && <p className="py-3 text-xs text-zinc-400">{t("progressionGuide.noResults")}</p>}
  </section>;
}

function RewardCard({ value, links: rewardLinks, onOpenPage, isLinked }: {
  value: string; links: ContentLink[];
  onOpenPage: (link: ContentLink) => void;
  isLinked: (link: ContentLink) => boolean;
}) {
  const contentText = useGameText();
  const { t } = useTranslation();
  const xp = value.match(/\b([\d,]+)\s*XP\b/i)?.[1];
  const recipes = value.match(/\b(\d+)\s+Recipes?\b/i)?.[1];
  const other = value.replace(/^Reward\s*:\s*/i, "").replace(/\b[\d,]+\s*XP\b/gi, "")
    .replace(/\b\d+\s+Recipes?\b/gi, "")
    .replace(/\band\b/gi, "")
    .replaceAll(",", " ").trim();
  const showOther = rewardLinks.length === 0 && !xp && !recipes;
  return <div className="rounded-[var(--radius-md)] border border-border p-3.5">
    <h3 className="flex items-center gap-3 text-base font-semibold text-white">
      <span className="h-4 w-[3px] rounded-full bg-accent" aria-hidden="true" />{t("progressionGuide.reward")}
    </h3>
    <div className="mt-3 grid gap-2 @min-[580px]:grid-cols-2">
      {rewardLinks.map((link, index) => {
        const icon = catalog.rewardIcons[link.page.replaceAll("_", " ").toLocaleLowerCase("en")];
        const className = "flex min-h-12 items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface/75 px-3 py-2 text-left text-[13px] font-medium text-zinc-100";
        const body = <>{icon ? <img src={contentUrl(icon)} alt="" className="h-8 w-8 shrink-0 object-contain" />
          : <Package size={20} className="shrink-0 text-amber-200/70" aria-hidden="true" />}
          <span className="min-w-0 flex-1">{contentText(link.label)}</span>{isLinked(link) && <ChevronRight size={14} className="shrink-0 text-zinc-500" />}</>;
        return isLinked(link) ? <button key={`${link.page}:${index}`} type="button" onClick={() => onOpenPage(link)}
          className={`${className} hover:border-accent/40 hover:text-white`}>{body}</button>
          : <div key={`${link.page}:${index}`} className={className}>{body}</div>;
      })}
      {contentText(xp && <div className="flex min-h-12 items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface/75 px-3 py-2 text-[13px] font-semibold text-zinc-100">
        <Sparkles size={21} className="shrink-0 text-violet-300" aria-hidden="true" />{contentText(xp)} XP
      </div>)}
      {contentText(recipes && <div className="flex min-h-12 items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface/75 px-3 py-2 text-[13px] font-semibold text-zinc-100">
        <BookOpen size={21} className="shrink-0 text-amber-200" aria-hidden="true" />
        {t("progressionGuide.recipesUnlocked", { count: Number(recipes) })}
      </div>)}
      {showOther && <div className="col-span-full text-[13px] text-zinc-300">{contentText(other.toLowerCase() === "none"
        ? t("progressionGuide.noReward") : other)}</div>}
    </div>
  </div>;
}

export default function ProgressionGuidePage({ catalog: kind, initialPage, onOpenMap, onCatalogChange }: {
  catalog: ProgressionCatalog;
  initialPage?: string | null;
  onOpenMap: (markerId?: string) => void;
  onCatalogChange: (catalog: ProgressionCatalog) => void;
}) {
  const contentText = useGameText();
  const { t, i18n } = useTranslation();
  const initial = initialPage ? entries.find((item) => item.entry.id === initialPage || item.entry.name === initialPage) : undefined;
  const [history, setHistory] = useState<string[]>(() => initial ? [initial.key] : []);
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const selected = byKey.get(history.at(-1) ?? "") ?? entries.find((item) => item.kind === kind)!;

  const groups = useMemo(() => {
    const grouped = new Map<string, (typeof entries)[number][]>();
    for (const item of entries) {
      if (item.kind !== kind) continue;
      const current = grouped.get(item.entry.group);
      if (current) current.push(item);
      else grouped.set(item.entry.group, [item]);
    }
    return [...grouped];
  }, [kind]);
  const groupLabel = (value: string) => t("progressionGuide.groups." + value, { defaultValue: contentText(value) });
  const filtered = useMemo(() => entries.filter((item) =>
    item.kind === kind && (!group || item.entry.group === group)
      && matchesContentSearch(query, [item.entry.name, item.entry.group,
        ...(item.kind === "npcs" ? [item.entry.role] : [])], contentText),
  ), [kind, group, query, contentText]);

  const selectGroup = (value: string) => {
    setGroup(value);
    setHistory([]);
    setLimit(PAGE_SIZE);
  };
  const navigate = (targetKey: string) => {
    const target = byKey.get(targetKey);
    if (!target) return;
    const targetCatalog = target.kind === "set-items" ? "sets" : target.kind;
    if (targetCatalog !== kind) {
      onCatalogChange(targetCatalog);
      setGroup("");
      setQuery("");
      setLimit(PAGE_SIZE);
    }
    setHistory((current) => current.includes(target.key)
      ? current.slice(0, current.indexOf(target.key) + 1) : [...current, target.key].slice(-32));
    setExpandedTables({});
  };
  const openPage = (link: ContentLink) => {
    if (link.markerId) { onOpenMap(link.markerId); return; }
    const quest = questById.get(link.page)
      ?? questByName.get(link.page.toLocaleLowerCase("en"));
    if (quest) { navigate(keyOf("quests", quest.id)); return; }
    const npc = npcByName.get(link.page.toLocaleLowerCase("en"));
    if (npc) { navigate(keyOf("npcs", npc.id)); return; }
    const progression = findProgressionPage(link.page);
    if (progression) {
      const target = entries.find((item) => item.entry.id === progression);
      if (target) { navigate(target.key); return; }
    }
    if (hasBuildingPage(link.page)) {
      window.dispatchEvent(new CustomEvent(BUILDING_NAVIGATION_EVENT, { detail: link.page }));
    } else if (hasWikiPage(link.page)) {
      window.dispatchEvent(new CustomEvent(WIKI_NAVIGATION_EVENT, { detail: link.page }));
    } else if (hasCraftingPage(link.page) || craftingSectionFor(link.page)) {
      window.dispatchEvent(new CustomEvent(CRAFTING_NAVIGATION_EVENT, { detail: link.page }));
    } else if (link.page === "Map") {
      onOpenMap();
    }
  };
  const linked = (link: ContentLink) => Boolean(link.markerId || link.page === "Map"
    || findProgressionPage(link.page) || hasBuildingPage(link.page) || hasWikiPage(link.page)
    || hasCraftingPage(link.page) || craftingSectionFor(link.page));
  const Section = ({ section, index }: { section: ContentSection; index: number }) => {
  const contentText = useGameText();
  return (<section className="space-y-3">
    <h3 className="flex items-center gap-3 text-base font-semibold text-white">
      <span className="h-4 w-[3px] rounded-full bg-accent" aria-hidden="true" />{contentText(section.title)}
    </h3>
    {section.blocks.map((block, blockIndex) => {
      const tableKey = `${selected.key}:${index}:${blockIndex}`;
      if (block.kind === "text") return <p key={blockIndex} className="text-[13px] leading-relaxed text-zinc-300">
        <InlineLinkedText value={block.text ?? ""} links={block.links ?? []} onOpenPage={openPage} isLinked={linked} />
      </p>;
      if (block.kind === "list") return <ul key={blockIndex} className="space-y-2 pl-3">
        {block.items?.map((item, itemIndex) => item.text.toLowerCase().startsWith("reward")
          ? <li key={itemIndex}><RewardCard value={item.text} links={item.links} onOpenPage={openPage} isLinked={linked} /></li>
          : <li key={itemIndex} className="border-l border-border pl-3 text-[13px] leading-relaxed text-zinc-300">
            <InlineLinkedText value={item.text} links={item.links} onOpenPage={openPage} isLinked={linked} />
          </li>)}
      </ul>;
      const allRows = (block.rows ?? []).filter((row) =>
        !block.headers || row.length !== block.headers.length
        || row.some((cell, column) => cell.text !== block.headers?.[column]));
      const visibleRows = expandedTables[tableKey] ? allRows : allRows.slice(0, 40);
      return <div key={blockIndex} className="overflow-hidden rounded-[var(--radius-md)] border border-border">
        <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-xs">
          <thead className="bg-surface text-zinc-400"><tr>{block.headers?.map((heading, headingIndex) =>
            <th key={headingIndex} className="px-3 py-2 font-semibold">{contentText(heading)}</th>)}</tr></thead>
          <tbody className="divide-y divide-border/60">{visibleRows.map((row, rowIndex) => <tr key={rowIndex}>
            {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top text-zinc-300">
              <span className="whitespace-pre-line"><InlineLinkedText value={cell.text} links={cell.links}
                onOpenPage={openPage} isLinked={linked} /></span>
            </td>)}
          </tr>)}</tbody>
        </table></div>
        {allRows.length > 40 && <button type="button" onClick={() => setExpandedTables((current) => ({ ...current, [tableKey]: !current[tableKey] }))}
          className="w-full border-t border-border px-3 py-2 text-left text-xs font-semibold text-accent hover:text-white">
          {t(expandedTables[tableKey] ? "progressionGuide.showLess" : "progressionGuide.showAll", { count: allRows.length })}
        </button>}
      </div>;
    })}
  </section>);
};
  const renderQuestContent = (quest: Quest) => {
    const overview = quest.sections.filter((section) => /^overview$/i.test(section.title));
    const prerequisites = quest.sections.filter((section) => /prerequisites?/i.test(section.title));
    const objectives = quest.sections.filter((section) => /objectives?/i.test(section.title)
      || section.blocks.some((block) => block.kind === "table"
        && block.headers?.some((header) => /objective title/i.test(header))));
    const others = quest.sections.filter((section) => !overview.includes(section)
      && !prerequisites.includes(section) && !objectives.includes(section));
    const rewards = objectives.filter((section) => /objectives?/i.test(section.title))
      .flatMap((section) => section.blocks.flatMap((block) =>
      block.kind === "list" ? (block.items ?? []).filter((item) => /^Reward\s*:/i.test(item.text)) : []));
    return <>
      {overview.map((section, index) => <section key={`${section.title}:${index}`} className="space-y-3">
        <h3 className="flex items-center gap-3 text-base font-semibold text-white">
          <span className="h-4 w-[3px] rounded-full bg-accent" aria-hidden="true" />{contentText(section.title)}
        </h3>
        {section.blocks.filter((block) => block.kind === "text").map((block, blockIndex) =>
          <p key={blockIndex} className="text-sm leading-6 text-zinc-300">
            <InlineLinkedText value={block.text ?? ""} links={block.links ?? []} onOpenPage={openPage} isLinked={linked} />
          </p>)}
        {section.blocks.filter((block) => block.kind === "list").flatMap((block) => block.items ?? [])
          .map((item, itemIndex) => <div key={itemIndex} className="text-sm leading-6 text-zinc-300">
            <InlineLinkedText value={item.text} links={item.links} onOpenPage={openPage} isLinked={linked} />
          </div>)}
      </section>)}
      {rewards.map((reward, index) => <RewardCard key={index} value={reward.text} links={reward.links}
        onOpenPage={openPage} isLinked={linked} />)}
      {prerequisites.map((section, index) => <section key={`${section.title}:${index}`} className="space-y-3">
        <h3 className="flex items-center gap-3 text-base font-semibold text-white">
          <span className="h-4 w-[3px] rounded-full bg-accent" aria-hidden="true" />{contentText(section.title)}
        </h3>
        {section.blocks.filter((block) => block.kind === "text").map((block, blockIndex) =>
          <p key={blockIndex} className="text-[13px] leading-5 text-zinc-400">
            <InlineLinkedText value={block.text ?? ""} links={block.links ?? []} onOpenPage={openPage} isLinked={linked} />
          </p>)}
        <div className="grid gap-2 @min-[620px]:grid-cols-2">{section.blocks.flatMap((block) => block.kind === "list" ? block.items ?? [] : [])
          .map((item, itemIndex) => <div key={itemIndex} className="min-w-0 py-1 text-[13px] leading-5 text-zinc-200">
            <InlineLinkedText value={item.text} links={item.links} onOpenPage={openPage} isLinked={linked} />
          </div>)}</div>
      </section>)}
      {objectives.map((section, index) => <section key={`${section.title}:${index}`} className="space-y-3">
        <h3 className="flex items-center gap-3 text-base font-semibold text-white">
          <span className="h-4 w-[3px] rounded-full bg-accent" aria-hidden="true" />{contentText(section.title)}
        </h3>
        {!/objectives?/i.test(section.title) && section.blocks.flatMap((block) =>
          block.kind === "list" ? (block.items ?? []).filter((item) => /^Reward\s*:/i.test(item.text)) : [])
          .map((reward, rewardIndex) => <RewardCard key={rewardIndex} value={reward.text} links={reward.links}
            onOpenPage={openPage} isLinked={linked} />)}
        {section.blocks.filter((block) => block.kind === "text").map((block, blockIndex) =>
          <div key={blockIndex} className="rounded-[var(--radius-md)] border border-border bg-surface/45 px-4 py-3 text-[13px] leading-5 text-zinc-300">
            <InlineLinkedText value={block.text ?? ""} links={block.links ?? []} onOpenPage={openPage} isLinked={linked} />
          </div>)}
        {section.blocks.flatMap((block) => block.kind === "list" ? block.items ?? [] : [])
          .filter((item) => !/^Reward\s*:/i.test(item.text)).map((item, itemIndex) =>
            <div key={itemIndex} className="rounded-[var(--radius-md)] border border-border bg-surface/45 px-4 py-3 text-[13px] leading-5 text-zinc-300">
              <InlineLinkedText value={item.text} links={item.links} onOpenPage={openPage} isLinked={linked} />
            </div>)}
        <div className="grid gap-3">{section.blocks.flatMap((block) => block.kind === "table" ? block.rows ?? [] : [])
          .map((row, rowIndex) => {
            const [number, title, location, description] = row;
            const locationLink = location?.links.find(linked);
            return <article key={rowIndex} className="rounded-[var(--radius-md)] border border-border bg-surface/45 px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold tabular-nums text-accent">
                  {contentText(number?.text || rowIndex + 1)}</span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-[14px] font-semibold leading-6 text-white"><InlineLinkedText
                    value={title?.text ?? ""} links={title?.links ?? []} onOpenPage={openPage} isLinked={linked} /></h4>
                  {contentText(location?.text && location.text !== "-" && <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
                    <InlineLinkedText value={location.text} links={locationLink ? [locationLink] : []}
                      onOpenPage={openPage} isLinked={linked} />
                  </div>)}
                </div>
              </div>
              {contentText(description?.text && description.text !== "-" && <p className="mt-3 text-[13px] leading-[1.65] text-zinc-300">
                <InlineLinkedText value={description.text} links={description.links} onOpenPage={openPage} isLinked={linked} /></p>)}
            </article>;
          })}</div>
      </section>)}
      {others.map((section, index) => <Section key={`${section.title}:${index}`} section={section} index={index} />)}
    </>;
  };

  const detail = selected.entry;
  const selectedSet = selected.kind === "sets" ? selected.entry : null;
  const selectedSetItem = selected.kind === "set-items" ? selected.entry : null;
  const selectedNpc = selected.kind === "npcs" ? selected.entry : null;
  const setItemFacts = selectedSetItem?.facts.filter((fact) => fact.value.trim()) ?? [];
  const npcFacts = selectedNpc?.facts.filter((fact) => fact.value.trim()) ?? [];
  const selectedQuest = selected.kind === "quests" ? selected.entry : null;
  const selectedContent = selected.kind === "sets" ? null : selected.entry;
  const heroImage = imageFor(selected);
  const npcQuestSection = selectedNpc?.sections.some((section) => /^quests$/i.test(section.title));
  const renderNpcQuests = (npc: Npc) => npc.quests?.length ? <section className="space-y-3">
    <h3 className="flex items-center gap-3 text-base font-semibold text-white">
      <span className="h-4 w-[3px] rounded-full bg-accent" aria-hidden="true" />
      {t("progressionGuide.catalogs.quests")}
      <span className="text-xs font-normal text-zinc-500">· {npc.quests.length}</span>
    </h3>
    <div className="grid gap-2 @min-[660px]:grid-cols-2">{npc.quests.map((id) => {
      const quest = questById.get(id);
      if (!quest) return null;
      return <button key={id} type="button" onClick={() => navigate(keyOf("quests", id))}
        className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface/45 px-3 py-2 text-left text-[13px] text-zinc-200 hover:border-accent/40 hover:text-white">
        <BookOpen size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1">{contentText(quest.name)}</span>
        <ChevronRight size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />
      </button>;
    })}</div>
  </section> : null;
  const renderNpcEquipment = (section: ContentSection) => {
    const cells = section.blocks.flatMap((block) => block.kind === "table" ? block.rows?.flat() ?? [] : []);
    return <section className="space-y-3">
      <h3 className="flex items-center gap-3 text-base font-semibold text-white">
        <span className="h-4 w-[3px] rounded-full bg-accent" aria-hidden="true" />{t("progressionGuide.npcCraftingStations")}
      </h3>
      <div className="grid gap-2 @min-[480px]:grid-cols-2 @min-[700px]:grid-cols-4">
        {cells.map((cell, index) => {
          const link = cell.links.find(linked);
          const body = <><EnshroudedItemImage name={cell.text} size={32} />
            <span className="min-w-0 flex-1">{contentText(cell.text)}</span>
            {link && <ChevronRight size={13} className="shrink-0 text-zinc-500" aria-hidden="true" />}</>;
          const className = "flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/45 px-2.5 py-2 text-left text-xs text-zinc-200";
          return link ? <button key={`${cell.text}:${index}`} type="button" onClick={() => openPage(link)}
            className={`${className} hover:border-accent/40 hover:text-white`}>{body}</button>
            : <div key={`${cell.text}:${index}`} className={className}>{body}</div>;
        })}
      </div>
    </section>;
  };
  const label = t("progressionGuide.catalogs." + kind);
  const backToPrevious = () => {
    const previous = byKey.get(history.at(-2) ?? "");
    if (!previous) return;
    setHistory((trail) => trail.slice(0, -1));
    setExpandedTables({});
    const previousKind = previous.kind === "set-items" ? "sets" : previous.kind;
    if (previousKind !== kind) onCatalogChange(previousKind);
  };

  return <EnshroudedCatalog
    label={label}
    search={{ query, label: t("progressionGuide.search", { category: label }),
      clearLabel: t("progressionGuide.clearSearch"),
      onChange: (value) => { setQuery(value); setHistory([]); setLimit(PAGE_SIZE); } }}
    categories={<>
      <ItemCatalogCategory label={t("progressionGuide.allGroups")} active={!group} onSelect={() => selectGroup("")} />
      {groups.map(([name, records]) => <ItemCatalogCategory key={name} label={groupLabel(name)}
        count={records.length.toLocaleString(i18n.language)} active={group === name} onSelect={() => selectGroup(name)} />)}
    </>}
    columns={[{ label: t("progressionGuide.groupFilter") }]}
    rows={filtered.slice(0, limit).map((item) => {
      const image = imageFor(item);
      const group = groupLabel(item.entry.group);
      return { id: item.key, label: contentText(item.entry.name), subtitle: group, cells: [group],
        icon: image ? <img src={contentUrl(image)} alt="" width={30} height={30} loading="lazy" className="size-[30px] object-contain" />
          : <Package size={17} aria-hidden="true" /> };
    })}
    onOpen={navigate} onBack={() => setHistory([])} backLabel={t("reference.backToList")}
    emptyMessage={t("progressionGuide.noResults")}
    afterRows={filtered.length > limit && <button type="button" onClick={() => setLimit(limit + PAGE_SIZE)}>
      {t("reference.showMore", { count: filtered.length - limit })}
    </button>}
    detail={history.length > 0 && <article key={selected.key} className="@container h-full overflow-y-auto px-5 py-6 sm:px-6">
      {history.length > 1 && <button type="button" onClick={backToPrevious}
        className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white">
        <ArrowLeft size={15} aria-hidden="true" />{t("progressionGuide.back")}
      </button>}
        <header className="flex flex-wrap items-start gap-4 border-b border-border pb-6">
          {heroImage ? <img src={contentUrl(heroImage)} alt="" className="h-20 w-20 shrink-0 object-contain" />
            : <span className="grid h-20 w-20 shrink-0 place-items-center text-zinc-500"><Package size={30} /></span>}
          <div className="min-w-[200px] flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
              {contentText(selected.kind === "set-items" ? t("progressionGuide.setItem") : t(`progressionGuide.catalogs.${selected.kind}`))}
              {" · "}{t(`progressionGuide.groups.${detail.group}`, { defaultValue: contentText(detail.group) })}</p>
            <h2 className="mt-1 text-[25px] font-semibold leading-[1.15] text-white">{contentText(detail.name)}</h2>
            {selectedNpc && <p className="mt-2 text-xs text-zinc-400">{contentText(selectedNpc.role)}</p>}
          </div>
        </header>
        <div className="max-w-[760px] space-y-7 py-6">
          {selectedSet ? <>
            <RewardCard value={`Reward : ${selectedSet.reward}`} links={[]} onOpenPage={openPage} isLinked={linked} />
            {contentText(selectedSet.region && <dl className="border-y border-border/70 py-4">
              <div><dt className="text-[10px] uppercase tracking-wider text-zinc-500">{t("progressionGuide.region")}</dt>
                <dd className="mt-1 text-[13px] text-zinc-100">{contentText(selectedSet.region)}</dd></div>
            </dl>)}
            <section><DatabaseSectionTitle>{t("progressionGuide.setItems")} · {selectedSet.items.length}</DatabaseSectionTitle>
              <div className="grid gap-2 @min-[660px]:grid-cols-2">{selectedSet.items.map((item, index) => <button
                key={`${item.name}:${index}`} type="button" onClick={() => openPage({ page: item.page ?? item.name, label: item.name })}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-2 text-left text-xs text-zinc-200 hover:border-accent/40">
                {item.image ? <img src={contentUrl(item.image)} alt="" className="h-9 w-9 shrink-0 object-contain" />
                  : <span className="grid h-9 w-9 shrink-0 place-items-center text-zinc-500"><Package size={17} /></span>}
                <span className="min-w-0 flex-1 truncate">{contentText(item.name)}</span><ChevronRight size={13} className="text-zinc-500" />
              </button>)}</div>
            </section>
          </> : <>
            {selectedSetItem && <>
              {setItemFacts.length > 0 && <dl className="grid gap-4 border-y border-border/70 py-4 @min-[660px]:grid-cols-2">
                {setItemFacts.map((fact) => <div key={fact.name}><dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{contentText(fact.name)}</dt>
                  <dd className="mt-1 text-[13px] text-zinc-100"><InlineLinkedText value={fact.value} links={fact.links}
                    onOpenPage={openPage} isLinked={linked} /></dd></div>)}
              </dl>}
              {contentText(selectedSetItem.description && <p className="text-[13px] leading-relaxed text-zinc-300">{contentText(selectedSetItem.description)}</p>)}
              <section><h3 className="mb-3 text-base font-semibold text-white">{t("progressionGuide.relatedSets")}</h3>
                <div className="grid gap-2 @min-[660px]:grid-cols-2">{selectedSetItem.relatedSets.map((id) => {
                  const set = byKey.get(keyOf("sets", id));
                  return set && <button key={id} type="button" onClick={() => navigate(set.key)}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left text-xs text-zinc-200 hover:border-accent/40 hover:text-white">
                    {contentText(set.entry.name)}<ChevronRight size={13} /></button>;
                })}</div>
              </section>
            </>}
            {selectedNpc && <>
              {npcFacts.length > 0 && <dl className="grid gap-4 border-y border-border/70 py-4 @min-[660px]:grid-cols-2">
                {npcFacts.map((fact) => <div key={fact.name}><dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {contentText(/^unlock quest$/i.test(fact.name) ? t("progressionGuide.recruitmentQuest") : fact.name)}</dt>
                  <dd className="mt-1 text-[13px] text-zinc-100"><InlineLinkedText value={fact.value} links={fact.links}
                    onOpenPage={openPage} isLinked={linked} /></dd></div>)}
              </dl>}
              {contentText(selectedNpc.description && <p className="text-[13px] leading-relaxed text-zinc-300">{contentText(selectedNpc.description)}</p>)}
              {!npcQuestSection && renderNpcQuests(selectedNpc)}
            </>}
            {selectedQuest ? renderQuestContent(selectedQuest)
              : selectedContent?.sections.map((section, index) => selectedNpc && /^quests$/i.test(section.title)
                ? <div key={`${section.title}:${index}`}>{renderNpcQuests(selectedNpc)}</div>
                : selectedNpc && /^(overview|crafting|npc dialogs?)$/i.test(section.title)
                ? null
                : selectedNpc && /^crafting equipment$/i.test(section.title)
                ? <div key={`${section.title}:${index}`}>{renderNpcEquipment(section)}</div>
                : selectedNpc && section.blocks.some((block) =>
                block.kind === "table" && block.headers?.includes("Ingredients"))
                ? <NpcCraftingSection key={`${section.title}:${index}`} section={section} role={selectedNpc.role}
                  onOpenPage={openPage} />
                : <Section key={`${section.title}:${index}`} section={section} index={index} />)}
          </>}
        </div>
    </article>}
  />;
}
