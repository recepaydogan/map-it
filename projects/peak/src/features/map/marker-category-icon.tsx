import {
  Aperture,
  Backpack,
  BellRing,
  BookOpenText,
  Cable,
  Cross,
  Egg,
  Flame,
  Gem,
  Landmark,
  Leaf,
  Milestone,
  PawPrint,
  ShieldAlert,
  Sprout,
  Telescope,
  TriangleAlert,
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import type { MarkerCategory, MarkerCategoryDefinition } from "./map-data";

const markerCategoryIcons = {
  luggage: Backpack,
  campfire: Flame,
  scout: Telescope,
  nest: Egg,
  forage: Leaf,
  guidebook: BookOpenText,
  respawn: Cross,
  portal: Aperture,
  belltower: BellRing,
  creature: PawPrint,
  environment: TriangleAlert,
  trap: ShieldAlert,
  bridge: Milestone,
  rope: Cable,
  vine: Sprout,
  secret: Gem,
} satisfies Record<MarkerCategory, typeof Landmark>;

interface MarkerCategoryIconProps {
  category: MarkerCategoryDefinition;
  size: number;
  className?: string;
}

export const MarkerCategoryIcon = ({
  category,
  size,
  className,
}: MarkerCategoryIconProps) => {
  if (category.iconSource) {
    return (
      <img
        src={category.iconSource}
        alt=""
        draggable={false}
        width={size}
        height={size}
        className={twMerge("object-contain", className)}
        aria-hidden="true"
      />
    );
  }

  const Icon = markerCategoryIcons[category.id];
  return (
    <Icon
      size={size}
      className={className}
      style={{ color: category.color }}
      aria-hidden="true"
    />
  );
};
