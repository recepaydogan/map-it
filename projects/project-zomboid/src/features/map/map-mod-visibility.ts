import type { PreparedMapMod } from "./prepared-map-mod-types";

export interface MapModVisibilityIssue {
  kind: "hidden" | "partial";
  blockingMods: PreparedMapMod[];
}

export const getMapModVisibilityIssues = (
  orderedMods: PreparedMapMod[],
  mapOrder = orderedMods.flatMap((mod) => mod.overlays.map((overlay) => ({
    modKey: mod.key,
    cells: overlay.cells,
  }))),
) => {
  const modsByKey = new Map(orderedMods.map((mod) => [mod.key, mod]));
  const visibleOwnerByCell = new Map<string, string>();
  const issues = new Map<string, MapModVisibilityIssue>();

  for (const { modKey, cells } of mapOrder) {
    for (const cell of cells) {
      if (!visibleOwnerByCell.has(cell)) visibleOwnerByCell.set(cell, modKey);
    }
  }

  for (const mod of orderedMods) {
    const cells = new Set(mod.overlays.flatMap((overlay) => overlay.cells));
    const blockers = new Map<string, PreparedMapMod>();
    let coveredCellCount = 0;

    for (const cell of cells) {
      const ownerKey = visibleOwnerByCell.get(cell);
      if (!ownerKey || ownerKey === mod.key) continue;
      const blocker = modsByKey.get(ownerKey);
      if (!blocker) continue;
      coveredCellCount += 1;
      blockers.set(blocker.key, blocker);
    }

    if (coveredCellCount > 0) {
      issues.set(mod.key, {
        kind: coveredCellCount === cells.size ? "hidden" : "partial",
        blockingMods: [...blockers.values()],
      });
    }
  }

  return issues;
};
