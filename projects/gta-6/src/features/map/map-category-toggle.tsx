import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { isCategoryArtwork, type MapCategoryConfig } from "./map-config";
import MapPointIcon from "./map-point-icon";
import MapFilterCount from "./map-filter-count";

interface MapCategoryToggleProps {
  category: MapCategoryConfig;
  active: boolean;
  partial: boolean;
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
  partial,
  onlyActive,
  count,
  found,
  onToggle,
  onOnly,
}: MapCategoryToggleProps) => {
  const { t } = useTranslation();
  const label = t(category.filterLabelKey ?? category.labelKey);
  const itemArt = isCategoryArtwork(category);

  return (
    <div className={cn("map-filter-category-row", !active && !partial && "is-inactive")}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={partial ? "mixed" : active}
        className="map-filter-category-button"
        title={label}
      >
        <span className={cn("map-filter-category-icon grid h-5 w-5 shrink-0 place-items-center rounded-full", category.markerClass, itemArt && "map-item-art")}>
          <MapPointIcon fallback={category.icon} source={category.nativeIconPath} size={itemArt ? 16 : 11} strokeWidth={2.5} />
        </span>
        <span className="map-filter-category-label">{label}</span>
        <MapFilterCount found={found} total={count} />
      </button>
      <button
        type="button"
        onClick={(event) => {
          onOnly();
          if (event.detail > 0) event.currentTarget.blur();
        }}
        aria-pressed={onlyActive}
        aria-label={t("map.filters.onlyLayer", { layer: label })}
        title={t("map.filters.onlyLayer", { layer: label })}
        className={cn("map-filter-only", onlyActive && "is-active")}
      >
        {t("map.filters.only")}
      </button>
    </div>
  );
};

export default MapCategoryToggle;
