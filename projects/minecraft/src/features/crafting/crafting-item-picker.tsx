import { Boxes, Check, ChevronLeft, ListFilter, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_GUIDE_ITEM_TYPES, gameGuideItemType, type GameGuideItemType } from "../../game-config";
import MapSelectDropdown from "../map/map-select-dropdown";
import GuideSourceControls, { type GuideSource } from "../knowledge/guide-source-controls";
import { gameKnowledgeRecipeSubjectKind, gameKnowledgeSubjectDisplay } from "../knowledge/game-knowledge-subject-display";
import MapPointIcon from "../map/map-point-icon";

const RENDER_CAP = 300;
const displayItem = (id: string) => gameKnowledgeSubjectDisplay("item", id);
const itemTypeOf = (id: string) => gameGuideItemType(id, gameKnowledgeRecipeSubjectKind(id) === "block");

export default function CraftingItemPicker({ targets, addedIds, locale, source, sources, onSourceChange, onAdd, onClose }: {
  targets: string[];
  addedIds: ReadonlySet<string>;
  locale: string;
  source: GuideSource;
  sources: readonly GuideSource[];
  onSourceChange: (gameId: string, edition: string, version: string) => void;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [itemType, setItemType] = useState<GameGuideItemType>("all");
  const [renderLimit, setRenderLimit] = useState(RENDER_CAP);
  const itemTypeCounts = useMemo(() => {
    const counts = Object.fromEntries(GAME_GUIDE_ITEM_TYPES.map(type => [type, 0])) as Record<GameGuideItemType, number>;
    for (const id of targets) {
      counts.all++;
      counts[itemTypeOf(id)]++;
    }
    return counts;
  }, [targets]);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return targets.filter(id => (itemType === "all" || itemTypeOf(id) === itemType) && (!needle
      || id.toLocaleLowerCase("en-US").includes(needle)
      || displayItem(id).name.toLocaleLowerCase(locale).includes(needle)));
  }, [itemType, locale, query, targets]);
  const shown = matches.slice(0, renderLimit);

  return <>
    <div className="space-y-2 border-b border-border p-2.5">
      <button type="button" onClick={onClose}
        className="mb-0.5 flex cursor-pointer items-center gap-1.5 px-0.5 text-xs font-semibold text-zinc-300 hover:text-white">
        <ChevronLeft size={15} aria-hidden="true" />{t("crafting.backToList")}
      </button>
      <GuideSourceControls source={source} sources={sources} onSourceChange={(gameId, edition, version) => {
        setItemType("all");
        setRenderLimit(RENDER_CAP);
        onSourceChange(gameId, edition, version);
      }} />
      <MapSelectDropdown
        options={GAME_GUIDE_ITEM_TYPES.map(type => ({
          id: type,
          name: t(`inspector.itemTypes.${type}`),
          count: itemTypeCounts[type],
        }))}
        value={itemType}
        onSelect={type => { setItemType(type as GameGuideItemType); setRenderLimit(RENDER_CAP); }}
        placeholder={t("inspector.itemTypeFilter")}
        ariaLabel={t("inspector.itemTypeFilter")}
        searchPlaceholder={t("inspector.itemTypeFilter")}
        noResultsLabel={t("worlds.noResults")}
        icon={ListFilter}
        iconClassName="text-accent"
        searchable={false}
        className="min-w-0"
        triggerClassName="bg-surface px-3 py-2.5 text-[13px] hover:border-accent/40 focus-visible:border-accent/60"
      />
      <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 transition-colors focus-within:border-accent/60">
        <Search size={15} className="shrink-0 text-zinc-500" aria-hidden="true" />
        <input autoFocus value={query} onChange={event => { setQuery(event.target.value); setRenderLimit(RENDER_CAP); }} placeholder={t("crafting.search")}
          aria-label={t("crafting.search")}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-500" />
        {query && <button type="button" onClick={() => { setQuery(""); setRenderLimit(RENDER_CAP); }} aria-label={t("crafting.search")}
          className="grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-full)] text-zinc-500 hover:text-zinc-200">
          <X size={13} aria-hidden="true" />
        </button>}
      </label>
      <p className="px-1 text-[11px] tabular-nums text-zinc-500">{t("inspector.catalogResultCount", {
        shown: shown.length, total: matches.length,
      })}</p>
    </div>
    <div className="inspector-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
      {shown.length ? shown.map(id => {
        const item = displayItem(id);
        const added = addedIds.has(id);
        return <button key={id} type="button" onClick={() => onAdd(id)} disabled={added}
          aria-label={added ? `${item.name} · ${t("crafting.added")}` : `${t("crafting.addItem")} · ${item.name}`}
          className="group flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] py-2 pl-3 pr-2.5 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent">
          <span className="grid h-8 w-8 shrink-0 place-items-center text-accent">
            <MapPointIcon source={item.image} fallback={Boxes} size={28} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-zinc-200 transition-colors group-hover:text-white">{item.name}</span>
            <span className="block truncate text-[11px] text-muted">{t(`inspector.itemTypes.${itemTypeOf(id)}`)}</span>
          </span>
          <span className={added ? "flex items-center gap-1 text-[10px] font-semibold text-success-text" : "grid h-7 w-7 place-items-center text-accent"}>
            {added ? <><Check size={13} aria-hidden="true" />{t("crafting.added")}</> : <Plus size={16} aria-hidden="true" />}
          </span>
        </button>;
      }) : <p className="p-4 text-center text-xs leading-5 text-zinc-400">{t("crafting.noResults")}</p>}
      {matches.length > shown.length && <button type="button" onClick={() => setRenderLimit(limit => Math.min(matches.length, limit + RENDER_CAP))}
        className="mx-1 mt-1 w-[calc(100%-0.5rem)] cursor-pointer rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-accent/40 hover:text-white">
        {t("inspector.showMore")}
      </button>}
    </div>
  </>;
}
