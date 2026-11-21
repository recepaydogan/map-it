import { iconFor } from "../data/icon-map";
import { cn } from "../lib/cn";

interface CategoryDotProps {
  color: string;
  icon: string;
  size?: number;
  className?: string;
  /** Real map-symbol art for the category. When set it is shown exactly like the
   * map pin (art on a dark disc ringed in the category color) instead of the glyph. */
  iconUrl?: string;
}

/**
 * The shared category glyph chip — one identity per category, reused by the
 * filter rows, detail header, item cards and search results so a category
 * always looks the same everywhere. When the map draws this category with a
 * real extracted symbol, the chip carries that same symbol via `iconUrl`.
 */
const CategoryDot = ({ color, icon, size = 20, className, iconUrl }: CategoryDotProps) => {
  // Mirror the map's image pin: dark disc, category color as the ring, art
  // clipped to the disc so its transparent padding doesn't shrink the symbol.
  if (iconUrl) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full",
          className,
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: "rgba(9, 11, 15, 0.92)",
          border: `1.5px solid ${color}`,
        }}
      >
        <img
          src={iconUrl}
          alt=""
          draggable={false}
          // Icons are pre-trimmed at extraction, so object-contain fills the chip
          // without the old scale-up crop hack.
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  const Icon = iconFor(icon);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-[#0b0b0e]",
        className,
      )}
      // Category color + size are runtime data (categories.json) and cannot be
      // static Tailwind classes, so they are applied as CSS values here.
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Icon size={Math.round(size * 0.56)} strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
};

export default CategoryDot;
