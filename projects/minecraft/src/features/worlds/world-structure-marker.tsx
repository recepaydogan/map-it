import { memo } from "react";
import { useTranslation } from "react-i18next";
import Tooltip from "../../components/tooltip";
import { cn } from "../../lib/cn";
import MapPointIcon, { type MapPointImageSource } from "../map/map-point-icon";
import { structureIcon } from "./world-structure-icons";
import { WORLD_STRUCTURE_ICON_SIZE, WORLD_STRUCTURE_MARKER_CONTENT_PADDING, WORLD_STRUCTURE_MARKER_RADIUS,
  WORLD_STRUCTURE_MARKER_SIZE } from "./world-structure-marker-size";

export interface WorldStructureMarkerProps {
  id: string; type: string; left: number; top: number; width: number; count: number;
  x?: number; z?: number; selected: boolean; interactive: boolean;
  appearance: { color: string; image?: MapPointImageSource; icon: Parameters<typeof structureIcon>[0];
    markerScale: number; iconScale: number };
  onActivate: (id: string, x: number, z: number, zoom: number | null) => void;
  targetX: number; targetZ: number; targetZoom: number | null;
}

/** Player telemetry must not rebuild every static marker, tooltip and translated label. */
const WorldStructureMarker = memo(function WorldStructureMarker({ id, type, left, top, width, count, x, z,
  selected, interactive, appearance, onActivate, targetX, targetZ, targetZoom }: WorldStructureMarkerProps) {
  const { t } = useTranslation();
  const name = t(`structureMap.types.${type}`);
  const label = t(count > 1 ? "structureMap.cluster" : "structureMap.marker", { name, count, x, z });
  return <Tooltip label={name} side={top < 64 ? "bottom" : "top"}
    align={left < 160 ? "start" : left > width - 160 ? "end" : "center"}
    className={cn(interactive ? "pointer-events-auto" : "pointer-events-none", "absolute -translate-x-1/2 -translate-y-1/2")}
    style={{ left, top }}>
    <button type="button" data-world-map-pan-target data-structure-point={count === 1 ? id : undefined}
      data-structure-cluster={count > 1 ? count : undefined} aria-label={label} aria-pressed={selected}
      tabIndex={interactive ? undefined : -1} onClick={interactive ? () => onActivate(id, targetX, targetZ, targetZoom) : undefined}
      className={cn("relative grid cursor-pointer place-items-center border border-transparent bg-black/20 shadow-[0_1.25px_3.75px_rgba(0,0,0,0.7)] hover:scale-110 hover:bg-black/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected && "z-10 ring-2 ring-accent ring-offset-2 ring-offset-map-surface")}
      style={{ color: appearance.color, width: WORLD_STRUCTURE_MARKER_SIZE * appearance.markerScale,
        height: WORLD_STRUCTURE_MARKER_SIZE * appearance.markerScale, borderRadius: WORLD_STRUCTURE_MARKER_RADIUS,
        transform: "scale(var(--world-map-marker-inverse-scale, 1))", padding: WORLD_STRUCTURE_MARKER_CONTENT_PADDING }}>
      <MapPointIcon source={appearance.image} fallback={structureIcon(appearance.icon)}
        size={WORLD_STRUCTURE_ICON_SIZE * appearance.iconScale} className="structure-marker-icon" />
      {count > 1 && <span className="absolute -bottom-2 -right-2 rounded-[var(--radius-full)] border border-border bg-surface px-1 text-[10px] font-semibold text-zinc-100">{count}</span>}
    </button>
  </Tooltip>;
});

export default WorldStructureMarker;
