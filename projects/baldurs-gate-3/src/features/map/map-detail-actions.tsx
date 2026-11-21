import { Check, CheckCircle2, Crosshair, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapDetailActionsProps {
  custom: boolean;
  completed: boolean;
  favorite: boolean;
  onToggleCompleted: () => void;
  onToggleFavorite: () => void;
  onCenter: () => void;
  onRemove: () => void;
}

/** Marker actions use the same order, sizing and states as the Elden Ring panel. */
const MapDetailActions = ({
  custom,
  completed,
  favorite,
  onToggleCompleted,
  onToggleFavorite,
  onCenter,
  onRemove,
}: MapDetailActionsProps) => {
  const { t } = useTranslation();

  if (custom) {
    return (
      <div className="flex items-stretch gap-2 px-4 pb-3 pt-0.5">
        <button
          type="button"
          onClick={onRemove}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border bg-white/[0.03] px-3 py-2 text-[12.5px] font-semibold text-zinc-300 transition-all hover:border-danger/50 hover:bg-danger/10 hover:text-danger-text active:scale-[0.98]"
        >
          <Trash2 size={15} aria-hidden="true" />
          {t("map.details.deleteMarker")}
        </button>
        <button
          type="button"
          onClick={onCenter}
          aria-label={t("map.details.centerOnMap")}
          title={t("map.details.centerOnMap")}
          className="grid w-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-border bg-white/[0.03] text-zinc-300 transition-all hover:border-accent/50 hover:bg-accent/[0.08] hover:text-white active:scale-95"
        >
          <Crosshair size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-2 px-4 pb-3 pt-0.5">
      <button
        type="button"
        onClick={onToggleCompleted}
        aria-pressed={completed}
        className={cn(
          "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-[12.5px] font-semibold transition-all active:scale-[0.98]",
          completed
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
            : "border-border bg-white/[0.03] text-zinc-300 hover:border-emerald-500/40 hover:bg-emerald-500/[0.06] hover:text-white",
        )}
      >
        {completed ? <CheckCircle2 size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
        {t(completed ? "map.details.completed" : "map.details.markAsFound")}
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={t(favorite ? "map.details.removeFavorite" : "map.details.addFavorite")}
        title={t(favorite ? "map.details.removeFavorite" : "map.details.addFavorite")}
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
        aria-label={t("map.details.centerOnMap")}
        title={t("map.details.centerOnMap")}
        className="grid w-11 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-border bg-white/[0.03] text-zinc-300 transition-all hover:border-accent/50 hover:bg-accent/[0.08] hover:text-white active:scale-95"
      >
        <Crosshair size={16} aria-hidden="true" />
      </button>
    </div>
  );
};

export default MapDetailActions;
