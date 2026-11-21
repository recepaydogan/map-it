import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLinks } from "../reference/reference-sections";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { TitleData } from "./intelligence-types";
import IntelStats from "./intel-stats";
import { useChecklist } from "./use-checklist";
import { cn } from "../../lib/cn";

export default function TitleDetails({ id, className }: { id: string; className?: string }) {
  const { t } = useTranslation();
  const state = useIntelligenceData<TitleData>("titles");
  const owned = useChecklist("titles");
  if (state.status !== "ready") return <p className="text-xs text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const title = state.data.entries[id];
  if (!title) return null;
  return <div className={cn("space-y-5", className)}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-xs text-zinc-100 hover:border-accent/50"><input type="checkbox" checked={owned.ids.has(id)} onChange={() => owned.toggle(id)} className="size-3.5 accent-accent" />{t("intel.titles.owned")}</label>
    </div>
    {owned.error && <p role="alert" className="text-xs text-danger-text">{t("intel.checklist.error")}</p>}
    {title.passive.length > 0 && <section><DatabaseSectionTitle>{t("intel.titles.passive")}</DatabaseSectionTitle><IntelStats stats={title.passive} /></section>}
    {title.equipped.length > 0 && <section><DatabaseSectionTitle>{t("intel.titles.equipped")}</DatabaseSectionTitle><IntelStats stats={title.equipped} /></section>}
    {title.passive.length === 0 && title.equipped.length === 0 && <p className="text-xs text-subtle">{t("intel.titles.noStatBonusInClient")}</p>}
    {title.sources.length > 0 && <section><DatabaseSectionTitle>{t("intel.titles.sources")}</DatabaseSectionTitle>{title.sources.some((source) => source.category === "creatures") && <p className="mb-2 text-xs text-subtle">{t("intel.titles.firstKillSourceHint")}</p>}<ReferenceLinks links={title.sources} directNavigation /></section>}
    {title.items.length > 0 && <section><DatabaseSectionTitle>{t("intel.titles.unlock")}</DatabaseSectionTitle><ReferenceLinks links={title.items} /></section>}
    {title.dated && <p className="text-xs text-subtle">{t("intel.titles.dated")}</p>}
  </div>;
}
