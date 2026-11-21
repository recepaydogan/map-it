import { getMapPointDisplayName, getMapPointTooltipLabel } from "./map-point-display-name";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import type { ProjectedMapPoint } from "./map-clustering";
import { getPointAppearance } from "./map-config";
import { createMapMarkerHitIndex } from "./map-marker-hit-index";
import {
  createMarkerSprites, drawMarkerSprite, getMarkerSpriteKey, getMarkerTemplateKey, MARKER_SPRITE_SIZE,
  type MarkerArtwork, type MarkerSpriteDefinition,
} from "./map-marker-sprites";
import MapPointMarker from "./map-point-marker";
import { isQuestPoint } from "./map-faction-filter";
import { getMapPointMarkerScale, type MarkerSizeSettings } from "./marker-size-settings";
import type { MapScreenPoint } from "./map-projection";
import type { MapPoint } from "./types";

interface MapCanvasMarkersProps {
  zoomScale: number;
  points: MapPoint[];
  projections: ProjectedMapPoint[];
  completedPointIds: Set<string>;
  origin: MapScreenPoint;
  width: number;
  height: number;
  margin: number;
  priority: number;
  markerSizes: MarkerSizeSettings;
  onSelect: (point: MapPoint) => void;
}

const readPixelRatio = () => Math.max(1, window.devicePixelRatio || 1);

/** Dense pins share one raster surface. Only the inspected pin gets a DOM
 * preview; pointer picking and keyboard browsing use the same visible list. */
const MapCanvasMarkers = ({ points, projections, completedPointIds, origin, width, height, margin, priority, markerSizes, zoomScale, onSelect }: MapCanvasMarkersProps) => {
  const { t } = useTranslation();
  const hintId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const spritesRef = useRef(new Map<string, HTMLCanvasElement>());
  const artworkRef = useRef(new Map<string, MarkerArtwork>());
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

  const { definitions, templates, pointSprites } = useMemo(() => {
    const definitions = new Map<string, MarkerSpriteDefinition>();
    const templates = new Map<string, MarkerSpriteDefinition>();
    const pointSprites = new Map<string, string>();
    for (const point of points) {
      const appearance = getPointAppearance(point);
      const key = getMarkerSpriteKey(appearance);
      const templateKey = getMarkerTemplateKey(appearance);
      if (!definitions.has(key)) definitions.set(key, { key, templateKey, appearance });
      if (!templates.has(templateKey)) templates.set(templateKey, { key, templateKey, appearance });
      pointSprites.set(point.id, key);
    }
    return { definitions: [...definitions.values()], templates: [...templates.values()], pointSprites };
  }, [points]);
  const pick = useMemo(() => createMapMarkerHitIndex(projections, markerSizes, zoomScale), [projections, markerSizes, zoomScale]);
  const byId = useMemo(() => new Map(projections.map((entry) => [entry.point.id, entry])), [projections]);
  const keyboardPoints = useMemo(() => projections.filter(({ left, top }) =>
    left + origin.left >= 0 && left + origin.left <= width
    && top + origin.top >= 0 && top + origin.top <= height), [height, origin.left, origin.top, projections, width]);
  const hoveredId = hover?.projections === projections ? hover.id : null;
  const inspected = hoveredId ? byId.get(hoveredId)
    : keyboardId ? keyboardPoints.find(({ point }) => point.id === keyboardId) : undefined;
  const label = inspected
    ? "occurrences" in inspected.point && inspected.point.occurrences && inspected.point.occurrences > 1
      ? t("map.nearbyLocationCount", { name: getMapPointDisplayName(inspected.point), count: inspected.point.occurrences })
      : getMapPointDisplayName(inspected.point)
    : t("map.filters.categories");

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
    artworkRef.current = registry.artwork;
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
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      for (const entry of projections) {
        const key = pointSprites.get(entry.point.id)!;
        const sprite = spritesRef.current.get(key);
        if (!sprite) continue;
        const spriteSize = (isQuestPoint(entry.point) ? MARKER_SPRITE_SIZE * 0.75
          : entry.point.category === "point-of-interest" ? MARKER_SPRITE_SIZE * 0.75
          : MARKER_SPRITE_SIZE) * getMapPointMarkerScale(entry.point, markerSizes) * zoomScale;
        drawMarkerSprite(context, sprite, artworkRef.current.get(key),
          entry.left - left - spriteSize / 2,
          entry.top - top - spriteSize / 2,
          spriteSize);
        if (completedPointIds.has(entry.point.id)) {
          const badgeOffset = spriteSize / 3;
          const badgeX = entry.left - left + badgeOffset;
          const badgeY = entry.top - top + badgeOffset;
          const badgeRadius = spriteSize / 6;
          context.beginPath();
          context.arc(badgeX, badgeY, badgeRadius + 2, 0, Math.PI * 2);
          context.fillStyle = "#0b0b0e";
          context.fill();
          context.beginPath();
          context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
          context.fillStyle = "#34d399";
          context.fill();
          context.beginPath();
          context.moveTo(badgeX - badgeRadius / 2, badgeY);
          context.lineTo(badgeX - badgeRadius / 6, badgeY + badgeRadius / 3);
          context.lineTo(badgeX + badgeRadius / 2, badgeY - badgeRadius / 3);
          context.strokeStyle = "#0b0b0e";
          context.lineWidth = Math.max(1, badgeRadius / 3);
          context.lineCap = "round";
          context.lineJoin = "round";
          context.stroke();
        }
      }
    };
    // A camera rebase must replace the pixels before the shared transform resets.
    paintRef.current();
  }, [canvasHeight, canvasWidth, completedPointIds, left, markerSizes, pixelRatio, pointSprites, projections, top, zoomScale]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const pickAtClient = (clientX: number, clientY: number) => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return pick(clientX - bounds.left + left, clientY - bounds.top + top);
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
              className={cn("map-marker", appearance.markerClass, appearance.itemArt && "map-item-art")}>
              <Icon size={appearance.itemArt ? 22 : 18} strokeWidth={2.4} />
              <img className="map-native-icon" alt="" />
            </span>
          );
        })}
      </div>
      <span id={hintId} className="sr-only">{t("map.markerKeyboardHint")}</span>
      <canvas
        ref={canvasRef}
        className="pointer-events-auto absolute outline-none"
        style={{ left, top, width: canvasWidth, height: canvasHeight, zIndex: priority,
          cursor: hoveredId ? "pointer" : undefined }}
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
        <MapPointMarker point={inspected.point} label={label}
          tooltipLabel={getMapPointTooltipLabel(inspected.point, label, t)}
          left={inspected.left} top={inspected.top}
          selected={false} completed={completedPointIds.has(inspected.point.id)}
          markerScale={getMapPointMarkerScale(inspected.point, markerSizes) * zoomScale} preview onSelect={onSelect} />
      )}
    </>
  );
};

export default memo(MapCanvasMarkers);
