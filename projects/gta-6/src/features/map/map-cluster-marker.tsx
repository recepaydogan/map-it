import { memo, type CSSProperties } from "react";
import { cn } from "../../lib/cn";
import type { MapPointCluster } from "./map-clustering";
import { getMapPointPriority, getPointAppearance, keepsMapMarkerPriorityOnHover } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { isQuestPoint } from "./map-faction-filter";
import { screenPointStyle } from "./map-projection";
import { getMapMarkerIconSize, MAP_MARKER_SIZES } from "./map-marker-zoom";

const MapClusterMarker = ({ cluster, scale, overview, label, onSelect }: {
  cluster: MapPointCluster;
  scale: number;
  overview: boolean;
  label: string;
  onSelect: (cluster: MapPointCluster) => void;
}) => {
  const point = cluster.items[0]!.point;
  const appearance = getPointAppearance(point);
  const quest = isQuestPoint(point);
  const iconSize = getMapMarkerIconSize(point.category, quest, appearance.itemArt, "cluster", overview) * scale;
  const markerSize = MAP_MARKER_SIZES[quest ? "quest" : "cluster"] * scale;
  return <div className={cn("map-marker-anchor pointer-events-none absolute",
    keepsMapMarkerPriorityOnHover(point.category) && "map-marker-anchor-fixed-priority")}
    style={{ ...screenPointStyle(cluster.left, cluster.top),
      zIndex: appearance.areaPin ? 0 : undefined,
      "--marker-priority": getMapPointPriority(point) } as CSSProperties}>
    <button type="button" onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onClick={(event) => { event.stopPropagation(); onSelect(cluster); }}
      className={cn("map-marker-cluster pointer-events-auto cursor-pointer", appearance.markerClass,
        appearance.itemArt && "map-item-art")}
      style={{ width: markerSize, height: markerSize,
        "--marker-size-scale": scale } as CSSProperties}
      data-cluster-key={cluster.key} data-cluster-size={cluster.items.length}
      data-map-marker-control aria-label={label} data-name={label}>
      <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath}
        size={iconSize} strokeWidth={2.4} />
    </button>
  </div>;
};

export default memo(MapClusterMarker);
