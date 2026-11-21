import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProgressionAssessment } from "./types";

const ProgressionWarning = ({ progression }: { progression: ProgressionAssessment }) => {
  const { t } = useTranslation();

  return (
    <section
      aria-live="polite"
      className="min-w-0 rounded-[var(--radius-md)] border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2.5"
    >
      <div className="flex items-start gap-2.5">
        <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-200" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-[11px] font-semibold leading-snug text-zinc-100">
            {t("detail.buildAdvisor.readiness.underleveledTitle")}
          </p>
          <p className="mt-1.5 break-words text-[9.5px] font-medium leading-snug tabular-nums text-zinc-200">
            {progression.confidence === "estimated" ? "~" : ""}
            {t("detail.buildAdvisor.readiness.recommended", {
              levelMin: progression.levelMin,
              levelMax: progression.levelMax,
              vigor: progression.targetVigor,
              upgradeMin: progression.upgradeMin,
              upgradeMax: progression.upgradeMax,
            })}
            {progression.targetScadutree != null
              ? ` · ${t("detail.buildAdvisor.readiness.scadutree", { level: progression.targetScadutree })}`
              : ""}
          </p>
        </div>
      </div>
    </section>
  );
};

export default ProgressionWarning;
