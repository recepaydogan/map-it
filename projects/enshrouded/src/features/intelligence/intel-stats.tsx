import { useTranslation } from "react-i18next";
import type { IntelStat } from "./intelligence-types";

export default function IntelStats({ stats, descriptions = false }: { stats: IntelStat[]; descriptions?: boolean }) {
  const { i18n } = useTranslation();
  return <dl className="divide-y divide-border">{stats.map(stat => <div key={stat.key} className="py-2">
    <div className="flex justify-between gap-4 text-sm"><dt className="text-zinc-200">{stat.name}</dt><dd className="shrink-0 tabular-nums text-white">{stat.value > 0 ? "+" : ""}{stat.value.toLocaleString(i18n.language, { maximumFractionDigits: 2 })}{stat.percent ? "%" : ""}</dd></div>
    {descriptions && stat.description && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-subtle">{stat.description}</p>}
  </div>)}</dl>;
}
