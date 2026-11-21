import { useState, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface MapPointIconProps {
  fallback: LucideIcon;
  source?: string;
  size: number;
  className?: string;
  strokeWidth?: number;
}

const MapPointIcon = ({
  fallback: Fallback,
  source,
  size,
  className,
  strokeWidth,
}: MapPointIconProps) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const repeatableQuest = source?.includes("mapgenie-repeatable-quest.svg") ?? false;
  const loreIcon = source?.endsWith("-Lore.png") ?? false;

  if (source && failedSource !== source) {
    const icon = (
      <img
        src={source}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={() => setFailedSource(source)}
        className={cn("map-native-icon", className, repeatableQuest && "map-repeatable-quest-icon")}
        aria-hidden="true"
      />
    );
    if (loreIcon) {
      return <span className="map-lore-icon" style={{ width: size, height: size }} aria-hidden="true">{icon}</span>;
    }
    return icon;
  }

  const fallbackProps: ComponentProps<LucideIcon> = {
    size,
    className: cn(className, repeatableQuest && "map-repeatable-quest-icon", loreIcon && "map-lore-fallback"),
    "aria-hidden": true,
  };
  if (strokeWidth !== undefined) fallbackProps.strokeWidth = strokeWidth;
  return <Fallback {...fallbackProps} />;
};

export default MapPointIcon;
