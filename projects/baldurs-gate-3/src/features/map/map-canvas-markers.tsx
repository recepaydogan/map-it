import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { getMapPointInstanceId } from "./map-atlas-projection";
import type { ProjectedMapPoint } from "./map-clustering";
import { getPointAppearance } from "./map-config";
import { createMapMarkerHitIndex } from "./map-marker-hit-index";
import { createMarkerSprites, getMarkerSpriteKey, getMarkerTemplateKey, MARKER_SPRITE_SIZE,
  type MarkerSpriteDefinition } from "./map-marker-sprites";
import MapPointMarker from "./map-point-marker";
import type { MapScreenPoint } from "./map-projection";
import { getMapItemVisual, type MapItemVisual } from "./use-map-item-visuals";
import type { MapPoint } from "./types";

interface MapCanvasMarkersProps {
  points: MapPoint[];
  projections: ProjectedMapPoint[];
  itemVisuals: ReadonlyMap<string, MapItemVisual>;
  origin: MapScreenPoint;
  width: number;
  height: number;
  margin: number;
  compact: boolean;
  onSelect: (point: MapPoint) => void;
}

const readPixelRatio = () => Math.min(2, window.devicePixelRatio || 1);

/** Dense pins share a raster surface; only the inspected pin needs DOM artwork. */
const MapCanvasMarkers = ({ points, projections, itemVisuals, origin, width, height, margin, compact, onSelect }: MapCanvasMarkersProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const registryRef = useRef<ReturnType<typeof createMarkerSprites> | null>(null);
  const paintRef = useRef<() => void>(() => {});
  const frameRef = useRef<number | null>(null);
  const pressedRef = useRef<ProjectedMapPoint | null>(null);
  const [pixelRatio, setPixelRatio] = useState(readPixelRatio);
  const [hover, setHover] = useState<{ entry: ProjectedMapPoint; projections: ProjectedMapPoint[] } | null>(null);
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
      const candidate = getMapItemVisual(itemVisuals, "contentId" in point ? point.contentId : undefined)?.sprite;
      const sprite = candidate && candidate.u2 > candidate.u1 && candidate.v2 > candidate.v1 ? candidate : undefined;
      const strokeWidth = point.category === "secret" ? 1.8 : 2.4;
      const templateKey = getMarkerTemplateKey(appearance, strokeWidth);
      const key = getMarkerSpriteKey(templateKey, appearance.nativeIconPath, sprite);
      const definition = { key, templateKey, appearance, sprite, strokeWidth };
      if (!definitions.has(key)) definitions.set(key, definition);
      if (!templates.has(templateKey)) templates.set(templateKey, definition);
      pointSprites.set(getMapPointInstanceId(point), key);
    }
    return { definitions: [...definitions.values()], templates: [...templates.values()], pointSprites };
  }, [itemVisuals, points]);
  const pick = useMemo(() => createMapMarkerHitIndex(projections, compact ? 13.5 : 16), [compact, projections]);
  const byId = useMemo(() => new Map(projections.map((entry) => [getMapPointInstanceId(entry.point), entry])), [projections]);
  const keyboardPoints = useMemo(() => projections.filter(({ left, top }) =>
    left + origin.left >= 0 && left + origin.left <= width
    && top + origin.top >= 0 && top + origin.top <= height), [height, origin.left, origin.top, projections, width]);
  const hovered = hover?.projections === projections ? hover.entry : undefined;
  const inspected = hovered ?? (keyboardId ? byId.get(keyboardId) : undefined);
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
    const registry = createMarkerSprites(templatesRef.current!, pixelRatio, requestPaint);
    registryRef.current = registry;
    return () => {
      registry.dispose();
      registryRef.current = null;
      // Keep cancellation with the registry's layout lifecycle. A later passive
      // cleanup could otherwise cancel the replacement registry's first paint.
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [compact, pixelRatio, requestPaint]);

  useLayoutEffect(() => {
    registryRef.current!.update(definitions);
    requestPaint();
  }, [compact, definitions, pixelRatio, requestPaint]);

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
      for (const entry of projections) {
        const sprite = registryRef.current?.sprites.get(pointSprites.get(getMapPointInstanceId(entry.point))!);
        if (sprite) context.drawImage(sprite, entry.left - left - MARKER_SPRITE_SIZE / 2,
          entry.top - top - MARKER_SPRITE_SIZE / 2, MARKER_SPRITE_SIZE, MARKER_SPRITE_SIZE);
      }
    };
    // Replace pixels before the shared camera transform resets on a rebase.
    paintRef.current();
  }, [canvasHeight, canvasWidth, compact, left, pixelRatio, pointSprites, projections, top]);

  const pickAtClient = (clientX: number, clientY: number) => {
    const bounds = canvasRef.current!.getBoundingClientRect();
    return pick((clientX - bounds.left) * canvasWidth / bounds.width + left,
      (clientY - bounds.top) * canvasHeight / bounds.height + top);
  };
  const inspect = (entry: ProjectedMapPoint | null) => setHover((current) => {
    if (!entry) return null;
    return current?.entry === entry && current.projections === projections ? current : { entry, projections };
  });

  return <>
    <div ref={templatesRef} className="pointer-events-none invisible absolute h-0 w-0 overflow-hidden" aria-hidden="true">
      {templates.map(({ templateKey, appearance, strokeWidth }) => {
        const Icon = appearance.icon;
        return <span key={templateKey} data-marker-template={templateKey} className={cn("map-marker", appearance.markerClass)}>
          <Icon size={18} strokeWidth={strokeWidth} />
        </span>;
      })}
    </div>
    <canvas ref={canvasRef} className="map-marker-canvas pointer-events-auto absolute outline-none"
      style={{ left, top, width: canvasWidth, height: canvasHeight, zIndex: 1, cursor: hovered ? "pointer" : undefined }}
      data-map-marker-canvas data-marker-count={projections.length} role="button"
      tabIndex={keyboardPoints.length ? 0 : -1}
      aria-label={inspected?.point.name ?? t("map.filters.categories")}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Space"
      onPointerMove={(event) => { inspect(event.buttons === 0 ? pickAtClient(event.clientX, event.clientY) : null); }}
      onPointerLeave={() => inspect(null)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const entry = pickAtClient(event.clientX, event.clientY);
        pressedRef.current = entry;
        setKeyboardId(null);
        if (entry) {
          event.currentTarget.dataset.mapMarkerControl = "";
          event.currentTarget.setPointerCapture(event.pointerId);
        } else delete event.currentTarget.dataset.mapMarkerControl;
        inspect(entry);
      }}
      onPointerCancel={() => { pressedRef.current = null; inspect(null); }}
      onClick={(event) => {
        const pressed = pressedRef.current;
        pressedRef.current = null;
        if (!pressed || !byId.has(getMapPointInstanceId(pressed.point))) return;
        event.stopPropagation();
        onSelect(pressed.point);
      }}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) {
          setKeyboardId((id) => id && byId.has(id) ? id : keyboardPoints[0] ? getMapPointInstanceId(keyboardPoints[0].point) : null);
        }
      }}
      onBlur={() => setKeyboardId(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          if (inspected) { event.preventDefault(); event.stopPropagation(); onSelect(inspected.point); }
          return;
        }
        if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const count = keyboardPoints.length;
        if (!count) return;
        const current = keyboardPoints.findIndex(({ point }) => getMapPointInstanceId(point) === keyboardId);
        const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
        const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1
          : current < 0 ? (backwards ? count - 1 : 0) : (current + (backwards ? -1 : 1) + count) % count;
        inspect(null);
        setKeyboardId(getMapPointInstanceId(keyboardPoints[next]!.point));
      }} />
    {inspected && <MapPointMarker point={inspected.point} left={inspected.left} top={inspected.top}
      sprite={getMapItemVisual(itemVisuals, "contentId" in inspected.point ? inspected.point.contentId : undefined)?.sprite}
      preview onSelect={onSelect} />}
  </>;
};

export default memo(MapCanvasMarkers);
