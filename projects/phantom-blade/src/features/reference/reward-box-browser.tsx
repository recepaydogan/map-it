import { getItemDisplayName } from "../../lib/item-display-name";
import { ChevronLeft, Package, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import { cn } from "../../lib/cn";
import ItemIcon from "../database/item-icon";
import ReferenceBackLink from "./reference-back-link";
import RewardBoxDetail from "./reward-box-detail";
import { groupBoxListings } from "./reward-box-variants";
import type { ReferenceNavigationProps, ReferenceTarget } from "./reference-types";
import { useRewardBoxCatalog } from "./use-reference-data";

const RewardBoxBrowser = ({ target, onOpenMap, backLabel, onBack, onCurrentChange }: ReferenceNavigationProps & {
  target: ReferenceTarget;
  onOpenMap: (mapId: string, markerId: string) => void;
}) => {
  const { t } = useTranslation();
  const state = useRewardBoxCatalog();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [includeTechnical, setIncludeTechnical] = useState(false);
  const [selected, setSelected] = useState(target.id);
  const [mobileDetail, setMobileDetail] = useState(Boolean(target.id));
  const families = useMemo(() => state.status === "ready" ? state.data.families : [], [state]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = families.filter((family) => includeTechnical || !family.technical);
  const filtered = visible.filter((family) => (kind === "all" || family.kind === kind)
    && (!normalizedQuery || family.name.toLocaleLowerCase().includes(normalizedQuery)));
  const listings = groupBoxListings(filtered);
  // A direct link opens its exact variant even when it is hidden from browsing.
  const current = (selected ? families.find((family) => family.variantIds.includes(selected)) : undefined) ?? filtered[0];
  const currentId = current?.variantIds.find((id) => id === selected) ?? current?.variantIds[0];
  useEffect(() => {
    if (current && currentId) onCurrentChange?.({ category: "boxes", id: currentId, name: current.name });
  }, [current, currentId, onCurrentChange]);
  const resetSelection = () => { setSelected(""); setMobileDetail(false); };
  if (state.status !== "ready") return <p className="p-6 text-sm text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  return <div className="flex min-h-0 flex-1">
    <aside className={cn("min-h-0 w-[calc(18rem*var(--app-font-scale))] shrink-0 flex-col border-r border-border max-md:w-full", mobileDetail ? "hidden md:flex" : "flex")}>
      <div className="space-y-3 border-b border-border p-3">
        <div><h2 className="text-[14px] font-semibold text-zinc-100">{t("reference.categories.boxes")}</h2><p className="mt-1 text-[12px] leading-relaxed text-subtle">{t("reference.boxes.intro")}</p></div>
        <CategoryDropdown ariaLabel={t("reference.boxes.filter")} value={kind}
          options={["all", "gameplay", "store", "unknown"].map((key) => ({ key, label: t(`reference.boxes.${key}`), count: groupBoxListings(visible.filter((family) => key === "all" || family.kind === key)).length }))}
          onChange={(value) => { setKind(value); resetSelection(); }} />
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 focus-within:border-accent">
          <Search size={14} className="shrink-0 text-subtle" aria-hidden="true" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); resetSelection(); }} placeholder={t("reference.search")} aria-label={t("reference.search")} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle" />
          {query && <button type="button" aria-label={t("database.clearSearch")} onClick={() => { setQuery(""); resetSelection(); }} className="cursor-pointer text-subtle hover:text-zinc-100"><X size={14} /></button>}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-subtle">
          <p role="status">{t("reference.boxes.count", { count: listings.length })}</p>
          <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={includeTechnical} onChange={(event) => { setIncludeTechnical(event.target.checked); resetSelection(); }} className="accent-accent" />{t("reference.boxes.showTechnical")}</label>
        </div>
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-1.5">
        {listings.map((group) => { const family = group[0]; const active = group.some((entry) => entry.id === current?.id); return <button type="button" key={family.id} onClick={() => { setSelected(family.variantIds[0]); setMobileDetail(true); }} aria-current={active ? "true" : undefined}
          className={cn("flex w-full cursor-pointer items-center gap-2.5 border-b border-border/60 px-2.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent", active ? "bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]" : "hover:bg-surface-hover")}>
          {family.icon ? <ItemIcon icon={family.icon} name={getItemDisplayName(family.name)} size={32} /> : <Package size={24} className="shrink-0 text-accent" aria-hidden="true" />}
          <span className="min-w-0"><span className="line-clamp-2 text-[13px] font-medium leading-5 text-zinc-100">{getItemDisplayName(family.name)}</span><span className="mt-1 block text-[11px] text-subtle">{group.length > 1 ? t("reference.boxes.editions", { count: group.length }) : t(`reference.boxes.${family.technical ? "technical" : family.kind}`)}</span></span>
        </button>; })}
        {filtered.length === 0 && <p className="px-3 py-6 text-center text-xs text-subtle">{t("database.noMatches")}</p>}
      </div>
    </aside>
    <section className={cn("min-w-0 flex-1 flex-col", mobileDetail ? "flex" : "hidden md:flex")}>
      {mobileDetail && <button type="button" onClick={() => setMobileDetail(false)} className="flex cursor-pointer items-center gap-1 border-b border-border px-4 py-2.5 text-[13px] text-zinc-200 md:hidden"><ChevronLeft size={16} />{t("reference.backToList")}</button>}
      <div className="min-h-0 flex-1">{current && currentId ? <RewardBoxDetail key={current.id} summary={current} editions={families.filter((family) => family.name === current.name && family.technical === current.technical)} selectedId={currentId} onSelectVariant={setSelected} onOpenMap={onOpenMap} backLabel={backLabel} onBack={onBack} />
        : <div className="p-6"><ReferenceBackLink label={backLabel} onBack={onBack} /><p className="text-sm text-subtle">{t("database.noMatches")}</p></div>}</div>
    </section>
  </div>;
};

export default RewardBoxBrowser;
