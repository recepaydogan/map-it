import { useTranslation } from "react-i18next";
import CategoryDropdown from "../../components/category-dropdown";
import type { TitleData } from "./intelligence-types";
import IntelStats from "./intel-stats";
import { sumStats } from "./sum-stats";
import { useChecklist } from "./use-checklist";

export interface TitleFilter { faction: string; stat: string; missing: boolean }
export default function TitleFilters({ data, filter, onChange }: { data: TitleData; filter: TitleFilter; onChange: (filter: TitleFilter) => void }) {
  const { t } = useTranslation();
  const owned = useChecklist("titles");
  const factions = [...new Set(Object.values(data.entries).map(e => e.faction))].sort();
  const stats = [...new Map(Object.values(data.entries).flatMap(e => e.passive).map(s => [s.key, s.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const totals = sumStats(Object.entries(data.entries).filter(([id, e]) => owned.ids.has(id) && filter.faction === e.faction).map(([, e]) => e.passive));
  return <div className="space-y-2">
    <CategoryDropdown value={filter.faction} ariaLabel={t("intel.titles.faction")} onChange={v => onChange({ ...filter, faction: v })}
      options={[{ key: "", label: t("intel.titles.allFactions") }, ...factions.map(f => ({ key: f, label: t(`intel.factions.${f}`, { defaultValue: f }) }))]} />
    <CategoryDropdown value={filter.stat} ariaLabel={t("intel.titles.stat")} onChange={v => onChange({ ...filter, stat: v })}
      options={[{ key: "", label: t("intel.titles.allStats") }, ...stats.map(([key, name]) => ({ key, label: name }))]} />
    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-200"><input type="checkbox" checked={filter.missing} onChange={e => onChange({ ...filter, missing: e.target.checked })} className="accent-accent" />{t("intel.titles.missing")}</label>
    {filter.faction && totals.length > 0 && <details className="rounded-[var(--radius-md)] border border-border p-2.5"><summary className="cursor-pointer text-xs text-zinc-200">{t("intel.titles.totals")}</summary><IntelStats stats={totals} /></details>}
  </div>;
}
