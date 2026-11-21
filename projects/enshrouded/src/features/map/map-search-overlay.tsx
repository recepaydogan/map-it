import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapSearchGroup } from "./map-fuzzy-search";
import MapSearchResults from "./map-search-results";
import MapItemSearchResults from "./map-item-search-results";
import { buildMapSearchRows, SOURCE_PREVIEW } from "./map-search-rows";
import type { SearchLocation, SearchSourceContext } from "./map-global-search";
import { useGlobalMapSearch } from "./use-global-map-search";
import MapSelectDropdown from "./map-select-dropdown";
import type { MapPoint, MapRegion } from "./types";
import { formatMapShortcut, matchesMapShortcut, useMapShortcuts } from "./map-shortcuts";

interface MapSearchOverlayProps {
  mapId: string;
  mapName: string;
  query: string;
  /** Places whose name (or region, kind or coordinates) answers the query. */
  locations: MapSearchGroup[];
  regions: MapRegion[];
  onQueryChange: (query: string) => void;
  onSelect: (point: MapPoint) => void;
  onNavigate: (mapId: string, markerId: string, context?: SearchSourceContext) => void;
  onSelectRegion: (regionId: string) => void;
}

/**
 * The top-right search box with its result dropdown, plus the region jump
 * beside it. Keyboard-complete: arrows walk the rows, Enter picks, the close shortcut
 * clears the query first and closes the list second.
 */
const MapSearchOverlay = ({
  mapId, mapName,
  query,
  locations: localLocations,
  regions,
  onQueryChange,
  onSelect,
  onNavigate,
  onSelectRegion,
}: MapSearchOverlayProps) => {
  const { t } = useTranslation();
  const mapShortcuts = useMapShortcuts();
  const [focused, setFocused] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [sourceLimits, setSourceLimits] = useState<Record<string, number>>({});
  const search = useGlobalMapSearch(query, mapId);
  const locations = useMemo(() => {
    const local = localLocations.map(location => ({ ...location, mapId, mapName }));
    const localIds = new Set(local.map(location => `${location.mapId}:${location.point.id}`));
    return [...local, ...search.locations.filter(location =>
      !localIds.has(`${location.mapId}:${location.point.id}`))];
  }, [localLocations, mapId, mapName, search.locations]);
  const expanded = focused && query.trim().length > 0;

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
    if (target.mapId === mapId && target.point.category === "custom") onSelect(target.point);
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
        "pointer-events-auto relative ml-auto flex w-[35rem] max-w-full flex-wrap items-start justify-end gap-2.5",
        expanded ? "z-50" : "z-20",
      )}
    >
      <MapSelectDropdown
        options={regions}
        onSelect={onSelectRegion}
        placeholder={t("map.regions.travel")}
        ariaLabel={t("map.regions.label")}
        searchPlaceholder={t("map.regions.search")}
        noResultsLabel={t("map.regions.noSearchResults")}
        className="w-40 shrink-0"
        triggerClassName="h-[var(--map-toolbar-height)] bg-surface/90 px-2.5 text-[11px] shadow-lg shadow-black/30 backdrop-blur-xl"
        panelClassName="left-auto right-0 w-[16.8rem] max-w-[calc(100vw-2.5rem)]"
      />
      <div
        className="relative min-w-0 w-64 shrink-0"
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        <div className={cn(
          "flex h-[var(--map-toolbar-height)] w-full items-center gap-2 border border-border bg-surface/95 px-2.5 shadow-lg shadow-black/35 backdrop-blur-xl",
          expanded ? "rounded-t-[var(--radius-lg)] border-b-transparent" : "rounded-[var(--radius-lg)]",
        )} data-tour="search">
          <Search size={14} className="shrink-0 text-white/70" aria-hidden="true" />
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
              if (matchesMapShortcut(event.nativeEvent, mapShortcuts.close, "close")) {
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
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-full)] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="shrink-0 rounded-[6px] border border-border px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
              {formatMapShortcut(mapShortcuts.search)}
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
    </div>
  );
};

export default MapSearchOverlay;
