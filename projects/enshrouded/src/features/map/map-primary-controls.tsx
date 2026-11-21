import { MapPinPlus, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";

interface MapPrimaryControlsProps {
  filtersOpen: boolean;
  activeFilterCount: number;
  onToggleFilters: () => void;
  placementMode: boolean;
  onTogglePlacement: () => void;
}

/** Separate filter and marker placement controls in the top-left row. */
const MapPrimaryControls = ({
  filtersOpen,
  activeFilterCount,
  onToggleFilters,
  placementMode,
  onTogglePlacement,
}: MapPrimaryControlsProps) => {
  const { t } = useTranslation();
  const filterLabel = t(filtersOpen ? "map.sidebar.collapse" : "map.filters.open");
  const addMarkerLabel = t("map.controls.addMarker");

  return (
    <div className="map-primary-controls" data-map-ui>
      <div className="map-filter-trigger-frame">
        <button
          type="button"
          data-tour="filters-trigger"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          aria-label={filterLabel}
          title={filterLabel}
          className="map-filter-trigger"
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          {activeFilterCount > 0 && <span className="map-filter-count">{activeFilterCount}</span>}
        </button>
      </div>
      <div className="map-filter-trigger-frame" data-tour="map-tools">
        <button
          type="button"
          onClick={onTogglePlacement}
          aria-label={addMarkerLabel}
          title={addMarkerLabel}
          aria-pressed={placementMode}
          className={cn("map-filter-trigger", placementMode && "map-control-active")}
        >
          <MapPinPlus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default MapPrimaryControls;
