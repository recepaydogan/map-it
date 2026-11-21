import { Check } from "lucide-react";
import { FOUND_BADGE_FILL, FOUND_BADGE_OUTLINE } from "./map-marker-found-badge-paint";

export default function MapMarkerFoundBadge({ scale = 1 }: { scale?: number }) {
  return <span className="map-marker-found-badge" style={{ backgroundColor: FOUND_BADGE_FILL, borderColor: FOUND_BADGE_OUTLINE,
    right: -7 * scale, bottom: -7 * scale, transform: `scale(${scale})`, transformOrigin: "bottom right" }} aria-hidden="true">
    <Check size={11} strokeWidth={4} color={FOUND_BADGE_OUTLINE} />
  </span>;
}
