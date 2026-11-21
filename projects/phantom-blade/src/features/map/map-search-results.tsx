import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import type { SearchLocation } from "./map-global-search";
import { locationRowId } from "./map-search-rows";
import { getLocalizedMapPointDisplayName } from "./map-point-display-name";
import MapSearchLocationIcon from "./map-search-location-icon";
import { getCategoryConfig } from "./map-config";
import { formatGameName } from "../../lib/game-display-text";

interface MapSearchResultsProps {
  locations: SearchLocation[];
  activeRowId: string | null;
  onHover: (rowId: string) => void;
  onSelect: (location: SearchLocation) => void;
}

/**
 * The map search's result list. Rows are the same ones the overlay's arrow
 * keys walk; a group row stands for every identical place collapsed into it.
 */
const MapSearchResults = ({
  locations,
  activeRowId,
  onHover,
  onSelect,
}: MapSearchResultsProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();

  return (
    <>
      <div className="flex items-center justify-between px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        <span>{t("map.search.sectionLocations")}</span>
        <span className="tabular-nums font-normal normal-case tracking-normal">
          {t("map.search.matchCount", { count: locations.length })}
        </span>
      </div>
      {locations.map((location) => {
        const { point, count, mapName } = location;
        const rowId = locationRowId(location);
        const active = activeRowId === rowId;
        const subtitle = point.category.startsWith("native-")
          ? [formatGameName(t(`map.maps.names.${location.mapId}`, { defaultValue: gameText(mapName) })), t(getCategoryConfig(point.category).labelKey)].join(" · ")
          : [...new Set([mapName, point.region, point.label].filter(Boolean))].map((part) => gameText(part)).join(" · ");
        return (
          <button
            key={rowId}
            id={`map-search-row-${rowId}`}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(rowId)}
            onClick={() => onSelect(location)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors",
              active ? "bg-accent-soft" : "hover:bg-white/5",
            )}
          >
            <MapSearchLocationIcon point={point} />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[12px] font-semibold text-white">
                {getLocalizedMapPointDisplayName(point, gameText)}
              </strong>
              {subtitle && (
                <span className="mt-0.5 block truncate text-[10px] text-white/70">{subtitle}</span>
              )}
            </span>
            {count > 1 && (
              <span className="shrink-0 rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
};

export default MapSearchResults;
