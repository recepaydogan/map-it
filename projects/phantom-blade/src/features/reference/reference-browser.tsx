import { getItemDisplayName } from "../../lib/item-display-name";
import { BookOpen, ChevronLeft, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import CreatureIcon from "./creature-icon";
import ReferenceDetail from "./reference-detail";
import TravelFilters from "./travel-filters";
import { matchesTravelFilters, travelGroupKey, type TravelFilterValue } from "./travel-presentation";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceIndex, useIntelligenceData } from "./use-reference-data";
import type { TitleData } from "../intelligence/intelligence-types";
import TitleFilters, { type TitleFilter } from "../intelligence/title-filters";
import { useChecklist } from "../intelligence/use-checklist";

const ReferenceBrowser = ({ target, onOpenMap, backLabel, onBack, onCurrentChange, compact = false }: ReferenceNavigationProps & { target: ReferenceTarget; onOpenMap: (mapId: string, markerId: string) => void; compact?: boolean }) => {
  const { t, i18n } = useTranslation();
  const gameText = useGameText();
  const state = useReferenceIndex();
  const titleData = useIntelligenceData<TitleData>("titles", target.category === "titles");
  const [titleFilter, setTitleFilter] = useState<TitleFilter>({ faction: "", stat: "", missing: false });
  const ownedTitles = useChecklist("titles");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [bossRegion, setBossRegion] = useState("");
  const [bossTiming, setBossTiming] = useState("");
  const [travelFilters, setTravelFilters] = useState<TravelFilterValue>({ region: "", faction: "" });
  const [selected, setSelected] = useState(target.id);
  const [limit, setLimit] = useState(100);
  const [includeUnnamed, setIncludeUnnamed] = useState(Boolean(target.id));
  const [mobileDetail, setMobileDetail] = useState(Boolean(target.id));
  const entries = useMemo(() => state.status === "ready" ? state.data.entries.filter((entry) => entry.category === target.category && (!target.group || entry.group === target.group)) : [], [state, target.category, target.group]);
  const groups = useMemo(() => { const counts = new Map<string, number>(); for (const entry of entries) if (entry.group) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1); return [...counts].sort(([a], [b]) => a.localeCompare(b)); }, [entries]);
  const filtered = useMemo(() => entries.filter((entry) => (target.category === "travel" || includeUnnamed || !entry.unnamed) && (!group || entry.group === group) && (target.category !== "travel" || matchesTravelFilters(entry, travelFilters)) && (!bossTiming || entry.worldBoss?.some(record => bossTiming === "scheduled" ? Boolean(record.schedule) : !record.schedule)) && (!bossRegion || entry.worldBoss?.some((record) => record.region === bossRegion)) && (!query || `${entry.worldBoss?.map((record) => record.region).join(" ") ?? ""} ${getItemDisplayName(entry.name)} ${gameText(entry.name)} ${entry.subtitle ?? ""} ${entry.subtitleKey ? t(entry.subtitleKey) : ""} ${entry.travel?.destinationName ?? ""} ${entry.travel?.regions.join(" ") ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [entries, gameText, group, query, includeUnnamed, target.category, travelFilters, bossRegion, bossTiming, t]);
  const titleFiltered = target.category === "titles" && titleData.status === "ready" ? filtered.filter(entry => {
    const title = titleData.data.entries[entry.id];
    return title && (!titleFilter.faction || title.faction === titleFilter.faction)
      && (!titleFilter.stat || title.passive.some(s => s.key === titleFilter.stat)) && (!titleFilter.missing || !ownedTitles.ids.has(entry.id));
  }) : filtered;
  const current = titleFiltered.find((entry) => entry.id === selected) ?? titleFiltered[0];
  useEffect(() => {
    if (current) onCurrentChange?.({ category: current.category, id: current.id, name: current.name, ...(target.group ? { group: target.group } : {}) });
  }, [current, onCurrentChange, target.group]);
  const visibleEntries = titleFiltered.slice(0, limit);
  if (current && !visibleEntries.includes(current)) visibleEntries.unshift(current);
  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <div className="flex min-h-0 flex-1" onKeyDown={(event) => {
    if (compact && mobileDetail && event.key === "Escape") {
      event.stopPropagation();
      setMobileDetail(false);
    }
  }}>
    <aside className={cn("min-h-0 shrink-0 flex-col border-border", compact ? "w-full" : "w-[calc(18rem*var(--app-font-scale))] border-r max-md:w-full", mobileDetail ? compact ? "hidden" : "hidden md:flex" : "flex")}>
      <div className="scroll-slim max-h-[65%] shrink-0 space-y-2 overflow-y-auto border-b border-border p-2.5">
        {target.group === "Boss" && <><h1 className="px-1 py-2 font-display text-lg text-white">{t("reference.categories.world-bosses")}</h1><CategoryDropdown ariaLabel={t("reference.boss.region")} value={bossRegion} onChange={(value) => { setBossRegion(value); setLimit(100); }} options={[{ key: "", label: t("reference.boss.allRegions") }, ...[...new Set(entries.flatMap((entry) => entry.worldBoss?.map((record) => record.region) ?? []))].sort().map((region) => ({ key: region, label: region }))]} /></>}
        {!target.group && groups.length > 0 && <CategoryDropdown ariaLabel={t("reference.group")} value={group} onChange={(value) => { setGroup(value); setLimit(100); }} options={[{ key: "", label: t("reference.allGroups"), count: entries.length }, ...groups.map(([key, count]) => ({ key, label: target.category === "travel" ? t(travelGroupKey(key) ?? key) : entries.find((entry) => entry.group === key)?.groupKey ? t(entries.find((entry) => entry.group === key)!.groupKey!) : key, count }))]} />}
        {target.group === "Boss" && <CategoryDropdown ariaLabel={t("reference.boss.spawnFilter")} value={bossTiming} onChange={value => { setBossTiming(value); setLimit(100); }} options={[{ key: "", label: t("reference.boss.allTypes"), count: entries.filter(entry => entry.worldBoss?.length).length }, ...["scheduled", "field"].map(key => ({ key, label: t(key === "scheduled" ? "reference.boss.scheduledType" : "reference.boss.fieldType"), count: entries.filter(entry => entry.worldBoss?.some(record => key === "scheduled" ? Boolean(record.schedule) : !record.schedule)).length }))]} />}
        {target.category === "travel" && <TravelFilters entries={entries} value={travelFilters} onChange={(value) => { setTravelFilters(value); setLimit(100); }} />}
        {target.category === "titles" && titleData.status === "ready" && <TitleFilters data={titleData.data} filter={titleFilter} onChange={v => { setTitleFilter(v); setLimit(100); }} />}
        {target.category === "titles" && titleData.status === "error" && <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p>}
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 focus-within:border-accent"><Search size={14} className="shrink-0 text-muted" aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(100); }} placeholder={t("reference.search")} aria-label={t("reference.search")} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />{query && <button type="button" aria-label={t("database.clearSearch")} onClick={() => setQuery("")} className="cursor-pointer text-muted hover:text-white"><X size={14} /></button>}</div>
        <p className="px-1 text-[11px] text-muted">{t("reference.entryCount", { count: titleFiltered.length.toLocaleString(i18n.language) })}</p>
        {target.category !== "travel" && entries.some((entry) => entry.unnamed) && <label className="flex cursor-pointer items-center gap-2 px-1 text-[11px] text-muted"><input type="checkbox" checked={includeUnnamed} onChange={(event) => setIncludeUnnamed(event.target.checked)} className="accent-accent" />{t("reference.includeUnnamed")}</label>}
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5">{visibleEntries.map((entry) => <button type="button" key={entry.id} onClick={() => { setSelected(entry.id); setMobileDetail(true); }} aria-current={entry.id === current?.id ? "true" : undefined} className={cn("group flex w-full cursor-pointer items-center gap-2.5 border-b border-border/60 px-2.5 py-2.5 text-left transition-colors", entry.id === current?.id ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-white/[0.04]")}>{entry.category === "creatures" ? <CreatureIcon icon={entry.icon} name={getItemDisplayName(gameText(entry.name))} size={32} /> : entry.icon ? <ItemIcon icon={entry.icon} name={getItemDisplayName(gameText(entry.name))} size={32} /> : <BookOpen size={17} className="shrink-0 text-accent/60" aria-hidden="true" />}<span className="min-w-0"><span className={cn("block truncate text-[13px] font-medium transition-colors", entry.id === current?.id ? "text-white" : "text-zinc-200 group-hover:text-white")}>{getItemDisplayName(gameText(entry.name))}</span>{(entry.travel || entry.worldBoss?.length || entry.subtitle || entry.subtitleKey) && <span className="block truncate text-[11px] text-muted">{entry.travel ? t(`reference.travel.types.${entry.travel.kind}`) : entry.worldBoss?.map((record) => gameText(record.region)).join(" · ") ?? (entry.subtitleKey ? t(entry.subtitleKey) : entry.subtitle && gameText(entry.subtitle))}</span>}</span></button>)}{titleFiltered.length > limit && <button type="button" onClick={() => setLimit(limit + 100)} className="w-full cursor-pointer px-3 py-3 text-left text-xs text-accent hover:underline">{t("reference.showMore", { count: titleFiltered.length - limit })}</button>}{titleFiltered.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">{t("database.noMatches")}</p>}</div>
    </aside>
    <section className={cn("min-h-0 min-w-0 flex-1 flex-col", mobileDetail ? "flex" : compact ? "hidden" : "hidden md:flex")}>
      {mobileDetail && <button type="button" onClick={() => setMobileDetail(false)} className={cn("flex shrink-0 cursor-pointer items-center gap-1 border-b border-border px-4 py-2.5 text-[13px] text-zinc-300", !compact && "md:hidden")}><ChevronLeft size={16} />{t("reference.backToList")}</button>}
      <div className="min-h-0 flex-1">{current ? <ReferenceDetail key={current.id} summary={current} onOpenMap={onOpenMap} backLabel={backLabel} onBack={onBack} /> : <p className="p-6 text-sm text-muted">{t("database.noMatches")}</p>}</div>
    </section>
  </div>;
};
export default ReferenceBrowser;
