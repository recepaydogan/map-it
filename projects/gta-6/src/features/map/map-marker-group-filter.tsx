import { Check, ChevronDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { MARKER_GROUPS } from "./marker-group-config";
import MapFilterCount from "./map-filter-count";
import type { UserMarkerGroup } from "./types";

interface MapMarkerGroupFilterProps {
  counts: Partial<Record<UserMarkerGroup, number>>;
  foundCounts: Partial<Record<UserMarkerGroup, number>>;
  hiddenGroups: UserMarkerGroup[];
  open: boolean;
  query: string;
  onToggleOpen: () => void;
  onToggle: (group: UserMarkerGroup) => void;
  onSetGroup: (show: boolean) => void;
}

/** Personal marker groups follow the same layout as the other filter sections. */
const MapMarkerGroupFilter = ({
  counts,
  foundCounts,
  hiddenGroups,
  open,
  query,
  onToggleOpen,
  onToggle,
  onSetGroup,
}: MapMarkerGroupFilterProps) => {
  const { t } = useTranslation();
  const label = t("map.custom.personal");
  const populatedGroups = MARKER_GROUPS.filter(({ id }) => (counts[id] ?? 0) > 0);
  const groupMatches = query && label.toLocaleLowerCase().includes(query);
  const visibleGroups = query && !groupMatches
    ? populatedGroups.filter(({ id }) => t(`map.markerGroups.${id}`).toLocaleLowerCase().includes(query))
    : populatedGroups;
  if (visibleGroups.length === 0) return null;

  const activeCount = populatedGroups.filter(({ id }) => !hiddenGroups.includes(id)).length;
  const allOn = activeCount === populatedGroups.length;
  const noneOn = activeCount === 0;
  const markerCount = populatedGroups.reduce((sum, { id }) => sum + (counts[id] ?? 0), 0);
  const foundCount = populatedGroups.reduce((sum, { id }) => sum + (foundCounts[id] ?? 0), 0);

  return (
    <div className="map-filter-section">
      <div className="map-filter-section-header">
        <button
          type="button"
          onClick={() => onSetGroup(!allOn)}
          aria-label={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          title={t(allOn ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
          className={cn(
            "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
            allOn ? "border-accent text-accent"
              : noneOn ? "border-zinc-500 hover:border-zinc-400"
                : "border-accent/60 text-accent",
          )}
        >
          {allOn && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          {!allOn && !noneOn && <Minus size={11} strokeWidth={3} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="map-filter-section-button"
        >
          <span className="map-filter-section-label">{label}</span>
          <MapFilterCount found={foundCount} total={markerCount} group />
          <ChevronDown size={15}
            className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
            aria-hidden="true" />
        </button>
      </div>

      {open && <div className="map-filter-category-grid">
        {visibleGroups.map(({ id, icon: Icon }) => {
          const visible = !hiddenGroups.includes(id);
          const groupLabel = t(`map.markerGroups.${id}`);
          return <div key={id} className={cn("map-filter-category-row", !visible && "is-inactive")}>
            <button type="button" onClick={() => onToggle(id)} aria-pressed={visible}
              className="map-filter-category-button" title={groupLabel}>
              <span className="map-filter-category-icon grid h-5 w-5 shrink-0 place-items-center rounded-full border border-zinc-500 bg-background">
                <Icon size={12} className="text-zinc-200" aria-hidden="true" />
              </span>
              <span className="map-filter-category-label">{groupLabel}</span>
              <MapFilterCount found={foundCounts[id] ?? 0} total={counts[id] ?? 0} />
            </button>
          </div>;
        })}
      </div>}
    </div>
  );
};

export default MapMarkerGroupFilter;
