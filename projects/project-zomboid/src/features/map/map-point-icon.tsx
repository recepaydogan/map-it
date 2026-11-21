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

  if (source && failedSource !== source) {
    return (
      <img
        src={source}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={() => setFailedSource(source)}
        className={cn("map-native-icon", className)}
        aria-hidden="true"
      />
    );
  }

  const fallbackProps: ComponentProps<LucideIcon> = {
    size,
    className,
    "aria-hidden": true,
  };
  if (strokeWidth !== undefined) fallbackProps.strokeWidth = strokeWidth;
  return <Fallback {...fallbackProps} />;
};

export default MapPointIcon;
