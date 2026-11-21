import type { TFunction } from "i18next";
import { aggregatePoolSlots, type NrLootPool } from "../../data/nr-loot-data";
import type { Page } from "./nr-archive-pages";

/**
 * The Loot category of the Nightreign Archive. Loot lives as an adapter, not a separate overlay:
 * `lootPage` turns a weighted ItemTableParam pool into the same `Page` shape every other archive
 * category renders through, so nr-archive.tsx gains an 8th rail entry ("Loot") without a second
 * browser. See data/src/build-nr-loot.mjs for how the pools are resolved — and what is honestly
 * left unresolved (POI/enemy attribution needs the MSB map files, absent from the param dump).
 */

/** Loot-pool kind accent colours (weapon / relic / talisman / consumable / mixed). */
export const KIND_COLOR: Record<string, string> = {
  weapon: "#fb923c",
  relic: "#fbbf24",
  talisman: "#c084fc",
  consumable: "#34d399",
  mixed: "#a1a1aa",
};

/**
 * Adapt one loot pool into the shared archive `Page`. A pool has no name/rarity of its own — it's
 * a weighted table — so we show its kind, and its drops as a name→% list with identical items
 * aggregated to their combined odds (`aggregatePoolSlots`). A per-Nightfarer gate or a real
 * "drop nothing" chance is surfaced verbatim where the data carries one, never invented.
 */
export const lootPage = (pool: NrLootPool, t: TFunction): Page => {
  const drops = aggregatePoolSlots(pool);
  const items = drops.filter((d) => !d.empty);
  const kindKey = `lootKind${pool.kind.charAt(0).toUpperCase()}${pool.kind.slice(1)}`;
  const kindLabel = t(`nightreign.${kindKey}`, { defaultValue: pool.kind });
  return {
    key: `l${pool.id}`,
    name: items.length === 1 ? items[0].name : t("nightreign.lootPoolName", { count: items.length }),
    sub: kindLabel,
    iconId: items[0]?.iconId ?? null,
    hay: items.map((d) => d.name).join(" "),
    chips: [
      { label: kindLabel, color: KIND_COLOR[pool.kind] },
      ...(pool.onlyForClass
        ? [{ label: t("nightreign.lootClassOnly", { hero: pool.onlyForClass }) }]
        : []),
    ],
    blocks: [
      {
        title: t("nightreign.lootDrops"),
        rows: drops.map((d) => ({
          label: d.empty
            ? t("nightreign.lootNothing")
            : d.onlyForClass
              ? `${d.name} · ${t("nightreign.lootClassOnly", { hero: d.onlyForClass })}`
              : d.name,
          value: t("nightreign.lootChance", { pct: d.weightPct }),
          color: d.empty ? "#71717a" : undefined,
        })),
      },
    ],
  };
};
