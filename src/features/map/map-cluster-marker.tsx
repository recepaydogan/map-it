import { memo, type CSSProperties } from "react";
import { cn } from "../../lib/cn";
import type { MapPointCluster } from "./map-clustering";
import { getMapMarkerPriority, getPointAppearance, isResourceMarkerCategory } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { isQuestPoint } from "./map-faction-filter";
import { screenPointStyle } from "./map-projection";

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
  const iconSize = (quest ? 27 : point.category === "point-of-interest" ? 14
    : appearance.itemArt ? 28 : overview ? 20 : 19) * scale;
  return <div className={cn("map-marker-anchor pointer-events-none absolute",
    isResourceMarkerCategory(point.category) && "map-marker-anchor-resource")}
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
    </button>
  </div>;
};

export default memo(MapClusterMarker);
