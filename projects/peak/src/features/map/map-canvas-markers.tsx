import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkerCategoryIcon } from "./marker-category-icon";
import type { MapMarker, MarkerCategory, MarkerCategoryDefinition } from "./map-data";

const MARKER_RADIUS = 14;
const SPRITE_SIZE = 48;

interface MapCanvasMarkersProps {
  markers: MapMarker[];
  categories: MarkerCategoryDefinition[];
  bounds: { left: number; right: number; top: number; bottom: number };
  extent: number;
  scale: number;
  onSelect: (marker: MapMarker) => void;
}

export const MapCanvasMarkers = memo(function MapCanvasMarkers({
  markers, categories, bounds, extent, scale, onSelect,
}: MapCanvasMarkersProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);
  const sprites = useRef(new Map<MarkerCategory, HTMLCanvasElement>());
  const paintRef = useRef<() => void>(() => undefined);
  const pressed = useRef<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [keyboardId, setKeyboardId] = useState<string | null>(null);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const units = extent / 100;
  const left = bounds.left * units;
  const top = bounds.top * units;
  const width = (bounds.right - bounds.left) * units;
  const height = (bounds.bottom - bounds.top) * units;
  const points = useMemo(() => markers.map((marker) => ({
    marker,
    x: (marker.x - bounds.left) * units,
    y: (marker.y - bounds.top) * units,
  })), [markers, bounds.left, bounds.top, units]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const styles = getComputedStyle(canvas);
    const background = styles.getPropertyValue("--color-background").trim();
    const registry = new Map<MarkerCategory, HTMLCanvasElement>();
    const images: HTMLImageElement[] = [];
    for (const category of categories) {
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = Math.ceil(SPRITE_SIZE * ratio);
      const context = sprite.getContext("2d");
      if (!context) continue;
      context.scale(ratio, ratio);
      context.beginPath();
      context.arc(SPRITE_SIZE / 2, SPRITE_SIZE / 2, MARKER_RADIUS - 0.5, 0, Math.PI * 2);
      context.fillStyle = background;
      context.shadowColor = "rgba(0,0,0,.55)";
      context.shadowBlur = 7;
      context.shadowOffsetY = 3;
      context.fill();
      context.shadowColor = "transparent";
      context.strokeStyle = "rgba(242,239,232,.25)";
      context.stroke();
      registry.set(category.id, sprite);

      const svg = templatesRef.current?.querySelector(`[data-marker-icon="${category.id}"] svg`);
      const source = category.iconSource ?? (svg
        ? `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
        : null);
      if (!source) continue;
      const image = new Image();
      image.onload = () => {
        const iconScale = 16 / Math.max(image.naturalWidth, image.naturalHeight);
        const iconWidth = image.naturalWidth * iconScale;
        const iconHeight = image.naturalHeight * iconScale;
        context.drawImage(image, (SPRITE_SIZE - iconWidth) / 2, (SPRITE_SIZE - iconHeight) / 2, iconWidth, iconHeight);
        paintRef.current();
      };
      image.src = source;
      images.push(image);
    }
    sprites.current = registry;
    return () => images.forEach((image) => { image.onload = null; });
  }, [categories, ratio]);

  useLayoutEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const size = SPRITE_SIZE * scale;
    paintRef.current = () => {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      for (const { marker, x, y } of points) {
        const sprite = sprites.current.get(marker.category);
        if (sprite) context.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      }
    };
    paintRef.current();
  }, [width, height, ratio, points, scale, categories]);

  const pick = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - rect.left) * width / rect.width;
    const y = (clientY - rect.top) * height / rect.height;
    const radiusSquared = (MARKER_RADIUS * scale) ** 2;
    // Last painted wins where markers overlap, like the button layer.
    for (let index = points.length - 1; index >= 0; index -= 1) {
      const point = points[index];
      if ((point.x - x) ** 2 + (point.y - y) ** 2 <= radiusSquared) return point.marker;
    }
  };

  const keyboardMarkers = () => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const viewport = canvas.closest("[data-map-viewport]")?.getBoundingClientRect();
    if (!viewport) return markers;
    return points.filter(({ x, y }) => {
      const left = rect.left + x * rect.width / width;
      const top = rect.top + y * rect.height / height;
      return left >= viewport.left && left <= viewport.right && top >= viewport.top && top <= viewport.bottom;
    }).map(({ marker }) => marker);
  };

  const inspected = points.find(({ marker }) => marker.id === (hoveredId ?? keyboardId));
  return (
    <>
      <div ref={templatesRef} className="pointer-events-none invisible absolute h-0 w-0 overflow-hidden" aria-hidden="true">
        {categories.filter((category) => !category.iconSource).map((category) => (
          <span key={category.id} data-marker-icon={category.id}><MarkerCategoryIcon category={category} size={16} /></span>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        data-map-marker-canvas
        role="button"
        tabIndex={0}
        aria-label={inspected?.marker.name ?? t("map.markerLayer")}
        className="absolute z-10"
        style={{ left, top, width, height, cursor: hoveredId ? "pointer" : undefined }}
        width={Math.ceil(width * ratio)}
        height={Math.ceil(height * ratio)}
        onPointerMove={(event) => {
          if (event.buttons === 0) setHoveredId(pick(event.clientX, event.clientY)?.id ?? null);
        }}
        onPointerLeave={() => setHoveredId(null)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const marker = pick(event.clientX, event.clientY);
          pressed.current = marker?.id ?? null;
          if (!marker) setHoveredId(null);
        }}
        onPointerCancel={() => { pressed.current = null; }}
        onClick={(event) => {
          if (event.detail === 0) {
            const visible = keyboardMarkers();
            const marker = visible.find((candidate) => candidate.id === keyboardId) ?? visible[0];
            if (marker) onSelect(marker);
          } else {
            const marker = pick(event.clientX, event.clientY);
            if (marker && marker.id === pressed.current) onSelect(marker);
          }
          pressed.current = null;
        }}
        onBlur={() => setKeyboardId(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.currentTarget.click();
            return;
          }
          const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
            : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
          if (!direction) return;
          event.preventDefault();
          setHoveredId(null);
          const visible = keyboardMarkers();
          const index = visible.findIndex((marker) => marker.id === keyboardId);
          const next = index < 0 ? visible[0] : visible[(index + direction + visible.length) % visible.length];
          setKeyboardId(next?.id ?? null);
        }}
      />
      {inspected && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-20 mt-5 -translate-x-1/2 whitespace-nowrap border border-border bg-background/95 px-2 py-1 text-[9px] font-medium text-primary shadow-lg"
          style={{ left: `${inspected.marker.x}%`, top: `${inspected.marker.y}%` }}
        >
          {inspected.marker.name}
        </span>
      )}
    </>
  );
});
