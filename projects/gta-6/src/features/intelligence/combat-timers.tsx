import { useTranslation } from "react-i18next";
import { useIntelligenceData } from "../reference/use-reference-data";
import type { CombatData } from "./intelligence-types";
import DatabaseSectionTitle from "../database/database-section-title";
import { ReferenceFacts } from "../reference/reference-sections";

export default function CombatTimers({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const state = useIntelligenceData<CombatData>("combat");
  if (state.status !== "ready") return state.status === "error" ? <p role="alert" className="text-xs text-danger-text">{t("reference.error")}</p> : null;
  const timers = state.data.entries[id];
  if (!timers) return null;
  const facts = ([['berserk', timers.berserkSeconds], ['groggy', timers.groggySeconds]] as const)
    .flatMap(([key, seconds]) => seconds === null ? [] : [{
      label: `intel.combat.${key}`,
      value: t("intel.combat.seconds", { seconds: seconds.toLocaleString(i18n.language) }),
    }]);
  return facts.length ? <section>
    <DatabaseSectionTitle>{t("intel.combat.title")}</DatabaseSectionTitle>
    <ReferenceFacts facts={facts} />
  </section> : null;
}
