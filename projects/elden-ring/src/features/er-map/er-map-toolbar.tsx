import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MapPinPlus, Star } from "lucide-react";
import MapActionButton from "../../components/map-action-button";
import type { CategoryDef, Game, MapLayer } from "../../data/types";
import WorldSwitcherView from "../map/world-switcher-view";
import { TEST_MAP_LAYER_ORDER } from "./raw-coordinate-system";
import ErMapSearch from "./er-map-search";
import type { RawErMapMarker, ErMapViewDefinition } from "./types";

interface ErMapToolbarProps {
  game: Game;
  onGameChange: (game: Game) => void;
  /**
   * Phone only: rendered directly under the world switcher, inside the left
   * cluster. The filter trigger goes here so it sits beneath the switcher no
   * matter how the rest of the row wraps — parked in the row below instead, it
   * drifted down the screen behind whatever wrapped above it.
   */
  belowSwitcher?: ReactNode;
  currentView: ErMapViewDefinition | null;
  markers: RawErMapMarker[];
  categoryById: Map<string, CategoryDef>;
  query: string;
  favoriteCount: number;
  favoritesOnly: boolean;
  placing: boolean;
  onViewChange: (key: string) => void;
  setQuery: (query: string) => void;
  onSelect: (id: string) => void;
  onNavigate: (view: string, id: string) => void;
  onToggleFavorites: () => void;
  onTogglePlacing: () => void;
}

const ErMapToolbar = ({
  game,
  onGameChange,
  belowSwitcher,
  currentView,
  markers,
  categoryById,
  query,
  favoriteCount,
  favoritesOnly,
  placing,
  onViewChange,
  setQuery,
  onSelect,
  onNavigate,
  onToggleFavorites,
  onTogglePlacing,
}: ErMapToolbarProps) => {
  const { t } = useTranslation();
  const layers: { key: MapLayer; label: string }[] = game === "elden-ring"
    ? TEST_MAP_LAYER_ORDER.map((key) => ({ key, label: t(`layer.${key}`) }))
    : [];
  const tiledLayer = TEST_MAP_LAYER_ORDER.find((candidate) => candidate === currentView?.key)
    ?? "overworld";

  return (
    // One row from ~380px up: the game pills go icon-only, the layer dropdown
    // drops its Layers glyph and tightens its padding on a phone, and the gaps
    // close up, which buys the three action buttons their targets on the line.
    //
    // Narrower than that it WRAPS rather than truncating, and deliberately: the
    // remaining overflow is only a few pixels in English, but the layer label is
    // localised into 15 languages and a couple are much longer, so a no-wrap row
    // would clip its own controls off-screen in those. The action cluster keeps
    // `ml-auto`, so a wrapped row lands right-aligned under the first instead of
    // adrift mid-row.
    <div className="flex w-full flex-wrap items-start justify-between gap-1.5 sm:gap-3">
      {/* Left cluster is a COLUMN: the switcher, then whatever the phone layout
          parks under it (the filter trigger). Empty on desktop, so this collapses
          back to a single row there.

          `flex-1 min-w-0` is what keeps the ACTION cluster pinned top-right: as a
          content-width item this column would push the actions onto a wrapped
          line — and since the column is now two rows tall, that line started
          below the filter, stranding the actions halfway down the map. Letting
          the column shrink instead means its own contents wrap while the actions
          stay on the first line. */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-2">
          <WorldSwitcherView
            game={game}
            layer={tiledLayer}
            layers={layers}
            onGameChange={onGameChange}
            onLayerChange={(next) => {
              const testLayer = TEST_MAP_LAYER_ORDER.find((candidate) => candidate === next);
              if (testLayer) onViewChange(testLayer);
            }}
          />
        </div>
        {belowSwitcher}
      </div>
      <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* data-tour anchors: the first-run tour's "bookmarks" / "add-marker" /
            "search" steps ring these controls — same anchors the NR live map's
            equivalents carry, so the tour works on both map surfaces. */}
        <MapActionButton
          data-tour="bookmarks"
          onClick={onToggleFavorites}
          active={favoritesOnly}
          title={t("erMap.favorites")}
          aria-label={t("erMap.favorites")}
        >
          <Star
            size={16}
            fill={favoriteCount > 0 ? "currentColor" : "none"}
            aria-hidden="true"
          />
          {favoriteCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-[var(--radius-full)] bg-amber-400 px-1 text-[10px] font-bold tabular-nums text-black">
              {favoriteCount}
            </span>
          )}
        </MapActionButton>
        <MapActionButton
          data-tour="add-marker"
          onClick={onTogglePlacing}
          active={placing}
          title={t("erMap.addMarker")}
          aria-label={t("erMap.addMarker")}
        >
          <MapPinPlus size={16} aria-hidden="true" />
        </MapActionButton>
        <ErMapSearch
          markers={markers}
          categoryById={categoryById}
          query={query}
          setQuery={setQuery}
          onSelect={onSelect}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
};

export default ErMapToolbar;
