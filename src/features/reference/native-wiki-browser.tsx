import { BookOpen, ChevronLeft, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import { NATIVE_ITEM_GROUP_ORDER } from "../../game-config";
import NativeWikiDetail from "./native-wiki-detail";
import { nativeFieldLabel } from "./native-wiki-labels";
import { nativeEntryName } from "./native-wiki-presentation";
import { getMapDisplayName } from "../map/map-display-name";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useNativeWikiIndex } from "./use-native-wiki";

const itemGroupRank = (group: string): number => {
  const rank = NATIVE_ITEM_GROUP_ORDER.indexOf(group);
  return rank < 0 ? NATIVE_ITEM_GROUP_ORDER.length : rank;
};

/** AION 2's searchable sidebar, adjacent details and mobile list/detail navigation. */
const NativeWikiBrowser = ({ target, onOpenMap, ...navigation }: ReferenceNavigationProps & { target: ReferenceTarget; onOpenMap: (mapId: string, markerId: string) => void }) => {
  const { t, i18n } = useTranslation();
  const state = useNativeWikiIndex();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [selected, setSelected] = useState(target.id);
  const [limit, setLimit] = useState(100);
  const [includeUnnamed, setIncludeUnnamed] = useState(Boolean(target.id) || target.category === "npcs");
  const [mobileDetail, setMobileDetail] = useState(Boolean(target.id));
  const [collapsed, setCollapsed] = useState(false);
  const activeTarget = state.status === "ready" && state.data.redirects?.[target.id] || target;
  const entries = useMemo(() => {
    if (state.status !== "ready") return [];
    const matching = state.data.entries.filter(entry => entry.category === activeTarget.category);
    return activeTarget.category === "items"
      ? matching.sort((a, b) => itemGroupRank(a.group) - itemGroupRank(b.group))
      : matching;
  }, [state, activeTarget.category]);
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => activeTarget.category === "items"
      ? itemGroupRank(a) - itemGroupRank(b) || a.localeCompare(b)
      : a.localeCompare(b));
  }, [entries, activeTarget.category]);
  const filtered = useMemo(() => {
    const normalized = query.trim().normalize("NFKC").toLowerCase();
    return entries.filter(entry => (!entry.unnamed || includeUnnamed || normalized) && (!group || entry.group === group)
      && (!normalized || `${entry.name} ${entry.nativeId} ${entry.lootPreview ?? ""}`.normalize("NFKC").toLowerCase().includes(normalized)));
  }, [entries, query, includeUnnamed, group]);
  const current = filtered.find(entry => entry.id === (activeTarget.id !== target.id ? activeTarget.id : selected))
    ?? filtered.find(entry => entry.id === activeTarget.id) ?? filtered[0];
  const onCurrentChange = navigation.onCurrentChange;
  useEffect(() => { if (current) onCurrentChange?.({ category: activeTarget.category, id: current.id, name: nativeEntryName(current) }); }, [current, onCurrentChange, activeTarget.category]);
  const visible = filtered.slice(0, Math.max(limit, current ? filtered.indexOf(current) + 1 : 0));
  if (state.status !== "ready") return <p className="p-6 text-sm text-muted" role={state.status === "error" ? "alert" : "status"}>{t(`reference.${state.status === "error" ? "error" : "loading"}`)}</p>;
  return <div className="native-wiki-browser flex min-h-0 flex-1">
    <aside className={cn("relative min-h-0 w-full shrink-0 flex-col overflow-hidden border-r border-border transition-[width] motion-reduce:transition-none", collapsed ? "md:w-11" : "md:w-72", mobileDetail ? "hidden md:flex" : "flex")}>
      <button type="button" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed} aria-label={t(collapsed ? "reference.showSidebar" : "reference.hideSidebar")} className="absolute right-1 top-2 z-10 hidden h-8 w-8 cursor-pointer place-items-center rounded text-subtle hover:bg-white/8 hover:text-white md:grid">{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
      <div className={cn("shrink-0 space-y-2 border-b border-border p-2.5", collapsed && "md:hidden")}>
        <h1 className="px-1 py-2 pr-8 text-base font-semibold text-white">{t(`reference.categories.${activeTarget.category}`)}</h1>
        <CategoryDropdown ariaLabel={t("reference.group")} value={group} onChange={value => { setGroup(value); setLimit(100); }} options={[{ key: "", label: t("reference.allGroups"), count: entries.length }, ...groups.map(([key,count]) => ({ key, count, label: t(`wiki.groups.${key}`, { defaultValue: nativeFieldLabel(key) }) }))]} />
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 focus-within:border-accent"><Search size={14} className="shrink-0 text-muted" aria-hidden="true" /><input value={query} onChange={event => { setQuery(event.target.value); setLimit(100); }} placeholder={t("reference.search")} aria-label={t("reference.search")} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" />{query && <button type="button" aria-label={t("database.clearSearch")} onClick={() => setQuery("")} className="cursor-pointer text-muted hover:text-white"><X size={14} /></button>}</div>
        <p aria-live="polite" className="px-1 text-[11px] text-muted">{t("wiki.entryCount", { count: filtered.length.toLocaleString(i18n.language), total: entries.length.toLocaleString(i18n.language) })}</p>
        {entries.some(entry => entry.unnamed) && <label className="flex cursor-pointer items-center gap-2 px-1 text-[11px] text-subtle"><input type="checkbox" checked={includeUnnamed} onChange={event => { setIncludeUnnamed(event.target.checked); setLimit(100); }} className="accent-accent" />{t("reference.includeUnnamed")}</label>}
      </div>
      <div className={cn("scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5", collapsed && "md:hidden")}>{visible.map(entry => <button type="button" key={entry.id} onClick={() => { setSelected(entry.id); setMobileDetail(true); }} aria-current={entry.id === current?.id ? "true" : undefined} className={cn("group flex w-full cursor-pointer items-center gap-2.5 border-b px-2.5 py-2.5 text-left transition-colors", entry.id === current?.id ? "border-accent/60" : "border-border/60 hover:bg-white/[0.04]")}>
        {entry.icon ? <img src={contentUrl(entry.icon)} alt="" loading="lazy" className="h-8 w-8 shrink-0 object-contain" /> : <BookOpen size={20} className="shrink-0 text-subtle" aria-hidden="true" />}<span className="min-w-0"><span className={cn("block truncate text-[13px] font-medium", entry.id === current?.id ? "text-white" : "text-zinc-200 group-hover:text-white")}>{nativeEntryName(entry)}</span><span className="block truncate text-[11px] text-muted">{entry.lootPreview || (activeTarget.category === "npcs" && entry.locationMapIds?.length ? entry.locationMapIds.map(getMapDisplayName).join(" · ") : t(`wiki.groups.${entry.group}`, { defaultValue: nativeFieldLabel(entry.group) }))}</span></span>
      </button>)}{filtered.length > visible.length && <button type="button" onClick={() => setLimit(visible.length + 100)} className="w-full cursor-pointer px-3 py-3 text-left text-xs text-accent hover:underline">{t("reference.showMore", { count: filtered.length - visible.length })}</button>}{!filtered.length && <p className="px-3 py-6 text-center text-xs text-muted">{t("database.noMatches")}</p>}</div>
    </aside>
    <section className={cn("min-h-0 min-w-0 flex-1 flex-col", mobileDetail ? "flex" : "hidden md:flex")}>
      <button type="button" onClick={() => setMobileDetail(false)} className={cn("shrink-0 cursor-pointer items-center gap-1 border-b border-border px-4 py-2.5 text-[13px] text-zinc-300 md:hidden", mobileDetail ? "flex" : "hidden")}><ChevronLeft size={16} />{t("reference.backToList")}</button>
      <div className="min-h-0 flex-1">{current ? <NativeWikiDetail key={current.id} id={current.id} onOpenMap={onOpenMap} {...navigation} /> : <p className="p-6 text-sm text-muted">{t("database.noMatches")}</p>}</div>
    </section>
  </div>;
};
export default NativeWikiBrowser;
