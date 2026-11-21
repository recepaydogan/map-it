export interface CraftingStockSnapshot {
  schemaVersion: 1;
  worldId: string;
  updatedAt: number;
  player: Record<string, number>;
  enderChest: Record<string, number>;
  containers: Record<string, number>;
  scannedRegionFiles: number;
  availableRegionFiles: number;
  scannedContainers: number;
}

export interface CraftingPlanState {
  schemaVersion: 2;
  targetId: string | null;
  targets: CraftingPlanTarget[];
  stock: CraftingStockSnapshot | null;
}

export interface CraftingPlanTarget {
  id: string;
  quantity: number;
}

export interface CraftingMaterialLine {
  id: string;
  required: number;
  owned: number;
  missing: number;
  alternatives: string[];
}
