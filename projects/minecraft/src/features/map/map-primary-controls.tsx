import { Bookmark, Map as MapIcon, Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapDefinition } from "./map-registry";
import MapSelectDropdown from "./map-select-dropdown";

interface MapPrimaryControlsProps {
  filtersOpen: boolean;
  savedOpen: boolean;
  onToggleFilters: () => void;
  onToggleSaved: () => void;
  /** The map picker only renders when there is more than one map to pick. */
  maps: MapDefinition[];
  selectedMapId: string;
  onSelectMap: (mapId: string) => void;
}

/**
 * The top-left control bar: one button per side panel. Each button reports
 * whether its panel is open; the workspace owns the exclusivity rule (opening
 * one panel closes the others), so a new panel is one more button here plus
 * one more branch there.
 */
const MapPrimaryControls = ({
  filtersOpen,
  savedOpen,
  onToggleFilters,
  onToggleSaved,
  maps,
  selectedMapId,
  onSelectMap,
}: MapPrimaryControlsProps) => {
  const { t } = useTranslation();

  return (
    <div className="map-primary-controls" data-map-ui>
      <div className="map-primary-control-bar">
        <button
          type="button"
          data-tour="filters-trigger"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          className={cn(filtersOpen && "map-primary-control-active")}
        >
          <Menu size={16} aria-hidden="true" />
          <span>{t("map.sidebar.menu")}</span>
        </button>
        <button
          type="button"
          data-tour="saved"
          onClick={onToggleSaved}
          aria-expanded={savedOpen}
          className={cn(savedOpen && "map-primary-control-active")}
        >
          <Bookmark size={16} aria-hidden="true" />
          <span>{t("map.saved.title")}</span>
        </button>
      </div>
      {maps.length > 1 && (
        <MapSelectDropdown
          options={maps}
          value={selectedMapId}
          onSelect={onSelectMap}
          icon={MapIcon}
          placeholder={t("map.maps.pick")}
          ariaLabel={t("map.maps.label")}
          searchPlaceholder={t("map.maps.search")}
          noResultsLabel={t("map.maps.noSearchResults")}
          className="w-44"
          triggerClassName="h-[var(--map-toolbar-height)] bg-surface/90 px-2.5 text-[11px] shadow-lg shadow-black/30 backdrop-blur-xl"
        />
      )}
    </div>
  );
};

export default MapPrimaryControls;
