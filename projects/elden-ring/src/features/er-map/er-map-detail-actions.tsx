import { Check, CheckCircle2, Crosshair, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface ErMapDetailActionsProps {
  favorite: boolean;
  found: boolean;
  onToggleFavorite: () => void;
  onToggleFound: () => void;
  onCenter: () => void;
}

const ErMapDetailActions = ({
  favorite,
  found,
  onToggleFavorite,
  onToggleFound,
  onCenter,
}: ErMapDetailActionsProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-stretch gap-2 px-4 pb-3 pt-0.5">
      <button
        type="button"
        onClick={onToggleFound}
        aria-pressed={found}
        className={cn(
          "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px] font-semibold transition-all active:scale-[0.98]",
          found
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
            : "border-border bg-white/[0.03] text-zinc-300 hover:border-emerald-500/40 hover:bg-emerald-500/[0.06] hover:text-white",
        )}
      >
        {found ? <CheckCircle2 size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
        {found ? t("detail.found") : t("detail.markAsFound")}
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? t("detail.removeFromFavorites") : t("detail.addToFavorites")}
        title={favorite ? t("detail.removeFromFavorites") : t("detail.addToFavorites")}
        className={cn(
          "group/favorite grid w-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] border transition-all active:scale-95",
          favorite
            ? "border-amber-400/50 bg-amber-400/15 text-amber-300 hover:bg-amber-400/20"
            : "border-border bg-white/[0.03] text-zinc-400 hover:border-amber-400/40 hover:text-amber-300",
        )}
      >
        <Star
          size={16}
          fill={favorite ? "currentColor" : "none"}
          className="transition-transform group-hover/favorite:scale-110"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={onCenter}
        aria-label={t("detail.centerOnMap")}
        title={t("detail.centerOnMap")}
        className="grid w-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-border bg-white/[0.03] text-zinc-300 transition-all hover:border-accent/50 hover:bg-accent/[0.08] hover:text-white active:scale-95"
      >
        <Crosshair size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

export default ErMapDetailActions;
