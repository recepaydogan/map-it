import { acquisitionPayload } from "./native-wiki-acquisition-model";
import { buildCreatureLoot, type CreatureLootItem } from "./native-wiki-creature-loot-model";
import type { NativeAcquisition, NativeWikiTarget } from "./use-native-wiki";

export type SimpleSourceKind = "foundIn" | "droppedBy" | "encounters" | "shops" | "other";
export interface SimpleAcquisitionSource {
  id: string; kind: SimpleSourceKind; actors: NativeWikiTarget[]; rows: NativeAcquisition[];
  dust?: number; materials?: unknown; quantity?: { min: number; max: number };
}
const kindFor = (row: NativeAcquisition): SimpleSourceKind => row.kind === "native-container-loot" ? "foundIn"
  : row.kind === "native-shop-entry" ? "shops" : row.kind === "native-combat-group-reward" ? "encounters"
    : row.kind === "native-loot-entry" && (row.actor || row.actors?.length) ? "droppedBy" : "other";
const amountFor = (row: NativeAcquisition) => {
  const payload = acquisitionPayload(row);
  const min = payload.MinAmount ?? payload.MaxAmount, max = payload.MaxAmount ?? min;
  return typeof min === "number" && Number.isFinite(min) && typeof max === "number" && Number.isFinite(max) ? { min, max } : undefined;
};

/** Group equivalent player-facing sources, preserving every native record in the result. */
export const simpleAcquisitionSources = (rows: NativeAcquisition[]): SimpleAcquisitionSource[] => {
  const groups = new Map<string, SimpleAcquisitionSource>();
  const definitionKey = (row: NativeAcquisition) => JSON.stringify([row.record, row.native_item_id,
    Object.entries(acquisitionPayload(row)).sort(([a], [b]) => a.localeCompare(b))]);
  const linkedContainers = new Map(rows.filter(row => row.kind === "native-container-loot")
    .map(row => [definitionKey(row), row]));
  for (const row of rows) {
    // A matched loot definition and its placed container describe one acquisition source.
    const placed = row.kind === "native-loot-entry" && !row.actor && !row.actors?.length ? linkedContainers.get(definitionKey(row)) : undefined;
    const identity = placed ?? row;
    const kind = kindFor(identity), payload = acquisitionPayload(row);
    const actors = [...new Map([...(identity.actor ? [identity.actor] : []), ...(identity.actors ?? [])].map(actor => [actor.id, actor])).values()];
    const dust = typeof payload.ConsumeDust === "number" ? payload.ConsumeDust : undefined;
    const materials = Array.isArray(payload.ConsumeMaterials) && payload.ConsumeMaterials.length ? payload.ConsumeMaterials : undefined;
    const key = JSON.stringify([kind, actors.map(actor => actor.id).sort(), identity.containerId, dust, materials]);
    const existing = groups.get(key), quantity = amountFor(row);
    if (existing) {
      existing.rows.push(row);
      existing.quantity = existing.quantity && quantity
        ? { min: Math.min(existing.quantity.min, quantity.min), max: Math.max(existing.quantity.max, quantity.max) } : undefined;
    } else groups.set(key, { id: row.id, kind, actors, rows: [row], dust, materials, quantity });
  }
  return [...groups.values()];
};

export const simpleAcquisitionRewards = (rows: NativeAcquisition[], lookup: Record<string, NativeWikiTarget[]>): CreatureLootItem[] => {
  const items = new Map<string, CreatureLootItem>();
  for (const group of buildCreatureLoot(rows, lookup)) for (const item of group.items) {
    const existing = items.get(item.id);
    if (!existing) items.set(item.id, { ...item, records: [...item.records] });
    else {
      existing.records.push(...item.records);
      existing.quantity = existing.quantity && item.quantity
        ? { min: Math.min(existing.quantity.min, item.quantity.min), max: Math.max(existing.quantity.max, item.quantity.max) } : undefined;
    }
  }
  return [...items.values()];
};
