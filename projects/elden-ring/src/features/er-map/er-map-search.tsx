import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import MapActionButton from "../../components/map-action-button";
import { erItemKey, erItems } from "../../data/er-items-data";
import type { CategoryDef } from "../../data/types";
import { cn } from "../../lib/cn";
import {
  bestFuzzyScore,
  bestMatchScore,
  fuzzyScore,
  matchScore,
  NO_MATCH,
  searchQuery,
} from "../../lib/search-match";
import { useIsMobile } from "../../utils/platform";
import SearchModal from "../search/search-modal";
import { erItemSources, useErMapItemIndex } from "./er-map-item-sources";
import ErMapSearchResults from "./er-map-search-results";
import type { RawErMapMarker } from "./types";

interface ErMapSearchProps {
  markers: RawErMapMarker[];
  categoryById: Map<string, CategoryDef>;
  query: string;
  setQuery: (query: string) => void;
  onSelect: (id: string) => void;
  /** Jump to a marker in a possibly different view — an item's sources are
   *  scattered across layers, so item hits can't go through `onSelect`. */
  onNavigate: (view: string, id: string) => void;
}

const MARKER_LIMIT = 6;
const ITEM_LIMIT = 5;

/** Where a region/id-only hit sorts: behind every name hit. */
const WEAK_SCORE = 3;

/** Ties go to the marker people actually search for — the named boss, not the
 *  soldier mobs that wear its name. */
const sourceRank = (marker: RawErMapMarker) => (marker.source === "boss" ? 0 : 1);

/**
 * Map search. One set of results (er-map-search-results), two shells:
 *
 *  • Desktop / Overwolf — a 240px field in the map toolbar with the results
 *    hanging under it as a popover. Unchanged.
 *  • Phone — the field is a plain icon button that opens a CENTRED MODAL. An
 *    inline field can't work at that width: it either squeezes the rest of the
 *    toolbar onto a second row or shrinks to a stub, and its popover has nowhere
 *    to hang. The modal gets the whole screen, a real input, and a results list
 *    with thumb-sized rows.
 */
const ErMapSearch = ({
  markers,
  categoryById,
  query,
  setQuery,
  onSelect,
  onNavigate,
}: ErMapSearchProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const [openItems, setOpenItems] = useState<ReadonlySet<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = query.trim().toLowerCase();
  const searchTerms = useMemo(() => searchQuery(query), [query]);
  // The index is ~2MB: it only goes on the wire once a query exists, and the
  // shared json cache means the detail panel's copy is the same fetch.
  const itemIndex = useErMapItemIndex(normalized.length > 0);

  const markerResults = useMemo(() => {
    if (!normalized) return [];
    // One row per name+region, not per spawn: "Radahn Foot Soldier" places
    // dozens of markers, and as individual rows they'd spend the whole limit
    // before anything ranked behind them got a slot.
    const collect = (
      name: (values: (string | undefined)[]) => number,
      region: (value: string | undefined) => number,
    ) => {
      const grouped = new Map<string, { marker: RawErMapMarker; score: number; count: number }>();
      for (const marker of markers) {
        // Localized copies keep the English original — match both spellings.
        let score = name([marker.name, marker.enName]);
        if (score === NO_MATCH) {
          // Region/id are weaker evidence than any name hit, so they sort below
          // all of them rather than by where the substring happened to land.
          if (
            region(marker.region) === NO_MATCH &&
            !marker.id.toLowerCase().includes(normalized)
          ) {
            continue;
          }
          score = WEAK_SCORE;
        }
        const key = [marker.category, marker.region ?? marker.areaNo, marker.enName ?? marker.name].join("|");
        const entry = grouped.get(key);
        if (!entry) {
          grouped.set(key, { marker, score, count: 1 });
        } else {
          entry.count += 1;
          if (score < entry.score) {
            entry.score = score;
            entry.marker = marker;
          }
        }
      }
      return [...grouped.values()];
    };

    // Typos only rescue a dead end — see lib/search-match.
    let grouped = collect(
      (values) => bestMatchScore(values, searchTerms),
      (value) => matchScore(value, searchTerms),
    );
    if (grouped.length === 0) {
      grouped = collect(
        (values) => bestFuzzyScore(values, searchTerms),
        (value) => fuzzyScore(value, searchTerms),
      );
    }

    return grouped
      .sort(
        (a, b) =>
          a.score - b.score ||
          sourceRank(a.marker) - sourceRank(b.marker) ||
          a.marker.name.localeCompare(b.marker.name),
      )
      .slice(0, MARKER_LIMIT);
  }, [markers, normalized, searchTerms]);

  const itemResults = useMemo(() => {
    if (!normalized) return [];
    const collect = (score: (value: string) => number) => {
      const out: { item: (typeof erItems)[number]; score: number }[] = [];
      for (const item of erItems) {
        const value = score(item.name);
        if (value !== NO_MATCH) out.push({ item, score: value });
      }
      return out;
    };
    let scored = collect((value) => matchScore(value, searchTerms));
    if (scored.length === 0) scored = collect((value) => fuzzyScore(value, searchTerms));
    return scored
      .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
      .map(({ item }) => ({
        item,
        key: erItemKey(item),
        sources: erItemSources(item, itemIndex),
      }))
      // This is a MAP search: an item nothing on the map hands over has no answer
      // to give here, so it's dropped rather than listed with an empty apology.
      // Filtering before the cap keeps the limit spent on items that do.
      .filter((entry) => entry.sources.length > 0)
      .slice(0, ITEM_LIMIT);
  }, [itemIndex, normalized, searchTerms]);

  const openSearch = () => {
    setExpanded(true);
    setFocused(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const closeSearch = () => {
    setQuery("");
    setExpanded(false);
    setFocused(false);
    setOpenItems(new Set());
  };
  const toggleItem = (key: string) => {
    setOpenItems((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const hasResults = markerResults.length > 0 || itemResults.length > 0;

  const results = (
    <ErMapSearchResults
      markerResults={markerResults}
      itemResults={itemResults}
      categoryById={categoryById}
      openItems={openItems}
      toggleItem={toggleItem}
      onSelectMarker={(id) => {
        onSelect(id);
        closeSearch();
      }}
      onNavigate={(view, id) => {
        onNavigate(view, id);
        closeSearch();
      }}
    />
  );

  const field = (
    <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface/85 px-3 py-2 backdrop-blur-xl focus-within:border-accent">
      <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
      {/* placeholderEr, not erMap.searchPlaceholder ("Search the map…"): the
          field answers item questions too now, which is what this key says. */}
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        placeholder={t("search.placeholderEr")}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-muted"
      />
      <button
        onClick={closeSearch}
        aria-label={t("search.close")}
        className="shrink-0 text-muted hover:text-white cursor-pointer"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {/* The trigger stays in the toolbar so the row never reflows when the
            modal opens or closes. */}
        <MapActionButton
          data-tour="search"
          onClick={openSearch}
          active={expanded}
          aria-label={t("search.open")}
        >
          <Search size={16} aria-hidden="true" />
        </MapActionButton>

        {expanded && (
          <SearchModal
            field={field}
            hasResults={hasResults}
            emptyMessage={normalized ? t("search.noResults") : t("search.hint")}
            onClose={closeSearch}
          >
            {results}
          </SearchModal>
        )}
      </>
    );
  }

  if (!expanded && !query) {
    return (
      <MapActionButton data-tour="search" onClick={openSearch} aria-label={t("search.open")}>
        <Search size={16} aria-hidden="true" />
      </MapActionButton>
    );
  }

  return (
    <div data-tour="search" className="relative w-60">
      {field}

      {focused && hasResults && (
        // Anchored right and wider than the 240px field: source rows carry a name,
        // a category, a region and a badge, which the field's own width can't hold.
        <div
          className={cn(
            "absolute right-0 top-full z-[1300] mt-1.5 w-88 max-w-[calc(100vw-1.5rem)] max-h-[70vh]",
            "overflow-y-auto overflow-x-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-xl shadow-black/40 animate-fade-in",
          )}
        >
          {results}
        </div>
      )}
    </div>
  );
};

export default ErMapSearch;
