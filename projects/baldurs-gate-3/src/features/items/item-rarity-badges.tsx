import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { humanize } from "../../lib/humanize";

const RARITY_STYLES: Record<string, string> = {
  Common: "border-white/15 bg-white/[0.04] text-zinc-300",
  Uncommon: "border-emerald-500/35 bg-emerald-600/20 text-emerald-200",
  Rare: "border-sky-500/35 bg-sky-600/20 text-sky-200",
  VeryRare: "border-fuchsia-500/35 bg-fuchsia-600/20 text-fuchsia-200",
  Legendary: "border-amber-500/40 bg-amber-600/20 text-amber-200",
};

interface ItemRarityBadgesProps {
  rarity: string;
  className?: string;
}

/** Show rarity alone; the source's Unique flag is not another rarity tier. */
const ItemRarityBadges = ({ rarity, className }: ItemRarityBadgesProps) => {
  const { t } = useTranslation();

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      <span className={cn(
        "rounded-[var(--radius-full)] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
        RARITY_STYLES[rarity] ?? RARITY_STYLES.Common,
      )}>
        {t(`items.rarities.${rarity}`, { defaultValue: humanize(rarity) })}
      </span>
    </div>
  );
};

export default ItemRarityBadges;
