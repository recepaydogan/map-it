import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapCategoryConfig } from "./map-config";
import MapPointIcon from "./map-point-icon";
import MapCompletionCount from "./map-completion-count";

interface MapCategoryToggleProps {
  category: MapCategoryConfig;
  active: boolean;
  onlyActive: boolean;
  count: number;
  found: number;
  onToggle: () => void;
  onOnly: () => void;
}

/**
 * A single map-layer row. The whole row toggles the layer; a hover-revealed
 * "Only" isolates it in one click (the fast path when the user wants just one
 * thing instead of unchecking everything else).
 */
const MapCategoryToggle = ({
  category,
  active,
  onlyActive,
  count,
  found,
  onToggle,
  onOnly,
}: MapCategoryToggleProps) => {
  const { t } = useTranslation();
  const label = t(category.labelKey);

  return (
    <div
      className={cn(
        "group/cat flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all",
        active ? "hover:bg-white/5" : "opacity-70 hover:bg-white/5 hover:opacity-100",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
      >
        <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", category.markerClass)}>
          <MapPointIcon fallback={category.icon} source={category.nativeIconPath} size={11} strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{label}</span>
      </button>
      <button
        type="button"
        onClick={onOnly}
        aria-pressed={onlyActive}
        tabIndex={-1}
        title={t("map.filters.onlyLayer", { layer: label })}
        className={cn(
          "hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent hover:bg-accent-soft group-hover/cat:block",
          onlyActive && "bg-accent-soft",
        )}
      >
        {t("map.filters.only")}
      </button>
      {count > 0 && (
        <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-zinc-400"><MapCompletionCount found={found} total={count} /></span>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
          active ? "border-accent bg-accent text-on-accent" : "border-zinc-500 hover:border-zinc-400",
        )}
      >
        {active && <Check size={11} strokeWidth={3} aria-hidden="true" />}
      </button>
    </div>
  );
};

export default MapCategoryToggle;
