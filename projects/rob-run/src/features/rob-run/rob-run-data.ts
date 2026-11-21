
import { contentUrl } from "../../lib/content-url";
import { loadCodexItems, type CodexItemFacts } from "./rob-run-codex-data";

export const itemCategories = [
  "keys", "tools", "weapons", "equipment", "supplies", "valuables", "materials",
  "vehicles", "cargo", "drugs", "building",
] as const;

export type ItemCategory = typeof itemCategories[number];

export interface CatalogItem {
  id: string;
  gameId?: string;
  aliasOf?: string;
  name: string;
  category: ItemCategory;
  description: string;
  icon?: string;
  basePrice?: number;
  sellPrice?: number | null;
  inventoryType?: number;
  rarity?: number;
  width?: number;
  height?: number;
  stackSize?: number;
  durability?: number;
  armor?: { segments: number; blockingRate: number };
  weapon?: GameWeapon;
  reference?: CodexItemFacts;
  markers: { id: string; name: string }[];
}

export interface GameWeapon {
  damage: number;
  headshotMultiplier: number;
  cooldownMs: number;
  magazine: number;
  fullDamageRange: number;
  damageBands: { length: number; damage: number }[];
  reloadMs: number;
  fastReloadMs: number;
  reloadPrecastMs: number;
  aimMs: number;
  aimOutMs: number;
  drawMs: number;
  automatic: boolean;
  ammoItemId?: string;
}

export const getItemTypeKey = (type: number | undefined) => {
  const labels: Record<number, string> = {
    0: "ammo", 1: "armor", 2: "armorPlate", 3: "assaultRifle", 4: "backpack", 5: "belt",
    6: "handgun", 11: "medicine", 13: "shotgun", 14: "smg",
  };
  return type === undefined ? undefined : labels[type];
};

const rarityKeys = ["", "common", "uncommon", "rare", "epic", "legendary", "exotic"];

export const getRarityKey = (rarity?: number, reference?: string) =>
  rarityKeys[rarity ?? 0] || rarityKeys.find((key) => key === reference?.toLowerCase()) || undefined;

export const getItemVariantKey = (item: CatalogItem) => {
  const id = item.gameId ?? item.id.replaceAll("-", "_");
  return id.endsWith("_full") ? "fullyFilled" : id.endsWith("_cumulative") ? "filling" : undefined;
};

export const getFillingItemId = (id: string) => id.replace(/-full$/, "-cumulative");

export interface ItemAmount { item: string; amount: number; fullyFilled?: boolean; }
export interface BarterRecipe { id: string; resultItem: string; requires: ItemAmount[]; amount?: number; supplemental?: boolean; }
export interface BarterTrader { id: string; name: string; recipes: string[]; }

export interface ShipmentNode {
  id: string;
  item: string;
  enabled: boolean;
  coins: number;
  imprisonmentYears: number;
  tierIndex: number | null;
  settlementLevel?: number | null;
  category?: string;
  requires: ItemAmount[];
  prerequisites: string[];
}

export const getShipmentCashCost = (node: ShipmentNode) =>
  node.coins + node.requires.reduce((amount, row) => amount + (row.item === "cash_1" ? row.amount : 0), 0);

export function getShipmentPath(node: ShipmentNode | undefined, nodes: readonly ShipmentNode[]) {
  const visited = new Set<string>();
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  const path: ShipmentNode[] = [];
  function visit(entry: ShipmentNode) {
    if (visited.has(entry.id)) return;
    visited.add(entry.id);
    for (const id of entry.prerequisites) {
      const previous = byId.get(id);
      if (previous) visit(previous);
    }
    path.push(entry);
  }
  if (node) visit(node);
  return path;
}

interface ShipmentVariants {
  baseSha256: string;
  baseVersion: number;
  version: number;
  nodes: ShipmentNode[];
  additionalStock: Record<string, string[]>;
}

export function getAlternateShipment(economy: Economy | undefined, itemId: string) {
  const variant = economy?.shipmentVariants;
  const changes = variant?.nodes.find((node) => node.item === itemId);
  if (!variant || !changes || !economy) return undefined;
  const nodes = (economy.shipments.at(-1)?.nodes ?? []).map((node) => {
    const alternate = variant.nodes.find((entry) => entry.id === node.id);
    return alternate ? { ...node, ...alternate } : node;
  });
  const path = getShipmentPath(changes, nodes);
  return { ...variant, path, cost: path.reduce((sum, node) => sum + getShipmentCashCost(node), 0) };
}

export interface LootYield {
  id: string;
  item: string;
  steps: [number, number];
  quantityPerStep: [number, number];
}

export interface Cargo {
  id: string;
  name: string;
  description?: string;
  rarity?: number;
  icon?: string;
  exchangeCoins: number;
  seizureCoins: number;
  openWorkbench: string | null;
  openTimeMs: number;
  takeTimeMs: number;
  exchangeTimeMs: number;
  exchangePoints: number;
  exchangeCargo: string | null;
  improvedExchangeCargo: string | null;
  reference?: { sellPrice: number | null; rarity?: string };
}

export const getCargoSellPrice = (cargo: Cargo) => cargo.reference?.sellPrice
  ?? (cargo.exchangeCoins > 0 ? cargo.exchangeCoins : undefined);

export interface NotorietyLevel {
  id: string;
  index: number;
  lootBonus: number;
  cargoBonus: number;
}

export interface VendorInventory {
  id: string;
  buyMultiplier: number;
  shipmentLocked: boolean;
  items: string[];
  tiers: { tierIndex: number; items: string[] }[];
}

export interface Economy {
  source?: { sha256?: string };
  shipmentVariants?: ShipmentVariants;
  barters: BarterRecipe[];
  traders: BarterTrader[];
  shipments: { realmVersion: number; nodes: ShipmentNode[] }[];
  loot: LootYield[];
  cargo: Cargo[];
  notoriety: NotorietyLevel[];
  collections: { id: string; index: number; reward: string; requires: (ItemAmount & { slot: number })[] }[];
  vendors: VendorInventory[];
}

async function load<T>(file: string): Promise<T> {
  const response = await fetch(contentUrl("data/rob-run/" + file));
  if (!response.ok) throw new Error("Failed to load ROB RUN data.");
  return response.json() as Promise<T>;
}

let catalogRequest: Promise<CatalogItem[]> | undefined;

export function loadRobRunItems() {
  catalogRequest ??= Promise.all([
    load<{ items: CatalogItem[] }>("items.json"),
    loadCodexItems().catch(() => undefined),
  ]).then(([{ items }, references]) => {
    if (!Array.isArray(items)) throw new Error("Invalid ROB RUN item catalog.");
    const nativeByReference = new Map(items.flatMap((item) => {
      const reference = references?.items[item.id];
      return item.gameId && reference ? [[reference.sourceId, item] as const] : [];
    }));
    return items.map((item) => {
      const type = item.inventoryType;
      const reference = references?.items[item.id];
      const referenceType = reference?.type ?? "";
      const category = item.weapon || type === 0 || ["Ammo", "Grenade"].includes(referenceType) ? "weapons"
        : (type !== undefined && [1, 2, 4, 5].includes(type)) || ["Armor", "Bag"].includes(referenceType) ? "equipment"
        : type === 11 || referenceType === "Medicine" ? "supplies"
        : ["Car", "Helicopter", "Car Upgrade"].includes(referenceType) ? "vehicles"
        : referenceType === "Drugs" ? "drugs" : item.category;
      const canonical = !item.gameId && reference && nativeByReference.get(reference.sourceId);
      const aliasOf = canonical && canonical.name === item.name && !item.markers.length ? canonical.id : undefined;
      return { ...item, category, reference, aliasOf, sellPrice: item.sellPrice === undefined ? reference?.sellPrice : item.sellPrice };
    });
  }).catch((error: unknown) => {
    catalogRequest = undefined;
    throw error;
  });
  return catalogRequest;
}

let economyRequest: Promise<Economy> | undefined;
export function loadRobRunEconomy() {
  economyRequest ??= Promise.all([
    load<Economy>("economy.json"),
    load<{
      barters: BarterRecipe[];
      fullyFilled: Record<string, string[]>;
      shipments: Record<string, Pick<ShipmentNode, "settlementLevel" | "category">>;
    }>("codex-economy.json").catch(() => undefined),
    loadCodexItems().catch(() => undefined),
    load<ShipmentVariants>("shipment-variants.json").catch(() => undefined),
  ]).then(([economy, reference, catalog, variants]) => {
    const cargo = economy.cargo.map((row) => ({ ...row, reference: catalog?.cargo?.[row.id] }));
    const shipmentVariants = variants?.baseSha256 === economy.source?.sha256 ? variants : undefined;
    if (!reference) return { ...economy, cargo, shipmentVariants };
    return {
      ...economy,
      cargo,
      shipmentVariants,
      barters: [...economy.barters.map((recipe) => ({
        ...recipe,
        requires: recipe.requires.map((row) =>
          reference.fullyFilled[recipe.id]?.includes(row.item) ? { ...row, fullyFilled: true } : row),
      })), ...reference.barters],
      shipments: economy.shipments.map((shipment) => ({
        ...shipment,
        nodes: shipment.nodes.map((node) => ({
          ...node,
          ...reference.shipments[node.item],
        })),
      })),
    };
  }).catch((error: unknown) => {
    economyRequest = undefined;
    throw error;
  });
  return economyRequest;
}

