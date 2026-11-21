import { useState, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

interface MapPointIconProps {
  fallback: LucideIcon;
  source?: MapPointImageSource;
  size: number;
  className?: string;
  strokeWidth?: number;
}

export interface MapPointSpriteSource {
  kind: "sprite";
  src: string;
  columns: number;
  rows: number;
  column: number;
  row: number;
  /** Zooms a cell around its center so illustrated medallions can fill a circular crop. */
  scale?: number;
}

export type MapPointImageSource = string | MapPointSpriteSource;

const validSprite = (source: MapPointSpriteSource) => Number.isSafeInteger(source.columns) && source.columns > 0 && source.columns <= 16
  && Number.isSafeInteger(source.rows) && source.rows > 0 && source.rows <= 16
  && Number.isSafeInteger(source.column) && source.column >= 0 && source.column < source.columns
  && Number.isSafeInteger(source.row) && source.row >= 0 && source.row < source.rows
  && Number.isFinite(source.scale ?? 1) && (source.scale ?? 1) >= 1 && (source.scale ?? 1) <= 2;

const mapPointImageIdentity = (source: MapPointImageSource): string => typeof source === "string" ? source
  : JSON.stringify([source.src, source.columns, source.rows, source.column, source.row, source.scale ?? 1]);

const MapPointIcon = ({
  fallback: Fallback,
  source,
  size,
  className,
  strokeWidth,
}: MapPointIconProps) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const sourceIdentity = source ? mapPointImageIdentity(source) : null;

  if (source && sourceIdentity !== failedSource && (typeof source === "string" || validSprite(source))) {
    if (typeof source !== "string") {
      const scale = source.scale ?? 1;
      return (
        <span
          className={cn("map-native-icon relative inline-block overflow-hidden rounded-[var(--radius-full)]", className)}
          style={{ width: size, height: size }}
          data-map-sprite={`${source.column}:${source.row}`}
          data-map-sprite-source={source.src}
          aria-hidden="true"
        >
          <img
            src={source.src}
            alt=""
            draggable={false}
            onError={() => setFailedSource(sourceIdentity)}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: source.columns * size * scale,
              height: source.rows * size * scale,
              left: size / 2 - (source.column + 0.5) * size * scale,
              top: size / 2 - (source.row + 0.5) * size * scale,
            }}
          />
        </span>
      );
    }
    return (
      <img
        src={source}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        draggable={false}
        onError={() => setFailedSource(sourceIdentity)}
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
