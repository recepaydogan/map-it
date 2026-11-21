import { TreePine } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { BossBuildRecommendation } from "./types";

const BuildMetrics = ({ recommendation }: { recommendation: BossBuildRecommendation }) => {
  const { t } = useTranslation();
  if (!recommendation.scadutree) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-accent/20 bg-accent/[0.055] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-accent/70">
        <TreePine size={11} aria-hidden="true" />
        {t("detail.buildAdvisor.blessingEffect")}
      </p>
      <p className="mt-1 text-[10px] font-semibold tabular-nums text-zinc-200">
        ×{recommendation.scadutree.attack.toFixed(3)} / ×{recommendation.scadutree.damageTaken.toFixed(3)}
      </p>
    </div>
  );
};

export default BuildMetrics;
