import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapSearchGroup } from "./map-fuzzy-search";
import { bestFuzzyScore, bestMatchScore, createMapSearchQuery, NO_MATCH, prepareSearchText } from "./map-search-match";
import MapSearchResults from "./map-search-results";
import MapItemSearchResults from "./map-item-search-results";
import MapQuestSearchResults from "./map-quest-search-results";
import { buildMapSearchRows, SOURCE_PREVIEW } from "./map-search-rows";
import type { SearchLocation, SearchSourceContext } from "./map-global-search";
import { useGlobalMapSearch } from "./use-global-map-search";
import { useMapSearchInput } from "./use-map-search-input";
import { isPointVisibleForFactions, MAP_FACTIONS, type MapFaction } from "./map-faction-filter";
import MapSelectDropdown from "./map-select-dropdown";
import type { MapPoint, MapRegion } from "./types";

interface MapSearchOverlayProps {
  mapId: string;
  mapName: string;
  query: string;
  /** Places whose name (or region, kind or coordinates) answers the query. */
  locations: MapSearchGroup[];
  localSearchPending?: boolean;
  localSearchError?: boolean;
  regions: MapRegion[];
  factions: readonly MapFaction[];
  onQueryChange: (query: string) => void;
  onSelect: (point: MapPoint) => void;
  onNavigate: (mapId: string, markerId: string, context?: SearchSourceContext) => void;
  onSelectRegion?: (regionId: string) => void;
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
  localSearchPending = false,
  localSearchError = false,
  regions,
  factions,
  onQueryChange,
  onSelect,
  onNavigate,
  onSelectRegion,
}: MapSearchOverlayProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [sourceLimits, setSourceLimits] = useState<Record<string, number>>({});
  const [inputQuery, updateQuery] = useMapSearchInput(query, onQueryChange);
  const search = useGlobalMapSearch(query, mapId, focused);
  const queryQueued = inputQuery.trim() !== query.trim();
  const pending = queryQueued || localSearchPending || search.loading;
  const locations = useMemo(() => {
    const terms = createMapSearchQuery(query);
    // Quest-title aliases belong in Quests; keep actual NPC-name hits in Places.
    const local = localLocations.filter(({ point, score }) => {
      if (!("questOffers" in point) || !point.questOffers?.length) return true;
      const names = [point.name, point.label, point.region].map(prepareSearchText);
      return (score >= 4 ? bestFuzzyScore : bestMatchScore)(names, terms) !== NO_MATCH;
    }).map(location => ({ ...location, mapId, mapName }));
    const localIds = new Set(local.map(location => `${location.mapId}:${location.point.id}`));
    const allFactions = factions.length === MAP_FACTIONS.length;
    return [...local, ...search.locations.filter(location =>
      (allFactions || location.mapId !== mapId)
      && !localIds.has(`${location.mapId}:${location.point.id}`)
      && isPointVisibleForFactions(location.point, factions))];
  }, [factions, localLocations, mapId, mapName, query, search.locations]);
  const expanded = focused && inputQuery.trim().length > 0;

  const rows = useMemo(() => buildMapSearchRows(locations, search.items, search.sourceLocations, sourceLimits, search.quests), [locations, search.items, search.sourceLocations, sourceLimits, search.quests]);
  // A highlight that survived the results changing under it would point at a row
  // that is no longer there, so an unknown id simply falls back to the top row.
  const activeIndex = Math.max(0, rows.findIndex((row) => row.id === activeRowId));
  const activeRow = queryQueued ? null : rows[activeIndex] ?? null;
  const scrollRowId = activeRow?.id;

  useEffect(() => {
    if (!expanded || !scrollRowId) return;
    document
      .getElementById(`map-search-row-${scrollRowId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [scrollRowId, expanded]);

  const moveActive = (step: number) => {
    if (rows.length === 0) return;
    const next = (activeIndex + step + rows.length) % rows.length;
    setActiveRowId(rows[next]!.id);
  };

  const selectResult = (target: SearchLocation, context?: SearchSourceContext) => {
    if (queryQueued) return;
    if (target.mapId === mapId && target.point.category === "custom") onSelect(target.point);
    else onNavigate(target.mapId, target.point.id, context);
    updateQuery("", true);
    setFocused(false);
  };
  const showMore = (id: string) => {
    setSourceLimits(current => ({ ...current, [id]: (current[id] ?? SOURCE_PREVIEW) + 30 }));
    requestAnimationFrame(() => document.getElementById("map-search-input")?.focus());
  };

  return (
    <div
      className={cn(
        "pointer-events-auto relative ml-auto flex min-w-0 max-w-full flex-wrap items-start justify-end gap-2.5 @max-[760px]:w-full @max-[760px]:flex-nowrap",
        expanded ? "z-50" : "z-20",
      )}
    >
      {onSelectRegion && <MapSelectDropdown
        options={regions}
        onSelect={onSelectRegion}
        placeholder={t("map.regions.travel")}
        ariaLabel={t("map.regions.label")}
        searchPlaceholder={t("map.regions.search")}
        noResultsLabel={t("map.regions.noSearchResults")}
        className="w-40 shrink-0 @max-[760px]:w-[min(38%,10rem)]"
        triggerClassName="h-[var(--map-toolbar-height)] bg-surface/90 px-2.5 text-[11px] shadow-lg shadow-black/30 backdrop-blur-xl"
        panelClassName="left-auto right-0 w-[16.8rem] max-w-[calc(100cqw-2.5rem)] @max-[760px]:left-0 @max-[760px]:right-auto"
      />}
      <div
        className="relative w-64 min-w-0 max-w-full shrink-0 @max-[760px]:flex-1"
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        <div className={cn(
          "flex h-[var(--map-toolbar-height)] w-full items-center gap-2 border border-border bg-surface/95 px-2.5 shadow-lg shadow-black/35 backdrop-blur-xl focus-within:border-accent/60",
          expanded ? "rounded-t-[var(--radius-lg)] border-b-transparent" : "rounded-[var(--radius-lg)]",
        )} data-tour="search">
          <Search size={14} className="shrink-0 text-white/70" aria-hidden="true" />
          <input
            ref={inputRef}
            id="map-search-input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls="map-search-results"
            aria-activedescendant={expanded && activeRow ? `map-search-row-${activeRow.id}` : undefined}
            autoComplete="off"
            value={inputQuery}
            onFocus={() => setFocused(true)}
            onClick={() => setFocused(true)}
            onChange={(event) => {
              setFocused(true);
              setActiveRowId(null);
              setSourceLimits(current => Object.keys(current).length ? {} : current);
              updateQuery(event.target.value);
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
              if (event.key === "Enter" && queryQueued) {
                event.preventDefault();
                if (inputQuery !== query) updateQuery(inputQuery, true);
              } else if (event.key === "Enter" && activeRow) {
                event.preventDefault();
                if ("target" in activeRow) selectResult(activeRow.target, activeRow.context);
                else showMore(activeRow.itemId);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (inputQuery) updateQuery("", true);
                else setFocused(false);
              }
            }}
            placeholder={t("map.search.globalPlaceholder")}
            aria-label={t("map.search.globalLabel")}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/60"
          />
          {inputQuery ? (
            <button
              type="button"
              onClick={() => {
                setActiveRowId(null);
                updateQuery("", true);
                inputRef.current?.focus();
              }}
              aria-label={t("map.search.clear")}
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-full)] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : (
            <kbd className="shrink-0 rounded-[6px] border border-border px-1.5 py-0.5 text-[10px] font-semibold text-white/70 @max-[440px]:hidden">
              {t("map.search.shortcut")}
            </kbd>
          )}
        </div>

        {expanded && (
          <div
            id="map-search-results"
            role="listbox"
            aria-busy={pending}
            aria-label={t("map.search.results")}
            className="absolute right-0 top-full w-[24.375rem] max-w-[calc(100cqw-2.5rem)] max-h-[min(32rem,65vh)] overflow-y-auto overflow-x-hidden rounded-b-[var(--radius-lg)] border border-t-0 border-border bg-surface p-1.5 shadow-xl shadow-black/40"
          >
            {pending && <p role="status" className="px-3 py-2 text-[11px] text-subtle">{t("map.search.globalLoading")}</p>}
            {(search.error || localSearchError) && <p role="alert" className="px-3 py-2 text-[11px] text-danger-text">{t("map.search.globalError")}</p>}
            {!queryQueued && <>
              <MapItemSearchResults items={search.items} locations={search.sourceLocations} limits={sourceLimits}
                activeRowId={activeRow?.id ?? null} onHover={setActiveRowId} onSelect={selectResult} onMore={showMore} />
              <MapQuestSearchResults quests={search.quests} activeRowId={activeRow?.id ?? null} onHover={setActiveRowId} onSelect={selectResult} />
              {locations.length > 0 && <MapSearchResults locations={locations} activeRowId={activeRow?.id ?? null}
                onHover={setActiveRowId} onSelect={selectResult} />}
            </>}
            {!rows.length && !search.items.length && !pending && !search.error && !localSearchError && (
              <p className="px-3 py-6 text-center text-[12px] text-white/70">{t("map.search.globalNoResults")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MapSearchOverlay;
