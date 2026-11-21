import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getPointAppearance } from "./map-config";
import type { MapSearchGroup } from "./map-fuzzy-search";
import { locationRowId } from "./map-search-rows";
import MapPointIcon from "./map-point-icon";
import { getMapItemVisual, useMapItemVisuals } from "./use-map-item-visuals";
import type { MapPoint } from "./types";

interface MapSearchResultsProps {
  locations: MapSearchGroup[];
  otherMapLocations: MapSearchGroup[];
  activeRowId: string | null;
  onHover: (rowId: string) => void;
  onSelect: (point: MapPoint) => void;
}

/**
 * The map search's result list. Rows are the same ones the overlay's arrow
 * keys walk; a group row stands for every identical place collapsed into it.
 */
const MapSearchResults = ({
  locations,
  otherMapLocations,
  activeRowId,
  onHover,
  onSelect,
}: MapSearchResultsProps) => {
  const { t } = useTranslation();

  const itemVisuals = useMapItemVisuals();
  const renderSection = (items: MapSearchGroup[], titleKey: string) => items.length > 0 && (
    <section>
      <div className="flex items-center justify-between px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        <span>{t(titleKey)}</span>
        <span className="tabular-nums font-normal normal-case tracking-normal">
          {t("map.search.matchCount", { count: items.length })}
        </span>
      </div>
      {items.map(({ point, count }) => {
        const rowId = locationRowId(point);
        const appearance = getPointAppearance(point);
        const sprite = getMapItemVisual(itemVisuals, "contentId" in point ? point.contentId : undefined)?.sprite;
        const active = activeRowId === rowId;
        const gameplay = "gameplay" in point ? point.gameplay : undefined;
        const subtitle = [...new Set([
          "mapName" in point ? point.mapName : "",
          point.region,
          gameplay?.rarity,
          gameplay?.slot,
          gameplay?.weaponType,
          gameplay?.armorType,
          point.label,
        ].filter(Boolean))].join(" · ");
        return (
          <button
            key={rowId}
            id={`map-search-row-${rowId}`}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => onHover(rowId)}
            onClick={() => onSelect(point)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors",
              active ? "bg-accent-soft" : "hover:bg-white/5",
            )}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/8 text-accent">
              <MapPointIcon
                fallback={appearance.icon}
                source={appearance.nativeIconPath}
                sprite={sprite}
                size={15}
              />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[12px] font-semibold text-white">
                {point.name}
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
    </section>
  );

  return (
    <>
      {renderSection(locations, "map.search.sectionCurrentMap")}
      {renderSection(otherMapLocations, "map.search.sectionOtherMaps")}
    </>
  );
};

export default MapSearchResults;
