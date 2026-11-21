import {
  BookOpenText,
  Flame,
  FlaskConical,
  Grid2X2,
  Hammer,
  LayoutGrid,
  Landmark,
  Package,
  PawPrint,
  RefreshCw,
  Route,
  CircuitBoard,
  Sparkles,
  Trees,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import type { InspectorSubject } from "../inspector/inspector-controller";

export type GuideKind = "all" | "item" | "blocks" | "biome" | "brewing" | "smithing" | "crafting" | "smelting" | "structures" | "redstone" | "effect" | "entity" | "trade" | "enchantment" | "tutorial";

export const GUIDE_MENU_KINDS: readonly GuideKind[] = [
  "item",
  "entity",
  "crafting",
  "smelting",
  "brewing",
  "smithing",
  "blocks",
  "biome",
  "structures",
  "enchantment",
  "trade",
  "effect",
  "tutorial",
];

/** Keep existing internal scopes available without showing them in the category menus. */
export const GUIDE_KINDS: readonly GuideKind[] = [
  "all",
  ...GUIDE_MENU_KINDS,
  "redstone",
];

export const GUIDE_KIND_ICONS: Readonly<Record<GuideKind, LucideIcon>> = {
  all: LayoutGrid,
  item: Package,
  blocks: Boxes,
  biome: Trees,
  brewing: FlaskConical,
  smithing: Hammer,
  crafting: Grid2X2,
  smelting: Flame,
  structures: Landmark,
  redstone: CircuitBoard,
  effect: Sparkles,
  entity: PawPrint,
  trade: RefreshCw,
  enchantment: BookOpenText,
  tutorial: Route,
};

/** The guide presents placeable blocks in the shared inventory item category. */
export const normalizeGuideSubject = (subject: InspectorSubject): InspectorSubject =>
  subject.kind === "block" ? { kind: "item", id: subject.id } : subject;
