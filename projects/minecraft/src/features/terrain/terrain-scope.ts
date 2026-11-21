export interface TerrainScope { worldId: string; dimension: string; sourceId: string; revision: number }

export const assertTerrainScope = (scope: TerrainScope): void => {
  if (!scope || ![scope.worldId, scope.dimension, scope.sourceId].every(value => typeof value === "string" && value.length > 0 && value.length <= 512) ||
    !Number.isSafeInteger(scope.revision) || scope.revision < 0) throw new Error("Invalid terrain source identity");
};

export const sameTerrainScope = (left: TerrainScope, right: TerrainScope): boolean =>
  left.worldId === right.worldId && left.dimension === right.dimension && left.sourceId === right.sourceId && left.revision === right.revision;
