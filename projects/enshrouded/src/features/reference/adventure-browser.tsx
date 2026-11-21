import { ArrowLeft, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import { adventureFamilies, adventureKind, adventureVariant } from "./adventure-presentation";
import ReferenceDetail from "./reference-detail";
import AdventureDetailWorkspace from "./adventure-detail-workspace";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceIndex } from "./use-reference-data";

const AdventureBrowser = ({ target, onOpenMap, onCurrentChange, ...navigation }: ReferenceNavigationProps & {
  target: ReferenceTarget; onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const state = useReferenceIndex();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [faction, setFaction] = useState("");
  const [region, setRegion] = useState("");
  const [selected, setSelected] = useState(target.id);
  const [detail, setDetail] = useState(Boolean(target.id));
  const [limit, setLimit] = useState(80);
  const entries = useMemo(() => state.status === "ready" ? state.data.entries.filter((entry) =>
    entry.category === target.category && (entry.adventure?.listed || entry.id === target.id)) : [], [state, target.category, target.id]);
  const families = useMemo(() => adventureFamilies(entries.filter((entry) => {
    const data = entry.adventure;
    return (!kind || data?.kind === kind) && (!faction || data?.faction === faction || data?.faction === "All")
      && (!region || data?.region === region)
      && query.trim().toLocaleLowerCase().split(/\s+/).every((word) => `${entry.name} ${data?.region ?? ""}`.toLocaleLowerCase().includes(word));
  })), [entries, kind, faction, region, query]);
  const family = families.find((item) => item.variants.some((entry) => entry.id === selected)) ?? families[0];
  const current = family?.variants.find((entry) => entry.id === selected) ?? family?.variants[0];
  const kinds = [...new Set(entries.map((entry) => entry.adventure?.kind).filter((key): key is string => Boolean(key)))];
  const regions = [...new Set(entries.map((entry) => entry.adventure?.region).filter((key): key is string => Boolean(key)))].sort();
  useEffect(() => { if (current) onCurrentChange?.({ category: current.category, id: current.id, name: current.name }); }, [current, onCurrentChange]);
  if (state.status !== "ready") return <p role={state.status === "error" ? "alert" : "status"} className="p-6 text-sm text-subtle">{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const visible = families.slice(0, limit);
  if (family && !visible.includes(family)) visible.unshift(family);
  return <div className="flex min-h-0 flex-1">
    <aside className={cn("w-80 min-h-0 shrink-0 flex-col border-r border-border max-md:w-full", detail ? "hidden md:flex" : "flex")}>
      <div className="space-y-3 border-b border-border p-4">
        <div data-tour={target.category === "dungeons" ? "reference-dungeons" : undefined}><h1 className="text-lg font-semibold text-zinc-100">{t(`reference.categories.${target.category}`)}</h1><p className="mt-1 text-xs leading-relaxed text-subtle">{t(`reference.adventure.${target.category}Intro`)}</p></div>
        <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2 focus-within:border-accent">
          <Search size={15} aria-hidden="true" className="text-subtle" /><input className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none" value={query} aria-label={t("reference.search")} placeholder={t("reference.search")} onChange={(event) => { setQuery(event.target.value); setLimit(80); }} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label={t("database.clearSearch")} className="cursor-pointer text-subtle"><X size={14} /></button>}
        </div>
        {kinds.length > 1 && <CategoryDropdown ariaLabel={t("reference.adventure.type")} value={kind} onChange={(value) => { setKind(value); setLimit(80); }} options={[{ key: "", label: t("reference.adventure.allTypes") }, ...kinds.map((key) => ({ key, label: t(`reference.adventure.kinds.${key}`) }))]} />}
        {entries.some((entry) => entry.adventure?.faction && entry.adventure.faction !== "All") && <CategoryDropdown ariaLabel={t("reference.labels.faction")} value={faction} onChange={(value) => { setFaction(value); setLimit(80); }} options={[{ key: "", label: t("reference.adventure.allFactions") }, ...["Light", "Dark"].map((key) => ({ key, label: t(`reference.adventure.factions.${key}`) }))]} />}
        {regions.length > 1 && <CategoryDropdown ariaLabel={t("reference.adventure.region")} value={region} onChange={(value) => { setRegion(value); setLimit(80); }} options={[{ key: "", label: t("reference.adventure.allRegions") }, ...regions.map((key) => ({ key, label: key }))]} />}
        <p className="text-xs text-subtle" aria-live="polite">{t("reference.adventure.results", { count: families.length })}</p>
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
        {visible.map((item) => <button key={item.id} type="button" aria-current={item.id === family?.id ? "true" : undefined}
          onClick={() => { setSelected(item.variants[0]!.id); setDetail(true); }}
          className={cn("mb-1 w-full cursor-pointer rounded-[var(--radius-sm)] border px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-accent", item.id === family?.id ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-surface-hover")}>
          <span className="block text-sm font-medium leading-snug text-zinc-100">{item.name}</span>
          <span className="mt-1 block text-xs text-subtle">{adventureKind(item.variants[0]!, t)}{item.variants[0]!.adventure?.level ? ` · ${t("reference.adventure.level", { number: item.variants[0]!.adventure.level })}` : ""}</span>
          {item.variants[0]!.adventure?.faction !== "All" && <span className="mt-1 block text-xs text-subtle">{t(`reference.adventure.factions.${item.variants[0]!.adventure?.faction ?? "All"}`)}</span>}
          {item.variants.length > 1 && <span className="mt-1 block text-[11px] text-accent">{t("reference.adventure.variants", { count: item.variants.length })}</span>}
        </button>)}
        {!families.length && <p className="p-4 text-sm text-subtle">{t("database.noMatches")}</p>}
        {families.length > limit && <button type="button" onClick={() => setLimit(limit + 80)} className="cursor-pointer p-3 text-sm text-accent">{t("reference.showMore", { count: families.length - limit })}</button>}
      </div>
    </aside>
    <section className={cn("min-w-0 flex-1 flex-col", detail ? "flex" : "hidden md:flex")}>
      <button type="button" onClick={() => setDetail(false)} className="flex cursor-pointer items-center gap-2 border-b border-border p-3 text-sm text-zinc-200 md:hidden"><ArrowLeft size={15} />{t("reference.backToList")}</button>
      {family && family.variants.length > 1 && <div className="space-y-1 border-b border-border px-5 py-3"><p className="text-xs text-subtle">{t("reference.adventure.selectVariant")}</p><CategoryDropdown ariaLabel={t("reference.adventure.selectVariant")} value={current?.id ?? ""} onChange={setSelected}
        options={family.variants.map((entry, index) => {
          const label = adventureVariant(entry, t);
          const duplicate = family.variants.some((other) => other.id !== entry.id && adventureVariant(other, t) === label);
          return { key: entry.id, label: duplicate ? t("reference.adventure.numberedVariant", { label, number: index + 1 }) : label };
        })} /></div>}
      <div className="min-h-0 flex-1">{current ? current.category === "dungeons"
        ? <AdventureDetailWorkspace key={current.id} summary={current} onOpenMap={onOpenMap} {...navigation} />
        : <ReferenceDetail key={current.id} summary={current} onOpenMap={onOpenMap} {...navigation} />
        : <p className="p-6 text-sm text-subtle">{t("database.noMatches")}</p>}</div>
    </section>
  </div>;
};

export default AdventureBrowser;
