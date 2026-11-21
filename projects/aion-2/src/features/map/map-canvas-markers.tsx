import { getLocalizedMapPointDisplayName } from "./map-point-display-name";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { cn } from "../../lib/cn";
import type { ProjectedMapPoint } from "./map-clustering";
import { getPointAppearance, getPointTooltipOffsetY } from "./map-config";
import { createMapMarkerHitIndex } from "./map-marker-hit-index";
import {
  createMarkerSprites, getMarkerSpriteKey, getMarkerTemplateKey, MARKER_SPRITE_SIZE,
  type MarkerSpriteDefinition,
} from "./map-marker-sprites";
import MapPointMarker from "./map-point-marker";
import MapMarkerTooltip from "./map-marker-tooltip";
import { paintMapMarkerFoundBadge } from "./map-marker-found-badge-paint";
import { getMapMarkerIconSize } from "./map-marker-icon-size";
import { markerAlphaAt, type MarkerAlphaMask } from "./map-marker-alpha";
import { getMarkerScale, type MarkerSizeSettings } from "./marker-size-settings";
import type { MapScreenPoint } from "./map-projection";
import type { MapPoint } from "./types";
import type { ScheduledEvent } from "../events/event-schedule";
import { activeMapEventStatus } from "../events/active-map-events";

interface MapCanvasMarkersProps {
  zoomScale: number;
  markerSizes: MarkerSizeSettings;
  points: MapPoint[];
  completedIds: ReadonlySet<string>;
  activeEventMarkers: ReadonlyMap<string, ScheduledEvent[]>;
  hideTooltip: boolean;
  projections: ProjectedMapPoint[];
  origin: MapScreenPoint;
  width: number;
  height: number;
  margin: number;
  onSelect: (point: MapPoint) => void;
  onToggleCompleted: (point: MapPoint) => void;
}

const readPixelRatio = () => Math.min(2, window.devicePixelRatio || 1);

/** Dense pins share one raster surface. Only the inspected pin gets a DOM
 * preview; pointer picking and keyboard browsing use the same visible list. */
const MapCanvasMarkers = ({ points, completedIds, activeEventMarkers, hideTooltip, projections, origin, width, height, margin, markerSizes, zoomScale, onSelect, onToggleCompleted }: MapCanvasMarkersProps) => {
  const { t } = useTranslation();
  const gameText = useGameText();
  const hintId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const spritesRef = useRef(new Map<string, HTMLCanvasElement>());
  const masksRef = useRef(new Map<string, MarkerAlphaMask>());
  const paintRef = useRef<() => void>(() => {});
  const frameRef = useRef<number | null>(null);
  const pressedRef = useRef<ProjectedMapPoint | null>(null);
  const [pixelRatio, setPixelRatio] = useState(readPixelRatio);
  const [hover, setHover] = useState<{ id: string; projections: ProjectedMapPoint[] } | null>(null);
  const [keyboardId, setKeyboardId] = useState<string | null>(null);
  const left = -origin.left - margin;
  const top = -origin.top - margin;
  const canvasWidth = Math.max(1, width + margin * 2);
  const canvasHeight = Math.max(1, height + margin * 2);

  const { definitions, templates, pointSprites, pointPriorities } = useMemo(() => {
    const definitions = new Map<string, MarkerSpriteDefinition>();
    const templates = new Map<string, MarkerSpriteDefinition>();
    const pointSprites = new Map<string, string>();
    const pointPriorities = new Map<string, number>();
    for (const point of points) {
      const appearance = getPointAppearance(point);
      const key = getMarkerSpriteKey(appearance);
      const templateKey = getMarkerTemplateKey(appearance);
      // Zoom can enlarge pins to 150%; prepare native art at that resolution
      // so the normal canvas marker stays as sharp as its DOM hover preview.
      const renderScale = Math.max(1, getMarkerScale(point, markerSizes) * 1.5);
      const definition = definitions.get(key);
      if (definition) definition.renderScale = Math.max(definition.renderScale, renderScale);
      else definitions.set(key, { key, templateKey, appearance, renderScale });
      if (!templates.has(templateKey)) templates.set(templateKey, { key, templateKey, appearance, renderScale });
      pointSprites.set(point.id, key);
      pointPriorities.set(point.id, appearance.markerPriority);
    }
    return { definitions: [...definitions.values()], templates: [...templates.values()], pointSprites, pointPriorities };
  }, [points, markerSizes]);
  const pointRadii = useMemo(() => new Map(points.map((point) => [point.id,
    (getPointAppearance(point).markerSize ?? 32) * getMarkerScale(point, markerSizes) * zoomScale / 2])), [points, markerSizes, zoomScale]);
  const spriteSizes = useMemo(() => new Map(points.map((point) => [point.id,
    MARKER_SPRITE_SIZE * getMarkerScale(point, markerSizes) * zoomScale])), [points, markerSizes, zoomScale]);
  const orderedProjections = useMemo(() => {
    const layers = new Map<number, ProjectedMapPoint[]>();
    for (const entry of projections) {
      const priority = pointPriorities.get(entry.point.id)!;
      const layer = layers.get(priority) ?? [];
      layer.push(entry);
      layers.set(priority, layer);
    }
    return [...layers.keys()].sort((a, b) => a - b).flatMap((priority) => layers.get(priority)!);
  }, [pointPriorities, projections]);
  const pick = useMemo(() => createMapMarkerHitIndex(orderedProjections,
    ({ point }) => spriteSizes.get(point.id)! / 2), [orderedProjections, spriteSizes]);
  const byId = useMemo(() => new Map(projections.map((entry) => [entry.point.id, entry])), [projections]);
  const keyboardPoints = useMemo(() => projections.filter(({ left, top }) =>
    left + origin.left >= 0 && left + origin.left <= width
    && top + origin.top >= 0 && top + origin.top <= height), [height, origin.left, origin.top, projections, width]);
  const hoveredId = hover?.projections === projections ? hover.id : null;
  const inspected = hoveredId ? byId.get(hoveredId)
    : keyboardId ? keyboardPoints.find(({ point }) => point.id === keyboardId) : undefined;
  const pointLabel = inspected
    ? "occurrences" in inspected.point && inspected.point.occurrences && inspected.point.occurrences > 1
      ? t("map.nearbyLocationCount", { name: getLocalizedMapPointDisplayName(inspected.point, gameText), count: inspected.point.occurrences })
      : getLocalizedMapPointDisplayName(inspected.point, gameText)
    : t("map.filters.categories");
  const activeEvents = inspected ? activeEventMarkers.get(inspected.point.id) : undefined;
  const label = activeEvents?.length
    ? `${pointLabel} · ${activeMapEventStatus(activeEvents, gameText, t)}`
    : pointLabel;

  const requestPaint = useCallback(() => {
    frameRef.current ??= window.requestAnimationFrame(() => {
      frameRef.current = null;
      paintRef.current();
    });
  }, []);

  useEffect(() => {
    const updateRatio = () => setPixelRatio(readPixelRatio());
    window.addEventListener("resize", updateRatio);
    return () => window.removeEventListener("resize", updateRatio);
  }, []);

  useLayoutEffect(() => {
    const registry = createMarkerSprites(templatesRef.current!, definitions, pixelRatio, requestPaint);
    spritesRef.current = registry.sprites;
    masksRef.current = registry.masks;
    requestPaint();
    return registry.dispose;
  }, [definitions, pixelRatio, requestPaint]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the map marker canvas.");
    const pixelWidth = Math.ceil(canvasWidth * pixelRatio);
    const pixelHeight = Math.ceil(canvasHeight * pixelRatio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    paintRef.current = () => {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      for (const entry of orderedProjections) {
        const sprite = spritesRef.current.get(pointSprites.get(entry.point.id)!);
        if (!sprite) continue;
        const spriteSize = MARKER_SPRITE_SIZE * getMarkerScale(entry.point, markerSizes) * zoomScale;
        context.drawImage(sprite,
          entry.left - left - spriteSize / 2,
          entry.top - top - spriteSize / 2,
          spriteSize, spriteSize);
      }
      for (const entry of orderedProjections) {
        if (completedIds.has(entry.point.id)) paintMapMarkerFoundBadge(context,
          entry.left - left, entry.top - top, pointRadii.get(entry.point.id)! * 2);
      }
    };
    // A camera rebase must replace the pixels before the shared transform resets.
    paintRef.current();
  }, [canvasHeight, canvasWidth, completedIds, left, markerSizes, orderedProjections, pixelRatio, pointRadii, pointSprites, top, zoomScale]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const pickAtClient = (clientX: number, clientY: number) => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return pick(clientX - bounds.left + left, clientY - bounds.top + top, ({ point }, dx, dy) => {
      const mask = masksRef.current.get(pointSprites.get(point.id)!);
      if (!mask) return false;
      const size = spriteSizes.get(point.id)!;
      return markerAlphaAt(mask, (dx / size + 0.5) * mask.width, (dy / size + 0.5) * mask.height);
    });
  };
  const inspect = (point: ProjectedMapPoint | null) => setHover((current) => {
    if (!point) return null;
    if (current?.id === point.point.id && current.projections === projections) return current;
    return { id: point.point.id, projections };
  });

  return (
    <>
      <div ref={templatesRef} className="pointer-events-none invisible absolute h-0 w-0 overflow-hidden" aria-hidden="true">
        {templates.map(({ templateKey, appearance }) => {
          const Icon = appearance.icon;
          return (
            <span key={templateKey} data-marker-template={templateKey}
              style={appearance.markerSize ? { width: appearance.markerSize, height: appearance.markerSize } : undefined}
              className={cn("map-marker", appearance.markerClass, appearance.itemArt && "map-item-art")}>
              <Icon size={getMapMarkerIconSize(appearance.markerSize ?? 32, appearance.itemArt)} strokeWidth={2.4} />
              <img className="map-native-icon" alt="" />
            </span>
          );
        })}
      </div>
      <span id={hintId} className="sr-only">{t("map.markerKeyboardHint")}</span>
      <canvas
        ref={canvasRef}
        className="pointer-events-auto absolute z-[1] outline-none"
        style={{ left, top, width: canvasWidth, height: canvasHeight, cursor: hoveredId ? "pointer" : undefined }}
        data-map-marker-canvas
        data-marker-count={projections.length}
        role="button"
        tabIndex={keyboardPoints.length ? 0 : -1}
        aria-label={label}
        aria-describedby={hintId}
        onPointerMove={(event) => {
          if (event.buttons !== 0) { inspect(null); return; }
          inspect(pickAtClient(event.clientX, event.clientY));
        }}
        onPointerLeave={() => inspect(null)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const point = pickAtClient(event.clientX, event.clientY);
          pressedRef.current = point;
          setKeyboardId(null);
          // The map's existing gesture handler distinguishes a pin from empty
          // space using this attribute, so blank clicks still clear/place pins.
          if (point) {
            event.currentTarget.dataset.mapMarkerControl = "";
            event.currentTarget.setPointerCapture(event.pointerId);
          } else delete event.currentTarget.dataset.mapMarkerControl;
          inspect(point);
        }}
        onPointerCancel={() => { pressedRef.current = null; inspect(null); }}
        onClick={(event) => {
          const pressed = pressedRef.current;
          pressedRef.current = null;
          if (!pressed || !byId.has(pressed.point.id)) return;
          event.stopPropagation();
          onSelect(pressed.point);
        }}
        onContextMenu={(event) => {
          const point = pickAtClient(event.clientX, event.clientY);
          if (!point || point.point.subtype === "coordinate") return;
          event.preventDefault();
          event.stopPropagation();
          onToggleCompleted(point.point);
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            setKeyboardId((id) => id && byId.has(id) ? id : keyboardPoints[0]?.point.id ?? null);
          }
        }}
        onBlur={() => setKeyboardId(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            if (inspected) { event.preventDefault(); event.stopPropagation(); onSelect(inspected.point); }
            return;
          }
          if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const count = keyboardPoints.length;
          if (!count) return;
          const current = keyboardPoints.findIndex(({ point }) => point.id === keyboardId);
          const backwards = ["ArrowLeft", "ArrowUp"].includes(event.key);
          const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1
            : current < 0 ? (backwards ? count - 1 : 0) : (current + (backwards ? -1 : 1) + count) % count;
          inspect(null);
          setKeyboardId(keyboardPoints[next]!.point.id);
        }}
      />
      {inspected && (
        <MapPointMarker point={inspected.point} label={label} left={inspected.left} top={inspected.top}
          selected={false} found={completedIds.has(inspected.point.id)}
          markerScale={getMarkerScale(inspected.point, markerSizes) * zoomScale} preview onSelect={onSelect} />
      )}
      {inspected && !hideTooltip && (
        <MapMarkerTooltip label={label} left={inspected.left} top={inspected.top}
          markerSize={pointRadii.get(inspected.point.id)! * 2}
          offsetY={getPointTooltipOffsetY(inspected.point)} />
      )}
    </>
  );
};

export default memo(MapCanvasMarkers);
