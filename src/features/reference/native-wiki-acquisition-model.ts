import type { NativeAcquisition } from "./use-native-wiki";

export type AcquisitionVariant = { row: NativeAcquisition; records: NativeAcquisition[] };

export const acquisitionPayload = (row: NativeAcquisition): Record<string, unknown> => {
  const reward = row.native.RewardEntry;
  const native = reward && typeof reward === "object" && !Array.isArray(reward)
    ? { ...row.native, ...reward } : { ...row.native };
  delete native.RewardEntry;
  // These identify definitions, not different prices or reward conditions.
  delete native.ShopItemID;
  delete native.LootItemID;
  const counts = Array.isArray(native.ItemIDAndCount) ? native.ItemIDAndCount : [];
  const matchingCounts = counts.filter((entry: unknown): entry is { Key: string; Value: number } =>
    Boolean(entry && typeof entry === "object" && "Key" in entry && "Value" in entry
      && typeof entry.Key === "string" && typeof entry.Value === "number"
      && entry.Key.toLowerCase() === row.native_item_id?.toLowerCase()));
  const actorAmount = row.kind === "native-actor-pickup" && typeof native.Key === "string"
    && native.Key.toLowerCase() === row.native_item_id?.toLowerCase() && typeof native.Value === "number" ? native.Value : undefined;
  const amount = typeof native.Amount === "number" ? native.Amount : matchingCounts.length === 1 ? matchingCounts[0].Value : actorAmount;
  if (amount !== undefined && native.MinAmount === undefined && native.MaxAmount === undefined) {
    native.MinAmount = amount;
    native.MaxAmount = amount;
  }
  return { ...native, ...(row.enemy_level !== undefined ? { EnemyLevel: row.enemy_level } : {}),
    ...(row.item_level ? { ItemLevel: row.item_level } : {}) };
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};

/** Merge equivalent presentations while keeping every original definition accessible. */
export const acquisitionVariants = (rows: NativeAcquisition[]): AcquisitionVariant[] => {
  const variants = new Map<string, AcquisitionVariant>();
  for (const row of rows) {
    const key = canonical({ kind: row.kind, item: row.native_item_id, payload: acquisitionPayload(row),
      actors: [row.actor?.id, ...(row.actors?.map(actor => actor.id) ?? [])].filter(Boolean).sort(),
      items: row.items?.map(item => item.id).sort() });
    const variant = variants.get(key);
    if (variant) variant.records.push(row);
    else variants.set(key, { row, records: [row] });
  }
  return [...variants.values()];
};
