import { ChevronDown, PackageSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getPointAppearance } from "./map-config";
import { getSearchResultBasementFloors } from "./map-floor-visibility";
import type { MapSearchGroup } from "./map-fuzzy-search";
import { visibleMapItemSources, type MapItemSearchResult } from "./map-item-search";
import { locationRowId, sourceRowId } from "./map-search-rows";
import MapPointIcon from "./map-point-icon";
import type { MapPoint } from "./types";

interface MapSearchResultsProps {
  locations: MapSearchGroup[];
  items: MapItemSearchResult[];
  /** Item ids whose full source list is unfolded. */
  openItems: ReadonlySet<string>;
  activeRowId: string | null;
  onToggleItem: (itemId: string) => void;
  onHover: (rowId: string) => void;
  onSelect: (point: MapPoint) => void;
}

/**
 * The map search's result list: places first, then the items a place hands over
 * with the buildings that spawn them nested underneath.
 *
 * Item rows are headings, not destinations — an item is in dozens of buildings,
 * so the answer is the list below it. Only the location rows and the source rows
 * are selectable, and they are the same rows the overlay's arrow keys walk.
 */
const MapSearchResults = ({
  locations,
  items,
  openItems,
  activeRowId,
  onToggleItem,
  onHover,
  onSelect,
}: MapSearchResultsProps) => {
  const { t, i18n } = useTranslation();

  const heading = (label: string, count: string) => (
    <div className="flex items-center justify-between px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
      <span>{label}</span>
      <span className="tabular-nums font-normal normal-case tracking-normal">{count}</span>
    </div>
  );

  const pointRow = (
    rowId: string,
    point: MapPoint,
    options: { nested?: boolean },
  ) => {
    const appearance = getPointAppearance(point);
    const active = activeRowId === rowId;
    const basementFloors = getSearchResultBasementFloors(point);
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
          "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 text-left transition-colors",
          options.nested ? "py-1.5" : "py-2",
          active ? "bg-accent-soft" : "hover:bg-white/5",
        )}
      >
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/8 text-accent",
            options.nested ? "h-6 w-6" : "h-8 w-8",
          )}
        >
          <MapPointIcon
            fallback={appearance.icon}
            source={appearance.nativeIconPath}
            size={options.nested ? 13 : 15}
          />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <strong
            className={cn(
              "min-w-0 flex-1 truncate font-semibold text-white",
              options.nested ? "text-[11px]" : "text-[12px]",
            )}
          >
            {point.name}
          </strong>
          {basementFloors.map((floor) => (
            <span
              key={floor}
              className="shrink-0 rounded-[var(--radius-sm)] border border-accent/35 bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent"
              title={t("map.view.basement", { number: Math.abs(floor) })}
            >
              {t("map.view.shortBasement", { number: Math.abs(floor) })}
            </span>
          ))}
        </span>
      </button>
    );
  };

  return (
    <>
      {locations.length > 0 && (
        <>
          {heading(
            t("map.search.sectionLocations"),
            t("map.search.matchCount", { count: locations.length }),
          )}
          {locations.map(({ point }) => pointRow(locationRowId(point), point, {}))}
        </>
      )}

      {items.map((item) => {
        const expanded = openItems.has(item.id);
        const shown = visibleMapItemSources(item, expanded);
        const hidden = item.sources.length - shown.length;
        return (
          <div key={item.id}>
            {item === items[0] && heading(
              t("map.search.sectionItems"),
              t("map.search.itemCount", { count: items.length }),
            )}
            <div className="flex w-full items-center gap-2.5 px-2.5 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-accent-soft text-accent">
                <PackageSearch size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[12px] font-semibold text-white">
                  {item.name}
                </strong>
                <span className="mt-0.5 block truncate text-[10px] text-white/70">
                  {t("map.search.itemLocations", {
                    count: item.locationCount,
                    formatted: item.locationCount.toLocaleString(i18n.language),
                  })}
                </span>
              </span>
            </div>

            {/* Rail under the item icon: the rows below are that item's answers,
                not more top-level results. */}
            <div className="ml-4 border-l border-white/10 pl-1">
              {shown.map(({ location }) =>
                pointRow(sourceRowId(item.id, location), location, { nested: true }))}
              {(hidden > 0 || expanded) && (
                <button
                  type="button"
                  // preventDefault keeps focus in the input: its blur handler
                  // would otherwise tear the dropdown down before the newly
                  // unfolded rows could ever be clicked.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onToggleItem(item.id)}
                  className="flex w-full cursor-pointer items-center gap-1 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[10px] text-white/60 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <ChevronDown
                    size={12}
                    className={cn("shrink-0 transition-transform", expanded && "rotate-180")}
                    aria-hidden="true"
                  />
                  {expanded ? t("map.search.showFewer") : t("map.search.moreSources", { count: hidden })}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default MapSearchResults;
