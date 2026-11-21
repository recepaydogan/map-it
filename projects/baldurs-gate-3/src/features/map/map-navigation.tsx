import { Map as MapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { MAP_ATLASES, MAP_DEFINITIONS, type MapAtlasDefinition } from "./map-registry";
import MapSelectDropdown from "./map-select-dropdown";

interface MapNavigationProps {
  atlas: MapAtlasDefinition;
  mapId: string;
  overview: boolean;
  onAtlas: (id: string) => void;
  onMap: (id: string) => void;
}

const MapNavigation = ({ atlas, mapId, overview, onAtlas, onMap }: MapNavigationProps) => {
  const { t } = useTranslation();
  const rootAtlas = MAP_ATLASES.find((region) => region.id === atlas.parentAtlasId) ?? atlas;
  const activeRegionId = overview ? atlas.id : mapId;
  const regionAtlases = MAP_ATLASES.filter((region) => region.id === rootAtlas.id || region.parentAtlasId === rootAtlas.id);
  const atlasMaps = new Set(regionAtlases.flatMap((region) => region.placements.map((placement) => placement.mapId)));
  const options = MAP_DEFINITIONS.filter((map) => atlasMaps.has(map.id)).map((map) => ({
    id: map.id,
    name: map.name,
    group: MAP_DEFINITIONS.find((candidate) => candidate.id === map.parentMapId)?.name ?? rootAtlas.name,
  })).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const hasSelectedMap = !overview && options.some((option) => option.id === mapId);
  return (
    <nav aria-label={t("map.maps.label")} className={cn("map-navigation w-80 max-w-full rounded-[var(--radius-md)] border border-border bg-surface/95 p-1.5 shadow-lg shadow-black/30", !hasSelectedMap && "map-navigation-unselected")}>
      <div className="flex gap-1">
        {MAP_ATLASES.filter((region) => !region.parentAtlasId).map((region) => (
          <button key={region.id} type="button" onClick={() => onAtlas(region.id)} aria-pressed={region.id === activeRegionId}
            className={cn("min-w-0 flex-auto cursor-pointer whitespace-nowrap rounded-[var(--radius-sm)] px-1.5 py-2 text-[11px] font-semibold focus-visible:outline-accent", region.id === activeRegionId ? "bg-accent-soft text-accent" : "text-subtle hover:bg-surface-hover")}>
            {region.name}
          </button>
        ))}
      </div>
      <div className="map-navigation-picker">
        <div className="min-h-0">
          <MapSelectDropdown options={options} value={overview ? "" : mapId} onSelect={onMap} icon={MapIcon}
            className="pt-1"
            placeholder={t("map.maps.pick")} ariaLabel={t("map.maps.label")}
            searchPlaceholder={t("map.maps.search")} noResultsLabel={t("map.maps.noSearchResults")} />
        </div>
      </div>
    </nav>
  );
};

export default MapNavigation;
