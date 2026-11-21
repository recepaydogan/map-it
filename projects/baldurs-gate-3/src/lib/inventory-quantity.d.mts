export interface InventoryCondition {
  flagId: string;
  present: boolean;
}

export interface InventoryQuantityEntry {
  amount?: number;
  inventoryCondition?: InventoryCondition;
}

export function getInventoryQuantity(entries: readonly InventoryQuantityEntry[]): {
  minimum: number;
  maximum: number;
  conditional: boolean;
};
