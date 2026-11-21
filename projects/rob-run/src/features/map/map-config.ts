import { ArrowUpDown, Building2, DoorOpen, Flag, House, KeyRound, Landmark, LogOut, MapPin, Package, ShieldAlert, Truck, Vault, Archive, Banknote, Cctv, CircleDot, Cpu, Crosshair, FlaskConical, Gem, HandCoins, HardHat, Images, Pill, Receipt, ScanLine, Siren, SquareParking, Store, Trash2, Wine, Wrench, type LucideIcon } from "lucide-react";
import { BedDouble, Castle, ClipboardList, Coffee, Droplet, Dumbbell, Footprints, Frame, Fuel, Laugh, Mail, Music2, PenTool, Phone, Shield, ShoppingBasket, Skull } from "lucide-react";
import { isUserMapMarker, type MapPoint, type UserMarkerIcon } from "./types";
import { contentUrl } from "../../lib/content-url";

export interface MapCategoryConfig {
  id: string; labelKey: string; filterLabelKey?: string; groupId: MapCategoryGroupId;
  defaultVisible: boolean; icon: LucideIcon; nativeIconPath?: string;
  tooltipCategoryOnly?: boolean;
  preferCategoryIcon?: boolean;
  sourceReferenceIds?: string[]; filterId?: string; hideObjectAccessDetails?: boolean;
  artwork?: boolean; markerClass: string; linkedItemLabelKey?: string;
  routeLinkGroupKey?: string; routeLinksTitleKey?: string;
}
export type MapCategoryGroupId = "places" | "loot" | "security" | "services" | "events" | "personal" | "class-trainers" | "profession-trainers" | "herbs" | "mining" | "fishing" | "cloth" | "leather" | "npcs" | "dungeons" | "pvp";
export type MapFilterFocusRequest = { categoryId: string; requestId: number };
export interface MapCategoryGroupConfig {
  id: MapCategoryGroupId; labelKey: string; icon: LucideIcon;
  defaultExpanded: boolean; showInFilters?: boolean;
}
export interface UserMarkerIconConfig { id: UserMarkerIcon; labelKey: string; icon: LucideIcon; nativeIconPath?: string; }

export const MAP_CATEGORY_GROUPS: MapCategoryGroupConfig[] = [
  { id: "places", labelKey: "robRun.groups.places", icon: Landmark, defaultExpanded: true },
  { id: "loot", labelKey: "robRun.groups.loot", icon: Vault, defaultExpanded: false },
  { id: "services", labelKey: "robRun.groups.services", icon: Store, defaultExpanded: false },
  { id: "security", labelKey: "robRun.groups.security", icon: ShieldAlert, defaultExpanded: false },
  { id: "events", labelKey: "robRun.groups.events", icon: Flag, defaultExpanded: false },
  { id: "personal", labelKey: "map.categoryGroups.personal", icon: MapPin, defaultExpanded: false },
];

type MarkerTone = "violet" | "lavender" | "blue" | "cyan" | "teal" | "mint" | "sage" | "pink" | "rose" | "coral";

const markerStyle = (tone: MarkerTone) => `map-marker-mapgenie rob-run-marker rob-run-marker-${tone}`;

const categoryDefinitions: MapCategoryConfig[] = [
  { id: "robbery", labelKey: "robRun.categories.robbery", groupId: "places", defaultVisible: true,
    icon: Building2, markerClass: markerStyle("violet") },
  { id: "landmark", labelKey: "robRun.categories.landmark", groupId: "places", defaultVisible: true,
    icon: Landmark, markerClass: markerStyle("lavender") },
  { id: "district", labelKey: "robRun.categories.district", groupId: "places", defaultVisible: true,
    icon: Flag, markerClass: markerStyle("violet") },
  { id: "settlement", labelKey: "robRun.categories.settlement", groupId: "places", defaultVisible: false,
    icon: House, markerClass: markerStyle("teal") },
  { id: "plot", labelKey: "robRun.categories.plot", groupId: "places", defaultVisible: true,
    icon: House, markerClass: markerStyle("teal") },
  { id: "travel", labelKey: "robRun.categories.travel", groupId: "places", defaultVisible: true,
    icon: LogOut, markerClass: markerStyle("cyan") },
  { id: "key-safe", labelKey: "robRun.categories.keySafe", groupId: "loot", defaultVisible: false,
    icon: KeyRound, markerClass: markerStyle("blue") },
  { id: "drill-safe", labelKey: "robRun.categories.drillSafe", groupId: "loot", defaultVisible: false,
    icon: Vault, markerClass: markerStyle("blue") },
  { id: "safe", labelKey: "robRun.categories.safes", groupId: "loot", defaultVisible: false,
    icon: Vault, markerClass: markerStyle("blue") },
  { id: "container", labelKey: "robRun.categories.containers", groupId: "loot", defaultVisible: false,
    icon: Package, markerClass: markerStyle("teal") },
  { id: "loose-loot", labelKey: "robRun.categories.looseLoot", groupId: "loot", defaultVisible: false,
    icon: Gem, markerClass: markerStyle("teal") },
  { id: "cash-register", labelKey: "robRun.categories.cashRegisters", groupId: "loot", defaultVisible: false,
    icon: Receipt, markerClass: markerStyle("mint") },
  { id: "cash", labelKey: "robRun.categories.cash", groupId: "loot", defaultVisible: false,
    icon: Banknote, markerClass: markerStyle("mint") },
  { id: "deposit-box", labelKey: "robRun.categories.depositBoxes", groupId: "loot", defaultVisible: false,
    icon: Archive, markerClass: markerStyle("blue") },
  { id: "vault-loot", labelKey: "robRun.categories.vaultLoot", groupId: "loot", defaultVisible: false,
    icon: Vault, markerClass: markerStyle("blue") },
  { id: "trash", labelKey: "robRun.categories.trash", groupId: "loot", defaultVisible: false,
    icon: Trash2, markerClass: markerStyle("sage") },
  { id: "jewelry", labelKey: "robRun.categories.jewelry", groupId: "loot", defaultVisible: false,
    icon: Gem, markerClass: markerStyle("pink") },
  { id: "medicine", labelKey: "robRun.categories.medicine", groupId: "loot", defaultVisible: false,
    icon: Pill, markerClass: markerStyle("mint") },
  { id: "weapons-loot", labelKey: "robRun.categories.weaponLoot", groupId: "loot", defaultVisible: false,
    icon: Crosshair, markerClass: markerStyle("coral") },
  { id: "gear-loot", labelKey: "robRun.categories.gearLoot", groupId: "loot", defaultVisible: false,
    icon: HardHat, markerClass: markerStyle("blue") },
  { id: "alcohol", labelKey: "robRun.categories.alcohol", groupId: "loot", defaultVisible: false,
    icon: Wine, markerClass: markerStyle("pink") },
  { id: "electronics", labelKey: "robRun.categories.electronics", groupId: "loot", defaultVisible: false,
    icon: Cpu, markerClass: markerStyle("cyan") },
  { id: "car-parts", labelKey: "robRun.categories.carParts", groupId: "loot", defaultVisible: false,
    icon: Wrench, markerClass: markerStyle("cyan") },
  { id: "drugs", labelKey: "robRun.categories.drugs", groupId: "loot", defaultVisible: false,
    icon: FlaskConical, markerClass: markerStyle("violet") },
  { id: "art", labelKey: "robRun.categories.art", groupId: "loot", defaultVisible: false,
    icon: Images, markerClass: markerStyle("lavender") },
  { id: "camera", labelKey: "robRun.categories.cameras", groupId: "security", defaultVisible: false,
    icon: Cctv, markerClass: markerStyle("rose") },
  { id: "door", labelKey: "robRun.categories.doors", groupId: "security", defaultVisible: false,
    icon: DoorOpen, markerClass: markerStyle("rose") },
  { id: "alarm-panel", labelKey: "robRun.categories.alarmPanels", groupId: "security", defaultVisible: false,
    icon: Siren, markerClass: markerStyle("rose") },
  { id: "metal-detector", labelKey: "robRun.categories.metalDetectors", groupId: "security", defaultVisible: false,
    icon: ScanLine, markerClass: markerStyle("rose") },
  { id: "atm", labelKey: "robRun.categories.atms", groupId: "services", defaultVisible: false,
    icon: Banknote, markerClass: markerStyle("mint") },
  { id: "buyer", labelKey: "robRun.categories.buyers", groupId: "services", defaultVisible: true,
    icon: Store, markerClass: markerStyle("mint") },
  { id: "cargo-exchange", labelKey: "robRun.categories.cargoExchange", groupId: "services", defaultVisible: true,
    icon: Truck, markerClass: markerStyle("cyan") },
  { id: "parking", labelKey: "robRun.categories.parking", groupId: "services", defaultVisible: false,
    icon: SquareParking, markerClass: markerStyle("cyan") },
  { id: "vendor", labelKey: "robRun.categories.vendors", groupId: "services", defaultVisible: true,
    icon: Store, markerClass: markerStyle("mint") },
  { id: "storage", labelKey: "robRun.categories.storage", groupId: "services", defaultVisible: true,
    icon: Archive, markerClass: markerStyle("teal") },
  { id: "service", labelKey: "robRun.categories.service", groupId: "services", defaultVisible: true,
    icon: HandCoins, markerClass: markerStyle("mint") },
  { id: "activity", labelKey: "robRun.categories.activities", groupId: "places", defaultVisible: true,
    icon: CircleDot, markerClass: markerStyle("lavender") },
  { id: "conquest", labelKey: "robRun.categories.conquest", groupId: "events", defaultVisible: false,
    icon: Flag, markerClass: markerStyle("lavender") },
  { id: "event-cargo", labelKey: "robRun.categories.eventCargo", groupId: "events", defaultVisible: false,
    icon: Package, markerClass: markerStyle("cyan") },
  { id: "custom", labelKey: "map.markerStyle.icons.pin", groupId: "personal", defaultVisible: true,
    icon: MapPin, markerClass: markerStyle("cyan") },
];

const buildingIcons = {
  gallery: Frame,
  bank: Landmark,
  cafe: Coffee,
  "mini-market": ShoppingBasket,
  "drug-house": FlaskConical,
  "electronics-store": Cpu,
  "equipment-store": HardHat,
  "gas-station": Fuel,
  "gun-shop": Crosshair,
  hotel: BedDouble,
  house: House,
  "jewellery-store": Gem,
  mansion: Castle,
  pharmacy: Pill,
  police: Shield,
  "strip-club": Music2,
} satisfies Record<string, LucideIcon>;

const buildingFilters: MapCategoryConfig[] = Object.entries(buildingIcons).map(([kind, icon]) => ({
  id: `building-${kind}`, labelKey: `robRun.buildingTypes.${kind}`, groupId: "places", defaultVisible: true,
  icon, markerClass: markerStyle("violet"),
}));

export const MAP_CATEGORIES = [...categoryDefinitions, ...buildingFilters];

export interface MapFlightRingEffect { durationSeconds: number; flightSpeedIncreasePercent: number; flightPowerCostReductionPercent: number; flightPowerRecoveryPercent: number; }
export const MAP_FLIGHT_RING_EFFECTS: Record<string, MapFlightRingEffect> = {};
export const FILTER_CATEGORY_GROUPS = MAP_CATEGORY_GROUPS.filter(({ showInFilters }) => showInFilters !== false);
export const FILTER_CATEGORIES = MAP_CATEGORIES.filter(({ groupId, id }) => groupId !== "personal" && id !== "robbery");
export const FOREVER_GATHERABLE_CATEGORY_IDS: string[] = [];
export const ZONES_FILTER_GROUP = { id: "zones", labelKey: "map.categoryGroups.zones", defaultExpanded: false } as const;
export type MapFilterGroupId = MapCategoryGroupId | typeof ZONES_FILTER_GROUP.id;
export type MapFilterCategory = {
  category: Omit<MapCategoryConfig, "groupId" | "defaultVisible"> & { groupId: MapFilterGroupId };
  ids: string[];
};
export const FILTER_CATEGORY_ROWS: MapFilterCategory[] = FILTER_CATEGORIES
  .map((category) => ({ category, ids: [category.id] }));
export const DEFAULT_CATEGORY_IDS = FILTER_CATEGORIES
  .filter(({ defaultVisible }) => defaultVisible).map(({ id }) => id);

export const USER_MARKER_ICONS: UserMarkerIconConfig[] = [
  { id: "pin", labelKey: "map.markerStyle.icons.pin", icon: MapPin },
  { id: "home", labelKey: "robRun.pinIcons.home", icon: House },
  { id: "flag", labelKey: "robRun.pinIcons.flag", icon: Flag },
  { id: "vehicle", labelKey: "robRun.pinIcons.vehicle", icon: Truck },
  { id: "supplies", labelKey: "robRun.pinIcons.supplies", icon: Package },
  { id: "danger", labelKey: "robRun.pinIcons.danger", icon: ShieldAlert },
];

export const resolveUserMarkerIcon = (icon?: UserMarkerIcon): UserMarkerIcon =>
  USER_MARKER_ICONS.find(({ id }) => id === icon)?.id ?? "pin";

const MAP_CATEGORY_BY_ID = new Map(MAP_CATEGORIES.map((category) => [category.id, category]));
export const getCategoryConfig = (categoryId: string) => MAP_CATEGORY_BY_ID.get(categoryId) ?? MAP_CATEGORY_BY_ID.get("custom")!;
export const isResourceMarkerCategory = (categoryId: string) => getCategoryConfig(categoryId).groupId === "loot";
export const isCategoryArtwork = (category: Pick<MapCategoryConfig, "artwork">) => category.artwork === true;

const prisonMarkerIcons: Readonly<Record<string, LucideIcon>> = {
  PrisonEscapeView: LogOut,
  PrisonEscapeView_ToiletEdition: DoorOpen,
  Call: Phone,
  Execution: Skull,
  Prank: Laugh,
  Spit: Droplet,
  Mailbox: Mail,
  KolschikNpcView: PenTool,
  Gym: Dumbbell,
  Yard: Footprints,
  Taskboard: ClipboardList,
};

export const getPointAppearance = (point: MapPoint) => {
  const category = getCategoryConfig(point.category);
  if (!isUserMapMarker(point)) {
    const prisonIcon = point.regionId === "prison" && point.sourceActor
      ? prisonMarkerIcons[point.sourceActor] : undefined;
    const building = point.category === "robbery" && point.filterCategoryId
      ? MAP_CATEGORY_BY_ID.get(point.filterCategoryId) : undefined;
    const artworkPath = !prisonIcon && !point.iconPath?.includes("maps/rob-run-icons/") ? point.iconPath : undefined;
    return {
      icon: prisonIcon ?? (point.category === "dungeon-door"
        ? point.subtype === "exit" ? LogOut : point.subtype === "passage" ? ArrowUpDown : DoorOpen
        : building?.icon ?? category.icon),
      nativeIconPath: artworkPath ? contentUrl(artworkPath) : undefined,
      markerClass: category.markerClass + (point.category === "robbery" ? " rob-run-marker-heist" : ""),
      itemArt: Boolean(artworkPath),
    };
  }
  const personalIcon = USER_MARKER_ICONS.find((item) => item.id === resolveUserMarkerIcon(point.icon));
  return {
    icon: personalIcon?.icon ?? MapPin,
    nativeIconPath: personalIcon?.nativeIconPath,
    markerClass: category.markerClass,
    itemArt: false,
  };
};
export const getSourceCategory = (referenceId: string | undefined, sourceCategoryId?: string): MapCategoryConfig | undefined => {
  void referenceId;
  void sourceCategoryId;
  return undefined;
};
export const migrateCategorySelection = (ids: string[]) =>
  [...new Set(ids.flatMap((id) => id === "robbery" ? buildingFilters.map((filter) => filter.id)
    : MAP_CATEGORY_BY_ID.has(id) ? [id] : []))];

// Higher tiers win when pins overlap. Filter order is independent of stacking.
const MAP_MARKER_PRIORITY_ORDER = [
  ["custom"],
  ["robbery", ...buildingFilters.map(({ id }) => id)],
  ["travel"],
  ["event-cargo", "conquest"],
  ["vault-loot"],
  ["key-safe", "drill-safe", "safe", "deposit-box"],
  ["district", "settlement"],
  ["buyer", "cargo-exchange", "vendor", "storage", "service"],
  ["weapons-loot", "gear-loot"],
  ["door", "alarm-panel", "metal-detector"],
  ["parking", "atm"],
  ["jewelry", "art", "drugs"],
  ["electronics", "car-parts", "medicine"],
  ["cash-register", "cash"],
  ["activity", "plot", "landmark"],
  ["camera"],
  ["alcohol", "container", "loose-loot"],
  ["trash"],
] as const;
const MAP_MARKER_PRIORITY = new Map<string, number>(MAP_MARKER_PRIORITY_ORDER.flatMap((categories, index) =>
  categories.map((category) => [category, MAP_MARKER_PRIORITY_ORDER.length - index] as const)));

export const getMapMarkerPriority = (category: string) => MAP_MARKER_PRIORITY.get(category) ?? 0;
