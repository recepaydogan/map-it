import { memo } from "react";
import { cn } from "../../lib/cn";
import type { MapPointCluster } from "./map-clustering";
import { getPointAppearance } from "./map-config";
import MapPointIcon from "./map-point-icon";
import { screenPointStyle } from "./map-projection";
import type { MapItemSprite } from "./use-map-item-visuals";

interface MapClusterMarkerProps {
  cluster: MapPointCluster;
  label: string;
  sprite?: MapItemSprite;
  overview: boolean;
  compact: boolean;
  onSelect: (cluster: MapPointCluster) => void;
}

/** A pan moves the layer without reconciling every cluster's SVG and button. */
const MapClusterMarker = ({ cluster, label, sprite, overview, compact, onSelect }: MapClusterMarkerProps) => {
  const appearance = getPointAppearance(cluster.items[0]!.point);
  return <div className="map-marker-anchor pointer-events-none absolute"
    style={screenPointStyle(cluster.left + cluster.offsetX, cluster.top + cluster.offsetY)}>
    <button type="button"
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onClick={(event) => { event.stopPropagation(); onSelect(cluster); }}
      className={cn("map-marker-cluster pointer-events-auto cursor-pointer", appearance.markerClass)}
      data-cluster-key={cluster.key} data-cluster-size={cluster.items.length} data-map-marker-control
      aria-label={label} data-name={label}>
      <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath} sprite={sprite}
        size={overview ? 20 : 19} strokeWidth={2.4} />
      {compact && <span className="map-marker-cluster-count" aria-hidden="true">
        {cluster.items.length > 99 ? "99+" : cluster.items.length}
      </span>}
    </button>
  </div>;
};

export default memo(MapClusterMarker);
