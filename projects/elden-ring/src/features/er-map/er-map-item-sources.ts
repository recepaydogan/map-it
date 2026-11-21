import { useEffect, useState } from "react";
import { erItemKey, type ErItem } from "../../data/er-items-data";
import { localizeErMapText } from "../../data/er-map-text";
import { loadErMapItemIndex } from "./er-map-spatial-data";
import type { ErAcquisitionKind, ErMapItemIndex, ErMapItemIndexRow } from "./types";

export type { ErAcquisitionKind };

export interface ErItemSource {
  /** Raw marker id to select; pair with `layer` to navigate across views. */
  markerId: string;
  layer: string;
  name: string;
  region: string;
  /** Source marker's map category — drives its icon/colour in the result row. */
  category: string;
  kind: ErAcquisitionKind;
  /** Chance on a drop ("Guaranteed" / "25% drop"), rune price on a shop row. */
  note?: string;
  /** How many identical placements collapsed into this row (an enemy stamped
   *  across a field is one answer to "where do I get it", not forty). */
  count: number;
}

/** "Guaranteed" → 100, "25% drop" → 25. Orders drop rows; never displayed raw. */
const dropChance = (note?: string): number => {
  if (!note) return 0;
  if (note === "Guaranteed") return 100;
  const match = /^(\d+)\s*%/.exec(note);
  return match ? Number(match[1]) : 0;
};

/** Certain sources before chancy ones, and a named lead before a whole region. */
const KIND_ORDER: Record<ErAcquisitionKind, number> = {
  treasure: 0,
  shop: 1,
  "npc-drop": 2,
  drop: 3,
  area: 4,
};

/**
 * Every marker the item can be obtained from, best lead first.
 *
 * The index lists raw placements, so the same enemy or the same ruin shows up
 * dozens of times over. Rows collapse on (kind, name, category, note, region) —
 * the tuple that makes two rows the same ANSWER — keeping the first id as the
 * one to fly to and counting the rest. Mirrors the detail panel's drop grouping.
 */
export const erItemSources = (
  item: ErItem,
  index: ErMapItemIndex | null,
): ErItemSource[] => {
  const entry = index?.[erItemKey(item)];
  if (!entry) return [];

  const grouped = new Map<string, ErItemSource>();
  const add = (row: ErMapItemIndexRow, kind: ErAcquisitionKind) => {
    const key = `${kind}|${row.name}|${row.category}|${row.note ?? ""}|${row.region ?? ""}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    grouped.set(key, {
      markerId: row.id,
      layer: row.layer,
      name: localizeErMapText(row.name),
      region: row.region ? localizeErMapText(row.region) : "",
      category: row.category,
      kind,
      note: row.note,
      count: 1,
    });
  };

  // `kind` is written by the builder; the ?? guards an index built before it was.
  for (const row of entry.locations ?? []) add(row, row.kind ?? "treasure");
  for (const row of entry.dropSources ?? []) add(row, "drop");

  return [...grouped.values()].sort((a, b) =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || dropChance(b.note) - dropChance(a.note)
    || b.count - a.count
    || a.name.localeCompare(b.name),
  );
};

/**
 * The item index, fetched once and shared. `enabled` keeps the ~2MB payload off
 * the wire until something actually needs it — the search only asks after the
 * first query is typed.
 */
export const useErMapItemIndex = (enabled: boolean): ErMapItemIndex | null => {
  const [index, setIndex] = useState<ErMapItemIndex | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadErMapItemIndex()
      .then((value) => {
        if (active) setIndex(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled]);

  return index;
};
