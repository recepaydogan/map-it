export const TIER_LIST_MODES = ["pve", "pvp", "solo"] as const;
export type TierListMode = typeof TIER_LIST_MODES[number];

export interface TierListEntry {
  mode: TierListMode;
  updatedAt: string;
  tiers: { rank: string; classes: { name: string; description: string }[] }[];
}

export interface TierListCatalog {
  version: 1;
  modes: TierListEntry[];
}

export function isTierListCatalog(value: unknown): value is TierListCatalog {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<TierListCatalog>;
  if (catalog.version !== 1 || !Array.isArray(catalog.modes) || catalog.modes.length !== TIER_LIST_MODES.length) return false;
  const seen = new Set<string>();
  for (const entry of catalog.modes) {
    if (!entry || !TIER_LIST_MODES.includes(entry.mode) || seen.has(entry.mode)
      || !/^\d{4}-\d{2}-\d{2}$/.test(entry.updatedAt) || !Array.isArray(entry.tiers) || !entry.tiers.length
      || entry.tiers.some((tier) => !tier || !/^[SABCDEF]$/.test(tier.rank)
        || !Array.isArray(tier.classes) || !tier.classes.length
        || tier.classes.some((classEntry) => !classEntry || typeof classEntry.name !== "string" || !classEntry.name.trim()
          || typeof classEntry.description !== "string" || !classEntry.description.trim()))) return false;
    seen.add(entry.mode);
  }
  return true;
}
