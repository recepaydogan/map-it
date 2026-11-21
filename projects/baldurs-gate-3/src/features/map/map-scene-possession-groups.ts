import type { ItemDatabaseEntry } from "../items/types";
import type { MapSceneContext, MapSceneEquipmentChange } from "./types";

type SceneItem = MapSceneEquipmentChange["items"][number];

export interface MapScenePossessionRow {
  source: SceneItem;
  item?: ItemDatabaseEntry;
}

export interface MapScenePossessionGroup {
  id: string;
  localizedConditions: Record<string, string>;
  branches: Array<{
    id: string;
    localizedConditions?: Record<string, string>;
    rows: MapScenePossessionRow[];
  }>;
  unresolvedEntries: NonNullable<MapSceneEquipmentChange["unresolvedEntries"]>;
}

/** Keep alternatives separate; possession evidence never becomes a loot chance. */
export const getMapScenePossessionGroups = (
  scene: MapSceneContext,
  items: readonly ItemDatabaseEntry[] = [],
): MapScenePossessionGroup[] => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const resolveRows = (sources: SceneItem[]): MapScenePossessionRow[] => sources.map((source) => {
    const candidate = byId.get(source.itemId);
    const item = candidate?.statsId === source.statsId && candidate.templateIds.includes(source.templateId)
      ? candidate : undefined;
    // Retain the source name/count when the catalog is loading or incompatible.
    return { source, item };
  });
  const groups: MapScenePossessionGroup[] = [];
  if (scene.equipmentChange) {
    const equipment = scene.equipmentChange;
    groups.push({
      id: `${scene.id}:equipment`,
      localizedConditions: equipment.localizedConditions,
      branches: [{ id: "equipment", rows: resolveRows(equipment.items) }],
      unresolvedEntries: equipment.unresolvedEntries ?? [],
    });
  }
  if (scene.inventoryChange) {
    const inventory = scene.inventoryChange;
    groups.push({
      id: `${scene.id}:inventory`,
      localizedConditions: inventory.localizedConditions,
      branches: inventory.branches.filter((branch) => !branch.reviewOnly).map((branch) => ({
        id: branch.id,
        localizedConditions: branch.localizedConditions,
        rows: resolveRows(branch.items),
      })),
      unresolvedEntries: [],
    });
  }
  for (const transfer of scene.itemTransfers ?? []) {
    groups.push({
      id: `${scene.id}:transfer:${transfer.id}`,
      localizedConditions: transfer.localizedConditions,
      branches: [{ id: transfer.id, rows: resolveRows([transfer.item]) }],
      unresolvedEntries: [],
    });
  }
  return groups;
};
