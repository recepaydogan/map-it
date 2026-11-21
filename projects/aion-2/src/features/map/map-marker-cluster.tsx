import { useState } from "react";
import { cn } from "../../lib/cn";
import type { MapPointCluster } from "./map-clustering";
import { getPointAppearance } from "./map-config";
import { getMapMarkerIconSize } from "./map-marker-icon-size";
import MapMarkerFoundBadge from "./map-marker-found-badge";
import MapNativeHitShape from "./map-native-hit-shape";
import MapPointIcon from "./map-point-icon";
import { screenPointStyle } from "./map-projection";
import { useMapMarkerArtPath } from "./use-map-marker-art-path";

export default function MapMarkerCluster({ cluster, label, left, top, priority, scale, size, found, onHover, onSelect }: {
  cluster: MapPointCluster;
  label: string;
  left: number;
  top: number;
  priority: number;
  scale: number;
  size: number;
  found: boolean;
  onHover: (hovered: boolean) => void;
  onSelect: () => void;
}) {
  const appearance = getPointAppearance(cluster.items[0]!.point);
  const [artHovered, setArtHovered] = useState(false);
  const { path, loading } = useMapMarkerArtPath(appearance.nativeIconPath);
  const artHitArea = Boolean(appearance.nativeIconPath && (path !== null || loading));
  const iconSize = getMapMarkerIconSize(size, appearance.itemArt, true) * scale;
  const artScale = appearance.markerClass.includes("map-marker-large-native-icon") ? 1.55
    : appearance.markerClass.includes("map-service-art") ? 1.4 : 1;
  return <div className="map-marker-anchor pointer-events-none absolute"
    style={{ ...screenPointStyle(left, top), zIndex: priority }}>
    <button type="button"
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={(event) => { if (event.currentTarget !== document.activeElement) onHover(false); }}
      onFocus={() => onHover(true)}
      onBlur={(event) => { if (!event.currentTarget.matches(":hover") && !artHovered) onHover(false); }}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      className={cn("map-marker-cluster cursor-pointer", artHitArea ? "pointer-events-none" : "pointer-events-auto",
        appearance.markerClass, appearance.itemArt && "map-item-art", artHovered && "map-marker-art-hovered")}
      style={{ width: size * scale, height: size * scale }}
      data-cluster-key={cluster.key} data-cluster-size={cluster.items.length}
      data-map-marker-control aria-label={label}>
      <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath}
        size={iconSize} strokeWidth={2.4} />
      {found && <MapMarkerFoundBadge scale={Math.min(1, scale)} />}
    </button>
    {path !== null && <MapNativeHitShape path={path} size={iconSize} scale={artScale}
      onEnter={() => { setArtHovered(true); onHover(true); }}
      onLeave={() => { setArtHovered(false); onHover(false); }}
      onClick={(event) => { event.stopPropagation(); onSelect(); }} />}
  </div>;
}
