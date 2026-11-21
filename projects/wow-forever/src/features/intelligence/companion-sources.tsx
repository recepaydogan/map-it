import { useTranslation } from "react-i18next";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceLinks } from "../reference/reference-sections";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { CompanionData } from "./intelligence-types";

export default function CompanionSources({ id }: { id: string }) {
  const { t } = useTranslation();
  const state = useIntelligenceData<CompanionData>("companions");
  if (state.status !== "ready") return <p className="text-xs text-subtle" role={state.status === "error" ? "alert" : "status"}>{t(state.status === "error" ? "reference.error" : "reference.loading")}</p>;
  const record = state.data.entries[id];
  if (!record) return null;
  return <section className="space-y-3">
    <DatabaseSectionTitle>{t("intel.sources.souls", { count: record.required })}</DatabaseSectionTitle>
    <ReferenceLinks links={[{ ...record.soul, quantity: record.required }]} />
  </section>;
}
