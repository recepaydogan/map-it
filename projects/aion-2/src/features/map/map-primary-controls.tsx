import { Map as MapIcon, MapPinned, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import { localizeMapName, type MapDefinition } from "./map-registry";
import MapSelectDropdown from "./map-select-dropdown";

interface MapPrimaryControlsProps {
  filtersOpen: boolean;
  activeFilterCount: number;
  onToggleFilters: () => void;
  /** The map picker only renders when there is more than one map to pick. */
  maps: MapDefinition[];
  selectedMapId: string;
  onSelectMap: (mapId: string) => void;
}

/** The filter trigger and map selector in the top-left control row. */
const MapPrimaryControls = ({
  filtersOpen,
  activeFilterCount,
  onToggleFilters,
  maps,
  selectedMapId,
  onSelectMap,
}: MapPrimaryControlsProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const localizedMaps = maps.map((map) => ({ ...map, name: localizeMapName(map.name, gameText) }));
  const quickJumpMap = localizedMaps.find((map) => map.quickJumpLabelKey);
  const pickerMaps = localizedMaps.filter((map) => !map.quickJumpLabelKey);
  const filterLabel = t(filtersOpen ? "map.sidebar.collapse" : "map.filters.open");

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
      <div className="map-context-bar" data-tour="map-select">
        {maps.length === 1 && (
          <div className="map-context-pill">
            <MapIcon size={15} className="text-accent" aria-hidden="true" />
            <span>{localizedMaps[0]!.name}</span>
          </div>
        )}
        {maps.length > 1 && (
          <MapSelectDropdown
            options={pickerMaps}
            value={selectedMapId}
            onSelect={onSelectMap}
            icon={MapIcon}
            placeholder={t("map.maps.pick")}
            ariaLabel={t("map.maps.label")}
            searchPlaceholder={t("map.maps.search")}
            noResultsLabel={t("map.maps.noSearchResults")}
            className="w-44"
            triggerClassName="h-[var(--map-toolbar-height)] rounded-[var(--radius-full)] bg-surface/90 px-3 text-[11px] shadow-lg shadow-black/30 backdrop-blur-xl"
          />
        )}
        {quickJumpMap && pickerMaps.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectMap(quickJumpMap.id)}
            aria-current={selectedMapId === quickJumpMap.id ? "page" : undefined}
            className={cn(
              "flex h-[var(--map-toolbar-height)] shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-full)] border px-3 text-[11px] font-medium shadow-lg shadow-black/30 backdrop-blur-xl transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              selectedMapId === quickJumpMap.id
                ? "border-accent bg-accent text-on-accent hover:bg-accent"
                : "border-border bg-surface/90 text-zinc-100 hover:bg-surface-hover",
            )}
          >
            <MapPinned size={13} className={selectedMapId === quickJumpMap.id ? undefined : "text-zinc-400"} aria-hidden="true" />
            <span>{t(quickJumpMap.quickJumpLabelKey!)}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default MapPrimaryControls;
