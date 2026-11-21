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
  loading?: "eager" | "lazy";
}

const MapPointIcon = ({
  fallback: Fallback,
  source,
  size,
  className,
  strokeWidth,
  loading,
}: MapPointIconProps) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (source && failedSource !== source) {
    return (
      <img
        src={contentUrl(source)}
        alt=""
        width={size}
        height={size}
        draggable={false}
        loading={loading}
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
