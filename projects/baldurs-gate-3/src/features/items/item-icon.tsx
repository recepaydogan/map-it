import type { CSSProperties } from "react";
import { getItemCategory } from "./item-category-config";
import type { ItemDatabaseEntry } from "./types";

type ItemIconSource = Pick<ItemDatabaseEntry, "category" | "icon">;

interface ItemIconProps {
  item: ItemIconSource;
  size: number;
  className?: string;
}

const getAtlasStyle = (item: ItemIconSource, size: number): CSSProperties | undefined => {
  const icon = item.icon;
  if (!icon?.atlas || icon.u1 === undefined || icon.u2 === undefined || icon.v1 === undefined || icon.v2 === undefined) {
    return undefined;
  }
  const width = size / (icon.u2 - icon.u1);
  const height = size / (icon.v2 - icon.v1);
  return {
    width: size,
    height: size,
    backgroundImage: `url("/items/icon-atlases/${icon.atlas}.webp")`,
    backgroundPosition: `${-icon.u1 * width}px ${-icon.v1 * height}px`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${width}px ${height}px`,
  };
};

const ItemIcon = ({ item, size, className }: ItemIconProps) => {
  const atlasStyle = getAtlasStyle(item, size);
  if (atlasStyle) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={atlasStyle}
      />
    );
  }
  const Icon = getItemCategory(item.category).icon;
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.52)} />
    </span>
  );
};

export default ItemIcon;
