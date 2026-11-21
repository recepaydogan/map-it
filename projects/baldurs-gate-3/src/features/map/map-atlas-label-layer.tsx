import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { layoutAtlasLabels } from "./map-atlas-label-layout";
import type { MapAtlasDefinition, MapDefinition } from "./map-registry";

interface MapAtlasLabelLayerProps {
  atlas: MapAtlasDefinition;
  maps: MapDefinition[];
  selectedMapId: string;
  viewport: { width: number; height: number };
  offsetX: number;
  offsetY: number;
  zoom: number;
}

interface LabelMeasurement {
  name: string;
  featured: boolean;
  width: number;
  height: number;
}

const DETAIL_LABEL_ZOOM = 0.28;

const MapAtlasLabelLayer = ({ atlas, maps, selectedMapId, viewport, offsetX, offsetY, zoom }: MapAtlasLabelLayerProps) => {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [measurements, setMeasurements] = useState<ReadonlyMap<string, LabelMeasurement>>(new Map());
  const labels = useMemo(() => {
    const mapsById = new Map(maps.map((map) => [map.id, map]));
    return atlas.placements.flatMap((placement) => {
      const map = mapsById.get(placement.mapId);
      return map ? [{ ...placement, name: map.name, featured: atlas.featuredMapIds.includes(map.id) }] : [];
    });
  }, [atlas, maps]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const labelsById = new Map(labels.map((label) => [label.mapId, label]));
    const observer = new ResizeObserver((entries) => {
      const measured = entries.flatMap(({ target }) => {
        const mapId = (target as HTMLElement).dataset.atlasLabelId;
        const label = mapId ? labelsById.get(mapId) : undefined;
        if (!label) return [];
        const rectangle = target.getBoundingClientRect();
        return [[label.mapId, { name: label.name, featured: label.featured,
          width: Math.ceil(rectangle.width), height: Math.ceil(rectangle.height) }] as const];
      });
      setMeasurements((previous) => {
        if (measured.every(([id, next]) => {
          const old = previous.get(id);
          return old?.name === next.name && old.featured === next.featured
            && old.width === next.width && old.height === next.height;
        })) return previous;
        return new Map([...previous, ...measured]);
      });
    });
    // Hidden labels still have layout boxes. Observe the border box so font,
    // wrapping and padding changes are measured without estimating text width.
    for (const element of layer.querySelectorAll("[data-atlas-label-id]")) observer.observe(element, { box: "border-box" });
    return () => observer.disconnect();
  }, [labels]);

  const placements = useMemo(() => new Map(layoutAtlasLabels(labels.flatMap((label) => {
    const measured = measurements.get(label.mapId);
    const selected = label.mapId === selectedMapId;
    if (!measured || measured.name !== label.name || measured.featured !== label.featured
      || (!selected && !label.featured && zoom < DETAIL_LABEL_ZOOM)) return [];
    return [{ mapId: label.mapId, selected, featured: label.featured, width: measured.width, height: measured.height,
      rectangle: { left: offsetX + label.x * zoom, top: offsetY + label.y * zoom,
        width: label.width * zoom, height: label.height * zoom } }];
  }), viewport).map((placement) => [placement.mapId, placement])), [labels, measurements, selectedMapId, zoom, offsetX, offsetY, viewport]);

  return (
    <div ref={layerRef} className="map-atlas-label-layer" aria-hidden="true">
      {labels.map((label) => {
        const placement = placements.get(label.mapId);
        return (
          <div
            key={label.mapId}
            className="map-atlas-map-label-anchor"
            data-label-visible={Boolean(placement) || undefined}
            data-label-priority={label.featured ? "featured" : undefined}
            aria-current={label.mapId === selectedMapId ? "location" : undefined}
            style={{ left: placement?.left ?? 0, top: placement?.top ?? 0 }}
          >
            <span className="map-atlas-map-label" data-atlas-label-id={label.mapId}>{label.name}</span>
          </div>
        );
      })}
    </div>
  );
};

export default MapAtlasLabelLayer;
