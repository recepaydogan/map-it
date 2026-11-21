import { useState } from "react";
import CategoryDot from "./category-dot";
import { itemIconUrl } from "../utils/assets";
import { fallbackIconUrl } from "../data/fallback-icons";

interface ItemIconProps {
  /** Official game icon id (resolves to the CDN, or /icons/elden-ring/items/<id>.png in dev). */
  iconId?: number;
  /** Item/marker category — picks the local fallback icon shown until the CDN icon loads. */
  category?: string;
  /** Last-resort category color + glyph when there's no icon and no fallback. */
  color: string;
  glyph: string;
  size?: number;
}

/**
 * Renders an item's official icon, which now streams from the CDN. To avoid a
 * blank frame while it loads (or if it never arrives offline), a local
 * category-representative fallback PNG is shown underneath and the real icon fades
 * in over it on load; on error the fallback simply stays. With neither icon nor
 * fallback available it drops to the category glyph dot.
 */
const ItemIcon = ({ iconId, category, color, glyph, size = 26 }: ItemIconProps) => {
  const [loaded, setLoaded] = useState(false);
  const [realFailed, setRealFailed] = useState(false);

  const real = iconId != null ? itemIconUrl(iconId) : undefined;
  const fallback = category ? fallbackIconUrl(category) : undefined;

  // Nothing to draw as an image → the category glyph dot.
  if ((!real || realFailed) && !fallback) {
    return <CategoryDot color={color} icon={glyph} size={size} />;
  }

  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] bg-black/30"
      // Size is a runtime prop, not expressible as a static Tailwind class.
      style={{ width: size, height: size }}
    >
      {fallback && (!loaded || realFailed) && (
        <img
          src={fallback}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
      {real && !realFailed && (
        <img
          src={real}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setRealFailed(true)}
          // Icons are pre-trimmed at extraction (tight to the symbol + a small margin),
          // so object-contain fills the frame without the old scale-up crop hack.
          className={`relative h-full w-full object-contain transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
};

export default ItemIcon;
