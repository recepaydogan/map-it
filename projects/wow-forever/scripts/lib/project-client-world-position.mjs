/** Project a client world position onto the atlas using its UiMapAssignment. */
export const createClientWorldProjector = (atlas) => {
  const layers = new Map(atlas.terrainLayers
    .filter((layer) => Number.isInteger(layer.source?.mapId))
    .map((layer) => [layer.source.mapId, layer]));
  return (mapId, position) => {
    const layer = layers.get(mapId);
    if (!layer) return null;
    if (layer.source.placement === "overview-inset") {
      const { grid, adtWorldSize } = layer.source;
      if (!Array.isArray(position) || position.length < 2
        || !position.slice(0, 2).every(Number.isFinite)
        || !Number.isInteger(grid?.minX) || !Number.isInteger(grid?.minY)
        || !Number.isFinite(adtWorldSize) || adtWorldSize <= 0) {
        throw new Error(`Invalid world position or inset grid for map ${mapId}.`);
      }
      // Native ADT tiles use a 64x64 grid centered at world coordinate zero.
      return {
        x: layer.originX + (32 - position[1] / adtWorldSize - grid.minX)
          * layer.tileSize * layer.scaleX,
        y: layer.originY + (32 - position[0] / adtWorldSize - grid.minY)
          * layer.tileSize * layer.scaleY,
      };
    }
    const { uiMin, uiMax, worldRegion } = layer.source;
    if (!Array.isArray(position) || position.length < 2
      || !position.slice(0, 2).every(Number.isFinite)
      || uiMin.length !== 2 || uiMax.length !== 2 || worldRegion.length !== 6
      || worldRegion[3] <= worldRegion[0] || worldRegion[4] <= worldRegion[1]) {
      throw new Error(`Invalid world position or UiMapAssignment for map ${mapId}.`);
    }
    const [worldX, worldY] = position;
    return {
      x: (uiMin[0] + (worldRegion[4] - worldY)
        / (worldRegion[4] - worldRegion[1]) * (uiMax[0] - uiMin[0]))
        * (atlas.bounds.maxX - atlas.bounds.minX) + atlas.bounds.minX,
      y: (uiMin[1] + (worldRegion[3] - worldX)
        / (worldRegion[3] - worldRegion[0]) * (uiMax[1] - uiMin[1]))
        * (atlas.bounds.maxY - atlas.bounds.minY) + atlas.bounds.minY,
    };
  };
};
