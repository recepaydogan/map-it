import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLinks } from "../reference/reference-sections";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { TitleData } from "./intelligence-types";
import IntelStats from "./intel-stats";
import { useChecklist } from "./use-checklist";

export default function TitleDetails({ id }: { id: string }) {
  const { t } = useTranslation();
  const state = useIntelligenceData<TitleData>("titles");
  const owned = useChecklist("titles");
  if (state.status !== "ready") return <p className="text-xs text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const title = state.data.entries[id];
  if (!title) return null;
  return <div className="space-y-5">
    <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-border p-3 text-sm text-zinc-100"><input type="checkbox" checked={owned.ids.has(id)} onChange={() => owned.toggle(id)} className="size-4 accent-accent" />{t("intel.titles.owned")}</label>
    <p className="text-xs text-subtle">{t("intel.checklist.local")}</p>
    {owned.error && <p role="alert" className="text-xs text-danger-text">{t("intel.checklist.error")}</p>}
    {title.passive.length > 0 && <section><DatabaseSectionTitle>{t("intel.titles.passive")}</DatabaseSectionTitle><IntelStats stats={title.passive} /></section>}
    {title.equipped.length > 0 && <section><DatabaseSectionTitle>{t("intel.titles.equipped")}</DatabaseSectionTitle><IntelStats stats={title.equipped} /></section>}
    {title.sources.length > 0 && <section><DatabaseSectionTitle>{t("intel.titles.sources")}</DatabaseSectionTitle><ReferenceLinks links={title.sources} /></section>}
    {title.items.length > 0 && <section><DatabaseSectionTitle>{t("intel.titles.unlock")}</DatabaseSectionTitle><ReferenceLinks links={title.items} /></section>}
    {title.dated && <p className="text-xs text-subtle">{t("intel.titles.dated")}</p>}
  </div>;
}
