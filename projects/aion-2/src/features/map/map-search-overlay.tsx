import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import type { MapSearchGroup } from "./map-fuzzy-search";
import MapSearchResults from "./map-search-results";
import MapItemSearchResults from "./map-item-search-results";
import { buildMapSearchRows, SOURCE_PREVIEW } from "./map-search-rows";
import type { SearchLocation, SearchSourceContext } from "./map-global-search";
import { useGlobalMapSearch } from "./use-global-map-search";
import MapSelectDropdown from "./map-select-dropdown";
import type { MapPoint, MapRegion } from "./types";

interface MapSearchOverlayProps {
  mapId: string;
  mapName: string;
  query: string;
  /** Places whose name (or region, kind or coordinates) answers the query. */
  locations: MapSearchGroup[];
  regions: MapRegion[];
  linkedSearchActive: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (point: MapPoint) => void;
  onNavigate: (mapId: string, markerId: string, context?: SearchSourceContext) => void;
  onSelectRegion: (regionId: string) => void;
}

/**
 * The top-right search box with its result dropdown, plus the region jump
 * beside it. Keyboard-complete: arrows walk the rows, Enter picks, Escape
 * clears the query first and closes the list second.
 */
const MapSearchOverlay = ({
  mapId, mapName,
  query,
  locations: localLocations,
  regions,
  linkedSearchActive,
  onQueryChange,
  onSelect,
  onNavigate,
  onSelectRegion,
}: MapSearchOverlayProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const [focused, setFocused] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [sourceLimits, setSourceLimits] = useState<Record<string, number>>({});
  const search = useGlobalMapSearch(query, mapId);
  const locations = useMemo(() => {
    const local = localLocations.map(location => ({ ...location, mapId, mapName }));
    if (!search.sourceLocations.length) return local;
    return [...local.filter(location => location.point.category === "custom"), ...search.locations];
  }, [localLocations, mapId, mapName, search.locations, search.sourceLocations.length]);
  const hasQuery = query.trim().length > 0;
  const expanded = focused && hasQuery;

  const rows = useMemo(() => buildMapSearchRows(locations, search.items, search.sourceLocations, sourceLimits), [locations, search.items, search.sourceLocations, sourceLimits]);
  // A highlight that survived the results changing under it would point at a row
  // that is no longer there, so an unknown id simply falls back to the top row.
  const activeIndex = Math.max(0, rows.findIndex((row) => row.id === activeRowId));
  const activeRow = rows[activeIndex] ?? null;

  useEffect(() => {
    if (!expanded || !activeRow) return;
    document
      .getElementById(`map-search-row-${activeRow.id}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeRow, expanded]);

  const moveActive = (step: number) => {
    if (rows.length === 0) return;
    const next = (activeIndex + step + rows.length) % rows.length;
    setActiveRowId(rows[next]!.id);
  };

  const selectResult = (target: SearchLocation, context?: SearchSourceContext) => {
    if (target.mapId === mapId && target.point.subtype === "region") onSelectRegion(target.point.regionId);
    else if (target.mapId === mapId && target.point.category === "custom") onSelect(target.point);
    else onNavigate(target.mapId, target.point.id, context);
    onQueryChange("");
    setFocused(false);
  };
  const showMore = (id: string) => {
    setSourceLimits(current => ({ ...current, [id]: (current[id] ?? SOURCE_PREVIEW) + 30 }));
    requestAnimationFrame(() => document.getElementById("map-search-input")?.focus());
  };

  return (
    <div
      className={cn(
        "pointer-events-auto relative ml-auto flex min-w-0 flex-1 flex-nowrap items-start justify-end gap-2.5",
        expanded ? "z-50" : "z-20",
      )}
    >
      {regions.length > 0 && <div data-tour="region-select" className="w-40 shrink-0">
        <MapSelectDropdown
          options={regions.map((region) => ({ ...region, name: gameText(region.name) }))}
          onSelect={onSelectRegion}
          placeholder={t("map.regions.travel")}
          ariaLabel={t("map.regions.label")}
          searchPlaceholder={t("map.regions.search")}
          noResultsLabel={t("map.regions.noSearchResults")}
          className="w-full"
          triggerClassName="h-[var(--map-toolbar-height)] bg-surface/90 px-2.5 text-[11px] shadow-lg shadow-black/30 backdrop-blur-xl"
          panelClassName="left-auto right-0 w-[16.8rem] max-w-[calc(100vw-2.5rem)]"
        />
      </div>}
      <div
        data-tour="search"
        className="@container relative min-w-0 w-64 max-w-64 flex-1"
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        <div className={cn(
          "flex h-[var(--map-toolbar-height)] w-full items-center gap-2 border border-border bg-surface/95 px-2.5 shadow-lg shadow-black/35 backdrop-blur-xl",
          hasQuery && "border-accent/75 ring-1 ring-accent/25",
          expanded ? "rounded-t-[var(--radius-lg)] border-b-transparent" : "rounded-[var(--radius-lg)]",
        )}>
          <Search size={14} className={cn("shrink-0", hasQuery ? "text-accent" : "text-white/70")} aria-hidden="true" />
          <input
            id="map-search-input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls="map-search-results"
            aria-activedescendant={expanded && activeRow ? `map-search-row-${activeRow.id}` : undefined}
            autoComplete="off"
            value={query}
            onFocus={() => setFocused(true)}
            onChange={(event) => {
              setActiveRowId(null);
              setSourceLimits({});
              onQueryChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveActive(1);
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveActive(-1);
              }
              if (event.key === "Enter" && activeRow) {
                event.preventDefault();
                if ("target" in activeRow) selectResult(activeRow.target, activeRow.context);
                else showMore(activeRow.itemId);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (query) onQueryChange("");
                else setFocused(false);
              }
            }}
            placeholder={t("map.search.globalPlaceholder")}
            aria-label={t("map.search.globalLabel")}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/60"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setActiveRowId(null);
                onQueryChange("");
              }}
              aria-label={t("map.search.clear")}
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-full)] text-accent transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="shrink-0 rounded-[6px] border border-border px-1.5 py-0.5 text-[10px] font-semibold text-white/70 @max-[12rem]:hidden">
              {t("map.search.shortcut")}
            </kbd>
          )}
        </div>

        {expanded && (
          <div
            id="map-search-results"
            role="listbox"
            aria-label={t("map.search.results")}
            className="absolute right-0 top-full w-[24.375rem] max-w-[calc(100vw-2.5rem)] max-h-[min(32rem,65vh)] overflow-y-auto overflow-x-hidden rounded-b-[var(--radius-lg)] border border-t-0 border-border bg-surface p-1.5 shadow-xl shadow-black/40"
          >
            {search.loading && <p role="status" className="px-3 py-2 text-[11px] text-subtle">{t("map.search.globalLoading")}</p>}
            {search.error && <p role="alert" className="px-3 py-2 text-[11px] text-danger-text">{t("map.search.globalError")}</p>}
            {locations.length > 0 && (
              <MapSearchResults
                locations={locations}
                activeRowId={activeRow?.id ?? null}
                onHover={setActiveRowId}
                onSelect={selectResult}
              />
            )}
            <MapItemSearchResults items={search.items} locations={search.sourceLocations} limits={sourceLimits}
              activeRowId={activeRow?.id ?? null} onHover={setActiveRowId} onSelect={selectResult} onMore={showMore} />
            {!rows.length && !search.items.length && !search.loading && !search.error && (
              <p className="px-3 py-6 text-center text-[12px] text-white/70">{t("map.search.noResults")}</p>
            )}
          </div>
        )}
      </div>
      {linkedSearchActive && hasQuery && !focused && (
        <div className="pointer-events-auto absolute right-0 top-[calc(var(--map-toolbar-height)+0.5rem)] w-64 max-w-full animate-fade-in rounded-[var(--radius-md)] border border-accent/50 bg-surface/95 px-3 py-2.5 shadow-lg shadow-black/35 backdrop-blur-xl">
          <p className="text-[11px] leading-4 text-white/80" aria-live="polite">
            {t("map.search.filteredMarkers")}
          </p>
          <button type="button" onClick={() => onQueryChange("")}
            className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-accent-soft px-2 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
            <X size={12} aria-hidden="true" />
            {t("map.search.clearFilter")}
          </button>
        </div>
      )}
    </div>
  );
};

export default MapSearchOverlay;
