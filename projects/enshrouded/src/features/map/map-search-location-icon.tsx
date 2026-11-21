import { cn } from "../../lib/cn";
import { getPointAppearance } from "./map-config";
import MapPointIcon from "./map-point-icon";
import type { MapPoint } from "./types";

export default function MapSearchLocationIcon({ point, compact = false }: { point: MapPoint; compact?: boolean }) {
  const appearance = getPointAppearance(point);
  return <span className={cn(
    "grid shrink-0 place-items-center rounded-[var(--radius-sm)] bg-white/8 text-accent",
    compact ? "h-6 w-6" : "h-8 w-8",
    appearance.itemArt && "map-item-art",
  )}>
    <MapPointIcon fallback={appearance.icon} source={appearance.nativeIconPath}
      size={compact ? (appearance.itemArt ? 18 : 12) : (appearance.itemArt ? 23 : 15)} />
  </span>;
}
