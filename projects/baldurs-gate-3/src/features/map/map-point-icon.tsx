import { useState, type ComponentProps, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import type { MapItemSprite } from "./use-map-item-visuals";

interface MapPointIconProps {
  fallback: LucideIcon;
  source?: string;
  sprite?: MapItemSprite;
  size: number;
  className?: string;
  strokeWidth?: number;
}

/** Crops one item icon out of its shared atlas sheet. */
const spriteStyle = (sprite: MapItemSprite, size: number): CSSProperties => {
  const width = size / (sprite.u2 - sprite.u1);
  const height = size / (sprite.v2 - sprite.v1);
  return {
    width: size,
    height: size,
    backgroundImage: `url("/items/icon-atlases/${sprite.atlas}.webp")`,
    backgroundPosition: `${-sprite.u1 * width}px ${-sprite.v1 * height}px`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${width}px ${height}px`,
  };
};

const MapPointIcon = ({
  fallback: Fallback,
  source,
  sprite,
  size,
  className,
  strokeWidth,
}: MapPointIconProps) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (sprite && sprite.u2 > sprite.u1 && sprite.v2 > sprite.v1) {
    return (
      <span
        aria-hidden="true"
        className={cn("map-item-sprite", className)}
        style={spriteStyle(sprite, size)}
      />
    );
  }

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
