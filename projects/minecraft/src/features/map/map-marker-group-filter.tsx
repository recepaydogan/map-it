import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { MARKER_GROUPS } from "./marker-group-config";
import type { UserMarkerGroup } from "./types";

interface MapMarkerGroupFilterProps {
  counts: Partial<Record<UserMarkerGroup, number>>;
  hiddenGroups: UserMarkerGroup[];
  onToggle: (group: UserMarkerGroup) => void;
}

/**
 * Visibility switches for the player's own marker groups. Rendered as the
 * closing block of the map-layers section, so it shares that section's row
 * language instead of announcing itself as a separate panel.
 */
const MapMarkerGroupFilter = ({ counts, hiddenGroups, onToggle }: MapMarkerGroupFilterProps) => {
  const { t } = useTranslation();
  const populatedGroups = MARKER_GROUPS.filter(({ id }) => (counts[id] ?? 0) > 0);
  if (populatedGroups.length === 0) return null;

  return (
    <div className="mt-2 border-t border-border pt-2">
      <p className="px-2 pb-1 text-[11px] font-medium text-zinc-500">
        {t("map.markerGroups.title")}
      </p>
      <div className="flex flex-col gap-0.5">
        {populatedGroups.map(({ id, icon: Icon }) => {
          const visible = !hiddenGroups.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggle(id)}
              aria-pressed={visible}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-all hover:bg-white/5",
                !visible && "opacity-60 hover:opacity-100",
              )}
            >
              <Icon size={13} className="shrink-0 text-zinc-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-200">
                {t(`map.markerGroups.${id}`)}
              </span>
              <span className="text-[11px] tabular-nums text-zinc-400">{counts[id]}</span>
              {visible
                ? <Eye size={12} className="shrink-0 text-zinc-400" aria-hidden="true" />
                : <EyeOff size={12} className="shrink-0 text-zinc-500" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MapMarkerGroupFilter;
