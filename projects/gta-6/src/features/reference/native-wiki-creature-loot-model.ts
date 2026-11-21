import { acquisitionPayload } from "./native-wiki-acquisition-model";
import type { NativeAcquisition, NativeWikiTarget } from "./use-native-wiki";

export type CreatureLootKind = "drops" | "encounter" | "scripted" | "related";
export interface CreatureLootItem {
  id: string;
  target?: NativeWikiTarget;
  currency: boolean;
  quantity?: { min: number; max: number };
  records: NativeAcquisition[];
}
export interface CreatureLootGroup { kind: CreatureLootKind; items: CreatureLootItem[] }

const groupKind = (row: NativeAcquisition): CreatureLootKind => row.kind === "native-combat-group-reward" ? "encounter"
  : row.kind === "native-flow-reward" ? "scripted" : row.kind === "native-loot-entry" ? "drops" : "related";

const quantity = (min: unknown, max: unknown): CreatureLootItem["quantity"] => {
  const lower = min ?? max, upper = max ?? min;
  return typeof lower === "number" && Number.isFinite(lower) && typeof upper === "number" && Number.isFinite(upper)
    ? { min: lower, max: upper } : undefined;
};

/** Present reward items, retaining exact definitions separately without inventing rates. */
export const buildCreatureLoot = (rows: NativeAcquisition[], lookup: Record<string, NativeWikiTarget[]>): CreatureLootGroup[] => {
  const groups = new Map<CreatureLootKind, Map<string, CreatureLootItem>>();
  const add = (kind: CreatureLootKind, id: string, target: NativeWikiTarget | undefined, currency: boolean,
    amount: CreatureLootItem["quantity"], row: NativeAcquisition) => {
    let group = groups.get(kind);
    if (!group) { group = new Map(); groups.set(kind, group); }
    const current = group.get(id);
    if (current) {
      if (current.records.some(record => record.id === row.id)) return;
      current.records.push(row);
      current.quantity = current.quantity && amount
        ? { min: Math.min(current.quantity.min, amount.min), max: Math.max(current.quantity.max, amount.max) } : undefined;
    } else group.set(id, { id, target, currency, quantity: amount, records: [row] });
  };
  for (const row of rows) {
    const kind = groupKind(row);
    const payload = acquisitionPayload(row);
    const targets = row.items?.filter(item => item.category === "items") ?? [];
    const linked = targets.length ? targets : row.native_item_id
      ? lookup[row.native_item_id] ?? lookup[row.native_item_id.toLowerCase()] ?? [] : [];
    const amount = quantity(payload.MinAmount, payload.MaxAmount);
    if (linked.length) {
      for (const target of linked) add(kind, target.id, target, false, amount, row);
    } else if (row.native_item_id) {
      add(kind, `unresolved:${row.native_item_id.toLowerCase()}`, undefined, false, amount, row);
    } else {
      // A currency-only reward is not an unresolved item. Mixed item/Dust records
      // can be conditional replacements; do not claim both are awarded together.
      const dust = quantity(payload.MinDust, payload.MaxDust);
      if (dust && dust.max > 0) add(kind, "currency:dust", undefined, true, dust, row);
    }
  }
  return (["drops", "encounter", "scripted", "related"] as const).flatMap(kind => {
    const group = groups.get(kind);
    return group?.size ? [{ kind, items: [...group.values()] }] : [];
  });
};
