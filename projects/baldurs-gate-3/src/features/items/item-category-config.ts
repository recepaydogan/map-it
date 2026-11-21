import {
  BookOpen,
  FlaskConical,
  Gem,
  Hammer,
  KeyRound,
  PackageOpen,
  ScrollText,
  Shield,
  Shirt,
  Sparkles,
  Swords,
  Target,
  Utensils,
  type LucideIcon,
} from "lucide-react";

export interface ItemCategoryConfig {
  id: string;
  labelKey: string;
  icon: LucideIcon;
}

export const ITEM_CATEGORIES: ItemCategoryConfig[] = [
  { id: "weapons", labelKey: "items.categories.weapons", icon: Swords },
  { id: "shields", labelKey: "items.categories.shields", icon: Shield },
  { id: "armor", labelKey: "items.categories.armor", icon: Shirt },
  { id: "accessories", labelKey: "items.categories.accessories", icon: Gem },
  { id: "potions", labelKey: "items.categories.potions", icon: FlaskConical },
  { id: "scrolls", labelKey: "items.categories.scrolls", icon: ScrollText },
  { id: "ammunition", labelKey: "items.categories.ammunition", icon: Target },
  { id: "throwables", labelKey: "items.categories.throwables", icon: Sparkles },
  { id: "consumables", labelKey: "items.categories.consumables", icon: Utensils },
  { id: "alchemy", labelKey: "items.categories.alchemy", icon: FlaskConical },
  { id: "books", labelKey: "items.categories.books", icon: BookOpen },
  { id: "keys", labelKey: "items.categories.keys", icon: KeyRound },
  { id: "quest-items", labelKey: "items.categories.questItems", icon: Hammer },
  { id: "miscellaneous", labelKey: "items.categories.miscellaneous", icon: PackageOpen },
];

export const getItemCategory = (id: string) =>
  ITEM_CATEGORIES.find((category) => category.id === id) ?? ITEM_CATEGORIES.at(-1)!;
