import { Anvil, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import ItemIcon from "../../../components/item-icon";
import { erCategoryColor } from "../../../data/er-items-data";
import { cn } from "../../../lib/cn";
import type { WeaponRecommendation } from "./types";

interface WeaponSummaryRowProps {
  weapon: WeaponRecommendation;
  expanded: boolean;
  featured: boolean;
  onToggle: () => void;
}

const WeaponSummaryRow = ({ weapon, expanded, featured, onToggle }: WeaponSummaryRowProps) => {
  const { t } = useTranslation();
  const isInfused = weapon.affinity !== "standard";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors",
        featured ? "border-accent/30 bg-accent/[0.055]" : "border-border bg-white/[0.025]",
        expanded ? "border-accent/45 bg-accent/[0.08]" : "hover:border-accent/30 hover:bg-accent/[0.045]",
      )}
    >
      <span className="shrink-0 rounded-[var(--radius-sm)] border border-white/[0.07] bg-black/25 p-1">
        <ItemIcon
          iconId={weapon.item.icon_id}
          category="weapon"
          color={erCategoryColor.weapon}
          glyph="sword"
          size={34}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] font-semibold text-zinc-100">
          {weapon.item.name}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[9.5px] text-zinc-500">
          {isInfused && <Anvil size={9} className="shrink-0 text-accent/75" aria-hidden="true" />}
          <span className={cn("truncate", isInfused && "text-accent/80")}>
            {isInfused
              ? t("detail.buildAdvisor.affinityInfuse", {
                  affinity: t(`detail.buildAdvisor.affinity.${weapon.affinity}`),
                })
              : t("detail.buildAdvisor.affinityNone")}
          </span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 tabular-nums">+{weapon.upgrade}</span>
        </span>
      </span>
      <ChevronDown
        size={14}
        className={cn("shrink-0 text-zinc-500 transition-transform", expanded && "rotate-180 text-accent")}
        aria-hidden="true"
      />
    </button>
  );
};

export default WeaponSummaryRow;
