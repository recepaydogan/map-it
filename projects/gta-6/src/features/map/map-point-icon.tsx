import { useState, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";

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

  if (source && failedSource !== source) {
    return (
      <img
        src={contentUrl(source)}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        draggable={false}
        onError={() => setFailedSource(source)}
        className={cn("map-native-icon", className, repeatableQuest && "map-repeatable-quest-icon")}
        aria-hidden="true"
      />
    );
  }

  const fallbackProps: ComponentProps<LucideIcon> = {
    size,
    className: cn(className, repeatableQuest && "map-repeatable-quest-icon"),
    "aria-hidden": true,
  };
  if (strokeWidth !== undefined) fallbackProps.strokeWidth = strokeWidth;
  return <Fallback {...fallbackProps} />;
};

export default MapPointIcon;
