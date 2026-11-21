import { Package, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import MapPointIcon, { type MapPointImageSource } from "../map/map-point-icon";

interface Props {
  fallback?: LucideIcon;
  image?: MapPointImageSource;
  images?: readonly MapPointImageSource[];
  size: number;
  imageClassName?: string;
}

const InspectorSubjectIcon = ({ fallback = Package, image, images = [], size, imageClassName }: Props) => {
  const visibleImages = images.slice(0, 2);
  const className = cn("guide-asset-icon", imageClassName);
  if (visibleImages.length < 2) {
    return <MapPointIcon source={visibleImages[0] ?? image} fallback={fallback} size={size} className={className} />;
  }
  const itemSize = Math.round(size * 0.64);
  return <span className="relative block" style={{ width: size, height: size }} aria-hidden="true">
    <span className="absolute left-0 top-0 grid place-items-center rounded-[var(--radius-sm)] bg-surface/90"
      style={{ width: itemSize, height: itemSize }}>
      <MapPointIcon source={visibleImages[0]} fallback={fallback} size={itemSize} className={className} />
    </span>
    <span className="absolute bottom-0 right-0 grid place-items-center rounded-[var(--radius-sm)] bg-surface/90"
      style={{ width: itemSize, height: itemSize }}>
      <MapPointIcon source={visibleImages[1]} fallback={fallback} size={itemSize} className={className} />
    </span>
  </span>;
};

export default InspectorSubjectIcon;
