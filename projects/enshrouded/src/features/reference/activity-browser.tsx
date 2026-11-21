import { contentUrl } from "../../lib/content-url";
import { ArrowLeft, ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { ACTIVITY_CHALLENGE_ARTWORK_ID } from "../../game-config";
import { cn } from "../../lib/cn";
import { loadEntityArtwork } from "../../lib/entity-artwork";
import ActivityDetail from "./activity-detail";
import { groupActivities, matchesActivity } from "./activity-families";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useReferenceIndex } from "./use-reference-data";

const ActivityBrowser = ({ target, onOpenMap, onCurrentChange, ...navigation }: ReferenceNavigationProps & {
  target: ReferenceTarget;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const state = useReferenceIndex();
  const [kind, setKind] = useState<"all" | "event" | "challenge">("all");
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState("");
  const [selected, setSelected] = useState(target.id);
  const [showDetail, setShowDetail] = useState(Boolean(target.id));
  const [artworkIcons, setArtworkIcons] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    loadEntityArtwork().then(({ icons }) => {
      if (!cancelled) setArtworkIcons(icons);
    }).catch((error: unknown) => console.error("Failed to load activity artwork", error));
    return () => { cancelled = true; };
  }, []);
  const families = useMemo(() => groupActivities(state.status === "ready" ? state.data.entries.filter((entry) => entry.category === "activities") : [], target.id), [state, target.id]);
  const tiers = [...new Set(families.flatMap((family) => family.variants.flatMap((entry) => entry.activity?.tier ? [entry.activity.tier] : [])))].sort((a, b) => a - b);
  const filtered = families.filter((family) => (kind === "all" || family.kind === kind) && (!tier || family.variants.some((entry) => String(entry.activity?.tier) === tier)) && matchesActivity(family, query));
  const family = filtered.find((family) => family.variants.some((entry) => entry.id === selected)) ?? filtered[0];
  const current = family?.variants.find((entry) => entry.id === selected) ?? family?.variants[0];
  useEffect(() => {
    if (current) onCurrentChange?.({ category: current.category, id: current.id, name: current.name });
  }, [current, onCurrentChange]);
  if (state.status !== "ready") return <p className="p-6 text-sm text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <div className="@container flex min-h-0 flex-1">
    <div className="flex min-h-0 w-full">
      <aside aria-label={t("reference.activity.browse")} className={cn("min-h-0 w-full shrink-0 flex-col border-r border-border @min-[700px]:flex @min-[700px]:w-[calc(280px*var(--app-font-scale))]", showDetail && current ? "hidden" : "flex")}>
        <div className="space-y-4 border-b border-border p-4">
          <div><h1 className="font-display text-lg font-semibold text-white">{t("reference.categories.activities")}</h1><p className="mt-1 text-xs leading-5 text-subtle">{t("reference.activity.intro")}</p></div>
          <div className="flex gap-1 rounded-[var(--radius-sm)] bg-surface p-1" role="group" aria-label={t("reference.activity.type")}>
            {(["all", "event", "challenge"] as const).map((value) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { setKind(value); setTier(""); }} className={cn("min-h-9 flex-1 cursor-pointer rounded-[var(--radius-sm)] px-2 text-xs font-medium", kind === value ? "bg-accent-soft text-accent" : "text-subtle hover:text-white")}>{t(`reference.activity.${value}`)}</button>)}
          </div>
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-3 focus-within:border-accent">
            <Search size={15} className="shrink-0 text-subtle" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("reference.activity.search")} placeholder={t("reference.activity.search")} className="h-10 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-subtle" />
            {query && <button type="button" aria-label={t("database.clearSearch")} onClick={() => setQuery("")} className="cursor-pointer py-2 text-subtle hover:text-white"><X size={15} /></button>}
          </div>
          {kind !== "event" && <label className="flex flex-col gap-2 text-xs text-subtle">{t("reference.activity.layer")}
            <CategoryDropdown ariaLabel={t("reference.activity.layer")} value={tier} onChange={setTier}
              options={[{ key: "", label: t("reference.activity.allLayers") }, ...tiers.map((value) => ({ key: String(value), label: t("reference.activity.layerNumber", { number: value }) }))]} />
          </label>}
          <p role="status" className="text-xs text-subtle">{t("reference.activity.count", { count: filtered.length })}</p>
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.map((item) => { const artworkId = item.kind === "challenge" ? ACTIVITY_CHALLENGE_ARTWORK_ID(item.id) : undefined; const icon = (artworkId && artworkIcons[artworkId]) || item.variants.find((variant) => variant.icon)?.icon; return <button key={item.id} type="button" aria-current={item.id === family?.id ? "true" : undefined} onClick={() => { setSelected(item.variants[0].id); setShowDetail(true); }} className={cn("flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-3 py-3 text-left", item.id === family?.id ? "bg-accent-soft" : "hover:bg-surface")}>
            {icon && <img src={contentUrl(`${icon}`)} alt="" className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] border border-border object-cover" />}
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium leading-5 text-white">{item.name}</span>{item.variants[0].activity?.region && item.variants[0].activity.region !== item.name && <span className="mt-1 block text-xs text-subtle">{item.variants[0].activity.region}</span>}<span className="mt-1 block text-xs text-subtle">{t(`reference.activity.${item.kind === "challenge" ? "levels" : "variants"}`, { count: item.variants.length })}</span></span><ChevronRight size={14} className="shrink-0 text-subtle" aria-hidden="true" />
          </button>; })}
          {!filtered.length && <p className="px-3 py-8 text-sm text-subtle">{t("database.noMatches")}</p>}
        </div>
      </aside>
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col @min-[700px]:flex", showDetail && current ? "flex" : "hidden")}>
        {current && family ? <><button type="button" onClick={() => setShowDetail(false)} className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-border px-4 text-sm text-subtle @min-[700px]:hidden"><ArrowLeft size={16} aria-hidden="true" />{t("reference.backToList")}</button><ActivityDetail key={family.id} family={family} current={current} onSelect={setSelected} onOpenMap={onOpenMap} {...navigation} /></>
          : <p className="p-8 text-sm text-subtle">{t("database.noMatches")}</p>}
      </section>
    </div>
  </div>;
};

export default ActivityBrowser;
