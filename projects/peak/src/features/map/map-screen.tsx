import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Flame,
  FolderSearch,
  Focus,
  History,
  LocateFixed,
  MapPin,
  Mountain,
  Minus as MinusIcon,
  Minus,
  Navigation,
  Navigation2,
  Route,
  Skull,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  Fragment,
  memo,
  type ComponentPropsWithoutRef,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { twMerge } from "tailwind-merge";
import { usePeakSession } from "../../state/peak-session-store";
import { setPreference, usePreferences } from "../../state/preferences-store";
import {
  MAP_TILE_GRID,
  MARKER_CATEGORY_IDS,
  getLiveBiomeTranslationKey,
  getMapSlug,
  getMapTileSource,
  getRouteBiomeTranslationKeys,
  type MapMarker,
  type MarkerCategoryDefinition,
  type MarkerCategory,
  usePeakMapData,
  getMarkerRadius,
} from "./map-data";
import { reachedMarkersOf } from "./expedition-insights";
import { findIslandRecord, trailBreakSeconds, useExpeditions, type ExpeditionRecord } from "./expedition-store";
import {
  isDeathWarp,
  localPlayerOf,
  projectToMap,
  useLiveState,
  type LiveTeammate,
} from "./live-state";
import MapDetailPanel from "./map-detail-panel";
import { MapCanvasMarkers } from "./map-canvas-markers";
import MapViewSelector from "./map-view-selector";
import { MarkerCategoryIcon } from "./marker-category-icon";
import { writeOverlayFollowSession } from "./overlay-follow-session";
import { getDesktopFollowOnFirstFix, writeDesktopFollowTarget, type FollowTarget } from "./desktop-follow-session";
import { IS_OVERWOLF } from "../../utils/platform";
import { unitsToMeters } from "../../utils/game-units";

const DISMISSED_TRACKING_RESTART_KEY = "peak-map:dismissed-tracking-restart";

export interface MapScreenProps {
  isMiniMap?: boolean;
  expeditionReplay?: ExpeditionRecord | null;
  miniMapOpenRevision?: number;
  onRequestTrackingFolder?: () => void;
}

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

interface CameraHistoryEntry {
  markerId: string;
  camera: CameraState;
}

interface MarkerRenderGroup {
  id: string;
  x: number;
  y: number;
  markers: MapMarker[];
}

interface MarkerBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 32;
const PAN_THRESHOLD_PX = 4;
const DETAIL_ZOOM = 4;
const MAP_EDGE_INSET = 20;
const LEFT_RAIL_MAX_WIDTH = 320;
const COMPACT_RAIL_GUTTER = 80;
const MARKER_SCREEN_RADIUS = 14;
const DETAIL_FOCUS_GAP = 16;
// Far-away markers occupy screen-space buckets instead of disappearing. As the
// player zooms in, the buckets get smaller until every marker stands alone.
const MARKER_CLUSTER_MAX_ZOOM = 2.25;
const MARKER_CLUSTER_CELL_PX = 44;
// Keep a buffer around the viewport and update its bounds in steps, so most
// pointer moves only translate the already mounted marker layer.
const MARKER_CULL_STEP_PX = 96;
const MARKER_CULL_MARGIN_PX = 160;
const CANVAS_MARKER_THRESHOLD = 400;
const MAX_FLIGHT_CANVAS_EDGE_PX = 2_048;
// A zoom only feels even-paced when the scale grows geometrically, but a CSS
// transition interpolates it linearly, and the same linear ramp reads very
// differently in each direction. Diving in, an ease-out spends its first frames
// exploding outwards and the rest crawling, so a long dive bends the curve the
// other way to flatten the felt rate. Pulling back needs the opposite shape,
// which is the ease-out short hops already use.
const FLY_EASE_STEP = "cubic-bezier(0.22, 1, 0.36, 1)";
const FLY_EASE_LEAP = "cubic-bezier(0.85, 0, 0.6, 0.85)";
const FLY_LEAP_RATIO = 2.5;
const FLY_DURATION_MS = 700;
// Every daily island shares the same projection and beach layout. The crashed
// plane sits at the southern end of that layout, so the in-game map can open
// at a deterministic landmark even before the first live-position sample.
const DAILY_ISLAND_START = { x: 50.2, y: 90.7 } as const;
const MarkerGlyph = ({ category }: { category: MarkerCategoryDefinition }) => (
  <MarkerCategoryIcon category={category} size={16} />
);

const groupMapMarkers = (
  markers: MapMarker[],
  planeSize: number,
  zoom: number,
  selectedMarkerId: string | null,
): MarkerRenderGroup[] => {
  if (planeSize === 0 || zoom >= MARKER_CLUSTER_MAX_ZOOM) {
    return markers.map((marker) => ({
      id: marker.id,
      x: marker.x,
      y: marker.y,
      markers: [marker],
    }));
  }

  const cellSize = (MARKER_CLUSTER_CELL_PX / (planeSize * zoom)) * 100;
  const buckets = new Map<string, MapMarker[]>();
  const groups: MarkerRenderGroup[] = [];

  markers.forEach((marker) => {
    // A selected location remains anchored while the user zooms back out with
    // its detail panel open; it must never disappear inside a count badge.
    if (marker.id === selectedMarkerId) {
      groups.push({ id: marker.id, x: marker.x, y: marker.y, markers: [marker] });
      return;
    }
    const key = `${marker.category}:${Math.floor(marker.x / cellSize)}:${Math.floor(marker.y / cellSize)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(marker);
    else buckets.set(key, [marker]);
  });

  buckets.forEach((bucket, key) => {
    groups.push({
      id: bucket.length === 1 ? bucket[0].id : `cluster:${key}`,
      x: bucket.reduce((sum, marker) => sum + marker.x, 0) / bucket.length,
      y: bucket.reduce((sum, marker) => sum + marker.y, 0) / bucket.length,
      markers: bucket,
    });
  });

  return groups;
};

const markerBoundsFor = (camera: CameraState, viewport: ViewportSize): MarkerBounds | null => {
  const extent = Math.min(viewport.width, viewport.height) * camera.scale;
  if (extent === 0) return null;
  const unitsPerPixel = 100 / extent;
  const x = 50 - camera.x * unitsPerPixel;
  const y = 50 - camera.y * unitsPerPixel;
  const horizontal = (viewport.width / 2 + MARKER_CULL_MARGIN_PX) * unitsPerPixel;
  const vertical = (viewport.height / 2 + MARKER_CULL_MARGIN_PX) * unitsPerPixel;
  return { left: x - horizontal, right: x + horizontal, top: y - vertical, bottom: y + vertical };
};

const mergeMarkerBounds = (a: MarkerBounds, b: MarkerBounds): MarkerBounds => ({
  left: Math.min(a.left, b.left),
  right: Math.max(a.right, b.right),
  top: Math.min(a.top, b.top),
  bottom: Math.max(a.bottom, b.bottom),
});

// Legend glyph in the Elden Ring key: diamond bullets against tapering rules,
// drawn inline so it inherits the gold of whatever frame holds it.
const LegendGlyph = ({ size = 17 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {[6, 12, 18].map((y, index) => (
      <g key={y}>
        <path d={`M4 ${y - 2.6}L6.6 ${y}L4 ${y + 2.6}L1.4 ${y}Z`} fill="currentColor" />
        <path
          d={`M9.6 ${y}h${12 - index * 3}`}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    ))}
  </svg>
);

interface FilterGroupDefinition {
  id: string;
  labelKey: string;
  categories: MarkerCategory[];
}

const FILTER_GROUPS: FilterGroupDefinition[] = [
  {
    id: "landmarks",
    labelKey: "map.filterGroups.landmarks",
    categories: ["campfire", "scout", "respawn", "portal", "belltower"],
  },
  {
    id: "resources",
    labelKey: "map.filterGroups.resources",
    categories: ["luggage", "nest", "forage", "guidebook"],
  },
  {
    id: "traversal",
    labelKey: "map.filterGroups.traversal",
    categories: ["bridge", "rope", "vine"],
  },
  {
    id: "threats",
    labelKey: "map.filterGroups.threats",
    categories: ["creature", "environment", "trap"],
  },
  {
    id: "secrets",
    labelKey: "map.filterGroups.secrets",
    categories: ["secret"],
  },
];

// Overlays drawn from the player's own recorded expedition rather than from
// the catalog. They filter alongside the marker categories but are counted and
// labelled separately, because they describe the climb, not the island.
type RunLayerId = "trail" | "deaths";

interface RunLayer {
  id: RunLayerId;
  labelKey: string;
  icon: typeof Route;
  enabled: boolean;
  count: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

interface TrailPoint {
  x: number;
  y: number;
}

interface TrailDirectionArrow extends TrailPoint {
  angle: number;
}

// Place chevrons by travelled distance rather than sample count. The recorder
// can thin old routes, but their direction markers should remain evenly spaced.
const trailDirectionArrows = (points: TrailPoint[]): TrailDirectionArrow[] => {
  const legs = points.slice(1).map((point, index) => {
    const previous = points[index];
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    return { point, previous, dx, dy, length: Math.hypot(dx, dy) };
  }).filter((leg) => leg.length > 0);
  const totalLength = legs.reduce((total, leg) => total + leg.length, 0);
  if (totalLength < 1.8) return [];

  const arrowCount = clamp(Math.round(totalLength / 0.85), 1, 100);
  const arrows: TrailDirectionArrow[] = [];
  let legIndex = 0;
  let distanceBeforeLeg = 0;

  for (let index = 1; index <= arrowCount; index += 1) {
    const targetDistance = (totalLength * index) / (arrowCount + 1);
    while (
      legIndex < legs.length - 1
      && distanceBeforeLeg + legs[legIndex].length < targetDistance
    ) {
      distanceBeforeLeg += legs[legIndex].length;
      legIndex += 1;
    }
    const leg = legs[legIndex];
    const progress = (targetDistance - distanceBeforeLeg) / leg.length;
    arrows.push({
      x: leg.previous.x + leg.dx * progress,
      y: leg.previous.y + leg.dy * progress,
      angle: Math.atan2(leg.dy, leg.dx) * (180 / Math.PI),
    });
  }

  return arrows;
};

const formatDuration = (seconds: number | null) => {
  if (seconds === null) return "--:--:--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, "0"));
  return (
    <>
      {parts[0]}<span className="mx-[2px] opacity-60">:</span>{parts[1]}<span className="mx-[2px] opacity-60">:</span>{parts[2]}
    </>
  );
};

const TEAM_COLORS = ["#8fb7d9", "#8fc98f", "#d9a06f", "#c98fb3"];
const HISTORICAL_TRAIL_COLOR = "#82bcea";
const DESKTOP_MAP_CONTROL_CLASS = "grid h-9 w-9 cursor-pointer place-items-center text-muted transition-colors hover:bg-surface-hover hover:text-accent disabled:cursor-not-allowed disabled:text-subtle";

const MapControlButton = ({ label, className, children, ...props }:
  ComponentPropsWithoutRef<"button"> & { label: string }) => (
  <button {...props} type="button" data-map-control aria-label={label} className={twMerge("map-control-button", className)}>
    {children}
    <span className="map-control-tooltip" aria-hidden="true">{label}</span>
  </button>
);

interface TeammatePinProps {
  teammate: LiveTeammate;
  color: string;
  x: number;
  y: number;
  scale: number;
  onFollow: (teammate: LiveTeammate) => void;
}

const TeammatePin = ({ teammate, color, x, y, scale, onFollow }: TeammatePinProps) => {
  // Same unwrapped-heading latch as the local pin so the arrow never spins
  // the long way across the ±180° seam.
  const [heading, setHeading] = useState(0);
  const delta = (((teammate.heading - heading) % 360) + 540) % 360 - 180;
  if (Math.abs(delta) > 0.01) setHeading(heading + delta);
  const down = teammate.dead || teammate.passedOut;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onFollow(teammate);
      }}
      className="group absolute z-20 cursor-pointer transition-[left,top] duration-300 ease-linear"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
      aria-label={teammate.name}
    >
      {down && (
        <span
          className="pointer-events-none absolute -inset-1 animate-ping rounded-[var(--radius-full)] border-2 border-danger/70"
          aria-hidden="true"
        />
      )}
      <span
        className={twMerge(
          "grid h-6 w-6 place-items-center rounded-[var(--radius-full)] border-2 border-background shadow-[0_5px_16px_rgba(0,0,0,.55)]",
          down && "opacity-70 grayscale",
        )}
        style={{ backgroundColor: color }}
      >
        <Navigation2
          size={13}
          className="text-background transition-transform duration-300 ease-linear"
          fill="currentColor"
          style={{ transform: `rotate(${heading}deg)` }}
          aria-hidden="true"
        />
      </span>
      <span className="pointer-events-none invisible absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap border border-border bg-background/95 px-1.5 py-0.5 text-[9px] font-medium text-primary shadow-lg group-hover:visible group-focus-visible:visible">
        {teammate.name}
      </span>
    </button>
  );
};

const TILE_MIN_ZOOM = 3;
const TILE_IDS = Array.from({ length: MAP_TILE_GRID * MAP_TILE_GRID }, (_, index) => ({
  column: index % MAP_TILE_GRID,
  row: Math.floor(index / MAP_TILE_GRID),
}));

interface MapArtworkProps {
  source: string | null;
  mapSlug: string | null;
  showTiles: boolean;
}

const MapArtwork = memo(function MapArtwork({ source, mapSlug, showTiles }: MapArtworkProps) {
  // Once tiles were shown they stay mounted, so zooming out and back in does
  // not re-trigger image decoding. Out of tile range they only go invisible,
  // which keeps sixteen full-size images out of every raster pass.
  const [tilesActivated, setTilesActivated] = useState(false);
  const [failedTiles, setFailedTiles] = useState<Set<string>>(() => new Set());
  const [loadedTiles, setLoadedTiles] = useState<Set<string>>(() => new Set());
  if (showTiles && !tilesActivated) setTilesActivated(true);

  if (!source) return null;
  const tileSize = 100 / MAP_TILE_GRID;
  // The tiles carry four times the overview's resolution, so once the whole
  // grid has decoded the overview underneath is only a blurry copy being
  // rasterised twice over. Any missing tile keeps it on as the backing layer.
  const tilesCover = showTiles && loadedTiles.size === TILE_IDS.length;
  return (
    <>
      <img
        src={source}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
        style={{ visibility: tilesCover ? "hidden" : undefined }}
        aria-hidden="true"
      />
      {tilesActivated
        && mapSlug !== null
        && TILE_IDS.map(({ column, row }) => {
          const tileId = `${column}-${row}`;
          if (failedTiles.has(tileId)) return null;
          return (
            <img
              key={tileId}
              src={getMapTileSource(mapSlug, column, row)}
              alt=""
              draggable={false}
              className="pointer-events-none absolute select-none"
              style={{
                left: `${column * tileSize}%`,
                top: `${row * tileSize}%`,
                // Fractional zoom positions can expose the background between
                // adjacent images. A half-pixel overlap covers that raster seam.
                width: column < MAP_TILE_GRID - 1 ? `calc(${tileSize}% + 0.5px)` : `${tileSize}%`,
                height: row < MAP_TILE_GRID - 1 ? `calc(${tileSize}% + 0.5px)` : `${tileSize}%`,
                visibility: showTiles ? undefined : "hidden",
              }}
              onLoad={() => setLoadedTiles((current) => new Set(current).add(tileId))}
              onError={() =>
                setFailedTiles((current) => new Set(current).add(tileId))
              }
              aria-hidden="true"
            />
          );
        })}
    </>
  );
});

interface MapMarkerLayerProps {
  groups: MarkerRenderGroup[];
  categories: MarkerCategoryDefinition[];
  pinScale: number;
  selectedMarkerId: string | null;
  onSelect: (marker: MapMarker) => void;
  onCluster: (group: MarkerRenderGroup) => void;
}

const MapMarkerLayer = memo(function MapMarkerLayer({
  groups, categories, pinScale, selectedMarkerId, onSelect, onCluster,
}: MapMarkerLayerProps) {
  const { t } = useTranslation();
  return (
    <>
      {groups.map((group) => {
        if (group.markers.length > 1) {
          const category = categories.find(
            (item) => item.id === group.markers[0].category,
          )!;
          return (
            <button
              key={group.id}
              type="button"
              data-marker-category={category.id}
              data-marker-cluster={group.markers.length}
              onClick={(event) => {
                event.stopPropagation();
                onCluster(group);
              }}
              className="pointer-events-auto absolute z-20 grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-full)] border border-primary/30 bg-background/94 shadow-[0_6px_18px_rgba(0,0,0,.62)] transition-colors hover:border-accent hover:bg-surface-hover focus-visible:z-30"
              style={{
                left: `${group.x}%`,
                top: `${group.y}%`,
                transform: `translate(-50%, -50%) scale(${pinScale})`,
              }}
              aria-label={t("map.clusterLabel", { count: group.markers.length })}
              title={t("map.clusterLabel", { count: group.markers.length })}
            >
              <span style={{ color: category.color }}>
                <MarkerGlyph category={category} />
              </span>
              <span
                aria-hidden="true"
                className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-[var(--radius-full)] border border-background bg-accent px-1 text-[8px] font-bold leading-none tabular-nums text-background shadow-[0_2px_6px_rgba(0,0,0,.55)]"
              >
                {group.markers.length}
              </span>
            </button>
          );
        }

        const marker = group.markers[0];
        const category = categories.find((item) => item.id === marker.category)!;
        const selected = selectedMarkerId === marker.id;
        return (
          <button
            key={marker.id}
            type="button"
            data-marker-category={marker.category}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(marker);
            }}
            className={twMerge(
              "pointer-events-auto group absolute z-10 isolate grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-full)] border bg-background/92 shadow-[0_5px_16px_rgba(0,0,0,.55)] hover:z-20 focus-visible:z-20",
              selected
                ? "border-accent text-accent shadow-[0_0_0_3px_rgba(201,185,142,.12),0_7px_22px_rgba(0,0,0,.6)]"
                : "border-primary/25 text-primary hover:border-accent hover:text-accent",
            )}
            style={{
              left: `${marker.x}%`,
              top: `${marker.y}%`,
              transform: `translate(-50%, -50%) scale(${pinScale})`,
            }}
            aria-label={marker.name}
          >
            <span style={selected ? undefined : { color: category.color }}>
              <MarkerGlyph category={category} />
            </span>
            <span className="pointer-events-none invisible absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap border border-border bg-background/95 px-2 py-1 text-[9px] font-medium text-primary shadow-lg group-hover:visible group-focus-visible:visible">
              {marker.name}
            </span>
          </button>
        );
      })}
    </>
  );
});

interface FilterPanelProps {
  categories: Set<MarkerCategory>;
  categoryDefinitions: MarkerCategoryDefinition[];
  filteredMarkers: MapMarker[];
  markers: MapMarker[];
  runLayers: RunLayer[];
  onCategoryToggle: (category: MarkerCategory) => void;
  onClose: () => void;
  onRunLayerToggle: (id: RunLayerId, enabled: boolean) => void;
  onSetCategories: (categories: MarkerCategory[]) => void;
  onSetGroup: (categories: MarkerCategory[], enabled: boolean) => void;
}

const FilterPanel = ({
  categories,
  categoryDefinitions,
  filteredMarkers,
  markers,
  runLayers,
  onCategoryToggle,
  onClose,
  onRunLayerToggle,
  onSetCategories,
  onSetGroup,
}: FilterPanelProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState(["resources"]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  // Layers with nothing recorded on this island stay hidden, the same way an
  // empty marker category does.
  const visibleRunLayers = runLayers.filter(
    (layer) =>
      layer.count > 0
      && (!normalizedQuery || t(layer.labelKey).toLocaleLowerCase().includes(normalizedQuery)),
  );
  const allEnabled =
    categories.size === categoryDefinitions.length && runLayers.every((layer) => layer.enabled);
  const noneEnabled = categories.size === 0 && runLayers.every((layer) => !layer.enabled);

  const setEverything = (enabled: boolean) => {
    onSetCategories(enabled ? categoryDefinitions.map((category) => category.id) : []);
    runLayers.forEach((layer) => onRunLayerToggle(layer.id, enabled));
  };

  return (
    <aside className="panel-surface pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden border border-border-strong animate-fade-in">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-accent" aria-hidden="true">
          <LegendGlyph size={16} />
        </span>
        <h1 className="flex-1 text-sm font-semibold text-primary">{t("map.sidebar.title")}</h1>
        <span
          className="flex items-center gap-1 rounded-[var(--radius-full)] bg-primary/[0.08] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary"
          title={t("map.filters.countTitle")}
        >
          <MapPin size={11} className="text-accent" aria-hidden="true" />
          {filteredMarkers.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-subtle transition-colors hover:bg-primary/[0.05] hover:text-primary"
          aria-label={t("map.actions.closeFilters")}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={() => setEverything(true)}
          disabled={allEnabled}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-primary/[0.05] px-2 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/[0.1] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-primary/[0.05]"
        >
          <Eye size={13} aria-hidden="true" />
          {t("map.filters.showAll")}
        </button>
        <button
          type="button"
          onClick={() => setEverything(false)}
          disabled={noneEnabled}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-primary/[0.05] px-2 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/[0.1] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-primary/[0.05]"
        >
          <EyeOff size={13} aria-hidden="true" />
          {t("map.filters.hideAll")}
        </button>
      </div>

      <div className="shrink-0 px-4 pb-2 pt-2 flex flex-col gap-2">
        <label data-tour="search" className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-background/60 px-2.5 py-1.5 transition-colors focus-within:border-accent">
          <Search size={14} className="shrink-0 text-subtle" aria-hidden="true" />
          <span className="sr-only">{t("map.filters.findCategory")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("map.filters.findCategory")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-subtle"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="grid h-4 w-4 cursor-pointer place-items-center rounded-[var(--radius-full)] text-subtle hover:text-primary"
              aria-label={t("map.search.clear")}
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </label>
      </div>

      <div className="@container min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-1">
        {visibleRunLayers.length > 0 && (
          <div className="border-b border-border/60">
            <p className="py-2 text-[13px] font-semibold text-primary">
              {t("map.trail.groupTitle")}
            </p>
            <div className="flex flex-col gap-0.5 pb-2 pl-1">
              {visibleRunLayers.map((layer) => {
                const Icon = layer.icon;
                return (
                  <div
                    key={layer.id}
                    className={twMerge(
                      "group/category flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all hover:bg-primary/[0.05]",
                      !layer.enabled && "opacity-70 hover:opacity-100",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onRunLayerToggle(layer.id, !layer.enabled)}
                      aria-pressed={layer.enabled}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                    >
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[var(--radius-full)] bg-background/70">
                        <Icon size={13} className="text-accent" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                        {t(layer.labelKey)}
                      </span>
                    </button>
                    <span className="text-[11px] tabular-nums text-subtle">{layer.count}</span>
                    <button
                      type="button"
                      onClick={() => onRunLayerToggle(layer.id, !layer.enabled)}
                      aria-pressed={layer.enabled}
                      className={twMerge(
                        "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
                        layer.enabled
                          ? "border-accent bg-accent text-background"
                          : "border-subtle hover:border-muted",
                      )}
                    >
                      {layer.enabled && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {FILTER_GROUPS.map((group) => {
          const label = t(group.labelKey);
          const groupMatches = normalizedQuery !== "" && label.toLocaleLowerCase().includes(normalizedQuery);
          const visibleCategories = group.categories.flatMap((categoryId) => {
            const category = categoryDefinitions.find((item) => item.id === categoryId);
            // Categories with nothing on the current map stay hidden.
            if (!category || category.available === 0) return [];
            const categoryMatches = !normalizedQuery || groupMatches
              || t(category.labelKey).toLocaleLowerCase().includes(normalizedQuery);
            return categoryMatches ? [category] : [];
          });
          if (visibleCategories.length === 0) return null;

          const activeCount = group.categories.filter((category) => categories.has(category)).length;
          const allGroupEnabled = activeCount === group.categories.length;
          const noGroupEnabled = activeCount === 0;
          const expanded = openGroups.includes(group.id) || normalizedQuery !== "";
          const markerCount = markers.filter((marker) => group.categories.includes(marker.category)).length;

          return (
            <div key={group.id} className="border-b border-border/60 last:border-b-0">
              <div className="group/filter relative flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSetGroup(group.categories, !allGroupEnabled)}
                  aria-label={t(allGroupEnabled ? "map.filters.hideGroup" : "map.filters.showGroup", { group: label })}
                  className={twMerge(
                    "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors",
                    allGroupEnabled
                      ? "border-accent text-accent"
                      : noGroupEnabled
                        ? "border-subtle hover:border-muted"
                        : "border-accent/60 text-accent",
                  )}
                >
                  {allGroupEnabled && <Check size={11} strokeWidth={3} aria-hidden="true" />}
                  {!allGroupEnabled && !noGroupEnabled && <MinusIcon size={11} strokeWidth={3} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenGroups((current) =>
                    current.includes(group.id)
                      ? current.filter((id) => id !== group.id)
                      : [...current, group.id],
                  )}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-2 text-left"
                  aria-expanded={expanded}
                >
                  <span
                    className={twMerge(
                      "min-w-0 flex-1 wrap-anywhere text-[13px] font-semibold text-primary",
                      noGroupEnabled && "text-muted",
                    )}
                  >
                    {label}
                  </span>
                  <span className="min-w-9 rounded-[var(--radius-full)] bg-primary/[0.08] px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-muted">
                    {markerCount}
                  </span>
                  <ChevronDown
                    size={15}
                    className={twMerge("shrink-0 text-subtle transition-transform", expanded && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onSetCategories(group.categories)}
                  aria-label={t("map.filters.onlyLayer", { layer: label })}
                  className="pointer-events-none absolute right-[21px] top-1/2 min-h-6 -translate-y-1/2 cursor-pointer rounded-[var(--radius-sm)] bg-surface-elevated px-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent opacity-0 hover:bg-surface-hover focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/filter:pointer-events-auto group-hover/filter:opacity-100"
                >
                  {t("map.filters.only")}
                </button>
              </div>

              {expanded && (
                <div className="grid grid-cols-1 gap-x-2 gap-y-0.5 pb-2 @min-[260px]:grid-cols-2">
                  {visibleCategories.map((category) => {
                    const enabled = categories.has(category.id);
                    const categoryLabel = t(category.labelKey);
                    return (
                      <div
                        key={category.id}
                        className="group/category relative min-w-0 rounded-[var(--radius-sm)] hover:bg-primary/[0.05]"
                      >
                        <button
                          type="button"
                          onClick={() => onCategoryToggle(category.id)}
                          aria-pressed={enabled}
                          className="flex h-full min-h-9 w-full cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] px-0.5 py-1 text-left"
                        >
                          <span className={twMerge(
                            "min-w-0 flex-1 wrap-anywhere text-xs leading-snug",
                            enabled ? "text-primary" : "text-muted",
                          )}>
                            {categoryLabel}
                          </span>
                          <span className="min-w-8 shrink-0 text-right text-[11px] tabular-nums text-subtle">{category.available}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetCategories([category.id])}
                          aria-label={t("map.filters.onlyLayer", { layer: categoryLabel })}
                          className="pointer-events-none absolute right-0 top-1/2 min-h-6 -translate-y-1/2 cursor-pointer rounded-[var(--radius-sm)] bg-surface-elevated px-1 text-[10px] font-semibold uppercase tracking-wide text-accent opacity-0 hover:bg-surface-hover focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/category:pointer-events-auto group-hover/category:opacity-100"
                        >
                          {t("map.filters.only")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

const MapScreen = ({
  isMiniMap = false,
  expeditionReplay = null,
  miniMapOpenRevision = 0,
  onRequestTrackingFolder,
}: MapScreenProps) => {
  const { t, i18n } = useTranslation();
  const preferences = usePreferences();
  const replayActive = expeditionReplay !== null && !isMiniMap;
  // The overlay's zoom is a preference rather than a gesture: the mini-map is
  // 350 px of a whole island, so how much of it is worth seeing is a taste the
  // player sets once in Settings instead of pinching every run.
  const miniMapZoom = Math.max(
    MIN_ZOOM,
    (MAX_ZOOM * preferences.overlayZoomPercent) / 100,
  );
  const session = usePeakSession();
  const [dismissedTrackingRestart, setDismissedTrackingRestart] = useState<string | null>(() => {
    try { return localStorage.getItem(DISMISSED_TRACKING_RESTART_KEY); }
    catch { return null; }
  });
  const trackingSetupNeeded = session.trackingStatus !== null
    && session.trackingStatus !== "ready"
    && session.trackingStatus !== "restart-required";
  const liveState = useLiveState(session.isGameRunning);
  const [mapView, setMapView] = useState<"daily" | "final">("daily");
  // A fresh bridge scene is authoritative for both the island and its final biome. It
  // prevents a stale rotation endpoint or an updated level count from showing
  // a different Level_X than the expedition currently loaded by the game.
  const sceneOverride = expeditionReplay?.scene
    ?? liveState?.sceneName ?? null;
  const peakMap = usePeakMapData(mapView, sceneOverride);
  const mapMarkers = peakMap.markers;
  const markerCategories = peakMap.categories;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; started: boolean } | null>(null);
  const flyTimerRef = useRef<number | null>(null);
  const [camera, setCamera] = useState<CameraState>({
    x: 0,
    y: 0,
    scale: isMiniMap ? miniMapZoom : 0.92,
  });
  const cameraRef = useRef(camera);
  useLayoutEffect(() => { cameraRef.current = camera; }, [camera]);
  const miniMapZoomPercentage = Math.max(
    1,
    Math.round((camera.scale / MAX_ZOOM) * 100),
  );
  // Edge of the square map plane at 100 % zoom. Measured rather than left to
  // CSS so the fly-to maths and the rendered plane cannot drift apart. The ref
  // mirrors it for the follow loop, which reads it outside of a render.
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const planeSize = Math.min(viewportSize.width, viewportSize.height);
  const planeSizeRef = useRef(0);
  const [flying, setFlying] = useState(false);
  const [flightMarkerBounds, setFlightMarkerBounds] = useState<MarkerBounds | null>(null);
  // Zoom the artwork is laid out at. It tracks the camera exactly -- which is
  // what keeps the map sharp -- except through a fly, where it freezes at the
  // scale the flight started from so the animation is a plain scale transform
  // the compositor can run on its own. Resizing the plane every frame instead
  // would re-rasterise the whole island each time and stutter.
  const [frozenRaster, setFrozenRaster] = useState(isMiniMap ? miniMapZoom : 0.92);
  const [dragging, setDragging] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  // Legend selection is shared by the desktop and overlay windows. Unknown ids
  // in a stored list (a category renamed by an app update) are dropped rather
  // than resurrecting a filter that no longer exists.
  const categories = useMemo<Set<MarkerCategory>>(() => {
    const stored = preferences.mapCategoryFilters;
    if (!stored) return new Set(MARKER_CATEGORY_IDS);
    return new Set(
      stored.filter((id): id is MarkerCategory =>
        (MARKER_CATEGORY_IDS as string[]).includes(id),
      ),
    );
  }, [preferences.mapCategoryFilters]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [history, setHistory] = useState<CameraHistoryEntry[]>([]);
  const desktopSession = IS_OVERWOLF && !isMiniMap && !replayActive ? session.gameStartedAt : null;
  const handledDesktopSession = useRef<number | null>(null);
  const [followTarget, setFollowTargetState] = useState<FollowTarget>(() => {
    if (isMiniMap) return null;
    return preferences.followPlayerOnMap ? "self" : null;
  });

  const setFollowTarget = useCallback((target: FollowTarget) => {
    setFollowTargetState(target);
    if (desktopSession !== null && handledDesktopSession.current === desktopSession) {
      writeDesktopFollowTarget(desktopSession, target);
    }
  }, [desktopSession]);

  const playerPosition = localPlayerOf(liveState);

  const selectedMarker = mapMarkers.find((marker) => marker.id === selectedMarkerId) ?? null;
  const visibleMarkers = useMemo(
    () => replayActive ? [] : mapMarkers.filter((marker) => {
      if (!categories.has(marker.category)) return false;
      return true;
    }),
    [categories, mapMarkers, replayActive],
  );

  // The pins only render when the reported scene matches the map shown.
  const shownLevel = peakMap.level;
  const liveOnShownMap = !replayActive &&
    liveState !== null && shownLevel !== null && shownLevel.scene === liveState.sceneName;
  const shownRouteBiomeKeys = shownLevel && shownLevel.kind !== "final"
    ? getRouteBiomeTranslationKeys(shownLevel.biomes)
    : [];
  const shownRouteTitle = shownLevel
    ? shownLevel.kind === "final"
      ? t("map.view.final")
      : shownRouteBiomeKeys
          .map((key) => t(`map.live.segments.${key}`))
          .join(" · ")
    : "";
  const liveBiomeKey = liveOnShownMap && liveState.self?.segment && shownLevel
    ? getLiveBiomeTranslationKey(
        shownLevel.biomes,
        liveState.self.segment,
      )
    : null;

  // Live expedition tracking. Bridge data only counts while the player is on
  // the shown island, so the airport or main menu never look "live".
  const liveActive = !replayActive && session.isGameRunning && (session.matchActive || liveOnShownMap);
  // A corpse is parked in limbo until the run ends, so it has no place on the
  // map: pins, follow mode, the elevation readout and the rescue list all wait
  // for the scout to be back on the island.
  const playerInLimbo = playerPosition !== null && isDeathWarp(playerPosition);
  const trackingRestartGameId = session.trackingRestartGameId;
  const showTrackingRestart = !isMiniMap && !replayActive && session.isGameRunning && !playerPosition
    && session.trackingStatus === "restart-required"
    && trackingRestartGameId !== null && trackingRestartGameId !== dismissedTrackingRestart;
  const playerMapPosition =
    liveOnShownMap && playerPosition && !playerInLimbo
      ? projectToMap(shownLevel.projection, playerPosition.x, playerPosition.z)
      : null;

  const hasLiveMapPosition = playerMapPosition !== null;
  useEffect(() => {
    const choice = getDesktopFollowOnFirstFix(desktopSession, hasLiveMapPosition, handledDesktopSession.current);
    if (!choice) return;
    handledDesktopSession.current = choice.session;
    setFollowTarget(choice.target);
  }, [desktopSession, hasLiveMapPosition, setFollowTarget]);

  const teammates = liveOnShownMap
    ? liveState.players.filter((player) => !player.isLocal && !isDeathWarp(player))
    : [];
  const downedTeammates = teammates.filter((mate) => mate.passedOut || mate.dead);
  const teammateColors = new Map(
    [...teammates]
      .sort((a, b) => a.actorNr - b.actorNr)
      .map((mate, index) => [mate.actorNr, TEAM_COLORS[index % TEAM_COLORS.length]]),
  );

  // Expedition history recorded by the background window for the shown island.
  const expeditions = useExpeditions();
  // Both run layers are preferences, not view state: the overlay and the
  // desktop map are separate windows, and a player who hides graves means it
  // for both of them and for the next session.
  const { showTrail, showPreviousTrails, showDeaths } = preferences;
  const sceneRecords = shownLevel
    ? expeditionReplay
      ? [expeditionReplay]
      : expeditions.filter((record) => record.scene === shownLevel.scene)
    : [];
  const { climbStartedAt } = session;
  const currentClimbRecord = liveOnShownMap && climbStartedAt !== null
    ? findIslandRecord(sceneRecords, shownLevel.scene, liveState.updatedAt)
    : undefined;

  // Journal records can hold multiple climbs on the same island. Break the
  // trail at the start of the current climb and at gaps in the sample clock.
  const trailSegments =
    showTrail && shownLevel
      ? sceneRecords.flatMap((record) => {
          const { samples } = record;
          if (samples.length < 2) return [];
          const currentStartSecond = record === currentClimbRecord && climbStartedAt !== null
            ? Math.round((climbStartedAt - record.startedAt) / 1_000)
            : Infinity;
          const breakAfter = trailBreakSeconds(record);
          const step = Math.max(1, Math.ceil(samples.length / 600));
          const legs: Array<{ samples: typeof samples; current: boolean }> = [];
          samples.forEach((sample, index) => {
            const current = replayActive || sample[0] >= currentStartSecond;
            const previous = samples[index - 1];
            const leg = legs.at(-1);
            if (!leg || leg.current !== current || sample[0] - previous[0] > breakAfter) {
              legs.push({ samples: [sample], current });
            } else {
              leg.samples.push(sample);
            }
          });
          return legs
            .filter((leg) => leg.samples.length > 1 && (leg.current || showPreviousTrails))
            .map((leg) => ({
              points: leg.samples
                .filter((_, index, all) => index % step === 0 || index === all.length - 1)
                .map((sample) => projectToMap(shownLevel.projection, sample[1], sample[3])),
              current: leg.current,
            }));
        })
      : [];
  // GEP resets its counter on every match_start and stays silent without the
  // events feature, so whichever source saw more deaths on this island wins.
  const recordedDeaths = sceneRecords.reduce((total, record) => total + record.deaths.length, 0);
  const deathCount = Math.max(session.deaths, recordedDeaths);
  // Graves are numbered within their own record, so the label on a pin reads
  // as the attempt that ended there rather than a running total.
  const deathPoints =
    showDeaths && shownLevel
      ? sceneRecords.flatMap((record) =>
          record.deaths.map((death, index) => ({
            ...projectToMap(shownLevel.projection, death.x, death.z),
            attempt: index + 1,
            elevation: death.y,
          })),
        )
      : [];
  const runLayers: RunLayer[] = [
    {
      id: "trail",
      labelKey: "map.trail.trailLayer",
      icon: Route,
      enabled: showTrail,
      count: sceneRecords.filter((record) => record.samples.length > 1).length,
    },
    {
      id: "deaths",
      labelKey: "map.trail.deathsLayer",
      icon: Skull,
      enabled: showDeaths,
      count: recordedDeaths,
    },
  ];

  const replayHighPoint = useMemo(() => {
    if (!expeditionReplay || !shownLevel || expeditionReplay.samples.length === 0) return null;
    const sample = expeditionReplay.samples.reduce((highest, candidate) =>
      candidate[2] > highest[2] ? candidate : highest);
    return {
      ...projectToMap(shownLevel.projection, sample[1], sample[3]),
      elevation: sample[2],
      seconds: sample[0],
    };
  }, [expeditionReplay, shownLevel]);

  const replayCampfires = useMemo(() => {
    if (!expeditionReplay || !shownLevel) return [];
    const recorded = [...new Map(
      (expeditionReplay.campfires ?? []).map((campfire) => [
        `${Math.round(campfire.x * 10)},${Math.round(campfire.z * 10)}`,
        campfire,
      ]),
    ).values()].map((campfire) => ({
      ...projectToMap(shownLevel.projection, campfire.x, campfire.z),
      id: `${campfire.x}:${campfire.z}`,
    }));
    if (recorded.length > 0) return recorded;
    return reachedMarkersOf(shownLevel, expeditionReplay, "campfire").map((marker) => ({
      x: marker.map.x,
      y: marker.map.y,
      id: marker.id,
    }));
  }, [expeditionReplay, shownLevel]);

  const replayReachedLocations = useMemo(() => {
    if (!expeditionReplay || !shownLevel) return [];
    return (["scout", "luggage", "secret", "guidebook"] as const).flatMap((category) =>
      reachedMarkersOf(shownLevel, expeditionReplay, category).map((marker) => ({
        id: marker.id,
        category,
        name: marker.content.name,
        x: marker.map.x,
        y: marker.map.y,
      })),
    );
  }, [expeditionReplay, shownLevel]);

  const replayDate = expeditionReplay
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" })
        .format(new Date(expeditionReplay.startedAt))
    : "";

  // CSS transitions interpolate rotation numerically, so track an unwrapped
  // heading that never jumps across the ±180° seam. Render-phase latch; the
  // epsilon guard stops float rounding from re-triggering the update.
  const [playerHeading, setPlayerHeading] = useState(0);
  if (playerPosition) {
    const delta =
      (((playerPosition.heading - playerHeading) % 360) + 540) % 360 - 180;
    if (Math.abs(delta) > 0.01) setPlayerHeading(playerHeading + delta);
  }
  // At rest the plane is laid out at the camera's own zoom, so the transform
  // carries no scale at all and the artwork rasterises at the size it is shown
  // at. Mid-fly planeZoom is the leftover the transform animates through.
  const rasterScale = flying ? frozenRaster : camera.scale;
  const planeZoom = camera.scale / rasterScale;
  // Pins sit inside the plane, so they undo whatever the transform adds. The
  // clustering layer controls low-zoom density, allowing every remaining pin
  // to retain a legible screen size at every zoom level.
  const pinScale =
    (1 / planeZoom) * (preferences.markerScalePercent / 100);
  // Keep a cluster intact for the duration of a fly animation, then refine it
  // at the new zoom. This avoids swapping a count badge for many pins midway
  // through the camera movement.
  const markerGroupingZoom = Math.min(flying ? frozenRaster : camera.scale, MARKER_CLUSTER_MAX_ZOOM);
  const markerGroups = useMemo(
    () => groupMapMarkers(
      visibleMarkers,
      planeSize,
      markerGroupingZoom,
      selectedMarkerId,
    ),
    [markerGroupingZoom, planeSize, selectedMarkerId, visibleMarkers],
  );
  const cullX = Math.round(camera.x / MARKER_CULL_STEP_PX) * MARKER_CULL_STEP_PX;
  const cullY = Math.round(camera.y / MARKER_CULL_STEP_PX) * MARKER_CULL_STEP_PX;
  const cullScale = camera.scale;
  const markerBounds = useMemo(
    () => markerBoundsFor({ x: cullX, y: cullY, scale: cullScale }, viewportSize),
    [cullX, cullY, cullScale, viewportSize],
  );
  const visibleMarkerBounds = useMemo(() =>
    markerBounds && flying && flightMarkerBounds ? mergeMarkerBounds(markerBounds, flightMarkerBounds) : markerBounds,
  [markerBounds, flying, flightMarkerBounds]);
  const visibleMarkerGroups = useMemo(() => {
    if (!visibleMarkerBounds) return [];
    const groups = markerGroups.filter((group) =>
      group.id === selectedMarkerId || (
        group.x >= visibleMarkerBounds.left && group.x <= visibleMarkerBounds.right
        && group.y >= visibleMarkerBounds.top && group.y <= visibleMarkerBounds.bottom
      ),
    );
    return groups.length === markerGroups.length ? markerGroups : groups;
  }, [visibleMarkerBounds, markerGroups, selectedMarkerId]);
  const markerLayerExtent = planeSize * rasterScale;
  // The swept bounds may cover most of the island on a long jump. Use the
  // button layer for that transition instead of allocating a huge bitmap.
  const canvasFitsFlight = !flying || (visibleMarkerBounds !== null && Math.max(
    visibleMarkerBounds.right - visibleMarkerBounds.left,
    visibleMarkerBounds.bottom - visibleMarkerBounds.top,
  ) * markerLayerExtent / 100 <= MAX_FLIGHT_CANVAS_EDGE_PX);
  const useCanvasMarkers = canvasFitsFlight && markerGroupingZoom >= MARKER_CLUSTER_MAX_ZOOM
    && visibleMarkers.length > CANVAS_MARKER_THRESHOLD;
  const canvasMarkers = useMemo(() => useCanvasMarkers
    ? visibleMarkerGroups.filter((group) => group.id !== selectedMarkerId).map((group) => group.markers[0])
    : [], [useCanvasMarkers, visibleMarkerGroups, selectedMarkerId]);
  const domMarkerGroups = useMemo(() => useCanvasMarkers
    ? visibleMarkerGroups.filter((group) => group.id === selectedMarkerId)
    : visibleMarkerGroups, [useCanvasMarkers, visibleMarkerGroups, selectedMarkerId]);

  const aoeZones = useMemo(() => {
    if (!shownLevel) return [];
    return visibleMarkers
      .map(marker => {
        const radius = getMarkerRadius(marker);
        if (radius === null) return null;
        const rx = (radius / (shownLevel.projection.worldXMax - shownLevel.projection.worldXMin)) * (shownLevel.projection.mapXMax - shownLevel.projection.mapXMin);
        const ry = (radius / (shownLevel.projection.worldZMax - shownLevel.projection.worldZMin)) * (shownLevel.projection.mapYMax - shownLevel.projection.mapYMin);
        return { marker, rx, ry };
      })
      .filter((x): x is { marker: MapMarker; rx: number; ry: number } => x !== null);
  }, [shownLevel, visibleMarkers]);

  const setCameraSmooth = useCallback(
    (next: CameraState) => {
      const previousCamera = cameraRef.current;
      const previousBounds = markerBoundsFor(previousCamera, viewportSize);
      // Keep the whole animated sweep populated, including when a flight is
      // redirected before it lands.
      setFlightMarkerBounds((current) =>
        flying && current && previousBounds ? mergeMarkerBounds(current, previousBounds) : previousBounds,
      );
      // A flight already under way keeps its own frozen raster: re-pinning it
      // to a camera that has long since jumped to the old target would resize
      // the plane mid-animation and jolt the picture.
      if (!flying) setFrozenRaster(previousCamera.scale);
      setFlying(true);
      setCamera(next);
      if (flyTimerRef.current !== null) window.clearTimeout(flyTimerRef.current);
      // Landing drops `flying`, which hands the plane back to the camera's own
      // zoom in one commit -- same geometry, sharp again.
      flyTimerRef.current = window.setTimeout(() => setFlying(false), FLY_DURATION_MS + 20);
    },
    [flying, viewportSize],
  );

  const focusPoint = useCallback(
    (x: number, y: number, targetScale = DETAIL_ZOOM, reserveDetail = false) => {
      if (planeSize === 0) return;
      const finalScale = Math.max(camera.scale, targetScale);
      const mapOffsetX = (x / 100 - 0.5) * planeSize;
      const mapOffsetY = (y / 100 - 0.5) * planeSize;
      const viewportWidth = viewportRef.current?.clientWidth ?? planeSize;
      const viewportCenterX = viewportWidth / 2;
      const railWidth = Math.min(
        LEFT_RAIL_MAX_WIDTH,
        Math.max(0, viewportWidth - COMPACT_RAIL_GUTTER),
      );
      const panelRight = MAP_EDGE_INSET + railWidth;
      const markerRightLimit = viewportWidth - MAP_EDGE_INSET - MARKER_SCREEN_RADIUS;
      const desiredMarkerX = reserveDetail
        ? Math.min(
            Math.max(
              viewportCenterX,
              panelRight + DETAIL_FOCUS_GAP + MARKER_SCREEN_RADIUS,
            ),
            markerRightLimit,
          )
        : viewportCenterX;
      const desiredOffsetX = desiredMarkerX - viewportCenterX;
      setCameraSmooth({
        x: desiredOffsetX - mapOffsetX * finalScale,
        y: -mapOffsetY * finalScale,
        scale: finalScale,
      });
    },
    [camera.scale, planeSize, setCameraSmooth],
  );

  const selectMarker = useCallback(
    (marker: MapMarker, addHistory = false) => {
      if (addHistory && selectedMarkerId) {
        const previousCamera = cameraRef.current;
        setHistory((entries) => [...entries, { markerId: selectedMarkerId, camera: previousCamera }]);
      }
      setSelectedMarkerId(marker.id);
      setSelectedItemId(null);
      setFiltersOpen(false);
      focusPoint(marker.x, marker.y, DETAIL_ZOOM, true);
    },
    [focusPoint, selectedMarkerId],
  );

  const selectCluster = useCallback((group: MarkerRenderGroup) => {
    focusPoint(group.x, group.y, Math.min(
      MARKER_CLUSTER_MAX_ZOOM,
      Math.max(camera.scale * 2, camera.scale + 0.75),
    ));
  }, [camera.scale, focusPoint]);

  const closeDetails = useCallback(() => {
    setSelectedMarkerId(null);
    setSelectedItemId(null);
    setHistory([]);
  }, []);

  const goBack = useCallback(() => {
    if (selectedItemId !== null) {
      setSelectedItemId(null);
      return;
    }
    const previous = history.at(-1);
    if (!previous) {
      closeDetails();
      return;
    }
    setHistory((entries) => entries.slice(0, -1));
    setSelectedMarkerId(previous.markerId);
    setCameraSmooth(previous.camera);
  }, [closeDetails, history, selectedItemId, setCameraSmooth]);

  // Render-phase latch: when the bridge reports a scene change, show the
  // daily map while leaving later manual view toggles untouched. The final
  // island is a biome within a scene, not the WilIsland fallback scene.
  const [lastScene, setLastScene] = useState<string | null>(null);
  const liveScene = liveState?.sceneName ?? null;
  if (!replayActive && liveScene !== lastScene) {
    setLastScene(liveScene);
    const autoView = liveScene === "WilIsland" || liveScene?.startsWith("Level_")
      ? ("daily" as const)
      : null;
    if (autoView !== null && autoView !== mapView) {
      setMapView(autoView);
      closeDetails();
      setCamera({ x: 0, y: 0, scale: 0.92 });
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedItemId !== null) {
        event.preventDefault();
        setSelectedItemId(null);
      } else if (selectedMarkerId) {
        event.preventDefault();
        closeDetails();
      } else if (filtersOpen) {
        event.preventDefault();
        setFiltersOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDetails, filtersOpen, selectedItemId, selectedMarkerId]);

  useEffect(
    () => () => {
      if (flyTimerRef.current !== null) window.clearTimeout(flyTimerRef.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      planeSizeRef.current = Math.min(width, height);
      setViewportSize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onGlobalPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.started) {
        if (Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
        // Route the release and resulting click to the viewport once a pan starts.
        viewportRef.current?.setPointerCapture(event.pointerId);
        drag.started = true;
        setFlying(false);
        setDragging(true);
        setFollowTarget(null);
        if (isMiniMap && session.gameStartedAt !== null) {
          writeOverlayFollowSession(session.gameStartedAt, false);
        }
      }

      event.preventDefault();
      drag.x = event.clientX;
      drag.y = event.clientY;
      setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    };

    const onGlobalPointerEnd = (event: PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", onGlobalPointerMove, { passive: false });
    window.addEventListener("pointerup", onGlobalPointerEnd);
    window.addEventListener("pointercancel", onGlobalPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onGlobalPointerMove);
      window.removeEventListener("pointerup", onGlobalPointerEnd);
      window.removeEventListener("pointercancel", onGlobalPointerEnd);
    };
  }, [isMiniMap, session.gameStartedAt, setFollowTarget]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cursorX = event.clientX - rect.left - rect.width / 2;
      const cursorY = event.clientY - rect.top - rect.height / 2;
      setFlying(false);
      setCamera((current) => {
        const nextScale = clamp(
          current.scale * (event.deltaY > 0 ? 0.88 : 1.12),
          MIN_ZOOM,
          MAX_ZOOM,
        );
        const ratio = nextScale / current.scale;
        return {
          x: cursorX - (cursorX - current.x) * ratio,
          y: cursorY - (cursorY - current.y) * ratio,
          scale: nextScale,
        };
      });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (event.button !== 0 || dragRef.current || target.closest("[data-map-control]")) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false };
  };

  const adjustZoom = (direction: 1 | -1) => {
    const nextScale = direction > 0 ? camera.scale * 1.25 : camera.scale / 1.25;
    setCameraSmooth({ ...camera, scale: clamp(nextScale, MIN_ZOOM, MAX_ZOOM) });
  };

  const resetView = () => {
    closeDetails();
    setCameraSmooth({ x: 0, y: 0, scale: 0.92 });
  };

  const switchMapView = useCallback(
    (next: "daily" | "final") => {
      if (next === mapView) return;
      setMapView(next);
      closeDetails();
      setCameraSmooth({ x: 0, y: 0, scale: 0.92 });
    },
    [closeDetails, mapView, setCameraSmooth],
  );

  // Follow mode keeps the camera glued to the chosen pin (self or a
  // teammate); panning by hand releases it. A stale sample pauses following
  // instead of cancelling it.
  const followedTeammate =
    typeof followTarget === "number"
      ? teammates.find((mate) => mate.actorNr === followTarget) ?? null
      : null;
  const followPoint =
    followTarget === "self"
      ? playerMapPosition
      : followedTeammate && shownLevel
        ? projectToMap(shownLevel.projection, followedTeammate.x, followedTeammate.z)
        : null;
  const followX = followPoint?.x ?? null;
  const followY = followPoint?.y ?? null;
  useEffect(() => {
    const plane = planeSizeRef.current;
    if (followX === null || followY === null || plane === 0) return;
    setCamera((current) => ({
      ...current,
      x: -(followX / 100 - 0.5) * plane * current.scale,
      y: -(followY / 100 - 0.5) * plane * current.scale,
    }));
  }, [followX, followY]);

  // Open at the crashed plane while live position is unavailable. Once a
  // position arrives, the follow effect moves the camera to the player.
  // Reopening the overlay enables follow again after a manual unfollow.
  const centredMiniMapView = useRef<string | null>(null);
  const followedMiniMapOpenRevision = useRef<number | null>(null);
  useEffect(() => {
    if (!isMiniMap || planeSize === 0 || !shownLevel) return;
    const viewKey = `${miniMapOpenRevision}:${shownLevel.scene}:${shownLevel.kind}:${miniMapZoom}`;
    if (centredMiniMapView.current === viewKey) return;
    centredMiniMapView.current = viewKey;
    const newlyOpened = followedMiniMapOpenRevision.current !== miniMapOpenRevision;
    followedMiniMapOpenRevision.current = miniMapOpenRevision;
    if (newlyOpened) {
      setFollowTarget("self");
      if (session.gameStartedAt !== null) {
        writeOverlayFollowSession(session.gameStartedAt, true);
      }
    }
    const fallbackPosition = shownLevel.kind === "final"
      ? { x: 50, y: 50 }
      : DAILY_ISLAND_START;
    const openingPosition = newlyOpened || followTarget === "self"
      ? playerMapPosition ?? fallbackPosition
      : fallbackPosition;
    setCamera({
      x: -(openingPosition.x / 100 - 0.5) * planeSize * miniMapZoom,
      y: -(openingPosition.y / 100 - 0.5) * planeSize * miniMapZoom,
      scale: miniMapZoom,
    });
    setFrozenRaster(miniMapZoom);
  }, [followTarget, isMiniMap, miniMapOpenRevision, miniMapZoom, planeSize, playerMapPosition, session.gameStartedAt, setFollowTarget, shownLevel]);

  const toggleFollowSelf = () => {
    if (followTarget === "self") {
      setFollowTarget(null);
      if (isMiniMap && session.gameStartedAt !== null) {
        writeOverlayFollowSession(session.gameStartedAt, false);
      }
      return;
    }
    setFollowTarget("self");
    if (isMiniMap && session.gameStartedAt !== null) {
      writeOverlayFollowSession(session.gameStartedAt, true);
    }
    if (playerMapPosition) {
      focusPoint(playerMapPosition.x, playerMapPosition.y, Math.max(camera.scale, 3));
    }
  };

  const centerOnSelf = () => {
    if (!playerMapPosition || planeSize === 0) return;
    setCameraSmooth({
      ...camera,
      x: -(playerMapPosition.x / 100 - 0.5) * planeSize * camera.scale,
      y: -(playerMapPosition.y / 100 - 0.5) * planeSize * camera.scale,
    });
  };

  const followTeammate = (mate: LiveTeammate) => {
    setFollowTarget(mate.actorNr);
    if (isMiniMap && session.gameStartedAt !== null) {
      writeOverlayFollowSession(session.gameStartedAt, false);
    }
    if (shownLevel) {
      const projected = projectToMap(shownLevel.projection, mate.x, mate.z);
      focusPoint(projected.x, projected.y, Math.max(camera.scale, 3));
    }
  };

  // One place where the legend's selection leaves the component. Both callers
  // build the next set from the render's own state rather than inside a
  // setState updater, because writing the preference notifies every window and
  // that must not happen during a render pass.
  const applyCategories = (next: Set<MarkerCategory>): void => {
    setPreference("mapCategoryFilters", [...next]);
  };

  const toggleCategory = (category: MarkerCategory) => {
    const next = new Set(categories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    applyCategories(next);
  };

  const setRunLayer = (id: RunLayerId, enabled: boolean) => {
    setPreference(id === "trail" ? "showTrail" : "showDeaths", enabled);
  };

  const setCategoryGroup = (groupCategories: MarkerCategory[], enabled: boolean) => {
    const next = new Set(categories);
    groupCategories.forEach((category) => {
      if (enabled) next.add(category);
      else next.delete(category);
    });
    applyCategories(next);
  };

  const routeIconSize = isMiniMap ? 15 : 16;
  const routeControl = (
    <MapControlButton
      label={t(showTrail ? "map.trail.hide" : "map.trail.show")}
      onClick={() => setPreference("showTrail", !showTrail)}
      aria-pressed={showTrail}
      className={isMiniMap
        ? twMerge("overlay-map-control-button", showTrail && "overlay-map-control-active")
        : twMerge(DESKTOP_MAP_CONTROL_CLASS, showTrail && "text-accent")}
    >
      {showTrail ? <Eye size={routeIconSize} aria-hidden="true" /> : <EyeOff size={routeIconSize} aria-hidden="true" />}
    </MapControlButton>
  );
  const previousRoutesControl = !replayActive && (
    <MapControlButton
      label={t(showPreviousTrails ? "map.trail.hidePrevious" : "map.trail.showPrevious")}
      onClick={() => setPreference("showPreviousTrails", !showPreviousTrails)}
      aria-pressed={showPreviousTrails}
      disabled={!showTrail}
      className={isMiniMap ? "overlay-map-control-button" : DESKTOP_MAP_CONTROL_CLASS}
    >
      <History
        size={routeIconSize}
        color={showTrail && showPreviousTrails ? HISTORICAL_TRAIL_COLOR : undefined}
        aria-hidden="true"
      />
    </MapControlButton>
  );

  return (
    <section
      className="relative h-full w-full overflow-hidden bg-background"
      aria-label={t(replayActive ? "journal.replay.ariaLabel" : "map.ariaLabel")}
    >
      <div
        ref={viewportRef}
        data-map-viewport
        className={twMerge(
          "absolute inset-0 touch-none select-none overflow-hidden",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={onPointerDown}
      >
        <div
          className={twMerge(
            "absolute left-1/2 top-1/2",
            dragging && "will-change-transform",
            // While following, camera updates land at the poll cadence; the
            // linear transition bridges them so the view pans as smoothly as
            // the marker. A fly-to animation still takes precedence.
            followTarget !== null && "transition-transform duration-300 ease-linear",
            flying && "transition-transform",
          )}
          // Zoom is the plane's layout size rather than a scale transform: a
          // scaled layer is rasterised once at its old scale and stretched,
          // which is what smeared the artwork through every zoom. Sized this
          // way the browser rasterises the tiles at the size they are shown at.
          // Only a fly leaves a remainder in the transform, and it lands back
          // on 1 the moment the flight ends.
          style={{
            width: planeSize * rasterScale,
            height: planeSize * rasterScale,
            transform: `translate(calc(-50% + ${camera.x}px), calc(-50% + ${camera.y}px)) scale(${planeZoom})`,
            transitionDuration: flying ? `${FLY_DURATION_MS}ms` : undefined,
            transitionTimingFunction: flying
              ? planeZoom >= FLY_LEAP_RATIO ? FLY_EASE_LEAP : FLY_EASE_STEP
              : undefined,
          }}
        >
          <MapArtwork
            key={peakMap.level ? getMapSlug(peakMap.level.mapImage) : "none"}
            source={peakMap.level?.mapImage ?? null}
            mapSlug={peakMap.level ? getMapSlug(peakMap.level.mapImage) : null}
            showTiles={camera.scale >= TILE_MIN_ZOOM}
          />
          {(trailSegments.length > 0 || aoeZones.length > 0) && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {aoeZones.map((zone, index) => {
                const color = markerCategories.find((c) => c.id === zone.marker.category)?.color ?? "#fff";
                return (
                  <ellipse
                    key={`aoe-${index}`}
                    cx={zone.marker.x}
                    cy={zone.marker.y}
                    rx={zone.rx}
                    ry={zone.ry}
                    fill={color}
                    fillOpacity={0.12}
                    stroke={color}
                    strokeOpacity={0.4}
                    strokeWidth={0.2 / Math.max(camera.scale, 0.55)}
                  />
                );
              })}
              {trailSegments.map((segment, index) => {
                const points = segment.points.map((point) => `${point.x},${point.y}`).join(" ");
                const prominence = replayActive ? 1 : segment.current ? 0.92 : 0.76;
                const scale = Math.max(camera.scale, 0.55);
                const arrowSize = 0.52 / scale;
                return (
                  <g key={`trail-${index}`}>
                    <polyline
                      points={points}
                      fill="none"
                      stroke="var(--color-background)"
                      strokeOpacity={prominence * 0.82}
                      strokeWidth={1.18 / scale}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <polyline
                      points={points}
                      fill="none"
                      stroke={segment.current ? "var(--color-accent-bright)" : HISTORICAL_TRAIL_COLOR}
                      strokeOpacity={prominence}
                      strokeWidth={0.84 / scale}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {trailDirectionArrows(segment.points).map((arrow, arrowIndex) => {
                      const arrowPath = [
                        "M 0 0",
                        `L ${-arrowSize * 1.15} ${-arrowSize * 0.72}`,
                        `L ${-arrowSize * 0.82} 0`,
                        `L ${-arrowSize * 1.15} ${arrowSize * 0.72}`,
                        "Z",
                      ].join(" ");
                      const transform = `translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`;
                      return (
                        <path
                          key={arrowIndex}
                          data-trail-direction
                          transform={transform}
                          d={arrowPath}
                          fill="#000000"
                          stroke="var(--color-background)"
                          strokeWidth={0.16 / scale}
                          strokeLinejoin="round"
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          )}
          {/* Graves carry the same pin weight as the catalog markers so a death
              reads as a place on the island, but they sit under them in the
              stack: a grave is somewhere a run ended, not somewhere to
              navigate to, so an overlapping marker still takes the click. */}
          {deathPoints.map((point, index) => (
            <span
              key={index}
              role="img"
              tabIndex={0}
              aria-label={replayActive
                ? t("journal.replay.deathMarker", { count: point.attempt, value: unitsToMeters(point.elevation) })
                : t("map.live.deathAttempt", { count: point.attempt })}
              className="pointer-events-auto group absolute grid h-6 w-6 place-items-center rounded-[var(--radius-full)] border border-danger/70 bg-background/90 text-danger shadow-[0_4px_14px_rgba(0,0,0,.55)] outline-none focus-visible:ring-2 focus-visible:ring-danger/60"
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                transform: `translate(-50%, -50%) scale(${pinScale})`,
              }}
            >
              <Skull size={14} aria-hidden="true" />
              <span className="pointer-events-none invisible absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap border border-danger/40 bg-background/95 px-2 py-1 text-[9px] font-medium text-primary shadow-lg group-hover:visible group-focus-visible:visible">
                {replayActive
                  ? t("journal.replay.deathMarker", { count: point.attempt, value: unitsToMeters(point.elevation) })
                  : t("map.live.deathAttempt", { count: point.attempt })}
              </span>
            </span>
          ))}
          {replayCampfires.map((point, index) => {
            const category = markerCategories.find((item) => item.id === "campfire");
            if (!category) return null;
            return (
              <span
                key={point.id}
                role="img"
                tabIndex={0}
                aria-label={t("journal.replay.campfireMarker", { count: index + 1 })}
                className="pointer-events-auto group absolute z-20 grid h-7 w-7 place-items-center rounded-[var(--radius-full)] border border-accent/65 bg-background/92 text-accent-bright shadow-[0_5px_16px_rgba(0,0,0,.55)] outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                style={{
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  transform: `translate(-50%, -50%) scale(${pinScale})`,
                }}
              >
                <Flame size={15} aria-hidden="true" />
                <span className="pointer-events-none invisible absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap border border-accent/40 bg-background/95 px-2 py-1 text-[9px] font-medium text-primary shadow-lg group-hover:visible group-focus-visible:visible">
                  {t("journal.replay.campfireMarker", { count: index + 1 })}
                </span>
              </span>
            );
          })}
          {replayReachedLocations.map((point) => {
            const category = markerCategories.find((item) => item.id === point.category);
            if (!category) return null;
            const name = t(`map.markerNames.${point.name}`, { defaultValue: point.name });
            return (
              <span
                key={`${point.category}:${point.id}`}
                role="img"
                tabIndex={0}
                aria-label={t("journal.replay.reachedMarker", {
                  category: t(`map.categories.${point.category}`),
                  name,
                })}
                className="pointer-events-auto group absolute z-20 grid h-7 w-7 place-items-center rounded-[var(--radius-full)] border border-primary/35 bg-background/92 shadow-[0_5px_16px_rgba(0,0,0,.55)] outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                style={{
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  color: category.color,
                  transform: `translate(-50%, -50%) scale(${pinScale})`,
                }}
              >
                <MarkerGlyph category={category} />
                <span className="pointer-events-none invisible absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap border border-border bg-background/95 px-2 py-1 text-[9px] font-medium text-primary shadow-lg group-hover:visible group-focus-visible:visible">
                  {t("journal.replay.reachedMarker", {
                    category: t(`map.categories.${point.category}`),
                    name,
                  })}
                </span>
              </span>
            );
          })}
          {replayHighPoint && (
            <div
              className="pointer-events-none absolute z-40"
              style={{
                left: `${replayHighPoint.x}%`,
                top: `${replayHighPoint.y}%`,
                transform: `translate(-50%, -50%) scale(${pinScale})`,
              }}
            >
              <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-full)] border-2 border-accent bg-background text-accent-bright shadow-[0_0_0_4px_rgba(201,185,142,.14),0_8px_24px_rgba(0,0,0,.65)]">
                <Mountain size={16} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="absolute bottom-full left-1/2 mb-3 w-max max-w-[220px] -translate-x-1/2 rounded-[var(--radius-sm)] border border-accent/55 bg-surface-elevated px-3 py-2 text-center shadow-[0_12px_32px_rgba(0,0,0,.55)]">
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">{t("journal.replay.highestPoint")}</p>
                <p className="mt-1 text-[11px] font-medium text-primary">{t("journal.replay.highestPointHere", { value: unitsToMeters(replayHighPoint.elevation) })}</p>
              </div>
            </div>
          )}
          {visibleMarkerBounds && canvasMarkers.length > 0 && (
            <MapCanvasMarkers
              markers={canvasMarkers}
              categories={markerCategories}
              bounds={visibleMarkerBounds}
              extent={markerLayerExtent}
              scale={pinScale}
              onSelect={selectMarker}
            />
          )}
          <MapMarkerLayer
            groups={domMarkerGroups}
            categories={markerCategories}
            pinScale={pinScale}
            selectedMarkerId={selectedMarkerId}
            onSelect={selectMarker}
            onCluster={selectCluster}
          />
          {shownLevel
            && teammates.map((teammate) => {
              const projected = projectToMap(shownLevel.projection, teammate.x, teammate.z);
              return (
                <TeammatePin
                  // Remount on scene change so pins never slide across maps.
                  key={`${shownLevel.scene}-${teammate.actorNr}`}
                  teammate={teammate}
                  color={teammateColors.get(teammate.actorNr) ?? TEAM_COLORS[0]}
                  x={projected.x}
                  y={projected.y}
                  scale={pinScale}
                  onFollow={followTeammate}
                />
              );
            })}
          {playerMapPosition && playerPosition && (
            <div
              // Remount on scene change so the marker never slides across maps;
              // within a map the left/top transition glides it between samples.
              key={shownLevel?.scene ?? "live"}
              role="img"
              aria-label={t("map.live.you")}
              className="pointer-events-none absolute z-30 transition-[left,top] duration-300 ease-linear"
              style={{
                left: `${playerMapPosition.x}%`,
                top: `${playerMapPosition.y}%`,
                transform: `translate(-50%, -50%) scale(${pinScale})`,
              }}
            >
              <span
                className="absolute -inset-1.5 animate-ping rounded-[var(--radius-full)] border-2 border-accent/60"
                aria-hidden="true"
              />
              <span
                className={twMerge(
                  "grid h-7 w-7 place-items-center rounded-[var(--radius-full)] border-2 border-background bg-accent shadow-[0_5px_16px_rgba(0,0,0,.55)]",
                  (playerPosition.dead || playerPosition.passedOut) && "opacity-60 grayscale",
                )}
              >
                <Navigation2
                  size={15}
                  className="text-background transition-transform duration-300 ease-linear"
                  fill="currentColor"
                  style={{ transform: `rotate(${playerHeading}deg)` }}
                  aria-hidden="true"
                />
              </span>
            </div>
          )}
        </div>
      </div>

      {!isMiniMap && (
        <>
          {replayActive && expeditionReplay && (
            <div className="pointer-events-none absolute inset-x-5 top-5 z-50 flex justify-center">
              <p className="max-w-[720px] truncate rounded-[var(--radius-md)] border border-accent/45 bg-background/94 px-5 py-3 text-[12px] font-semibold text-primary shadow-[0_16px_48px_rgba(0,0,0,.55)] backdrop-blur-md">
                {t("journal.replay.viewing", { date: replayDate })}
              </p>
            </div>
          )}
          {/* Right rail: top-right features like countdown */}
          {!replayActive && <div className="pointer-events-none absolute right-5 top-5 z-30 flex items-start">
        <div className="pointer-events-auto flex items-center gap-4 border border-border-strong bg-background/92 py-3 px-4 shadow-[0_12px_40px_rgba(0,0,0,.45)] backdrop-blur-md">
          {peakMap.level ? (
            <>
              <p className="font-display text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-subtle">
                {t("map.today.reset")}
              </p>
              <p className="w-[68px] text-right font-display text-[12px] font-semibold leading-none tabular-nums text-accent">
                {formatDuration(peakMap.secondsUntilReset)}
              </p>
            </>
          ) : (
            <p className="font-display text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-subtle">
              {t(peakMap.error ? "map.today.unavailable" : "map.today.loading")}
            </p>
          )}
        </div>
      </div>}

      {/* Left rail: map-layer tabs crown the stack, the legend button and the
          island countdown share the row beneath, and whichever panel is open
          hangs off the same column. */}
      {!replayActive && <div className="pointer-events-none absolute bottom-5 left-5 top-5 z-30 flex w-[min(320px,calc(100%-80px))] flex-col items-stretch gap-2.5">
        {/* The legend toggle sits beside the layer tabs so the whole rail reads
            as a single row of controls. */}
        <div className="flex shrink-0 items-stretch gap-2.5">
          <button
            data-tour="filters-trigger"
            type="button"
            onClick={() => {
              if (filtersOpen) {
                setFiltersOpen(false);
                return;
              }
              closeDetails();
              setFiltersOpen(true);
            }}
            aria-pressed={filtersOpen}
            className={twMerge(
              "group pointer-events-auto relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center border bg-background/92 shadow-lg backdrop-blur-md transition-colors",
              filtersOpen
                ? "border-accent/60 text-accent"
                : "border-border-strong text-muted hover:border-accent/50 hover:text-accent",
            )}
            aria-label={t("map.actions.filters")}
            title={t("map.actions.filters")}
          >
            <span
              className={twMerge(
                "pointer-events-none absolute inset-[3px] border transition-colors",
                filtersOpen ? "border-accent/35" : "border-accent/15 group-hover:border-accent/35",
              )}
              aria-hidden="true"
            />
            <LegendGlyph />
          </button>
          {onRequestTrackingFolder && trackingSetupNeeded && (
            <button
              type="button"
              data-map-control
              onClick={onRequestTrackingFolder}
              className="group pointer-events-auto relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center border border-danger/60 bg-danger/10 text-danger shadow-lg backdrop-blur-md transition-colors hover:border-danger hover:bg-danger/15"
              aria-label={t("map.actions.openTrackingSetup")}
              title={t("map.actions.openTrackingSetup")}
            >
              <span
                className="pointer-events-none absolute inset-[3px] border border-danger/25 transition-colors group-hover:border-danger/45"
                aria-hidden="true"
              />
              <FolderSearch size={17} aria-hidden="true" />
            </button>
          )}
          <MapViewSelector
            view={mapView}
            hasFinalLevel={peakMap.hasFinalLevel}
            onChange={switchMapView}
          />
        </div>

        {filtersOpen && (
          <FilterPanel
            categories={categories}
            categoryDefinitions={markerCategories}
            filteredMarkers={visibleMarkers}
            markers={mapMarkers}
            runLayers={runLayers}
            onCategoryToggle={toggleCategory}
            onClose={() => setFiltersOpen(false)}
            onRunLayerToggle={setRunLayer}
            onSetCategories={(nextCategories) => applyCategories(new Set(nextCategories))}
            onSetGroup={setCategoryGroup}
          />
        )}

        {selectedMarker && (
          <MapDetailPanel
            marker={selectedMarker}
            categoryDefinitions={markerCategories}
            markers={mapMarkers}
            items={peakMap.items}
            lootPools={peakMap.lootPools}
            achievements={peakMap.achievements}
            guidebook={peakMap.guidebook}
            selectedItemId={selectedItemId}
            canGoBack={history.length > 0}
            onBack={goBack}
            onClose={closeDetails}
            onItemSelect={setSelectedItemId}
            onNavigateMarker={(marker) => {
              if (marker.id === selectedMarker.id) {
                setSelectedItemId(null);
                focusPoint(marker.x, marker.y, DETAIL_ZOOM, true);
                return;
              }
              selectMarker(marker, true);
            }}
          />
        )}
      </div>}

      {liveActive && (
        <aside className="absolute bottom-5 left-5 z-20 w-[284px] border border-border-strong bg-background/90 p-3 shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-[var(--radius-full)] bg-danger" aria-hidden="true" />
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-subtle">{t("map.live.title")}</p>
          </div>
          <p className="mt-1.5 whitespace-nowrap text-[12px] font-semibold">
            {shownRouteBiomeKeys.length > 0
              ? shownRouteBiomeKeys.map((key, index) => (
                  <Fragment key={`${key}-${index}`}>
                    {index > 0 && <span className="text-subtle"> · </span>}
                    <span
                      className={twMerge(
                        "transition-colors",
                        key === liveBiomeKey ? "text-primary" : "text-muted",
                      )}
                      aria-current={key === liveBiomeKey ? "location" : undefined}
                    >
                      {t(`map.live.segments.${key}`)}
                    </span>
                  </Fragment>
                ))
              : <span className="text-primary">{shownRouteTitle}</span>}
          </p>
          <p className="mt-1.5 text-[11px] tabular-nums text-muted">
            {t("map.live.deathCount", { count: deathCount })}
          </p>
          {playerPosition && !playerInLimbo ? (
            <p className="mt-1 text-[11px] tabular-nums text-subtle">
              {t("map.live.elevation", { value: unitsToMeters(playerPosition.y) })}
            </p>
          ) : null}
          {downedTeammates.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {downedTeammates.map((mate) => (
                <button
                  key={mate.actorNr}
                  type="button"
                  onClick={() => followTeammate(mate)}
                  className="flex cursor-pointer items-center gap-1.5 border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:border-danger"
                >
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-[var(--radius-full)] bg-danger"
                    aria-hidden="true"
                  />
                  {t("map.live.downed", { name: mate.name })}
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
      </>
      )}

      {showTrackingRestart && (
        <div className="pointer-events-none absolute inset-x-4 bottom-5 z-30 flex justify-center">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-md border border-border-strong bg-surface-elevated px-3 py-1.5 shadow-lg">
            <RotateCcw size={15} className="shrink-0 text-muted" aria-hidden="true" />
            <p role="status" className="text-xs font-medium text-primary">{t("map.live.trackingRestart")}</p>
            <button
              type="button"
              aria-label={t("map.live.dismissTrackingRestart")}
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded text-muted hover:bg-background hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-current"
              onClick={() => {
                setDismissedTrackingRestart(trackingRestartGameId);
                try { localStorage.setItem(DISMISSED_TRACKING_RESTART_KEY, trackingRestartGameId); }
                catch { /* Keep the notice dismissed in the current view. */ }
              }}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {isMiniMap && (
        <div className="overlay-minimap-controls">
          {playerMapPosition && (
            <>
              <MapControlButton
                label={t("map.live.center")}
                onClick={centerOnSelf}
                className="overlay-map-control-button"
              >
                <LocateFixed size={15} aria-hidden="true" />
              </MapControlButton>
              <MapControlButton
                label={t(followTarget === "self" ? "map.live.unfollow" : "map.live.follow")}
                onClick={toggleFollowSelf}
                aria-pressed={followTarget === "self"}
                className={twMerge(
                  "overlay-map-control-button",
                  followTarget === "self" && "overlay-map-control-active",
                )}
              >
                <Navigation
                  size={15}
                  fill={followTarget === "self" ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </MapControlButton>
            </>
          )}
          {routeControl}
          {previousRoutesControl}
        </div>
      )}

      {isMiniMap && (
        <div className="overlay-minimap-zoom-controls" data-map-control>
          <div className="overlay-minimap-zoom-buttons">
            <MapControlButton
              label={t("map.actions.zoomIn")}
              onClick={() => adjustZoom(1)}
              className="overlay-map-control-button"
              disabled={camera.scale >= MAX_ZOOM}
            >
              <Plus size={15} aria-hidden="true" />
            </MapControlButton>
            <MapControlButton
              label={t("map.actions.zoomOut")}
              onClick={() => adjustZoom(-1)}
              className="overlay-map-control-button"
              disabled={camera.scale <= MIN_ZOOM}
            >
              <Minus size={15} aria-hidden="true" />
            </MapControlButton>
          </div>
          <output
            className="overlay-minimap-zoom-readout"
            aria-label={t("map.actions.zoomLevel", { value: miniMapZoomPercentage })}
            title={t("map.actions.zoomLevel", { value: miniMapZoomPercentage })}
            aria-live="polite"
          >
            {miniMapZoomPercentage}%
          </output>
        </div>
      )}

      {!isMiniMap && (
        <div className="absolute bottom-5 right-5 z-20 flex flex-col border border-border-strong bg-background/90 shadow-lg backdrop-blur-md">
          {routeControl}
          <div className="h-px bg-border" />
          {previousRoutesControl && (
            <>
              {previousRoutesControl}
              <div className="h-px bg-border" />
            </>
          )}
          {playerMapPosition && (
            <>
              <MapControlButton
                label={t(followTarget === "self" ? "map.live.unfollow" : "map.live.follow")}
                onClick={toggleFollowSelf}
                aria-pressed={followTarget === "self"}
                className={twMerge(DESKTOP_MAP_CONTROL_CLASS, followTarget === "self" && "text-accent")}
              >
                <LocateFixed size={16} aria-hidden="true" />
              </MapControlButton>
              <div className="h-px bg-border" />
            </>
          )}
          <MapControlButton label={t("map.actions.zoomIn")} onClick={() => adjustZoom(1)} className={DESKTOP_MAP_CONTROL_CLASS}>
            <Plus size={16} aria-hidden="true" />
          </MapControlButton>
          <div className="h-px bg-border" />
          <MapControlButton label={t("map.actions.zoomOut")} onClick={() => adjustZoom(-1)} className={DESKTOP_MAP_CONTROL_CLASS}>
            <Minus size={16} aria-hidden="true" />
          </MapControlButton>
          <div className="h-px bg-border" />
          <MapControlButton label={t("map.actions.resetView")} onClick={resetView} className={DESKTOP_MAP_CONTROL_CLASS}>
            <Focus size={15} aria-hidden="true" />
          </MapControlButton>
          <div className="h-px bg-border" />
          <span className="grid h-7 w-9 place-items-center text-[9px] tabular-nums text-subtle">
            {Math.round(camera.scale * 100)}%
          </span>
        </div>
      )}

      {!isMiniMap && session.isGameRunning && (
        <div className="pointer-events-none absolute right-5 top-5 z-20 flex items-center gap-1.5 border border-border bg-background/80 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-subtle backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-[var(--radius-full)] bg-accent" />
          {session.integrationStatus === "degraded"
            ? t("map.live.degraded")
            : session.matchActive || liveOnShownMap
            ? t("map.live.expedition", { deaths: deathCount })
            : t(`map.live.scenes.${session.scene ?? "unknown"}`)}
        </div>
      )}
    </section>
  );
};

export default MapScreen;
