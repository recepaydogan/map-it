import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";
import type { MapPointCluster } from "./map-clustering";
import { getBestiaryMarkerTier, getMapMarkerPriority, getPointAppearance } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { isQuestPoint } from "./map-faction-filter";
import { screenPointStyle } from "./map-projection";

export default function MapClusterMarker({ cluster, scale, overview, label, onSelect }: {
  cluster: MapPointCluster;
  scale: number;
  overview: boolean;
  label: string;
  onSelect: (cluster: MapPointCluster) => void;
}) {
  const point = cluster.items.find(({ point }) => getBestiaryMarkerTier(point) === "danger")?.point
    ?? cluster.items.find(({ point }) => getBestiaryMarkerTier(point) === "warning")?.point
    ?? cluster.items[0]!.point;
  const appearance = getPointAppearance(point);
  const quest = isQuestPoint(point);
  const iconSize = (quest ? 27 : point.category === "point-of-interest" ? 14
    : appearance.itemArt ? 24 : overview ? 20 : 19) * scale;
  return <div className="map-marker-anchor pointer-events-none absolute"
    style={{ ...screenPointStyle(cluster.left + cluster.offsetX, cluster.top + cluster.offsetY),
      "--marker-priority": getMapMarkerPriority(point.category) } as CSSProperties}>
    <button type="button" onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onClick={(event) => { event.stopPropagation(); onSelect(cluster); }}
      className={cn("map-marker-cluster pointer-events-auto cursor-pointer", appearance.markerClass,
        appearance.itemArt && "map-item-art")}
      style={{ width: (quest ? 27 : 35) * scale, height: (quest ? 27 : 35) * scale,
        "--marker-size-scale": scale } as CSSProperties}
      data-cluster-key={cluster.key} data-cluster-size={cluster.items.length}
      data-map-marker-control aria-label={label} data-name={label}>
      <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath}
        size={iconSize} strokeWidth={2.4} />
      <span className="absolute -bottom-1 -right-1 z-10 grid min-h-4 min-w-4 place-items-center rounded-full border border-black/70 bg-accent px-0.5 text-[9px] font-bold tabular-nums text-on-accent">
        {cluster.items.length}
      </span>
    </button>
  </div>;
}
