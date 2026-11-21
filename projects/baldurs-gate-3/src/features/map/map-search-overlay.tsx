import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { MapSearchGroup } from "./map-fuzzy-search";
import MapSearchResults from "./map-search-results";
import { buildMapSearchRows } from "./map-search-rows";
import type { MapPoint } from "./types";

interface MapSearchOverlayProps {
  query: string;
  /** Places whose name (or region, kind or coordinates) answers the query. */
  locations: MapSearchGroup[];
  /** Matches from every registered map except the one currently open. */
  otherMapLocations: MapSearchGroup[];
  navigation: ReactNode;
  onQueryChange: (query: string) => void;
  onSelect: (point: MapPoint) => void;
}

/**
 * The top-right search box with its result dropdown, plus the map jump
 * beside it. Keyboard-complete: arrows walk the rows, Enter picks, Escape
 * clears the query first and closes the list second.
 */
const MapSearchOverlay = ({
  query,
  locations,
  otherMapLocations,
  navigation,
  onQueryChange,
  onSelect,
}: MapSearchOverlayProps) => {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);
  const closeSearch = () => {
    setSearchOpen(false);
    setFocused(false);
    onQueryChange("");
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  };
  const [focused, setFocused] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const expanded = searchOpen && focused && query.trim().length > 0;

  const rows = useMemo(
    () => buildMapSearchRows(locations, otherMapLocations),
    [locations, otherMapLocations],
  );
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

  const selectResult = (point: MapPoint) => {
    onSelect(point);
    setFocused(false);
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2.5",
        expanded ? "z-50" : "z-20",
      )}
    >
      <div className="pointer-events-auto col-start-2 row-start-1">
        {navigation}
      </div>
      <div
        data-tour="search"
        className={cn("pointer-events-auto col-start-3 row-start-1 min-w-0 max-w-full justify-self-end @container/search transition-[width] duration-200 motion-reduce:transition-none", searchOpen ? "w-80" : "w-[var(--map-toolbar-height)]")}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        {!searchOpen ? (
          <button
            id="map-search-toggle"
            ref={toggleRef}
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={t("map.search.label")}
            aria-expanded={false}
            title={`${t("map.search.label")} (${t("map.search.shortcut")})`}
            className="grid h-[var(--map-toolbar-height)] w-full cursor-pointer place-items-center rounded-[var(--radius-lg)] border border-border bg-surface/95 text-subtle shadow-lg hover:bg-surface-hover hover:text-white focus-visible:outline-accent"
          >
            <Search size={16} aria-hidden="true" />
          </button>
        ) : <>
        <div className={cn(
          "flex h-[var(--map-toolbar-height)] items-center gap-2 border border-border bg-surface/95 px-2.5 shadow-lg shadow-black/35 backdrop-blur-xl",
          expanded ? "rounded-t-[var(--radius-lg)] border-b-transparent" : "rounded-[var(--radius-lg)]",
        )}>
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
            value={query}
            onFocus={() => setFocused(true)}
            onChange={(event) => {
              setActiveRowId(null);
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
                selectResult(activeRow.point);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (query) onQueryChange("");
                else closeSearch();
              }
            }}
            placeholder={`${t("map.search.placeholder")} · ${t("map.search.coordinateFormat")}`}
            aria-label={t("map.search.label")}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/60"
          />
          {!query && (
            <kbd className="hidden shrink-0 rounded-[6px] border border-border px-1.5 py-0.5 text-[10px] font-semibold text-white/70 @[17rem]/search:block">
              {t("map.search.shortcut")}
            </kbd>
          )}
          <button
            type="button"
            onClick={closeSearch}
            aria-label={t("chrome.close")}
            className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-full)] text-subtle hover:bg-surface-hover hover:text-white focus-visible:outline-accent"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {expanded && (
          <div
            id="map-search-results"
            role="listbox"
            aria-label={t("map.search.results")}
            className="max-h-[min(28rem,60vh)] overflow-y-auto overflow-x-hidden rounded-b-[var(--radius-lg)] border border-t-0 border-border bg-surface/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur-xl"
          >
            {rows.length > 0 ? (
              <MapSearchResults
                locations={locations}
                otherMapLocations={otherMapLocations}
                activeRowId={activeRow?.id ?? null}
                onHover={setActiveRowId}
                onSelect={selectResult}
              />
            ) : (
              <p className="px-3 py-6 text-center text-[12px] text-white/70">{t("map.search.noResults")}</p>
            )}
          </div>
        )}
        </>}
      </div>
    </div>
  );
};

export default MapSearchOverlay;
