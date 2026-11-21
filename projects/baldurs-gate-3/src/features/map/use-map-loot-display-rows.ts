import { useMemo } from "react";
import { useItemDatabase } from "../items/use-item-database";
import { getMapLootDisplayRows } from "./map-loot-display-rows";
import { getMapLootRows } from "./map-loot-utils";
import type { MapContainerLootProfile, MapDeathLootProfile } from "./types";

/** Resolves raw loot tables to catalog-backed, openable item rows. */
export const useMapLootDisplayRows = (
  deathLoot?: MapDeathLootProfile,
  containerLoot?: MapContainerLootProfile,
) => {
  const { data, loading } = useItemDatabase();
  const rawRows = useMemo(
    () => getMapLootRows(deathLoot, containerLoot),
    [deathLoot, containerLoot],
  );
  const rows = useMemo(
    () => getMapLootDisplayRows(rawRows, data?.items ?? []),
    [data, rawRows],
  );

  return { loading, rawRows, rows };
};
